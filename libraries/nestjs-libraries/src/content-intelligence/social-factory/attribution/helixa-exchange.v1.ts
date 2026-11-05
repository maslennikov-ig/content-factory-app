import { z } from 'zod';
/** Matches Helixa commit b3e06e700, native session-authorized exchange, not its fixture bridge. */
export const HELIXA_EXCHANGE_PROTOCOL = 'helixa.content-factory.exchange.v1' as const;
const id = z.string().trim().min(1).max(240);
const iso = z.string().datetime({ offset: true });
export const helixaFeedbackEvidenceSchema = z.object({ id, organizationId: id, sourceDomain: z.literal('content'), sourceId: id,
  sourceRevisionId: id, artifactId: id, evidenceHash: z.string().regex(/^[a-f0-9]{64}$/), policyRevision: id,
  providerPermissionRequired: z.literal(false), governanceSourceId: id.optional(), fragmentId: id.optional() }).strict();
const command = { commandId: id, occurredAt: iso };
const trackingField = z.object({ fieldRef: z.string().min(1).max(256), value: z.string().min(1).max(500) }).strict();
export const helixaTrackingMatchSchema = z.object({ contractVersion: z.literal('content-factory.crm-tracking.v1'),
  linkId: z.string().regex(/^[a-f0-9]{64}$/), level: z.enum(['post','campaign','account']), sourceId: id,
  fields: z.object({ link: trackingField, campaign: trackingField, source: trackingField, medium: trackingField, content: trackingField.optional() }).strict(),
}).strict().superRefine((value, context) => {
  const fields = Object.values(value.fields);
  if (value.fields.link.value !== value.linkId || new Set(fields.map((field) => field.fieldRef)).size !== fields.length)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Tracking identity must be exact and fields distinct.' });
  if (value.level === 'post' && !value.fields.content)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields','content'], message: 'Post attribution requires exact content identity.' });
});
const helixaProposalRequestSchema = z.object({ protocol: z.literal(HELIXA_EXCHANGE_PROTOCOL), expectedOrganizationId: id,
  operation: z.literal('knowledge.propose'), projectId: id, ...command, validTo: iso,
  basedOn: z.object({ claimId: id, revision: z.number().int().positive() }).strict(), statement: z.string().min(1).max(20000),
  feedbackEvidence: z.array(helixaFeedbackEvidenceSchema).min(1).max(10), sensitive: z.boolean().default(true) }).strict();
const nativeRequestSchema = z.discriminatedUnion('operation', [
  z.object({ protocol: z.literal(HELIXA_EXCHANGE_PROTOCOL), expectedOrganizationId: id, operation: z.literal('knowledge.read'), projectId: id.optional(), claimIds: z.array(id).min(1).max(50) }).strict(),
  z.object({ protocol: z.literal(HELIXA_EXCHANGE_PROTOCOL), expectedOrganizationId: id, operation: z.literal('crm.outcomes.read'), projectId: id, recordIds: z.array(id).min(1).max(50), trackingMatch: helixaTrackingMatchSchema.optional() }).strict(),
  helixaProposalRequestSchema,
  z.object({ protocol: z.literal(HELIXA_EXCHANGE_PROTOCOL), expectedOrganizationId: id, operation: z.literal('knowledge.invalidate'), projectId: id.optional(), ...command,
    claimId: id, expectedRevision: z.number().int().positive(), reason: z.string().min(1).max(2000) }).strict(),
]);
export const helixaRequestSchema = nativeRequestSchema.superRefine((value, context) => {
  if (value.operation === 'knowledge.propose') {
    const duration = Date.parse(value.validTo) - Date.parse(value.occurredAt);
    if (duration <= 0 || duration > 30 * 86400000) context.addIssue({ code: z.ZodIssueCode.custom, path: ['validTo'], message: 'Feedback validity must be positive and no longer than 30 days.' });
  }
});
export type HelixaRequestV1 = z.infer<typeof helixaRequestSchema>;
export type HelixaNativeOperationRequestV1 = HelixaRequestV1 extends infer T ? T extends unknown ? Omit<T, 'expectedOrganizationId'> : never : never;
type WithoutTenantFence<T> = T extends unknown ? Omit<T, 'expectedOrganizationId' | 'trackingMatch'> : never;
/** The reviewed binding supplies the fence, never model-visible request input. */
export type HelixaOperationRequestV1 = WithoutTenantFence<HelixaRequestV1>;
export type HelixaFindingProposalInputV1 = Omit<z.infer<typeof helixaProposalRequestSchema>, 'expectedOrganizationId'>;
const unavailable = z.object({ id, status: z.literal('unavailable'), eraseCurrentCopy: z.literal(true) }).strict();
const evidence = z.object({ id, organizationId: id, sourceDomain: z.string(), sourceId: id, artifactId: id,
  policyRevision: id, evidenceHash: z.string().regex(/^[a-f0-9]{64}$/), sourceRevisionId: id.optional() }).passthrough();
const claim = z.object({ id, status: z.literal('available'), revision: z.number().int().positive(), statement: z.string().max(20000),
  sensitive: z.boolean(), validFrom: iso, validTo: iso.nullable(), evidence: z.array(evidence).min(1), cache: z.literal('revalidate_before_use') }).strict();
const trackingAttribution = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unavailable'), reason: z.literal('canonical_tracking_link_absent') }).strict(),
  z.object({ status: z.literal('available'), contractVersion: z.literal('content-factory.crm-tracking.v1'),
    linkId: z.string().regex(/^[a-f0-9]{64}$/), level: z.enum(['post','campaign','account']), method: z.literal('exact_source_attributes'),
    provenance: z.object({ organizationId: id, projectId: id, recordId: id, sourceId: id, providerRecordRef: id, evidenceRef: id, sourceRevision: id }).strict(),
    fields: z.array(trackingField.extend({ sourceEvidence: z.object({ sourceId: id, providerRecordRef: id, evidenceRef: id, sourceRevision: id }).strict().optional() })).min(4).max(5),
  }).strict(),
]);
const outcome = z.object({ id, status: z.literal('available'), revision: z.number().int().positive(),
  statusClass: z.enum(['open','won','lost','done','cancelled','not_applicable','unknown']),
  attributionSourceRef: z.string().nullable(), attributionSourceSemantics: z.literal('crm_lead_source'),
  trackingAttribution,
  openedAt: iso.nullable(), closedAt: iso.nullable(), effectiveAt: iso, observedAt: iso,
  dealValue: z.object({ amountMinor: z.number().int().safe(), currency: z.string().regex(/^[A-Z]{3}$/),
    provenance: z.object({ currencySource: z.string(), currencyEvidenceRef: z.string(), currencyObservedAt: iso,
      minorUnitSource: z.string(), minorUnitSourceVersion: z.string() }).strict() }).strict().nullable(),
  payment: z.object({ status: z.literal('unavailable'), reason: z.literal('canonical_payment_evidence_absent') }).strict(),
  provenance: z.object({ sourceId: z.string(), providerRecordRef: z.string(), evidenceRef: z.string(), sourceRevision: z.string() }).strict(),
  cache: z.literal('revalidate_before_use') }).strict();
export const helixaResponseSchema = z.discriminatedUnion('operation', [
  z.object({ protocol: z.literal(HELIXA_EXCHANGE_PROTOCOL), organizationId: id, operation: z.literal('knowledge.read'), data: z.object({ claims: z.array(z.union([claim,unavailable])).max(50) }).strict() }).strict(),
  z.object({ protocol: z.literal(HELIXA_EXCHANGE_PROTOCOL), organizationId: id, operation: z.literal('crm.outcomes.read'), data: z.object({ outcomes: z.array(z.union([outcome,unavailable])).max(50) }).strict() }).strict(),
  z.object({ protocol: z.literal(HELIXA_EXCHANGE_PROTOCOL), organizationId: id, operation: z.literal('knowledge.propose'), data: z.object({ id, revision: z.number().int().positive(), reviewState: z.literal('candidate') }).strict() }).strict(),
  z.object({ protocol: z.literal(HELIXA_EXCHANGE_PROTOCOL), organizationId: id, operation: z.literal('knowledge.invalidate'), data: z.object({ id, revision: z.number().int().positive(), status: z.literal('unavailable'), eraseCurrentCopy: z.literal(true) }).strict() }).strict(),
]);
export type HelixaResponseV1 = z.infer<typeof helixaResponseSchema>;
