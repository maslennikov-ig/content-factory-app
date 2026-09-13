/**
 * When a page says it was published (`content-factory-next-75xn.23`).
 *
 * A lead is announced to a person as «свежее за N дней», and on 13.09.2026 the
 * quality pass found that sentence printed over thirty rows out of forty whose
 * date nobody knew: `lead-topic.gateway.ts` kept an undated row because «нет
 * даты» ≠ «старое», and among those rows were evergreen explainers and a
 * page of a hundred speech topics. The window is now a promise rather than a
 * hope: a row keeps its place only when a date is known and inside it.
 *
 * Most rows arrive dated — the discovery sweep asks Tavily with the `news`
 * topic, the one mode that returns `published_date`. This file answers for the
 * rest, from the page's own bytes, and it is deliberately pure: HTML in, a
 * date or nothing out. The fetching, the robots check and the deadlines belong
 * to `SourceFetchGateway`, which already owns them for the source registry;
 * nothing here opens a socket, so a test reads the whole rule from inline
 * fixtures.
 *
 * Three signals, in the order a publisher is likely to be honest in:
 *
 *  1. `<meta>`: `article:published_time`, `og:article:published_time`, or
 *     `name="date" | "pubdate" | "publish-date"`. A CMS writes these for the
 *     social cards it cares about, so they are maintained.
 *  2. JSON-LD `datePublished` on a `NewsArticle`, `Article` or `BlogPosting`,
 *     including one nested inside `@graph`. Schema.org markup is written for
 *     search engines, and for the same reason it is kept current.
 *  3. A `YYYY/MM/DD` or `YYYY-MM-DD` segment in the URL path. The weakest of
 *     the three and the last: a dated path is a publishing convention, not a
 *     statement, but a blog that puts the date in the address is telling the
 *     truth about it far more often than not.
 *
 * A date is refused when it does not parse, when it sits in the future beyond
 * a day of clock skew, or when its year is absurd. The caller drops the row
 * rather than guessing, which is the point of the whole exercise.
 */

/** Reading more than this buys nothing: the markup we want sits in the head or in one script block. */
const SCAN_LIMIT = 400_000;

/** A date before this is a template default or a copyright line, never a lead. */
const EARLIEST_YEAR = 1995;

/** Clock skew between a publisher's server and ours; beyond it the date is not a date. */
const FUTURE_TOLERANCE_MS = 36 * 60 * 60 * 1000;

const META_TAG = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([a-zA-Z][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const JSON_LD_BLOCK =
  /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
const URL_PATH_DATE = /\/(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[/.-]|$)/;

/** The `<meta>` keys a publisher writes a publication date into. */
const PUBLISHED_META_KEYS: ReadonlySet<string> = new Set([
  'article:published_time',
  'og:article:published_time',
  'date',
  'pubdate',
  'publish-date',
]);

/** The schema.org types whose `datePublished` is about this page. */
const DATED_LD_TYPES: ReadonlySet<string> = new Set([
  'newsarticle',
  'article',
  'blogposting',
]);

const decodeEntities = (value: string) =>
  value
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');

/**
 * A parsed, believable moment — or nothing.
 *
 * `new Date('2026')` parses, and so does `new Date('Wednesday')` on some
 * inputs; the range check is what separates a publication date from whatever
 * else a string happens to mean.
 */
export function believableDate(
  value: string | null | undefined,
  now: Date = new Date()
): Date | null {
  const text = (value || '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  const time = parsed.getTime();
  if (Number.isNaN(time)) return null;
  if (parsed.getUTCFullYear() < EARLIEST_YEAR) return null;
  if (time > now.getTime() + FUTURE_TOLERANCE_MS) return null;
  return parsed;
}

function metaAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  ATTRIBUTE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE.exec(tag))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attributes[name] = decodeEntities(value);
  }
  return attributes;
}

/** Signal one: the page's own social-card metadata. */
export function pageDateFromMeta(html: string, now: Date = new Date()): Date | null {
  const scanned = (html || '').slice(0, SCAN_LIMIT);
  META_TAG.lastIndex = 0;
  let tag: RegExpExecArray | null;
  while ((tag = META_TAG.exec(scanned))) {
    const attributes = metaAttributes(tag[0]);
    const key = (attributes.property || attributes.name || attributes.itemprop || '')
      .trim()
      .toLowerCase();
    if (!PUBLISHED_META_KEYS.has(key)) continue;
    const date = believableDate(attributes.content, now);
    if (date) return date;
  }
  return null;
}

function ldTypeMatches(node: { '@type'?: unknown }): boolean {
  const declared = node['@type'];
  const names = Array.isArray(declared) ? declared : [declared];
  return names.some(
    (name) => typeof name === 'string' && DATED_LD_TYPES.has(name.trim().toLowerCase())
  );
}

/**
 * Walks the parsed block rather than pattern-matching its text: `datePublished`
 * of an `Article` and `datePublished` of the `WebSite` that embeds it are the
 * same eight characters in a regex and two different facts.
 */
function ldDate(node: unknown, now: Date, depth = 0): Date | null {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = ldDate(entry, now, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  if (ldTypeMatches(record) && typeof record.datePublished === 'string') {
    const date = believableDate(record.datePublished, now);
    if (date) return date;
  }
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
    const found = ldDate(record[key], now, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Signal two: schema.org markup, `@graph` included. */
export function pageDateFromJsonLd(html: string, now: Date = new Date()): Date | null {
  const scanned = (html || '').slice(0, SCAN_LIMIT);
  JSON_LD_BLOCK.lastIndex = 0;
  let block: RegExpExecArray | null;
  while ((block = JSON_LD_BLOCK.exec(scanned))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      // A publisher's broken JSON is not our failure to report: the next
      // block, or the next signal, still gets its turn.
      continue;
    }
    const date = ldDate(parsed, now, 0);
    if (date) return date;
  }
  return null;
}

/** Signal three: the address itself, `/2026/09/13/…`. */
export function pageDateFromUrl(url: string, now: Date = new Date()): Date | null {
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    path = String(url || '');
  }
  const match = URL_PATH_DATE.exec(path);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);
  if (monthIndex < 0 || monthIndex > 11 || dayNumber < 1 || dayNumber > 31) return null;
  const candidate = new Date(Date.UTC(Number(year), monthIndex, dayNumber));
  if (candidate.getUTCMonth() !== monthIndex || candidate.getUTCDate() !== dayNumber) {
    return null;
  }
  return believableDate(candidate.toISOString(), now);
}

/**
 * The three signals in order, which is the whole public rule.
 *
 * `html` may be empty — a fetch that failed, or a page that was not HTML — and
 * the address alone still carries a date often enough to be worth asking.
 */
export function pageDate(
  html: string | null | undefined,
  url: string,
  now: Date = new Date()
): Date | null {
  const markup = html || '';
  return (
    pageDateFromMeta(markup, now) ||
    pageDateFromJsonLd(markup, now) ||
    pageDateFromUrl(url, now)
  );
}
