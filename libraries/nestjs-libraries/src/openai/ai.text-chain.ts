import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * One transport for every text call, and the ledger that learns what it cost.
 *
 * `content-factory-next-97dq.55`. Owner's decision of 23.09.2026: text runs on
 * `openai/gpt-6-luna` with reasoning effort `medium`, and each call walks
 * flex → standard → `z-ai/glm-5.3` (one flex attempt of 60 s since `97dq.94`;
 * two of three minutes each before it). Batch is not used, because a person
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

/**
 * One flex attempt, as long as a standard one (`content-factory-next-97dq.94`,
 * owner's decision of 24.09.2026). Until then background text waited on flex
 * twice for three minutes each before the standard tier — up to six minutes a
 * person could spend looking at a spinner.
 *
 * This is the time to the answer's start: for a stream, the first event; for
 * a non-streaming call, the response headers. A non-streaming body then gets
 * `generationTimeoutMs` for its cap, so a healthy long generation is not cut
 * at 60 seconds (review F2 of the fifteenth walk).
 */
export const FLEX_ATTEMPT_TIMEOUT_MS = 60_000;
/** The same time to the answer's start for a standard attempt. */
export const STANDARD_ATTEMPT_TIMEOUT_MS = 60_000;
/**
 * The slowest output rate a healthy non-streaming generation is allowed
 * before its attempt counts as stalled. Conservative on purpose: reasoning
 * tokens count against it and flex is the slow tier.
 */
export const GENERATION_TOKENS_PER_SECOND = 100;
/**
 * The longest a non-streaming attempt may run, whatever its cap: the flex
 * attempt length before `97dq.94`, which served long drafts at half price.
 */
export const MAX_GENERATION_TIMEOUT_MS = 180_000;

/**
 * How long a non-streaming attempt may take, from sending to the last byte of
 * its body, for the output ceiling it sends (review F2 of the fifteenth
 * walk). The start of the answer still has to arrive within the attempt's own
 * deadline; this is the room for the rest. An uncapped call gets the maximum.
 */
export const generationTimeoutMs = (cap?: number): number =>
  typeof cap === 'number' && cap > 0
    ? Math.min(
        MAX_GENERATION_TIMEOUT_MS,
        STANDARD_ATTEMPT_TIMEOUT_MS +
          Math.ceil((cap * 1000) / GENERATION_TOKENS_PER_SECOND)
      )
    : MAX_GENERATION_TIMEOUT_MS;
/**
 * An interactive chat waits on flex for its first token at most this long
 * (review F8 of the fourteenth walk). For a stream the deadline ends at the
 * first event, so this is time to first token, not the length of the answer.
 */
export const INTERACTIVE_FLEX_TIMEOUT_MS = 25_000;
/** Time the SDK allows beyond the attempts themselves, for reading the body. */
const CHAIN_BUDGET_MARGIN_MS = 5_000;

export const DEFAULT_TEXT_FALLBACK_MODEL = 'z-ai/glm-5.3';
export const DEFAULT_TEXT_FLEX_ENABLED = true;
export const DEFAULT_TEXT_MAX_RETRIES = 0;
export const MAX_TEXT_FALLBACK_MODELS = 8;
export const MAX_TEXT_MODEL_RETRIES = 5;

/** What the operator or workspace set on the row; absent reads as the defaults. */
export interface TextChainSettings {
  flex: boolean;
  /**
   * Empty here means «no fallback model». The stored column cannot express
   * that by a plain empty string: an empty column reads as the default
   * (`resolveTextChainSettings`), while an explicit empty `fallbackModels: []`
   * or JSON envelope with `disabled: true` switches fallback off (`on0i.5`).
   */
  fallbackModel: string;
  /** Ordered list of configured fallback models (`on0i.5`, `A29`). */
  fallbackModels?: readonly string[];
  /** Explicit empty fallback chain (`[]`), distinct from inheriting the default. */
  fallbackDisabled?: boolean;
  /** Per-model retry count before advancing to the next fallback model (`0..5`). */
  maxRetries?: number;
}

export type FallbackUnavailableReason =
  | 'missing_key'
  | 'incompatible_provider'
  | 'duplicate_of_primary'
  | 'duplicate_in_chain';

export interface OrderedTextChainPolicy {
  flex: boolean;
  fallbackModel: string;
  fallbackModels: string[];
  configuredFallbackModels: string[];
  fallbackDisabled: boolean;
  inheritedDefault: boolean;
  maxRetries: number;
  effectiveChain: Array<{
    model: string;
    role: 'primary' | 'fallback';
    flex: boolean;
    maxRetries: number;
  }>;
  unavailableModels: Array<{
    model: string;
    reason: FallbackUnavailableReason;
  }>;
}

export const defaultTextChainSettings = (): TextChainSettings => ({
  flex: DEFAULT_TEXT_FLEX_ENABLED,
  fallbackModel: DEFAULT_TEXT_FALLBACK_MODEL,
});

const normalizeModelList = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const models: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 200) continue;
    models.push(trimmed);
    if (models.length >= MAX_TEXT_FALLBACK_MODELS) break;
  }
  return models;
};

const clampMaxRetries = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(MAX_TEXT_MODEL_RETRIES, Math.max(0, Math.floor(value)));
};

interface StoredFallbackEnvelopeV1 {
  version: 1;
  models: string[];
  disabled?: boolean;
  maxRetries?: number;
}

export const parseStoredTextFallback = (
  raw?: string | null
): {
  models: string[];
  disabled: boolean;
  inheritedDefault: boolean;
  maxRetries?: number;
  structured: boolean;
} => {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return {
      models: [DEFAULT_TEXT_FALLBACK_MODEL],
      disabled: false,
      inheritedDefault: true,
      structured: false,
    };
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<StoredFallbackEnvelopeV1>;
      if (parsed && typeof parsed === 'object' && parsed.version === 1) {
        const models = normalizeModelList(parsed.models);
        const disabled = parsed.disabled === true || models.length === 0;
        const maxRetries = clampMaxRetries(parsed.maxRetries);
        return {
          models: disabled ? [] : models,
          disabled,
          inheritedDefault: false,
          ...(maxRetries !== undefined ? { maxRetries } : {}),
          structured: true,
        };
      }
    } catch {
      /* Fall back to treating non-envelope strings as a single model id. */
    }
  }
  return {
    models: [trimmed],
    disabled: false,
    inheritedDefault: false,
    structured: false,
  };
};

/**
 * Serializes ordered fallback settings into the existing nullable
 * `textFallbackModel` column without requiring a database schema migration.
 * Single-model configurations with default retry settings stay plain strings
 * so legacy readers and tests see the exact model id.
 */
export const serializeTextFallbackColumn = (input: {
  textFallbackModel?: string | null;
  textFallbackModels?: readonly string[] | null;
  textFallbackDisabled?: boolean | null;
  textMaxRetries?: number | null;
  currentColumn?: string | null;
}): string | null | undefined => {
  const hasModelsArray = Array.isArray(input.textFallbackModels);
  const hasSingleString = input.textFallbackModel !== undefined;
  const hasDisabledFlag = typeof input.textFallbackDisabled === 'boolean';
  const hasMaxRetries = input.textMaxRetries !== undefined && input.textMaxRetries !== null;
  if (!hasModelsArray && !hasSingleString && !hasDisabledFlag && !hasMaxRetries) {
    return undefined;
  }

  const existing = parseStoredTextFallback(input.currentColumn);
  const maxRetries = hasMaxRetries
    ? clampMaxRetries(input.textMaxRetries)
    : existing.maxRetries;

  if (input.textFallbackDisabled === true || (hasModelsArray && normalizeModelList(input.textFallbackModels).length === 0)) {
    const envelope: StoredFallbackEnvelopeV1 = {
      version: 1,
      models: [],
      disabled: true,
      ...(maxRetries !== undefined && maxRetries > 0 ? { maxRetries } : {}),
    };
    return JSON.stringify(envelope);
  }

  if (hasModelsArray) {
    const models = normalizeModelList(input.textFallbackModels);
    if (models.length === 1 && (!maxRetries || maxRetries === 0)) {
      return models[0];
    }
    const envelope: StoredFallbackEnvelopeV1 = {
      version: 1,
      models,
      disabled: false,
      ...(maxRetries !== undefined && maxRetries > 0 ? { maxRetries } : {}),
    };
    return JSON.stringify(envelope);
  }

  if (hasSingleString) {
    const single = (input.textFallbackModel || '').trim();
    if (!single) {
      if (hasMaxRetries && maxRetries !== undefined && maxRetries > 0) {
        return JSON.stringify({
          version: 1,
          models: [DEFAULT_TEXT_FALLBACK_MODEL],
          disabled: false,
          maxRetries,
        } satisfies StoredFallbackEnvelopeV1);
      }
      return null;
    }
    const parsedSingle = parseStoredTextFallback(single);
    if (parsedSingle.structured) {
      return single;
    }
    if (maxRetries !== undefined && maxRetries > 0) {
      return JSON.stringify({
        version: 1,
        models: [single],
        disabled: false,
        maxRetries,
      } satisfies StoredFallbackEnvelopeV1);
    }
    return single;
  }

  // Only `textMaxRetries` changed: preserve existing models.
  if (existing.inheritedDefault && (!maxRetries || maxRetries === 0)) {
    return null;
  }
  if (!existing.disabled && existing.models.length === 1 && (!maxRetries || maxRetries === 0) && !existing.structured) {
    return existing.models[0];
  }
  return JSON.stringify({
    version: 1,
    models: existing.disabled ? [] : existing.models,
    disabled: existing.disabled,
    ...(maxRetries !== undefined && maxRetries > 0 ? { maxRetries } : {}),
  } satisfies StoredFallbackEnvelopeV1);
};

export const readWorkspaceTextChainColumn = (
  roleModelsJson: unknown
): string | null => {
  if (!roleModelsJson || typeof roleModelsJson !== 'object' || Array.isArray(roleModelsJson)) {
    return null;
  }
  const raw = (roleModelsJson as Record<string, unknown>).__textChain;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
};


/**
 * The instance row's two nullable columns resolved to settings. `null` means
 * «never set» and reads as the default. An empty model id also reads as the
 * default: the screen clears a field to return to it, not to switch the
 * fallback off.
 */
export const resolveTextChainSettings = (row?: {
  textFlexEnabled?: boolean | null;
  textFallbackModel?: string | null;
  textFallbackModels?: readonly string[] | null;
  textFallbackDisabled?: boolean | null;
  textMaxRetries?: number | null;
} | null): TextChainSettings => {
  const flex =
    typeof row?.textFlexEnabled === 'boolean'
      ? row.textFlexEnabled
      : DEFAULT_TEXT_FLEX_ENABLED;
  const hasExplicitArray = Array.isArray(row?.textFallbackModels);
  const hasExplicitDisabled = typeof row?.textFallbackDisabled === 'boolean';
  const explicitMaxRetries = clampMaxRetries(row?.textMaxRetries);
  const parsed = parseStoredTextFallback(row?.textFallbackModel);

  if (!hasExplicitArray && !hasExplicitDisabled && explicitMaxRetries === undefined && !parsed.structured) {
    return {
      flex,
      fallbackModel: parsed.models[0] || DEFAULT_TEXT_FALLBACK_MODEL,
    };
  }

  const fallbackModels = hasExplicitArray
    ? normalizeModelList(row?.textFallbackModels)
    : parsed.models;
  const fallbackDisabled =
    row?.textFallbackDisabled === true ||
    (hasExplicitArray ? fallbackModels.length === 0 : parsed.disabled);
  const effectiveModels = fallbackDisabled ? [] : fallbackModels;
  const maxRetries = explicitMaxRetries ?? parsed.maxRetries;

  return {
    flex,
    fallbackModel: effectiveModels[0] ?? '',
    fallbackModels: effectiveModels,
    fallbackDisabled,
    ...(maxRetries !== undefined ? { maxRetries } : {}),
  };
};

/**
 * Checks whether a model identifier is compatible with the selected provider.
 * Direct OpenAI API (`provider === 'openai'`) rejects vendor-namespaced
 * OpenRouter model ids containing `/` (such as `z-ai/glm-5.3` or
 * `anthropic/claude-sonnet-4`).
 */
export const isModelCompatibleWithProvider = (
  model: string,
  provider: 'openai' | 'openrouter'
): boolean => {
  const trimmed = model.trim();
  if (!trimmed) return false;
  if (provider === 'openai') {
    return !trimmed.includes('/');
  }
  return true;
};

/**
 * Resolves the full ordered fallback & retry policy (`on0i.5`, `A29`),
 * including provider/key eligibility filtering and unavailable reasons.
 */
export const resolveOrderedTextChainPolicy = (
  rowOrSettings?:
    | TextChainSettings
    | {
        textFlexEnabled?: boolean | null;
        textFallbackModel?: string | null;
        textFallbackModels?: readonly string[] | null;
        textFallbackDisabled?: boolean | null;
        textMaxRetries?: number | null;
      }
    | null,
  options?: {
    provider?: 'openai' | 'openrouter';
    usageMode?: 'included' | 'workspace_key';
    primaryModel?: string | null;
    hasKey?: boolean;
  }
): OrderedTextChainPolicy => {
  const provider = options?.provider ?? 'openrouter';
  const usageMode = options?.usageMode ?? 'included';
  const primaryModel = (options?.primaryModel || '').trim();
  const hasKey = options?.hasKey ?? true;

  let flex = DEFAULT_TEXT_FLEX_ENABLED;
  let configuredFallbackModels: string[] = [];
  let fallbackDisabled = false;
  let inheritedDefault = true;
  let maxRetries = DEFAULT_TEXT_MAX_RETRIES;

  if (rowOrSettings && ('flex' in rowOrSettings || 'fallbackModel' in rowOrSettings)) {
    const settings = rowOrSettings as TextChainSettings;
    flex = typeof settings.flex === 'boolean' ? settings.flex : DEFAULT_TEXT_FLEX_ENABLED;
    maxRetries = clampMaxRetries(settings.maxRetries) ?? DEFAULT_TEXT_MAX_RETRIES;
    if (settings.fallbackDisabled === true) {
      fallbackDisabled = true;
      inheritedDefault = false;
      configuredFallbackModels = [];
    } else if (Array.isArray(settings.fallbackModels)) {
      configuredFallbackModels = normalizeModelList(settings.fallbackModels);
      fallbackDisabled = configuredFallbackModels.length === 0;
      inheritedDefault = false;
    } else {
      const single = (settings.fallbackModel || '').trim();
      if (!single) {
        fallbackDisabled = true;
        inheritedDefault = false;
        configuredFallbackModels = [];
      } else {
        configuredFallbackModels = [single];
        fallbackDisabled = false;
        inheritedDefault = single === DEFAULT_TEXT_FALLBACK_MODEL;
      }
    }
  } else {
    const resolved = resolveTextChainSettings(
      (rowOrSettings as {
        textFlexEnabled?: boolean | null;
        textFallbackModel?: string | null;
        textFallbackModels?: readonly string[] | null;
        textFallbackDisabled?: boolean | null;
        textMaxRetries?: number | null;
      } | null) ?? null
    );
    const parsed = parseStoredTextFallback(
      (rowOrSettings as { textFallbackModel?: string | null } | null)?.textFallbackModel
    );
    const hasExplicitModels = Array.isArray(
      (rowOrSettings as { textFallbackModels?: readonly string[] | null } | null)?.textFallbackModels
    );
    const hasExplicitDisabled =
      typeof (rowOrSettings as { textFallbackDisabled?: boolean | null } | null)?.textFallbackDisabled ===
      'boolean';
    flex = resolved.flex;
    maxRetries = clampMaxRetries(resolved.maxRetries) ?? DEFAULT_TEXT_MAX_RETRIES;
    fallbackDisabled = resolved.fallbackDisabled === true;
    inheritedDefault =
      !hasExplicitModels && !hasExplicitDisabled && !parsed.structured && parsed.inheritedDefault;
    configuredFallbackModels = fallbackDisabled
      ? []
      : resolved.fallbackModels
      ? [...resolved.fallbackModels]
      : resolved.fallbackModel
      ? [resolved.fallbackModel]
      : [];
  }

  // Inherited operator default applies only on `included` + `openrouter`;
  // explicit fallback chains apply in both modes after provider/key validation.
  const candidateModels =
    inheritedDefault && (usageMode !== 'included' || provider !== 'openrouter')
      ? []
      : configuredFallbackModels;

  const eligibleFallbacks: string[] = [];
  const unavailableModels: Array<{ model: string; reason: FallbackUnavailableReason }> = [];
  const seen = new Set<string>();

  for (const candidate of candidateModels) {
    if (!hasKey) {
      unavailableModels.push({ model: candidate, reason: 'missing_key' });
      continue;
    }
    if (!isModelCompatibleWithProvider(candidate, provider)) {
      unavailableModels.push({ model: candidate, reason: 'incompatible_provider' });
      continue;
    }
    if (primaryModel && candidate === primaryModel) {
      unavailableModels.push({ model: candidate, reason: 'duplicate_of_primary' });
      continue;
    }
    if (seen.has(candidate)) {
      unavailableModels.push({ model: candidate, reason: 'duplicate_in_chain' });
      continue;
    }
    seen.add(candidate);
    eligibleFallbacks.push(candidate);
  }

  const effectiveChain: OrderedTextChainPolicy['effectiveChain'] = [];
  if (primaryModel && hasKey && isModelCompatibleWithProvider(primaryModel, provider)) {
    effectiveChain.push({
      model: primaryModel,
      role: 'primary',
      flex:
        flex &&
        usageMode === 'included' &&
        provider === 'openrouter' &&
        primaryModel.startsWith('openai/'),
      maxRetries,
    });
  }
  for (const fallback of eligibleFallbacks) {
    effectiveChain.push({
      model: fallback,
      role: 'fallback',
      flex: false,
      maxRetries,
    });
  }

  return {
    flex,
    fallbackModel: eligibleFallbacks[0] ?? '',
    fallbackModels: eligibleFallbacks,
    configuredFallbackModels,
    fallbackDisabled,
    inheritedDefault,
    maxRetries,
    effectiveChain,
    unavailableModels,
  };
};

export const textChainFingerprint = (settings?: TextChainSettings): string => {
  if (!settings) return '';
  const models = Array.isArray(settings.fallbackModels)
    ? settings.fallbackModels.join(',')
    : settings.fallbackModel ?? '';
  return `${settings.flex}|${models}|${settings.fallbackDisabled ? 'disabled' : 'enabled'}|${
    settings.maxRetries ?? ''
  }`;
};

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
  /**
   * `interactive` — a person is waiting on the screen (the copilot chat,
   * `97dq.63`): one flex attempt with a short time-to-first-token deadline,
   * then standard, then the fallback model. Background text has the same
   * shape with a 60-second flex attempt (`97dq.94`).
   */
  profile?: 'background' | 'interactive';
  /**
   * Known output ceilings per model id, in tokens (review F12 of the
   * fifteenth walk). A capped attempt never asks for more than its model's
   * ceiling. None are configured today, so the retry after a cut answer stays
   * within twice the caller's cap (`lengthRetryCap`).
   */
  outputLimits?: Readonly<Record<string, number>>;
  /**
   * When true, Mastra's native `ModelWithRetries[]` and `StreamErrorRetryProcessor`
   * own model retries and fallback transitions (`on0i.5`), while this transport
   * still owns per-attempt metering, deadlines, abort propagation, and (for a
   * flex-capable primary model on included OpenRouter) the single initial flex try.
   */
  singleModelAttempt?: boolean;
}

export interface TextAttempt {
  /** 1-based position in this call's chain; recorded as `AiUsageRecord.attempt`. */
  number: number;
  model: string;
  flex: boolean;
  timeoutMs: number;
}

/**
 * The default operator chain runs where the bill is ours and the provider is
 * OpenRouter. When a workspace or operator explicitly configures an ordered
 * fallback list (`fallbackModels`) or per-model `maxRetries`, the chain also
 * applies to compatible models for that provider (`on0i.5`, `A29`).
 */
export const textChainApplies = (source: TextChainSource): boolean => {
  if (source.singleModelAttempt) {
    return true;
  }
  if (source.usageMode === 'included' && source.provider === 'openrouter') {
    return true;
  }
  const settings = source.textChain;
  if (!settings) return false;
  const hasExplicitFallbacks =
    Array.isArray(settings.fallbackModels) &&
    settings.fallbackModels.some((model) =>
      isModelCompatibleWithProvider(model, source.provider)
    );
  const hasExplicitRetries =
    typeof settings.maxRetries === 'number' && settings.maxRetries > 0;
  return hasExplicitFallbacks || hasExplicitRetries;
};

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
  if (source.singleModelAttempt) {
    const singleSteps: Array<Omit<TextAttempt, 'number'>> = [];
    if (
      settings.flex &&
      source.usageMode === 'included' &&
      source.provider === 'openrouter' &&
      flexCapable(model)
    ) {
      singleSteps.push({
        model,
        flex: true,
        timeoutMs:
          source.profile === 'interactive'
            ? INTERACTIVE_FLEX_TIMEOUT_MS
            : FLEX_ATTEMPT_TIMEOUT_MS,
      });
    }
    singleSteps.push({
      model,
      flex: false,
      timeoutMs: STANDARD_ATTEMPT_TIMEOUT_MS,
    });
    return singleSteps.map((step, index) => ({ ...step, number: index + 1 }));
  }
  const policy = resolveOrderedTextChainPolicy(settings, {
    provider: source.provider,
    usageMode: source.usageMode,
    primaryModel: model,
    hasKey: true,
  });
  const steps: Array<Omit<TextAttempt, 'number'>> = [];
  if (
    settings.flex &&
    source.usageMode === 'included' &&
    source.provider === 'openrouter' &&
    flexCapable(model)
  ) {
    // One flex attempt (`97dq.94`): the interactive chat keeps its shorter
    // time to first token.
    steps.push({
      model,
      flex: true,
      timeoutMs:
        source.profile === 'interactive'
          ? INTERACTIVE_FLEX_TIMEOUT_MS
          : FLEX_ATTEMPT_TIMEOUT_MS,
    });
  }
  const standardTriesPerModel = 1 + policy.maxRetries;
  for (let retry = 0; retry < standardTriesPerModel; retry += 1) {
    steps.push({ model, flex: false, timeoutMs: STANDARD_ATTEMPT_TIMEOUT_MS });
  }
  for (const fallback of policy.fallbackModels) {
    for (let retry = 0; retry < standardTriesPerModel; retry += 1) {
      steps.push({
        model: fallback,
        flex: false,
        timeoutMs: STANDARD_ATTEMPT_TIMEOUT_MS,
      });
    }
  }
  return steps.map((step, index) => ({ ...step, number: index + 1 }));
};

/**
 * The longest one non-streaming attempt may take for a caller's cap: the
 * attempt's own deadline for the start of the answer, or the generation room
 * of the ceiling it sends, whichever is longer. `undefined` means the cap is
 * not known yet (a client serves calls of any cap), so the maximum applies.
 */
const attemptWindowMs = (attempt: TextAttempt, callerCap?: number) =>
  Math.max(
    attempt.timeoutMs,
    generationTimeoutMs(
      callerCap === undefined ? undefined : withReasoningHeadroom(callerCap)
    )
  );

/** The longest one pass down the chain may take for a caller's cap. */
export const chainPassMs = (
  model: string,
  source: TextChainSource,
  callerCap?: number
): number =>
  planTextAttempts(model, source).reduce(
    (total, attempt) => total + attemptWindowMs(attempt, callerCap),
    0
  );

/**
 * How long the SDK may wait on the whole call. The SDK arms its own timer
 * around `fetch` and clears it only when `fetch` resolves, so it covers every
 * attempt and — inside the chain — the one retry after a cut answer. That
 * retry is a second pass with its own budget (review F1 of the fifteenth
 * walk), not a remainder of the first: the SDK must never abort it in the
 * middle. The transport runs the retry only while that budget is left.
 */
export const textChainBudgetMs = (
  model: string,
  source: TextChainSource
): number =>
  textChainApplies(source)
    ? CHAIN_BUDGET_MARGIN_MS + 2 * chainPassMs(model, source)
    : CHAIN_BUDGET_MARGIN_MS + STANDARD_ATTEMPT_TIMEOUT_MS;

/**
 * The longest chain any model can walk under these settings: the flex
 * attempt, the standard one and the fallback, twice (the retry after a cut
 * answer). A client that serves every role (the direct OpenAI client) needs
 * this budget, not the one of the default role's model: a role whose model is
 * flex-capable under a non-flex default would otherwise be aborted by the SDK
 * in the middle of flex (correctness review F14).
 */
export const maxTextChainBudgetMs = (source: TextChainSource): number => {
  if (!textChainApplies(source)) return STANDARD_ATTEMPT_TIMEOUT_MS;
  const settings = source.textChain ?? defaultTextChainSettings();
  const policy = resolveOrderedTextChainPolicy(settings, {
    provider: source.provider,
    usageMode: source.usageMode,
    hasKey: true,
  });
  const standardTriesPerModel = 1 + policy.maxRetries;
  const flexAttempts =
    settings.flex && source.usageMode === 'included' && source.provider === 'openrouter'
      ? 1
      : 0;
  const attempts =
    flexAttempts + standardTriesPerModel * (1 + policy.fallbackModels.length);
  // Every attempt window is at least the generation maximum for an unknown cap.
  return CHAIN_BUDGET_MARGIN_MS + 2 * attempts * MAX_GENERATION_TIMEOUT_MS;
};

/**
 * The request body one attempt sends.
 *
 * Only the chain edits the body. A pass-through call is not rebuilt at all
 * (see `createTextChainFetch`).
 */
export const buildAttemptBody = (
  original: Record<string, unknown>,
  attempt: Pick<TextAttempt, 'model' | 'flex'>,
  /** The attempt model's known output ceiling, when there is one (F12). */
  outputLimit?: number
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
  // Reasoning tokens are spent out of the same output ceiling. A caller's cap
  // is the visible budget — sized for the answer alone — so every capped
  // attempt gets the headroom on top of it. Not only when the body asks for
  // reasoning (`content-factory-next-97dq.91`): a model reasons by its own
  // default too, the fallback included, and on 24.09.2026 a draft call spent
  // 1 887 of its 2 162 completion tokens on reasoning, so the JSON ran out
  // inside the author's link. The first cut was intake on 23.09.2026: a
  // 2 048 cap left 111 tokens for the answer.
  for (const key of ['max_tokens', 'max_completion_tokens'] as const) {
    const cap = original[key];
    if (typeof cap === 'number')
      body[key] = clampToOutputLimit(withReasoningHeadroom(cap), outputLimit);
  }
  return body;
};

/** Output tokens added to a caller's visible cap for reasoning. */
export const REASONING_HEADROOM_TOKENS = 8_192;

/** A visible budget plus the room reasoning may take out of the same ceiling. */
export const withReasoningHeadroom = (visibleTokens: number): number =>
  visibleTokens + REASONING_HEADROOM_TOKENS;

/** A ceiling never above the model's known output limit (review F12). */
export const clampToOutputLimit = (tokens: number, outputLimit?: number) =>
  typeof outputLimit === 'number' && outputLimit > 0
    ? Math.min(tokens, outputLimit)
    : tokens;

/**
 * The caller's cap for the one retry after an answer cut at the ceiling:
 * twice the visible budget. Every attempt adds the reasoning headroom on top
 * (`buildAttemptBody`), so the retry has room for the text and for reasoning
 * again. Not more than twice (review F12 of the fifteenth walk): the output
 * limits of the configured models are not known here, and a ceiling above a
 * model's limit is a 400. A known limit clamps it further.
 */
export const lengthRetryCap = (cap: number, outputLimit?: number): number =>
  clampToOutputLimit(cap * 2, outputLimit);

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
  /**
   * An attempt that did not serve the call (correctness review F15,
   * `97dq.66`): refused, failed in transport or out of time. It carries no
   * tokens and no cost, because the provider never reported any to us.
   */
  failed?: boolean;
  /**
   * The call the operation exists for, recorded after the calls that prepared
   * it (`kcxz.44` review F2): a picture's drawing after its picture prompt.
   * Its model, tier and attempt are the row's whatever attempt the
   * preparing text calls reached; tokens and cost are still summed.
   */
  final?: boolean;
  /**
   * The request left and no answer came back in time (a deadline or a
   * transport failure after sending). The provider may still have billed it,
   * so the operation's `costUsd` is a lower bound when any call has this.
   *
   * Stored since `content-factory-next-tcxv` in the nullable
   * `AiUsageRecord.possiblyBilled` (review F7 of the fourteenth walk named
   * the gap): `columns()` carries it whenever an attempt failed.
   */
  possiblyBilled?: boolean;
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
  /**
   * Present only when an attempt failed (`tcxv`): `true` — at least one may
   * have been billed, so `costUsd` is a lower bound; `false` — every failure
   * was a refusal. Absent — the column stays NULL.
   */
  possiblyBilled?: boolean;
}

const sum = (values: Array<number | undefined>): number | null => {
  const present = values.filter(
    (value): value is number => typeof value === 'number'
  );
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
};

/**
 * One request to a search engine that is not a text model — Tavily, Exa
 * (`content-factory-next-ia7s`, D15 of the W2 walk). The OpenRouter web
 * plugin is a text call and reaches the ledger through the transport instead,
 * so it is never recorded here as well.
 *
 * Only what the engine itself reported is kept: Exa's `costDollars.total` is
 * dollars and goes to `costUsd`; Tavily's `usage.credits` is not dollars and is
 * never converted into them. A price the provider did not state is not
 * invented here.
 */
export interface SearchCallUsage {
  /** The engine the request went to: `tavily`, `exa`. */
  engine: string;
  /** Dollars the engine reported for this request. */
  costUsd?: number;
  /** Credits the engine reported for this request (Tavily). */
  credits?: number;
  /** The request reached the engine and got no usable answer. */
  failed?: boolean;
  /** It left and no answer came back in time, so it may have been billed. */
  possiblyBilled?: boolean;
}

/** Request-scoped metering, independent of an operation's persistent ledger. */
export interface AiExecutionUsageObserver {
  /** Trusted task scope already admits search through the real operation allowance. */
  researchAdmission?: 'operation-allowance';
  /** Native task time replaces the chain's legacy soft fallback timers. */
  signal?: AbortSignal;
  maxDurationMs?: number;
  remainingMs?: () => number;
  beforeProviderCall?: () => void;
  text?: (call: TextCallUsage) => void;
  search?: (call: SearchCallUsage) => void;
}

const executionUsage = new AsyncLocalStorage<AiExecutionUsageObserver>();
const ledgerObservers = new WeakMap<TextUsageLedger, AiExecutionUsageObserver>();

/** Nested product operations keep their own billing rows and share this observer. */
export const runWithAiExecutionUsage = <T>(
  observer: AiExecutionUsageObserver,
  callback: () => T
): T => executionUsage.run(observer, callback);

/** Before an outbound attempt, including a fallback or a length retry. */
export const assertAiExecutionBudget = () =>
  executionUsage.getStore()?.beforeProviderCall?.();

/** Stable SDK ceiling for cached clients; the shared signal enforces remaining time. */
export const currentAiExecutionTimeoutMs = () => {
  const execution = executionUsage.getStore();
  return execution?.signal && execution.beforeProviderCall ? execution.maxDurationMs : undefined;
};

export const currentAiExecutionSignal = () => executionUsage.getStore()?.signal;

export const usesAiOperationResearchAdmission = () => {
  const observer = executionUsage.getStore();
  return observer?.researchAdmission === 'operation-allowance' && typeof observer.beforeProviderCall === 'function';
};

/**
 * The search part of an operation as one readable line, per engine in the
 * order first asked: `search tavily requests=2 credits=4; exa requests=1`.
 *
 * `AiUsageRecord` has no column for a request count or for credits, and the
 * schema is not changed for this, so the line goes to the free-text
 * `serviceTier` column — beside the model's tier when there is one — rather
 * than into a token or dollar column it would falsify.
 */
const searchSummary = (searches: readonly SearchCallUsage[]) => {
  const engines = new Map<
    string,
    { requests: number; failed: number; credits: number[] }
  >();
  for (const search of searches) {
    const entry = engines.get(search.engine) ?? {
      requests: 0,
      failed: 0,
      credits: [],
    };
    entry.requests += 1;
    if (search.failed) entry.failed += 1;
    if (typeof search.credits === 'number') entry.credits.push(search.credits);
    engines.set(search.engine, entry);
  }
  return `search ${[...engines]
    .map(([engine, { requests, failed, credits }]) =>
      [
        engine,
        `requests=${requests}`,
        ...(failed ? [`failed=${failed}`] : []),
        ...(credits.length
          ? [`credits=${credits.reduce((a, b) => a + b, 0)}`]
          : []),
      ].join(' ')
    )
    .join('; ')}`;
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

  readonly searches: SearchCallUsage[] = [];

  record(call: TextCallUsage) {
    this.calls.push(call);
    (ledgerObservers.get(this) ?? executionUsage.getStore())?.text?.(call);
  }

  recordSearch(call: SearchCallUsage) {
    this.searches.push(call);
    (ledgerObservers.get(this) ?? executionUsage.getStore())?.search?.(call);
  }

  /**
   * Failed attempts are kept too (review F15): an operation that never got an
   * answer still says how far down the chain it went. Model, tier and attempt
   * come from the served calls when there are any — the model column means
   * «the model that answered» — else from the furthest failed attempt.
   */
  columns(): TextUsageColumns | undefined {
    const text = this.textColumns();
    if (!this.searches.length) return text;
    const summary = searchSummary(this.searches);
    const searchCost = sum(this.searches.map((call) => call.costUsd));
    const searchFailures = this.searches.filter((call) => call.failed);
    const searchPossiblyBilled = searchFailures.some(
      (call) => call.possiblyBilled === true
    );
    if (!text) {
      // Search only: the admission named the generation model, which did not
      // answer anything here. The engine that did answer is the honest model.
      const served = this.searches.filter((call) => !call.failed);
      const answered = served[served.length - 1];
      return {
        ...(searchFailures.length
          ? { possiblyBilled: searchPossiblyBilled }
          : {}),
        ...(answered ? { model: answered.engine } : {}),
        serviceTier: summary,
        costUsd: searchCost,
      };
    }
    const possiblyBilled =
      text.possiblyBilled !== undefined || searchFailures.length
        ? { possiblyBilled: text.possiblyBilled === true || searchPossiblyBilled }
        : {};
    return {
      ...text,
      ...possiblyBilled,
      serviceTier: text.serviceTier ? `${text.serviceTier}; ${summary}` : summary,
      costUsd:
        text.costUsd === null || text.costUsd === undefined
          ? searchCost
          : searchCost === null
          ? text.costUsd
          : text.costUsd + searchCost,
    };
  }

  private textColumns(): TextUsageColumns | undefined {
    if (!this.calls.length) return undefined;
    const served = this.calls.filter((call) => !call.failed);
    const pool = served.length ? served : this.calls;
    let deciding = pool[0];
    for (const call of pool) {
      if (call.attempt >= deciding.attempt) deciding = call;
    }
    // The operation's own call names the row, served or failed (F2, kcxz.44).
    const final = [...this.calls].reverse().find((call) => call.final);
    if (final) deciding = final;
    const failed = this.calls.filter((call) => call.failed);
    return {
      ...(failed.length
        ? { possiblyBilled: failed.some((call) => call.possiblyBilled === true) }
        : {}),
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
): T => {
  const observer = executionUsage.getStore();
  if (observer) ledgerObservers.set(ledger, observer);
  return ledgerStore.run(ledger, callback);
};

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
  if (isFlexRefusal(status, message, attempt)) return true;
  return false;
};

/**
 * A flex attempt refused for the tier itself (review F18, `97dq.66`): a 4xx
 * whose message names `service_tier` or flex, as a model without flex support
 * would answer. The standard attempt can serve it; another flex attempt
 * cannot, so the chain skips the rest of flex.
 */
export const isFlexRefusal = (
  status: number | undefined,
  message: string,
  attempt: TextAttempt
): boolean =>
  attempt.flex &&
  // A refusal of the request, not a wait: 408/425/429 and «no endpoints» are
  // flex capacity, which a second flex attempt may still find.
  (status === 400 || status === 403 || status === 404 || status === 422) &&
  /service[_ ]?tier|\bflex\b/i.test(message) &&
  !/no endpoints/i.test(message) &&
  !RETRYABLE_MESSAGE.test(message);

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
  const fire = () => {
    state.timedOut = true;
    controller.abort(new AttemptTimeout());
  };
  let timer = setTimeout(fire, ms);
  return {
    signal: controller.signal,
    state,
    /** Stop the deadline once the attempt has committed or failed. */
    settle: () => clearTimeout(timer),
    /** Replace the deadline: `ms` from now (the body of a non-stream). */
    rearm: (ms: number) => {
      clearTimeout(timer);
      if (!controller.signal.aborted) timer = setTimeout(fire, Math.max(0, ms));
    },
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
type SkipReason = {
  status?: number;
  errorClass?: string;
  message: string;
  /** The request left and no answer came back (deadline or transport). */
  possiblyBilled?: boolean;
};

/** A failed attempt in the ledger: attempt, model and tier, no tokens, no cost. */
const failedCall = (attempt: TextAttempt, possiblyBilled: boolean): TextCallUsage => ({
  attempt: attempt.number,
  model: attempt.model,
  ...(attempt.flex ? { serviceTier: 'flex' } : {}),
  failed: true,
  ...(possiblyBilled ? { possiblyBilled: true } : {}),
});

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
 * - Anything other than `POST …/chat/completions` skips the text chain:
 *   images, embeddings, model lists. Native task cancellation and pre-call
 *   admission still apply; the endpoint's caller owns its usage accounting.
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
  baseFetch: FetchLike = (input, init) => globalThis.fetch(input, init),
  options: {
    /**
     * The SDK's own deadline around this `fetch`, when the client sets one.
     * The retry after a cut answer starts only while its pass fits in what is
     * left of it (review F1 of the fifteenth walk). Absent: the call's own
     * `textChainBudgetMs`.
     */
    budgetMs?: number;
  } = {}
): FetchLike =>
  withLengthRetry(source, sendText(source, baseFetch), options.budgetMs);

/* ------------------------------------------------------------------------ */
/* An answer cut at the ceiling                                             */
/* ------------------------------------------------------------------------ */

const CAP_KEYS = ['max_tokens', 'max_completion_tokens'] as const;

/** Whether a request asks for JSON: a response format or a tool call. */
const expectsJson = (body: Record<string, unknown>): boolean => {
  const format = body.response_format as { type?: unknown } | undefined;
  return (
    (format?.type === 'json_schema' || format?.type === 'json_object') ||
    (Array.isArray(body.tools) && body.tools.length > 0) ||
    (Array.isArray(body.functions) && body.functions.length > 0)
  );
};

/**
 * Whether a JSON answer parses. A Markdown fence around it (```json … ```) is
 * not a cut: LangChain's JSON parser strips it, and treating it as cut paid
 * for a whole second chain (review F11 of the fifteenth walk).
 */
export const parsesAsJson = (value: unknown): boolean => {
  if (typeof value !== 'string') return true;
  const fenced = /^\s*```[\w-]*[^\S\n]*\n?([\s\S]*?)\n?[^\S\n]*```\s*$/.exec(value);
  try {
    JSON.parse(fenced ? fenced[1] : value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Whether a served answer was cut short (`content-factory-next-97dq.91`):
 * the provider says `finish_reason: length`, or a JSON answer — content or
 * tool arguments — does not parse and the provider gave no other reason to
 * stop. Production, 24.09.2026: `Failed to parse … Unterminated string`,
 * the JSON cut inside a percent-encoded address.
 */
export const answerWasCut = (
  payload: Record<string, any> | undefined,
  body: Record<string, unknown>
): boolean => {
  const choice = Array.isArray(payload?.choices) ? payload!.choices[0] : undefined;
  if (!choice) return false;
  if (choice.finish_reason === 'length') return true;
  if (choice.finish_reason && choice.finish_reason !== 'stop' &&
      choice.finish_reason !== 'tool_calls' && choice.finish_reason !== 'function_call')
    return false;
  if (!expectsJson(body)) return false;
  const message = choice.message ?? {};
  const toolArgs = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((call: any) => call?.function?.arguments)
    : [];
  const format = body.response_format as { type?: unknown } | undefined;
  const contentIsJson =
    format?.type === 'json_schema' || format?.type === 'json_object';
  return (
    toolArgs.some((args: unknown) => !parsesAsJson(args)) ||
    (contentIsJson && !parsesAsJson(message.content)) ||
    (typeof message.function_call?.arguments === 'string' &&
      !parsesAsJson(message.function_call.arguments))
  );
};

/**
 * One retry with a larger ceiling for an answer cut at the ceiling.
 *
 * Every text role reaches the provider through this `fetch`, so the retry
 * lives here once rather than beside each parser: draft and adaptation,
 * core-write, extract and review all see the whole answer or the error they
 * always saw. Only a non-streaming chat completion with a cap is retried —
 * a stream is already on the screen, and an uncapped call has no ceiling to
 * raise. The retry is one, never a loop: a second cut reaches the caller as
 * the first one used to. Both calls are in the ledger, since both were paid.
 *
 * Only inside the chain (review F1 of the fifteenth walk). On `workspace_key`
 * and on the `openai` provider requests leave exactly as built, once per SDK
 * try: the key is the workspace's, its SDK keeps its own deadline and
 * retries, and a larger ceiling would change what the workspace pays for.
 *
 * The retry is a second pass with a budget of its own: it starts only when
 * that pass still fits in the SDK's deadline, so the SDK never aborts it in
 * the middle. A retry that fails — out of time, refused, a ceiling the model
 * rejects — hands back the first answer, and the caller sees the parse error
 * it always saw rather than a new one.
 */
const withLengthRetry = (
  source: TextChainSource,
  send: FetchLike,
  budgetMs?: number
): FetchLike => async (input, init) => {
  if (!textChainApplies(source)) return send(input, init);
  const startedAt = Date.now();
  const response = await send(input, init);
  const url = urlOf(input);
  if (!isChatCompletions(url, init) || !response.ok) return response;
  const original = parseBody(init);
  if (
    !original ||
    typeof original.model !== 'string' ||
    original.stream === true ||
    Array.isArray(original.plugins)
  )
    return response;
  const capKey = CAP_KEYS.find((key) => typeof original[key] === 'number');
  if (!capKey) return response;
  if ((source.passthroughModels ?? []).includes(original.model))
    return response;
  const text = await response.text();
  let payload: Record<string, any> | undefined;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }
  const again = () =>
    new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: copyHeaders(response.headers),
    });
  if (!payload || errorOf(payload) || !answerWasCut(payload, original))
    return again();
  const cap = original[capKey] as number;
  const larger = lengthRetryCap(cap, source.outputLimits?.[original.model]);
  const what =
    `model ${String(payload.model ?? original.model)},` +
    ` finish_reason ${String(payload.choices?.[0]?.finish_reason ?? 'none')}, cap ${cap}`;
  if (larger <= cap) {
    console.warn(`AI text: answer cut at the ceiling (${what}); the model allows no larger cap`);
    return again();
  }
  const budget = budgetMs ?? textChainBudgetMs(original.model, source);
  const left = budget - CHAIN_BUDGET_MARGIN_MS - (Date.now() - startedAt);
  const needed = chainPassMs(original.model, source, larger);
  if (left < needed) {
    console.warn(
      `AI text: answer cut at the ceiling (${what}); not retrying:` +
        ` ${Math.max(0, Math.round(left))} ms left of the budget, the retry needs ${needed} ms`
    );
    return again();
  }
  console.warn(`AI text: answer cut at the ceiling (${what}); retrying once with cap ${larger}`);
  let retried: Response;
  try {
    retried = await send(input, {
      ...init,
      body: JSON.stringify({ ...original, [capKey]: larger }),
    });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    console.warn(
      `AI text: the retry after a cut answer failed (${
        (error as { name?: string } | null)?.name || 'Error'
      }); returning the first answer`
    );
    return again();
  }
  if (!retried.ok) {
    console.warn(
      `AI text: the retry after a cut answer failed (HTTP ${retried.status}); returning the first answer`
    );
    void retried.body?.cancel().catch(() => undefined);
    return again();
  }
  return retried;
};

/**
 * Outside the chain, the request as built with only its output ceiling
 * raised by the reasoning headroom (`content-factory-next-97dq.95`).
 *
 * Model, tier and effort stay the workspace's. The ceiling does not: a
 * reasoning model spends it on thinking first, and on 25.09.2026 a post
 * draft on the owner's own key spent 2 085 of its 2 247 tokens there, so the
 * JSON ran out after 162 — the same cut 97dq.91 fixed only for the chain. A
 * higher ceiling costs nothing by itself; a cut answer is paid and thrown
 * away. Undefined when there is no cap to raise.
 */
const withHeadroomInit = (
  init: RequestInit | undefined,
  original: Record<string, unknown>,
  outputLimit?: number
): RequestInit | undefined => {
  let raised = false;
  const body: Record<string, unknown> = { ...original };
  for (const key of CAP_KEYS) {
    const cap = original[key];
    if (typeof cap !== 'number') continue;
    body[key] = clampToOutputLimit(withReasoningHeadroom(cap), outputLimit);
    raised = raised || body[key] !== cap;
  }
  return raised ? { ...init, body: JSON.stringify(body) } : undefined;
};

/** The chain itself, without the retry after a cut answer. */
const sendText = (
  source: TextChainSource,
  baseFetch: FetchLike
): FetchLike => {
  return async (input, init) => {
    const execution = executionUsage.getStore();
    if (execution?.beforeProviderCall) {
      assertAiExecutionBudget();
      if (execution.signal) {
        // Apply Stop and shared task expiry to every SDK endpoint. Images
        // retain their own domain accounting and never enter the text chain.
        init = { ...init, signal: AbortSignal.any([execution.signal, ...(init?.signal ? [init.signal] : [])]) };
      }
    }
    const url = urlOf(input);
    if (!isChatCompletions(url, init)) return baseFetch(input, init);
    const original = parseBody(init);
    if (!original || typeof original.model !== 'string') {
      return baseFetch(input, init);
    }
    const ledger = currentUsageLedger();
    const streaming = original.stream === true;
    // An image is decided by the model or the modalities only (review F17):
    // a text call that carries the web plugin is text, and it is metered.
    const imageRequest =
      (source.passthroughModels ?? []).includes(original.model) ||
      (Array.isArray(original.modalities) &&
        original.modalities.includes('image'));
    // A plugin call goes out once, as the SDK built it, and its usage is read.
    // It does not walk the chain: its caller (the web research fallback) holds
    // a 20-second budget and a fallback engine of its own, and flex attempts of
    // three minutes would outlive that budget and bill in the background.
    const pluginCall = Array.isArray(original.plugins);

    if (!textChainApplies(source) || imageRequest || pluginCall) {
      const attempt: TextAttempt = {
        number: 1,
        model: original.model,
        flex: false,
        timeoutMs: STANDARD_ATTEMPT_TIMEOUT_MS,
      };
      let response: Response;
      assertAiExecutionBudget();
      try {
        const roomy =
          imageRequest || pluginCall
            ? undefined
            : withHeadroomInit(init, original, source.outputLimits?.[original.model]);
        response = await baseFetch(input, roomy ?? init);
        if (roomy && response.status === 400) {
          // The model refused the raised ceiling: send what the SDK built.
          void response.body?.cancel().catch(() => undefined);
          ledger?.record(failedCall(attempt, false));
          assertAiExecutionBudget();
          response = await baseFetch(input, init);
        }
      } catch (error) {
        // The request left and no answer came back: an abort or a transport
        // failure may still be billed (review F4 of the fifteenth walk).
        if (!imageRequest && !(error as { executionBudgetStop?: boolean })?.executionBudgetStop) {
          ledger?.record(failedCall(attempt, true));
        }
        throw error;
      }
      return imageRequest ? response : observe(response, attempt, ledger, streaming);
    }

    const attempts = planTextAttempts(original.model, source);
    let flexRefused = false;
    for (const attempt of attempts) {
      // A tier refusal will not change on the second flex attempt (F18).
      if (flexRefused && attempt.flex) continue;
      assertAiExecutionBudget();
      const recordedAttempt =
        source.singleModelAttempt && ledger
          ? { ...attempt, number: ledger.calls.length + 1 }
          : attempt;
      const startedAt = Date.now();
      try {
        return await runAttempt(
          baseFetch,
          input,
          init,
          buildAttemptBody(
            original,
            recordedAttempt,
            source.outputLimits?.[recordedAttempt.model]
          ),
          recordedAttempt,
          attempt.number === attempts.length,
          streaming,
          ledger,
          source.singleModelAttempt === true
        );
      } catch (error) {
        // Only a retryable failure of a non-final attempt is caught here.
        if (error instanceof RetryableAttempt) {
          console.warn(
            textChainSkipLine(recordedAttempt, attempts.length, error.reason, Date.now() - startedAt)
          );
          ledger?.record(failedCall(recordedAttempt, !!error.reason.possiblyBilled));
          if (
            isFlexRefusal(error.reason.status, error.reason.message, recordedAttempt)
          ) {
            flexRefused = true;
          }
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
  if (!ledger) return response;
  if (!response.ok) {
    ledger.record(failedCall(attempt, false));
    return response;
  }
  if (!response.body) {
    ledger.record(failedCall(attempt, true));
    return response;
  }
  if (!streaming) {
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      ledger.record(failedCall(attempt, true));
      throw error;
    }
    try {
      const payload = JSON.parse(text);
      ledger.record(errorOf(payload) ? failedCall(attempt, false) : readUsage(payload, attempt));
    } catch {
      // The request was served but its usable result/usage is unknown.
      ledger.record(failedCall(attempt, true));
    }
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: copyHeaders(response.headers),
    });
  }
  const reader = response.body.getReader();
  const observer = new SseObserver();
  let settled = false;
  const cut = () => {
    if (settled) return;
    settled = true;
    ledger.record(failedCall(attempt, true));
  };
  const body = new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (!settled) {
            settled = true;
            ledger.record(readUsage(observer.result(), attempt));
          }
          controller.close();
          return;
        }
        observer.push(value);
        controller.enqueue(value);
      } catch (error) {
        cut();
        controller.error(error);
      }
    },
    cancel: (reason) => { cut(); return reader.cancel(reason); },
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
  ledger: TextUsageLedger | undefined,
  singleModelAttempt = false
): Promise<Response> => {
  const execution = executionUsage.getStore();
  const sharedDeadline = execution?.signal && execution.remainingMs && execution.beforeProviderCall;
  const waitMs = sharedDeadline ? Math.max(1, execution.remainingMs!()) : attempt.timeoutMs;
  const outer = sharedDeadline
    ? AbortSignal.any([execution.signal!, ...(init?.signal ? [init.signal] : [])])
    : init?.signal;
  const deadline = attemptSignal(outer, waitMs);
  const startedAt = Date.now();
  let handedOff = false;
  /** Which deadline is running: the start of the answer, or the body. */
  let phase: 'start' | 'body' = 'start';
  const cap = CAP_KEYS.map((key) => body[key]).find(
    (value): value is number => typeof value === 'number'
  );
  // The whole non-streaming attempt, from sending to its last byte (F2).
  const bodyWindowMs = sharedDeadline ? waitMs : Math.max(attempt.timeoutMs, generationTimeoutMs(cap));
  /**
   * A rejection from `fetch` or from reading the body. The caller's own
   * abort ends the chain. Anything else is the transport (a refused
   * connection, a reset, this attempt's deadline) and moves to the next
   * attempt. There is no status to read, so this cannot be a validation
   * answer.
   */
  const failure = (error: unknown): never => {
    if (outer?.aborted) {
      // The caller (the SDK's deadline or a person) ended an attempt that
      // was already sent: it may be billed (review F4 of the fifteenth walk).
      ledger?.record(failedCall(attempt, true));
      if (singleModelAttempt && error instanceof Error && error.name !== 'AbortError') {
        error.name = 'AbortError';
      }
      throw error;
    }
    const surfaced = deadline.state.timedOut ? new AttemptTimeout() : error;
    if (last) {
      ledger?.record(failedCall(attempt, true));
      throw surfaced;
    }
    throw new RetryableAttempt({
      possiblyBilled: true,
      errorClass: deadline.state.timedOut
        ? 'AttemptTimeout'
        : (error as { name?: string } | null)?.name || 'Error',
      message: deadline.state.timedOut
        ? phase === 'body'
          ? `the body did not finish within ${bodyWindowMs} ms`
          : `no answer within ${waitMs} ms`
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
    if (!streaming || !response.body) {
      // The answer has started. A non-streaming body gets the generation
      // room of its ceiling, counted from sending: a long, healthy draft is
      // not cut at the start-of-answer deadline (F2).
      phase = 'body';
      deadline.rearm(bodyWindowMs - (Date.now() - startedAt));
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
      ledger?.record(failedCall(attempt, false));
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
        ledger?.record(failedCall(attempt, false));
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
    // The last attempt's own error event: handed on as it always was, and
    // kept in the ledger as a failed attempt rather than a served call (F15).
    const failedEarly = !!early;
    if (failedEarly) ledger?.record(failedCall(attempt, false));
    let settled = failedEarly;
    const served = () => {
      if (settled) return;
      settled = true;
      ledger?.record(readUsage(observer.result(), attempt));
    };
    /**
     * A stream that stops before its end — the caller's abort, a cancel, a
     * dropped connection — was sent and partly generated: it may be billed,
     * and its usage never arrives (review F4 of the fifteenth walk).
     */
    const cut = () => {
      if (settled) return;
      settled = true;
      ledger?.record(failedCall(attempt, true));
    };
    // Delivered. From here the deadline no longer applies; the caller's own
    // signal still does, through the same controller.
    handedOff = true;
    deadline.settle();
    return rebuild(
      new ReadableStream<Uint8Array>({
        start: (controller) => {
          for (const bytes of held) controller.enqueue(bytes);
          if (ended) {
            served();
            controller.close();
          }
        },
        pull: async (controller) => {
          if (ended) return;
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await reader.read();
          } catch (error) {
            cut();
            throw error;
          }
          if (chunk.done) {
            ended = true;
            served();
            controller.close();
            return;
          }
          observer.push(chunk.value);
          controller.enqueue(chunk.value);
        },
        cancel: (reason) => {
          if (!ended) cut();
          return reader.cancel(reason);
        },
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

/** Called by `ai.clients.ts` for a client with an admitted SDK time budget. */
export const registerChainClient = (client: object, budgetMs: number) => {
  clientBudgets.set(client, budgetMs);
};

/**
 * Per-request options for a direct `chat.completions.create` call.
 *
 * Those call sites used to pass `{maxRetries: 0, timeout: 60000}`, and the
 * SDK's timeout covers the whole `fetch`, which here is the whole chain. So a
 * chained client gets the chain's budget. Native tasks use their remaining
 * execution time; other clients keep the old 60 seconds. SDK retries stay off.
 */
export const textRequestOptions = (
  client: object,
  standardTimeoutMs = STANDARD_ATTEMPT_TIMEOUT_MS
) => ({
  maxRetries: 0,
  timeout: executionUsage.getStore()?.remainingMs && currentAiExecutionTimeoutMs() !== undefined
    ? Math.max(1, executionUsage.getStore()!.remainingMs!())
    : clientBudgets.get(client) ?? standardTimeoutMs,
});
