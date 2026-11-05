import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { SocialFactoryRepository, SocialFactoryError } from '../social-factory.repository';
import { SocialFactoryLearningService } from '../learning/learning.service';
import type { EvidenceFindingV1 } from '../measurement/measurement.types';
import { environmentHelixaBinding, helixaTrackingBindingSchema, SOCIAL_FACTORY_HELIXA_BINDING, SOCIAL_FACTORY_HELIXA_FETCH, SOCIAL_FACTORY_HELIXA_CLOCK, type HelixaBindingResolver, type HelixaSessionBinding } from './helixa-binding';
import { HELIXA_EXCHANGE_PROTOCOL, helixaRequestSchema, helixaResponseSchema, type HelixaOperationRequestV1, type HelixaNativeOperationRequestV1, type HelixaFindingProposalInputV1, type HelixaResponseV1 } from './helixa-exchange.v1';
import { SocialFactoryAttributionService } from './attribution.service';

@Injectable()
export class SocialFactoryHelixaExchangeService {
  constructor(private readonly store: SocialFactoryRepository, private readonly learning: SocialFactoryLearningService,
    @Optional() @Inject(SOCIAL_FACTORY_HELIXA_BINDING) private readonly bindingFor: HelixaBindingResolver = environmentHelixaBinding,
    @Optional() @Inject(SOCIAL_FACTORY_HELIXA_FETCH) private readonly fetcher: typeof fetch = fetch,
    @Optional() @Inject(SOCIAL_FACTORY_HELIXA_CLOCK) private readonly clock: () => Date = () => new Date(),
    @Optional() private readonly attribution?: SocialFactoryAttributionService) {}

  /** Never cache company/CRM text or serve a previous response on failure. Every use revalidates native rights. */
  async exchange(organizationId: string, raw: HelixaOperationRequestV1): Promise<
    { status: 'available'; response: HelixaResponseV1 } | { status: 'not_connected' | 'unavailable' | 'denied'; reason: string; eraseCurrentCopy: true }
  > {
    if (raw && 'trackingMatch' in raw) throw new SocialFactoryError('HELIXA_TRACKING_SERVER_CONTEXT_REQUIRED', undefined, 422);
    return this.exchangeNative(organizationId, raw);
  }

  /** The caller selects only an existing local link; reviewed configuration owns field identities. */
  async readAttributedOutcomes(organizationId: string, linkId: string, input: { projectId: string; recordIds: string[] }) {
    const binding = await this.bindingFor(organizationId);
    if (!binding) return { status: 'not_connected' as const, reason: 'explicit_scoped_helixa_session_binding_required', eraseCurrentCopy: true as const };
    const mapping = helixaTrackingBindingSchema.safeParse(binding?.crmTracking);
    const unavailable = (reason: string) => ({ status: 'unavailable' as const, reason, eraseCurrentCopy: true as const });
    if (!mapping.success || !this.attribution) return unavailable('reviewed_crm_tracking_mapping_required');
    if (binding.contentFactoryOrganizationId !== organizationId || binding.projectId !== input.projectId ||
      !binding.approvedOperations.includes('crm.outcomes.read') || Date.parse(binding.expiresAt) <= this.clock().getTime())
      return { status: 'denied' as const, reason: 'helixa_binding_scope_mismatch', eraseCurrentCopy: true as const };
    const current = await this.attribution.trackingEvidence(organizationId, linkId, this.clock());
    if (current.status !== 'available') return unavailable(current.reason);
    if (current.link.level === 'post' && !mapping.data.fields.content) return unavailable('reviewed_crm_tracking_content_field_required');
    const fields = {
      link: { fieldRef: mapping.data.fields.link, value: current.fields.link },
      campaign: { fieldRef: mapping.data.fields.campaign, value: current.fields.campaign },
      source: { fieldRef: mapping.data.fields.source, value: current.fields.source },
      medium: { fieldRef: mapping.data.fields.medium, value: current.fields.medium },
      ...(current.link.level === 'post' ? { content: { fieldRef: mapping.data.fields.content!, value: current.fields.content! } } : {}),
    };
    const result = await this.exchangeNative(organizationId, { protocol: HELIXA_EXCHANGE_PROTOCOL, operation: 'crm.outcomes.read',
      projectId: input.projectId, recordIds: input.recordIds, trackingMatch: { contractVersion: 'content-factory.crm-tracking.v1',
        linkId: current.link.id, level: current.link.level, sourceId: mapping.data.sourceId, fields } }, binding);
    if (result.status !== 'available') return result;
    const fresh = await this.attribution.trackingEvidence(organizationId, linkId, this.clock());
    if (fresh.status !== 'available' || fresh.link.level !== current.link.level ||
      JSON.stringify(fresh.fields) !== JSON.stringify(current.fields)) return unavailable('current_tracking_link_changed');
    return result;
  }

  private async exchangeNative(organizationId: string, raw: HelixaNativeOperationRequestV1, reviewedBinding?: HelixaSessionBinding): Promise<
    { status: 'available'; response: HelixaResponseV1 } | { status: 'not_connected' | 'unavailable' | 'denied'; reason: string; eraseCurrentCopy: true }
  > {
    const binding = reviewedBinding ?? await this.bindingFor(organizationId);
    if (!binding) return { status: 'not_connected', reason: 'explicit_scoped_helixa_session_binding_required', eraseCurrentCopy: true };
    const parsed = helixaRequestSchema.safeParse({ ...raw, expectedOrganizationId: binding.helixaOrganizationId });
    if (!parsed.success) throw new SocialFactoryError('HELIXA_REQUEST_INVALID', undefined, 422);
    const request = parsed.data;
    if (binding.contentFactoryOrganizationId !== organizationId || binding.projectId !== request.projectId ||
      !binding.approvedOperations.includes(request.operation) || Date.parse(binding.expiresAt) <= this.clock().getTime())
      return { status: 'denied', reason: 'helixa_binding_scope_mismatch', eraseCurrentCopy: true };
    if (request.operation === 'knowledge.propose' && request.feedbackEvidence.some((v) => v.organizationId !== binding.helixaOrganizationId))
      return { status: 'denied', reason: 'helixa_feedback_tenant_mismatch', eraseCurrentCopy: true };
    try {
      const body = JSON.stringify(request);
      if (Buffer.byteLength(body) > 131072) throw new Error('bounded_request');
      const response = await this.fetcher(`${binding.origin}/api/content-factory/exchange/v1`, { method: 'POST',
        headers: { 'content-type': 'application/json', cookie: binding.sessionCookie }, body,
        signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' });
      if (!response.ok) return { status: response.status === 403 ? 'denied' : 'unavailable', reason: 'helixa_native_operation_unavailable', eraseCurrentCopy: true };
      const reader = response.body?.getReader();
      if (!reader) throw new Error('empty_response');
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
          if (size > 262144) { await reader.cancel(); throw new Error('bounded_response'); } chunks.push(value); }
      } finally { reader.releaseLock(); }
      const bytes = Buffer.concat(chunks.map((v) => Buffer.from(v)));
      const result = helixaResponseSchema.safeParse(JSON.parse(bytes.toString('utf8')));
      if (!result.success || result.data.organizationId !== binding.helixaOrganizationId || result.data.operation !== request.operation) throw new Error('invalid_native_response');
      const resultIds = result.data.operation === 'knowledge.read' ? result.data.data.claims.map((v) => v.id) :
        result.data.operation === 'crm.outcomes.read' ? result.data.data.outcomes.map((v) => v.id) : null;
      const requestedIds = request.operation === 'knowledge.read' ? request.claimIds : request.operation === 'crm.outcomes.read' ? request.recordIds : null;
      if (requestedIds && (resultIds!.length !== requestedIds.length || resultIds!.some((id, i) => id !== requestedIds[i]))) throw new Error('native_resource_mismatch');
      if (result.data.operation === 'knowledge.read' && result.data.data.claims.some((claim) => claim.status === 'available' &&
        ((claim.validTo && Date.parse(claim.validTo) <= this.clock().getTime()) || claim.evidence.some((e) => e.organizationId !== binding.helixaOrganizationId)))) throw new Error('stale_or_foreign_claim');
      if (result.data.operation === 'knowledge.invalidate' && request.operation === 'knowledge.invalidate' && result.data.data.id !== request.claimId) throw new Error('native_mutation_mismatch');
      if (result.data.operation === 'crm.outcomes.read' && request.operation === 'crm.outcomes.read') {
        for (const outcome of result.data.data.outcomes) {
          if (outcome.status !== 'available' || outcome.trackingAttribution.status !== 'available') continue;
          const proof = outcome.trackingAttribution, expected = request.trackingMatch;
          const fields = expected ? Object.values(expected.fields) : [];
          if (!expected || proof.linkId !== expected.linkId || proof.level !== expected.level ||
            proof.provenance.organizationId !== binding.helixaOrganizationId || proof.provenance.projectId !== request.projectId ||
            proof.provenance.recordId !== outcome.id || proof.provenance.sourceId !== expected.sourceId ||
            Object.entries(outcome.provenance).some(([key, value]) => proof.provenance[key as keyof typeof outcome.provenance] !== value) ||
            proof.fields.length !== fields.length || new Set(proof.fields.map((field) => field.fieldRef)).size !== fields.length ||
            fields.some((field) => !proof.fields.some((actual) => actual.fieldRef === field.fieldRef && actual.value === field.value)) ||
            proof.fields.some((field) => field.sourceEvidence && field.sourceEvidence.providerRecordRef !== proof.provenance.providerRecordRef))
            throw new Error('native_tracking_receipt_mismatch');
        }
      }
      return { status: 'available', response: result.data };
    } catch { return { status: 'unavailable', reason: 'helixa_fresh_evidence_unavailable', eraseCurrentCopy: true }; }
  }

  async prepareFindingFeedback(organizationId: string, findingId: string, now = this.clock()) {
    const finding = await this.store.read<EvidenceFindingV1>(organizationId, 'finding', findingId);
    if (!finding || finding.payload.status !== 'accepted') throw new SocialFactoryError('HELIXA_ACCEPTED_FINDING_REQUIRED', undefined, 422);
    const current = await this.learning.forPlanning(organizationId, finding.payload.channelIds[0], now);
    if (!current.findingIds.includes(findingId)) throw new SocialFactoryError('HELIXA_FINDING_EVIDENCE_UNAVAILABLE', undefined, 422);
    const document = JSON.stringify({ protocol: 'content-factory.finding-feedback.v1', findingId, revision: finding.revision,
      statement: finding.payload.statement, uncertainty: finding.payload.uncertainty, interpretation: finding.payload.interpretation,
      observationIds: finding.payload.observationIds, sourceIds: finding.payload.sourceIds, expiresAt: finding.payload.expiresAt });
    return { document, sha256: createHash('sha256').update(document).digest('hex'), mimeType: 'application/json',
      findingRevision: finding.revision, expiresAt: finding.payload.expiresAt, registrationRequired: true, statement: finding.payload.statement };
  }

  /** Resolve the external tenant only from the reviewed binding, never from agent arguments. */
  async proposeRegisteredFinding(organizationId: string, findingId: string, input: Pick<HelixaFindingProposalInputV1, 'projectId'|'commandId'|'occurredAt'|'basedOn'|'sensitive'> & { feedbackEvidence: Omit<HelixaFindingProposalInputV1['feedbackEvidence'][number], 'organizationId'>[] }) {
    const binding = await this.bindingFor(organizationId);
    if (!binding) return {status:'not_connected' as const,reason:'explicit_scoped_helixa_session_binding_required',eraseCurrentCopy:true as const};
    const prepared = await this.prepareFindingFeedback(organizationId, findingId);
    return this.proposeFinding(organizationId, findingId, {...input,protocol:HELIXA_EXCHANGE_PROTOCOL,operation:'knowledge.propose',statement:prepared.statement,validTo:prepared.expiresAt,
      feedbackEvidence:input.feedbackEvidence.map(value=>({...value,organizationId:binding.helixaOrganizationId}))});
  }
  async proposeFinding(organizationId: string, findingId: string, input: HelixaFindingProposalInputV1) {
    const prepared = await this.prepareFindingFeedback(organizationId, findingId);
    if (!input.feedbackEvidence?.length || input.feedbackEvidence.some((v) => v.evidenceHash !== prepared.sha256))
      return { status: 'unavailable' as const, reason: 'exact_finding_artifact_registration_required', eraseCurrentCopy: true as const };
    return this.exchange(organizationId, { ...input, protocol: HELIXA_EXCHANGE_PROTOCOL, operation: 'knowledge.propose', statement: prepared.statement, validTo: prepared.expiresAt });
  }
}
