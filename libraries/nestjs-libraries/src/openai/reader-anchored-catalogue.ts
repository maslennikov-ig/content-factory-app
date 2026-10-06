import { createHash } from 'node:crypto';

export const READER_CATALOGUE_MAX_SCAN_UNITS = 16_000_000;
const MAX_IDS = 96;
const MAX_CHARS = 3000;
const MAX_WINDOW_UNITS = 4_000_000;
type Source = {
  id: string;
  title: string;
  publishedAt: string | null;
  clipped: boolean;
  excerpt: string;
  excerptSha256: string;
};
export type CatalogueEvidence = {
  subject: string;
  requestedDate: string | null;
  sources: Source[];
  bounds: Record<string, number>;
};
export type CatalogueAnchor = {
  id: string;
  source: string;
  start: number;
  end: number;
  quote: string;
  excerptSha256: string;
  role: 'core' | 'date' | 'bridge';
};
type DateSpan = { start: number; end: number; date: string };
export class CataloguePreparationError extends Error {
  constructor(
    readonly code:
      | 'catalogue_bounds'
      | 'catalogue_date_anchor'
      | 'catalogue_integrity'
  ) {
    super(code);
  }
}
export const catalogueHash = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const safeStart = (text: string, cut: number) =>
  cut > 0 &&
  /[\uDC00-\uDFFF]/.test(text[cut]) &&
  /[\uD800-\uDBFF]/.test(text[cut - 1])
    ? cut - 1
    : cut;
const safeEnd = (text: string, cut: number) =>
  cut < text.length &&
  /[\uD800-\uDBFF]/.test(text[cut - 1]) &&
  /[\uDC00-\uDFFF]/.test(text[cut])
    ? cut + 1
    : cut;
const unique = (text: string, quote: string) => {
  const first = text.indexOf(quote);
  return !!quote && first >= 0 && text.indexOf(quote, first + 1) === -1;
};
const datePatterns = [
  /(?<![\p{L}\p{N}])\d{4}-\d{2}-\d{2}(?![\p{L}\p{N}])/gu,
  /(?<![\p{L}\p{N}])\d{1,2}\.\d{1,2}\.\d{4}(?![\p{L}\p{N}])/gu,
  /(?<![\p{L}\p{N}])\d{1,2}\s*[а-яa-z]+\s*\d{4}(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}])[a-z]+\s*\d{1,2}(?:,\s*|\s+)\d{4}(?![\p{L}\p{N}])/giu,
];

/** UTF-16 suffix index: two linear counting sorts per doubling, then Kasai LCP. */
function uniqueLengths(text: string, work: { suffixUnits: number }) {
  const n = text.length;
  let order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => {
    work.suffixUnits++;
    return text.charCodeAt(a) - text.charCodeAt(b);
  });
  let ranks = new Int32Array(n),
    classes = 0;
  for (let i = 0; i < n; i++) {
    if (i && text.charCodeAt(order[i]) !== text.charCodeAt(order[i - 1]))
      classes++;
    ranks[order[i]] = classes;
  }
  classes++;
  const sortBy = (input: number[], key: (i: number) => number) => {
    const count = new Int32Array(classes + 1),
      output = new Array<number>(n);
    for (const i of input) {
      count[key(i)]++;
      work.suffixUnits++;
    }
    let sum = 0;
    for (let i = 0; i < count.length; i++) {
      const size = count[i];
      count[i] = sum;
      sum += size;
      work.suffixUnits++;
    }
    for (const i of input) {
      output[count[key(i)]++] = i;
      work.suffixUnits++;
    }
    return output;
  };
  for (let width = 1; classes < n; width *= 2) {
    order = sortBy(order, (i) => (i + width < n ? ranks[i + width] + 1 : 0));
    order = sortBy(order, (i) => ranks[i] + 1);
    const next = new Int32Array(n);
    let nextClasses = 1;
    for (let i = 1; i < n; i++) {
      const a = order[i - 1],
        b = order[i];
      if (
        ranks[a] !== ranks[b] ||
        (a + width < n ? ranks[a + width] : -1) !==
          (b + width < n ? ranks[b + width] : -1)
      )
        nextClasses++;
      next[b] = nextClasses - 1;
      work.suffixUnits++;
    }
    ranks = next;
    classes = nextClasses;
  }
  const position = new Int32Array(n),
    lcp = new Int32Array(n + 1),
    lengths = new Int32Array(n);
  for (let i = 0; i < n; i++) position[order[i]] = i;
  let common = 0;
  for (let i = 0; i < n; i++) {
    const at = position[i];
    if (!at) {
      common = 0;
      continue;
    }
    const other = order[at - 1];
    while (
      i + common < n &&
      other + common < n &&
      text[i + common] === text[other + common]
    ) {
      common++;
      work.suffixUnits++;
    }
    lcp[at] = common;
    if (common) common--;
  }
  for (let i = 0; i < n; i++)
    lengths[i] = Math.max(lcp[position[i]], lcp[position[i] + 1]) + 1;
  return lengths;
}

export function buildReaderCatalogue(
  evidence: CatalogueEvidence,
  tools: {
    datesIn: (text: string) => string[];
    dateContext: (text: string, start: number, end: number) => string;
  },
  fits: (view: unknown) => boolean
) {
  const work = {
    dateScanUnits: 0,
    suffixUnits: 0,
    windowUnits: 0,
    completeDateSpans: 0,
    anchoredDateSpans: 0,
  };
  const dateCache = new Map<string, string[]>();
  const datesIn = (text: string) => {
    const cached = dateCache.get(text);
    if (cached) return cached;
    work.dateScanUnits += text.length;
    if (work.dateScanUnits > READER_CATALOGUE_MAX_SCAN_UNITS)
      throw new CataloguePreparationError('catalogue_bounds');
    const dates = tools.datesIn(text);
    if (dateCache.size >= 128) dateCache.delete(dateCache.keys().next().value!);
    dateCache.set(text, dates);
    return dates;
  };
  const compatible = (
    text: string,
    start: number,
    end: number,
    date?: string
  ) => {
    const dates = datesIn(text.slice(start, end));
    return (
      dates.length === 1 &&
      (!date || dates[0] === date) &&
      datesIn(tools.dateContext(text, start, end)).includes(dates[0])
    );
  };
  const anchors: CatalogueAnchor[] = [];
  const bySpan = new Map<string, CatalogueAnchor>();
  const prepared: Array<{
    source: Source;
    spans: DateSpan[];
    parts: Array<{ start: number; end: number }>;
    bridges: Array<[number, number]>;
  }> = [];
  const add = (
    source: Source,
    start: number,
    end: number,
    role: CatalogueAnchor['role']
  ) => {
    const key = `${source.id}:${start}:${end}`,
      existing = bySpan.get(key);
    if (existing) {
      if (role !== 'bridge') existing.role = role;
      return existing;
    }
    const quote = source.excerpt.slice(start, end);
    if (
      !unique(source.excerpt, quote) ||
      quote.length > MAX_CHARS ||
      /[\uDC00-\uDFFF]/.test(source.excerpt[start]) ||
      /[\uD800-\uDBFF]/.test(source.excerpt[end - 1]) ||
      start !== safeStart(source.excerpt, start) ||
      end !== safeEnd(source.excerpt, end)
    )
      throw new CataloguePreparationError('catalogue_integrity');
    if (anchors.length >= MAX_IDS)
      throw new CataloguePreparationError('catalogue_bounds');
    const anchor: CatalogueAnchor = {
      id: `K${anchors.length.toString(36)}`,
      source: source.id,
      start,
      end,
      quote,
      excerptSha256: source.excerptSha256,
      role,
    };
    anchors.push(anchor);
    bySpan.set(key, anchor);
    return anchor;
  };
  if (!evidence.sources.length || evidence.sources.length > 8)
    throw new CataloguePreparationError('catalogue_bounds');
  for (const source of evidence.sources) {
    const text = source.excerpt;
    if (
      !text.length ||
      text.length > MAX_CHARS ||
      catalogueHash(text) !== source.excerptSha256
    )
      throw new CataloguePreparationError('catalogue_integrity');
    const spanMap = new Map<string, DateSpan>();
    for (const pattern of datePatterns)
      for (const m of text.matchAll(pattern)) {
        const start = m.index!,
          end = start + m[0].length,
          dates = datesIn(m[0]);
        if (
          dates.length === 1 &&
          datesIn(tools.dateContext(text, start, end)).includes(dates[0])
        )
          spanMap.set(`${start}:${end}`, { start, end, date: dates[0] });
      }
    const spans = [...spanMap.values()].sort((a, b) => a.start - b.start);
    work.completeDateSpans += spans.length;
    const legal = new Uint8Array(text.length + 1).fill(1);
    for (let cut = 0; cut <= text.length; cut++)
      if (cut !== safeStart(text, cut) || cut !== safeEnd(text, cut))
        legal[cut] = 0;
    for (const span of spans)
      for (let cut = span.start + 1; cut < span.end; cut++) legal[cut] = 0;
    const nextLegal = new Int32Array(text.length + 2).fill(text.length + 1);
    for (let cut = text.length; cut >= 0; cut--)
      nextLegal[cut] = legal[cut] ? cut : nextLegal[cut + 1];
    const parts: Array<{ start: number; end: number }> = [];
    let from = 0;
    while (from < text.length) {
      const target = Math.min(text.length, from + 420);
      let end = target;
      if (target < text.length) {
        const candidates: Array<{ end: number; structural: boolean }> = [];
        for (
          let i = Math.min(text.length, from + 260);
          i < Math.min(text.length, from + 620);
          i++
        )
          if (/\s/.test(text[i]) && legal[i + 1])
            candidates.push({
              end: i + 1,
              structural: /[.!?:;\n]/.test(text[i - 1] || ''),
            });
        const structural = candidates.filter((p) => p.structural),
          pool = structural.length ? structural : candidates;
        if (pool.length)
          end = pool.sort(
            (a, b) =>
              Math.abs(a.end - target) - Math.abs(b.end - target) ||
              a.end - b.end
          )[0].end;
        end = nextLegal[safeEnd(text, end)];
      }
      if (end > text.length || end <= from)
        throw new CataloguePreparationError('catalogue_integrity');
      parts.push({ start: from, end });
      from = end;
    }
    const lengths = spans.length ? uniqueLengths(text, work) : null;
    const bridges: Array<[number, number]> = [];
    for (let i = 0; i < parts.length; i++) {
      let left = i,
        right = i;
      while (!unique(text, text.slice(parts[left].start, parts[right].end))) {
        if (left === 0 && right === parts.length - 1) break;
        if (left > 0) left--;
        else right++;
        if (
          right < parts.length - 1 &&
          !unique(text, text.slice(parts[left].start, parts[right].end))
        )
          right++;
      }
      add(source, parts[left].start, parts[right].end, 'core');
      if (
        i + 1 < parts.length &&
        unique(text, text.slice(parts[i].start, parts[i + 1].end))
      )
        bridges.push([parts[i].start, parts[i + 1].end]);
    }
    for (const span of spans) {
      // A previously certified unique anchor can cover repeated identical dates.
      let found = anchors.find(
        (a) =>
          a.source === source.id &&
          a.start <= span.start &&
          a.end >= span.end &&
          compatible(text, a.start, a.end, span.date)
      );
      if (!found) {
        const before = spans.filter(
          (d) => d.date !== span.date && d.end <= span.start
        );
        const after = spans.filter(
          (d) => d.date !== span.date && d.start >= span.end
        );
        const floor = before.length ? Math.max(...before.map((d) => d.end)) : 0;
        const ceiling = after.length
          ? Math.min(...after.map((d) => d.start))
          : text.length;
        let best: { start: number; end: number } | null = null;
        for (let start = span.start; start >= floor; start--) {
          if (++work.windowUnits > MAX_WINDOW_UNITS)
            throw new CataloguePreparationError('catalogue_bounds');
          if (best && span.end - start > best.end - best.start) break;
          if (!legal[start]) continue;
          let end = nextLegal[Math.max(span.end, start + lengths![start])];
          while (
            end <= ceiling &&
            end - start <= MAX_CHARS &&
            (!best || end - start <= best.end - best.start)
          ) {
            if (compatible(text, start, end, span.date)) {
              if (
                !best ||
                end - start < best.end - best.start ||
                (end - start === best.end - best.start && start < best.start)
              )
                best = { start, end };
              break;
            }
            if (++work.windowUnits > MAX_WINDOW_UNITS)
              throw new CataloguePreparationError('catalogue_bounds');
            end = nextLegal[end + 1];
          }
        }
        if (!best) throw new CataloguePreparationError('catalogue_date_anchor');
        found = add(source, best.start, best.end, 'date');
      }
      if (!found || !compatible(text, found.start, found.end, span.date))
        throw new CataloguePreparationError('catalogue_date_anchor');
      work.anchoredDateSpans++;
    }
    prepared.push({ source, spans, parts, bridges });
  }
  // Mandatory anchors precede optional bridges; the cap cannot discard a date.
  for (const { source, bridges } of prepared)
    for (const [start, end] of bridges) {
      if (
        anchors.length < MAX_IDS ||
        bySpan.has(`${source.id}:${start}:${end}`)
      )
        add(source, start, end, 'bridge');
    }
  const sourceColumns = [
    'id',
    'title',
    'publishedAt',
    'clipped',
    'parts',
    'anchors',
  ];
  const rows = prepared.map(({ source, parts, spans }) => {
    const sourceAnchors = anchors.filter((a) => a.source === source.id);
    const cuts = [
      ...new Set([
        0,
        source.excerpt.length,
        ...parts.flatMap((p) => [p.start, p.end]),
        ...sourceAnchors.flatMap((a) => [a.start, a.end]),
      ]),
    ].sort((a, b) => a - b);
    if (cuts.some((cut) => spans.some((s) => s.start < cut && cut < s.end)))
      throw new CataloguePreparationError('catalogue_integrity');
    const literals = cuts
      .slice(0, -1)
      .map((start, i) => source.excerpt.slice(start, cuts[i + 1]));
    if (literals.join('') !== source.excerpt)
      throw new CataloguePreparationError('catalogue_integrity');
    const table = sourceAnchors.map((a) => {
      const row: Array<string | number> = [
        a.id,
        cuts.indexOf(a.start),
        cuts.indexOf(a.end) - 1,
      ];
      if (compatible(source.excerpt, a.start, a.end)) row.push('d');
      return row;
    });
    return [
      source.id,
      source.title,
      source.publishedAt,
      source.clipped,
      literals,
      table,
    ] as const;
  });
  const view = {
    subject: evidence.subject,
    requestedDate: evidence.requestedDate,
    sourceColumns,
    sources: rows,
    bounds: evidence.bounds,
    catalogue: { version: 'v5', binding: '0'.repeat(32) },
  };
  while (!fits(view)) {
    const optional = anchors
      .filter((a) => a.role === 'bridge')
      .sort(
        (a, b) => b.quote.length - a.quote.length || b.id.localeCompare(a.id)
      )[0];
    if (!optional) throw new CataloguePreparationError('catalogue_bounds');
    anchors.splice(anchors.indexOf(optional), 1);
    for (const row of rows) {
      const table = row[5];
      for (let i = table.length - 1; i >= 0; i--)
        if (table[i][0] === optional.id) table.splice(i, 1);
    }
  }
  if (work.completeDateSpans !== work.anchoredDateSpans)
    throw new CataloguePreparationError('catalogue_date_anchor');
  const binding = catalogueHash(
    JSON.stringify({ evidence, anchors, view })
  ).slice(0, 32);
  view.catalogue.binding = binding;
  return { anchors, view, binding, work };
}

export function freezeReaderData<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeReaderData(item);
    Object.freeze(value);
  }
  return value;
}
