import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import {
  WEB_SEARCH_FALLBACK_TIMEOUT_MS,
  WEB_SEARCH_MAX_RESULT_CHARS,
  WEB_SEARCH_MAX_SOURCE_CHARS,
  WEB_SEARCH_PRIMARY_TIMEOUT_MS,
  getChatModel,
  getWebSearchClient,
} from '@contentfactory/nestjs-libraries/openai/ai.clients';
import {
  SearchProvider,
  requireActiveAiConfig,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import {
  ContentLanguage,
  contentLanguageNames,
} from '@contentfactory/nestjs-libraries/dtos/content.language';
import {
  decideResearchEgress,
  type ResearchEgressBudget,
} from '@contentfactory/nestjs-libraries/content-intelligence/research/competitive-intelligence-egress';
import {
  fetchEncyclopedicExtract,
  lookupEncyclopedicReferences,
  lookupWikidataReferences,
  type EncyclopedicProvider,
} from '@contentfactory/nestjs-libraries/content-intelligence/research/encyclopedic-reference';
import type { ResearchDnsResolver } from '@contentfactory/nestjs-libraries/content-intelligence/research/constrained-static-fetch';

/**
 * Who brought the row. A search engine is chosen and paid for in settings;
 * `wikipedia` and `wikidata` are the keyless lane and are never selectable as
 * the workspace's search provider, which is why `SearchProvider` itself is
 * left alone.
 */
export type ResearchSourceProvider = SearchProvider | EncyclopedicProvider;

/** Search engines plus the keyless lane, in one list the egress guard reads. */
export const APPROVED_RESEARCH_PROVIDERS: readonly string[] = [
  'tavily',
  'exa',
  'openrouter',
  'wikipedia',
  'wikidata',
];

/**
 * The keyless lane is an addition to an answer the person already has, so it
 * gets a short budget of its own and is abandoned rather than waited on.
 */
export const ENCYCLOPEDIC_LANE_TIMEOUT_MS = 8_000;

/**
 * Recorded-response seam for the keyless lane.
 *
 * The application module does not register it, so `@Optional()` hands the
 * service `undefined` and the lane takes the network path with its own DNS
 * resolution. A test constructs one and the same code runs against recorded
 * bytes without touching the network.
 */
@Injectable()
export class EncyclopedicLaneClient {
  fetchImpl?: typeof fetch;
  resolver?: ResearchDnsResolver;
}

export interface WebResearchSource {
  url: string;
  title: string;
  publishedAt: string | null;
  provider: ResearchSourceProvider;
}

export interface WebResearchFact {
  text: string;
  sourceUrl: string;
}

export interface WebResearchResult {
  summary: string;
  facts: WebResearchFact[];
  sources: WebResearchSource[];
  provider: SearchProvider | 'mixed';
}

export interface WebResearchOptions {
  /**
   * The language the person reading the answer works in. Optional because the
   * two callers that existed before the search panel — the copilot's tool list
   * and autopost — hand the summary to a model that is already told which
   * language to write in, and pay nothing extra for it.
   */
  language?: ContentLanguage;
  /** Server-owned depth preset. The caller cannot set raw provider budgets. */
  level?: ResearchLevel;
}

export type ResearchLevel = 'quick' | 'standard' | 'deep';

/** Monthly admission limits until durable tariff counters are introduced. */
export const RESEARCH_MONTHLY_QUOTAS: Readonly<Record<ResearchLevel, number>> = Object.freeze({
  quick: 20,
  standard: 10,
  deep: 3,
});

export class ResearchQuotaExceeded extends Error {
  readonly status = 429;
  readonly code = 'RESEARCH_QUOTA_EXHAUSTED';
  constructor(readonly level: ResearchLevel) {
    super(
      'Лимит ресерчей на этом тарифе исчерпан. Выберите другой уровень или дождитесь нового месяца.'
    );
    this.name = 'ResearchQuotaExceeded';
  }
}

type ResearchQuotaCounter = { period: string; count: number };

/**
 * The slice of Redis the quota needs. Narrow on purpose: a test hands in a
 * fake, and the production default is the shared `ioRedis` singleton.
 */
/** Injection token for the quota's Redis slice; provided by `database.module.ts`. */
export const RESEARCH_QUOTA_STORE = 'RESEARCH_QUOTA_STORE';

export interface ResearchQuotaStore {
  get(key: string): Promise<string | null | undefined>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/**
 * Slightly over a month, so a counter outlives the period it belongs to even
 * when the month is long and the clock drifts, and disappears on its own
 * afterwards. Nothing reads a previous period, so an exact boundary buys
 * nothing and an early expiry would hand back spent allowance.
 */
export const RESEARCH_QUOTA_TTL_SECONDS = 40 * 24 * 60 * 60;

export const researchQuotaKey = (
  organizationId: string,
  level: ResearchLevel,
  now: Date
): string =>
  `research:quota:${organizationId}:${level}:${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1
  ).padStart(2, '0')}`;

/**
 * Admission-side quota. Failed calls are reserved and therefore counted.
 *
 * The counter lives in Redis so that a restart, a second backend instance and
 * a worker all see the same month. The in-memory map is kept only as a
 * fallback for a Redis outage: an unreachable counter must not stop people
 * from working, so the soft quota degrades to per-process counting and says so
 * in the log rather than refusing the call. Over-admitting during an outage is
 * the cheaper mistake here.
 */
@Injectable()
export class ResearchQuotaService {
  private readonly logger = new Logger(ResearchQuotaService.name);
  private readonly counters = new Map<string, ResearchQuotaCounter>();
  private readonly touched = new Set<string>();
  private readonly store: ResearchQuotaStore | null;

  /**
   * The store arrives through the application module under
   * `RESEARCH_QUOTA_STORE` (the shared `ioRedis` singleton). It is not imported
   * here on purpose: `redis.service` opens its socket the moment it is loaded,
   * and this file is loaded by every suite that touches research, which turned
   * one import into a process that never exited. Without a store the quota
   * counts in memory and says so once.
   */
  constructor(
    @Optional() @Inject(RESEARCH_QUOTA_STORE) store?: ResearchQuotaStore
  ) {
    this.store = store ?? null;
    if (!this.store) {
      this.logger.log(
        'No research quota store was provided; counting in process memory.'
      );
    }
  }

  private period(now: Date): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private warn(action: string, error: unknown) {
    this.logger.warn(
      `Research quota ${action} fell back to in-process counting: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  private reserveInMemory(organizationId: string, level: ResearchLevel, now: Date) {
    const key = `${organizationId}|${level}`;
    const period = this.period(now);
    const current = this.counters.get(key);
    const counter = current?.period === period ? current : { period, count: 0 };
    const limit = RESEARCH_MONTHLY_QUOTAS[level];
    if (counter.count >= limit) throw new ResearchQuotaExceeded(level);
    counter.count += 1;
    this.counters.set(key, counter);
    return { used: counter.count, limit };
  }

  async reserve(organizationId: string, level: ResearchLevel, now = new Date()) {
    const limit = RESEARCH_MONTHLY_QUOTAS[level];
    const key = researchQuotaKey(organizationId, level, now);
    let used: number;
    if (!this.store) return this.reserveInMemory(organizationId, level, now);
    this.touched.add(key);
    try {
      used = await this.store.incr(key);
      // Only the first increment of a period needs the lifetime; re-arming it
      // on every call would keep an abandoned counter alive forever.
      if (used === 1) await this.store.expire(key, RESEARCH_QUOTA_TTL_SECONDS);
    } catch (error) {
      this.warn('reservation', error);
      return this.reserveInMemory(organizationId, level, now);
    }
    if (used > limit) {
      try {
        await this.store.decr(key);
      } catch (error) {
        this.warn('release', error);
      }
      throw new ResearchQuotaExceeded(level);
    }
    return { used, limit };
  }

  async read(organizationId: string, level: ResearchLevel, now = new Date()) {
    const limit = RESEARCH_MONTHLY_QUOTAS[level];
    let used: number;
    try {
      if (!this.store) throw new Error('no store');
      const stored = await this.store.get(researchQuotaKey(organizationId, level, now));
      const parsed = Number(stored ?? 0);
      used = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    } catch (error) {
      if (this.store) this.warn('read', error);
      const current = this.counters.get(`${organizationId}|${level}`);
      used = current?.period === this.period(now) ? current.count : 0;
    }
    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  /** Clears both sides so a suite starts from zero whichever one answered. */
  async clearForTests() {
    this.counters.clear();
    const keys = [...this.touched];
    this.touched.clear();
    for (const key of keys) {
      try {
        await this.store?.del(key);
      } catch (error) {
        this.warn('cleanup', error);
      }
    }
  }
}

export interface ResearchCacheJournalEntry {
  key: string;
  hit: boolean;
  at: string;
}

/** In-memory insertion-ordered cache with a bounded hit/miss journal. */
export class ResearchQueryCache<T = unknown> {
  private readonly values = new Map<string, T>();
  private readonly entries: ResearchCacheJournalEntry[] = [];
  constructor(private readonly maximum = 10_000) {}
  get(key: string, now = new Date()): T | undefined {
    const value = this.values.get(key);
    this.entries.push({ key, hit: value !== undefined, at: now.toISOString() });
    if (this.entries.length > this.maximum) this.entries.shift();
    return value;
  }
  set(key: string, value: T): void {
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.maximum) {
      this.values.delete(this.values.keys().next().value as string);
    }
  }
  journal(): readonly ResearchCacheJournalEntry[] { return this.entries.slice(); }
  size(): number { return this.values.size; }
  clear(): void { this.values.clear(); this.entries.length = 0; }
}

export const RESEARCH_LEVEL_PRESETS: Readonly<Record<ResearchLevel, {
  maxSearchQueries: number;
  maxSources: number;
  maxProviderCostMicros: number;
  maxWallClockMs: number;
}>> = Object.freeze({
  quick: { maxSearchQueries: 4, maxSources: 8, maxProviderCostMicros: 500_000, maxWallClockMs: 180_000 },
  standard: { maxSearchQueries: 10, maxSources: 20, maxProviderCostMicros: 2_000_000, maxWallClockMs: 600_000 },
  deep: { maxSearchQueries: 25, maxSources: 50, maxProviderCostMicros: 6_000_000, maxWallClockMs: 1_800_000 },
});

const researchSummary = z.object({
  summary: z.string(),
});

/**
 * `content-factory-next-fn33.132`: the field used to be called `localQuery`
 * and was asked for only when the subject was judged «local». Tavily takes no
 * language parameter — the language of a query is the language of its words —
 * so a subject written in Russian that the classifier called international was
 * searched in English only, and answered with English pages about a
 * neighbouring subject. The name says what the field is now: the query in the
 * subject's own language, which every non-English subject gets.
 */
const subjectClassification = z.object({
  subjectLanguage: z.string().min(2).max(10),
  englishQuery: z.string().min(1),
  subjectLanguageQuery: z.string().nullable(),
  freshnessRequired: z.boolean(),
});

interface SearchResult {
  answer?: string;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    rawContent?: string;
    published_date?: string;
    publishedAt?: string;
    nonCitableSnippet?: string;
  }>;
}

interface ProviderSearchResult {
  provider: SearchProvider;
  response: SearchResult;
}

/**
 * The same bound the HTTP contract states, applied here because the callers
 * that matter do not come through it: an RSS `content:encoded` body or a whole
 * scraped page reaches this service directly. A classifier only needs the
 * opening of the material to name the subject.
 */
const MAXIMUM_SUBJECT_LENGTH = 5_000;

class WebSearchDeadlineExceeded extends Error {
  constructor(milliseconds: number) {
    super(`Web search did not answer within ${milliseconds}ms.`);
    this.name = 'WebSearchDeadlineExceeded';
  }
}

class EmptyWebSearchResults extends Error {
  constructor() {
    super('Web search returned no results.');
    this.name = 'EmptyWebSearchResults';
  }
}

/**
 * Every consumer of this service logs the error and swallows it, and a logger
 * shows the message rather than walking a custom array. Both causes therefore
 * belong in the message itself; `errors` stays for a caller that wants the
 * original objects. The provider names are supplied by the routing seam so an
 * Exa failure is not misreported as a Tavily failure.
 */
export class WebSearchFallbackError extends Error {
  readonly status = 503;
  readonly code = 'CONTENT_SEARCH_UNAVAILABLE';
  constructor(
    public readonly errors: readonly unknown[],
    providers: readonly string[] = ['tavily', 'openrouter']
  ) {
    super(
      `${providers.join(' and ')} web research both failed: ${errors
        .map((error) =>
          error instanceof Error ? error.message : String(error)
        )
        .join(' | ')}`
    );
    this.name = 'WebSearchFallbackError';
  }
}

/**
 * The deadline has to be enforced here, not handed to the tool.
 * `RunnableConfig.timeout` becomes an abort signal that only
 * `Runnable._callWithConfig` races against; `StructuredTool.call` does not, and
 * `TavilySearch` neither accepts a signal in its constructor nor forwards one
 * to its `fetch`. Passing the config alone left a hung search holding an
 * autopost run or a chat turn open indefinitely — exactly what the timeout was
 * added to prevent.
 *
 * The underlying request is not cancelled, because the tool offers no way to
 * cancel it; it is abandoned. Tavily gets 12 seconds and the fallback gets the
 * remaining 8, so the established 20-second research budget does not double.
 */
const withDeadline = <T>(work: Promise<T>, milliseconds: number) => {
  let timer: NodeJS.Timeout;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new WebSearchDeadlineExceeded(milliseconds)),
        milliseconds
      );
    }),
  ]).finally(() => clearTimeout(timer));
};

const invokeWithDeadline = async (
  clientFactory: () => ReturnType<typeof getWebSearchClient>,
  query: string,
  milliseconds: number
) => {
  const deadline = Date.now() + milliseconds;
  const client = await withDeadline(clientFactory(), milliseconds);
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new WebSearchDeadlineExceeded(milliseconds);
  return withDeadline(client.invoke({ query }), remaining);
};

const errorStatus = (error: unknown) => {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : undefined;
  }
  return undefined;
};

const errorCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

const isFallbackFailure = (error: unknown) => {
  if (
    error instanceof WebSearchDeadlineExceeded ||
    error instanceof EmptyWebSearchResults
  ) {
    return true;
  }
  const code = errorCode(error);
  const codedStatus = /^\d{3}$/.test(code) ? Number(code) : undefined;
  const status = errorStatus(error) ?? codedStatus;
  if (status === 402 || status === 403 || status === 429) return true;
  if (status !== undefined && status >= 500 && status <= 599) return true;

  return new Set([
    'ETIMEDOUT',
    'ECONNABORTED',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
  ]).has(code);
};

const failureLabel = (error: unknown) => {
  const code = errorCode(error);
  const codedStatus = /^\d{3}$/.test(code) ? Number(code) : undefined;
  const status = errorStatus(error) ?? codedStatus;
  if (status) return `status ${status}`;
  if (error instanceof EmptyWebSearchResults) return 'empty results';
  if (error instanceof WebSearchDeadlineExceeded) return 'deadline';
  if (code) return `code ${code}`;
  return 'provider failure';
};

/**
 * The keyless lane carries no credentials and its failures are our own codes
 * or a public URL, so the message may be logged as it is — bounded, because a
 * provider may answer with a page instead of an error.
 */
const describeLaneError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 200);

const isEnglish = (language: string) => {
  const normalized = language.trim().toLowerCase();
  return normalized === 'en' || normalized.startsWith('en-');
};

/**
 * Country boosting is deliberately narrow. Russian maps to one product market;
 * English does not identify a country, so an English subject stays unboosted
 * rather than being silently treated as United States content.
 *
 * It no longer waits for the classifier to call the subject «local»
 * (`content-factory-next-fn33.132`). Whether advertising labelling rules are a
 * global topic is an opinion; that a Russian-language subject is best answered
 * by Russian pages is not, and the hint only reorders results.
 */
const countryForSubjectLanguage = (language: string) => {
  const normalized = language.trim().toLowerCase();
  return normalized === 'ru' ||
    normalized === 'ru-ru' ||
    normalized === 'russian'
    ? 'russia'
    : undefined;
};

/**
 * Prefer a complete paragraph. Pages without any separator still need a hard
 * ceiling, so only that malformed/single-paragraph case falls back to a plain
 * character cut.
 */
const truncateAtParagraph = (value: string, maximum: number) => {
  if (maximum <= 0) return '';
  if (value.length <= maximum) return value;
  const prefix = value.slice(0, maximum);
  const boundary = prefix.lastIndexOf('\n\n');
  if (boundary >= 0) return prefix.slice(0, boundary).trimEnd();
  return prefix.trimEnd();
};

/**
 * A URL this product would refuse to keep is not a finding.
 *
 * `https` only, names only, no port but the default one. A search provider
 * answered the same OFSI page twice — once over `http`, once over `https` —
 * and the panel showed two rows for one address; dropping the plain-text twin
 * collapses the pair onto the address anyone would actually open
 * (`content-factory-next-fn33.132`). An IP literal is refused on shape,
 * before anything resolves it: `169.254.169.254` is the cloud metadata
 * address and is the single URL a server-side fetch must never follow.
 *
 * The returned string is `URL`-normalized, so it is also the key both lists
 * are built on and the two lists cannot disagree about one page.
 */
export const usableHttpsUrl = (value: string | undefined) => {
  if (!value || value.length > 2_000) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:') return undefined;
  if (parsed.port !== '' && parsed.port !== '443') return undefined;
  if (parsed.hostname.startsWith('[')) return undefined;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname)) return undefined;
  if (!parsed.hostname.includes('.')) return undefined;
  // Учётные данные в адресе панели поиска не показываются: хранение их и так
  // срезает (`canonicalizeSourceUrl`), а экран — нет.
  parsed.username = '';
  parsed.password = '';
  // AMP-копия и обычная страница — одна статья (`content-factory-next-ec48.4`):
  // хвост `/amp` и признак `amp` в строке запроса снимаются, чтобы статья не
  // заняла два места в маленьком бюджете материала.
  parsed.pathname = parsed.pathname.replace(/\/amp\/?$/i, '') || '/';
  for (const key of ['amp', 'outputType', 'output']) {
    if (/^amp$/i.test(parsed.searchParams.get(key) || '') || key === 'amp') {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
};

/**
 * `content-factory-next-fn33.134`: what a provider returns under one result is
 * two different things, and until 05.09.2026 this service could not tell them
 * apart because the Tavily client collapsed them into one field, preferring
 * the page. A page begins with its navigation, so a person was asked to press
 * «Взять как доказательство» on «* GIR Alerts /account/register * Magazine»
 * and on «Skip to main content». A frozen copy of a menu proves nothing.
 *
 * So the provider's own snippet — the extract it chose for this query — is the
 * excerpt whenever there is one, and the whole page is a fallback that has to
 * earn its place: stripped of markup and chrome, and then long enough to be an
 * assertion rather than a leftover label. A result that never gets there keeps
 * its row in `sources`, because the address is still a finding, and stays out
 * of `facts`, which is the list the panel offers for acceptance and the list a
 * draft cites.
 */
const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const ABSOLUTE_URL = /\b(?:https?|blob|data|ftp|mailto):\S+/gi;
/** `/account/register`, `/Magazine` — a menu that lost its markup. */
const SITE_RELATIVE_PATH = /(?:^|\s)\/[^\s)]+/g;
const LEADING_LIST_MARKER = /^\s*(?:[*+•-]|\d+[.)]|#{1,6}|>|\|)\s*/;
const PAGE_CHROME =
  /^(?:skip to\b|jump to\b|top of page\b|back to top\b|menu\b|main menu\b|navigation\b|share this\b|follow us\b|sign in\b|log ?in\b|sign up\b|subscribe\b|subscribers\b|newsletter\b|cookie|accept all\b|advertisement\b|report ad\b|image:|©|all rights reserved\b|privacy policy\b|terms of\b|terms (?:&|and) conditions\b)/i;
/**
 * Подвал и врезка о подписке набирают букв и точек на порог осмысленности
 * (второй проход 05.09, Reuters): их выдаёт не начало строки, а оборот внутри.
 */
const PAGE_CHROME_ANYWHERE =
  /opens new tab|subscribers get fewer ads|learn more about subscriptions|report ad\s*image|image \d+\s*image \d+/i;
const LINK_MARKUP = /\]\(|(?:https?|blob|data):/i;
const SENTENCE_END = /[.!?…](?:\s|$)/g;
const LETTER = /\p{L}/u;

/**
 * A navigation line is a line whose words are all link labels. Forty
 * characters of prose beside the links is what separates «* [Archive](/archive)»
 * from a paragraph that happens to cite something.
 */
const MINIMUM_PROSE_BESIDE_LINKS = 40;
/** The page an excerpt can come from; a menu never runs this long. */
const PAGE_EXCERPT_MINIMUM_LETTERS = 120;
/**
 * A whole page can be hundreds of kilobytes and the excerpt is capped at
 * `WEB_SEARCH_MAX_SOURCE_CHARS`. Cleaning more than this buys nothing and is
 * paid for on every result of every search.
 */
const PAGE_SCAN_LIMIT = 4 * WEB_SEARCH_MAX_SOURCE_CHARS;

const withoutMarkup = (line: string, linkText: '$1' | ' ') =>
  line
    .replace(MARKDOWN_IMAGE, ' ')
    .replace(MARKDOWN_LINK, linkText)
    .replace(ABSOLUTE_URL, ' ')
    .replace(SITE_RELATIVE_PATH, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const readableLine = (line: string) => {
  let text = withoutMarkup(line, '$1');
  let previous = '';
  while (text !== previous) {
    previous = text;
    text = text.replace(LEADING_LIST_MARKER, '').trim();
  }
  return text;
};

/**
 * Blank lines survive so `truncateAtParagraph` still has paragraphs to cut at,
 * and a blank the cleaning itself created at the very start is removed rather
 * than left to open the excerpt with an empty line.
 */
const cleanExcerpt = (value: string) => {
  const kept: string[] = [];
  let hasProseLine = false;
  for (const line of value.split('\n')) {
    if (!line.trim()) {
      kept.push('');
      continue;
    }
    const readable = readableLine(line);
    if (
      !readable ||
      PAGE_CHROME.test(readable) ||
      PAGE_CHROME_ANYWHERE.test(readable)
    ) {
      continue;
    }
    const carriesLinks = LINK_MARKUP.test(line);
    if (
      carriesLinks &&
      withoutMarkup(line, ' ').length < MINIMUM_PROSE_BESIDE_LINKS
    ) {
      continue;
    }
    // A line that carries links but passed the prose threshold above is
    // prose too: «ФАС оштрафовала… Источник: https://…» is an assertion with
    // its source attached, not a menu. Before this the flag stayed down and a
    // one-line snippet with a single link was dropped whole (review of
    // `content-factory-next-ec48`, P1-3).
    if (LETTER.test(readable)) hasProseLine = true;
    kept.push(readable);
  }
  const leading = /^\n*/.exec(value)?.[0] ?? '';
  const text = (leading + kept.join('\n').replace(/^\n+/, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  return { text, hasProseLine };
};

/**
 * The provider already decided this text is about the query, so it is taken at
 * whatever length it came in: a one-line answer is still an assertion. It only
 * has to survive the cleaning and to say something outside its links.
 */
const providerSnippetExcerpt = (value: string | undefined) => {
  if (!value) return undefined;
  const { text, hasProseLine } = cleanExcerpt(value);
  if (!hasProseLine || !LETTER.test(text)) return undefined;
  return text;
};

/** Nobody chose this text for the query, so it has to read like prose. */
const wholePageExcerpt = (value: string | undefined) => {
  if (!value) return undefined;
  const { text, hasProseLine } = cleanExcerpt(
    value.slice(0, PAGE_SCAN_LIMIT)
  );
  if (!hasProseLine) return undefined;
  const letters = (text.match(/\p{L}/gu) || []).length;
  if (letters === 0) return undefined;
  const sentences = (text.match(SENTENCE_END) || []).length;
  return sentences >= 2 || letters >= PAGE_EXCERPT_MINIMUM_LETTERS
    ? text
    : undefined;
};

/**
 * `content-factory-next-fn33.133`: the summary is not ours to write. It is the
 * search provider's `answer`, and a provider answers in the language it was
 * asked in — always English here, because the English query is the one query
 * every run makes. On a Russian screen the whole «Бриф» reads in Russian and
 * one paragraph under «Коротко о найденном» reads in English.
 *
 * The check is a script test rather than a language detector on purpose. It
 * decides one thing — whether to spend a second cheap model call — and it must
 * never spend it on an answer that already reads right. Between the two
 * content languages the product has, the script separates them completely.
 */
const containsCyrillic = (value: string) => /[А-ЯЁа-яё]/.test(value);

const summaryNeedsLanguage = (summary: string, language: ContentLanguage) =>
  language === 'ru' ? !containsCyrillic(summary) : containsCyrillic(summary);

export class WebSearchNotConfigured extends Error {
  readonly status = 409;
  readonly code = 'CONTENT_SEARCH_NOT_CONFIGURED';
  constructor() {
    super(
      'Web search is not configured for this organization. Enable it and add a search key under Settings → AI provider.'
    );
    this.name = 'WebSearchNotConfigured';
  }
}

@Injectable()
export class WebResearchService {
  private readonly logger = new Logger(WebResearchService.name);
  /**
   * Built only when nothing was injected, so the application, which always
   * injects the registered quota, never constructs a second, memory-only one.
   */
  private memoryQuota?: ResearchQuotaService;
  private get fallbackQuota(): ResearchQuotaService {
    return (this.memoryQuota ??= new ResearchQuotaService());
  }
  private readonly cache = new ResearchQueryCache<WebResearchResult>();

  constructor(
    private readonly aiUsage: AiUsageService,
    @Optional() private readonly quota?: ResearchQuotaService,
    @Optional() private readonly encyclopedic?: EncyclopedicLaneClient
  ) {}

  /**
   * The keyless Wikipedia/Wikidata lane.
   *
   * Discovery answers with a row and a snippet that may not be quoted, so a
   * Wikipedia row is read once more through the summary door to get bytes a
   * person may cite. Wikidata has no article text and therefore becomes a
   * source without a fact. One edition, one entity or one extract failing
   * never hides the others.
   */
  private async encyclopedicRows(input: {
    entityNames: readonly string[];
    locales: readonly string[];
    allow: (provider: EncyclopedicProvider) => boolean;
  }): Promise<
    Array<{
      url: string;
      title: string;
      provider: EncyclopedicProvider;
      extract?: string;
    }>
  > {
    const seam = this.encyclopedic;
    const signal = AbortSignal.timeout(ENCYCLOPEDIC_LANE_TIMEOUT_MS);
    const rows: Array<{
      url: string;
      title: string;
      provider: EncyclopedicProvider;
      extract?: string;
    }> = [];
    const seen = new Set<string>();
    for (const entityName of input.entityNames) {
      if (input.allow('wikipedia')) {
        try {
          const found = await lookupEncyclopedicReferences({
            entityName,
            locales: input.locales,
            fetchImpl: seam?.fetchImpl,
            resolver: seam?.resolver,
            signal,
          });
          for (const row of found.results) {
            if (seen.has(row.url)) continue;
            let extract: Awaited<ReturnType<typeof fetchEncyclopedicExtract>> =
              null;
            try {
              extract = await fetchEncyclopedicExtract({
                articleUrl: row.url,
                fetchImpl: seam?.fetchImpl,
                resolver: seam?.resolver,
                signal,
              });
            } catch (error) {
              this.logger.warn(
                `An encyclopedic extract could not be read: ${describeLaneError(
                  error
                )}`
              );
            }
            // The summary door answers with the canonical address, which is
            // usually the one discovery already returned. Both are remembered
            // so a later edition cannot bring the same page back twice.
            const canonical = extract ? extract.url : row.url;
            if (seen.has(canonical)) continue;
            seen.add(row.url);
            seen.add(canonical);
            rows.push(
              extract
                ? {
                    url: canonical,
                    title: extract.title,
                    provider: 'wikipedia',
                    extract: extract.extract,
                  }
                : { url: row.url, title: row.title, provider: 'wikipedia' }
            );
          }
        } catch (error) {
          this.logger.warn(
            `Wikipedia discovery failed: ${describeLaneError(error)}`
          );
        }
      }
      if (input.allow('wikidata')) {
        try {
          const found = await lookupWikidataReferences({
            entityName,
            locale: input.locales[0],
            fetchImpl: seam?.fetchImpl,
            resolver: seam?.resolver,
            signal,
          });
          for (const row of found.results) {
            if (seen.has(row.url)) continue;
            seen.add(row.url);
            rows.push({ url: row.url, title: row.title, provider: 'wikidata' });
          }
        } catch (error) {
          this.logger.warn(
            `Wikidata lookup failed: ${describeLaneError(error)}`
          );
        }
      }
    }
    return rows;
  }

  /** Read-only cache telemetry for diagnostics and the later durable journal. */
  researchCacheJournal(): readonly ResearchCacheJournalEntry[] {
    return this.cache.journal();
  }

  private async searchOne(
    organizationId: string,
    query: string,
    config: Awaited<ReturnType<typeof requireActiveAiConfig>>,
    options: { country?: string; freshnessRequired: boolean; maxResults?: number },
    egressCheck?: (provider: SearchProvider) => void
  ): Promise<ProviderSearchResult> {
    const primary = config.search.provider;
    try {
      egressCheck?.(primary);
      const response = await invokeWithDeadline(
        () => getWebSearchClient(organizationId, primary, options),
        query,
        WEB_SEARCH_PRIMARY_TIMEOUT_MS
      );
      if (!response.results?.length) throw new EmptyWebSearchResults();
      this.logger.log(`Web research answered via ${primary}.`);
      return { provider: primary, response };
    } catch (error) {
      if (
        !isFallbackFailure(error) ||
        config.provider !== 'openrouter' ||
        primary === 'openrouter'
      ) {
        throw error;
      }

      this.logger.warn(
        `${primary} web research failed (${failureLabel(
          error
        )}); retrying via OpenRouter.`
      );
      try {
        egressCheck?.('openrouter');
        const response = await invokeWithDeadline(
          () => getWebSearchClient(organizationId, 'openrouter', options),
          query,
          WEB_SEARCH_FALLBACK_TIMEOUT_MS
        );
        if (!response.results?.length) throw new EmptyWebSearchResults();
        this.logger.log('Web research answered via openrouter.');
        return { provider: 'openrouter', response };
      } catch (fallbackError) {
        throw new WebSearchFallbackError([error, fallbackError], [
          primary,
          'openrouter',
        ]);
      }
    }
  }

  /**
   * The summary in the reader's own language.
   *
   * Same cheap `classify` role the subject classifier runs on: this rewrites
   * one paragraph and decides nothing, so it must never be billed at the price
   * of a draft. Nothing may be added or dropped — a number that changes
   * between the provider's answer and the screen is worse than English.
   *
   * A failure here keeps the original summary. The person still gets the
   * sources and the excerpts, which is what they came for; losing the whole
   * search because one paragraph could not be restated would be the wrong
   * trade.
   */
  private async summaryInLanguage(
    organizationId: string,
    summary: string,
    language: ContentLanguage
  ): Promise<string> {
    try {
      const writer = (
        await getChatModel(organizationId, 0, undefined, 'classify')
      ).withStructuredOutput(researchSummary);
      const written = await ChatPromptTemplate.fromTemplate(
        `Restate the web-research summary in {language}.
Keep every fact, number, name, date and source exactly as given.
Add nothing, drop nothing, and do not comment on the text.
Summary: {summary}`
      )
        .pipe(writer)
        .invoke({ language: contentLanguageNames[language], summary });
      return written?.summary?.trim() || summary;
    } catch (error) {
      this.logger.warn(
        `Web research summary stayed in its original language: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return summary;
    }
  }

  async research(
    organizationId: string,
    subject: string,
    options: WebResearchOptions = {}
  ): Promise<WebResearchResult> {
    const level = options.level ?? 'standard';
    const levelWasExplicit = options.level !== undefined;
    const key = `${organizationId}|${level}|${options.language ?? ''}|${subject.trim().slice(0, MAXIMUM_SUBJECT_LENGTH)}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.logger.debug(`Research cache hit for ${level}.`);
      return cached;
    }
    // The level is an explicit paid choice only for the intake and the deep
    // adaptation lane. Ordinary generation, autopost, copilot and the legacy
    // tool omit it and remain available after the opt-in allowance is spent.
    if (levelWasExplicit) {
      await (this.quota ?? this.fallbackQuota).reserve(organizationId, level);
    }
    const result = await this.aiUsage.executeAiOperation(
      organizationId,
      'web_research',
      () => this.researchWithinOperation(organizationId, subject, { ...options, level, levelWasExplicit }),
      'research'
    );
    this.cache.set(key, result);
    return result;
  }

  private async researchWithinOperation(
    organizationId: string,
    subject: string,
    options: WebResearchOptions & { levelWasExplicit?: boolean }
  ): Promise<WebResearchResult> {
    const config = await requireActiveAiConfig(organizationId);
    // A missing selected search key is configuration, not an outage, and must
    // never cause the model key to be spent on fallback.
    if (
      !config.search.enabled ||
      ((config.search.provider === 'tavily' ||
        config.search.provider === 'exa') &&
        !config.search.apiKey)
    ) {
      throw new WebSearchNotConfigured();
    }

    /**
     * The cheapest call in the product, and for two years it was billed as the
     * most expensive one: one sentence in, five short fields out, on the same
     * model that writes drafts. It says `classify` so a workspace can put it
     * on a small model without touching anything the reader sees
     * (`content-factory-next-x63z`).
     */
    const classifier = (
      await getChatModel(organizationId, 0, undefined, 'classify')
    ).withStructuredOutput(subjectClassification);
    const classification = await ChatPromptTemplate.fromTemplate(
      `Classify the research subject, then prepare search queries.
The content output language does not control the search language.
Return subjectLanguage as a lowercase ISO 639-1 code: the language the subject is written in, or the language of the country whose rules, market or institutions it is about.
Always provide englishQuery in English.
Whenever subjectLanguage is not "en", also provide subjectLanguageQuery written in that language, using the terms a reader of that language would search for, including the local names of laws, registers and institutions. Only when subjectLanguage is "en" must subjectLanguageQuery be null.
Set freshnessRequired true only when the subject asks for latest, current, recent, breaking or time-sensitive information.
Subject: {subject}`
    )
      .pipe(classifier)
      .invoke({ subject: String(subject).slice(0, MAXIMUM_SUBJECT_LENGTH) });

    /**
     * The subject's own language goes first and English second. Both queries
     * draw on one character budget for excerpts, and when a Russian subject
     * has Russian sources they are the ones worth spending it on.
     */
    const subjectLanguageQuery = classification.subjectLanguageQuery?.trim();
    const englishQuery = classification.englishQuery.trim();
    const baseQueries =
      subjectLanguageQuery &&
      !isEnglish(classification.subjectLanguage) &&
      subjectLanguageQuery !== englishQuery
        ? [subjectLanguageQuery, englishQuery]
        : [englishQuery];

    const level = options.level ?? 'standard';
    const preset = RESEARCH_LEVEL_PRESETS[level];
    // Keep query generation deterministic and bounded. Additional slots are
    // only useful for a distinct locale query; repeating the same words would
    // spend money without adding recall.
    const queries = baseQueries.slice(0, preset.maxSearchQueries);

    const searchOptions = {
      country: countryForSubjectLanguage(classification.subjectLanguage),
      freshnessRequired: classification.freshnessRequired,
      ...(options.levelWasExplicit
        ? { maxResults: preset.maxSources }
        : {}),
    };
    const egressBudget: ResearchEgressBudget = {
      maxSearchQueries: preset.maxSearchQueries,
      maxAcceptedSources: preset.maxSources,
      maxResponseBytes: WEB_SEARCH_MAX_RESULT_CHARS,
      maxWallClockMs: preset.maxWallClockMs,
      maxProviderCostMicros: preset.maxProviderCostMicros,
      maxConcurrency: Math.max(1, queries.length),
    };
    const providerKillSwitches = (process.env.RESEARCH_PROVIDER_KILL_SWITCHES || '')
      .split(',')
      .map((provider) => provider.trim())
      .filter(Boolean);
    const tenantKillSwitches = (process.env.RESEARCH_TENANT_KILL_SWITCHES || '')
      .split(',')
      .map((organization) => organization.trim())
      .filter(Boolean);
    const globalKillSwitch = process.env.RESEARCH_GLOBAL_KILL_SWITCH === 'true';
    /*
     * What the policy sees before each query: kill switches, the approved
     * provider list, the query index and the time already spent. Response
     * bytes, accepted sources and provider cost are not metered here; bytes
     * are bounded by WEB_SEARCH_MAX_RESULT_CHARS at the client and money by
     * the per-level presets through the provider's own result cap. Durable
     * spend accounting belongs to `content-factory-next-m0iy.9`.
     */
    const researchStartedAt = Date.now();
    const egressCheck = (queryIndex: number) => (provider: SearchProvider) => {
      const decision = decideResearchEgress({
        organizationId,
        providerId: provider,
        approvedProviderIds: APPROVED_RESEARCH_PROVIDERS,
        globalKillSwitch,
        tenantKillSwitches,
        providerKillSwitches,
        budget: egressBudget,
        spend: {
          searchQueries: queryIndex,
          acceptedSources: 0,
          responseBytes: 0,
          wallClockMs: Date.now() - researchStartedAt,
          providerCostMicros: 0,
          inFlight: 0,
        },
        kind: 'search',
      });
      // Equality, not truthiness: the backend compiles without strictNullChecks,
      // where truthiness does not narrow a discriminated union.
      if (decision.allowed === true) return;
      const error = new Error(`Research egress denied: ${decision.code}`) as Error & {
        code?: string;
      };
      error.code = `RESEARCH_EGRESS_${decision.code.toUpperCase()}`;
      throw error;
    };
    /**
     * Половина поиска не отменяет вторую (`content-factory-next-ec48.3`).
     *
     * Два запроса идут параллельно, и раньше отказ любого из них — чаще
     * всего срок ожидания у второго — выбрасывал и уже полученный ответ
     * первого. Повторная проверка 05.09 потеряла так две темы из пяти, а
     * ручной поиск по тем же темам минутой позже отвечал. Берётся всё, что
     * ответило; отказом считается только случай, когда не ответил никто.
     */
    const settled = await Promise.allSettled(
      queries.map((query, index) =>
        this.searchOne(
          organizationId,
          query,
          config,
          searchOptions,
          egressCheck(index)
        )
      )
    );
    const responses = settled
      .filter(
        (entry): entry is PromiseFulfilledResult<ProviderSearchResult> =>
          entry.status === 'fulfilled'
      )
      .map((entry) => entry.value);
    const failures = settled.filter(
      (entry): entry is PromiseRejectedResult => entry.status === 'rejected'
    );
    if (!responses.length) throw failures[0].reason;
    for (const failure of failures) {
      this.logger.warn(
        `One of ${queries.length} web research queries failed (${failureLabel(
          failure.reason
        )}); keeping the answers that arrived.`
      );
    }

    const facts = new Map<string, WebResearchFact>();
    const sources = new Map<string, WebResearchSource>();
    let remainingContent = WEB_SEARCH_MAX_RESULT_CHARS;
    let sourceCount = 0;
    for (const { provider, response } of responses) {
      for (const item of response.results || []) {
        const url = usableHttpsUrl(item.url);
        if (!url) continue;
        const excerpt =
          providerSnippetExcerpt(item.content) ??
          wholePageExcerpt(item.rawContent);
        // Canonical URLs can occur more than once (for example an AMP result
        // followed by the ordinary page). Keep the first useful evidence, but
        // let a later duplicate replace a discovery-only row that had no
        // citable excerpt.
        const alreadyHasFact = [...facts.values()].some(
          (fact) => fact.sourceUrl === url
        );
        if (sources.has(url) && alreadyHasFact) continue;
        if (!sources.has(url)) {
          if (sourceCount >= preset.maxSources) break;
          sourceCount += 1;
        }
        sources.set(url, {
          url,
          title: (item.title || url).trim().slice(0, 500),
          publishedAt: item.published_date || item.publishedAt || null,
          provider,
        });
        if (!excerpt || remainingContent <= 0) continue;
        const sourceContent = truncateAtParagraph(
          excerpt,
          WEB_SEARCH_MAX_SOURCE_CHARS
        );
        const content = truncateAtParagraph(sourceContent, remainingContent);
        if (!content) continue;
        const key = `${url}|${content}`;
        if (!facts.has(key)) {
          facts.set(key, { text: content, sourceUrl: url });
          remainingContent -= content.length;
        }
      }
    }

    /**
     * Дальше — бесключевая полоса Wikipedia/Wikidata
     * (`content-factory-next-m0iy.8`).
     *
     * Она включается только при явно выбранном уровне: это платный заход, где
     * человек ждёт опору, а обычная генерация, автопостинг и копайлот не
     * должны получать лишние сетевые запросы. Строки идут после ответов
     * провайдера — в тот же потолок источников и тот же бюджет символов, — и
     * отказ полосы никогда не отменяет уже полученный ответ.
     */
    if (options.levelWasExplicit) {
      const encyclopedicAllowed = (provider: EncyclopedicProvider) => {
        const decision = decideResearchEgress({
          organizationId,
          providerId: provider,
          approvedProviderIds: APPROVED_RESEARCH_PROVIDERS,
          globalKillSwitch,
          tenantKillSwitches,
          providerKillSwitches,
          budget: egressBudget,
          spend: {
            searchQueries: queries.length,
            acceptedSources: sourceCount,
            responseBytes: 0,
            wallClockMs: Date.now() - researchStartedAt,
            providerCostMicros: 0,
            inFlight: 0,
          },
          // The lane reads pages rather than buying a search, so the source
          // cap is what bounds it.
          kind: 'fetch',
        });
        if (decision.allowed === true) return true;
        this.logger.warn(
          `Encyclopedic lane skipped for ${provider}: ${decision.code}.`
        );
        return false;
      };
      const entityNames = [
        ...new Set(
          [subjectLanguageQuery, englishQuery].filter(
            (name): name is string => !!name
          )
        ),
      ];
      const locales = [
        ...new Set(
          [classification.subjectLanguage, 'en']
            .map((locale) => String(locale || '').trim().toLowerCase())
            .filter(Boolean)
        ),
      ];
      try {
        const rows = await withDeadline(
          this.encyclopedicRows({
            entityNames,
            locales,
            allow: encyclopedicAllowed,
          }),
          ENCYCLOPEDIC_LANE_TIMEOUT_MS
        );
        for (const row of rows) {
          const url = usableHttpsUrl(row.url);
          if (!url || sources.has(url)) continue;
          if (sourceCount >= preset.maxSources) break;
          sourceCount += 1;
          sources.set(url, {
            url,
            title: (row.title || url).trim().slice(0, 500),
            // An encyclopedia article has no publication date of the kind a
            // news result carries, and a revision date is not one.
            publishedAt: null,
            provider: row.provider,
          });
          if (!row.extract || remainingContent <= 0) continue;
          const content = truncateAtParagraph(
            truncateAtParagraph(row.extract, WEB_SEARCH_MAX_SOURCE_CHARS),
            remainingContent
          );
          if (!content) continue;
          const key = `${url}|${content}`;
          if (facts.has(key)) continue;
          facts.set(key, { text: content, sourceUrl: url });
          remainingContent -= content.length;
        }
      } catch (error) {
        this.logger.warn(
          `The keyless encyclopedic lane added nothing: ${describeLaneError(
            error
          )}`
        );
      }
    }

    const answeringProviders = [
      ...new Set(responses.map(({ provider }) => provider)),
    ];
    const providerSummary = responses
      .map(({ response }) => response.answer)
      .filter((answer): answer is string => !!answer)
      .join('\n\n');
    const summary =
      options.language && summaryNeedsLanguage(providerSummary, options.language)
        ? await this.summaryInLanguage(
            organizationId,
            providerSummary,
            options.language
          )
        : providerSummary;

    return {
      provider:
        answeringProviders.length === 1 ? answeringProviders[0] : 'mixed',
      summary,
      facts: [...facts.values()],
      sources: [...sources.values()],
    };
  }
}
