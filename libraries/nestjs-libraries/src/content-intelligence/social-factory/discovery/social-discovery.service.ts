import { createHash } from 'node:crypto';
import type { DiscoveryCandidateV1, LearningFindingV1 } from '../contracts/social-factory.v1';
import type {
  DiscoveryCache, DiscoveryDocument, DiscoveryRequest, DiscoveryResult,
  DiscoverySourceReader, DiscoveryWebReader,
} from './discovery.types';
import { publicOriginAllowed, sourcePermissionFailure } from './source-permission';
import type { SourceRecommendation } from './source-recommendation';

const MAX_SOURCES = 20;
const MAX_DOCUMENTS = 100;
const MAX_QUERIES = 4;
const RETENTION_MS = 6 * 60 * 60_000;
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'how',
  'для', 'или', 'как', 'это', 'что', 'при', 'без', 'про', 'theirs', 'your']);

function clean(value: string, limit = 1_000): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, limit);
}
function tokens(value: string): string[] {
  return [...new Set((clean(value, 20_000).toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter(word => word.length > 2 && !STOP_WORDS.has(word)))];
}
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function acceptedFindings(input: DiscoveryRequest, now: Date): LearningFindingV1[] {
  return (input.findings || []).filter(finding => finding.status === 'accepted' &&
    finding.channelIds.includes(input.profile.channelId) && finding.observationIds.length > 0 &&
    finding.sourceIds.length > 0 && Date.parse(finding.expiresAt) > now.getTime()).slice(0, 10);
}

/** Structured query inputs contain editorial identity, never evidence bodies or private source text. */
export function discoveryQueries(input: DiscoveryRequest, findings: LearningFindingV1[] = []): string[] {
  const profile = input.profile;
  const pillars = profile.pillars.length ? profile.pillars : profile.expertise;
  const directions = pillars.length ? pillars : [profile.promise || profile.audience];
  return [...new Set(directions.slice(0, MAX_QUERIES).map((pillar, index) =>
    [pillar, profile.audience, profile.promise, profile.goals[0], profile.expertise[0],
      profile.languages.join(' '), profile.geography.join(' '),
      findings[index]?.statement, ...profile.exclusions.slice(0, 5).map(term => `-${clean(term, 100)}`)]
      .filter(Boolean).map(value => clean(value!, 250)).join(' ').slice(0, 900)
  ))].filter(Boolean);
}

function relevance(document: DiscoveryDocument, input: DiscoveryRequest): DiscoveryCandidateV1['relevance'] | null {
  const profile = input.profile;
  const haystack = `${document.title.slice(0, 1_000)} ${document.text.slice(0, 20_000)}`.toLocaleLowerCase();
  // Exclusions are hard editorial boundaries, not negative ranking weights.
  if (profile.exclusions.some(exclusion => clean(exclusion).length > 0 &&
      haystack.includes(clean(exclusion).toLocaleLowerCase()))) return null;
  const words = new Set(tokens(haystack));
  const matches = (value: string) => tokens(value).some(word => words.has(word));
  const pillars = profile.pillars.filter(matches);
  const expertise = profile.expertise.filter(matches);
  const audience = matches(profile.audience);
  const promise = matches(profile.promise);
  // A generic match on language, geography or goal cannot establish topic relevance.
  if (!pillars.length && !expertise.length && !promise) return null;
  const matched = [...pillars, ...expertise].slice(0, 3);
  const score = Math.min(1, 0.4 + (pillars.length ? 0.25 : 0) +
    (expertise.length ? 0.15 : 0) + (audience ? 0.1 : 0) + (promise ? 0.1 : 0));
  return { score, reason: `editorial_match: ${matched.length ? matched.join('; ') : profile.promise}` };
}

function performance(document: DiscoveryDocument, now: Date): DiscoveryCandidateV1['performance'] {
  const observed = document.performance;
  if (!observed || observed.availability === 'unknown') return { availability: 'unknown' };
  if (observed.availability === 'restricted') return { availability: 'restricted', caveat: observed.caveat };
  if (!Number.isFinite(observed.value) || observed.value! < 0 || !observed.metric?.trim() ||
      !observed.window?.trim() || !observed.observedAt ||
      !Number.isFinite(Date.parse(observed.observedAt)) || Date.parse(observed.observedAt) > now.getTime())
    return { availability: 'unknown' };
  // Raw values retain original metric/window. They never influence relevance or imply comparability.
  return { ...observed, caveat: observed.caveat || 'Raw observation; account size, format and age are not normalized.' };
}

export class SocialDiscoveryService {
  constructor(private readonly sources: DiscoverySourceReader,
    private readonly web: DiscoveryWebReader,
    private readonly cache: DiscoveryCache,
    private readonly recommendations: SourceRecommendation,
    private readonly now: () => Date = () => new Date()) {}

  async discover(input: DiscoveryRequest): Promise<DiscoveryResult> {
    this.validate(input);
    const now = this.now();
    const findings = acceptedFindings(input, now);
    const queries = discoveryQueries(input, findings);
    const contextKey = digest({ version: 2, organizationId: input.organizationId,
      profile: input.profile, profileRevision: input.profileRevision,
      sources: [...input.sources].sort((a, b) => a.id.localeCompare(b.id)),
      allowWebSearch: input.allowWebSearch === true,
      sourceRecommendationAcknowledged: input.sourceRecommendationAcknowledged === true, findings });
    // Resolve live registered material before cache reuse. Source archive/revoke/purge must win.
    const documents: DiscoveryDocument[] = [];
    const gaps: DiscoveryResult['gaps'] = [];
    const allowedSources = input.sources.filter(source => {
      const refused = sourcePermissionFailure(source.grant, input, now);
      if (refused || source.grant.sourceId !== source.id) {
        gaps.push({ sourceId: source.id, code: refused || 'SOURCE_SCOPE_REQUIRED' });
        return false;
      }
      return true;
    });
    // Capture invalidation metadata before reads, without retrieving any cached source content.
    const initialGeneration = await this.cache.generation(input.organizationId);
    for (const source of allowedSources) {
      try {
        const rows = await this.sources.read(input.organizationId, source);
        for (const document of rows.slice(0, MAX_DOCUMENTS - documents.length)) {
          if (document.origin !== source.grant.origin) {
            gaps.push({ sourceId: source.id, code: 'SOURCE_ORIGIN_MISMATCH' });
            continue;
          }
          documents.push({ ...document, retainUntil: new Date(Math.min(
            Date.parse(document.retainUntil), Date.parse(source.grant.expiresAt))).toISOString() });
        }
      } catch {
        gaps.push({ sourceId: source.id, code: 'SOURCE_UNAVAILABLE' });
      }
    }
    const registeredSnapshotDigest = digest(documents);
    // Live registry state has now been checked, including archive/purge/general rights revocation.
    const lease = gaps.length ? { generation: initialGeneration, result: null } :
      await this.cache.read(input.organizationId, contextKey);
    if (lease.generation !== initialGeneration) throw new Error('DISCOVERY_INVALIDATED_DURING_RUN');
    if (!gaps.length && lease.result && lease.result.channelId === input.profile.channelId &&
        lease.result.profileRevision === input.profileRevision && Date.parse(lease.result.expiresAt) > now.getTime()) {
      // Recheck the whole snapshot, including additions and changed non-selected material.
      const currentGeneration = await this.cache.generation(input.organizationId);
      if (currentGeneration !== lease.generation) throw new Error('DISCOVERY_INVALIDATED_DURING_RUN');
      if (lease.result.registeredSnapshotDigest === registeredSnapshotDigest)
        return this.present({ ...lease.result, fromCache: true }, input);
    }
    let missingWebReusePermission = false;
    if (input.allowWebSearch) {
      for (const query of queries) {
        try {
          const answer = await this.web.search(input.organizationId, query);
          if (answer.disabled) { gaps.push({ code: 'WEB_SEARCH_DISABLED' }); break; }
          // A web result cannot turn Telegram/YouTube-platform rights into an unrestricted source.
          for (const document of answer.documents.slice(0, MAX_DOCUMENTS - documents.length)) {
            if (!publicOriginAllowed(document.origin)) {
              gaps.push({ sourceId: document.id, code: 'PLATFORM_REUSE_PERMISSION_REQUIRED' });
              continue;
            }
            if (document.evidence.rights !== 'permitted') {
              missingWebReusePermission = true;
              continue;
            }
            documents.push(document);
          }
        } catch {
          gaps.push({ code: 'WEB_SEARCH_UNAVAILABLE' });
        }
      }
    }
    if (missingWebReusePermission) gaps.push({ code: 'WEB_SEARCH_REUSE_PERMISSION_REQUIRED' });
    const candidates = new Map<string, DiscoveryCandidateV1>();
    let expires = now.getTime() + RETENTION_MS;
    for (const document of documents) {
      const evidence = document.evidence;
      const expiresAt = Math.min(Date.parse(document.retainUntil),
        evidence.expiresAt ? Date.parse(evidence.expiresAt) : Infinity,
        evidence.consentExpiresAt ? Date.parse(evidence.consentExpiresAt) : Infinity);
      if (evidence.rights !== 'permitted' || !evidence.id || !evidence.source ||
          !evidence.sourceId || evidence.ownerScope !== input.organizationId || evidence.revokedAt ||
          evidence.purpose !== 'discovery' ||
          !Number.isFinite(Date.parse(evidence.capturedAt)) || Date.parse(evidence.capturedAt) > now.getTime() ||
          !Number.isFinite(expiresAt) || expiresAt <= now.getTime() || !document.text.trim()) continue;
      const relevant = relevance(document, input);
      if (!relevant) continue;
      const identity = digest({ source: evidence.source, id: document.id });
      if (candidates.has(identity)) continue;
      expires = Math.min(expires, expiresAt);
      candidates.set(identity, { id: identity, channelId: input.profile.channelId,
        title: clean(document.title || document.text, 200),
        angle: clean(`${input.profile.promise}: ${document.title || document.text}`, 500),
        relevance: relevant, performance: performance(document, now), evidence: [evidence] });
    }
    const result: DiscoveryResult = { version: 1, channelId: input.profile.channelId,
      profileRevision: input.profileRevision, contextKey, createdAt: now.toISOString(),
      expiresAt: new Date(expires).toISOString(), fromCache: false, queries,
      candidates: [...candidates.values()].sort((a, b) => b.relevance.score - a.relevance.score || a.id.localeCompare(b.id)),
      gaps, planningPrompts: (input.profile.pillars.length ? input.profile.pillars :
        input.profile.expertise.length ? input.profile.expertise : [input.profile.promise || input.profile.audience])
        .slice(0, 8).map((pillar, index) => ({ pillar,
          angle: clean([pillar, input.profile.audience, input.profile.promise,
            findings[index]?.statement, findings[index]?.uncertainty].filter(Boolean).join(' — '), 900),
          status: 'proposal' as const })),
      recommendSources: false,
      findingIds: findings.map(finding => finding.id), registeredSnapshotDigest };
    // Partial provider failures are not cached: a healthy subsequent call may recover immediately.
    if (!gaps.length) {
      const written = await this.cache.write(input.organizationId, contextKey, lease.generation, result, expires - this.now().getTime());
      if (!written) throw new Error('DISCOVERY_INVALIDATED_DURING_RUN');
    } else if (await this.cache.generation(input.organizationId) !== lease.generation) {
      throw new Error('DISCOVERY_INVALIDATED_DURING_RUN');
    }
    return this.present(result, input);
  }

  private async present(result: DiscoveryResult, input: DiscoveryRequest): Promise<DiscoveryResult> {
    // All source/cache operations have succeeded before claiming a one-time invitation.
    const recommendSources = input.sources.length === 0 && await this.recommendations.claim(
      input.organizationId, input.profile.channelId, input.sourceRecommendationAcknowledged === true);
    return { ...result, recommendSources };
  }

  invalidateOrganization(organizationId: string): Promise<void> {
    return this.cache.invalidateOrganization(organizationId);
  }

  private validate(input: DiscoveryRequest): void {
    if (!input.organizationId?.trim() || !input.profile?.channelId?.trim() ||
        !Number.isSafeInteger(input.profileRevision) || input.profileRevision < 0 ||
        input.profile.version !== 1 || !Array.isArray(input.sources) || input.sources.length > MAX_SOURCES)
      throw new Error('DISCOVERY_INVALID_REQUEST');
    const profile = input.profile;
    if (typeof profile.audience !== 'string' || typeof profile.promise !== 'string' ||
        ![profile.goals, profile.expertise, profile.pillars, profile.languages, profile.geography, profile.exclusions]
          .every(values => Array.isArray(values) && values.length <= 50 &&
            values.every(value => typeof value === 'string' && value.length <= 5_000)))
      throw new Error('DISCOVERY_INVALID_PROFILE');
  }
}
