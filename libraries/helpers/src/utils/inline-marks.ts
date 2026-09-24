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
 *
 * Escapes (`content-factory-next-97dq.77`): a backslash before one of
 * `\ * _ + [ ]` makes that character text. The editor writes them only
 * where a person's own characters would otherwise read back as a mark or a
 * link — `**x**`, `_x_`, `++x++` or `[a](https://…)` typed as text — and
 * inside link words, which may now hold square brackets. A body that reads
 * back as it was written gets no escapes, so opening and closing the editor
 * still changes nothing.
 */

import { BOLD_PAIR_SOURCE, STRAY_BOLD_MARKER_SOURCE } from './bold-markers';

export type InlineMarkName = 'bold' | 'italic' | 'underline';

export type InlineNode =
  /** `literal` — escaped signs (`97dq.77`): text as written, never markup. */
  | { kind: 'text'; text: string; literal?: true }
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
  '\\[((?:\\\\[\\\\\\[\\]*_+]|[^\\[\\]\\n\\\\]|\\\\(?![\\\\\\[\\]*_+]))+)\\]\\((https?:\\/\\/[^\\s()<>"«»]+)\\)';
/** A backslash and the character it makes text. */
const ESCAPE_SOURCE = '\\\\([\\\\\\[\\]*_+])';
/** The characters an escape may stand before. */
const ESCAPABLE = /[\\[\]*_+]/gu;
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
  | { kind: 'url'; href: string }
  | { kind: 'escape'; char: string };

/**
 * Addresses and link tokens of one line, with the line where each stood
 * masked. With `escapes` off a backslash is plain text: the capture group of
 * the escape alternative stays, so the groups keep their numbers, but it can
 * never match.
 */
function maskAtoms(
  line: string,
  escapes: boolean
): { masked: string; atoms: Atom[]; atom: string } {
  const atoms: Atom[] = [];
  const ATOM = atomFor(line);
  let masked = '';
  let read = 0;
  const pattern = new RegExp(
    `${escapes ? ESCAPE_SOURCE : '((?!))'}|${LINK_TOKEN_SOURCE}|${INLINE_URL_SOURCE}`,
    'giu'
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    const start = match.index;
    if (match[1] !== undefined) {
      masked += line.slice(read, start) + ATOM;
      atoms.push({ kind: 'escape', char: match[1] });
      read = start + match[0].length;
      continue;
    }
    if (match[2] !== undefined && match[3] !== undefined) {
      masked += line.slice(read, start) + ATOM;
      atoms.push({ kind: 'link', text: match[2], href: match[3] });
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
  // Text next to text is one node; escaped characters are their own
  // `literal` nodes, so no later rule (a stray `**`) reads them as markup.
  const addText = (text: string, literal = false) => {
    if (!text) return;
    const last = nodes[nodes.length - 1];
    if (last?.kind === 'text' && Boolean(last.literal) === literal) last.text += text;
    else nodes.push(literal ? { kind: 'text', text, literal: true } : { kind: 'text', text });
  };
  const pushText = (value: string) => {
    let read = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] !== ATOM) continue;
      if (index > read) addText(value.slice(read, index));
      const atom = atoms[next.at];
      next.at += 1;
      if (atom?.kind === 'escape') addText(atom.char, true);
      else if (atom?.kind === 'link')
        nodes.push({ kind: 'link', href: atom.href, children: parseLinkWords(atom.text) });
      else if (atom?.kind === 'url') nodes.push({ kind: 'url', href: atom.href });
      read = index + 1;
    }
    if (read < value.length) addText(value.slice(read));
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

function parseLine(line: string, escapes: boolean): InlineNode[] {
  const { masked, atoms, atom } = maskAtoms(line, escapes);
  return parseMasked(masked, atoms, { at: 0 }, atom);
}

/** Every escape of a line replaced by the character it stands before. */
const unescapeOf = (line: string): string =>
  line.replace(new RegExp(ESCAPE_SOURCE, 'gu'), '$1');

/** What a reader sees of a line read with backslashes as plain text. */
const plainWithoutEscapes = (line: string): string =>
  plainOf(inlineRuns(parseLine(line, false)));

/**
 * Whether the escapes of a line are the editor's (`97dq.77`) or a person's
 * own backslashes written before this wave (review F4 of the fourteenth walk).
 *
 * The editor escapes a line only when its signs would otherwise read back as
 * a mark or a link, so its escapes always matter: take them away and the line
 * reads differently. A body stored before the wave — `2\*3`, `snake\_case`,
 * `\\server\share`, `a \[b\] c` — reads the same with or without them, and
 * then every backslash of the line is the person's own text and stays, which
 * is how such a body rendered and round-tripped before. Inside link words an
 * escaped square bracket is always the editor's: the token cannot hold a bare one.
 *
 * The boundary this leaves: a person's own backslash-sign pairs on a line that
 * also has to be escaped by the editor (`\*\*x\*\*` typed as text, meant as
 * text) have no stored form that reads back exactly; they read as `**x**`.
 */
function escapesHonoured(line: string, linkWords: boolean): boolean {
  const escapes = [...line.matchAll(new RegExp(ESCAPE_SOURCE, 'gu'))];
  if (!escapes.length) return false;
  if (linkWords && escapes.some((match) => match[1] === '[' || match[1] === ']'))
    return true;
  return (
    unescapeOf(plainWithoutEscapes(line)) !==
    plainWithoutEscapes(unescapeOf(line))
  );
}

/** One line of a stored body as a tree. Line breaks are the caller's business. */
export function parseInline(line: string): InlineNode[] {
  const text = line || '';
  return parseLine(text, escapesHonoured(text, false));
}

/** The words of a link token as a tree (`[words](https://…)`). */
function parseLinkWords(words: string): InlineNode[] {
  return parseLine(words, escapesHonoured(words, true));
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
  // Neighbours with the same marks and link are one run (an escaped sign is
  // its own node, not its own run).
  const merged: InlineRun[] = [];
  for (const run of out) {
    if (!run.text) continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      Boolean(last.bold) === Boolean(run.bold) &&
      Boolean(last.italic) === Boolean(run.italic) &&
      Boolean(last.underline) === Boolean(run.underline) &&
      (last.href ?? '') === (run.href ?? '')
    )
      last.text += run.text;
    else merged.push({ ...run });
  }
  return merged;
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
 * How much of a person's own text is written with escapes (`97dq.77`):
 *
 *  - `none` — as it is; what a body read from storage gets when it reads
 *    back the same, so a no-op trip through the editor changes nothing;
 *  - `brackets` — inside link words: `[` and `]` (the token's own signs),
 *    and a backslash that would otherwise start an escape;
 *  - `all` — every sign of the grammar, for a line whose text would
 *    otherwise read back as a mark or a link. Addresses are left whole.
 */
type EscapeMode = 'none' | 'brackets' | 'all';

const escapeText = (text: string, mode: EscapeMode): string => {
  if (mode === 'none' || !text) return text;
  if (mode === 'brackets')
    return text.replace(/[[\]]|\\(?=[\\[\]*_+])/gu, (char) => `\\${char}`);
  const address = new RegExp(INLINE_URL_SOURCE, 'giu');
  let out = '';
  let read = 0;
  let match: RegExpExecArray | null;
  while ((match = address.exec(text))) {
    out += text.slice(read, match.index).replace(ESCAPABLE, (char) => `\\${char}`);
    out += match[0];
    read = match.index + match[0].length;
  }
  return out + text.slice(read).replace(ESCAPABLE, (char) => `\\${char}`);
};

type SerializeContext = { before: string; after: string; escape: EscapeMode };

/**
 * Runs with the marks from `level` on, as stored text. The masked twin is
 * what the parser will see: an address inside counts as one neutral sign.
 *
 * A link whose words carry this mark only in part is kept whole
 * (`97dq.77`): `[a **b**](u)` used to come back as `[a ](u)**[b](u)**`, the
 * link cut in two around the bold. Such a link is written as one token with
 * the mark inside its words.
 */
function serializeMarks(
  runs: readonly InlineRun[],
  level: number,
  context: SerializeContext
): Piece {
  if (level >= MARK_ORDER.length)
    return serializeLinks(runs, context.after, context.escape);
  const mark = MARK_ORDER[level];
  const onAt = runs.map((run) => Boolean(run[mark]));
  for (let start = 0; start < runs.length; ) {
    if (!runs[start].href) {
      start += 1;
      continue;
    }
    let stop = start;
    while (stop < runs.length && runs[stop].href && sameLink(runs[stop], runs[start]))
      stop += 1;
    const values = onAt.slice(start, stop);
    if (values.some(Boolean) && !values.every(Boolean))
      for (let at = start; at < stop; at += 1) onAt[at] = false;
    start = stop;
  }
  const pieces: Piece[] = [];
  let index = 0;
  while (index < runs.length) {
    const on = onAt[index];
    let end = index;
    while (end < runs.length && onAt[end] === on) end += 1;
    const group = runs.slice(index, end);
    const before =
      index === 0 ? context.before : plainOf(runs.slice(0, index)).slice(-1);
    const after =
      end < runs.length ? restOf(runs.slice(end)) + context.after : context.after;
    pieces.push(
      on
        ? wrapMark(mark, group, level, { before, after, escape: context.escape })
        : serializeMarks(group, level + 1, { before, after, escape: context.escape })
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
  context: SerializeContext
): Piece {
  const text = plainOf(group);
  const lead = text.match(/^\s*/u)?.[0] ?? '';
  const trail = text.slice(lead.length).match(/\s*$/u)?.[0] ?? '';
  const innerRuns = trimRuns(group, lead.length, trail.length);
  const inner = serializeMarks(innerRuns, level + 1, {
    before: lead ? ' ' : context.before,
    after: trail ? ' ' : context.after,
    escape: context.escape,
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
    (context.escape === 'all' || !MARK_FORBIDDEN[mark].test(masked)) &&
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
function serializeLinks(
  runs: readonly InlineRun[],
  after = '',
  escape: EscapeMode = 'none'
): Piece {
  let stored = '';
  let plain = '';
  let index = 0;
  while (index < runs.length) {
    const run = runs[index];
    if (!run.href) {
      stored += escapeText(run.text, escape);
      plain += run.text;
      index += 1;
      continue;
    }
    let end = index;
    while (end < runs.length && sameLink(runs[end], run)) end += 1;
    const group = runs.slice(index, end);
    const text = plainOf(group);
    const following = restOf(runs.slice(end)) + after;
    stored +=
      text === run.href && isHttpUrl(run.href) && !bareSurvives(run.href, following)
        ? `[${escapeText(text, 'brackets')}](${tokenHref(run.href)})`
        : linkToken(group, text, run.href, escape);
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
 *
 * Link words keep their square brackets, escaped (`97dq.77`: they used to
 * become round ones), and a mark over part of the words is written inside
 * the token.
 */
function linkToken(
  group: readonly InlineRun[],
  text: string,
  href: string,
  escape: EscapeMode
): string {
  if (!isHttpUrl(href)) return escapeText(text, escape);
  const mixed = MARK_ORDER.filter(
    (mark) => group.some((run) => run[mark]) && !group.every((run) => run[mark])
  );
  if (!mixed.length) {
    if (text === href) return text;
    if (/^https?:\/\//iu.test(href) && href.replace(/^https?:\/\//iu, '') === text)
      return text;
  }
  const words = mixed.length
    ? serializeLine(
        group.map((run) => {
          const inner: InlineRun = { text: run.text.replace(/\n/gu, ' ') };
          for (const mark of mixed) if (run[mark]) inner[mark] = true;
          return inner;
        }),
        'brackets'
      )
    : escapeText(text.replace(/\n/gu, ' '), escape === 'all' ? 'all' : 'brackets');
  if (!words.trim()) return '';
  return `[${words}](${tokenHref(href)})`;
}

/**
 * One line of runs as stored text, with the fewest escapes that read back
 * the same words (`97dq.77`). Written plainly first; if the stored text then
 * reads back with other words — a person's `**x**`, `_x_`, `++x++` or
 * `[a](https://…)` turned into a mark or a link — the line is written again
 * with its signs escaped.
 */
function serializeLine(runs: readonly InlineRun[], base: 'none' | 'brackets'): string {
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
  const write = (escape: EscapeMode) =>
    serializeMarks(merged, 0, { before: '', after: '', escape }).stored;
  const plain = write(base);
  const wanted = plainOf(merged);
  const readBack = (stored: string) =>
    plainOf(inlineRuns(parseInline(base === 'brackets' ? `[${stored}](https://x.invalid)` : stored)));
  if (readBack(plain) === wanted) return plain;
  return write('all');
}

/**
 * Runs of one line back into stored text. A mark that cannot be written
 * without changing the words (italic glued to a letter, bold over a `*`) is
 * dropped rather than published as signs; a person's own signs that would
 * read back as a mark are escaped (`97dq.77`).
 */
export function serializeInline(runs: readonly InlineRun[]): string {
  return serializeLine(runs, 'none');
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
      if (node.kind === 'text')
        return escapeHtml(node.literal ? node.text : withoutStrayBold(node.text));
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
      if (node.kind === 'text')
        return node.literal ? node.text : withoutStrayBold(node.text);
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

/** Text that would read as a mark or a link, with its signs escaped. */
const markdownText = (text: string): string =>
  plainOf(inlineRuns(parseInline(text))) === text ? text : escapeText(text, 'all');

/**
 * Whether a stored line holds an escape the editor wrote (`97dq.77`). A
 * backslash stored before the wave is text, and its line keeps the old path.
 */
export const hasInlineEscape = (line: string): boolean =>
  escapesHonoured(line || '', false);

/**
 * One line for a Markdown channel: bold and italic stay its own syntax, a
 * link stays `[words](address)`, underline has no Markdown and loses its signs.
 */
export function inlineMarkdown(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      // A person's own signs (`97dq.77`) stay text in Markdown too: escaped
      // only where the channel would otherwise read them as a mark or a link.
      if (node.kind === 'text')
        return node.literal
          ? escapeText(node.text, 'all')
          : markdownText(withoutStrayBold(node.text));
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
              ? node.literal
                ? node.text
                : withoutStrayBold(node.text)
              : node.kind === 'url'
              ? node.href
              : plain(node.children)
          )
          .join('');
      return plain(nodes);
    })
    .join('\n');
