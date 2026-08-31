export const CONTENT_CONTEXT_MAX_FACTS_V1 = 8 as const;
export const CONTENT_CONTEXT_MAX_EVIDENCE_V1 = 8 as const;
export const CONTENT_CONTEXT_MAX_RENDERED_CHARACTERS_V1 = 12_000 as const;

export const CONTENT_EVIDENCE_REQUIRED = 'CONTENT_EVIDENCE_REQUIRED' as const;
export const BRAND_PROFILE_VERSION_UNAVAILABLE =
  'BRAND_PROFILE_VERSION_UNAVAILABLE' as const;

export type ContentIntelligenceErrorCodeV1 =
  | typeof CONTENT_EVIDENCE_REQUIRED
  | typeof BRAND_PROFILE_VERSION_UNAVAILABLE;

export type BrandProfileSelectionV1 =
  | { mode: 'active' }
  | { mode: 'version'; versionId: string }
  | { mode: 'none' };

export type ResolvedBrandProfileContextV1 = {
  schemaVersion: 'brand-profile-context/v1';
  selection: 'active' | 'explicit' | 'none' | 'legacy_none';
  applied:
    | {
        mode: 'profile';
        profileId: string;
        versionId: string;
        versionNumber: number;
        label: string;
        contentDigest: string;
        provider?: string;
      }
    | {
        mode: 'neutral_fallback';
        reason: 'no_active_profile' | 'explicit_none' | 'legacy_request';
      };
  effectiveVoice?: object;
  warnings: string[];
};

export type ContentContextBuildRequestV1 = {
  consumer: 'GENERATOR' | 'EDITOR' | 'AGENT' | 'AUTOPOST';
  purpose: 'DRAFT_CREATE' | 'DRAFT_EDIT' | 'DRAFT_ASSIST';
  query: string;
  language: 'ru' | 'en';
  freshnessMode: 'REQUIRE_CURRENT' | 'PREFER_FRESH' | 'HISTORICAL';
  asOf: string;
  sourceIds?: string[];
  factIds?: string[];
  brandProfileSelection: BrandProfileSelectionV1;
  userMaterialEvidenceIds?: string[];
};

export type ContentContextEnvelopeV1 = {
  contractVersion: 'content-context/v1';
  contentContextSnapshotId: string;
  status:
    | 'READY'
    | 'PARTIAL'
    | 'UNAVAILABLE'
    | 'BLOCKED_STALE'
    | 'BLOCKED_CONFLICT';
  generationPolicy: 'ALLOW_GROUNDED' | 'ALLOW_USER_ONLY' | 'EVIDENCE_REQUIRED';
  builtAt: string;
  expiresAt: string;
  profile:
    | {
        mode: 'resolved';
        versionId: string;
        versionNumber: number;
        contentDigest: string;
      }
    | {
        mode: 'neutral_fallback';
        reason: 'NO_PROFILE' | 'EXPLICIT_NONE' | 'LEGACY_REQUEST';
      };
  facts: Array<{
    citationId: string;
    factId: string;
    statement: string;
    temporalKind: 'CURRENT' | 'DATED' | 'TIMELESS';
    verifiedAt: string;
    freshUntil: string;
    evidenceCitationIds: string[];
  }>;
  evidence: Array<{
    citationId: string;
    evidenceId: string;
    sourceSnapshotId: string;
    title: string;
    excerpt: string;
    url: string | null;
    exposure: 'PUBLIC' | 'INTERNAL_ONLY';
    publishedAt: string | null;
    retrievedAt: string;
  }>;
  rejected: Array<{
    itemId: string;
    reason:
      | 'FOREIGN_TENANT'
      | 'DELETED'
      | 'STALE'
      | 'CONFLICTED'
      | 'UNVERIFIED'
      | 'PRIVATE_NOT_EXPORTABLE'
      | 'OVER_BUDGET';
  }>;
};

export type GroundedDraftPartV1 = {
  content: string;
  citationIds: string[];
};
