import { readDraftDestinationV1 } from '../draft-destination.v1';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { BrandProfileContentV1 } from '../../brand-profile/brand-profile.types';
import type { ChannelEditorialProfileV1, EditorialFactV1, SourceAdmissionV1, SocialFactoryStoreV1, SocialPlatformV1 } from '../contracts/social-factory.v1';
import { resourceRef, sourceRef } from '../social-factory.repository';

const text = z.string().trim().max(2000);
const list = z.array(text.min(1)).max(30);
const evidence = z.object({ id: text.min(1), sourceId: text.min(1).optional(), source: text.min(1), sourceUrl: text.optional(), capturedAt: text.min(1), expiresAt: text.optional(), access: z.enum(['first_party', 'public', 'licensed', 'upload']), rights: z.enum(['permitted', 'restricted', 'unknown']), factStatus: z.enum(['verified', 'owner_asserted', 'inferred', 'unknown']), sourceRevision: text.optional(), ownerScope: text.optional(), note: text.optional(), originPlatform: text.optional(), ownerId: text.optional(), grantId: text.optional(), purpose: text.optional(), consentExpiresAt: text.optional(), revokedAt: text.optional(), permissionBasis: z.enum(['registry_confirmed', 'scoped_grant']).optional(), rightsConfirmedAt: text.optional() }).strict();
const jsonValue: z.ZodType<any> = z.lazy(() => z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]));
const editorialFact = z.object({key: text.min(1), value: jsonValue, provenance: z.enum(['verified', 'owner_asserted', 'inferred', 'open']), scope: z.enum(['company', 'channel']), verifiedFactId: text.min(1).optional(), evidenceIds: list}).strict();
const profileSchema = z.object({ version: z.literal(1), channelId: text.min(1), platform: z.enum(['telegram', 'instagram', 'youtube', 'threads', 'tiktok']), brandProfileId: text.min(1).optional(), audience: text, promise: text, goals: list, expertise: list, pillars: list, languages: list, geography: list, exclusions: list, facts: z.array(editorialFact).max(100).optional(), fieldEvidence: z.record(list).optional(), evidence: z.array(evidence).max(100), openQuestions: z.array(z.object({id: text.min(1), question: text.min(1), requiredFor: list}).strict()).max(50) }).strict();
export const channelEditorialProfileSchemaV1 = profileSchema;

type BasePayload = { format: 'channel-profile-base/v1'; profile: ChannelEditorialProfileV1; snapshotId?: string };
const readBase = (raw: unknown): BasePayload => {
  if (raw && typeof raw === 'object' && (raw as { format?: unknown }).format === 'channel-profile-base/v1') {
    const value = raw as BasePayload;
    return { format: 'channel-profile-base/v1', profile: profileSchema.parse(value.profile) as ChannelEditorialProfileV1, ...(typeof value.snapshotId === 'string' && value.snapshotId ? { snapshotId: value.snapshotId } : {}) };
  }
  // Profiles saved by the first version have no envelope.
  return { format: 'channel-profile-base/v1', profile: profileSchema.parse(raw) as ChannelEditorialProfileV1 };
};

/** Existing repositories and the A-owned store are provided by the composition root. */
type Dependencies = {
  store: SocialFactoryStoreV1;
  integrations: { getIntegrationById(org: string, id: string): Promise<{ id: string; providerIdentifier: string; contentLanguage: string; deletedAt: Date | null; writingProfile: unknown } | null> };
  brands: {
    getOverview(org: string, includeDrafts: boolean, avatarId?: string): Promise<{ profile: { activeVersionId: string | null } | null }>;
    getActiveRuntimeVersion(org: string): Promise<{ version: { id: string; content: BrandProfileContentV1; contentDigest: string }; profile: { id: string } } | null>;
    getPublishedRuntimeVersion(org: string, versionId: string): Promise<{ version: { id: string; content: BrandProfileContentV1; contentDigest: string }; profile: { id: string } } | null>;
  };
};
const platformFor = (identifier: string): SocialPlatformV1 | null => identifier === 'instagram-standalone' ? 'instagram' : (['telegram', 'instagram', 'youtube', 'threads', 'tiktok'].includes(identifier) ? identifier as SocialPlatformV1 : null);
const question = (id: string, message: string) => ({ id, question: message, requiredFor: id === 'missing:audience' || id === 'missing:promise' ? ['grounded_plan'] : [] });
const unique = (values: string[]) => [...new Set(values.map(x => x.trim()).filter(Boolean))];
const fallback = (explicit: string[], base: string[]) => explicit.length ? explicit : base;

/** Missing inputs are visible questions; a company profile remains useful on day one. */
export function resolveChannelProfileV1(channel: { id: string; platform: SocialPlatformV1; contentLanguage: string }, stored: ChannelEditorialProfileV1 | null, company: BrandProfileContentV1 | null) {
  const base = company?.project;
  const profile: ChannelEditorialProfileV1 = {
    version: 1, channelId: channel.id, platform: channel.platform,
    ...(stored?.brandProfileId ? { brandProfileId: stored.brandProfileId } : {}),
    audience: stored?.audience || base?.audiences.map(a => a.name + (a.need ? `: ${a.need}` : '')).join('; ') || '',
    promise: stored?.promise || base?.positioning || base?.oneLineDescription || '',
    goals: fallback(stored?.goals || [], base?.contentGoals || []),
    expertise: stored?.expertise || [], pillars: stored?.pillars || [],
    languages: fallback(stored?.languages || [], [channel.contentLanguage || company?.voice.defaultLanguage || 'en']),
    geography: stored?.geography || [],
    exclusions: unique([...(company?.guardrails.prohibitedTopics || []), ...(company?.guardrails.prohibitedClaims || []), ...(stored?.exclusions || [])]),
    ...(stored?.facts ? { facts: stored.facts } : {}), ...(stored?.fieldEvidence ? { fieldEvidence: stored.fieldEvidence } : {}),
    evidence: stored?.evidence || [], openQuestions: [...(stored?.openQuestions || [])],
  };
  const ru = profile.languages[0]?.toLowerCase().startsWith('ru');
  const missing: [string, string, boolean][] = [
    ['missing:audience', ru ? 'Для кого этот канал?' : 'Who is this channel for?', !profile.audience],
    ['missing:promise', ru ? 'Какую пользу должен приносить канал?' : 'What value should this channel offer?', !profile.promise],
    ['missing:expertise', ru ? 'В каких темах у канала есть собственный опыт?' : 'Which topics can this channel speak about from experience?', !profile.expertise.length],
    ['missing:pillars', ru ? 'Какие темы должны повторяться?' : 'Which subjects should recur?', !profile.pillars.length],
  ];
  profile.openQuestions = profile.openQuestions.filter(q => !missing.some(([id, , needed]) => q.id === id && !needed));
  for (const [id, message, needed] of missing) if (needed && !profile.openQuestions.some(q => q.id === id)) profile.openQuestions.push(question(id, message));
  // A profile is editorial context, not proof of an independent factual claim.
  const facts: EditorialFactV1[] = (['audience', 'promise', 'goals', 'expertise', 'pillars', 'languages', 'geography', 'exclusions'] as const).map(key => {
    const present = Array.isArray(profile[key]) ? (profile[key] as string[]).length > 0 : Boolean(profile[key]);
    const onChannel = Boolean(stored && (Array.isArray(stored[key]) ? (stored[key] as string[]).length > 0 : stored[key]));
    const declared = stored?.facts?.find(f => f.key === key && JSON.stringify(f.value) === JSON.stringify(profile[key]));
    // Client-provided labels and references cannot by themselves verify a fact.
    // The resolver preserves them for later evidence verification by the owner.
    const provenance = !present ? 'open' : declared?.provenance === 'inferred' ? 'inferred' : 'owner_asserted';
    return { key, value: profile[key], provenance, scope: onChannel ? 'channel' : 'company', evidenceIds: stored?.fieldEvidence?.[key] || [] };
  });
  return { profile, facts, sourceRecommendation: profile.evidence.length === 0 };
}

export class ChannelProfileServiceV1 {
  constructor(private readonly deps: Dependencies) {}
  private async channel(org: string, id: string) {
    if (!org?.trim() || !id?.trim()) throw new Error('channel_profile_not_found');
    const draft = await this.deps.store.read(org, 'draft_destination', id);
    if (draft) { const value=readDraftDestinationV1(draft.payload,id); return {id,providerIdentifier:value.platform,contentLanguage:value.locale,deletedAt:null as Date|null,writingProfile:{},destination:{kind:'draft' as const,id,publishable:false as const}}; }
    const channel = await this.deps.integrations.getIntegrationById(org, id);
    if (!channel || channel.deletedAt || !platformFor(channel.providerIdentifier)) throw new Error('channel_profile_not_found');
    return channel;
  }
  async save(org: string, raw: unknown, expectedRevision: number) {
    const profile = profileSchema.parse(raw) as ChannelEditorialProfileV1;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('channel_profile_invalid_revision');
    const channel = await this.channel(org, profile.channelId);
    if (platformFor(channel.providerIdentifier) !== profile.platform) throw new Error('channel_profile_platform_mismatch');
    if (profile.brandProfileId) await this.brand(org, profile.brandProfileId);
    if (profile.evidence.length || Object.keys(profile.fieldEvidence || {}).length || profile.facts?.some(f => f.provenance === 'verified' || f.provenance === 'inferred')) throw new Error('channel_profile_derived_requires_snapshot');
    const saved=await this.deps.store.put({ organizationId: org, kind: 'channel_profile', id: channel.id, payload: { format: 'channel-profile-base/v1', profile }, expectedRevision });
    return {...saved,...('destination' in channel?{destination:channel.destination}:{})};
  }
  /** Only a trusted, permission-checked discovery flow may call this method. */
  async saveDerived(org: string, raw: unknown, baseRevision: number, admissions: SourceAdmissionV1[] = []) {
    const profile = profileSchema.parse(raw) as ChannelEditorialProfileV1;
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 1) throw new Error('channel_profile_invalid_revision');
    const channel = await this.channel(org, profile.channelId);
    if (platformFor(channel.providerIdentifier) !== profile.platform) throw new Error('channel_profile_platform_mismatch');
    const base = await this.deps.store.read<unknown>(org, 'channel_profile', profile.channelId);
    if (!base || base.revision !== baseRevision) throw new Error('channel_profile_base_changed');
    if (profile.evidence.some(item => !item.sourceId)) throw new Error('channel_profile_missing_source_id');
    const now = Date.now();
    const deadlines = profile.evidence.flatMap(item => [item.expiresAt, item.consentExpiresAt].filter((value): value is string => Boolean(value)).map(value => Date.parse(value)));
    if (profile.evidence.some(item => item.rights !== 'permitted' || Boolean(item.revokedAt)) || deadlines.some(value => !Number.isFinite(value) || value <= now)) throw new Error('channel_profile_source_unavailable');
    const expiresAt = deadlines.length ? new Date(Math.min(...deadlines)) : undefined;
    const evidenceIds = new Set(profile.evidence.map(item => item.id));
    if (Object.values(profile.fieldEvidence || {}).some(ids => ids.some(id => !evidenceIds.has(id)))) throw new Error('channel_profile_missing_evidence');
    const writing = channel.writingProfile && typeof channel.writingProfile === 'object' && !Array.isArray(channel.writingProfile) ? channel.writingProfile as Record<string, unknown> : {};
    const baseProfile = readBase(base.payload).profile;
    const avatar = baseProfile.brandProfileId || (typeof writing.brandProfileId === 'string' && writing.brandProfileId ? writing.brandProfileId : undefined);
    if (profile.brandProfileId && profile.brandProfileId !== avatar) throw new Error('channel_profile_brand_mismatch');
    const brand = await this.brand(org, avatar);
    const rawSourceIds = unique(profile.evidence.map(item => item.sourceId!));
    if (!Array.isArray(admissions) || rawSourceIds.length !== admissions.length || rawSourceIds.some(id => !admissions.some(stamp => stamp.sourceId === id))) throw new Error('channel_profile_source_admission_required');
    const sourceIds = rawSourceIds.map(sourceRef);
    if (brand) sourceIds.push(sourceRef(`brand-profile:${brand.profile.id}:version:${brand.version.id}`));
    sourceIds.push(resourceRef('channel_profile', profile.channelId));
    return this.deps.store.transact(async tx => {
      const current = await tx.read<unknown>(org, 'channel_profile', profile.channelId);
      if (!current || current.revision !== baseRevision) throw new Error('channel_profile_base_changed');
      if (admissions.length) await tx.assertSourceAdmissions(org, admissions);
      if (brand) {
        // The shared store binds this check to the very same transaction that
        // creates the snapshot. A pre-transaction brand read is not a fence.
        const guarded = tx as SocialFactoryStoreV1 & {
          assertBrandProfileVersion?: (organizationId: string, expected: { profileId: string; versionId: string; contentDigest: string }) => Promise<void>;
        };
        if (!guarded.assertBrandProfileVersion) throw new Error('channel_profile_brand_fence_unavailable');
        await guarded.assertBrandProfileVersion(org, { profileId: brand.profile.id, versionId: brand.version.id, contentDigest: brand.version.contentDigest });
      }
      const snapshotId = randomUUID();
      const nextRevision = current.revision + 1;
      const snapshot = await tx.put({ organizationId: org, kind: 'channel_profile_snapshot', id: snapshotId, parentId: profile.channelId, payload: { profile, baseRevision: nextRevision, brandVersionDigest: brand?.version.contentDigest || null, brandVersionKey: brand ? `${brand.profile.id}:${brand.version.id}` : null }, expectedRevision: 0, sourceIds, expiresAt });
      await tx.put({ organizationId: org, kind: 'channel_profile', id: profile.channelId, payload: { ...readBase(current.payload), snapshotId }, expectedRevision: current.revision });
      return { snapshot, baseRevision: nextRevision };
    });
  }
  private async brand(org: string, avatarId?: string) {
    if (!avatarId) return this.deps.brands.getActiveRuntimeVersion(org);
    const overview = await this.deps.brands.getOverview(org, false, avatarId);
    if (!overview.profile?.activeVersionId) throw new Error('channel_profile_brand_unavailable');
    const result = await this.deps.brands.getPublishedRuntimeVersion(org, overview.profile.activeVersionId);
    if (!result || result.profile.id !== avatarId) throw new Error('channel_profile_brand_unavailable');
    return result;
  }
  async resolve(org: string, channelId: string) {
    const channel = await this.channel(org, channelId);
    const row = await this.deps.store.read<unknown>(org, 'channel_profile', channelId);
    const base = row ? readBase(row.payload) : null;
    const stored = base?.profile || null;
    if (stored && (stored.channelId !== channelId || stored.platform !== platformFor(channel.providerIdentifier))) throw new Error('channel_profile_invalid_stored');
    const writing = channel.writingProfile && typeof channel.writingProfile === 'object' && !Array.isArray(channel.writingProfile) ? channel.writingProfile as Record<string, unknown> : {};
    const selectedAvatar = stored?.brandProfileId || (typeof writing.brandProfileId === 'string' && writing.brandProfileId ? writing.brandProfileId : undefined);
    const brand = await this.brand(org, selectedAvatar);
    const digest = brand?.version.contentDigest || null;
    const brandVersionKey = brand ? `${brand.profile.id}:${brand.version.id}` : null;
    type Snapshot = { profile: ChannelEditorialProfileV1; baseRevision: number; brandVersionDigest: string | null; brandVersionKey: string | null };
    const selected = base?.snapshotId ? await this.deps.store.read<Snapshot>(org, 'channel_profile_snapshot', base.snapshotId) : null;
    let effective = stored;
    if (stored && row && selected && selected.payload.baseRevision === row.revision && selected.payload.brandVersionDigest === digest && selected.payload.brandVersionKey === brandVersionKey) {
      const derived = profileSchema.parse(selected.payload.profile) as ChannelEditorialProfileV1;
      if (derived.channelId !== channelId || derived.platform !== platformFor(channel.providerIdentifier)) throw new Error('channel_profile_invalid_stored');
      const keys = ['audience', 'promise', 'goals', 'expertise', 'pillars', 'languages', 'geography'] as const;
      const adopted = new Set(keys.filter(key => Array.isArray(stored[key]) ? !(stored[key] as string[]).length : !stored[key]));
      const derivedFacts: EditorialFactV1[] = keys.filter(key => adopted.has(key)).map(key => ({ key, value: derived[key], provenance: 'inferred', scope: 'channel', evidenceIds: derived.fieldEvidence?.[key] || [] }));
      effective = { ...stored,
        audience: stored.audience || derived.audience, promise: stored.promise || derived.promise,
        goals: fallback(stored.goals, derived.goals), expertise: fallback(stored.expertise, derived.expertise), pillars: fallback(stored.pillars, derived.pillars),
        languages: fallback(stored.languages, derived.languages), geography: fallback(stored.geography, derived.geography), exclusions: unique([...stored.exclusions, ...derived.exclusions]),
        evidence: derived.evidence, fieldEvidence: Object.fromEntries(Object.entries(derived.fieldEvidence || {}).filter(([key]) => adopted.has(key as typeof keys[number]))), facts: [...(stored.facts || []), ...derivedFacts], openQuestions: [...stored.openQuestions, ...derived.openQuestions],
      };
    }
    return { ...resolveChannelProfileV1({ id: channel.id, platform: platformFor(channel.providerIdentifier)!, contentLanguage: channel.contentLanguage }, effective, brand?.version.content || null), revision: row?.revision || 0, brandVersionDigest: digest,...('destination' in channel?{destination:channel.destination}:{}) };
  }
}
