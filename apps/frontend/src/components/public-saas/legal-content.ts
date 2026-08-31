import type { PublicCopyKey } from './public-copy';

/**
 * The published legal documents, and the markdown subset they are written in.
 *
 * These pages are prose written and reviewed by a person, not product copy, so
 * they live as markdown files under `src/content/legal` rather than as
 * translation keys. Only the names of the documents — the footer links and the
 * browser title — go through the shared locale bundles, because those have to
 * read in the visitor's language even when the document itself is available
 * only in another one.
 *
 * The parser is a small hand-written subset instead of a markdown package.
 * Nothing in the repository already renders markdown to React, the subset a
 * legal document needs is closed, and building the tree here means the output
 * is elements carrying `cf` tokens rather than an HTML string handed to
 * `dangerouslySetInnerHTML`. The cost of the alternative is a new dependency
 * plus a sanitiser; the cost of this is the hundred lines below.
 */

export const LEGAL_DOCUMENTS = ['privacy', 'terms', 'subprocessors'] as const;

export type LegalDocumentId = (typeof LEGAL_DOCUMENTS)[number];

/**
 * One row per document: the route it is published at and the key that names it
 * in the visitor's language. `proxy.ts` cannot import this — it runs before the
 * application bundle exists — so `PUBLIC_PATHS` repeats the paths and
 * `tests/public-saas-routing.test.cjs` holds the two lists to each other.
 */
export const LEGAL_ROUTES: Record<
  LegalDocumentId,
  { href: string; copyKey: PublicCopyKey }
> = {
  privacy: { href: '/privacy', copyKey: 'legalPrivacy' },
  terms: { href: '/terms', copyKey: 'legalTerms' },
  subprocessors: { href: '/subprocessors', copyKey: 'legalSubprocessors' },
};

export type LegalSpan =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'emphasis'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

export type LegalBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; id: string; spans: LegalSpan[] }
  | { kind: 'paragraph'; spans: LegalSpan[] }
  | { kind: 'list'; ordered: boolean; items: LegalSpan[][] }
  | { kind: 'table'; columns: LegalSpan[][]; rows: LegalSpan[][][] };

export type LegalDocument = {
  /** From the front matter, in the language the document is written in. */
  title: string;
  /** The date the document last changed, as the author wrote it. */
  updated: string;
  /** The language the front matter declares. */
  language: string;
  blocks: LegalBlock[];
};

/** A document plus which language was asked for and which one is being shown. */
export type ServedLegalDocument = LegalDocument & {
  requested: string;
  served: string;
};

const FRONT_MATTER = /^---[^\S\n]*\r?\n([\s\S]*?)\r?\n---[^\S\n]*(?:\r?\n|$)/;

const unquote = (value: string) =>
  value.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const ORDERED = /^\s{0,3}\d+[.)]\s+(.*)$/;
const TABLE_ROW = /^\s*\|(.*)\|\s*$/;
const TABLE_RULE = /^\s*\|[\s:|-]+\|\s*$/;

const INLINE =
  /\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^()\s]+)\)/g;

/**
 * A legal document is reviewed before it ships, but a link is the one place a
 * mistake turns into a live scheme rather than a typo. Only plain web and mail
 * targets, and paths inside this product, become anchors; anything else stays
 * visible as the text the author wrote.
 */
const SAFE_HREF = /^(?:https?:\/\/|mailto:|\/(?!\/))\S*$/i;

export const parseLegalSpans = (line: string): LegalSpan[] => {
  const spans: LegalSpan[] = [];
  let cursor = 0;

  for (const match of line.matchAll(INLINE)) {
    const [whole, strong, strongAlt, emphasis, code, linkText, href] = match;
    const start = match.index ?? 0;
    if (start > cursor) {
      spans.push({ kind: 'text', text: line.slice(cursor, start) });
    }
    cursor = start + whole.length;

    if (strong !== undefined || strongAlt !== undefined) {
      spans.push({ kind: 'strong', text: strong ?? strongAlt });
    } else if (emphasis !== undefined) {
      spans.push({ kind: 'emphasis', text: emphasis });
    } else if (code !== undefined) {
      spans.push({ kind: 'code', text: code });
    } else if (SAFE_HREF.test(href)) {
      spans.push({ kind: 'link', text: linkText, href });
    } else {
      spans.push({ kind: 'text', text: whole });
    }
  }

  if (cursor < line.length) {
    spans.push({ kind: 'text', text: line.slice(cursor) });
  }
  return spans.length ? spans : [{ kind: 'text', text: line }];
};

const cellsOf = (row: string) =>
  (TABLE_ROW.exec(row)?.[1] ?? '')
    .split('|')
    .map((cell) => parseLegalSpans(cell.trim()));

/**
 * The page owns the only `h1`, so a document heading starts at `h2`. Levels
 * below `h4` are folded into it: a flat legal document gains nothing from a
 * fifth rank, and an outline that skips ranks is worse than one that repeats.
 */
const headingLevel = (hashes: string): 2 | 3 | 4 =>
  hashes.length <= 2 ? 2 : hashes.length === 3 ? 3 : 4;

export const parseLegalBlocks = (body: string): LegalBlock[] => {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let headings = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ kind: 'paragraph', spans: parseLegalSpans(paragraph.join(' ')) });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      headings += 1;
      blocks.push({
        kind: 'heading',
        level: headingLevel(heading[1]),
        id: `legal-section-${headings}`,
        spans: parseLegalSpans(heading[2].trim()),
      });
      continue;
    }

    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[index + 1] ?? '')) {
      flushParagraph();
      const columns = cellsOf(line);
      const rows: LegalSpan[][][] = [];
      index += 2;
      while (index < lines.length && TABLE_ROW.test(lines[index])) {
        rows.push(cellsOf(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push({ kind: 'table', columns, rows });
      continue;
    }

    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      flushParagraph();
      const pattern = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      while (index < lines.length && lines[index].trim()) {
        const item = pattern.exec(lines[index]);
        if (item) {
          items.push(item[1].trim());
        } else if (
          items.length &&
          !HEADING.test(lines[index]) &&
          !TABLE_ROW.test(lines[index]) &&
          !ORDERED.test(lines[index]) &&
          !BULLET.test(lines[index])
        ) {
          // A wrapped item. The authors write to a column width, so most items
          // longer than a clause continue on the next line; treating that line
          // as a new paragraph broke the list in half.
          items[items.length - 1] += ` ${lines[index].trim()}`;
        } else {
          break;
        }
        index += 1;
      }
      index -= 1;
      blocks.push({
        kind: 'list',
        ordered,
        items: items.map((item) => parseLegalSpans(item)),
      });
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
};

const LEADING_TITLE = /^\s*#\s+(.*)$/;

/**
 * The page renders the document's name as its own `h1`, so a `# ` heading at
 * the top of the body is the same name written twice. It is lifted out here
 * rather than styled away, so the outline has one `h1` instead of one visible
 * and one silent. When the front matter carries no title, that heading becomes
 * it — a document is never left nameless.
 */
const liftTitle = (body: string) => {
  const lines = body.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim());
  const heading = first === -1 ? null : LEADING_TITLE.exec(lines[first]);
  if (!heading) return { title: '', body };
  lines.splice(first, 1);
  return { title: heading[1].trim(), body: lines.join('\n') };
};

export const parseLegalDocument = (source: string): LegalDocument => {
  const matter = FRONT_MATTER.exec(source);
  const fields: Record<string, string> = {};

  for (const line of (matter?.[1] ?? '').split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (field) fields[field[1].toLowerCase()] = unquote(field[2]);
  }

  const lifted = liftTitle(source.slice(matter?.[0].length ?? 0));

  return {
    title: fields.title || lifted.title,
    updated: fields.updated ?? '',
    language: fields.language ?? '',
    blocks: parseLegalBlocks(lifted.body),
  };
};
