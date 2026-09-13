/**
 * What a discovery sweep brings back that is not a lead
 * (`content-factory-next-75xn.23`).
 *
 * Of the forty rows the quality pass of 13.09.2026 judged by hand, twelve were
 * junk: six mirrors of somebody's Facebook, X and Instagram post, two PDFs of
 * academic journals, a page of «100 тем для убедительной речи», and the
 * release notes of an unrelated product that landed in a topic about Temporal
 * because both say «release». Rules first and the model after: every row this
 * file refuses is one the `classify` call never pays for, and a workspace with
 * no model key still gets a feed without social mirrors in it.
 *
 * Deliberately import-free and deliberately blunt. A stemmer, a language model
 * or a domain reputation list would each be a better instrument and none of
 * them is worth its weight here — these five rules answer «is this a page
 * about the topic at all», not «is it good».
 */

/** Letters an excerpt must carry to be worth printing under a title. */
export const MINIMUM_EXCERPT_LETTERS = 80;

/**
 * Below this a search engine is saying it does not believe in the row either.
 * Optional: only Tavily scores its results, and an undefined score is not a
 * low one.
 */
export const MINIMUM_ENGINE_SCORE = 0.5;

/** A stem is the first five letters of a word; shorter words carry no topic. */
const STEM_LENGTH = 5;

/**
 * Somebody's post about the news is not the news.
 *
 * Hosts, matched on the registrable tail so `m.facebook.com` and
 * `ru-ru.facebook.com` are the same mirror. Two entries are paths rather than
 * hosts — a YouTube short and a LinkedIn post — because the rest of those
 * sites does carry material worth reading.
 */
const SOCIAL_MIRROR_HOSTS: readonly string[] = [
  'facebook.com',
  'fb.com',
  'x.com',
  'twitter.com',
  'instagram.com',
  'vk.com',
  't.me',
  'telegram.me',
  'threads.net',
  'threads.com',
  'tiktok.com',
];

const SOCIAL_MIRROR_PATHS: readonly { host: string; path: RegExp }[] = [
  { host: 'youtube.com', path: /^\/shorts\//i },
  { host: 'linkedin.com', path: /^\/posts\//i },
];

export type DiscoveryJunkReason =
  | 'SOCIAL_MIRROR'
  | 'PDF'
  | 'SHORT_TEXT'
  | 'OFF_TOPIC'
  | 'LOW_SCORE';

export type DiscoveryCandidateV1 = {
  url: string;
  title: string;
  /** Already cleaned of page chrome by the caller. */
  excerpt: string | null;
  /** What the engine thought of the row, when it said. */
  score?: number | null;
  /** Known only after a page was read; `application/pdf` is refused here too. */
  contentType?: string | null;
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

const hostMatches = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

export function isSocialMirror(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (SOCIAL_MIRROR_HOSTS.some((domain) => hostMatches(host, domain))) return true;
  return SOCIAL_MIRROR_PATHS.some(
    ({ host: domain, path }) => hostMatches(host, domain) && path.test(pathOf(url))
  );
}

export function isPdf(url: string, contentType?: string | null): boolean {
  if ((contentType || '').toLowerCase().includes('application/pdf')) return true;
  return /\.pdf$/i.test(pathOf(url));
}

export function letterCount(value: string | null | undefined): number {
  return ((value || '').match(/\p{L}/gu) || []).length;
}

/**
 * The crude stemming both this file and `lead-reason.ts` compare words with:
 * lower-case, split on anything that is not a letter or a digit, keep what is
 * at least five characters long and cut it to five. «регулирование» and
 * «регулированию» become «регул»; so, for what it is worth, does «регулярный».
 * The rule it serves — «does this page mention the topic at all» — survives
 * that, and a morphological analyser per language does not survive review.
 */
export function textStems(value: string): string[] {
  return (value || '')
    .toLocaleLowerCase()
    .replace(/<[^>]*>/gu, ' ')
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((word) => word.length >= STEM_LENGTH)
    .map((word) => word.slice(0, STEM_LENGTH));
}

export function uniqueStems(value: string): Set<string> {
  return new Set(textStems(value));
}

/** How many distinct stems two texts have in common. */
export function sharedStemCount(
  stems: ReadonlySet<string>,
  text: string
): number {
  if (stems.size === 0) return 0;
  let shared = 0;
  const seen = new Set<string>();
  for (const stem of textStems(text)) {
    if (seen.has(stem) || !stems.has(stem)) continue;
    seen.add(stem);
    shared += 1;
  }
  return shared;
}

/**
 * Why this row is not a lead, or `null` when it is one.
 *
 * `topicStems` may be empty — a one-word topic like «ИИ» has no stem of five
 * letters — and then the topic rule simply does not run. Refusing every row of
 * a short topic would be the wrong reading of «no evidence».
 */
export function discoveryJunkReason(
  row: DiscoveryCandidateV1,
  topicStems: ReadonlySet<string>
): DiscoveryJunkReason | null {
  if (isSocialMirror(row.url)) return 'SOCIAL_MIRROR';
  if (isPdf(row.url, row.contentType)) return 'PDF';
  if (typeof row.score === 'number' && row.score < MINIMUM_ENGINE_SCORE) {
    return 'LOW_SCORE';
  }
  if (letterCount(row.excerpt) < MINIMUM_EXCERPT_LETTERS) return 'SHORT_TEXT';
  if (
    topicStems.size > 0 &&
    sharedStemCount(topicStems, `${row.title} ${row.excerpt || ''}`) === 0
  ) {
    return 'OFF_TOPIC';
  }
  return null;
}

export function isDiscoveryJunk(
  row: DiscoveryCandidateV1,
  topicStems: ReadonlySet<string>
): boolean {
  return discoveryJunkReason(row, topicStems) !== null;
}
