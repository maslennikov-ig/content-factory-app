import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SocialFactoryRepository, SocialFactoryError, sourceRef, resourceRef } from '../social-factory.repository';
import type { CampaignItemV1, SocialFactoryRecordV1 } from '../contracts/social-factory.v1';
import type { EvidenceFindingV1, ExperimentV1, MeasurementObservationV1 } from '../measurement/measurement.types';
import { activeObservation, validDate, OBSERVATION_RETENTION_MS } from '../measurement/measurement.types';
import { SocialFactoryMeasurementService } from '../measurement/measurement.service';
import { evaluateExperiment } from './evaluate-experiment';

@Injectable()
export class SocialFactoryLearningService {
  constructor(private readonly store: SocialFactoryRepository, private readonly measurement: SocialFactoryMeasurementService) {}

  async proposeExperiment(organizationId: string, input: Omit<ExperimentV1, 'version' | 'id' | 'createdAt' | 'status'>, now = new Date()) {
    const dimensions = ['topic', 'hook', 'format', 'length', 'timing', 'cta'];
    if (!dimensions.includes(input.dimension) || !input.channelId || !input.metric || input.metric.length > 100 ||
      !['maximize', 'minimize'].includes(input.objective) || !validDate(input.endsAt) ||
      Date.parse(input.endsAt) <= now.getTime() || Date.parse(input.endsAt) > now.getTime() + OBSERVATION_RETENTION_MS ||
      ![24, 48, 72, 168].includes(input.comparisonWindowHours)) throw new SocialFactoryError('EXPERIMENT_INVALID', undefined, 422);
    const groups = [input.baseline, input.candidate];
    if (groups.some((g) => !g?.label || g.label.length > 300 || !Array.isArray(g.itemIds) || g.itemIds.length < 3 || g.itemIds.length > 20))
      throw new SocialFactoryError('EXPERIMENT_BOUNDED_GROUPS_REQUIRED', undefined, 422);
    const ids = groups.flatMap((g) => g.itemIds);
    if (new Set(ids).size !== ids.length) throw new SocialFactoryError('EXPERIMENT_OVERLAPPING_ITEMS', undefined, 422);
    for (const id of ids) {
      const item = await this.store.read<CampaignItemV1>(organizationId, 'campaign_item', id);
      if (!item || item.payload.channelId !== input.channelId) throw new SocialFactoryError('EXPERIMENT_SCOPE_MISMATCH', undefined, 422);
      if (item.payload.publication) throw new SocialFactoryError('EXPERIMENT_MUST_BE_PLANNED_BEFORE_PUBLICATION', undefined, 422);
    }
    const payload: ExperimentV1 = { ...input, version: 1, id: randomUUID(), createdAt: now.toISOString(), status: 'planned' };
    await this.store.put({ organizationId, kind: 'experiment', id: payload.id, parentId: input.channelId, payload, expectedRevision: 0,
      expiresAt: new Date(Date.parse(input.endsAt) + OBSERVATION_RETENTION_MS), sourceIds: ids.map((id) => resourceRef('campaign_item', id)) });
    return payload;
  }

  async evaluate(organizationId: string, experimentId: string, now = new Date()) {
    const experiment = await this.store.read<ExperimentV1>(organizationId, 'experiment', experimentId);
    if (!experiment) throw new SocialFactoryError('EXPERIMENT_NOT_FOUND', undefined, 404);
    const existing = await this.store.read<EvidenceFindingV1>(organizationId, 'finding', `finding:${experimentId}`);
    if (existing?.payload.status === 'withdrawn') return { state: 'withdrawn' as const, finding: existing.payload };
    const evidence = await this.measurement.validObservations(organizationId, [...experiment.payload.baseline.itemIds, ...experiment.payload.candidate.itemIds], now);
    const result = evaluateExperiment(experiment.payload, evidence, now);
    if (result.state !== 'finding') {
      if (existing?.payload.status === 'accepted') await this.store.put({ organizationId, kind: 'finding', id: existing.id, expectedRevision: existing.revision,
        payload: { ...existing.payload, status: 'withdrawn', uncertainty: `Recomputation no longer supports this preference: ${result.reason}` },
        sourceIds: existing.sourceIds, expiresAt: new Date(existing.payload.expiresAt), parentId: existing.parentId ?? undefined });
      return result;
    }
    const fingerprint = createHash('sha256').update(JSON.stringify({
      observationIds: [...result.finding.observationIds].sort(), sourceIds: [...result.finding.sourceIds].sort(),
      comparison: result.finding.comparison, statement: result.finding.statement, experimentId,
    })).digest('hex');
    if (existing?.payload.evidenceFingerprint === fingerprint) return { state: 'finding' as const, finding: existing.payload };
    result.finding.evidenceFingerprint = fingerprint;
    // Recompute changes evidence and returns the recommendation to proposed; accepted revisions are not silently replaced.
    await this.store.put({ organizationId, kind: 'finding', id: result.finding.id, parentId: experiment.payload.channelId,
      payload: result.finding, expectedRevision: existing?.revision ?? 0, expiresAt: new Date(result.finding.expiresAt),
      sourceIds: [resourceRef('experiment', experimentId), ...result.finding.observationIds.map((id) => resourceRef('observation', id)), ...result.finding.sourceIds.map(sourceRef)] });
    return result;
  }

  async review(organizationId: string, findingId: string, expectedRevision: number, action: 'accept' | 'withdraw', now = new Date()) {
    const row = await this.store.read<EvidenceFindingV1>(organizationId, 'finding', findingId);
    if (!row || row.revision !== expectedRevision) throw new SocialFactoryError('FINDING_REVISION_CONFLICT');
    if (action !== 'accept' && action !== 'withdraw') throw new SocialFactoryError('FINDING_REVIEW_INVALID', undefined, 422);
    if (action === 'accept' && !(await this.usable(organizationId, row, now))) throw new SocialFactoryError('FINDING_EVIDENCE_UNAVAILABLE');
    return this.store.put({ organizationId, kind: 'finding', id: findingId, expectedRevision,
      payload: { ...row.payload, status: action === 'accept' ? 'accepted' : 'withdrawn' },
      sourceIds: row.sourceIds, expiresAt: new Date(row.payload.expiresAt), parentId: row.parentId ?? undefined });
  }

  private async usable(organizationId: string, row: SocialFactoryRecordV1<EvidenceFindingV1>, now: Date) {
    if (!validDate(row.payload.expiresAt) || Date.parse(row.payload.expiresAt) <= now.getTime() || row.payload.sampleSize < 6) return false;
    const observations: MeasurementObservationV1[] = [];
    for (const id of row.payload.observationIds) {
      const evidence = await this.store.read<MeasurementObservationV1>(organizationId, 'observation', id);
      if (!evidence || !activeObservation(evidence.payload, now) || !evidence.payload.derivationAllowed) return false;
      observations.push(evidence.payload);
    }
    const current = await this.measurement.validObservations(organizationId, observations.map((o) => o.itemId), now);
    return observations.length > 0 && observations.every((o) => current.some((v) => v.id === o.id && v.derivationAllowed));
  }

  /** Discovery/campaign planning must call this port and persist the returned finding ids. */
  async forPlanning(organizationId: string, channelId: string, now = new Date()) {
    await this.store.purgeExpired(organizationId, now);
    const findings: EvidenceFindingV1[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.store.page<EvidenceFindingV1>(organizationId, 'finding', { parentId: channelId, cursor, limit: 100 });
      for (const row of page.items) if (row.payload.status === 'accepted' && row.payload.channelIds.includes(channelId) && await this.usable(organizationId, row, now)) findings.push(row.payload);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return { findings, findingIds: findings.map((f) => f.id), explorationShare: Math.max(0.25, ...findings.map((f) => f.explorationShare)),
      guidance: findings.length ? 'Apply accepted associations as temporary planning preferences; keep exploration and re-evaluate.' : 'No accepted outcome evidence. Use the channel brief and grounded discovery; reserve exploration.' };
  }
}
