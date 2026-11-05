import type { EvidenceV1, DiscoveryCandidateV1, SourceAdmissionV1 } from '../../contracts/social-factory.v1';
export interface AuthorizedAnalyticsSourceV1 {
  sourceId: string; title: string; text: string; evidence: EvidenceV1;
  sourceRevision: string; permissionRevision: string; retainUntil: string;
}
export interface OptionalAnalyticsDocumentV1 {
  id: string; title: string; text: string; evidence: EvidenceV1;
  origin: 'first_party' | 'web' | 'telegram' | 'youtube' | 'other'; retainUntil: string;
  performance?: DiscoveryCandidateV1['performance'];
}
export interface OptionalAnalyticsSourceAuthorityV1 {
  read(organizationId: string, channelId: string, sourceIds: string[], purpose?: string): Promise<{
    admissions?: SourceAdmissionV1[];
    documents: AuthorizedAnalyticsSourceV1[]; gaps: { sourceId?: string; code: string }[];
  }>;
}
