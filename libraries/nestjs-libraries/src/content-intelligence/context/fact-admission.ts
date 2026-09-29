/**
 * Whether a fact's own record lets a brief stand on it now — the part of
 * `ContentContextBuilder.build`'s admission rule that reads the fact alone:
 * its status, its confirmation and the day it holds until.
 *
 * One function for the builder and for the chat's `inWork` (review W4-24 F5),
 * so the chat never says "in work" about a fact the next text will refuse.
 * The builder then also weighs the fact's evidence (an accepted
 * contradiction, a support that went stale or lost its source); a fact that
 * stands on the person's own word has none to weigh.
 *
 * `null` — admitted by its own record; otherwise the builder's reason.
 */
export type FactAdmissionRefusal = 'CONFLICTED' | 'UNVERIFIED' | 'STALE';

export const factRecordAdmission = (
  fact: {
    status: string;
    verifiedAt?: Date | string | null;
    freshUntil?: Date | string | null;
  },
  asOf: Date
): FactAdmissionRefusal | null => {
  if (fact.status === 'CONFLICTED') return 'CONFLICTED';
  if (fact.status !== 'VERIFIED' || !fact.verifiedAt) return 'UNVERIFIED';
  if (fact.freshUntil && new Date(fact.freshUntil).getTime() < asOf.getTime()) {
    return 'STALE';
  }
  return null;
};
