/**
 * The post as words, not as markup.
 *
 * The editor stores a box as HTML — `<p>Первая фраза.</p><p>Вторая.</p>` — and
 * the check has been measuring that HTML since it was wired: `<p>` is a
 * five-character window like any other, `</p><p>` looks like punctuation the
 * author never uses, and the sentence splitter reads a tag as part of a
 * sentence. A voice measured on a corpus of plain Telegram posts and compared
 * against a draft full of tags is being asked a question about markup.
 *
 * Deliberately small and deliberately here rather than reusing
 * `stripHtmlValidation`. That helper serves the publishers: it converts bold to
 * mathematical alphanumerics, rewrites mentions per platform and keeps a
 * whitelist of tags, all of which is correct for what gets sent to a network
 * and wrong for what gets counted. What the counter needs is the text a reader
 * would see, with the block boundaries kept as blank lines because the
 * paragraph is a unit two of the eight scales divide by.
 */

import { createEntityDecoder } from '@contentfactory/helpers/utils/html-entities';

/** Tags that end a block: what follows them starts a new paragraph. */
const BLOCK_END = /<\/(?:p|div|li|ul|ol|h[1-6]|blockquote|tr)\s*>/gi;

const LINE_BREAK = /<br\s*\/?>/gi;

const ANY_TAG = /<[^>]*>/g;

/**
 * Сущности этого счётчика.
 *
 * Снимаются одним проходом (`content-factory-next-97dq.11`). Раньше это была
 * цепочка `.replace`, в которой `&amp;` стоял перед `&lt;`: написанное буквами
 * `&amp;lt;` первый проход превращал в `&lt;`, а второй — в `<`. Мера голоса
 * считала бы знак там, где человек написал слово.
 */
const ENTITIES = [
  ['&nbsp;', ' '],
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#0?39;', "'"],
  ['&apos;', "'"],
  ['&laquo;', '«'],
  ['&raquo;', '»'],
  ['&mdash;', '—'],
  ['&ndash;', '–'],
] as const;

const decodeEntities = createEntityDecoder(ENTITIES);

/**
 * True when the value carries markup worth removing.
 *
 * A plain post that happens to contain `a < b` is not HTML, and running the
 * stripper over it would eat the rest of the line.
 */
export const looksLikeHtml = (value: string): boolean =>
  /<(?:p|div|br|li|ul|ol|h[1-6]|span|strong|em|b|i|u|a)\b[^>]*>/i.test(value);

export function htmlToPlainText(value: string): string {
  if (!looksLikeHtml(value)) return value;
  const text = decodeEntities(
    value
      .replace(LINE_BREAK, '\n')
      .replace(BLOCK_END, '\n\n')
      .replace(ANY_TAG, '')
  );
  return (
    text
      .replace(/\r\n?/g, '\n')
      // Three or more blank lines say nothing a single blank line does not, and
      // an empty paragraph would otherwise become one.
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.replace(/[ \t ]+/g, ' ').trimEnd())
      .join('\n')
      .trim()
  );
}
