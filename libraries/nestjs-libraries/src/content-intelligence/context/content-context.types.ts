import type {
  BrandProfileSelectionV1,
  ContentContextBuildRequestV1,
  ContentContextEnvelopeV1,
  ResolvedBrandProfileContextV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/contracts';

export type ContentContextBuildInputV1 = ContentContextBuildRequestV1 & {
  provider?: string;
};

export type ContentContextEnvelopeResultV1 = ContentContextEnvelopeV1 & {
  errorCode: 'CONTENT_EVIDENCE_REQUIRED' | null;
  renderedCharacterCount: number;
  selectionHash: string;
};

export type EvidenceCandidateV1 = {
  id: string;
  organizationId: string;
  sourceSnapshotId: string;
  excerpt: string | null;
  excerptHash: string | null;
  exposure: string;
  tombstone: string | null;
  observedAt: Date;
  freshUntil: Date | null;
  freshnessStatus: string;
  explicit?: boolean;
  assessment?: {
    status: string;
    trustTier: string;
    trustPolicyVersion: number;
  } | null;
  snapshot: {
    id: string;
    organizationId: string;
    kind?: string;
    normalizedTitle: string | null;
    finalCanonicalUrl: string | null;
    publishedAt: Date | null;
    observedAt: Date;
    freshUntil: Date | null;
    purgedAt: Date | null;
    source?: {
      id: string;
      organizationId: string;
      currentSnapshotId?: string | null;
      desiredState: string;
      rightsState: string;
      /** `EVIDENCE` or `STYLE_REFERENCE`; see `sourceAllowed`. */
      usagePurpose?: string | null;
      robotsState: string;
      freshUntil?: Date | null;
      archivedAt: Date | null;
      purgedAt: Date | null;
    } | null;
  };
};

export type FactEvidenceCandidateV1 = {
  stance: string;
  reviewStatus: string;
  evidence: EvidenceCandidateV1;
};

export type FactCandidateV1 = {
  id: string;
  organizationId: string;
  claimKey: string;
  statement: string;
  temporalKind: string;
  status: string;
  verifiedAt: Date | null;
  freshUntil: Date | null;
  explicit?: boolean;
  lexicalScore?: number;
  evidenceLinks: FactEvidenceCandidateV1[];
};

export type ContentContextCandidatesV1 = {
  facts: FactCandidateV1[];
  evidence: EvidenceCandidateV1[];
};

export type StoredContextItemV1 = {
  ordinal: number;
  citationId: string;
  factId: string | null;
  evidenceId: string | null;
  inclusionReason: string;
  statementHash: string | null;
  excerptHash: string | null;
  factStatement: string | null;
  factTemporalKind: string | null;
  factVerifiedAt: Date | null;
  factFreshUntil: Date | null;
  factEvidenceCitationIds: string[] | null;
  tombstone: string | null;
  fact?: FactCandidateV1 | null;
  evidence?: EvidenceCandidateV1 | null;
};

export type StoredContextSnapshotV1 = {
  id: string;
  organizationId: string;
  contractVersion: 'content-context/v1';
  consumer: ContentContextBuildRequestV1['consumer'];
  purpose: ContentContextBuildRequestV1['purpose'];
  queryHash: string;
  language: ContentContextBuildRequestV1['language'];
  freshnessMode: ContentContextBuildRequestV1['freshnessMode'];
  asOf: Date;
  builtAt: Date;
  expiresAt: Date;
  status: ContentContextEnvelopeV1['status'];
  generationPolicy: ContentContextEnvelopeV1['generationPolicy'];
  brandProfileVersionId: string | null;
  profileContentDigest: string | null;
  profileFallbackReason: string | null;
  selectionAlgorithmVersion: number;
  trustPolicyVersion: number;
  freshnessPolicyVersion: number;
  maxFacts: number;
  maxEvidence: number;
  maxRenderedCharacters: number;
  selectedFactCount: number;
  selectedEvidenceCount: number;
  rejectedCount: number;
  rejectionReasons: Array<{ itemId: string; reason: string }>;
  invalidatedAt?: Date | null;
  profile?: ResolvedBrandProfileContextV1;
  brandProfileVersion?: {
    id: string;
    versionNumber: number;
    contentDigest: string;
  } | null;
  items: StoredContextItemV1[];
};

export type ContentContextSnapshotCreateV1 = Omit<
  StoredContextSnapshotV1,
  'id' | 'organizationId' | 'items' | 'brandProfileVersion'
>;

export interface ContentContextRepositoryPortV1 {
  findCandidates(
    organizationId: string,
    request: ContentContextBuildInputV1
  ): Promise<ContentContextCandidatesV1>;
  createSnapshot(
    organizationId: string,
    snapshot: ContentContextSnapshotCreateV1,
    items: StoredContextItemV1[]
  ): Promise<StoredContextSnapshotV1>;
  getSnapshot(
    organizationId: string,
    id: string
  ): Promise<StoredContextSnapshotV1 | null>;
}

export interface BrandProfileContextPortV1 {
  resolve(
    organizationId: string,
    selection?: BrandProfileSelectionV1,
    provider?: string
  ): Promise<ResolvedBrandProfileContextV1>;
}
