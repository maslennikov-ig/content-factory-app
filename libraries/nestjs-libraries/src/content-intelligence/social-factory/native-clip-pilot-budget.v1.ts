import { Prisma } from '@prisma/client';
import { digest, requireValue } from './campaign/domain';
import type { ClipDelegatedCapBasisV1, ClipDelegatedCapPublicBasisV1, ClipProductionV1 } from './contracts/native-clip-production.v1';

export const CLIP_DELEGATED_CAP_RULE_V1 = 'ceil_125pct_two_first_plus_planning_clip/v1' as const;
const quoted = (value: string) => {
  requireValue(typeof value === 'string' && /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(value), 'CLIP_DELEGATED_QUOTE_BASIS_INVALID');
  return new Prisma.Decimal(value);
};
/** Root-selected finite operational rule, never an owner-entered number or actual last-frame price. */
export function clipDelegatedCapV1(basis: ClipDelegatedCapBasisV1): string {
  requireValue(basis.rule === CLIP_DELEGATED_CAP_RULE_V1 && basis.lastFrameTerm === 'estimate_same_as_first', 'CLIP_DELEGATED_QUOTE_BASIS_INVALID');
  return Prisma.Decimal.max(1, quoted(basis.firstFrame.amount).times(2).plus(quoted(basis.clipPlanning.amount)).times('1.25').ceil()).toFixed(0);
}
export const clipDelegatedAuthorizationIdV1 = (production: ClipProductionV1, basis: ClipDelegatedCapBasisV1) => digest({source: 'delegated_quote_bound',
  contextDigest: production.contextDigest, request: production.request, basisDigest: digest(basis), pilotLimit: clipDelegatedCapV1(basis)});
export const clipDelegatedPublicBasisV1 = (basis: ClipDelegatedCapBasisV1): ClipDelegatedCapPublicBasisV1 => ({rule: basis.rule,
  firstFrameQuotedCredits: basis.firstFrame.amount, estimatedLastFrameCredits: basis.firstFrame.amount,
  clipPlanningQuotedCredits: basis.clipPlanning.amount, lastFrameTerm: 'estimate', bufferPercent: 25});
