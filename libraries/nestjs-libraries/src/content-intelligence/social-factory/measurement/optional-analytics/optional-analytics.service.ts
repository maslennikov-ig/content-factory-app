import { Inject, Injectable, Optional } from '@nestjs/common';
import type { SourceAdmissionV1 } from '../../contracts/social-factory.v1';
import type { OptionalAnalyticsDocumentV1, AuthorizedAnalyticsSourceV1, OptionalAnalyticsSourceAuthorityV1 } from './optional-analytics.types';

export const SOCIAL_FACTORY_OPTIONAL_ANALYTICS = Symbol('SOCIAL_FACTORY_OPTIONAL_ANALYTICS');
export const SOCIAL_FACTORY_OPTIONAL_ANALYTICS_AUTHORITY = Symbol('SOCIAL_FACTORY_OPTIONAL_ANALYTICS_AUTHORITY');
export interface OptionalAnalyticsConnector {
  id: string; estimatedCost: number;
  read(organizationId: string, source: AuthorizedAnalyticsSourceV1, now: Date): Promise<OptionalAnalyticsDocumentV1[]>;
}
export interface OptionalAnalyticsAdmission {
  admit(organizationId: string, connector: OptionalAnalyticsConnector): Promise<{ allowed: boolean; reason?: 'quota_limited' | 'budget_required' }>;
}
export const SOCIAL_FACTORY_OPTIONAL_ANALYTICS_ADMISSION = Symbol('SOCIAL_FACTORY_OPTIONAL_ANALYTICS_ADMISSION');

/** Subscription-free baseline is useful. Connectors only add evidence authorized by the shared source authority. */
@Injectable()
export class SocialFactoryOptionalAnalyticsService {
  constructor(@Optional() @Inject(SOCIAL_FACTORY_OPTIONAL_ANALYTICS) private readonly connectors: OptionalAnalyticsConnector[] = [],
    @Optional() @Inject(SOCIAL_FACTORY_OPTIONAL_ANALYTICS_ADMISSION) private readonly admission?: OptionalAnalyticsAdmission,
    @Optional() @Inject(SOCIAL_FACTORY_OPTIONAL_ANALYTICS_AUTHORITY) private readonly authority?: OptionalAnalyticsSourceAuthorityV1) {}
  capabilities() { return this.connectors.map((connector) => ({ id: connector.id, configured: true, estimatedCost: connector.estimatedCost, rightsRequired: true })); }

  async evidence(organizationId: string, channelId: string, sourceIds: string[], connectorId?: string, now = new Date()) {
    const none = (status: string, gap: string) => ({ status, documents: [] as OptionalAnalyticsDocumentV1[], gaps: [gap], admissions: [] as SourceAdmissionV1[], sourceAssertions: [] as { sourceId: string; sourceRevision: string; permissionRevision: string }[], baselineAvailable: true });
    const connector = this.connectors.find((value) => value.id === connectorId);
    if (!connector) return none('not_configured', 'optional_analytics_not_configured');
    if (!this.authority) return none('rights_unsupported', 'shared_source_authority_unavailable');
    if (!Number.isFinite(connector.estimatedCost) || connector.estimatedCost < 0 || (connector.estimatedCost > 0 && !this.admission)) return none('budget_required', 'cost_admission_unavailable');
    if (this.admission) {
      const admitted = await this.admission.admit(organizationId, connector);
      if (!admitted.allowed) return none(admitted.reason ?? 'quota_limited', admitted.reason ?? 'quota_limited');
    }
    const authorized = await this.authority.read(organizationId, channelId, [...new Set(sourceIds)].slice(0, 20), 'licensed_registry_export_v1');
    const documents: OptionalAnalyticsDocumentV1[] = [], gaps = authorized.gaps.map((gap) => gap.code);
    for (const source of authorized.documents) {
      if (source.evidence.access !== 'licensed' || source.evidence.rights !== 'permitted' || source.evidence.ownerScope !== organizationId ||
        source.evidence.sourceId !== source.sourceId || !['web','first_party','telegram','youtube','other'].includes(source.evidence.originPlatform ?? '') || !source.evidence.grantId || !source.permissionRevision || Date.parse(source.retainUntil) <= now.getTime()) { gaps.push('analytics_license_required'); continue; }
      const admission = authorized.admissions?.find(value => value.sourceId === source.sourceId && value.snapshotId === source.sourceRevision);
      if (!admission || !Number.isSafeInteger(admission.sourceConfigVersion) || admission.sourceConfigVersion < 1 ||
        !Number.isSafeInteger(admission.permissionRevision) || admission.permissionRevision! < 1 || !admission.rightsConfirmedAt) { gaps.push('analytics_source_admission_required'); continue; }
      // Retain actual origin; a vendor/export cannot bypass YouTube API restrictions.
      if (source.evidence.originPlatform === 'youtube') { gaps.push('youtube_comparable_use_case_not_approved'); continue; }
      try {
        const values = await connector.read(organizationId, source, now);
        if (values.some((value) => value.evidence.sourceId !== source.sourceId || value.evidence.ownerScope !== organizationId ||
          value.evidence.rights !== 'permitted' || Date.parse(value.retainUntil) <= now.getTime())) throw new Error('ANALYTICS_EVIDENCE_INVALID');
        documents.push(...values.slice(0, 20));
      } catch { gaps.push('optional_analytics_unavailable'); }
    }
    const used = new Set(documents.map((v) => v.evidence.sourceId));
    const sourceAssertions = authorized.documents.filter((source) => used.has(source.sourceId)).map(({ sourceId, sourceRevision, permissionRevision }) => ({ sourceId, sourceRevision, permissionRevision }));
    const admissions = (authorized.admissions ?? []).filter(stamp => used.has(stamp.sourceId)).map(stamp => ({ ...stamp }));
    return { status: documents.length ? 'available' : 'unavailable', documents, gaps, admissions, sourceAssertions, baselineAvailable: true };
  }
}
