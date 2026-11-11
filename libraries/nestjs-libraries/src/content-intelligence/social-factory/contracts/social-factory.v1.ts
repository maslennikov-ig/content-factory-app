import type { SourceArtifactRefV1 } from './source-artifact.v1';
import type { LocalCompositionEvidenceV2 } from '../editorial/local-composition-evidence.v2';
/** Shared wire/storage contract. Domain services retain validation and provider policy. */
export const SOCIAL_FACTORY_VERSION = 1 as const;
export type SocialPlatformV1 = 'telegram' | 'instagram' | 'youtube' | 'threads' | 'tiktok';
export type MaterialFormatV1 = 'post' | 'thread' | 'carousel' | 'story' | 'reel' | 'short' | 'long_video';
export type AutonomyModeV1 = 'collaborative' | 'prepare_approve' | 'autopilot';
export type SocialFactoryKindV1 = 'channel_profile' | 'discovery' | 'editorial' | 'campaign' | 'campaign_item' | 'grant' | 'decision' | 'action' | 'observation' | 'experiment' | 'finding' | 'attribution' | 'exchange' | 'video_composition' | 'source_recommendation' | 'publication_binding' | 'channel_profile_snapshot' | 'source_permission' | 'media_purge' | 'draft_destination' | 'heygen_avatar_consent' | 'heygen_person_profile' | 'heygen_style_operation' | 'heygen_voice_setup' | 'heygen_video_scope' | 'heygen_performance_plan' | 'heygen_performance_preference' | 'heygen_performance_feedback';
export type JsonValueV1 = null | boolean | number | string | JsonValueV1[] | { [key: string]: JsonValueV1 };
export interface SocialFactoryRecordV1<T = unknown> {
  organizationId: string; kind: SocialFactoryKindV1; id: string; revision: number;
  payload: T; parentId: string | null; createdAt: Date; updatedAt: Date; deletedAt: Date | null; invalidatedAt: Date | null; expiresAt: Date | null; sourceIds: string[];
}
export interface SocialFactoryPutV1<T> {
  organizationId: string; kind: SocialFactoryKindV1; id: string; payload: T; parentId?: string;
  /** 0 creates only; a positive revision is compare-and-swap. Never blind overwrite. */
  expectedRevision: number;
  expiresAt?: Date; sourceIds?: string[];
}
/** Prisma-backed by A. Consumers inject SocialFactoryRepository (../social-factory.repository). */
export interface SocialFactoryStoreV1 {
  readSourcePermissionState<T>(organizationId: string, sourceId: string): Promise<SourcePermissionStateV1<T>>;
  renewSourceRetention(organizationId: string, sourceId: string, previousExpiry: Date): Promise<void>;
  assertBrandProfileVersion(organizationId: string, expected: { profileId: string; versionId: string; contentDigest: string }): Promise<void>;
  assertSourceAdmissions(organizationId: string, admissions: SourceAdmissionV1[]): Promise<void>;
  assertArtifactSource?(organizationId: string, actorId: string, source: SourceArtifactRefV1): Promise<void>;
  page<T>(organizationId: string, kind: SocialFactoryKindV1, query?: { cursor?: string; limit?: number; parentId?: string }): Promise<{ items: SocialFactoryRecordV1<T>[]; nextCursor: string | null }>;
  purgeExpired(organizationId: string, now?: Date): Promise<number>;
  invalidateBySource(organizationId: string, sourceId: string): Promise<number>;
  transact<T>(work: (store: SocialFactoryStoreV1) => Promise<T>): Promise<T>;
  read<T>(organizationId: string, kind: SocialFactoryKindV1, id: string): Promise<SocialFactoryRecordV1<T> | null>;
  list<T>(organizationId: string, kind: SocialFactoryKindV1, limit?: number, parentId?: string): Promise<SocialFactoryRecordV1<T>[]>;
  put<T>(input: SocialFactoryPutV1<T>): Promise<SocialFactoryRecordV1<T>>;
  remove(organizationId: string, kind: SocialFactoryKindV1, id: string, expectedRevision: number): Promise<void>;
}
export interface EvidenceV1 {
  id: string; sourceId?: string; source: string; sourceUrl?: string; capturedAt: string; expiresAt?: string;
  access: 'first_party' | 'public' | 'licensed' | 'upload';
  rights: 'permitted' | 'restricted' | 'unknown';
  factStatus: 'verified' | 'owner_asserted' | 'inferred' | 'unknown';
  sourceRevision?: string; ownerScope?: string; note?: string;
  originPlatform?: string; ownerId?: string; grantId?: string; purpose?: string;
  consentExpiresAt?: string; revokedAt?: string;
  permissionBasis?: 'registry_confirmed' | 'scoped_grant'; rightsConfirmedAt?: string;
}
export interface ChannelEditorialProfileV1 {
  version: 1; channelId: string; platform: SocialPlatformV1; brandProfileId?: string;
  audience: string; promise: string; goals: string[]; expertise: string[]; pillars: string[];
  languages: string[]; geography: string[]; exclusions: string[];
  facts?: EditorialFactV1[]; fieldEvidence?: Record<string, string[]>;
  evidence: EvidenceV1[]; openQuestions: { id: string; question: string; requiredFor: string[] }[];
}
export interface DiscoveryCandidateV1 {
  id: string; channelId: string; title: string; angle: string;
  relevance: { score: number; reason: string };
  performance: { availability: 'available' | 'unknown' | 'restricted'; value?: number; metric?: string; window?: string; caveat?: string; accountSize?: number; format?: MaterialFormatV1; ageSeconds?: number; observedAt?: string };
  evidence: EvidenceV1[];
}
export interface ProductionAssetV1 {
  id: string; kind: 'image' | 'video' | 'audio' | 'subtitle' | 'document';
  mediaId: string; mimeType: string; role: string; url?: string;
  width?: number; height?: number; durationSeconds?: number; sceneId?: string;
  videoEvidence?: { metadata: { source: 'mp4_bytes'; sha256: string }; captions: { burned: 'provider_confirmed' | 'authored_timed_cues' | 'retained_scene_lineage' | 'unverified'; sourceJobIds: string[] }; localSilent?: {version:1;renderKey:string;sourceArtifact:SourceArtifactRefV1;textSha256:string;sceneTextDigest:string;speech:false}; localComposition?:LocalCompositionEvidenceV2 };
  provenance: { provider?: string; jobId?: string; sourceIds: string[]; revision: string };
}
export interface DraftDestinationRefV1 { kind: 'draft'; id: string; publishable: false }
export interface EditorialMaterialV1 {
  sourceArtifact?: SourceArtifactRefV1; destination?: DraftDestinationRefV1;
  version: 1; channelId: string; platform: SocialPlatformV1; format: MaterialFormatV1;
  title: string; hook: string; body: string; script?: string; caption?: string; cta?: string;
  assets: ProductionAssetV1[];
  posts?: { index: number; text: string }[];
  scenes?: { index: number; startSeconds: number; endSeconds: number; spokenText?: string; screenText?: string; visualIntent: string }[];
  ctaSurface?: 'post' | 'bio' | 'story' | 'description' | 'related_video' | 'reply' | 'none';
  slides?: { index: number; text: string; assetId: string }[];
  settings: Record<string, JsonValueV1>; evidence: EvidenceV1[];
  playbook: { version: string; sourceDate: string };
  /** Existing piece/adaptation is the editor/calendar/publishing object. */
  pieceId?: string; derivationId?: string;
}
export interface CampaignAllocationV1 {
  destination?: DraftDestinationRefV1;
  channelId: string; platform: SocialPlatformV1; format: MaterialFormatV1; count: number;
  /** One story item is one frame. A carousel item is one publication. */
  slideCount?: number; sequenceId?: string;
}
export type CampaignItemStateV1 = 'planned' | 'needs_input' | 'preparing' | 'ready' | 'awaiting_approval' | 'approved' | 'scheduled' | 'submitting' | 'uncertain' | 'published' | 'failed' | 'cancelled';
export interface CampaignV1 {
  version: 1; id: string; name: string; actorId: string; scheduleBasis?: 'channel' | 'tentative' | 'explicit'; mode: AutonomyModeV1;
  timeZone: string; startsAt: string; endsAt: string; state: 'active' | 'paused' | 'stopped' | 'completed';
  allocations: CampaignAllocationV1[]; itemIds: string[]; researchIds: string[];
  findingIds: string[]; grantId?: string; createdAt: string;
}
export interface CampaignItemV1 {
  destination?: DraftDestinationRefV1;
  version: 1; id: string; campaignId: string; channelId: string; platform: SocialPlatformV1;
  format: MaterialFormatV1; state: CampaignItemStateV1; scheduledAt: string;
  sequenceId?: string; slideCount?: number; contentRevision: number;
  material?: EditorialMaterialV1;
  approval?: { revision: number; digest: string; actorId: string; at: string };
  postId?: string;
  delivery?: { postId: string; pieceId: string; derivationId: string; revision: number; postDigest: string; publishActionId: string; scheduleActionId?: string };
  publication?: { provider: string; externalId: string; url?: string; publishedAt: string; revision: number };
  blocker?: { code: string; detail: string }; actionId?: string;
}
export interface AutonomyGrantV1 {
  version: 1; id: string; actorId: string; campaignId?: string; channelIds: string[];
  actions: ('prepare' | 'editorial_decide' | 'schedule' | 'publish' | 'generate_paid')[];
  mode: AutonomyModeV1; expiresAt: string; revokedAt?: string;
  budget?: { currency: string; maximum: number };
  formats?: MaterialFormatV1[]; timeZone?: string;
  postingWindows?: { daysOfWeek: number[]; start: string; end: string }[];
  exclusions?: string[];
  providerBudget?: { provider: string; payer: string; currency: string; maximum: number };
  /** A grant cannot replace platform-required per-item consent. */
  platformConsentIds: string[];
}
export interface AutonomyDecisionV1 {
  version: 1; campaignId: string; itemId?: string; kind: 'editorial' | 'missing_fact' | 'rights' | 'budget' | 'permission';
  question: string; answer?: string; evidenceIds: string[];
  missingFacts?: string[]; factStatus?: 'inferred' | 'open' | 'unknown' | 'verified' | 'owner_asserted'; sourceArtifact?: SourceArtifactRefV1;
  model?: { provider: string; model: string; role: string; selectedModel?: string; attemptedModels?: string[]; operationId?: string; fallbackReason?: 'MODEL_NOT_FOUND' }; actorId: string; createdAt: string;
}
export interface PerformanceObservationV1 {
  version: 1; id: string; campaignId: string; itemId: string; publicationId: string; revision: number;
  platform: SocialPlatformV1; channelId: string; accountId: string; authRoute: string;
  expiresAt: string; invalidatedAt?: string; authorizationCheckedAt?: string;
  access: EvidenceV1['access']; derivationAllowed: boolean; metric: string; value: number | null; unit: string;
  availability: 'available' | 'unknown' | 'unsupported' | 'restricted';
  source: string; observedAt: string; window: { start: string; end: string; kind: 'lifetime' | 'interval'; ageSeconds?: number };
  evidence: EvidenceV1[];
}
export interface LearningFindingV1 {
  version: 1; id: string; channelIds: string[]; statement: string;
  status: 'proposed' | 'accepted' | 'withdrawn'; uncertainty: string;
  observationIds: string[]; sourceIds: string[]; expiresAt: string;
  interpretation: 'association' | 'experiment';
  sampleSize: number; computedAt: string; explorationShare: number; experimentId?: string;
  comparison?: { metric: string; baseline: number; candidate: number; baselineCount: number; candidateCount: number };
}
/** Resolve company defaults first, then explicit channel editorial overrides. Unknown facts remain questions. */
export interface EditorialFactV1 {
  key: string; value: JsonValueV1; provenance: 'verified' | 'owner_asserted' | 'inferred' | 'open';
  scope: 'company' | 'channel'; verifiedFactId?: string; evidenceIds: string[];
}
export interface PlatformCapabilityV1 {
  platform: SocialPlatformV1; channelId: string; accountType: string; authRoute: string;
  formats: MaterialFormatV1[]; publishing: 'direct' | 'manual' | 'unavailable';
  links: ('post' | 'bio' | 'story' | 'description' | 'related_video')[]; metrics: string[];
  requiredConsent: 'per_item' | 'connection' | 'none'; checkedAt: string;
  unavailableReason?: string;
}
export interface DeliveryResultV1 {
  state: 'draft' | 'manual' | 'scheduled' | 'uncertain' | 'published' | 'failed';
  postId?: string; externalId?: string; url?: string; reason?: string;
  receipt?: { provider: string; externalId: string; acceptedAt: string; revision: number };
}

export interface SourceAdmissionV1 {
  sourceId: string; sourceConfigVersion: number; snapshotId: string;
  rightsConfirmedAt: string | null; permissionRevision: number | null;
}
export type SourcePermissionStateV1<T> = {state:'absent'} | {state:'present';record:SocialFactoryRecordV1<T>} | {state:'unknown'};
