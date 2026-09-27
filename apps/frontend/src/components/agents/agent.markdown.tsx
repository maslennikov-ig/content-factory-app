'use client';

import { Fragment, type ReactNode } from 'react';

/**
 * The agent's words as markdown, drawn as React elements
 * (`content-factory-next-kcxz.10`).
 *
 * The agent answers in markdown: paragraphs, **bold**, *italic*, `code`,
 * lists, short headings, links. A markdown library would bring its own HTML
 * path; the text of a turn can quote a stranger's post, so nothing here ever
 * becomes HTML. Every node is an element built below, never
 * `dangerouslySetInnerHTML`, and a link is kept only when it is `http(s)` or
 * `mailto`; anything else stays as its own text.
 *
 * The subset is the one the agent's instructions ask for. What it does not
 * know (tables, images, raw HTML) is shown as the characters that were sent.
 */

type Block =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'code'; text: string };

const LIST_ITEM = /^\s{0,3}([-*+•]|\d{1,3}[.)])\s+(.*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

export const parseBlocks = (source: string): Block[] => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: heading[2] });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        quoted.push(QUOTE.exec(lines[index])![1]);
        index += 1;
      }
      blocks.push({ kind: 'quote', lines: quoted });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[1]);
      const start = ordered ? parseInt(item[1], 10) || 1 : 1;
      const items: string[] = [];
      while (index < lines.length) {
        const next = LIST_ITEM.exec(lines[index]);
        if (next && /\d/.test(next[1]) === ordered) {
          items.push(next[2]);
          index += 1;
        } else if (
          lines[index].trim() &&
          /^\s{2,}/.test(lines[index]) &&
          items.length
        ) {
          // A wrapped item continues on an indented line.
          items[items.length - 1] += ` ${lines[index].trim()}`;
          index += 1;
        } else {
          break;
        }
      }
      blocks.push({ kind: 'list', ordered, start, items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) &&
      !QUOTE.test(lines[index]) &&
      !LIST_ITEM.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: 'paragraph', lines: paragraph });
  }

  return blocks;
};

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

export const safeHref = (href: string): string | null => {
  const trimmed = href.trim();
  return SAFE_HREF.test(trimmed) && !/[\s<>"]/.test(trimmed) ? trimmed : null;
};

/*
 * One pass, left to right: the earliest token wins, and what it wraps is read
 * again for the marks inside it (not inside code).
 */
const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()«»"]+[^\s<>()«»".,;:!?])/;

export const renderInline = (text: string, keyPrefix = 'i'): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let rest = text;
  let counter = 0;

  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${counter++}`;

    if (match[1]) {
      nodes.push(
        <code
          key={key}
          className="rounded-[4px] bg-cf-surface-subtle px-[4px] cf-caption text-cf-ink"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (match[2]) {
      nodes.push(
        <strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>
      );
    } else if (match[3]) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else if (match[4]) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token) ?? [];
      const safe = href ? safeHref(href) : null;
      nodes.push(
        safe ? (
          <a
            key={key}
            href={safe}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-cf-accent underline underline-offset-2 hover:text-cf-accent-hover"
          >
            {renderInline(label, key)}
          </a>
        ) : (
          token
        )
      );
    } else {
      const safe = safeHref(token);
      nodes.push(
        safe ? (
          <a
            key={key}
            href={safe}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-cf-accent underline underline-offset-2 hover:text-cf-accent-hover"
          >
            {token}
          </a>
        ) : (
          token
        )
      );
    }
    rest = rest.slice(match.index + token.length);
  }

  return nodes;
};

const withBreaks = (lines: string[], key: string) =>
  lines.map((line, index) => (
    <Fragment key={`${key}-${index}`}>
      {index > 0 ? <br /> : null}
      {renderInline(line, `${key}-${index}`)}
    </Fragment>
  ));

export function AgentMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="flex min-w-0 flex-col gap-[8px] cf-body-md text-cf-ink [overflow-wrap:anywhere]">
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        switch (block.kind) {
          case 'heading':
            return (
              <p key={key} className="cf-label-md text-cf-ink [text-wrap:balance]">
                {renderInline(block.text, key)}
              </p>
            );
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List
                key={key}
                start={block.ordered ? block.start : undefined}
                className={
                  block.ordered
                    ? 'flex list-decimal flex-col gap-[4px] ps-[20px]'
                    : 'flex list-disc flex-col gap-[4px] ps-[20px]'
                }
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>
                    {renderInline(item, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </List>
            );
          }
          case 'quote':
            return (
              <blockquote
                key={key}
                className="border-s-2 border-cf-border-strong ps-[12px] text-cf-ink-muted"
              >
                {withBreaks(block.lines, key)}
              </blockquote>
            );
          case 'code':
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-caption text-cf-ink"
              >
                <code>{block.text}</code>
              </pre>
            );
          default:
            return (
              <p key={key} className="[text-wrap:pretty]">
                {withBreaks(block.lines, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
