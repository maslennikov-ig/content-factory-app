import {
  StreamErrorRetryProcessor,
  type ProcessAPIErrorArgs,
  type ProcessInputStepArgs,
} from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import {
  DEFAULT_TEXT_MAX_RETRIES,
  MAX_TEXT_FALLBACK_MODELS,
  MAX_TEXT_MODEL_RETRIES,
  currentAiExecutionSignal,
  isOpenRouterInFlightBudgetError,
} from './ai.text-chain';

export const NATIVE_TEXT_MAX_PROCESSOR_RETRIES =
  MAX_TEXT_MODEL_RETRIES * (MAX_TEXT_FALLBACK_MODELS + 1);
export const NATIVE_TEXT_RETRY_POLICY_KEY = 'cf.nativeTextMaxRetries';
export const NATIVE_TEXT_MODELS_KEY = 'cf.nativeTextModels';
export const NATIVE_TEXT_RUN_ID_KEY = 'cf.nativeRunId';
export const NATIVE_TEXT_RETRY_BASE_MS = 500;
export const NATIVE_TEXT_RETRY_MAX_MS = 5_000;
export const NATIVE_TEXT_RETRY_AFTER_MAX_MS = 30_000;

export const nativeTextAbortSignal = (...signals: Array<AbortSignal | undefined>): AbortSignal | undefined => {
  const active = [...new Set([...signals, currentAiExecutionSignal()].filter((signal): signal is AbortSignal => Boolean(signal)))];
  return active.length > 1 ? AbortSignal.any(active) : active[0];
};

const maxRetriesByContext = new WeakMap<object, number>();
const clampRetries = (value: number) =>
  Number.isFinite(value)
    ? Math.min(Math.max(Math.trunc(value), 0), MAX_TEXT_MODEL_RETRIES)
    : DEFAULT_TEXT_MAX_RETRIES;

/** The primitive survives native RequestContext cloning and durable recovery. */
export const setNativeTextMaxRetries = (context: object | null | undefined, value: number, models?: readonly string[]) => {
  if (!context) return;
  const retries = clampRetries(value);
  maxRetriesByContext.set(context, retries);
  (context as { set?: (key: string, value: number) => unknown }).set?.(
    NATIVE_TEXT_RETRY_POLICY_KEY, retries
  );
  if (models) (context as { set?: (key: string, value: string[]) => unknown }).set?.(
    NATIVE_TEXT_MODELS_KEY, [...models]
  );
};

export const getNativeTextMaxRetries = (
  context: object | null | undefined,
  fallback = DEFAULT_TEXT_MAX_RETRIES
): number => {
  const stored = (context as { get?: (key: string) => unknown } | undefined)?.get?.(
    NATIVE_TEXT_RETRY_POLICY_KEY
  );
  return typeof stored === 'number'
    ? clampRetries(stored)
    : context ? maxRetriesByContext.get(context) ?? fallback : fallback;
};

const terminalStatus = new Set([400, 401, 402, 403, 404, 409, 422]);
const transientStatus = new Set([408, 429, 500, 502, 503, 504, 529]);
const terminalMessage = /\b(invalid[_ -]?api[_ -]?key|authentication[_ -]?error|permission[_ -]?denied|access[_ -]?denied|unauthorized|forbidden|bad[_ -]?request|consent[_ -]?(?:required|denied))\b/i;
const terminalBillingMessage = /\b(insufficient[_ -]?quota|quota[_ -]?exceeded|credit[_ -]?balance|billing[_ -]?(?:limit|hard[_ -]?limit))\b/i;
const transientMessage = /\b(429|500|502|503|504|529|rate[_ -]?limit|too many requests|overloaded|temporarily[_ -]?unavailable|service[_ -]?unavailable|bad gateway|gateway timeout|timeout|timed out|econnreset|etimedout|econnrefused|epipe|und_err_socket|fetch failed|socket hang up|stream error|stream ended|mid-?stream|premature close|connection reset|network error)\b/i;

/** Usage-only responses may try the configured chain once, never start a new task. */
export const isEmptyNativeTextError = (error: unknown): boolean => {
  const visited = new Set<object>();
  for (let value = error; value && typeof value === 'object' && !visited.has(value); value = (value as Record<string, unknown>).cause) {
    visited.add(value);
    const entry = value as Record<string, unknown>;
    if (entry.id === 'AGENT_STREAM_ERROR' && entry.message === 'Agent stream finished with finishReason "other" without producing any output') return true;
  }
  return false;
};

export const isTransientNativeTextError = (error: unknown): boolean => {
  const chain: Record<string, unknown>[] = [];
  const visited = new Set<object>();
  for (let value = error; value && typeof value === 'object' && !visited.has(value); value = (value as Record<string, unknown>).cause) {
    visited.add(value);
    chain.push(value as Record<string, unknown>);
  }
  if (currentAiExecutionSignal()?.aborted) return false;
  const inFlightBudget = chain.some(isOpenRouterInFlightBudgetError);
  if (chain.some(value => value.name === 'AbortError' || value.executionBudgetStop === true ||
    terminalStatus.has(Number(value.statusCode ?? value.status)) ||
    terminalMessage.test(String(value.message ?? '')) ||
    (!inFlightBudget && terminalBillingMessage.test(String(value.message ?? ''))))) return false;
  return chain.some(value => transientStatus.has(Number(value.statusCode ?? value.status)) ||
    value.isRetryable === true || value.name === 'AttemptTimeout' ||
    (value.isRetryable !== false && (
      // Mastra emits this only for an `other` finish with no step content.
      // Keep its native retry/fallback path open after a usage-only stream.
      (value.id === 'AGENT_STREAM_ERROR' &&
        value.message === 'Agent stream finished with finishReason "other" without producing any output') ||
      transientMessage.test(String(value.message ?? '')))));
};

/**
 * Mastra 1.78 has one processor retryCount across the native model array.
 * Record its offset at a model transition, rather than maintaining a second
 * attempt counter. Native StreamErrorRetryProcessor owns retries and delays.
 * The input/error halves share Mastra's per-processor state by the native id.
 */
export type NativeTextAttemptContext = {
  runId?: string;
  stepNumber: number;
  modelId: string;
  abortSignal?: AbortSignal;
  requestContext?: ProcessAPIErrorArgs['requestContext'];
};
export type NativeTextRetryHooks = {
  beforeAttempt?: (args: NativeTextAttemptContext) => Promise<void>;
  onExhausted?: (args: NativeTextAttemptContext & {
    error: unknown;
    retryCount: number;
    maxProcessorRetries: number;
  }) => Promise<{ retry: boolean } | void>;
};

export const resolveNativeTextRunId = (args: {
  runId?: string;
  requestContext?: ProcessAPIErrorArgs['requestContext'];
}): string | undefined => {
  if (args.runId) return args.runId;
  // Native Session generates this id and records its execution claim before
  // the first LLM step. Ambiguous claims must never attach to another run.
  const executions = args.requestContext?.getRaw('mastra__durableExecutions');
  if (executions && typeof executions === 'object') {
    const ids = Object.keys(executions);
    if (ids.length) return ids.length === 1 ? ids[0] : undefined;
  }
  const explicit = (args.requestContext as RequestContext<any> | undefined)?.get(NATIVE_TEXT_RUN_ID_KEY);
  return typeof explicit === 'string' && explicit ? explicit : undefined;
};

export const createNativeTextRetryConfig = (options?: NativeTextRetryHooks & {
  defaultMaxRetries?: number;
  delayMs?: number;
}) => {
  const base = new StreamErrorRetryProcessor({
    maxRetries: MAX_TEXT_MODEL_RETRIES,
    delayMs: options?.delayMs ?? (({ retryCount }) =>
      Math.min(NATIVE_TEXT_RETRY_BASE_MS * 2 ** retryCount, NATIVE_TEXT_RETRY_MAX_MS)),
    maxRetryAfterMs: NATIVE_TEXT_RETRY_AFTER_MAX_MS,
    matchers: [isTransientNativeTextError],
  });
  const signals = new WeakMap<object, AbortSignal>();
  const inputProcessor = {
    id: base.id,
    name: base.name,
    async processInputStep(args: ProcessInputStepArgs) {
      const signal = nativeTextAbortSignal(args.abortSignal);
      if (signal) signals.set(args.state, signal);
      if (signal?.aborted || args.state.terminalModelError) {
        args.abort(String(args.state.terminalModelError ?? 'Model execution stopped.'), {
          metadata: { terminalModelError: true },
        });
      }
      const model = args.model as { provider?: string; modelId?: string } | undefined;
      const key = `${args.stepNumber}:${model?.provider}:${model?.modelId}`;
      if (args.state.nativeRetryModel !== key) {
        args.state.nativeRetryModel = key;
        args.state.nativeRetryOffset = args.retryCount;
      }
      args.state.nativeModelId = model?.modelId ?? '';
      args.state.nativeRunId = resolveNativeTextRunId(args);
      await options?.beforeAttempt?.({
        runId: args.state.nativeRunId as string | undefined,
        modelId: model?.modelId ?? '',
        stepNumber: args.stepNumber,
        abortSignal: signal,
        requestContext: args.requestContext,
      });
      return {};
    },
  };
  const errorProcessor = {
    id: base.id,
    name: base.name,
    async processAPIError(args: ProcessAPIErrorArgs) {
      const signal = nativeTextAbortSignal(args.abortSignal, signals.get(args.state));
      if (signal?.aborted) return;
      if (!isTransientNativeTextError(args.error)) {
        // Native model fallback otherwise walks every key/model even on auth,
        // consent, invalid input, or exhausted quota. Stop before its next call.
        args.state.terminalModelError = args.error instanceof Error ? args.error.message : 'Non-retryable model error.';
        return;
      }
      const retries = getNativeTextMaxRetries(args.requestContext, options?.defaultMaxRetries);
      const offset = typeof args.state.nativeRetryOffset === 'number' ? args.state.nativeRetryOffset : 0;
      const relativeRetryCount = Math.max(0, args.retryCount - offset);
      if (relativeRetryCount >= retries) {
        const models = (args.requestContext as RequestContext<any> | undefined)?.get(NATIVE_TEXT_MODELS_KEY) as string[] | undefined;
        const lastModel = models?.at(-1);
        if (!isEmptyNativeTextError(args.error) && options?.onExhausted && models?.length &&
          (models.length === 1 || args.state.nativeModelId === lastModel) &&
          args.retryCount < NATIVE_TEXT_MAX_PROCESSOR_RETRIES) {
          return options.onExhausted({
            runId: args.state.nativeRunId as string | undefined,
            modelId: String(args.state.nativeModelId ?? ''),
            stepNumber: args.stepNumber,
            abortSignal: signal,
            requestContext: args.requestContext,
            error: args.error,
            retryCount: args.retryCount,
            maxProcessorRetries: NATIVE_TEXT_MAX_PROCESSOR_RETRIES,
          });
        }
        return;
      }
      return base.processAPIError({ ...args, retryCount: relativeRetryCount, abortSignal: signal });
    },
  };
  return {
    maxRetries: 0,
    maxProcessorRetries: NATIVE_TEXT_MAX_PROCESSOR_RETRIES,
    errorProcessorDefaults: false,
    inputProcessors: [inputProcessor],
    errorProcessors: [errorProcessor],
  };
};
