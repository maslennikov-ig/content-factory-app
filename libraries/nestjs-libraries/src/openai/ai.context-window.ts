import {
  OPENROUTER_BASE_URL,
  requireActiveAiConfig,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';

type PublicModel = {
  id?: unknown;
  context_length?: unknown;
  top_provider?: { max_completion_tokens?: unknown } | null;
};

// The public catalog is shared across organizations and does not require a key.
const CATALOG_TTL_MS = 5 * 60_000;
const RETRY_DELAY_MS = 10_000;
const REQUEST_TIMEOUT_MS = 5_000;
let cached: { models: PublicModel[] | null; expiresAt: number } | undefined;
let pending: Promise<PublicModel[] | null> | undefined;

const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const publicModels = async (): Promise<PublicModel[] | null> => {
  if (cached && Date.now() < cached.expiresAt) return cached.models;
  if (pending) return pending;
  pending = (async () => {
    let models: PublicModel[] | null = null;
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        const body: unknown = await response.json();
        const data = body && typeof body === 'object' && 'data' in body ? body.data : undefined;
        if (Array.isArray(data)) models = data.filter((item): item is PublicModel =>
          !!item && typeof item === 'object' && !Array.isArray(item));
      }
    } catch {
      // Catalog outages must not prevent an otherwise admitted generation.
    }
    cached = { models, expiresAt: Date.now() + (models ? CATALOG_TTL_MS : RETRY_DELAY_MS) };
    return models;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
};

/**
 * Prompt-only budget, not proof that the provider's complete request fits:
 * tools and other provider framing also consume context. Reserve half the
 * advertised context for output and such overhead, and reserve at least the
 * advertised maximum completion when present. Unknown providers or metadata
 * abstain so the caller can retain its existing fallback limit.
 */
export const getModelPromptTokenLimit = async (
  organizationId: string,
  modelId: string
): Promise<number | undefined> => {
  const config = await requireActiveAiConfig(organizationId);
  if (config.provider !== 'openrouter' || !modelId) return undefined;
  const models = await publicModels();
  const model = models?.find((entry) => entry.id === modelId);
  if (!model || !positiveInteger(model.context_length)) return undefined;
  const context = model.context_length;
  const output = model.top_provider?.max_completion_tokens;
  const limit = Math.min(Math.floor(context / 2), positiveInteger(output) ? context - output : context);
  return limit > 0 ? limit : undefined;
};
