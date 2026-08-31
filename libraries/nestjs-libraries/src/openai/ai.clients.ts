import OpenAI from 'openai';
import { ChatOpenAI, DallEAPIWrapper } from '@langchain/openai';
import { createOpenAI } from '@ai-sdk/openai';
import { TavilySearch } from '@langchain/tavily';
import {
  AiConfig,
  requireActiveAiConfig,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';

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
const CHAT_TIMEOUT_MS = 60_000;
const CHAT_MAX_RETRIES = 2;

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
  }|${
    config.textModel
  }|${config.imageModel}|${config.search.enabled}|${config.search.provider}|${
    config.search.apiKey
  }|${config.search.topic}|${config.search.depth}|${extra}`;

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

const openAiMemo = memo<OpenAI>();
export const getOpenAiClient = async (organizationId: string) => {
  const config = await requireActiveAiConfig(organizationId);
  return openAiMemo(
    identity(organizationId, config),
    () =>
      new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })
  );
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
  maxTokens?: number
) => {
  const config = await requireActiveAiConfig(organizationId);
  return chatMemo(
    identity(
      organizationId,
      config,
      `${temperature}:${maxTokens ?? 'no-ceiling'}`
    ),
    () =>
      new ChatOpenAI({
        apiKey: config.apiKey,
        model: config.textModel,
        temperature,
        ...(maxTokens ? { maxTokens } : {}),
        timeout: CHAT_TIMEOUT_MS,
        maxRetries: CHAT_MAX_RETRIES,
        ...(config.baseUrl
          ? { configuration: { baseURL: config.baseUrl } }
          : {}),
      })
  );
};

const dalleMemo = memo<DallEAPIWrapper>();
export const getImageModel = async (organizationId: string) => {
  const config = await requireActiveAiConfig(organizationId);
  return dalleMemo(
    identity(organizationId, config),
    () =>
      new DallEAPIWrapper({
        apiKey: config.apiKey,
        model: config.imageModel,
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      })
  );
};

const aiSdkMemo = memo<ReturnType<typeof createOpenAI>>();
export const getAiSdkProvider = async (organizationId: string) => {
  const config = await requireActiveAiConfig(organizationId);
  return aiSdkMemo(identity(organizationId, config), () =>
    createOpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    })
  );
};

export interface WebSearchResponse {
  answer?: string;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    published_date?: string;
    publishedAt?: string;
  }>;
}

export interface WebSearchClient {
  invoke(
    input: { query: string },
    config?: { timeout?: number }
  ): Promise<WebSearchResponse>;
}

export interface WebSearchClientOptions {
  country?: string;
  freshnessRequired?: boolean;
}

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
  }>;
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
 * The research port has one content field, so prefer the full page here and
 * let the shared service apply its strict prompt-size ceilings.
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
        ...(result.raw_content || result.content
          ? { content: result.raw_content || result.content }
          : {}),
        ...(result.published_date
          ? { published_date: result.published_date }
          : {}),
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
    private readonly model: string
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
          max_results: 5,
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
export const getWebSearchClient = async (
  organizationId: string,
  provider: 'tavily' | 'openrouter' = 'tavily',
  options: WebSearchClientOptions = {}
) => {
  const config = await requireActiveAiConfig(organizationId);
  if (
    !config.search.enabled ||
    (provider === 'tavily' && !config.search.apiKey)
  ) {
    throw new Error('Web search is not configured for this organization.');
  }
  if (provider === 'openrouter' && config.provider !== 'openrouter') {
    throw new Error(
      'OpenRouter fallback is unavailable for this organization.'
    );
  }

  const freshnessRequired =
    options.freshnessRequired || config.search.topic === 'news';
  return webSearchMemo(
    identity(
      organizationId,
      config,
      `${provider}|${options.country || ''}|${freshnessRequired}`
    ),
    () => {
      if (provider === 'tavily') {
        return new TavilyWebSearch(
          new TavilySearch({
            tavilyApiKey: config.search.apiKey,
            topic: freshnessRequired ? 'news' : 'general',
            searchDepth: config.search.depth,
            maxResults: 5,
            includeAnswer: true,
            includeRawContent: true,
            ...(freshnessRequired ? { timeRange: 'week' } : {}),
            // Tavily documents country boosting only for the general topic.
            ...(!freshnessRequired && options.country
              ? { country: options.country }
              : {}),
          })
        );
      }

      return new OpenRouterWebSearch(
        new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
        }),
        config.textModel
      );
    }
  );
};
