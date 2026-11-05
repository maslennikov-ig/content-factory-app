import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import {
  parseProductionManifestV1, ProductionManifestSchemaV1, productionSceneKeyV1,
  videoProductionDigestV1, type VideoProductionManifestV1, type VideoProductionSceneV1,
} from './video-production.v1';

export const PersonalProductionFundingSchemaV2 = z.object({
  kind: z.literal('personal_subscription'),
  connections: z.object({ heygen: z.string().uuid().optional(), higgsfield: z.string().uuid().optional() }).strict(),
  finalProvider: z.enum(['heygen', 'higgsfield']).optional(),
}).strict();
export type PersonalProductionFundingV2 = z.infer<typeof PersonalProductionFundingSchemaV2>;

export const PersonalProductionCreditUnitSchemaV2 = z.enum(['heygen_credit', 'higgsfield_credit']);
export type PersonalProductionCreditUnitV2 = z.infer<typeof PersonalProductionCreditUnitSchemaV2>;

// Match the subscription connection policy's decimal range without accepting
// JavaScript numbers, scientific notation or implicit currency conversion.
const creditPattern = /^\d{1,12}(?:\.\d{1,6})?$/;
const creditAmount = z.string().refine(value => creditPattern.test(value) && new Prisma.Decimal(value).gt(0), 'VIDEO_CREDIT_LIMIT_INVALID');
export const PersonalProductionCreditLimitSchemaV2 = z.object({
  connectionId: z.string().uuid(), unit: PersonalProductionCreditUnitSchemaV2, maxCredits: creditAmount,
}).strict();
export type PersonalProductionCreditLimitV2 = z.infer<typeof PersonalProductionCreditLimitSchemaV2>;
export const PersonalProductionPreflightSchemaV2 = z.object({
  creditLimits: z.array(PersonalProductionCreditLimitSchemaV2).min(1).max(2)
    .refine(limits => new Set(limits.map(limit => limit.connectionId)).size === limits.length, 'VIDEO_PRODUCTION_CREDIT_CONNECTION_DUPLICATE'),
}).strict();
export type PersonalProductionPreflightV2 = z.infer<typeof PersonalProductionPreflightSchemaV2>;

export const PersonalProductionManifestSchemaV2 = ProductionManifestSchemaV1.omit({ version: true }).extend({
  version: z.literal(2), funding: PersonalProductionFundingSchemaV2,
}).strict().superRefine((stored, context) => {
  const { funding: _funding, version: _version, ...content } = stored;
  try { parseProductionManifestV1({ ...content, version: 1 }); }
  catch { context.addIssue({ code: z.ZodIssueCode.custom, message: 'VIDEO_PRODUCTION_INPUT_INVALID' }); }
});
export type PersonalProductionManifestV2 = z.infer<typeof PersonalProductionManifestSchemaV2>;

/** Missing connection/final-provider selection remains an explicit draft gap. */
export function personalManifestV2(manifestV1: unknown, funding: unknown): PersonalProductionManifestV2 {
  return PersonalProductionManifestSchemaV2.parse({
    ...parseProductionManifestV1(manifestV1), version: 2, funding: PersonalProductionFundingSchemaV2.parse(funding),
  });
}

export function productionContentManifestV2(storedV2: unknown): VideoProductionManifestV1 {
  const { version: _version, funding: _funding, ...content } = PersonalProductionManifestSchemaV2.parse(storedV2);
  return parseProductionManifestV1({ ...content, version: 1 });
}

export function isPersonalProductionV2(value: unknown): value is PersonalProductionManifestV2 {
  return PersonalProductionManifestSchemaV2.safeParse(value).success;
}

export function personalSceneKeyV2(rootProductionId: string, manifestV2: PersonalProductionManifestV2, scene: VideoProductionSceneV1, assetIdentities: unknown): string {
  const stored = PersonalProductionManifestSchemaV2.parse(manifestV2);
  return videoProductionDigestV1({
    version: 2, funding: stored.funding,
    contentKey: productionSceneKeyV1(rootProductionId, productionContentManifestV2(stored), scene, assetIdentities),
  });
}

const creditConnection = z.object({ connectionId: z.string().uuid(), unit: PersonalProductionCreditUnitSchemaV2 }).strict();
const creditOperation = creditConnection.extend({ amount: creditAmount }).strict();
export type PersonalProductionCreditConnectionV2 = z.infer<typeof creditConnection>;
export type PersonalProductionCreditOperationV2 = z.infer<typeof creditOperation>;
export interface PersonalProductionCreditTotalV2 {
  connectionId: string; unit: PersonalProductionCreditUnitV2; amount: string;
}

/** Pure aggregation only; current wallet identity, authority and reservation
 * admission remain the responsibility of the persisted production lane. */
export function creditTotalsV2(
  operations: readonly PersonalProductionCreditOperationV2[],
  connections: readonly PersonalProductionCreditConnectionV2[],
): PersonalProductionCreditTotalV2[] {
  const scoped = new Map<string, PersonalProductionCreditUnitV2>();
  for (const connection of z.array(creditConnection).parse(connections)) {
    if (scoped.has(connection.connectionId)) return videoErrorV1('VIDEO_PRODUCTION_CREDIT_CONNECTION_DUPLICATE');
    scoped.set(connection.connectionId, connection.unit);
  }
  // Isolated precision covers the subscription numeric range and aggregated
  // scene totals without changing Prisma.Decimal's process-wide configuration.
  const Decimal = Prisma.Decimal.clone({ precision: 40 });
  const totals = new Map<string, { connectionId: string; unit: PersonalProductionCreditUnitV2; amount: Prisma.Decimal }>();
  for (const operation of z.array(creditOperation).parse(operations)) {
    const unit = scoped.get(operation.connectionId);
    if (!unit) return videoErrorV1('VIDEO_PRODUCTION_CREDIT_CONNECTION_MISSING');
    if (operation.unit !== unit) return videoErrorV1('VIDEO_PRODUCTION_CREDIT_UNIT_MISMATCH');
    const previous = totals.get(operation.connectionId);
    totals.set(operation.connectionId, { connectionId: operation.connectionId, unit,
      amount: previous ? previous.amount.plus(operation.amount) : new Decimal(operation.amount) });
  }
  return [...totals.values()].map(total => ({ ...total, amount: total.amount.toFixed() }));
}
