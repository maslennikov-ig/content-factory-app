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

/**
 * Вынес ли поиск по строке вердикт (`content-factory-next-97dq.32`).
 *
 * Признак — следы самого поиска на строке, а не её `status`. Статус
 * «не проверено» вход ставит своим строкам сразу, без всякого поиска
 * (`intake.service` при заполнении брифа, `own-facts.ownRow`), и сказать по
 * нему, ходили ли в источник, нельзя: десятый заход 22.09.2026 потерял все
 * три числа исландской мысли без ресерча именно так.
 *
 * Следы есть только у строки, прошедшей ресерч (`intake.researchRows`):
 * ключ строки (`factKey`, с 13.09.2026 его ставит только ресерч, каждой
 * строке, которую он видел — с вердиктом и без), заметка и цитата источника,
 * поправка, статус «расходится». Бриф, записанный до ключей, ресерча по своим
 * строкам не знал вовсе — сжатие тогда лишь добавляло находки, — и его строки
 * без следов честно читаются как «не ходили». Признак уровня брифа («есть
 * находки — значит, своё проверяли») ошибся бы как раз на таких брифах.
 */
export const searchRuledOn = (fact: PieceFactV2): boolean =>
  Boolean(fact.factKey) ||
  Boolean(fact.correction) ||
  Boolean((fact.note ?? '').trim()) ||
  Boolean((fact.quote ?? '').trim()) ||
  fact.status === 'conflicting' ||
  fact.status === 'not_found';

/**
 * Слово самого человека: его мысль (`input`, не чужой текст) или его ответ.
 * Та же граница, что у `isOwnOrConfirmed` в сути, — квитанция и промпт делят
 * одно определение «своего».
 */
const personsWord = (fact: PieceFactV2): boolean =>
  fact.origin === 'person' || (fact.origin === 'input' && fact.kind !== 'external');

/**
 * Своё слово, которое поиск опроверг или не нашёл: строка человека с
 * вердиктом поиска, и вердикт не «подтверждено». Строка-поправка (`search`)
 * сюда не относится — это слова источника, а не человека.
 */
export const ownRefutedBySearch = (fact: PieceFactV2): boolean =>
  !fact.verified &&
  fact.status !== 'confirmed' &&
  personsWord(fact) &&
  searchRuledOn(fact);

/**
 * Строки квитанции «Не подтвердилось и в текст не вошло» — одно место на все
 * дороги: вход, выбор после ресерча и ответы на вопросы сути.
 *
 * Из идущих в текст — неподтверждённые, КРОМЕ своего слова человека, по
 * которому поиска не было (§9.5 карты раздела: своё утверждение подтверждено
 * в момент, когда человек его написал). Суть печатает такую строку под
 * «факты подтверждённые», и квитанция не вправе в тот же миг называть её
 * «не вошедшей» (`97dq.32`). Опровергнутое или не найденное поиском своё
 * остаётся здесь, как и прежде.
 */
export const ungroundedStatements = (brief: BriefFilledV1): string[] =>
  selectedFactsBrief(brief)
    .facts.filter(
      (fact: PieceFactV2) =>
        !fact.verified && !(personsWord(fact) && !searchRuledOn(fact))
    )
    .map((fact) => fact.statement);
