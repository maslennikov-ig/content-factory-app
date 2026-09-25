import OpenAI from 'openai';
import { ChatOpenAI, DallEAPIWrapper } from '@langchain/openai';
import { createOpenAI } from '@ai-sdk/openai';
import { TavilySearch } from '@langchain/tavily';
import {
  AiConfig,
  getActiveAiRole,
  requireActiveAiConfig,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import {
  AiRole,
  DEFAULT_AI_ROLE,
  modelFor,
  roleModelFingerprint,
} from '@contentfactory/nestjs-libraries/openai/ai.roles';
import {
  SearchProvider,
  searchKeyFor,
  searchProviderNeedsKey,
  searchRouteFingerprint,
} from '@contentfactory/nestjs-libraries/openai/ai.search-tasks';
import {
  STANDARD_ATTEMPT_TIMEOUT_MS,
  TextChainSource,
  createTextChainFetch,
  generationTimeoutMs,
  registerChainClient,
  textChainApplies,
  textChainBudgetMs,
  maxTextChainBudgetMs,
  withReasoningHeadroom,
} from '@contentfactory/nestjs-libraries/openai/ai.text-chain';

/**
 * Lazily built, cache-invalidated clients for every AI SDK in the repository.
 *
 * Upstream built each client once at import time from environment variables,
 * which made a key stored in the database unusable: the process would keep the
 * value it read at boot. Each factory here rebuilds whenever the resolved
 * configuration changes, so saving the settings form takes effect immediately.
 *
 * Every factory takes an organization, because the key belongs to one. The
 * configuration is required rather than merely loaded: an organization without
 * a key gets a clear error here instead of a 401 from the provider.
 *
 * Each SDK needs its own form of redirection: ChatOpenAI takes
 * `configuration.baseURL`, DallEAPIWrapper takes `baseUrl`, and the default
 * export of `@ai-sdk/openai` is pinned to api.openai.com, so it has to be built
 * through `createOpenAI`.
 */

/**
 * A model call that never returns is worse than one that fails: an autopost
 * run, a scheduled workflow and a chat turn all wait on it. LangChain leaves
 * the deadline unset and retries six times by default, so a slow provider can
 * hold a request for as long as it likes.
 */
const CHAT_TIMEOUT_MS = STANDARD_ATTEMPT_TIMEOUT_MS;
const CHAT_MAX_RETRIES = 2;

/**
 * What the shared transport needs from a configuration
 * (`content-factory-next-97dq.55`). The image model is named as a pass-through,
 * so a chat completion asking for a picture never walks the text chain.
 */
const chainSourceOf = (config: AiConfig): TextChainSource => ({
  usageMode: config.usageMode,
  provider: config.provider,
  textChain: config.textChain,
  passthroughModels: [modelFor('image', config)],
});

/**
 * Inside the chain the transport owns retries and deadlines. SDK retries would
 * repeat a whole chain, up to four attempts each time. The SDK's own deadline
 * has to cover every attempt, or it ends the chain in the middle of the first
 * flex wait.
 */
const chainClientOptions = (config: AiConfig, model: string) =>
  textChainApplies(chainSourceOf(config))
    ? { timeout: textChainBudgetMs(model, chainSourceOf(config)), maxRetries: 0 }
    : undefined;

/** One research chain stays inside the existing 20-second budget. */
export const WEB_SEARCH_TIMEOUT_MS = 20_000;
export const WEB_SEARCH_PRIMARY_TIMEOUT_MS = 12_000;
export const WEB_SEARCH_FALLBACK_TIMEOUT_MS =
  WEB_SEARCH_TIMEOUT_MS - WEB_SEARCH_PRIMARY_TIMEOUT_MS;

/**
 * Tavily raw pages measured 15k–48k characters per source on 2026-08-14,
 * with five sources and as many as two queries. Keeping at most 8k from one
 * page and 32k across the returned fact text preserves several useful
 * paragraphs without multiplying that worst case through four later prompts.
 * Summary, source labels and URLs are deliberately outside this fact-text
 * ceiling; WebResearchService enforces both text limits at paragraph boundaries.
 */
export const WEB_SEARCH_MAX_SOURCE_CHARS = 8_000;
export const WEB_SEARCH_MAX_RESULT_CHARS = 32_000;

const identity = (
  organizationId: string,
  config: AiConfig,
  extra = ''
) =>
  `${organizationId}|${config.usageMode}|${config.provider}|${config.apiKey}|${
    config.baseUrl ?? ''
  }|${roleModelFingerprint(config)}|${config.search.enabled}|${
    config.search.provider
  }|${config.search.apiKey}|${searchRouteFingerprint(config.search)}|${
    config.search.topic
  }|${config.search.depth}|${config.textChain?.flex ?? ''}|${
    config.textChain?.fallbackModel ?? ''
  }|${extra}`;

/**
 * One entry per distinct configuration rather than a single slot. With one
 * slot, two organizations working at the same time would rebuild every client
 * on every alternation. The bound keeps an instance with many organizations
 * from holding a client per tenant forever; an evicted client is simply built
 * again on its next call.
 */
const MAX_CLIENTS = 32;

const memo = <T>() => {
  const entries = new Map<string, T>();
  return (key: string, build: () => T): T => {
    const hit = entries.get(key);
    if (hit !== undefined) {
      // Refresh insertion order so the least recently used entry is evicted.
      entries.delete(key);
      entries.set(key, hit);
      return hit;
    }

    const value = build();
    entries.set(key, value);
    if (entries.size > MAX_CLIENTS) {
      entries.delete(entries.keys().next().value as string);
    }
    return value;
  };
};

/**
 * The role a client is built for when the caller names none: the one the
 * admitted operation is running under. Every client factory here already
 * refuses to run outside an admitted operation, so this is set in practice;
 * the fallback only covers a role the ledger could not name.
 *
 * This is what lets a call site that was written before roles existed pick up
 * its operation's routing without being edited, and it is why the model the
 * ledger recorded is the model the provider is actually asked for.
 */
const activeRole = (role?: AiRole): AiRole =>
  role ?? getActiveAiRole() ?? DEFAULT_AI_ROLE;

/**
 * The model id for one call, for the SDKs that take it per request rather than
 * per client — `client.chat.completions.parse`, `images.generate`. Call sites
 * ask for this instead of reading `textModel` themselves.
 */
export const getModelForRole = async (
  organizationId: string,
  role?: AiRole
): Promise<string> =>
  modelFor(activeRole(role), await requireActiveAiConfig(organizationId));

const openAiMemo = memo<OpenAI>();
export const getOpenAiClient = async (organizationId: string) => {
  const config = await requireActiveAiConfig(organizationId);
  return openAiMemo(identity(organizationId, config), () => {
    // A direct client serves any role, so its budget covers the longest
    // chain any role's model can walk — flex included — whatever the default
    // role's model is (correctness review F14).
    const chained = textChainApplies(chainSourceOf(config))
      ? { timeout: maxTextChainBudgetMs(chainSourceOf(config)), maxRetries: 0 }
      : undefined;
    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      ...(chained ?? {}),
      // The transport knows the SDK's deadline, so the retry after a cut
      // answer starts only while it fits (review F1 of the fifteenth walk).
      fetch: createTextChainFetch(chainSourceOf(config), undefined, {
        budgetMs: chained?.timeout,
      }),
    });
    if (chained) registerChainClient(client, chained.timeout);
    return client;
  });
};

const chatMemo = memo<ChatOpenAI>();
/**
 * @param maxTokens insurance, never the regulator of length.
 *
 * Both answers of the research say the same thing: a token is not a character,
 * the ratio between them depends on the language, and a ceiling tuned on
 * English gives a different length in Russian — which for sixteen locales is
 * not a detail. So the author's own range goes into the prompt as a direction,
 * the deterministic check happens after the draft, and this only stops a
 * runaway generation from being paid for in full.
 */
export const getChatModel = async (
  organizationId: string,
  temperature = 0.7,
  maxTokens?: number,
  /**
   * Last rather than first, so the dozen call sites written before roles
   * existed keep compiling and keep the model they had. Naming it is how a
   * call that is cheaper than its operation — classifying a research subject
   * inside a research run — asks for a cheaper model.
   */
  role?: AiRole
) => {
  const config = await requireActiveAiConfig(organizationId);
  const chosen = activeRole(role);
  return chatMemo(
    identity(
      organizationId,
      config,
      `${chosen}:${temperature}:${maxTokens ?? 'no-ceiling'}`
    ),
    () => {
      const model = modelFor(chosen, config);
      const chained = chainClientOptions(config, model);
      return new ChatOpenAI({
        apiKey: config.apiKey,
        model,
        temperature,
        ...(maxTokens ? { maxTokens } : {}),
        // Outside the chain the SDK's deadline is the whole call: a whole
        // answer arrives at once, after the reasoning and the text, so it gets
        // the generation room of the ceiling the transport sends (97dq.95).
        timeout:
          chained?.timeout ??
          Math.max(
            CHAT_TIMEOUT_MS,
            generationTimeoutMs(maxTokens ? withReasoningHeadroom(maxTokens) : undefined)
          ),
        maxRetries: chained?.maxRetries ?? CHAT_MAX_RETRIES,
        // Inside `streamEvents` LangChain turns `invoke` into a stream on its
        // own, and nothing here reads tokens as they come. A stream skips the
        // retry after a cut answer and the body window, so the post draft of
        // the sixteenth walk (25.09.2026) still ended in `Failed to parse`
        // after 97dq.91. One whole answer per call, whoever is listening.
        disableStreaming: true,
        configuration: {
          ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
          // Every text call leaves through the shared transport: the chain
          // where it applies, a plain pass that reads usage everywhere else.
          // Outside the chain there is no retry after a cut answer, so the
          // SDK's 60 s and its retries wrap one request as before.
          fetch: createTextChainFetch(chainSourceOf(config), undefined, {
            budgetMs: chained?.timeout,
          }),
        },
      });
    }
  );
};

const dalleMemo = memo<DallEAPIWrapper>();
export const getImageModel = async (organizationId: string) => {
  const config = await requireActiveAiConfig(organizationId);
  return dalleMemo(
    identity(organizationId, config, 'image'),
    () =>
      new DallEAPIWrapper({
        apiKey: config.apiKey,
        model: modelFor('image', config),
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      })
  );
};

const aiSdkMemo = memo<ReturnType<typeof createOpenAI>>();
/**
 * The AI SDK provider behind the copilot chat (`content-factory-next-97dq.63`).
 *
 * Its calls leave through the same shared transport as every other text call:
 * the flex chain where it applies, and usage read into the operation's ledger
 * everywhere. The transport serves `/chat/completions`, so callers take the
 * chat model (`provider.chat(model)`); the provider's default call in
 * `@ai-sdk/openai` 2.x goes to the Responses API, which the chain and the
 * ledger do not read. The AI SDK sets no request deadline of its own, so the
 * chain's per-attempt deadlines are the only ones, and the Mastra agent sets
 * model retries to 0 (`load.tools.service.ts`), so a chain is never repeated
 * on top of itself.
 *
 * A person waits on the chat, so its chain is the interactive one (review F8
 * of the fourteenth walk): one flex attempt with a 25-second time to first
 * token, then standard, then the fallback model — never two three-minute
 * flex waits before the first word.
 */
export const getAiSdkProvider = async (organizationId: string) => {
  const config = await requireActiveAiConfig(organizationId);
  return aiSdkMemo(identity(organizationId, config), () =>
    createOpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      fetch: createTextChainFetch({
        ...chainSourceOf(config),
        profile: 'interactive',
      }),
    })
  );
};

export interface WebSearchResponse {
  answer?: string;
  results?: Array<{
    title?: string;
    url?: string;
    /**
     * The extract the provider chose for this query: an assertion, usually a
     * sentence or two, and the only field that is about the subject rather
     * than about the page.
     */
    content?: string;
    /**
     * The whole page as markdown, when the provider fetched one. It starts
     * with the site's navigation, its logo and its cookie bar, so it is
     * material for a reader that cleans it, never an excerpt as it stands
     * (`content-factory-next-fn33.134`).
     */
    rawContent?: string;
    published_date?: string;
    publishedAt?: string;
    /** Provider discovery text. It is never promoted to citable evidence. */
    nonCitableSnippet?: string;
    /** The engine's relevance score for this row, 0–1, when it gives one. */
    score?: number;
  }>;
}

export interface WebSearchClient {
  invoke(
    input: { query: string },
    config?: { timeout?: number }
  ): Promise<WebSearchResponse>;
}

export interface WebSearchClientOptions {
  /** Country ranking is permitted only for a subject tied to one country. */
  scope?: 'local' | 'global';
  country?: string;
  freshnessRequired?: boolean;
  maxResults?: number;
  /**
   * Which index to ask, named by the caller rather than inferred
   * (`content-factory-next-75xn.23`). `news` is the one Tavily mode that
   * returns `published_date`; a discovery sweep needs that date more than it
   * needs breadth. Unset keeps the freshness-driven choice.
   */
  topic?: 'news' | 'general';
  /**
   * Only pages published inside this many days back.
   *
   * Both engines document a published-date filter and neither applies one
   * unasked, so «what is new about this» was previously unaskable: the only
   * recency the product could express was Tavily's one-week news window, and
   * Exa was given no window at all. A window is a claim about the subject, not
   * about the engine, so it is named in days here and translated once per
   * adapter (`content-factory-next-75xn.3`).
   */
  windowDays?: number;
}

/** The window a topic subscription watches, and the only caller of one today. */
export const DISCOVERY_WINDOW_DAYS = 30;

/**
 * Tavily takes a named range rather than a number of days. Rounding up keeps
 * the window a superset of what was asked for — a caller that wanted 30 days
 * and silently received 7 would report «nothing new» about a subject that had
 * moved, which is the one failure this parameter exists to prevent.
 */
const tavilyTimeRange = (
  windowDays?: number
): 'day' | 'week' | 'month' | 'year' | undefined => {
  if (!windowDays || windowDays <= 0) return undefined;
  if (windowDays <= 1) return 'day';
  if (windowDays <= 7) return 'week';
  if (windowDays <= 31) return 'month';
  return 'year';
};

/** Exa takes an ISO 8601 instant, exclusive of anything published before it. */
const publishedAfter = (windowDays?: number): string | undefined =>
  !windowDays || windowDays <= 0
    ? undefined
    : new Date(Date.now() - windowDays * 24 * 60 * 60 * 1_000).toISOString();

/**
 * Tavily boosts by country name, Exa by two-letter code, and the research
 * service speaks Tavily's dialect because Tavily was the only engine when the
 * parameter was added. Only the countries the subject classifier can actually
 * produce are listed; anything else is sent to neither engine rather than
 * guessed, since a wrong region is worse than no region.
 */
const EXA_USER_LOCATION: Record<string, string> = { russia: 'RU' };


interface TavilySearchResponse extends WebSearchResponse {
  error?: string;
  status?: unknown;
  code?: unknown;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    raw_content?: string | null;
    published_date?: string;
    score?: number;
  }>;
}

/** The small wire adapter for Exa's HTTP API. No SDK dependency is needed. */
export class ExaWebSearch implements WebSearchClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly maxResults = 5,
    private readonly options: Pick<
      WebSearchClientOptions,
      'scope' | 'country' | 'freshnessRequired' | 'windowDays'
    > = {}
  ) {}

  async invoke({ query }: { query: string }): Promise<WebSearchResponse> {
    const startPublishedDate = publishedAfter(this.options.windowDays);
    const userLocation = this.options.scope === 'local' && this.options.country
      ? EXA_USER_LOCATION[this.options.country]
      : undefined;
    const response = await this.fetchImpl('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // Exa's search endpoint authenticates with its own header. A bearer
        // token is accepted by some HTTP proxies but is rejected by Exa and
        // would make the configured provider look unavailable.
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults: Math.min(Math.max(this.maxResults, 1), 100),
        // Exa's public Search contract takes a boolean here. The shared
        // research service applies its own byte/character ceiling after the
        // response, so this stays compatible with the documented endpoint.
        contents: { text: true, highlights: true },
        // Each of the three is omitted rather than sent empty: Exa validates
        // the body, and a null where it documents a string is a 4xx on a
        // search that would otherwise have worked.
        ...(startPublishedDate ? { startPublishedDate } : {}),
        // `category` narrows the index rather than ranking within it, so it is
        // set only where the subject really is time-sensitive — the classifier
        // already answers that question for both engines.
        ...(this.options.freshnessRequired === true
          ? { category: 'news' }
          : {}),
        ...(userLocation ? { userLocation } : {}),
      }),
    });
    if (!response.ok) {
      const error = new Error(`Exa search failed with status ${response.status}`) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }
    const body = (await response.json()) as {
      results?: Array<{
        url?: unknown;
        title?: unknown;
        text?: unknown;
        highlights?: unknown;
        contents?: { text?: unknown; highlights?: unknown } | null;
        publishedDate?: unknown;
        published_date?: unknown;
        score?: unknown;
      }>;
    };
    return {
      results: (Array.isArray(body?.results) ? body.results : [])
        .map((item) => {
          // The documented Search response uses top-level `text` and
          // `highlights`; newer responses may nest them under `contents`.
          // Highlights are discovery hints. Text is the page content and is
          // the only Exa field that may be used as citable source material by
          // WebResearchService.
          const snippet =
            Array.isArray(item.contents?.highlights)
              ? item.contents.highlights
                    .filter((highlight): highlight is string => typeof highlight === 'string' && highlight.trim().length > 0)
                    .join('\n')
                    .trim() || undefined
              : Array.isArray(item.highlights)
                ? item.highlights
                    .filter((highlight): highlight is string => typeof highlight === 'string' && highlight.trim().length > 0)
                    .join('\n')
                    .trim() || undefined
                : undefined;
          const rawContent =
            typeof item.contents?.text === 'string' && item.contents.text.trim()
              ? item.contents.text.trim()
              : typeof item.text === 'string' && item.text.trim()
                ? item.text.trim()
              : undefined;
          const publishedDate =
            typeof item.publishedDate === 'string'
              ? item.publishedDate
              : typeof item.published_date === 'string'
                ? item.published_date
                : undefined;
          return {
            ...(typeof item.title === 'string' && item.title.trim()
              ? { title: item.title.trim() }
              : {}),
            ...(typeof item.url === 'string' && item.url.trim()
              ? { url: item.url.trim() }
              : {}),
            ...(snippet ? { nonCitableSnippet: snippet } : {}),
            ...(rawContent ? { rawContent } : {}),
            ...(publishedDate ? { published_date: publishedDate } : {}),
            ...(typeof item.score === 'number' ? { score: item.score } : {}),
          };
        })
        .filter((item) => !!item.url),
    };
  }
}

/**
 * `@langchain/tavily` catches every HTTP failure and returns only a string,
 * so the transport status never reaches us as a field. Its own message is
 * built as `Error <status>: <detail>` and nothing else in the tool produces
 * that prefix, so the status is recovered from the anchored prefix alone.
 * Matching a bare three-digit number anywhere in the text would misread a
 * validation message such as `maxResults must be below 500` as a 5xx outage
 * and buy a paid fallback for a bug in our own request.
 */
const TAVILY_ADAPTER_STATUS = /^Error (\d{3}):/;

const tavilyErrorStatus = (
  message: string,
  explicit: unknown
): number | undefined => {
  if (explicit !== undefined) {
    const status = Number(explicit);
    return Number.isFinite(status) ? status : undefined;
  }
  const matched = TAVILY_ADAPTER_STATUS.exec(message);
  return matched ? Number(matched[1]) : undefined;
};

/**
 * LangChain exposes Tavily's `raw_content` beside the short content snippet.
 * Both reach the research port under their own names.
 *
 * Until 05.09.2026 this class collapsed them — `raw_content || content` into
 * one `content` field — so the page always won and the snippet was thrown
 * away before anyone could choose. A page begins with its menu, and that is
 * what the search panel then offered as the fragment worth citing
 * (`content-factory-next-fn33.134`). Which of the two is the excerpt is a
 * judgment about the subject, not about the wire, so it belongs to the
 * service; this class only stops destroying the evidence for it.
 */
export class TavilyWebSearch implements WebSearchClient {
  constructor(private readonly client: TavilySearch) {}

  async invoke({ query }: { query: string }): Promise<WebSearchResponse> {
    const response = (await this.client.invoke({
      query,
    })) as TavilySearchResponse;
    if (response.error) {
      if (/no search results found/i.test(response.error)) {
        return { results: [] };
      }
      const error = new Error(response.error) as Error & {
        status?: number;
        code?: unknown;
      };
      const status = tavilyErrorStatus(response.error, response.status);
      if (status !== undefined) error.status = status;
      if (response.code !== undefined) error.code = response.code;
      throw error;
    }

    return {
      ...(response.answer ? { answer: response.answer } : {}),
      results: (response.results || []).map((result) => ({
        ...(result.title ? { title: result.title } : {}),
        ...(result.url ? { url: result.url } : {}),
        ...(result.content ? { content: result.content } : {}),
        ...(result.raw_content ? { rawContent: result.raw_content } : {}),
        ...(result.published_date
          ? { published_date: result.published_date }
          : {}),
        ...(typeof result.score === 'number' ? { score: result.score } : {}),
      })),
    };
  }
}

interface OpenRouterUrlCitation {
  type: 'url_citation';
  url_citation: {
    url?: string;
    title?: string;
    content?: string;
  };
}

/**
 * OpenRouter's web plugin returns sources as message annotations rather than
 * Tavily's top-level results. Keep that wire shape inside this implementation
 * and expose only the stable search-port contract to research consumers.
 */
export class OpenRouterWebSearch implements WebSearchClient {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
    private readonly maxResults = 5
  ) {}

  async invoke({ query }: { query: string }): Promise<WebSearchResponse> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: query }],
      plugins: [
        {
          id: 'web',
          engine: 'parallel',
          mode: 'advanced',
          // OpenRouter documents no upper bound for its web plugin; 20 is the
          // value that has answered in production, and deep research reaches its
          // 50 sources by query count, not by one oversized page.
          max_results: Math.min(Math.max(this.maxResults, 1), 20),
        },
      ],
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const message = completion.choices[0]?.message as unknown as
      | {
          content?: string | null;
          annotations?: OpenRouterUrlCitation[];
        }
      | undefined;

    return {
      ...(message?.content ? { answer: message.content } : {}),
      results: (message?.annotations || [])
        .filter(
          (annotation): annotation is OpenRouterUrlCitation =>
            annotation.type === 'url_citation' && !!annotation.url_citation?.url
        )
        .map(({ url_citation: citation }) => ({
          ...(citation.title ? { title: citation.title } : {}),
          url: citation.url,
          ...(citation.content ? { content: citation.content } : {}),
        })),
    };
  }
}

const webSearchMemo = memo<WebSearchClient>();
/** Documented Tavily `max_results` range is 0–20 (docs.tavily.com, search endpoint). */
export const TAVILY_MAX_RESULTS = 20;

export const getWebSearchClient = async (
  organizationId: string,
  provider: SearchProvider = 'tavily',
  options: WebSearchClientOptions = {}
) => {
  const config = await requireActiveAiConfig(organizationId);
  // The key belongs to the engine being built, not to the workspace's default
  // one: since `content-factory-next-75xn.1` a workspace may hold a key for
  // each engine, and routing a task to one of them must reach that engine's
  // key or none at all.
  const searchApiKey = searchKeyFor(provider, config.search);
  if (
    !config.search.enabled ||
    (searchProviderNeedsKey(provider) && !searchApiKey)
  ) {
    throw new Error('Web search is not configured for this organization.');
  }
  if (provider === 'openrouter' && config.provider !== 'openrouter') {
    throw new Error(
      'OpenRouter fallback is unavailable for this organization.'
    );
  }

  // A named index wins over the inferred one: a discovery sweep says `news`
  // because it needs dates, and says `general` on its second pass because the
  // news index answered too little — neither is a claim about the subject.
  const freshnessRequired = options.topic
    ? options.topic === 'news'
    : options.freshnessRequired || config.search.topic === 'news';
  const timeRange = tavilyTimeRange(options.windowDays);
  const country = options.scope === 'local' ? options.country : undefined;
  return webSearchMemo(
    identity(
      organizationId,
      config,
      `${provider}|${searchApiKey}|${options.scope || ''}|${country || ''}|${freshnessRequired}|${
        options.maxResults ?? ''
      }|${options.windowDays ?? ''}`
    ),
    () => {
      if (provider === 'tavily') {
        return new TavilyWebSearch(
          new TavilySearch({
            tavilyApiKey: searchApiKey,
            topic: freshnessRequired ? 'news' : 'general',
            searchDepth: config.search.depth,
            // Tavily accepts max_results 0–20 and the client does not clamp:
            // a larger value is a validation error, not more sources. Deep
            // research collects its 50 sources across its 25 queries instead.
            maxResults: Math.min(Math.max(options.maxResults ?? 5, 1), TAVILY_MAX_RESULTS),
            includeAnswer: true,
            includeRawContent: true,
            // An asked-for window wins over the news default: «за последние 30
            // дней» is a narrower claim than «this subject is time-sensitive»,
            // and the caller that named days meant them.
            ...(timeRange
              ? { timeRange }
              : freshnessRequired
              ? { timeRange: 'week' }
              : {}),
            // Tavily documents country boosting only for the general topic.
            ...(!freshnessRequired && country
              ? { country }
              : {}),
          })
        );
      }

      if (provider === 'exa') {
        return new ExaWebSearch(searchApiKey, fetch, options.maxResults ?? 5, {
          scope: options.scope,
          country,
          freshnessRequired,
          windowDays: options.windowDays,
        });
      }

      // The fallback both searches and answers, so it is the `research` role
      // rather than whatever the surrounding operation is drafting with.
      //
      // Its web-plugin call is text, and it is metered like every other text
      // call (review F17, `97dq.66`): the shared transport reads its usage and
      // sends it once, outside the flex chain, because this caller abandons
      // the search after its research budget. The SDK gets that budget and no
      // retries of its own, so an abandoned request is not paid for again.
      return new OpenRouterWebSearch(
        new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
          timeout: WEB_SEARCH_TIMEOUT_MS,
          maxRetries: 0,
          fetch: createTextChainFetch(chainSourceOf(config), undefined, {
            budgetMs: WEB_SEARCH_TIMEOUT_MS,
          }),
        }),
        modelFor('research', config),
        options.maxResults ?? 5
      );
    }
  );
};
