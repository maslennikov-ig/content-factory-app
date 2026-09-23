import type { JSONContent } from '@tiptap/core';
import { boldPairs } from '@contentfactory/helpers/utils/bold-markers';

/**
 * Хранимое тело адаптации ↔ документ редактора TipTap (`97dq.46`).
 *
 * Тело хранится текстом с одним знаком выделения — `**жирный**`, — и эту
 * форму читают бэкенд (`editorHtml`) и черновик поста. Редактор показывает
 * тот же текст без звёздочек, поэтому здесь два перевода, и каждый обязан
 * возвращать то, что получил: открыть и закрыть «Редактировать», ничего не
 * тронув, не должно менять сохранённое тело ни на знак.
 *
 * Правила формы, из-за которых перевод устроен именно так:
 *
 *  - **Строка — абзац редактора.** Хранимый текст делится по `\n`, пустая
 *    строка становится пустым абзацем. Обратно абзацы склеиваются одним `\n`.
 *    Так переживают поездку и одиночный перевод строки, и пустая строка между
 *    абзацами, и хвостовой перевод строки.
 *  - **Жирное — только пара из общей грамматики** (`bold-markers`). Одинокие
 *    `**` и `2 ** 3` остаются в редакторе текстом и возвращаются текстом.
 *  - **Ссылка хранится адресом.** Другой записи ссылки в теле нет, поэтому
 *    отметка ссылки в редакторе — только вид: обратно уходит сам текст.
 *    Адреса в тексте получают отметку при открытии, чтобы читались ссылкой.
 */

/** Адрес в тексте: только http(s), до пробела; хвостовая пунктуация — не адрес. */
const URL_SOURCE = 'https?:\\/\\/[^\\s<>"«»]+';
const TRAILING_PUNCTUATION = /[.,;:!?'")\]]+$/u;

type Piece = { text: string; bold: boolean };

const urlPieces = (
  text: string,
  bold: boolean
): Array<{ text: string; bold: boolean; href?: string }> => {
  const out: Array<{ text: string; bold: boolean; href?: string }> = [];
  let read = 0;
  for (const match of text.matchAll(new RegExp(URL_SOURCE, 'giu'))) {
    const start = match.index ?? 0;
    let address = match[0];
    const tail = address.match(TRAILING_PUNCTUATION)?.[0] ?? '';
    // Закрывающая скобка остаётся частью адреса, если открывающая — в нём же.
    const keepParen =
      tail.startsWith(')') && address.includes('(') ? 1 : 0;
    address = address.slice(0, address.length - tail.length + keepParen);
    if (!address) continue;
    if (start > read) out.push({ text: text.slice(read, start), bold });
    out.push({ text: address, bold, href: address });
    read = start + address.length;
  }
  if (read < text.length) out.push({ text: text.slice(read), bold });
  return out;
};

const lineContent = (line: string): JSONContent[] => {
  const pieces: Piece[] = [];
  let read = 0;
  for (const match of line.matchAll(boldPairs())) {
    const start = match.index ?? 0;
    if (start > read) pieces.push({ text: line.slice(read, start), bold: false });
    pieces.push({ text: match[1], bold: true });
    read = start + match[0].length;
  }
  if (read < line.length) pieces.push({ text: line.slice(read), bold: false });

  return pieces
    .flatMap((piece) => urlPieces(piece.text, piece.bold))
    .filter((piece) => piece.text.length > 0)
    .map((piece) => {
      const marks: NonNullable<JSONContent['marks']> = [];
      if (piece.bold) marks.push({ type: 'bold' });
      if (piece.href) marks.push({ type: 'link', attrs: { href: piece.href } });
      return marks.length
        ? { type: 'text', text: piece.text, marks }
        : { type: 'text', text: piece.text };
    });
};

/** Хранимое тело → документ редактора. */
export const storedToDoc = (stored: string): JSONContent => ({
  type: 'doc',
  content: (stored || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => {
      const content = lineContent(line);
      return content.length
        ? { type: 'paragraph', content }
        : { type: 'paragraph' };
    }),
});

/**
 * Жирный отрезок → пара из общей грамматики.
 *
 * Пробелы по краям выносятся за звёздочки: `** слово **` грамматика парой не
 * считает, и выделение, которое человек протянул на пробел, стало бы
 * звёздочками в посте. Отрезок со звёздочкой внутри пары не образует вовсе —
 * он уходит текстом, а не мусором.
 */
const boldRun = (text: string): string => {
  const lead = text.match(/^\s*/u)?.[0] ?? '';
  const rest = text.slice(lead.length);
  const trail = rest.match(/\s*$/u)?.[0] ?? '';
  const inner = rest.slice(0, rest.length - trail.length);
  if (!inner || inner.includes('*')) return text;
  return `${lead}**${inner}**${trail}`;
};

const inlineText = (nodes: readonly JSONContent[] | undefined): string => {
  const runs: Piece[] = [];
  const push = (text: string, bold: boolean) => {
    const last = runs[runs.length - 1];
    if (last && last.bold === bold) last.text += text;
    else runs.push({ text, bold });
  };
  for (const node of nodes ?? []) {
    if (node.type === 'text') {
      push(
        node.text ?? '',
        (node.marks ?? []).some((mark) => mark.type === 'bold')
      );
    } else if (node.type === 'hardBreak') {
      push('\n', false);
    } else if (node.content) {
      push(inlineText(node.content), false);
    }
  }
  return runs
    .map((run) =>
      run.bold
        ? run.text
            .split('\n')
            .map(boldRun)
            .join('\n')
        : run.text
    )
    .join('');
};

/** Документ редактора → хранимое тело. */
export const docToStored = (doc: JSONContent | null | undefined): string =>
  (doc?.content ?? [])
    .map((block) =>
      block.type === 'paragraph' || block.type === 'text'
        ? inlineText(block.type === 'text' ? [block] : block.content)
        : (block.content ?? [])
            .map((child) => inlineText(child.content ?? [child]))
            .join('\n')
    )
    .join('\n');
