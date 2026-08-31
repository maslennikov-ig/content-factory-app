'use client';

import Link from 'next/link';
import { Fragment, ReactNode } from 'react';
import { languageDirection } from '@contentfactory/react/translation/i18n.config';
import { getLanguageName } from '@contentfactory/frontend/components/layout/language.presentation';
import { EmptyState } from '@contentfactory/frontend/components/ui/surface';
import {
  LEGAL_ROUTES,
  LegalBlock,
  LegalDocumentId,
  LegalSpan,
  ServedLegalDocument,
} from './legal-content';
import { usePublicCopy } from './public-copy';

/**
 * Renders one legal document.
 *
 * Two things make this different from the other public pages. The text is long
 * form, so it is held to a reading measure and its headings stay real headings
 * rather than styled paragraphs. And the language of the text is not always the
 * language of the visitor: sixteen ship, the documents arrive in waves, and a
 * visitor served another language is told so in their own words instead of
 * being left to work it out. Because of that the document keeps its own `lang`
 * and `dir` — an Arabic reader on the English text, or the reverse, gets the
 * right direction for each half — and every offset in here is logical
 * (`ms`/`me`, `ps`, `text-start`) rather than left or right.
 */

const LINK_CLASS =
  'rounded-[4px] text-cf-accent underline underline-offset-2 hover:text-cf-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus';

const Spans = ({ spans }: { spans: LegalSpan[] }): ReactNode => (
  <>
    {spans.map((span, index) => {
      const key = `${span.kind}-${index}`;
      switch (span.kind) {
        case 'strong':
          return <strong key={key}>{span.text}</strong>;
        case 'emphasis':
          return <em key={key}>{span.text}</em>;
        case 'code':
          return (
            <code
              key={key}
              className="rounded-[4px] bg-cf-surface-subtle px-[4px] cf-label-sm"
            >
              {span.text}
            </code>
          );
        case 'link':
          return (
            <Link key={key} href={span.href} className={LINK_CLASS}>
              {span.text}
            </Link>
          );
        default:
          return <Fragment key={key}>{span.text}</Fragment>;
      }
    })}
  </>
);

const Heading = ({
  level,
  id,
  spans,
}: {
  level: 2 | 3 | 4;
  id: string;
  spans: LegalSpan[];
}) => {
  const className =
    level === 2
      ? 'mt-[40px] cf-heading-lg [text-wrap:balance]'
      : level === 3
      ? 'mt-[32px] cf-heading-md [text-wrap:balance]'
      : 'mt-[24px] cf-label-md [text-wrap:balance]';
  const children = <Spans spans={spans} />;
  if (level === 2) {
    return (
      <h2 id={id} className={className}>
        {children}
      </h2>
    );
  }
  if (level === 3) {
    return (
      <h3 id={id} className={className}>
        {children}
      </h3>
    );
  }
  return (
    <h4 id={id} className={className}>
      {children}
    </h4>
  );
};

const Block = ({ block }: { block: LegalBlock }) => {
  switch (block.kind) {
    case 'heading':
      return <Heading level={block.level} id={block.id} spans={block.spans} />;

    case 'list': {
      // Spacing is a margin on the item rather than `gap` on a flex column: a
      // flex container blockifies its children, and browsers have taken that
      // as licence to drop the list marker.
      const items = block.items.map((item, index) => (
        <li key={index} className="mt-[8px] first:mt-0 [overflow-wrap:anywhere]">
          <Spans spans={item} />
        </li>
      ));
      const className = 'mt-[16px] ps-[24px] cf-body-md text-cf-ink';
      return block.ordered ? (
        <ol className={`${className} list-decimal`}>{items}</ol>
      ) : (
        <ul className={`${className} list-disc`}>{items}</ul>
      );
    }

    case 'table':
      return (
        <div className="mt-[24px] w-full overflow-x-auto">
          <table className="w-full min-w-0 border-collapse text-start">
            <thead>
              <tr>
                {block.columns.map((cell, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="border-b border-cf-border-strong px-[12px] py-[8px] text-start align-top cf-label-md text-cf-ink"
                  >
                    <Spans spans={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="border-b border-cf-border px-[12px] py-[8px] text-start align-top cf-body-sm text-cf-ink"
                    >
                      <Spans spans={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return (
        <p className="mt-[16px] cf-body-md text-cf-ink text-pretty [overflow-wrap:anywhere]">
          <Spans spans={block.spans} />
        </p>
      );
  }
};

export function LegalDocumentView({
  documentId,
  content,
}: {
  documentId: LegalDocumentId;
  content: ServedLegalDocument | null;
}) {
  const copy = usePublicCopy();
  const name = copy(LEGAL_ROUTES[documentId].copyKey);

  if (!content) {
    return (
      <section
        className="mx-auto max-w-[920px] px-[24px] py-[64px]"
        aria-labelledby="legal-document-title"
      >
        <p className="cf-label-sm text-cf-signature">CONTENT FACTORY</p>
        <h1
          id="legal-document-title"
          className="mt-[12px] cf-heading-xl [text-wrap:balance]"
        >
          {name}
        </h1>
        <EmptyState
          className="mt-[24px] rounded-[12px] border border-cf-border bg-cf-surface"
          title={copy('legalUnavailableTitle')}
          description={copy('legalUnavailableBody')}
        />
      </section>
    );
  }

  const translated = content.served !== content.requested;

  return (
    <section
      className="mx-auto max-w-[920px] px-[24px] py-[64px]"
      aria-labelledby="legal-document-title"
    >
      <p className="cf-label-sm text-cf-signature">CONTENT FACTORY</p>
      <h1
        id="legal-document-title"
        lang={content.served}
        dir={languageDirection(content.served)}
        className="mt-[12px] cf-heading-xl text-start [text-wrap:balance] [overflow-wrap:anywhere]"
      >
        {content.title || name}
      </h1>
      {content.updated && (
        <p className="mt-[12px] cf-caption text-cf-ink-muted">
          {copy('legalUpdated')} {content.updated}
        </p>
      )}

      {translated && (
        <div className="mt-[24px] max-w-[70ch] rounded-[8px] border border-cf-info bg-cf-info-soft px-[16px] py-[12px]">
          <p className="cf-body-sm text-cf-info text-pretty">
            {copy('legalTranslationPending', {
              language: getLanguageName(content.served),
            })}
          </p>
        </div>
      )}

      <article
        lang={content.served}
        dir={languageDirection(content.served)}
        className="mt-[24px] max-w-[70ch] text-start"
      >
        {content.blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </article>
    </section>
  );
}
