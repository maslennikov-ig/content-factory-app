import { EditorialSourceAuthorityV1, type RegistrySourcePermissionV1 } from './editorial/source-authority.v1';
import { LeadTopicGateway } from '../leads/lead-topic.gateway';
import { TopicDiscoveryReader } from './discovery/discovery.adapters';
import { RedisDiscoveryCache } from './discovery/redis-discovery-cache';
import { PersistentSourceRecommendation } from './discovery/source-recommendation';
import { ioRedis } from '../../redis/redis.service';
import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ChannelProfileServiceV1 } from './profiles/channel-profile.v1';
import { SocialDiscoveryService } from './discovery/social-discovery.service';
import { SocialFactorySourcePermissionService } from './source-permission.service';
import { SocialFactoryLearningService } from './learning/learning.service';
import { SocialFactoryOptionalAnalyticsService } from './measurement/optional-analytics/optional-analytics.service';
import { SocialFactoryRepository, SocialFactoryError, resourceRef, sourceRef } from './social-factory.repository';
import { getActiveAiConfig, loadAiConfig, withActiveAiConfig, type AiConfig } from '../../openai/ai.provider.config';
import { providerForSearchTask, SEARCH_PROVIDERS, searchKeyFor, searchProviderNeedsKey } from '../../openai/ai.search-tasks';
import type { DiscoveryDocument, DiscoveryResult, DiscoveryCache } from './discovery/discovery.types';
import type { SourceAdmissionV1, LearningFindingV1 } from './contracts/social-factory.v1';

/** Shared context for chat, campaign planning and production; all authorities are resolved on the server. */
@Injectable()
export class SocialFactoryPlanningService {
 constructor(private readonly profiles: ChannelProfileServiceV1, private readonly discovery: SocialDiscoveryService,
  private readonly permissions: SocialFactorySourcePermissionService, private readonly learning: SocialFactoryLearningService,
  private readonly store: SocialFactoryRepository, private readonly authority: EditorialSourceAuthorityV1, private readonly web: LeadTopicGateway,
  @Optional() private readonly optionalAnalytics?: SocialFactoryOptionalAnalyticsService) {}

 /** Read-only route inspection before a campaign takes its discovery lease. No credentials leave this service. */
 async unpricedPreparationProviders(org: string, channelId: string, input: { sourceIds?: string[]; allowWebSearch?: boolean }, config?: AiConfig) {
  const providers: (string | undefined)[] = [];
  const connector = this.optionalAnalytics?.capabilities().find(value => value.id === 'licensed_registry_export_v1');
  if (connector && Number.isFinite(connector.estimatedCost) && connector.estimatedCost > 0) {
   const sources = await this.permissions.resolve(org, channelId, input.sourceIds ?? []);
   if (sources.some(source => source.grant.basis === 'licensed' && (source.grant as RegistrySourcePermissionV1).purposes.includes('licensed_registry_export_v1')))
    providers.push(undefined); // This connector exposes neither billing provider nor currency: it cannot prove a cap exemption.
  }
  if (input.allowWebSearch && this.web.paidResearchEnabled) {
   const effective = config ?? getActiveAiConfig(org) ?? await loadAiConfig(org), primary = providerForSearchTask('discovery', effective.search);
   providers.push(effective.provider, primary); // Research classifies the query before keyed search, then judges its results.
   const reserve = SEARCH_PROVIDERS.find(engine => engine !== primary && searchProviderNeedsKey(engine) && !!searchKeyFor(engine, effective.search));
   if (reserve) providers.push(reserve);
  }
  return [...new Set(providers)];
 }

 async discover(org: string, channelId: string, input: { sourceIds?: string[]; allowWebSearch?: boolean } = {},
  beforePaid?: (billingProviders: () => Promise<readonly (string | undefined)[]>) => Promise<void>) {
  if (!beforePaid) return this.discoverWithinContext(org, channelId, input);
  let config: AiConfig | undefined;
  await beforePaid(async () => {
   config = input.allowWebSearch && this.web.paidResearchEnabled ? getActiveAiConfig(org) ?? await loadAiConfig(org) : undefined;
   return this.unpricedPreparationProviders(org, channelId, input, config);
  });
  // Bind the inspected routes to this research run even if stored settings change before dispatch.
  const run = () => this.discoverWithinContext(org, channelId, input, beforePaid);
  return config ? withActiveAiConfig(org, config, run) : run();
 }

 private async discoverWithinContext(org: string, channelId: string, input: { sourceIds?: string[]; allowWebSearch?: boolean },
  beforePaid?: (billingProviders: () => Promise<readonly (string | undefined)[]>) => Promise<void>) {
  const selected = await this.profiles.resolve(org, channelId);
  const outcomes = await this.learning.forPlanning(org, channelId);
  const sources = await this.permissions.resolve(org, channelId, input.sourceIds ?? []);
  const admissions = new Map<string, SourceAdmissionV1>();
  const retainAdmissions = (values: SourceAdmissionV1[]) => {
   for (const value of values) {
    const prior = admissions.get(value.sourceId);
    if (prior && JSON.stringify(prior) !== JSON.stringify(value)) throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_CHANGED');
    admissions.set(value.sourceId, { ...value });
   }
  };
  // The discovery authority has already checked the first purpose. Export parsing requires its own explicit licensed purpose too.
  const exportIds = sources.filter(source => source.grant.basis === 'licensed' &&
   (source.grant as RegistrySourcePermissionV1).purposes.includes('licensed_registry_export_v1')).map(source => source.id);
  const connector = 'licensed_registry_export_v1';
  const configured = this.optionalAnalytics?.capabilities().find(value => value.id === connector);
  const exports = new Map<string, DiscoveryDocument[]>();
  const optionalGaps: DiscoveryResult['gaps'] = [];
  if (exportIds.length && configured) {
   const cost = configured.estimatedCost;
   if (Number.isFinite(cost) && cost > 0) await beforePaid?.(async () => [undefined]);
   const result = await this.optionalAnalytics!.evidence(org, channelId, exportIds, connector);
   if (result.documents.some(document => !result.admissions.some(stamp => stamp.sourceId === document.evidence.sourceId && stamp.snapshotId === document.evidence.sourceRevision)))
    throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_ADMISSION_REQUIRED');
   retainAdmissions(result.admissions);
   for (const id of exportIds) exports.set(id, result.documents.filter(document => document.evidence.sourceId === id));
   optionalGaps.push(...result.gaps.map(code => ({ code })));
  } else if (exportIds.length) {
   for (const id of exportIds) exports.set(id, []);
   optionalGaps.push({ code: 'OPTIONAL_ANALYTICS_NOT_CONFIGURED' });
  }

  const cache = new RedisDiscoveryCache(ioRedis);
  // Licensed derivatives are stored only by the admission-checked SQL transaction below.
  // Keep Redis generation fencing, without writing licensed content before that transaction.
  const discoveryCache: DiscoveryCache = exports.size ? {
   generation: (organizationId: string) => cache.generation(organizationId),
   read: async (organizationId: string) => ({ generation: await cache.generation(organizationId), result: null }),
   write: async (organizationId: string, _contextKey: string, generation: string) => await cache.generation(organizationId) === generation,
   invalidateOrganization: (organizationId: string) => cache.invalidateOrganization(organizationId),
  } : cache;
  const discovery = new SocialDiscoveryService({ read: async (organizationId, source) => {
   if (exports.has(source.id)) return exports.get(source.id)!;
   const loaded = await this.authority.read(organizationId, channelId, [source.id], 'discovery');
   const allowed = new Set(loaded.documents.map(document => document.sourceId));
   retainAdmissions(loaded.admissions.filter(stamp => allowed.has(stamp.sourceId)));
   if (loaded.documents.some(document => !loaded.admissions.some(stamp => stamp.sourceId === document.sourceId && stamp.snapshotId === document.sourceRevision)))
    throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_ADMISSION_REQUIRED');
   return loaded.documents.flatMap(document => document.evidence.map(evidence => ({ id: evidence.id, title: document.title,
    text: document.text, evidence, origin: (evidence.originPlatform ?? 'other') as typeof source.grant.origin,
    retainUntil: document.retainUntil ?? new Date(Date.now() + 21600000).toISOString() })));
  } }, new TopicDiscoveryReader(this.web, (organizationId, url) => this.permissions.publicRights(organizationId, url, channelId)),
   discoveryCache, new PersistentSourceRecommendation(this.store));
  const result = await discovery.discover({ organizationId: org, profileRevision: selected.revision, profile: selected.profile,
   sources, allowWebSearch: input.allowWebSearch ?? false, findings: outcomes.findings });
  result.gaps.push(...optionalGaps);
  const stamps = [...admissions.values()];
  const id = createHash('sha256').update(`${result.contextKey}:${result.createdAt}:${result.registeredSnapshotDigest}`).digest('hex');
  await this.store.transact(async store => {
   await store.assertSourceAdmissions(org, stamps);
   for (const finding of outcomes.findings) {
    const current = await store.read<LearningFindingV1>(org, 'finding', finding.id);
    if (!current || current.payload.status !== 'accepted' || JSON.stringify(current.payload) !== JSON.stringify(finding))
     throw new SocialFactoryError('SOCIAL_FACTORY_FINDING_CHANGED');
   }
   if (!await store.read(org, 'discovery', id)) await store.put({ organizationId: org, kind: 'discovery', id, parentId: channelId,
    payload: { ...result, sourceAdmissions: stamps }, expectedRevision: 0, expiresAt: new Date(result.expiresAt),
    sourceIds: [resourceRef('channel_profile', channelId), ...sources.map(source => sourceRef(source.id)),
     ...stamps.filter(stamp => stamp.permissionRevision !== null).map(stamp => resourceRef('source_permission', stamp.sourceId)),
     ...outcomes.findingIds.map(findingId => resourceRef('finding', findingId))] });
  });
  return { id, ...result, sourceAdmissions: stamps, profile: selected.profile, profileRevision: selected.revision, findings: outcomes.findings };
 }
}
