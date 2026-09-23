import type { JSONContent } from '@tiptap/core';
import {
  inlineRuns,
  parseInline,
  serializeInline,
  type InlineRun,
} from '@contentfactory/helpers/utils/inline-marks';

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
 *  - **Ссылка хранится адресом или парой «слова и адрес».** Адрес, записанный
 *    сам собой, остаётся голым адресом, как и раньше; ссылка со своими словами
 *    (`97dq.52`) хранится как `[слова](https://…)`. Курсив — `_курсив_`,
 *    подчёркивание — `++подчёркнутое++`. Грамматика одна на поле, показ и
 *    пост (`@contentfactory/helpers/utils/inline-marks`), поэтому здесь только
 *    перевод отметок TipTap в прогоны и обратно.
 */

/** Прогон грамматики → текстовый узел TipTap с его отметками. */
const textNode = (run: InlineRun): JSONContent => {
  const marks: NonNullable<JSONContent['marks']> = [];
  if (run.bold) marks.push({ type: 'bold' });
  if (run.italic) marks.push({ type: 'italic' });
  if (run.underline) marks.push({ type: 'underline' });
  if (run.href) marks.push({ type: 'link', attrs: { href: run.href } });
  return marks.length
    ? { type: 'text', text: run.text, marks }
    : { type: 'text', text: run.text };
};

/** Хранимое тело → документ редактора. */
export const storedToDoc = (stored: string): JSONContent => ({
  type: 'doc',
  content: (stored || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => {
      const content = inlineRuns(parseInline(line)).map(textNode);
      return content.length
        ? { type: 'paragraph', content }
        : { type: 'paragraph' };
    }),
});

/** Текстовый узел TipTap → прогон грамматики. */
const runOf = (node: JSONContent): InlineRun => {
  const marks = node.marks ?? [];
  const has = (type: string) => marks.some((mark) => mark.type === type);
  const link = marks.find((mark) => mark.type === 'link');
  const href =
    link && typeof link.attrs?.href === 'string' ? link.attrs.href : undefined;
  return {
    text: node.text ?? '',
    ...(has('bold') ? { bold: true } : {}),
    ...(has('italic') ? { italic: true } : {}),
    ...(has('underline') ? { underline: true } : {}),
    ...(href ? { href } : {}),
  };
};

/**
 * Строчное содержимое абзаца → хранимые строки. Перенос внутри абзаца
 * (`hardBreak`) — граница строки: отметка через перевод строки не пишется.
 */
const inlineText = (nodes: readonly JSONContent[] | undefined): string => {
  const lines: InlineRun[][] = [[]];
  const walk = (list: readonly JSONContent[] | undefined) => {
    for (const node of list ?? []) {
      if (node.type === 'text') lines[lines.length - 1].push(runOf(node));
      else if (node.type === 'hardBreak') lines.push([]);
      else if (node.content) walk(node.content);
    }
  };
  walk(nodes);
  return lines.map((runs) => serializeInline(runs)).join('\n');
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
