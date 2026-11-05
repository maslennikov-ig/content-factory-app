import type {
  ChannelEditorialProfileV1,
  DiscoveryCandidateV1,
  EvidenceV1,
  LearningFindingV1,
} from '../contracts/social-factory.v1';

/** Internal policy input, resolved server-side; never an unchecked client assertion. */
export interface DiscoverySourceGrant {
  organizationId: string;
  sourceId: string;
  revision: string;
  purposes: ('discovery' | 'editorial')[];
  basis: 'owned' | 'licensed' | 'consented';
  evidenceId: string;
  expiresAt: string;
  revokedAt?: string;
  /** Origin survives upload, forwarding, syndication and vendor acquisition. */
  origin: 'first_party' | 'web' | 'telegram' | 'youtube' | 'other';
  acquisition: 'first_party' | 'upload' | 'url' | 'rss' | 'search' | 'licensed';
  sourceContext: string;
  channelIds: string[];
  telegramConsent?: {
    evidenceId: string;
    context: string;
    allRelevantUsers: boolean;
    explicitInformedAffirmative: boolean;
    continued: boolean;
  };
}

export interface DiscoverySource {
  id: string;
  grant: DiscoverySourceGrant;
}

export interface DiscoveryRequest {
  organizationId: string;
  /** Stored profile revision; zero is an unsaved profile resolved from company defaults. */
  profileRevision: number;
  profile: ChannelEditorialProfileV1;
  sources: DiscoverySource[];
  allowWebSearch?: boolean;
  /** A single acknowledged recommendation is retained by the profile owner. */
  sourceRecommendationAcknowledged?: boolean;
  /** Loaded from learning.forPlanning by the server, not from the chat model. */
  findings?: LearningFindingV1[];
}

export interface DiscoveryDocument {
  id: string;
  title: string;
  text: string;
  evidence: EvidenceV1;
  /** Read from the original source, never inferred from access route or URL. */
  origin: DiscoverySourceGrant['origin'];
  retainUntil: string;
  performance?: DiscoveryCandidateV1['performance'];
}

export interface DiscoveryResult {
  version: 1;
  channelId: string;
  profileRevision: number;
  contextKey: string;
  createdAt: string;
  expiresAt: string;
  fromCache: boolean;
  queries: string[];
  candidates: DiscoveryCandidateV1[];
  gaps: { sourceId?: string; code: string }[];
  /** Initial ideas remain proposals, with no unsupported company claims. */
  planningPrompts: { pillar: string; angle: string; status: 'proposal' }[];
  recommendSources: boolean;
  findingIds: string[];
  registeredSnapshotDigest: string;
}

export interface DiscoverySourceReader {
  read(organizationId: string, source: DiscoverySource): Promise<DiscoveryDocument[]>;
}

export interface DiscoveryWebReader {
  search(organizationId: string, query: string): Promise<{
    disabled: boolean;
    documents: DiscoveryDocument[];
  }>;
}

export interface DiscoveryCacheLease {
  generation: string;
  result: DiscoveryResult | null;
}

export interface DiscoveryCache {
  /** Metadata-only; safe even when source rights forbid retrieving cached content. */
  generation(organizationId: string): Promise<string>;
  read(organizationId: string, contextKey: string): Promise<DiscoveryCacheLease>;
  /** False means sources were invalidated while this work was in flight. */
  write(organizationId: string, contextKey: string, generation: string,
    result: DiscoveryResult, ttlMs: number): Promise<boolean>;
  invalidateOrganization(organizationId: string): Promise<void>;
}
