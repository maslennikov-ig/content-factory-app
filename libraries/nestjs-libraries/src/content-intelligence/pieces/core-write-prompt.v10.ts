/**
 * Core prompt with an instruction mode (`content-factory-next-97dq.29`, P1,
 * tenth walk of 22.09.2026). Older prompt modules stay importable and
 * untouched: a released receipt must still name the exact contract its core
 * was written by. v10 is v9 plus one mode paragraph and two block titles; the
 * base and the other modes are v9's own, imported, not copied.
 *
 * Что чинится. Владелец прислал: сообщения редактора со ссылками на эфир,
 * своё «Хочу написать у себя в ТГ-канале пост о том, что я выступил на радио…
 * сохранить вот эти ссылки» и под ним анонс эфира с вопросами ведущего
 * (`cnt-28`). Вход ушёл как чужой пост, и суть стала эссе по теме вопросов:
 * о выступлении ни слова, ссылки потеряны, вопросы не названы. База v9 в этом
 * не виновата — она честно велит «хочу написать о…» и адреса считать
 * служебным и в текст не пускать. Для задания это правило неверно ровно в
 * двух местах, и здесь они названы исключениями, а не третьей базой:
 *
 * - **Задание — не материал, а описание.** Слова человека о том, какой пост
 *   нужен, в текст не переносятся; переносится то, о чём он просит написать:
 *   событие, его роль в нём, что было. Вставленное под заданием (анонс,
 *   вопросы, чьё-то сообщение) — материал о событии, а не пост-собеседник.
 * - **Ссылки из задания сохраняются дословно.** Это единственное место, где
 *   адрес входит в суть: человек велел его сохранить, и по нему никто не
 *   ходил — читать там нечего и незачем.
 */

import {
  CORE_WRITE_BLOCK_TITLES_V9,
  CORE_WRITE_ENRICH_LEAD_V9,
  CORE_WRITE_REPAIR_V9,
  coreWriteSystemV9,
} from './core-write-prompt.v9';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v10' as const;

/** Подписи блоков v9 плюс задание и ссылки из него. */
export const CORE_WRITE_BLOCK_TITLES_V10 = {
  ru: {
    ...CORE_WRITE_BLOCK_TITLES_V9.ru,
    instruction: 'ЗАДАНИЕ (что человек хочет написать; описание поста, не его текст)',
    links: 'ССЫЛКИ ИЗ ЗАДАНИЯ (переносятся в текст как есть)',
  },
  en: {
    ...CORE_WRITE_BLOCK_TITLES_V9.en,
    instruction: 'THE INSTRUCTION (what the person wants written; a description of the post, not its text)',
    links: 'LINKS FROM THE INSTRUCTION (carried into the text as they are)',
  },
} as const;

/** Задание: описание поста и ссылки, которые велено сохранить. */
export const CORE_WRITE_INSTRUCTION_V10 = {
  ru: 'Отдельное правило о блоке «задание»: здесь человек описывает, какой текст ему нужен, а не даёт слова для него. Пиши то, о чём он просит рассказать, — событие, его участие, что там было и что он об этом думает, — а не о том, что он «хочет написать пост»: слов «хочу написать», «пост о том, что», «сохранить ссылки» и любой другой рамки задания в сути нет. Фразы задания не переноси; из них берутся только числа, имена, даты и названия — те переноси дословно. Материал, вставленный под заданием (анонс, список вопросов, чьё-то сообщение), — это то, о чём было событие: перескажи его своими словами как содержание того, что человек делал, а не как чужой пост, с которым он спорит или соглашается; список вопросов — это темы, на которые человек отвечал, назови их связным текстом без нумерации. Ссылки из блока «ссылки из задания» — исключение из правила о служебном: каждая входит в текст дословно, символ в символ, один раз, там, где она уместна по смыслу («посмотреть выступление можно здесь: …»), и никакая ссылка из этого блока не пропадает. Тезис — само событие и позиция человека к нему, не тема вставленного материала.',
  en: 'A separate rule about the «instruction» block: here the person describes the text they need rather than giving words for it. Write what they ask to be told — the event, their part in it, what happened and what they think of it — not that they «want to write a post»: the words «I want to write», «a post about how», «keep the links» and any other framing of the task do not appear in the core. Do not carry the instruction’s phrases over; take from them only numbers, names, dates and titles — those verbatim. Material pasted under the instruction (an announcement, a list of questions, somebody’s message) is what the event was about: retell it in your own words as the content of what the person did, never as somebody else’s post they agree or disagree with; a list of questions is the set of topics the person answered — name them in connected prose without numbering. Links in the «links from the instruction» block are the exception to the rule about service material: each enters the text verbatim, character for character, once, where it belongs by meaning («the appearance can be watched here: …»), and no link from that block is lost. The claim is the event itself and the person’s position on it, not the topic of the pasted material.',
} as const;

export const coreWriteSystemV10 = (
  language: 'ru' | 'en',
  forbiddenPhrases: string,
  options: Parameters<typeof coreWriteSystemV9>[2] & {
    /** Вход — задание: блоки «задание» и «ссылки из задания» присутствуют. */
    instruction?: boolean;
  } = {}
): string =>
  [
    coreWriteSystemV9(language, forbiddenPhrases, options),
    options.instruction ? CORE_WRITE_INSTRUCTION_V10[language] : '',
  ]
    .filter(Boolean)
    .join('\n');

export const CORE_WRITE_ENRICH_LEAD_V10 = CORE_WRITE_ENRICH_LEAD_V9;
export const CORE_WRITE_REPAIR_V10 = CORE_WRITE_REPAIR_V9;
