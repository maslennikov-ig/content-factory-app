import type { EvidenceFindingV1, ExperimentV1, MeasurementObservationV1 } from '../measurement/measurement.types';
import { activeObservation, OBSERVATION_RETENTION_MS } from '../measurement/measurement.types';

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const variance = (values: number[], average: number) =>
  values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);

/** Repeated collection is one publication, never a larger sample. No causal claim is generated. */
export function evaluateExperiment(
  experiment: ExperimentV1, observations: MeasurementObservationV1[], now: Date
): { state: 'insufficient' | 'incomparable' | 'inconclusive'; reason: string } | { state: 'finding'; finding: EvidenceFindingV1 } {
  if (experiment.status === 'withdrawn' || Date.parse(experiment.endsAt) < now.getTime() - OBSERVATION_RETENTION_MS)
    return { state: 'insufficient', reason: 'experiment_expired_or_withdrawn' };
  const ids = new Set([...experiment.baseline.itemIds, ...experiment.candidate.itemIds]);
  const latest = new Map<string, MeasurementObservationV1>();
  const wantedAge = experiment.comparisonWindowHours * 3600;
  const matching = observations.filter((value) => ids.has(value.itemId) && value.channelId === experiment.channelId &&
    value.metric === experiment.metric && value.availability === 'available' && value.value !== null &&
    Number.isFinite(value.value) && value.derivationAllowed && activeObservation(value, now));
  for (const value of matching) {
    if (Math.abs(value.window.ageSeconds - wantedAge) > wantedAge * 0.1) continue;
    if (!latest.has(value.itemId) || value.observedAt > latest.get(value.itemId)!.observedAt) latest.set(value.itemId, value);
  }
  const a = experiment.baseline.itemIds.map((id) => latest.get(id)).filter(Boolean) as MeasurementObservationV1[];
  const b = experiment.candidate.itemIds.map((id) => latest.get(id)).filter(Boolean) as MeasurementObservationV1[];
  if (a.length < 3 || b.length < 3) return { state: 'insufficient', reason: 'need_three_distinct_publications_per_variant_at_comparable_age' };
  const all = [...a, ...b];
  const signature = (v: MeasurementObservationV1) => `${v.platform}/${v.accountId}/${v.source}/${v.unit}/${v.window.kind}/${v.access}`;
  if (new Set(all.map(signature)).size !== 1 || (experiment.dimension !== 'format' && new Set(all.map((v) => v.format)).size !== 1))
    return { state: 'incomparable', reason: 'platform_account_format_source_or_window_mismatch' };
  const baseline = mean(a.map((v) => v.value!));
  const candidate = mean(b.map((v) => v.value!));
  const standardError = Math.sqrt(variance(a.map((v) => v.value!), baseline) / a.length + variance(b.map((v) => v.value!), candidate) / b.length);
  const difference = candidate - baseline;
  // Conservative descriptive screen, not a significance or causality test. Tiny/noisy effects stay inconclusive.
  if (Math.abs(difference) <= Math.max(2.776 * standardError, Math.abs(baseline) * 0.1) ||
    (experiment.objective === 'maximize' ? difference <= 0 : difference >= 0))
    return { state: 'inconclusive', reason: 'effect_small_noisy_or_candidate_not_better' };
  const evidenceExpiry = Math.min(...all.map((v) => Date.parse(v.expiresAt)), now.getTime() + OBSERVATION_RETENTION_MS);
  return { state: 'finding', finding: {
    version: 1, id: `finding:${experiment.id}`, channelIds: [experiment.channelId],
    statement: `${experiment.candidate.label}: observed ${experiment.metric} mean ${candidate.toFixed(2)} versus ${baseline.toFixed(2)} for ${experiment.baseline.label}. Test this choice again; allocation and audience effects remain possible.`,
    status: 'proposed', uncertainty: 'Observational association; small non-randomized samples, audience and timing can confound results. No guaranteed uplift.',
    observationIds: all.map((v) => v.id), sourceIds: [...new Set(all.flatMap((v) => v.evidence.map((e) => e.sourceId!).filter(Boolean)))],
    expiresAt: new Date(evidenceExpiry).toISOString(), interpretation: 'association', experimentId: experiment.id,
    sampleSize: all.length, computedAt: now.toISOString(), explorationShare: 0.25,
    comparison: { metric: experiment.metric, baseline, candidate, baselineCount: a.length, candidateCount: b.length },
  } };
}
