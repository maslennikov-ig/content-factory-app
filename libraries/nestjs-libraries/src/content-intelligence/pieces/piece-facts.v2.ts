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
/**
 * Что из опор идёт в текст: найденное — только отмеченное; своё и внешнее —
 * всегда, КРОМЕ строки, которая расходится с источником и которую человек не
 * оставил себе (`content-factory-next-75xn.18`): её место заняла
 * строка-поправка с тем же ключом источника.
 */
export const selectedFactsBrief = (brief: BriefFilledV1): BriefFilledV1 => ({ ...brief,
  facts: brief.facts.filter((fact: PieceFactV2) => {
    if (factKind(fact, brief.inputKind) === 'found') return fact.selected === true;
    // Пара «своё расходящееся ↔ строка-поправка»: в текст идёт та, что выбрана.
    if (fact.status === 'conflicting' || fact.correction) return fact.selected === true;
    return true;
  }),
});
