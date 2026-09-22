/**
 * Служебные метки источников — прочь из текста, который увидит человек.
 *
 * `content-factory-next-97dq.40`, десятый заход 22.09.2026: адаптация Telegram
 * закончила два абзаца метками «[E2]» и «[E5]». Метки — адреса строк блока
 * материала, которые промпт выдаёт модели (`[F1] FACT …`, `[E1] EVIDENCE …`,
 * `renderContext` генератора), а ответ модели должен называть их в
 * `usedCitationIds`, не в тексте. Модель копирует их в текст, и промпт
 * этого теперь прямо запрещает, но запрет — просьба, а не гарантия. Здесь
 * гарантия: снимается детерминированно, после генерации и до записи.
 *
 * Грамматика узкая намеренно — ровно те формы, которые печатают наши промпты:
 *
 *  - `[E2]`, `[F1]` — номер строки блока контекста (`content-context.builder`,
 *    `E${n}`/`F${n}`);
 *  - `[E:<id>]`, `[F:<id>]`, `[C:<key>]` — адреса промптов брифа и разбора
 *    ресерча (`intake.service`, `research-digest`);
 *  - их список в одних скобках (`[E2, E5]`, `[E2; F1]`) и подряд (`[E2][E5]`).
 *
 * Всё прочее в квадратных скобках — слово человека, и оно не трогается:
 * `[17.09.2026 5:13]`, `[сарказм]`, `[1]`, `[e2]`, ссылка Markdown `[E2](…)`.
 * Текст без метки возвращается тем же самым значением, байт в байт.
 */

/** Одна метка: номер строки блока или адрес с префиксом. */
const LABEL_ID = String.raw`(?:[EF][1-9]\d{0,2}|[EFC]:[A-Za-z0-9][A-Za-z0-9_.:-]{0,127})`;
/** Скобки с одной меткой или их списком через запятую или точку с запятой. */
const LABEL = String.raw`\[${LABEL_ID}(?:[^\S\r\n]*[,;][^\S\r\n]*${LABEL_ID})*\]`;
/**
 * Метки подряд, с пробелами до и после. Скобки, за которыми сразу стоит `(` или
 * `:`, — это ссылка Markdown или её определение, а не метка.
 */
const RUN = new RegExp(
  String.raw`([^\S\r\n]*)(${LABEL}(?:[^\S\r\n]*${LABEL})*)(?![(:])([^\S\r\n]*)`,
  'g'
);
const HAS_LABEL = new RegExp(String.raw`${LABEL}(?![(:])`);

/**
 * Знак, перед которым пробел не нужен: «дней [E2].» → «дней.», и закрытие
 * выделения — «**важно [E2]**» не должно стать «**важно **».
 */
const CLOSING = /[.,;:!?)\]}»”"'…*_]/u;

const stripLine = (line: string): string =>
  line.replace(
    RUN,
    (match: string, before: string, _run: string, after: string, offset: number) => {
      const next = line.charAt(offset + match.length);
      const atStart = offset === 0;
      const atEnd = next === '' || next === '\r';
      if (atStart || atEnd || CLOSING.test(next)) return '';
      // Метка между двумя словами: одного пробела достаточно, если он был.
      return before || after ? ' ' : '';
    }
  );

/** Есть ли в тексте хоть одна служебная метка источника. */
export const hasCitationLabels = (text: string | null | undefined): boolean =>
  typeof text === 'string' && HAS_LABEL.test(text);

/**
 * Текст без служебных меток источников.
 *
 * Строка, в которой ничего, кроме меток, не было, уходит вместе с переводом
 * строки, и пустая строка абзаца за ней не удваивается: «a\n\n[E2]\n\nb»
 * становится «a\n\nb», а не «a\n\n\n\nb».
 */
export function stripCitationLabels(text: string): string;
export function stripCitationLabels(
  text: string | null | undefined
): string | null | undefined;
export function stripCitationLabels(
  text: string | null | undefined
): string | null | undefined {
  if (!hasCitationLabels(text)) return text;
  const lines = (text as string).split('\n');
  const kept: string[] = [];
  let dropped = false;
  for (const line of lines) {
    const stripped = stripLine(line);
    if (stripped !== line && !stripped.trim()) {
      dropped = true;
      continue;
    }
    const blank = !line.trim();
    if (dropped && blank && (!kept.length || !kept[kept.length - 1].trim())) {
      continue;
    }
    if (!blank) dropped = false;
    kept.push(stripped);
  }
  if (dropped) {
    while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  }
  return kept.join('\n');
}
