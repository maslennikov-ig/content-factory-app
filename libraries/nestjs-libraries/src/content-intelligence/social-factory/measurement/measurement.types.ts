import type { PerformanceObservationV1, LearningFindingV1 } from '../contracts/social-factory.v1';

/** Domain lifecycle envelope; shared wire fields remain in the versioned contract. */
export interface MeasurementObservationV1 extends PerformanceObservationV1 {
  channelId: string;
  accountId: string;
  access: 'first_party' | 'public' | 'licensed' | 'upload';
  expiresAt: string;
  authorizationCheckedAt: string;
  derivationAllowed: boolean;
  format: string;
  derivationGrantRevision?: number;
  window: PerformanceObservationV1['window'] & { kind: 'lifetime' | 'interval'; ageSeconds: number };
}
export interface ExperimentV1 {
  version: 1; id: string; channelId: string;
  dimension: 'topic' | 'hook' | 'format' | 'length' | 'timing' | 'cta';
  metric: string; objective: 'maximize' | 'minimize';
  baseline: { label: string; itemIds: string[] };
  candidate: { label: string; itemIds: string[] };
  comparisonWindowHours: number;
  createdAt: string; endsAt: string;
  status: 'planned' | 'evaluated' | 'withdrawn';
}
export interface EvidenceFindingV1 extends LearningFindingV1 {
  evidenceFingerprint?: string;
  experimentId: string;
  sampleSize: number;
  computedAt: string;
  explorationShare: number;
  comparison: { metric: string; baseline: number; candidate: number; baselineCount: number; candidateCount: number };
}
export const OBSERVATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const validDate = (value: string) => Number.isFinite(Date.parse(value));
export const activeObservation = (value: MeasurementObservationV1, now: Date) =>
  value.version === 1 && validDate(value.expiresAt) && Date.parse(value.expiresAt) > now.getTime() &&
  value.evidence.length > 0 && value.evidence.every((source) => !!source.sourceId && source.rights === 'permitted' && !source.revokedAt &&
    (!source.consentExpiresAt || (validDate(source.consentExpiresAt) && Date.parse(source.consentExpiresAt) > now.getTime())) &&
    (!source.expiresAt || (validDate(source.expiresAt) && Date.parse(source.expiresAt) > now.getTime())));
