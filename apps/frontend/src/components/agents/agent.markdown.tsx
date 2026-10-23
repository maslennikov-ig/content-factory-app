'use client';

import { useEffect, useRef } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math-extended';
import { visit } from 'unist-util-visit';
import katex from 'katex';

// CommonMark/GFM and TeX syntax belong to the libraries. Only product styling
// and the untrusted-content policy live here; raw HTML is left as text.

// Keep currency literal using the parsed node's source boundaries (Pandoc's
// single-dollar whitespace/digit rules). No Markdown syntax is parsed here.
function remarkCurrency() {
  return (tree: Parameters<typeof visit>[0], file: { toString(): string }) => {
    const source = String(file);
    visit(tree, (node) => {
      if (node.type !== 'inlineMath') return;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      const original = source.slice(start, end);
      if (
        original.startsWith('$') &&
        !original.startsWith('$$') &&
        (/^\$\s|\s\$$/.test(original) || /\d/.test(source[end] ?? ''))
      ) {
        Object.assign(node, { type: 'text', value: original, data: undefined });
      }
    });
  };
}

function AgentMath({
  text,
  display = false,
}: {
  text: string;
  display?: boolean;
}) {
  const target = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!target.current) return;
    try {
      katex.render(text, target.current, {
        displayMode: display,
        output: 'htmlAndMathml',
        trust: false,
        throwOnError: false,
        strict: 'ignore',
        errorColor: 'currentColor',
        maxSize: 10,
        maxExpand: 1000,
      });
    } catch {
      target.current.textContent = text;
    }
  }, [text, display]);
  return (
    <span
      ref={target}
      className={
        display
          ? 'block max-w-full overflow-x-auto py-[4px] [&_.katex-display]:m-0'
          : 'inline-block max-w-full overflow-x-auto align-middle'
      }
    >
      {text}
    </span>
  );
}

const components: Components = {
  h1: ({ children }) => (
    <h3 className="cf-label-md text-cf-ink [text-wrap:balance]">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="cf-label-md text-cf-ink [text-wrap:balance]">{children}</h3>
  ),
  h3: ({ children }) => (
    <h3 className="cf-label-md text-cf-ink [text-wrap:balance]">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="cf-label-md text-cf-ink">{children}</h4>,
  h5: ({ children }) => <h5 className="cf-label-md text-cf-ink">{children}</h5>,
  h6: ({ children }) => <h6 className="cf-label-md text-cf-ink">{children}</h6>,
  p: ({ children }) => (
    <p className="whitespace-pre-line [text-wrap:pretty]">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="flex list-disc flex-col gap-[4px] ps-[20px]">{children}</ul>
  ),
  ol: ({ children, start }) => (
    <ol
      start={start}
      className="flex list-decimal flex-col gap-[4px] ps-[20px]"
    >
      {children}
    </ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-[8px] rounded-[4px] bg-cf-surface-subtle p-[12px] text-cf-ink-muted">
      {children}
    </blockquote>
  ),
  a: ({ children, href, title }) =>
    href ? (
      <a
        href={href}
        title={title}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-cf-accent underline underline-offset-2 hover:text-cf-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-cf-accent"
      >
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  // Model-provided image URLs must not trigger automatic external requests.
  img: ({ alt }) => <span>{alt}</span>,
  pre: ({ children, node }) =>
    node?.children.some(
      (child) =>
        child.type === 'element' &&
        child.properties.className instanceof Array &&
        child.properties.className.includes('math-display')
    ) ? (
      <>{children}</>
    ) : (
      <pre className="max-w-full overflow-x-auto rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-caption text-cf-ink [&>code]:bg-transparent [&>code]:p-0">
        {children}
      </pre>
    ),
  code: ({ children, className }) =>
    className?.split(' ').includes('language-math') ? (
      <AgentMath
        text={String(children).replace(/\n$/, '')}
        display={className.split(' ').includes('math-display')}
      />
    ) : (
      <code className="rounded-[4px] bg-cf-surface-subtle px-[4px] cf-caption text-cf-ink">
        {children}
      </code>
    ),
  table: ({ children }) => (
    <div
      role="region"
      aria-label="Таблица в ответе"
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-[8px] border border-cf-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-cf-accent"
    >
      <table className="w-full border-collapse cf-body-md text-cf-ink">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-cf-surface-subtle">{children}</thead>
  ),
  th: ({ children, style }) => (
    <th
      scope="col"
      style={style}
      className="min-w-[120px] border-b border-cf-border px-[12px] py-[8px] text-start align-top cf-label-md"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td
      style={style}
      className="border-b border-cf-border px-[12px] py-[8px] align-top [overflow-wrap:anywhere]"
    >
      {children}
    </td>
  ),
};

export function AgentMarkdown({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-[8px] cf-body-md text-cf-ink [overflow-wrap:anywhere]">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath, remarkCurrency]}
        components={components}
        urlTransform={(url) =>
          /^(https?:\/\/|mailto:)/i.test(url) && !/[\s<>"]/.test(url)
            ? url
            : undefined
        }
      >
        {text}
      </Markdown>
    </div>
  );
}
