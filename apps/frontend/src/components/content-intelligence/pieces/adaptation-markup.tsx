import type { ReactNode } from 'react';
import { Fragment } from 'react';
import {
  isHttpUrl,
  parseInline,
  type InlineNode,
} from '@contentfactory/helpers/utils/inline-marks';

/**
 * Сохранённая разметка адаптации, показанная как текст, а не как звёздочки.
 *
 * Тело адаптации хранится с одним знаком выделения — `**жирный**`. Бэкенд
 * превращает его в `<strong>` перед публикацией, а страница заготовки до
 * 18.09.2026 печатала тело как есть, и человек читал свой будущий пост со
 * звёздочками посреди фразы.
 *
 * Три решения, из-за которых здесь сорок строк, а не библиотека Markdown.
 *
 * **Узнаются только знаки тела.** Жирное, курсив, подчёркивание и ссылка со
 * своими словами (`97dq.52`) — по общей грамматике `inline-marks.ts`; всё
 * остальное — `#`, списки — в теле не хранится, и разбирать его значило бы
 * показывать человеку то, чего в опубликованном тексте не будет.
 *
 * **Разметка с ошибкой печатается буквально.** Незакрытая пара и пара,
 * разорванная переводом строки, — это не выделение, а звёздочки в тексте;
 * спрятать их — значит соврать о том, что уйдёт в канал.
 *
 * **Возвращаются узлы React, а не HTML.** `dangerouslySetInnerHTML` на тексте,
 * пришедшем от модели и правленном человеком, — это дыра, которую не закрывает
 * ни одна проверка выше по потоку.
 *
 * Абзацы и переводы строк здесь не трогаются: их держит `whitespace-pre-wrap`
 * на месте вызова, ровно как держал до этой правки.
 */

/**
 * Пара берётся из общей грамматики, а не пишется здесь второй раз.
 *
 * `content-factory-next-97dq.2`, разбор корректности P2-13: своё выражение на
 * этой странице и своё в сборке поста разошлись на живых строках — `**a **b**
 * c**` страница выделяла по краям, а пост по середине, и `2 ** 3 = 8` пост
 * молча терял. Предпросмотр обещает «это уйдёт в канал», и обещание держится
 * только одной грамматикой на обе стороны
 * (`@contentfactory/helpers/utils/bold-markers`).
 *
 * Разметка с ошибкой по-прежнему печатается буквально: это вид на СОХРАНЁННЫЙ
 * текст, и незакрытая пара — та самая правка, ради которой рядом стоит
 * переключатель.
 */

/** Есть ли в тексте хотя бы одно закрытое выделение или ссылка со словами. */
export const hasStoredMarkup = (text: string): boolean =>
  (text || '')
    .split('\n')
    .some((line) =>
      parseInline(line).some((node) => node.kind === 'mark' || node.kind === 'link')
    );

/** Один узел, когда он один: `<strong>` с текстом, а не со списком из одного. */
const single = (nodes: ReactNode[]): ReactNode =>
  nodes.length === 1 ? nodes[0] : nodes;

const nodesOf = (list: readonly InlineNode[], key: string): ReactNode[] =>
  list.map((node, index) => {
    const at = `${key}-${index}`;
    if (node.kind === 'text') return node.text;
    if (node.kind === 'url') return node.href;
    const inner = single(nodesOf(node.children, at));
    if (node.kind === 'link')
      return isHttpUrl(node.href) ? (
        <a
          key={at}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-cf-accent underline underline-offset-2"
        >
          {inner}
        </a>
      ) : (
        <Fragment key={at}>{inner}</Fragment>
      );
    if (node.mark === 'bold') return <strong key={at}>{inner}</strong>;
    if (node.mark === 'italic') return <em key={at}>{inner}</em>;
    return (
      <u key={at} className="underline-offset-2">
        {inner}
      </u>
    );
  });

/**
 * Текст с выделениями — набором узлов React.
 *
 * Вес `<strong>` берётся у типографики документа: своего кегля и своего веса
 * здесь нет, иначе выделение стало бы одиннадцатым типографическим токеном.
 */
export const formatStoredMarkup = (text: string): ReactNode => {
  if (!hasStoredMarkup(text)) return text;
  const lines = text.split('\n');
  return lines.flatMap((line, index) => [
    ...nodesOf(parseInline(line), `line-${index}`),
    ...(index < lines.length - 1 ? ['\n'] : []),
  ]);
};
