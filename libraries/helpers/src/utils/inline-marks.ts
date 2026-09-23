/**
 * Inline marks of a stored adaptation body — one grammar for the page, the
 * editor and the post (`content-factory-next-97dq.52`, `97dq.75`).
 *
 * The body is plain text. Until this wave it carried one mark, `**bold**`
 * (`bold-markers.ts`), and a link only as its bare address. The owner asked
 * for italic, underline and a link with its own words in the adaptation
 * editor, and every mark has to survive the trip to the channel, so the
 * grammar grows by three forms and still lives in one place:
 *
 *  - `**bold**` — unchanged, the same pair as `bold-markers.ts`;
 *  - `_italic_` — Markdown's own form, only at a word boundary, so
 *    `snake_case` and `@some_user` stay text;
 *  - `++underline++` — the `markdown-it-ins` form, also only at a word
 *    boundary, so `C++` stays text;
 *  - `[words](https://…)` — a link with its own words; the address is http(s)
 *    only. A bare `https://…` address stays a link to itself, as before.
 *
 * Addresses are parsed first and masked, so a mark character inside a URL
 * (`https://a.com/_x_`) never becomes a mark. Every regular expression is
 * built per call, for the reason `bold-markers.ts` gives: a shared `g` regexp
 * keeps `lastIndex` between callers.
 */

import { BOLD_PAIR_SOURCE, STRAY_BOLD_MARKER_SOURCE } from './bold-markers';

export type InlineMarkName = 'bold' | 'italic' | 'underline';

export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'mark'; mark: InlineMarkName; children: InlineNode[] }
  | { kind: 'link'; href: string; children: InlineNode[] }
  | { kind: 'url'; href: string };

/** One flat run: the text and everything that applies to it. */
export type InlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  href?: string;
};

/** A bare address: http(s) only, up to whitespace; trailing punctuation is not the address. */
export const INLINE_URL_SOURCE = 'https?:\\/\\/[^\\s<>"«»]+';
const LINK_TOKEN_SOURCE =
  '\\[([^\\[\\]\\n]+)\\]\\((https?:\\/\\/[^\\s()<>"«»]+)\\)';
/*
  Trailing punctuation is not the address, and neither is a closing mark
  (`97dq.75` review P1-1): `**see https://a.com**` must close its bold, not
  publish `**` as the end of the address.
*/
const TRAILING_CLASS = `.,;:!?'")\\]*_+`;
const TRAILING_PUNCTUATION = new RegExp(`[${TRAILING_CLASS}]+$`, 'u');
const ONLY_TRAILING = new RegExp(`^[${TRAILING_CLASS}]*$`, 'u');

const UNDERLINE_PAIR_SOURCE =
  '(?<![\\p{L}\\p{N}+])\\+\\+([^\\s+\\n](?:[^+\\n]*[^\\s+\\n])?)\\+\\+(?![\\p{L}\\p{N}+])';
const ITALIC_PAIR_SOURCE =
  '(?<![\\p{L}\\p{N}_])_([^\\s_\\n](?:[^_\\n]*[^\\s_\\n])?)_(?![\\p{L}\\p{N}_])';

/**
 * Stands for an address while marks are read: not a word, not a space, not a
 * mark. A private-use character the line does not already hold, so a literal
 * U+E000 in the text stays text (`97dq.75` review P3-10).
 */
const atomFor = (line: string): string => {
  for (let code = 0xe000; code <= 0xf8ff; code += 1) {
    const candidate = String.fromCharCode(code);
    if (!line.includes(candidate)) return candidate;
  }
  return '\u0000';
};

const PAIRS: ReadonlyArray<{ mark: InlineMarkName; source: string }> = [
  { mark: 'bold', source: BOLD_PAIR_SOURCE },
  { mark: 'underline', source: UNDERLINE_PAIR_SOURCE },
  { mark: 'italic', source: ITALIC_PAIR_SOURCE },
];

/** Whether an address may be a link target: http(s) with a host. */
export function isHttpUrl(value: string | null | undefined): boolean {
  const text = (value ?? '').trim();
  if (!/^https?:\/\//iu.test(text) || /\s/u.test(text)) return false;
  try {
    const url = new URL(text);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

type Atom =
  | { kind: 'link'; text: string; href: string }
  | { kind: 'url'; href: string };

/** Addresses and link tokens of one line, with the line where each stood masked. */
function maskAtoms(line: string): { masked: string; atoms: Atom[]; atom: string } {
  const atoms: Atom[] = [];
  const ATOM = atomFor(line);
  let masked = '';
  let read = 0;
  const pattern = new RegExp(`${LINK_TOKEN_SOURCE}|${INLINE_URL_SOURCE}`, 'giu');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    const start = match.index;
    if (match[1] !== undefined && match[2] !== undefined) {
      masked += line.slice(read, start) + ATOM;
      atoms.push({ kind: 'link', text: match[1], href: match[2] });
      read = start + match[0].length;
      continue;
    }
    // A closing bracket stays in the address when the opening one is in it too.
    const address = readBackAddress(match[0]);
    if (!address) continue;
    masked += line.slice(read, start) + ATOM;
    atoms.push({ kind: 'url', href: address });
    read = start + address.length;
    pattern.lastIndex = read;
  }
  masked += line.slice(read);
  return { masked, atoms, atom: ATOM };
}

/** The earliest pair in `text`; at one start, bold, then underline, then italic. */
function firstPair(
  text: string
): { mark: InlineMarkName; start: number; end: number; inner: string } | null {
  let best: { mark: InlineMarkName; start: number; end: number; inner: string } | null =
    null;
  for (const { mark, source } of PAIRS) {
    const found = new RegExp(source, 'u').exec(text);
    if (!found) continue;
    if (!best || found.index < best.start)
      best = {
        mark,
        start: found.index,
        end: found.index + found[0].length,
        inner: found[1],
      };
  }
  return best;
}

/** Marks of a masked string; atoms are handed out in order as they appear. */
function parseMasked(
  text: string,
  atoms: Atom[],
  next: { at: number },
  ATOM: string
): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pushText = (value: string) => {
    let read = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] !== ATOM) continue;
      if (index > read) nodes.push({ kind: 'text', text: value.slice(read, index) });
      const atom = atoms[next.at];
      next.at += 1;
      if (atom?.kind === 'link')
        nodes.push({ kind: 'link', href: atom.href, children: parseInline(atom.text) });
      else if (atom?.kind === 'url') nodes.push({ kind: 'url', href: atom.href });
      read = index + 1;
    }
    if (read < value.length) nodes.push({ kind: 'text', text: value.slice(read) });
  };
  let rest = text;
  while (rest) {
    const pair = firstPair(rest);
    if (!pair) {
      pushText(rest);
      break;
    }
    if (pair.start > 0) pushText(rest.slice(0, pair.start));
    nodes.push({
      kind: 'mark',
      mark: pair.mark,
      children: parseMasked(pair.inner, atoms, next, ATOM),
    });
    rest = rest.slice(pair.end);
  }
  return nodes;
}

/** One line of a stored body as a tree. Line breaks are the caller's business. */
export function parseInline(line: string): InlineNode[] {
  const { masked, atoms, atom } = maskAtoms(line || '');
  return parseMasked(masked, atoms, { at: 0 }, atom);
}

/** The tree flattened into runs, each with the marks and the link over it. */
export function inlineRuns(nodes: readonly InlineNode[]): InlineRun[] {
  const out: InlineRun[] = [];
  const walk = (list: readonly InlineNode[], active: Omit<InlineRun, 'text'>) => {
    for (const node of list) {
      if (node.kind === 'text') out.push({ ...active, text: node.text });
      else if (node.kind === 'url') out.push({ ...active, text: node.href, href: node.href });
      else if (node.kind === 'link') walk(node.children, { ...active, href: node.href });
      else walk(node.children, { ...active, [node.mark]: true });
    }
  };
  walk(nodes, {});
  return out.filter((run) => run.text.length > 0);
}

/* ---- Runs → stored text --------------------------------------------------- */

const MARK_ORDER: readonly InlineMarkName[] = ['bold', 'underline', 'italic'];
const MARK_SIGN: Record<InlineMarkName, string> = {
  bold: '**',
  underline: '++',
  italic: '_',
};
/** Characters a mark's content may not hold, and neighbours that break its boundary. */
const MARK_FORBIDDEN: Record<InlineMarkName, RegExp> = {
  bold: /\*/u,
  underline: /\+/u,
  italic: /_/u,
};
const MARK_BOUNDARY: Record<InlineMarkName, RegExp | null> = {
  bold: null,
  underline: /[\p{L}\p{N}+]/u,
  italic: /[\p{L}\p{N}_]/u,
};

type Piece = { stored: string; plain: string };

const sameLink = (a: InlineRun, b: InlineRun) => (a.href ?? '') === (b.href ?? '');

/**
 * The address as a link token accepts it: none of the characters that end a
 * token or an address — whitespace, brackets, quotes, angle and guillemet
 * quotes (`97dq.75` review P3-8).
 */
const tokenHref = (href: string) =>
  href.replace(/[\s()"<>«»]/gu, (char) => encodeURIComponent(char));

/** What a reader sees of runs — the text without any sign of a mark. */
const plainOf = (runs: readonly InlineRun[]) => runs.map((run) => run.text).join('');

/**
 * What follows, as the address parser will meet it: a link counts as a
 * character that is neither space nor punctuation, because it is one.
 */
const restOf = (runs: readonly InlineRun[]) =>
  runs.map((run) => (run.href ? 'L' : run.text)).join('');

/** An address as the reader cuts it: trailing punctuation off, a paired `)` kept. */
const readBackAddress = (candidate: string): string => {
  const tail = candidate.match(TRAILING_PUNCTUATION)?.[0] ?? '';
  const keepParen = tail.startsWith(')') && candidate.includes('(') ? 1 : 0;
  return candidate.slice(0, candidate.length - tail.length + keepParen);
};

/**
 * Whether a bare address stays itself when read back: the reader takes it up
 * to the next space and cuts trailing punctuation, so what follows it must be
 * cut away and nothing of the address may be (`97dq.75` review P1-1).
 */
const bareSurvives = (href: string, following: string): boolean => {
  const segment = following.match(/^[^\s<>"«»]*/u)?.[0] ?? '';
  if (segment && !ONLY_TRAILING.test(segment)) return false;
  return readBackAddress(href + segment) === href;
};

/**
 * Runs with the marks from `level` on, as stored text. The masked twin is
 * what the parser will see: an address inside counts as one neutral sign.
 */
function serializeMarks(
  runs: readonly InlineRun[],
  level: number,
  context: { before: string; after: string }
): Piece {
  if (level >= MARK_ORDER.length) return serializeLinks(runs, context.after);
  const mark = MARK_ORDER[level];
  const pieces: Piece[] = [];
  let index = 0;
  while (index < runs.length) {
    const on = Boolean(runs[index][mark]);
    let end = index;
    while (end < runs.length && Boolean(runs[end][mark]) === on) end += 1;
    const group = runs.slice(index, end);
    const before =
      index === 0 ? context.before : plainOf(runs.slice(0, index)).slice(-1);
    const after =
      end < runs.length ? restOf(runs.slice(end)) + context.after : context.after;
    pieces.push(
      on
        ? wrapMark(mark, group, level, { before, after })
        : serializeMarks(group, level + 1, { before, after })
    );
    index = end;
  }
  return {
    stored: pieces.map((piece) => piece.stored).join(''),
    plain: pieces.map((piece) => piece.plain).join(''),
  };
}

function wrapMark(
  mark: InlineMarkName,
  group: readonly InlineRun[],
  level: number,
  context: { before: string; after: string }
): Piece {
  const text = plainOf(group);
  const lead = text.match(/^\s*/u)?.[0] ?? '';
  const trail = text.slice(lead.length).match(/\s*$/u)?.[0] ?? '';
  const innerRuns = trimRuns(group, lead.length, trail.length);
  const inner = serializeMarks(innerRuns, level + 1, {
    before: lead ? ' ' : context.before,
    after: trail ? ' ' : context.after,
  });
  const boundary = MARK_BOUNDARY[mark];
  const masked = innerRuns
    .filter((run) => !run.href)
    .map((run) => run.text)
    .join('');
  const valid =
    inner.stored.length > 0 &&
    !/^\s|\s$/u.test(inner.plain) &&
    !/\n/u.test(inner.stored) &&
    !MARK_FORBIDDEN[mark].test(masked) &&
    (!boundary ||
      ((!lead ? !boundary.test(context.before) : true) &&
        (!trail ? !boundary.test(context.after.slice(0, 1)) : true)));
  // The mark cannot be written without changing the words: the words win.
  if (!valid) return serializeMarks(group, level + 1, context);
  const sign = MARK_SIGN[mark];
  return {
    stored: `${lead}${sign}${inner.stored}${sign}${trail}`,
    plain: text,
  };
}

/** Runs with `lead` characters cut from the start and `trail` from the end. */
function trimRuns(
  runs: readonly InlineRun[],
  lead: number,
  trail: number
): InlineRun[] {
  const out = runs.map((run) => ({ ...run }));
  let cut = lead;
  while (cut > 0 && out.length) {
    const first = out[0];
    if (first.text.length <= cut) {
      cut -= first.text.length;
      out.shift();
    } else {
      first.text = first.text.slice(cut);
      cut = 0;
    }
  }
  cut = trail;
  while (cut > 0 && out.length) {
    const last = out[out.length - 1];
    if (last.text.length <= cut) {
      cut -= last.text.length;
      out.pop();
    } else {
      last.text = last.text.slice(0, last.text.length - cut);
      cut = 0;
    }
  }
  return out;
}

/** Runs without marks at this level: links become tokens, the rest is text. */
function serializeLinks(runs: readonly InlineRun[], after = ''): Piece {
  let stored = '';
  let plain = '';
  let index = 0;
  while (index < runs.length) {
    const run = runs[index];
    if (!run.href) {
      stored += run.text;
      plain += run.text;
      index += 1;
      continue;
    }
    let end = index;
    while (end < runs.length && sameLink(runs[end], run)) end += 1;
    const text = plainOf(runs.slice(index, end));
    const following = restOf(runs.slice(end)) + after;
    stored +=
      text === run.href && isHttpUrl(run.href) && !bareSurvives(run.href, following)
        ? `[${text.replace(/\[/gu, '(').replace(/\]/gu, ')')}](${tokenHref(run.href)})`
        : linkToken(text, run.href);
    plain += text;
    index = end;
  }
  return { stored, plain };
}

/**
 * One link, as stored. An address written as itself stays bare, as it always
 * was; so does a bare host the editor autolinked (`example.com`). Anything
 * else is a token; an address that is not http(s) is dropped and the words
 * stay.
 */
function linkToken(text: string, href: string): string {
  if (!isHttpUrl(href)) return text;
  if (text === href) return text;
  if (/^https?:\/\//iu.test(href) && href.replace(/^https?:\/\//iu, '') === text)
    return text;
  const words = text.replace(/\[/gu, '(').replace(/\]/gu, ')').replace(/\n/gu, ' ');
  if (!words.trim()) return '';
  return `[${words}](${tokenHref(href)})`;
}

/**
 * Runs of one line back into stored text. A mark that cannot be written
 * without changing the words (italic glued to a letter, bold over a `*`) is
 * dropped rather than published as signs.
 */
export function serializeInline(runs: readonly InlineRun[]): string {
  const merged: InlineRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      Boolean(last.bold) === Boolean(run.bold) &&
      Boolean(last.italic) === Boolean(run.italic) &&
      Boolean(last.underline) === Boolean(run.underline) &&
      sameLink(last, run)
    )
      last.text += run.text;
    else merged.push({ ...run });
  }
  return serializeMarks(merged, 0, { before: '', after: '' }).stored;
}

/* ---- Tree → what a channel shows ------------------------------------------ */

const escapeHtml = (value: string) =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

/** A lone `**` glued to a word was written as markup: it never reaches a post. */
const withoutStrayBold = (text: string) =>
  text.replace(new RegExp(STRAY_BOLD_MARKER_SOURCE, 'gu'), '');

const HTML_TAG: Record<InlineMarkName, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
};

/** One line as channel HTML: `<strong>`, `<em>`, `<u>`, `<a href>`; text escaped. */
export function inlineHtml(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text') return escapeHtml(withoutStrayBold(node.text));
      if (node.kind === 'url') return escapeHtml(node.href);
      if (node.kind === 'link') {
        const inner = inlineHtml(node.children);
        return isHttpUrl(node.href)
          ? `<a href="${escapeHtml(node.href)}">${inner}</a>`
          : inner;
      }
      const tag = HTML_TAG[node.mark];
      return `<${tag}>${inlineHtml(node.children)}</${tag}>`;
    })
    .join('');
}

/**
 * One line with no marks at all, for channels that show none. A link keeps
 * its address after its words, so the reader can still follow it.
 */
export function inlinePlain(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text') return withoutStrayBold(node.text);
      if (node.kind === 'url') return node.href;
      if (node.kind === 'link') {
        const words = inlinePlain(node.children);
        return words.trim() && words !== node.href
          ? `${words} (${node.href})`
          : node.href;
      }
      return inlinePlain(node.children);
    })
    .join('');
}

/**
 * One line for a Markdown channel: bold and italic stay its own syntax, a
 * link stays `[words](address)`, underline has no Markdown and loses its signs.
 */
export function inlineMarkdown(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text') return withoutStrayBold(node.text);
      if (node.kind === 'url') return node.href;
      if (node.kind === 'link')
        return `[${inlineMarkdown(node.children)}](${tokenHref(node.href)})`;
      const inner = inlineMarkdown(node.children);
      if (node.mark === 'underline') return inner;
      return `${MARK_SIGN[node.mark]}${inner}${MARK_SIGN[node.mark]}`;
    })
    .join('');
}

/** A stored body with every sign of a mark removed: what the reader counts. */
export const stripInlineMarks = (text: string): string =>
  (text || '')
    .split('\n')
    .map((line) => {
      const nodes = parseInline(line);
      const plain = (list: readonly InlineNode[]): string =>
        list
          .map((node) =>
            node.kind === 'text'
              ? withoutStrayBold(node.text)
              : node.kind === 'url'
              ? node.href
              : plain(node.children)
          )
          .join('');
      return plain(nodes);
    })
    .join('\n');
