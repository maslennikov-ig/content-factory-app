import { Injectable, Logger } from '@nestjs/common';
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

export interface WebResearchSource {
  url: string;
  title: string;
  publishedAt: string | null;
  provider: SearchProvider;
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

const subjectClassification = z.object({
  scope: z.enum(['international', 'local']),
  subjectLanguage: z.string().min(2).max(10),
  englishQuery: z.string().min(1),
  localQuery: z.string().nullable(),
  freshnessRequired: z.boolean(),
});

interface SearchResult {
  answer?: string;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    published_date?: string;
    publishedAt?: string;
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
 * original objects.
 */
export class WebSearchFallbackError extends Error {
  constructor(public readonly errors: readonly unknown[]) {
    super(
      `Tavily and OpenRouter web research both failed: ${errors
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
 * Country boosting is deliberately narrow. Russian maps to one product market;
 * English does not identify a country, so an English local subject stays
 * unboosted rather than being silently treated as United States content.
 */
const countryForClassification = (
  scope: 'international' | 'local',
  language: string
) => {
  if (scope !== 'local') return undefined;
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

export class WebSearchNotConfigured extends Error {
  constructor() {
    super(
      'Web search is not configured for this organization. Enable it and add a Tavily key under Settings → AI provider.'
    );
    this.name = 'WebSearchNotConfigured';
  }
}

@Injectable()
export class WebResearchService {
  private readonly logger = new Logger(WebResearchService.name);

  constructor(private readonly aiUsage: AiUsageService) {}

  private async searchOne(
    organizationId: string,
    query: string,
    config: Awaited<ReturnType<typeof requireActiveAiConfig>>,
    options: { country?: string; freshnessRequired: boolean }
  ): Promise<ProviderSearchResult> {
    try {
      const response = await invokeWithDeadline(
        () => getWebSearchClient(organizationId, 'tavily', options),
        query,
        WEB_SEARCH_PRIMARY_TIMEOUT_MS
      );
      if (!response.results?.length) throw new EmptyWebSearchResults();
      this.logger.log('Web research answered via tavily.');
      return { provider: 'tavily', response };
    } catch (error) {
      if (!isFallbackFailure(error) || config.provider !== 'openrouter') {
        throw error;
      }

      this.logger.warn(
        `Tavily web research failed (${failureLabel(
          error
        )}); retrying via OpenRouter.`
      );
      try {
        const response = await invokeWithDeadline(
          () => getWebSearchClient(organizationId, 'openrouter'),
          query,
          WEB_SEARCH_FALLBACK_TIMEOUT_MS
        );
        if (!response.results?.length) throw new EmptyWebSearchResults();
        this.logger.log('Web research answered via openrouter.');
        return { provider: 'openrouter', response };
      } catch (fallbackError) {
        throw new WebSearchFallbackError([error, fallbackError]);
      }
    }
  }

  async research(
    organizationId: string,
    subject: string
  ): Promise<WebResearchResult> {
    return this.aiUsage.executeAiOperation(organizationId, 'web_research', () =>
      this.researchWithinOperation(organizationId, subject)
    );
  }

  private async researchWithinOperation(
    organizationId: string,
    subject: string
  ): Promise<WebResearchResult> {
    const config = await requireActiveAiConfig(organizationId);
    // Tavily is always primary. A missing Tavily key is configuration, not an
    // outage, and must never cause the model key to be spent on fallback.
    if (!config.search.enabled || !config.search.apiKey) {
      throw new WebSearchNotConfigured();
    }

    const classifier = (
      await getChatModel(organizationId, 0)
    ).withStructuredOutput(subjectClassification);
    const classification = await ChatPromptTemplate.fromTemplate(
      `Classify the research subject, then prepare search queries.
The content output language does not control the search language.
Return subjectLanguage as a lowercase ISO 639-1 code.
Always provide englishQuery in English.
Use scope "local" only when the subject is tied to a particular non-global place, institution, person, event or market.
For a local subject, provide localQuery in the subject's own language. Otherwise localQuery must be null.
Set freshnessRequired true only when the subject asks for latest, current, recent, breaking or time-sensitive information.
Subject: {subject}`
    )
      .pipe(classifier)
      .invoke({ subject: String(subject).slice(0, MAXIMUM_SUBJECT_LENGTH) });

    const queries = [classification.englishQuery];
    if (
      classification.scope === 'local' &&
      classification.subjectLanguage.toLowerCase() !== 'en' &&
      classification.localQuery &&
      classification.localQuery !== classification.englishQuery
    ) {
      queries.push(classification.localQuery);
    }

    const options = {
      country: countryForClassification(
        classification.scope,
        classification.subjectLanguage
      ),
      freshnessRequired: classification.freshnessRequired,
    };
    const responses = await Promise.all(
      queries.map((query) =>
        this.searchOne(organizationId, query, config, options)
      )
    );

    const facts = new Map<string, WebResearchFact>();
    const sources = new Map<string, WebResearchSource>();
    let remainingContent = WEB_SEARCH_MAX_RESULT_CHARS;
    for (const { provider, response } of responses) {
      for (const item of response.results || []) {
        if (!item.url) continue;
        sources.set(item.url, {
          url: item.url,
          title: item.title || item.url,
          publishedAt: item.published_date || item.publishedAt || null,
          provider,
        });
        if (!item.content || remainingContent <= 0) continue;
        const sourceContent = truncateAtParagraph(
          item.content,
          WEB_SEARCH_MAX_SOURCE_CHARS
        );
        const content = truncateAtParagraph(sourceContent, remainingContent);
        if (!content) continue;
        const key = `${item.url}|${content}`;
        if (!facts.has(key)) {
          facts.set(key, { text: content, sourceUrl: item.url });
          remainingContent -= content.length;
        }
      }
    }

    const answeringProviders = [
      ...new Set(responses.map(({ provider }) => provider)),
    ];
    return {
      provider:
        answeringProviders.length === 1 ? answeringProviders[0] : 'mixed',
      summary: responses
        .map(({ response }) => response.answer)
        .filter((answer): answer is string => !!answer)
        .join('\n\n'),
      facts: [...facts.values()],
      sources: [...sources.values()],
    };
  }
}
