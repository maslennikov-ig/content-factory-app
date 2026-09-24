/**
 * Core prompt where the core is always the finished text in the author's own
 * voice (`content-factory-next-97dq.90`, fifteenth walk, `cnt-36`). Older
 * prompt modules stay importable and untouched: a released receipt must still
 * name the exact contract its core was written by. Everything of v12 holds;
 * v13 adds one rule that rides in every mode and a repair line for the
 * meta-speech guard (`text-quality/meta-speech.ts`).
 *
 * Что чинится. `cnt-36` (`c326e624`): первая суть рассказывала о тексте
 * вместо того, чтобы быть им: «сначала я описал это как сокращение вдвое, а
 * в ответе уточнил…», «О том, как… конкретных деталей нет. Здесь можно
 * рассказать о результате». Решение модели «Не описывать конкретные шаги…»
 * было пересказано, а не применено; ответ человека («в полтора раза»),
 * расходящийся с материалом («вдвое»), был пересказан как поправка.
 *
 * Что здесь решено и держится.
 *
 * - **Суть — всегда готовый текст поста от первого лица автора**, а не
 *   отчёт о материале, ответах или решениях.
 * - **Решения модели применяются молча**: это указания, как писать, и в
 *   тексте о них нет ни слова.
 * - **Ответ человека сильнее материала**: число или факт из ответа заменяет
 *   расходящееся с ним в материале, и текст называет только верное значение,
 *   не упоминая, что было иначе.
 * - **Никакой речи о тексте**: «в первом описании», «в ответе уточнил»,
 *   «здесь можно рассказать», «конкретных деталей нет», «в материале».
 *   Детерминированная проверка ловит такие обороты и просит одну перепись.
 * - **Решения — не факты** (v11), оговорки автора держатся (v12): случай,
 *   число и опыт, которых человек не давал, по-прежнему не пишутся.
 */

import {
  CORE_WRITE_BLOCK_TITLES_V12,
  CORE_WRITE_ENRICH_LEAD_V12,
  CORE_WRITE_REPAIR_V12,
  coreWriteSystemV12,
  type CoreWriteSystemOptionsV12,
} from './core-write-prompt.v12';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v13' as const;

/**
 * Подписи v12 без изменений: подписи блоков — часть договора, который читают
 * квитанции, а правило v13 стоит последним в системе и сильнее их.
 */
export const CORE_WRITE_BLOCK_TITLES_V13 = CORE_WRITE_BLOCK_TITLES_V12;

/**
 * The core is the finished text (`97dq.90`). Rides last in every mode, so it
 * outranks anything above that could read as «describe the material».
 */
export const CORE_WRITE_FINISHED_TEXT_V13 = {
  ru: 'Главное правило о форме сути, сильнее любого правила выше. Суть — всегда готовый текст поста от первого лица автора: так, как он сам написал бы его читателю, а не рассказ о материале, об ответах или о решениях. (1) Решения модели — указания, как писать: примени каждое молча. Если решение говорит «не описывать конкретные шаги», шагов в тексте просто нет; ни само решение, ни то, чего в тексте нет и почему, не упоминается. (2) Ответ человека сильнее материала: если число или факт в ответе расходится с материалом (в материале «вдвое», в ответе «в полтора раза»), в тексте стоит только значение из ответа — как единственное, без упоминания, что раньше было иначе, что человек уточнил или поправил. (3) Никакой речи о тексте и о входе: не пиши «в первом описании», «сначала я описал», «в ответе уточнил», «как я уже писал», «здесь можно рассказать», «об этом стоит сказать», «конкретных деталей нет», «подробностей нет», «в материале», «в брифе», «в вопросе», «решение модели», «этот текст объясняет». Чего нет во входе, того нет и в тексте — молча, без оговорки об отсутствии. Решения по-прежнему не становятся пережитым опытом: случаев, чисел, имён и цитат, которых человек не давал, не добавляй.',
  en: 'The main rule about the form of the core, stronger than any rule above. The core is always the finished text of the post in the author’s first person: the way they would write it to a reader themselves, never an account of the material, the answers or the decisions. (1) The model’s decisions are instructions for how to write: apply each one silently. If a decision says «do not describe the concrete steps», the text simply has no steps; neither the decision nor what the text leaves out and why is mentioned. (2) The person’s answer outranks the material: where a number or a fact in an answer differs from the material (the material says «half», the answer says «a third less»), the text states only the value from the answer — as the only one, never mentioning that it was different before or that the person clarified or corrected it. (3) No speech about the text or the input: never write «in the first description», «at first I described», «in my answer I clarified», «as I wrote before», «here one could tell», «this is worth telling», «there are no concrete details», «no details», «in the material», «in the brief», «in the question», «the model’s decision», «this text explains». What is not in the input is not in the text — silently, with no remark about its absence. Decisions still never become lived experience: add no cases, numbers, names or quotes the person did not give.',
} as const;

/**
 * One rewrite when the guard finds meta speech in the core. The found phrases
 * follow the line, quoted.
 */
export const CORE_WRITE_META_REPAIR_V13 = {
  ru: 'ПЕРЕПИШИ: в сути есть речь о тексте, о материале, об ответах или о решениях вместо самого текста. Перепиши суть как готовый пост от первого лица автора: решения примени молча, из ответа возьми только верное значение без упоминания поправки, а о том, чего во входе нет, не пиши ничего. Эти обороты в тексте стоять не могут: ',
  en: 'REWRITE: the core talks about the text, the material, the answers or the decisions instead of being the text. Rewrite it as the finished post in the author’s first person: apply the decisions silently, take only the correct value from an answer with no mention of the correction, and say nothing about what the input does not have. These turns of phrase cannot stand in the text: ',
} as const;

export type CoreWriteSystemOptionsV13 = CoreWriteSystemOptionsV12;

export const coreWriteSystemV13 = (
  language: 'ru' | 'en',
  forbiddenPhrases: string,
  options: CoreWriteSystemOptionsV13 = {}
): string =>
  [
    coreWriteSystemV12(language, forbiddenPhrases, options),
    CORE_WRITE_FINISHED_TEXT_V13[language],
  ].join('\n');

export const CORE_WRITE_ENRICH_LEAD_V13 = CORE_WRITE_ENRICH_LEAD_V12;
export const CORE_WRITE_REPAIR_V13 = CORE_WRITE_REPAIR_V12;
