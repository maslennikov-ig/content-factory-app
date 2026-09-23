import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * One transport for every text call, and the ledger that learns what it cost.
 *
 * `content-factory-next-97dq.55`. Owner's decision of 23.09.2026: text runs on
 * `openai/gpt-6-luna` with reasoning effort `medium`, and each call walks
 * flex → flex → standard → `z-ai/glm-5.3`. Batch is not used, because a person
 * is waiting on every call.
 *
 * The chain is a `fetch`, not a wrapper around one SDK. LangChain's
 * `ChatOpenAI` and the plain OpenAI client both accept a custom `fetch`, and
 * the product calls the provider through both. A chain at the transport sees
 * both kinds of call and needs no change at their call sites. A chain inside
 * one SDK would leave the other one on a single attempt.
 *
 * OpenRouter facts this relies on (docs, 2026-09-23): top-level
 * `service_tier: "flex"` sends the request only to flex endpoints and reports
 * missing capacity as an error instead of falling back; the response carries
 * the tier that served it and a `usage` object, and `usage: {include: true}`
 * adds `cost` to that object.
 *
 * Imports only `node:async_hooks`. `ai.clients.ts` and `ai.usage.service.ts`
 * both depend on it, and the Jest map loads the real module for every suite
 * that compiles either of them (`tests/helpers/ai-text-chain.cjs`).
 */

/** Flex waits in a queue for spare capacity, so it gets three times as long. */
export const FLEX_ATTEMPT_TIMEOUT_MS = 180_000;
/** The deadline a standard call has had since `ai.clients.ts` gained one. */
export const STANDARD_ATTEMPT_TIMEOUT_MS = 60_000;
/** Time the SDK allows beyond the attempts themselves, for reading the body. */
const CHAIN_BUDGET_MARGIN_MS = 5_000;

export const DEFAULT_TEXT_FALLBACK_MODEL = 'z-ai/glm-5.3';
export const DEFAULT_TEXT_FLEX_ENABLED = true;

/** What the operator set on the instance row; absent reads as the defaults. */
export interface TextChainSettings {
  flex: boolean;
  /**
   * Empty here means «no fallback model». The stored column cannot express
   * that: an empty column reads as the default (`resolveTextChainSettings`).
   */
  fallbackModel: string;
}

export const defaultTextChainSettings = (): TextChainSettings => ({
  flex: DEFAULT_TEXT_FLEX_ENABLED,
  fallbackModel: DEFAULT_TEXT_FALLBACK_MODEL,
});

/**
 * The instance row's two nullable columns resolved to settings. `null` means
 * «never set» and reads as the default. An empty model id also reads as the
 * default: the screen clears a field to return to it, not to switch the
 * fallback off.
 */
export const resolveTextChainSettings = (row?: {
  textFlexEnabled?: boolean | null;
  textFallbackModel?: string | null;
} | null): TextChainSettings => ({
  flex:
    typeof row?.textFlexEnabled === 'boolean'
      ? row.textFlexEnabled
      : DEFAULT_TEXT_FLEX_ENABLED,
  fallbackModel:
    (row?.textFallbackModel || '').trim() || DEFAULT_TEXT_FALLBACK_MODEL,
});

/** The part of a resolved configuration the transport reads. */
export interface TextChainSource {
  usageMode: 'included' | 'workspace_key';
  provider: 'openai' | 'openrouter';
  textChain?: TextChainSettings;
  /**
   * Model ids that are never text: the image model. A chat completion that
   * asks for one of them passes through untouched. Falling back from a
   * picture to GLM would return text where an image was expected.
   */
  passthroughModels?: readonly string[];
}

export interface TextAttempt {
  /** 1-based position in this call's chain; recorded as `AiUsageRecord.attempt`. */
  number: number;
  model: string;
  flex: boolean;
  timeoutMs: number;
}

/**
 * The chain runs only where the bill is ours and the provider is OpenRouter.
 *
 * On `workspace_key` the key and the model belong to the workspace. Tier
 * choice, a second model and an effort level would each change what the
 * workspace pays for, so its calls leave byte-for-byte as they did. The
 * `openai` provider has no GLM and no OpenRouter routing either.
 */
export const textChainApplies = (source: TextChainSource): boolean =>
  source.usageMode === 'included' && source.provider === 'openrouter';

/**
 * Luna-family ids take `reasoning.effort`. GLM gets nothing: OpenRouter's
 * unified `reasoning` object is honoured per model, and the owner's decision
 * names Luna, so a fallback keeps the provider's own default rather than a
 * guessed one.
 */
export const isLunaModel = (model: string): boolean =>
  /(^|\/)gpt-[\w.]*-luna(\b|$)/i.test(model);

/**
 * OpenRouter's flex endpoints are OpenAI's (`openai/flex`). Asking a model of
 * another vendor for flex would be refused on every call, and each refusal
 * costs a round trip before the standard attempt.
 */
const flexCapable = (model: string) => model.startsWith('openai/');

export const planTextAttempts = (
  model: string,
  source: TextChainSource
): TextAttempt[] => {
  if (!textChainApplies(source)) {
    return [
      { number: 1, model, flex: false, timeoutMs: STANDARD_ATTEMPT_TIMEOUT_MS },
    ];
  }
  const settings = source.textChain ?? defaultTextChainSettings();
  const steps: Array<Omit<TextAttempt, 'number'>> = [];
  if (settings.flex && flexCapable(model)) {
    steps.push(
      { model, flex: true, timeoutMs: FLEX_ATTEMPT_TIMEOUT_MS },
      { model, flex: true, timeoutMs: FLEX_ATTEMPT_TIMEOUT_MS }
    );
  }
  steps.push({ model, flex: false, timeoutMs: STANDARD_ATTEMPT_TIMEOUT_MS });
  const fallback = settings.fallbackModel.trim();
  if (fallback && fallback !== model) {
    steps.push({
      model: fallback,
      flex: false,
      timeoutMs: STANDARD_ATTEMPT_TIMEOUT_MS,
    });
  }
  return steps.map((step, index) => ({ ...step, number: index + 1 }));
};

/**
 * How long the SDK may wait on the whole chain. The SDK arms its own timer
 * around `fetch`, and its default 60 seconds would end the chain in the
 * middle of the first flex attempt.
 */
export const textChainBudgetMs = (
  model: string,
  source: TextChainSource
): number =>
  planTextAttempts(model, source).reduce(
    (total, attempt) => total + attempt.timeoutMs,
    CHAIN_BUDGET_MARGIN_MS
  );

/**
 * The longest chain any model can walk under these settings: two flex
 * attempts, the standard one and the fallback. A client that serves every role
 * (the direct OpenAI client) needs this budget, not the one of the default
 * role's model: a role whose model is flex-capable under a non-flex default
 * would otherwise be aborted by the SDK in the middle of flex (correctness
 * review F14).
 */
export const maxTextChainBudgetMs = (source: TextChainSource): number => {
  if (!textChainApplies(source)) return STANDARD_ATTEMPT_TIMEOUT_MS;
  const settings = source.textChain ?? defaultTextChainSettings();
  return (
    CHAIN_BUDGET_MARGIN_MS +
    (settings.flex ? 2 * FLEX_ATTEMPT_TIMEOUT_MS : 0) +
    STANDARD_ATTEMPT_TIMEOUT_MS +
    (settings.fallbackModel.trim() ? STANDARD_ATTEMPT_TIMEOUT_MS : 0)
  );
};

/**
 * The request body one attempt sends.
 *
 * Only the chain edits the body. A pass-through call is not rebuilt at all
 * (see `createTextChainFetch`).
 */
export const buildAttemptBody = (
  original: Record<string, unknown>,
  attempt: TextAttempt
): Record<string, unknown> => {
  const body: Record<string, unknown> = { ...original, model: attempt.model };
  delete body.service_tier;
  if (attempt.flex) body.service_tier = 'flex';
  const usage =
    original.usage && typeof original.usage === 'object'
      ? (original.usage as Record<string, unknown>)
      : {};
  body.usage = { ...usage, include: true };
  if (
    isLunaModel(attempt.model) &&
    original.reasoning === undefined &&
    original.reasoning_effort === undefined
  ) {
    body.reasoning = { effort: 'medium' };
  }
  return body;
};

/* ------------------------------------------------------------------------ */
/* Usage ledger                                                             */
/* ------------------------------------------------------------------------ */

/** What one served call reported. Absent means the provider did not say. */
export interface TextCallUsage {
  attempt: number;
  model?: string;
  serviceTier?: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
}

/** The additive `AiUsageRecord` columns, for one operation. */
export interface TextUsageColumns {
  model?: string;
  serviceTier?: string | null;
  attempt?: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  cachedTokens?: number | null;
  costUsd?: number | null;
}

const sum = (values: Array<number | undefined>): number | null => {
  const present = values.filter(
    (value): value is number => typeof value === 'number'
  );
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
};

/**
 * Every served call of one admitted operation.
 *
 * An operation is one ledger row but may be several calls: a review that
 * repairs its JSON, a graph with four nodes. Tokens and cost are summed across
 * them. Model, tier and attempt come from the call that went furthest down
 * the chain, the latest one on a tie. A row that says `z-ai/glm-5.3`, attempt
 * 4, therefore means «at least one call in this operation needed the
 * fallback». Averaging across calls could not show that.
 */
export class TextUsageLedger {
  readonly calls: TextCallUsage[] = [];

  record(call: TextCallUsage) {
    this.calls.push(call);
  }

  columns(): TextUsageColumns | undefined {
    if (!this.calls.length) return undefined;
    let deciding = this.calls[0];
    for (const call of this.calls) {
      if (call.attempt >= deciding.attempt) deciding = call;
    }
    return {
      ...(deciding.model ? { model: deciding.model } : {}),
      serviceTier: deciding.serviceTier ?? null,
      attempt: deciding.attempt,
      promptTokens: sum(this.calls.map((call) => call.promptTokens)),
      completionTokens: sum(this.calls.map((call) => call.completionTokens)),
      reasoningTokens: sum(this.calls.map((call) => call.reasoningTokens)),
      cachedTokens: sum(this.calls.map((call) => call.cachedTokens)),
      costUsd: sum(this.calls.map((call) => call.costUsd)),
    };
  }
}

const ledgerStore = new AsyncLocalStorage<TextUsageLedger>();

export const runWithUsageLedger = <T>(
  ledger: TextUsageLedger,
  callback: () => T
): T => ledgerStore.run(ledger, callback);

export const currentUsageLedger = () => ledgerStore.getStore();

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Reads an OpenAI-shaped `usage` object, with OpenRouter's `cost`. */
export const readUsage = (
  payload: Record<string, any> | undefined,
  attempt: TextAttempt
): TextCallUsage => {
  const usage = (payload?.usage ?? {}) as Record<string, any>;
  return {
    attempt: attempt.number,
    model:
      typeof payload?.model === 'string' && payload.model
        ? payload.model
        : attempt.model,
    ...(typeof payload?.service_tier === 'string'
      ? { serviceTier: payload.service_tier }
      : {}),
    promptTokens: num(usage.prompt_tokens),
    completionTokens: num(usage.completion_tokens),
    reasoningTokens: num(usage.completion_tokens_details?.reasoning_tokens),
    cachedTokens: num(usage.prompt_tokens_details?.cached_tokens),
    costUsd: num(usage.cost),
  };
};

/* ------------------------------------------------------------------------ */
/* Failure classification                                                   */
/* ------------------------------------------------------------------------ */

const RETRYABLE_MESSAGE =
  /capacity|overloaded|rate.?limit|temporarily|unavailable|timed? ?out|try again/i;

/**
 * Only a failure that a different moment or endpoint could fix moves to the
 * next attempt: rate limits, the provider's own errors, timeouts, missing
 * capacity. A 4xx validation error is our request's fault. GLM would refuse
 * the same request, and the chain would only pay for the refusal again.
 *
 * One 4xx is capacity on a flex attempt: OpenRouter answers «no endpoints
 * found» with 404 when routing is restricted to flex and no flex endpoint is
 * available.
 */
export const isRetryableFailure = (
  status: number | undefined,
  message: string,
  attempt: TextAttempt
): boolean => {
  if (status === undefined) return RETRYABLE_MESSAGE.test(message);
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return true;
  }
  if (attempt.flex && status === 404 && /no endpoints/i.test(message)) {
    return true;
  }
  return false;
};

/** OpenRouter's error envelope: `{error: {code, message}}`. */
const errorOf = (
  payload: unknown
): { status?: number; message: string } | undefined => {
  if (!payload || typeof payload !== 'object') return undefined;
  const error = (payload as Record<string, any>).error;
  if (!error) return undefined;
  const code = Number(error.code ?? error.status);
  return {
    ...(Number.isFinite(code) && code >= 100 ? { status: code } : {}),
    message: String(error.message ?? error.type ?? error.code ?? ''),
  };
};

class AttemptTimeout extends Error {
  constructor() {
    // «timed out» is what the OpenAI SDK recognises as a timeout, so the last
    // attempt surfaces as `APIConnectionTimeoutError`, as it did before.
    super('Request timed out.');
    this.name = 'TimeoutError';
  }
}

/* ------------------------------------------------------------------------ */
/* Transport                                                                */
/* ------------------------------------------------------------------------ */

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const urlOf = (input: string | URL | Request) =>
  typeof input === 'string'
    ? input
    : input instanceof URL
    ? input.href
    : input.url;

const copyHeaders = (headers: Headers) => {
  const copy = new Headers(headers);
  // The body handed back is already decoded and may differ in length.
  copy.delete('content-encoding');
  copy.delete('content-length');
  return copy;
};

/**
 * An `AbortSignal` that fires for the caller's signal or this attempt's own
 * deadline, whichever comes first. The two are kept apart in `timedOut`:
 * the caller's abort ends the chain, and the deadline moves it to the next
 * attempt.
 */
const attemptSignal = (outer: AbortSignal | null | undefined, ms: number) => {
  const controller = new AbortController();
  const state = { timedOut: false };
  const onOuter = () => controller.abort(outer?.reason);
  if (outer?.aborted) controller.abort(outer.reason);
  else outer?.addEventListener('abort', onOuter, { once: true });
  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort(new AttemptTimeout());
  }, ms);
  return {
    signal: controller.signal,
    state,
    /** Stop the deadline once the attempt has committed or failed. */
    settle: () => clearTimeout(timer),
    release: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
    },
  };
};

/** Rejects when `signal` aborts, so a stalled body read cannot outlive it. */
const abortable = <T>(promise: Promise<T>, signal: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });

/**
 * Reads server-sent events incrementally and remembers the last model, tier
 * and usage they carried. OpenRouter sends usage in the final chunk.
 */
class SseObserver {
  private pending = '';
  private readonly decoder = new TextDecoder();
  model?: string;
  serviceTier?: string;
  usage?: Record<string, unknown>;
  /** The first `data:` payload, parsed; `null` for a non-JSON one. */
  first?: Record<string, unknown> | null;

  push(bytes: Uint8Array) {
    this.pending += this.decoder.decode(bytes, { stream: true });
    let newline = this.pending.indexOf('\n');
    while (newline >= 0) {
      this.line(this.pending.slice(0, newline).replace(/\r$/, ''));
      this.pending = this.pending.slice(newline + 1);
      newline = this.pending.indexOf('\n');
    }
  }

  private line(line: string) {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let payload: Record<string, any> | null = null;
    try {
      payload = JSON.parse(data);
    } catch {
      payload = null;
    }
    if (this.first === undefined) this.first = payload;
    if (!payload) return;
    if (typeof payload.model === 'string') this.model = payload.model;
    if (typeof payload.service_tier === 'string') {
      this.serviceTier = payload.service_tier;
    }
    if (payload.usage && typeof payload.usage === 'object') {
      this.usage = payload.usage;
    }
  }

  result(): Record<string, unknown> {
    return {
      ...(this.model ? { model: this.model } : {}),
      ...(this.serviceTier ? { service_tier: this.serviceTier } : {}),
      ...(this.usage ? { usage: this.usage } : {}),
    };
  }
}

/** A failed attempt that the next one may repair. */
/** Why an attempt was skipped: an HTTP status, or the class of the transport error. */
type SkipReason = { status?: number; errorClass?: string; message: string };

class RetryableAttempt extends Error {
  constructor(readonly reason: SkipReason) {
    super('retryable attempt');
  }
}

/** Longest provider message a skip line carries. */
export const SKIP_MESSAGE_MAX_CHARS = 200;

/**
 * One line per skipped attempt (stand finding, 23.09.2026): which attempt,
 * model and tier, what failed and how long it took. The provider's message
 * is cut to 200 characters and flattened to one line. No prompt text and no
 * key ever reaches it: only the status, the error class and the provider's
 * own error message are read.
 */
export const textChainSkipLine = (
  attempt: TextAttempt,
  total: number,
  reason: SkipReason,
  elapsedMs: number
): string => {
  const what =
    reason.status !== undefined ? `HTTP ${reason.status}` : reason.errorClass || 'Error';
  const message = reason.message.replace(/\s+/g, ' ').trim().slice(0, SKIP_MESSAGE_MAX_CHARS);
  return (
    `AI text chain: attempt ${attempt.number}/${total} skipped` +
    ` (model ${attempt.model}, tier ${attempt.flex ? 'flex' : 'standard'},` +
    ` ${what}, ${Math.round(elapsedMs)} ms)${message ? `: ${message}` : ''}`
  );
};

const isChatCompletions = (url: string, init?: RequestInit) =>
  (init?.method ?? 'GET').toUpperCase() === 'POST' &&
  /\/chat\/completions(\?|$)/.test(url);

const parseBody = (init?: RequestInit): Record<string, unknown> | undefined => {
  if (typeof init?.body !== 'string') return undefined;
  try {
    const parsed = JSON.parse(init.body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The shared `fetch` for every text-capable client.
 *
 * - Anything other than `POST …/chat/completions` passes through untouched:
 *   images, embeddings, model lists.
 * - Outside the chain (see `textChainApplies`), a chat completion goes out
 *   exactly as the SDK built it, once. The only addition is reading the usage
 *   it reports.
 * - Inside the chain, the call walks `planTextAttempts`. The next attempt
 *   starts only after a retryable failure. A stream counts as delivered once
 *   its first event arrives. A failure after that reaches the caller as it
 *   always has: the text already shown cannot be silently restarted on
 *   another model.
 */
export const createTextChainFetch = (
  source: TextChainSource,
  baseFetch: FetchLike = (input, init) => globalThis.fetch(input, init)
): FetchLike => {
  return async (input, init) => {
    const url = urlOf(input);
    if (!isChatCompletions(url, init)) return baseFetch(input, init);
    const original = parseBody(init);
    if (!original || typeof original.model !== 'string') {
      return baseFetch(input, init);
    }
    const ledger = currentUsageLedger();
    const streaming = original.stream === true;
    const imageRequest =
      (source.passthroughModels ?? []).includes(original.model) ||
      (Array.isArray(original.modalities) &&
        original.modalities.includes('image')) ||
      Array.isArray(original.plugins);

    if (!textChainApplies(source) || imageRequest) {
      const attempt: TextAttempt = {
        number: 1,
        model: original.model,
        flex: false,
        timeoutMs: STANDARD_ATTEMPT_TIMEOUT_MS,
      };
      const response = await baseFetch(input, init);
      return imageRequest ? response : observe(response, attempt, ledger, streaming);
    }

    const attempts = planTextAttempts(original.model, source);
    for (const attempt of attempts) {
      const startedAt = Date.now();
      try {
        return await runAttempt(
          baseFetch,
          input,
          init,
          buildAttemptBody(original, attempt),
          attempt,
          attempt.number === attempts.length,
          streaming,
          ledger
        );
      } catch (error) {
        // Only a retryable failure of a non-final attempt is caught here.
        if (error instanceof RetryableAttempt) {
          console.warn(
            textChainSkipLine(attempt, attempts.length, error.reason, Date.now() - startedAt)
          );
          continue;
        }
        throw error;
      }
    }
    // Unreachable: the plan always has at least one attempt.
    throw new Error('The text chain had no attempts.');
  };
};

/** Pass-through: hand the response back and read its usage on the way. */
const observe = async (
  response: Response,
  attempt: TextAttempt,
  ledger: TextUsageLedger | undefined,
  streaming: boolean
): Promise<Response> => {
  if (!ledger || !response.ok || !response.body) return response;
  if (!streaming) {
    const text = await response.text();
    try {
      const payload = JSON.parse(text);
      if (!errorOf(payload)) ledger.record(readUsage(payload, attempt));
    } catch {
      /* not JSON: nothing to read */
    }
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: copyHeaders(response.headers),
    });
  }
  const reader = response.body.getReader();
  const observer = new SseObserver();
  const body = new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      const { done, value } = await reader.read();
      if (done) {
        ledger.record(readUsage(observer.result(), attempt));
        controller.close();
        return;
      }
      observer.push(value);
      controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: copyHeaders(response.headers),
  });
};

const runAttempt = async (
  baseFetch: FetchLike,
  input: string | URL | Request,
  init: RequestInit | undefined,
  body: Record<string, unknown>,
  attempt: TextAttempt,
  last: boolean,
  streaming: boolean,
  ledger: TextUsageLedger | undefined
): Promise<Response> => {
  const deadline = attemptSignal(init?.signal, attempt.timeoutMs);
  const outer = init?.signal;
  let handedOff = false;
  /**
   * A rejection from `fetch` or from reading the body. The caller's own
   * abort ends the chain. Anything else is the transport (a refused
   * connection, a reset, this attempt's deadline) and moves to the next
   * attempt. There is no status to read, so this cannot be a validation
   * answer.
   */
  const failure = (error: unknown): never => {
    if (outer?.aborted) throw error;
    const surfaced = deadline.state.timedOut ? new AttemptTimeout() : error;
    if (last) throw surfaced;
    throw new RetryableAttempt({
      errorClass: deadline.state.timedOut
        ? 'AttemptTimeout'
        : (error as { name?: string } | null)?.name || 'Error',
      message: deadline.state.timedOut
        ? `no answer within ${attempt.timeoutMs} ms`
        : error instanceof Error
        ? error.message
        : String(error),
    });
  };
  const retry = (status: number | undefined, message: string) =>
    !last && isRetryableFailure(status, message, attempt);

  try {
    let response: Response;
    try {
      response = await baseFetch(input, {
        ...init,
        body: JSON.stringify(body),
        signal: deadline.signal,
      });
    } catch (error) {
      return failure(error);
    }
    const headers = copyHeaders(response.headers);
    const rebuild = (content: BodyInit | null) =>
      new Response(content, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });

    if (!response.ok) {
      let text = '';
      try {
        text = await abortable(response.text(), deadline.signal);
      } catch (error) {
        return failure(error);
      }
      let message = text;
      try {
        message = errorOf(JSON.parse(text))?.message || text;
      } catch {
        /* keep the raw text */
      }
      if (retry(response.status, message))
        throw new RetryableAttempt({ status: response.status, message });
      return rebuild(text);
    }

    if (!streaming || !response.body) {
      let text: string;
      try {
        text = await abortable(response.text(), deadline.signal);
      } catch (error) {
        return failure(error);
      }
      let payload: Record<string, any> | undefined;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      // OpenRouter may answer 200 and put an error in the body when the
      // failure came after the headers were sent.
      const error = errorOf(payload);
      if (error) {
        if (retry(error.status, error.message))
          throw new RetryableAttempt({
            status: error.status ?? response.status,
            message: `error in a ${response.status} body: ${error.message}`,
          });
        return rebuild(text);
      }
      ledger?.record(readUsage(payload, attempt));
      return rebuild(text);
    }

    // Streaming: hold the bytes until the first event says what this is.
    const reader = response.body.getReader();
    const observer = new SseObserver();
    const held: Uint8Array[] = [];
    let ended = false;
    while (observer.first === undefined) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await abortable(reader.read(), deadline.signal);
      } catch (error) {
        void reader.cancel().catch(() => undefined);
        return failure(error);
      }
      if (chunk.done) {
        ended = true;
        break;
      }
      held.push(chunk.value);
      observer.push(chunk.value);
    }
    const early = ended
      ? // An empty stream is the gateway's failure, not an answer.
        { status: 502, message: 'stream ended before its first event' }
      : errorOf(observer.first);
    if (early && retry(early.status, early.message)) {
      void reader.cancel().catch(() => undefined);
      throw new RetryableAttempt({
        status: early.status,
        message: `stream error before the first token: ${early.message}`,
      });
    }
    // Delivered. From here the deadline no longer applies; the caller's own
    // signal still does, through the same controller.
    handedOff = true;
    deadline.settle();
    return rebuild(
      new ReadableStream<Uint8Array>({
        start: (controller) => {
          for (const bytes of held) controller.enqueue(bytes);
          if (ended) {
            ledger?.record(readUsage(observer.result(), attempt));
            controller.close();
          }
        },
        pull: async (controller) => {
          if (ended) return;
          const { done, value } = await reader.read();
          if (done) {
            ended = true;
            ledger?.record(readUsage(observer.result(), attempt));
            controller.close();
            return;
          }
          observer.push(value);
          controller.enqueue(value);
        },
        cancel: (reason) => reader.cancel(reason),
      })
    );
  } finally {
    if (!handedOff) deadline.release();
  }
};

/* ------------------------------------------------------------------------ */
/* Per-request options for direct SDK calls                                 */
/* ------------------------------------------------------------------------ */

const clientBudgets = new WeakMap<object, number>();

/** Called by `ai.clients.ts` for a client whose calls walk the chain. */
export const registerChainClient = (client: object, budgetMs: number) => {
  clientBudgets.set(client, budgetMs);
};

/**
 * Per-request options for a direct `chat.completions.create` call.
 *
 * Those call sites used to pass `{maxRetries: 0, timeout: 60000}`, and the
 * SDK's timeout covers the whole `fetch`, which here is the whole chain. So a
 * chained client gets the chain's budget. Any other client keeps the old 60
 * seconds, and SDK retries stay off in both cases.
 */
export const textRequestOptions = (
  client: object,
  standardTimeoutMs = STANDARD_ATTEMPT_TIMEOUT_MS
) => ({
  maxRetries: 0,
  timeout: clientBudgets.get(client) ?? standardTimeoutMs,
});
