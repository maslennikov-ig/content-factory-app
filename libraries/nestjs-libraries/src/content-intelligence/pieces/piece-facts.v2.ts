import type { BriefFilledFactV1, BriefFilledV1 } from '../brand-voice/voice-wiring.contract';

/** Stored in the existing brief JSON; no schema migration. */
export type PieceFactV2 = BriefFilledFactV1 & {
  kind?: 'own' | 'external' | 'found';
  status?: 'confirmed' | 'conflicting' | 'not_found' | 'unverified';
  selected?: boolean;
};
export type PieceFactSelectionV2 = { statement: string; selected: boolean };
export const factKind = (fact: PieceFactV2, inputKind?: string): 'own' | 'external' | 'found' =>
  fact.kind ?? (fact.origin === 'search' ? 'found' : fact.origin === 'person' || fact.origin === 'memory' || (fact.origin === 'input' && inputKind === 'thought') ? 'own' : 'external');
export const factStatus = (fact: PieceFactV2) => fact.status ?? (fact.verified ? 'confirmed' : 'unverified');
export const selectedFactsBrief = (brief: BriefFilledV1): BriefFilledV1 => ({ ...brief,
  facts: brief.facts.filter((fact: PieceFactV2) => factKind(fact, brief.inputKind) !== 'found' || fact.selected === true),
});
