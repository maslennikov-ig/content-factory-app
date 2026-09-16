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
  AiConfig,
  SearchProvider,
  getActiveAiConfig,
  loadAiConfig,
  requireActiveAiConfig,
  withActiveAiConfig,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import { judgeDiscoveryRows } from '@contentfactory/nestjs-libraries/content-intelligence/leads/lead-discovery-judge';
import {
  DEFAULT_SEARCH_TASK,
  SEARCH_PROVIDERS,
  SearchCredentialSource,
  SearchTask,
  providerForSearchTask,
  searchCredentialFor,
  searchKeyFor,
  searchProviderNeedsKey,
  searchRouteFingerprint,
} from '@contentfactory/nestjs-libraries/openai/ai.search-tasks';
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
  /** The engine's own relevance score, 0–1, when it gives one. */
  score?: number;
  /**
   * The page itself, cleaned and capped, kept only for an explicit paid level
   * (`content-factory-next-75xn.29`). Both engines already send the page
   * inside the search answer; throwing it away and buying it again elsewhere
   * was the one thing the owner refused. Absent for the free lanes.
   */
  text?: string;
}

export interface WebResearchFact {
  text: string;
  sourceUrl: string;
}

/**
 * One judged row of a discovery sweep (`content-factory-next-75xn.23`): the
 * cheap model pass that runs inside the same operation says whether the page
 * is about the topic and what it says. Absent when the pass did not run.
 */
export interface WebResearchDiscoveryJudgement {
  url: string;
  relevant: boolean;
  reason: { ru: string; en: string };
}

export interface WebResearchResult {
  summary: string;
  facts: WebResearchFact[];
  sources: WebResearchSource[];
  provider: SearchProvider | 'mixed';
  discovery?: WebResearchDiscoveryJudgement[];
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
  /**
   * What this search is for, which decides the engine (`ai.search-tasks.ts`).
   *
   * Almost no caller names it. The level already separates the two ordinary
   * cases — a person who asked for research names a level, and the searches
   * the product starts by itself while writing do not — so the default below
   * reads the task off that same distinction rather than asking seven call
   * sites to repeat themselves. Only the adaptation review has to say it out
   * loud, because its fact-checking lane passes a level too.
   */
  task?: SearchTask;
  /**
   * Only pages published inside this many days back, for «what is new about
   * this» rather than «what is true about this».
   */
  windowDays?: number;
}

export type ResearchLevel = 'quick' | 'standard' | 'deep';

/** Monthly admission limits until durable tariff counters are introduced. */
export const RESEARCH_MONTHLY_QUOTAS: Readonly<Record<ResearchLevel, number>> =
  Object.freeze({
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
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`;
  }

  private warn(action: string, error: unknown) {
    this.logger.warn(
      `Research quota ${action} fell back to in-process counting: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  private reserveInMemory(
    organizationId: string,
    level: ResearchLevel,
    now: Date
  ) {
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

  async reserve(
    organizationId: string,
    level: ResearchLevel,
    now = new Date()
  ) {
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
      const stored = await this.store.get(
        researchQuotaKey(organizationId, level, now)
      );
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

/**
 * How long one answer stands in for the same question
 * (`content-factory-next-75xn.31`, owner decision 13.09.2026).
 *
 * Until then the cache had no clock at all: a topic checked again an hour
 * later, or the same thought researched the next morning, answered from
 * process memory until the container restarted — «Проверить снова» was a
 * no-op that looked like a check. Thirty minutes keeps the repeat click free
 * and lets a subscription's next tick see what the engine says now.
 */
export const RESEARCH_CACHE_TTL_MS = 30 * 60 * 1_000;

/** In-memory insertion-ordered cache with a bounded hit/miss journal. */
export class ResearchQueryCache<T = unknown> {
  private readonly values = new Map<string, { value: T; storedAt: number }>();
  private readonly entries: ResearchCacheJournalEntry[] = [];
  constructor(
    private readonly maximum = 10_000,
    private readonly ttlMs = RESEARCH_CACHE_TTL_MS
  ) {}
  get(key: string, now = new Date()): T | undefined {
    const stored = this.values.get(key);
    const expired =
      stored !== undefined && now.getTime() - stored.storedAt >= this.ttlMs;
    if (expired) this.values.delete(key);
    const value = expired ? undefined : stored?.value;
    this.entries.push({ key, hit: value !== undefined, at: now.toISOString() });
    if (this.entries.length > this.maximum) this.entries.shift();
    return value;
  }
  set(key: string, value: T, now = new Date()): void {
    this.values.delete(key);
    this.values.set(key, { value, storedAt: now.getTime() });
    while (this.values.size > this.maximum) {
      this.values.delete(this.values.keys().next().value as string);
    }
  }
  journal(): readonly ResearchCacheJournalEntry[] {
    return this.entries.slice();
  }
  size(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
    this.entries.length = 0;
  }
}

export const RESEARCH_LEVEL_PRESETS: Readonly<
  Record<
    ResearchLevel,
    {
      maxSearchQueries: number;
      maxSources: number;
      maxProviderCostMicros: number;
      maxWallClockMs: number;
    }
  >
> = Object.freeze({
  quick: {
    maxSearchQueries: 4,
    maxSources: 8,
    maxProviderCostMicros: 500_000,
    maxWallClockMs: 180_000,
  },
  standard: {
    maxSearchQueries: 10,
    maxSources: 20,
    maxProviderCostMicros: 2_000_000,
    maxWallClockMs: 600_000,
  },
  deep: {
    maxSearchQueries: 25,
    maxSources: 50,
    maxProviderCostMicros: 6_000_000,
    maxWallClockMs: 1_800_000,
  },
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
  scope: z.enum(['local', 'global']),
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
    score?: number;
  }>;
}

interface ProviderSearchResult {
  provider: SearchProvider;
  keySource: SearchCredentialSource;
  response: SearchResult;
}

type SearchAttempt = (
  provider: SearchProvider,
  invoke: () => Promise<SearchResult>
) => Promise<SearchResult>;

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
 * Scope is decided by the classifier. Language alone cannot distinguish a
 * Russian market rule from an international debate written in Russian.
 */
const countryForSubjectLanguage = (language: string) => {
  const normalized = language.trim().toLowerCase();
  return normalized === 'ru' ||
    normalized === 'ru-ru' ||
    normalized === 'russian'
    ? 'russia'
    : undefined;
};

const RESEARCH_LOG_TOPIC_MAX_CHARS = 240;
const LOG_URL = /https?:\/\/[^\s<>()]+/giu;
const LOG_EMAIL = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/giu;
const LOG_BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/giu;
const LOG_SECRET_ASSIGNMENT =
  /\b(api[_-]?key|token|secret|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu;
const LOG_CREDENTIAL =
  /\b(?:sk-(?:proj-)?|pk-|ghp_|github_pat_|xox[baprs]-|eyJ)[A-Za-z0-9._-]{8,}\b/giu;

/** A diagnostic topic, never a copy of pasted material or workspace access data. */
const researchLogTopic = (subject: unknown): string =>
  String(subject)
    .replace(/[\r\n\u2028\u2029]+/gu, ' ')
    .replace(LOG_URL, '[url]')
    .replace(LOG_EMAIL, '[email]')
    .replace(LOG_BEARER, '[redacted]')
    .replace(LOG_SECRET_ASSIGNMENT, '$1=[redacted]')
    .replace(LOG_CREDENTIAL, '[redacted]')
    .replace(/\s{2,}/gu, ' ')
    .trim()
    .slice(0, RESEARCH_LOG_TOPIC_MAX_CHARS);

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
export const cleanExcerpt = (value: string) => {
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

/**
 * The page as material for the digest that turns findings into claims
 * (`content-factory-next-75xn.29`): cleaned of chrome the same way an excerpt
 * is, cut at a paragraph, and capped so five deep-level pages stay inside one
 * prompt. Kept only on an explicit paid level.
 */
export const PAGE_TEXT_MAX_CHARS = 6_000;
const PAGE_TEXT_SCAN_LIMIT = 8 * PAGE_TEXT_MAX_CHARS;
const pageText = (value: string | undefined) => {
  if (!value) return undefined;
  const { text, hasProseLine } = cleanExcerpt(
    value.slice(0, PAGE_TEXT_SCAN_LIMIT)
  );
  if (!hasProseLine || !LETTER.test(text)) return undefined;
  const cut = truncateAtParagraph(text, PAGE_TEXT_MAX_CHARS);
  return cut || undefined;
};

/** Discovery buys a second, general-index pass when the news index gave fewer addresses than this. */
export const DISCOVERY_NEWS_FLOOR = 3;
/** Places of the source cap held for the keyless encyclopedic lane, returned when unused. */
export const ENCYCLOPEDIC_RESERVED_SOURCES = 2;

/** Nobody chose this text for the query, so it has to read like prose. */
const wholePageExcerpt = (value: string | undefined) => {
  if (!value) return undefined;
  const { text, hasProseLine } = cleanExcerpt(value.slice(0, PAGE_SCAN_LIMIT));
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
  /**
   * Read by `AiUsageService`: this refusal happens before any request leaves
   * the building, so the admission it was raised under is voided rather than
   * counted as a failed call (`content-factory-next-75xn.20`, F1).
   */
  readonly configurationRefusal = true;
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
    options: {
      scope: 'local' | 'global';
      country?: string;
      freshnessRequired: boolean;
      maxResults?: number;
      windowDays?: number;
    },
    task: SearchTask,
    attempt: SearchAttempt,
    egressCheck?: (provider: SearchProvider) => void
  ): Promise<ProviderSearchResult> {
    const primary = providerForSearchTask(task, config.search);
    try {
      egressCheck?.(primary);
      const response = await attempt(primary, () =>
        invokeWithDeadline(
          () => getWebSearchClient(organizationId, primary, options),
          query,
          WEB_SEARCH_PRIMARY_TIMEOUT_MS
        )
      );
      if (!response.results?.length) throw new EmptyWebSearchResults();
      this.logger.log(`Web research answered via ${primary}.`);
      return {
        provider: primary,
        keySource:
          searchCredentialFor(primary, config.search)?.source ||
          (config.usageMode === 'workspace_key' ? 'own' : 'system'),
        response,
      };
    } catch (error) {
      /**
       * The fallback is the other engine the workspace holds a search key
       * for, and nothing else (`content-factory-next-75xn.32`, owner decision
       * 13.09.2026). Until that day a Tavily deadline retried through
       * OpenRouter, which answers with the generation key: a search outage
       * quietly became model spend, on the one path the routing rule of
       * `75xn.11` had already closed for a missing key. No second keyed
       * engine means an honest refusal; the model key is never the reserve.
       */
      const reserve = isFallbackFailure(error)
        ? SEARCH_PROVIDERS.find(
            (engine) =>
              engine !== primary &&
              searchProviderNeedsKey(engine) &&
              !!searchKeyFor(engine, config.search)
          )
        : undefined;
      if (!reserve) throw error;

      this.logger.warn(
        `${primary} web research failed (${failureLabel(
          error
        )}); retrying via ${reserve}.`
      );
      try {
        egressCheck?.(reserve);
        const response = await attempt(reserve, () =>
          invokeWithDeadline(
            () => getWebSearchClient(organizationId, reserve, options),
            query,
            WEB_SEARCH_FALLBACK_TIMEOUT_MS
          )
        );
        if (!response.results?.length) throw new EmptyWebSearchResults();
        this.logger.log(`Web research answered via ${reserve}.`);
        return {
          provider: reserve,
          keySource:
            searchCredentialFor(reserve, config.search)?.source ||
            (config.usageMode === 'workspace_key' ? 'own' : 'system'),
          response,
        };
      } catch (fallbackError) {
        throw new WebSearchFallbackError(
          [error, fallbackError],
          [primary, reserve]
        );
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
    const config =
      getActiveAiConfig(organizationId) ?? (await loadAiConfig(organizationId));
    const task: SearchTask =
      options.task ??
      (levelWasExplicit === true ? 'research' : DEFAULT_SEARCH_TASK);
    // The task and the window are part of the question, not of the answer: a
    // thirty-day discovery sweep and a fact check on the same subject are two
    // different searches and must not share one cached result.
    const key = `${organizationId}|${searchRouteFingerprint(
      config.search
    )}|${level}|${options.task ?? ''}|${options.windowDays ?? ''}|${
      options.language ?? ''
    }|${subject.trim().slice(0, MAXIMUM_SUBJECT_LENGTH)}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.logger.debug(`Research cache hit for ${level}.`);
      return cached;
    }
    const primary = providerForSearchTask(task, config.search);
    const primaryCredential = searchCredentialFor(primary, config.search);
    if (
      !config.search.enabled ||
      (searchProviderNeedsKey(primary) && !primaryCredential)
    ) {
      throw new WebSearchNotConfigured();
    }

    type UsageScope = Awaited<
      ReturnType<AiUsageService['beginAiOperationWithConfig']>
    >;
    const scopes = new Map<
      SearchCredentialSource,
      { scope: UsageScope; succeeded: boolean; error?: unknown }
    >();
    const scopePromises = new Map<
      SearchCredentialSource,
      Promise<{ scope: UsageScope; succeeded: boolean; error?: unknown }>
    >();
    let systemQuota: Promise<unknown> | undefined;

    const credentialFor = (provider: SearchProvider) => {
      const credential = searchCredentialFor(provider, config.search);
      if (credential) return credential;
      if (provider === 'openrouter' && config.apiKey) {
        return {
          key: config.apiKey,
          source: (config.usageMode === 'workspace_key'
            ? 'own'
            : 'system') as SearchCredentialSource,
        };
      }
      return undefined;
    };

    const scopeFor = async (provider: SearchProvider) => {
      const credential = credentialFor(provider);
      if (!credential) throw new WebSearchNotConfigured();
      const existing = scopes.get(credential.source);
      if (existing) return existing;
      const pending = scopePromises.get(credential.source);
      if (pending) return pending;

      // Publish the promise before the first await. RU and EN queries may
      // discover the same fallback together; both must share one admission
      // and one finalization for that credential source.
      const creation = (async () => {
        // Deep-search quota belongs to system spend. An own key never reserves
        // it; an own-to-system fallback reserves it immediately before the
        // first system request leaves the process.
        if (credential.source === 'system' && levelWasExplicit) {
          systemQuota ??= (this.quota ?? this.fallbackQuota).reserve(
            organizationId,
            level
          );
          await systemQuota;
        }

        const usageConfig: AiConfig = {
          ...config,
          usageMode:
            credential.source === 'own' ? 'workspace_key' : 'included',
          // Admission checks the credential selected for this operation. The
          // generation key is unrelated to a Tavily or Exa request.
          apiKey: credential.key,
        };
        const begin =
          this.aiUsage.beginAiOperationWithConfig?.bind(this.aiUsage);
        const scope: UsageScope = begin
          ? await begin(
              organizationId,
              'web_research',
              usageConfig,
              'research'
            )
          : ({
              // Compatibility for isolated consumers whose narrow test double
              // predates source-aware admission.
              run: <T>(callback: () => T) =>
                withActiveAiConfig(
                  organizationId,
                  usageConfig,
                  callback,
                  'research'
                ),
              finish: async () => undefined,
            } as UsageScope);
        const tracked: { scope: UsageScope; succeeded: boolean; error?: unknown } = { scope, succeeded: false };
        scopes.set(credential.source, tracked);
        return tracked;
      })();
      scopePromises.set(credential.source, creation);
      try {
        return await creation;
      } catch (error) {
        if (scopePromises.get(credential.source) === creation) {
          scopePromises.delete(credential.source);
        }
        throw error;
      }
    };

    const attempt: SearchAttempt = async (provider, invoke) => {
      const tracked = await scopeFor(provider);
      try {
        const response = await tracked.scope.run(invoke);
        tracked.succeeded = true;
        return response;
      } catch (error) {
        tracked.error = error;
        throw error;
      }
    };

    // Gate the primary source before classification or any provider work. A
    // fallback opens its own source lazily in `attempt`.
    await scopeFor(primary);
    try {
      const result = await withActiveAiConfig(
        organizationId,
        config,
        () =>
          this.researchWithinOperation(
            organizationId,
            subject,
            { ...options, level, levelWasExplicit },
            attempt
          ),
        'research'
      );
      this.cache.set(key, result);
      return result;
    } finally {
      await Promise.all(
        [...scopes.values()].map(({ scope, succeeded, error }) =>
          scope.finish(succeeded, error)
        )
      );
    }
  }

  private async researchWithinOperation(
    organizationId: string,
    subject: string,
    options: WebResearchOptions & { levelWasExplicit?: boolean },
    attempt: SearchAttempt
  ): Promise<WebResearchResult> {
    const config = await requireActiveAiConfig(organizationId);
    /**
     * What this search is for, and through it which engine it reaches.
     *
     * The rule is the same one the research quota already uses: a level names
     * a paid choice a person made, and nothing else in the product passes one.
     * So an explicit level means «собрать опоры», and its absence means the
     * product started this search by itself while writing.
     */
    const task: SearchTask =
      options.task ??
      (options.levelWasExplicit === true ? 'research' : DEFAULT_SEARCH_TASK);
    const routed = providerForSearchTask(task, config.search);
    // A missing search key for the engine this task routes to is configuration,
    // not an outage, and must never cause the model key to be spent on
    // fallback. `providerForSearchTask` has already stepped back to the
    // workspace's own engine if the routed one had no key, so reaching here
    // without one means the workspace has no search configured at all.
    if (
      !config.search.enabled ||
      (searchProviderNeedsKey(routed) && !searchKeyFor(routed, config.search))
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
The reader's output language is {outputLanguage}; use it only to decide whether a named country or market is the reader's own.
Return scope "local" only for laws, markets, companies or institutions of the reader's own country, or when searching outside one country would make no sense. A foreign country's experience discussed as an idea is "global", even when the event itself happened in one country. Return scope "global" when the subject crosses countries or concerns an international debate.
Return subjectLanguage as a lowercase ISO 639-1 code: the language the subject is written in, or the language of the country whose rules, market or institutions it is about.
Always provide englishQuery in English.
Whenever subjectLanguage is not "en", also provide subjectLanguageQuery written in that language, using the terms a reader of that language would search for, including the local names of laws, registers and institutions. Only when subjectLanguage is "en" must subjectLanguageQuery be null.
Set freshnessRequired true only when the subject asks for latest, current, recent, breaking or time-sensitive information.
Subject: {subject}`
    )
      .pipe(classifier)
      .invoke({
        subject: String(subject).slice(0, MAXIMUM_SUBJECT_LENGTH),
        outputLanguage: options.language
          ? contentLanguageNames[options.language]
          : 'unknown',
      });

    /**
     * The subject's own language goes first and English second. Both queries
     * draw on one character budget for excerpts, and when a Russian subject
     * has Russian sources they are the ones worth spending it on.
     */
    const subjectLanguageQuery = classification.subjectLanguageQuery?.trim();
    const englishQuery = classification.englishQuery.trim();
    const ownLanguageQuery =
      subjectLanguageQuery && !isEnglish(classification.subjectLanguage)
        ? subjectLanguageQuery
        : englishQuery;
    const baseQueries =
      classification.scope === 'local'
        ? [ownLanguageQuery]
        : ownLanguageQuery !== englishQuery
        ? [ownLanguageQuery, englishQuery]
        : [englishQuery];

    const level = options.level ?? 'standard';
    const preset = RESEARCH_LEVEL_PRESETS[level];
    // Keep query generation deterministic and bounded. Additional slots are
    // only useful for a distinct locale query; repeating the same words would
    // spend money without adding recall.
    const queries = baseQueries.slice(0, preset.maxSearchQueries);

    const country = classification.scope === 'local'
      ? countryForSubjectLanguage(classification.subjectLanguage)
      : undefined;
    const loggedSubject = researchLogTopic(subject);
    this.logger.log(
      `Web research classification: subject=${JSON.stringify(loggedSubject)} scope=${classification.scope} subjectLanguage=${classification.subjectLanguage} country=${country ?? 'none'} queries=${queries.length}.`
    );

    const searchOptions = {
      scope: classification.scope,
      country,
      freshnessRequired: classification.freshnessRequired,
      ...(options.levelWasExplicit ? { maxResults: preset.maxSources } : {}),
      ...(options.windowDays ? { windowDays: options.windowDays } : {}),
      /**
       * Discovery asks the news index first (`content-factory-next-75xn.23`):
       * it is the one Tavily mode that carries `published_date`, and a lead
       * announced as «свежее за 30 дней» is worthless without one. Thirty of
       * forty leads on 13.09 had no date for exactly this reason.
       */
      ...(task === 'discovery' ? { topic: 'news' as 'news' | 'general' } : {}),
    };
    const egressBudget: ResearchEgressBudget = {
      maxSearchQueries: preset.maxSearchQueries,
      maxAcceptedSources: preset.maxSources,
      maxResponseBytes: WEB_SEARCH_MAX_RESULT_CHARS,
      maxWallClockMs: preset.maxWallClockMs,
      maxProviderCostMicros: preset.maxProviderCostMicros,
      maxConcurrency: Math.max(1, queries.length),
    };
    const providerKillSwitches = (
      process.env.RESEARCH_PROVIDER_KILL_SWITCHES || ''
    )
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
      const error = new Error(
        `Research egress denied: ${decision.code}`
      ) as Error & {
        code?: string;
      };
      error.code = `RESEARCH_EGRESS_${decision.code.toUpperCase()}`;
      throw error;
    };

    /**
     * Бесключевая полоса Wikipedia/Wikidata (`content-factory-next-m0iy.8`)
     * стартует ДО поисковика, а не после него (`content-factory-next-75xn.22`).
     *
     * До 13.09 она включалась, когда потолок принятых источников уже был
     * выбран поисковиком целиком, и лог каждого ресерча заканчивался
     * «skipped: budget_accepted_sources» — энциклопедия не доходила никогда.
     * Теперь полоса идёт параллельно с запросами, а за ней держатся до двух
     * мест из потолка; неиспользованные места возвращаются поисковику. Она
     * по-прежнему включается только при явно выбранном уровне, и её отказ
     * никогда не отменяет уже полученный ответ.
     */
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
          acceptedSources: 0,
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
    const encyclopedicLane: Promise<
      Awaited<ReturnType<WebResearchService['encyclopedicRows']>>
    > = options.levelWasExplicit
      ? withDeadline(
          this.encyclopedicRows({
            entityNames: [...new Set(queries)],
            locales: [
              ...new Set(
                (classification.scope === 'local'
                  ? [classification.subjectLanguage]
                  : [classification.subjectLanguage, 'en']
                )
                  .map((locale) =>
                    String(locale || '')
                      .trim()
                      .toLowerCase()
                  )
                  .filter(Boolean)
              ),
            ],
            allow: encyclopedicAllowed,
          }),
          ENCYCLOPEDIC_LANE_TIMEOUT_MS
        ).catch((error) => {
          this.logger.warn(
            `The keyless encyclopedic lane added nothing: ${describeLaneError(
              error
            )}`
          );
          return [];
        })
      : Promise.resolve([]);

    /**
     * Половина поиска не отменяет вторую (`content-factory-next-ec48.3`).
     *
     * Два запроса идут параллельно, и раньше отказ любого из них — чаще
     * всего срок ожидания у второго — выбрасывал и уже полученный ответ
     * первого. Повторная проверка 05.09 потеряла так две темы из пяти, а
     * ручной поиск по тем же темам минутой позже отвечал. Берётся всё, что
     * ответило; отказом считается только случай, когда не ответил никто.
     */
    const runQueries = async (
      queryOptions: typeof searchOptions,
      indexOffset: number
    ): Promise<ProviderSearchResult[]> => {
      const settled = await Promise.allSettled(
        queries.map((query, index) =>
          this.searchOne(
            organizationId,
            query,
            config,
            queryOptions,
            task,
            attempt,
            egressCheck(indexOffset + index)
          )
        )
      );
      const answered = settled
        .filter(
          (entry): entry is PromiseFulfilledResult<ProviderSearchResult> =>
            entry.status === 'fulfilled'
        )
        .map((entry) => entry.value);
      const failures = settled.filter(
        (entry): entry is PromiseRejectedResult => entry.status === 'rejected'
      );
      if (!answered.length && indexOffset === 0) throw failures[0].reason;
      for (const failure of failures) {
        this.logger.warn(
          `One of ${queries.length} web research queries failed (${failureLabel(
            failure.reason
          )}); keeping the answers that arrived.`
        );
      }
      return answered;
    };
    const responses = await runQueries(searchOptions, 0);
    /**
     * A narrow topic may have no news at all in the window while the wider
     * index knows a trade page or a regulator's notice. Fewer than three
     * addresses from the news index buys one more pass on the general index,
     * inside the same operation and the same query budget.
     */
    if (task === 'discovery') {
      const newsAddresses = new Set(
        responses.flatMap(({ response }) =>
          (response.results || [])
            .map((item) => usableHttpsUrl(item.url))
            .filter((url): url is string => !!url)
        )
      );
      if (newsAddresses.size < DISCOVERY_NEWS_FLOOR) {
        responses.push(
          ...(await runQueries(
            { ...searchOptions, topic: 'general' as const },
            queries.length
          ))
        );
      }
    }
    const laneRows = await encyclopedicLane;
    const laneUsable = laneRows.filter((row) => {
      const url = usableHttpsUrl(row.url);
      return !!url;
    });
    const reservedForLane = Math.min(
      ENCYCLOPEDIC_RESERVED_SOURCES,
      laneUsable.length
    );
    const providerCap = Math.max(1, preset.maxSources - reservedForLane);

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
          if (sourceCount >= providerCap) break;
          sourceCount += 1;
        }
        const score =
          typeof item.score === 'number' && Number.isFinite(item.score)
            ? item.score
            : undefined;
        const text = options.levelWasExplicit
          ? pageText(item.rawContent)
          : undefined;
        sources.set(url, {
          url,
          title: (item.title || url).trim().slice(0, 500),
          publishedAt: item.published_date || item.publishedAt || null,
          provider,
          ...(score !== undefined ? { score } : {}),
          ...(text ? { text } : {}),
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

    for (const row of laneUsable) {
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
        ...(row.extract
          ? { text: row.extract.slice(0, PAGE_TEXT_MAX_CHARS) }
          : {}),
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

    /**
     * The discovery judge runs INSIDE this operation so a topic check stays
     * one counted operation (`content-factory-next-75xn.23`): which rows are
     * about the topic at all, and one sentence about what each says.
     */
    let discovery: WebResearchDiscoveryJudgement[] | undefined;
    if (task === 'discovery' && sources.size) {
      const excerptByUrl = new Map<string, string>();
      for (const fact of facts.values()) {
        if (!excerptByUrl.has(fact.sourceUrl))
          excerptByUrl.set(fact.sourceUrl, fact.text);
      }
      try {
        const judged = await judgeDiscoveryRows(
          organizationId,
          subject,
          [...sources.values()].map((source) => ({
            url: source.url,
            title: source.title,
            excerpt: excerptByUrl.get(source.url) ?? null,
            publishedAt: source.publishedAt,
          }))
        );
        if (judged.size) {
          discovery = [...judged.entries()].map(([url, verdict]) => ({
            url,
            relevant: verdict.relevant,
            reason: verdict.reason,
          }));
        }
      } catch (error) {
        this.logger.warn(
          `The discovery judge answered nothing: ${describeLaneError(error)}`
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
      options.language &&
      summaryNeedsLanguage(providerSummary, options.language)
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
      ...(discovery ? { discovery } : {}),
    };
  }
}
