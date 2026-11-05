import type { ContentSourceRegistryRepository } from '../../source-registry/source-registry.repository';
import type { LeadTopicGateway } from '../../leads/lead-topic.gateway';
import type { EvidenceV1 } from '../contracts/social-factory.v1';
import type {
  DiscoveryDocument, DiscoverySource, DiscoverySourceGrant, DiscoverySourceReader, DiscoveryWebReader,
} from './discovery.types';

/** Reuses tenant/active/rights/purge filtering and immutable source snapshots. Never fetches URLs. */
export class RegistryDiscoveryReader implements DiscoverySourceReader {
  constructor(private readonly repository: Pick<ContentSourceRegistryRepository, 'getDraftMaterial'>,
    private readonly now: () => Date = () => new Date()) {}

  async read(organizationId: string, source: DiscoverySource): Promise<DiscoveryDocument[]> {
    const material = await this.repository.getDraftMaterial(organizationId, source.id);
    const { source: stored, snapshot } = material;
    if (stored.organizationId !== organizationId || stored.id !== source.id)
      throw new Error('DISCOVERY_SOURCE_SCOPE_MISMATCH');
    if (stored.kind !== 'MANUAL' && (!stored.freshUntil || stored.freshUntil <= this.now()))
      throw new Error('DISCOVERY_SOURCE_STALE');
    return material.evidence.slice(0, 100).map(evidence => {
      const freshUntil = stored.kind === 'MANUAL' ? evidence.freshUntil : stored.freshUntil;
      return { id: evidence.id, title: snapshot.normalizedTitle || stored.displayName,
        text: evidence.excerpt, origin: source.grant.origin,
        retainUntil: freshUntil?.toISOString() || source.grant.expiresAt,
        evidence: { id: evidence.id, source: source.id, sourceId: source.id, capturedAt: evidence.observedAt.toISOString(),
          ...(freshUntil ? { expiresAt: freshUntil.toISOString() } : {}),
          access: source.grant.acquisition === 'upload' ? 'upload' :
            source.grant.basis === 'licensed' ? 'licensed' : source.grant.basis === 'owned' ? 'first_party' : 'public',
          rights: 'permitted', factStatus: 'unknown', sourceRevision: snapshot.id,
          originPlatform: source.grant.origin, grantId: source.grant.evidenceId, purpose: 'discovery',
          consentExpiresAt: source.grant.expiresAt,
          ownerScope: organizationId, ...(stored.canonicalUrl ? { sourceUrl: stored.canonicalUrl } : {}) } };
    });
  }
}

export interface PublicDiscoveryRights {
  origin: DiscoverySourceGrant['origin'];
  rights: EvidenceV1['rights'];
  expiresAt: string;
  access: EvidenceV1['access'];
  evidenceId: string;
  sourceId: string;
}
/** Resolves licensed/public reuse from server policy; search access alone grants no AI reuse. */
export type PublicDiscoveryRightsResolver = (organizationId: string, url: string) => Promise<PublicDiscoveryRights>;

function knownPlatformOrigin(url: string): 'telegram' | 'youtube' | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (['t.me', 'telegram.me', 'telegram.org'].some(domain => host === domain || host.endsWith(`.${domain}`))) return 'telegram';
    if (['youtube.com', 'youtu.be'].some(domain => host === domain || host.endsWith(`.${domain}`))) return 'youtube';
  } catch { return null; }
  return null;
}

/** Existing research gateway owns account routing, egress admission, billing and search cache. */
export class TopicDiscoveryReader implements DiscoveryWebReader {
  constructor(private readonly gateway: Pick<LeadTopicGateway, 'check'>,
    private readonly rights: PublicDiscoveryRightsResolver,
    private readonly now: () => Date = () => new Date()) {}

  async search(organizationId: string, query: string) {
    const result = await this.gateway.check(organizationId, query);
    if (result.disabled) return { disabled: true, documents: [] };
    const documents: DiscoveryDocument[] = [];
    for (const row of result.items.slice(0, 30)) {
      const permission = await this.rights(organizationId, row.sourceUrl);
      documents.push({ id: row.externalId, title: row.title, text: row.excerpt || '',
        origin: knownPlatformOrigin(row.sourceUrl) || permission.origin,
        retainUntil: permission.expiresAt,
        evidence: { id: permission.evidenceId, source: row.sourceUrl, sourceId: permission.sourceId, sourceUrl: row.sourceUrl,
          capturedAt: this.now().toISOString(), expiresAt: permission.expiresAt,
          access: permission.access, rights: permission.rights, factStatus: 'unknown',
          originPlatform: knownPlatformOrigin(row.sourceUrl) || permission.origin,
          grantId: permission.evidenceId, purpose: 'discovery', consentExpiresAt: permission.expiresAt,
          ownerScope: organizationId,
          // A reason about topic fit is not a publication performance observation.
          note: row.reason?.en || undefined } });
    }
    return { disabled: false, documents };
  }
}
