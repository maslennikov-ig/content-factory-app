import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { AsyncLocalStorage } from 'node:async_hooks';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  AiRole,
  AiRoleModels,
  DEFAULT_AI_ROLE,
  parseRoleModels,
} from '@contentfactory/nestjs-libraries/openai/ai.roles';

/**
 * One place that decides which language-model provider an organization talks
 * to, and with which key.
 *
 * Upstream hardcoded OpenAI in nine places across four SDKs, each with its own
 * way of being redirected. Everything now reads this module instead, so
 * switching provider is a setting rather than a code change.
 *
 * OpenRouter is wire-compatible with the OpenAI API, so the same clients work
 * against it once the base URL and the model ids change; model ids there are
 * namespaced (`openai/gpt-5.6-luna` rather than `gpt-4.1`).
 *
 * The explicit usage mode chooses exactly one source. `workspace_key` decrypts
 * only this organization's key; `included` reads only the server-managed
 * `AI_INCLUDED_*` key. Neither mode falls back to the other source.
 */

export type AiProvider = 'openai' | 'openrouter';
export type AiUsageMode = 'included' | 'workspace_key';
export type SearchProvider = 'tavily' | 'openrouter';
export type SearchTopic = 'general' | 'news';
export type SearchDepth = 'basic' | 'advanced';

export interface WebSearchConfig {
  enabled: boolean;
  provider: SearchProvider;
  /** Empty when the selected mode has no search key. */
  apiKey: string;
  topic: SearchTopic;
  depth: SearchDepth;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface AiConfig {
  usageMode: AiUsageMode;
  provider: AiProvider;
  /** Empty when the selected mode has no generation key. */
  apiKey: string;
  baseUrl?: string;
  textModel: string;
  imageModel: string;
  /**
   * A model id per call role, empty when the workspace has named none.
   *
   * Never undefined: every reader falls back through `modelFor`, and an
   * optional map would make «not configured» and «not loaded» look the same
   * at the one place where the difference is a paid call to the wrong model.
   */
  roleModels: AiRoleModels;
  workspaceKeyConfigured: boolean;
  workspaceSearchKeyConfigured: boolean;
  includedAvailable: boolean;
  search: WebSearchConfig;
}

const readJson = (raw?: string): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    console.error('AI_ROLE_MODELS is not valid JSON; ignoring it.');
    return undefined;
  }
};

const DEFAULT_MODELS: Record<AiProvider, { text: string; image: string }> = {
  openai: { text: 'gpt-4.1', image: 'chatgpt-image-latest' },
  openrouter: { text: 'openai/gpt-5.6-luna', image: 'openai/gpt-5-image' },
};

/** Operator-level non-secret defaults for included mode. */
const envDefaults = () => {
  const provider = (process.env.AI_PROVIDER as AiProvider) || 'openai';

  return {
    provider,
    baseUrl:
      process.env.AI_BASE_URL ||
      (provider === 'openrouter' ? OPENROUTER_BASE_URL : undefined),
    textModel: process.env.AI_TEXT_MODEL || DEFAULT_MODELS[provider].text,
    imageModel: process.env.AI_IMAGE_MODEL || DEFAULT_MODELS[provider].image,
    /**
     * The operator's own routing, for the modes where the bill is ours.
     *
     * One JSON variable rather than a list of model names in this repository:
     * the bead is explicit that ids change and a tenant's provider may not be
     * ours, so nothing here may hold a table of them. Unparseable reads as
     * «none configured», which is the behaviour the product had before.
     */
    roleModels: parseRoleModels(readJson(process.env.AI_ROLE_MODELS)),
    search: {
      enabled: false,
      provider: 'tavily' as const,
      apiKey: '',
      topic: 'general' as const,
      depth: 'advanced' as const,
    },
  };
};

/**
 * The stored row this module maps, narrowed to the columns it reads. Keeping
 * the shape local means any client the application already owns can satisfy it.
 */
export interface StoredAiProviderSetting {
  usageMode?: string | null;
  provider?: string | null;
  apiKey?: string | null;
  textModel?: string | null;
  imageModel?: string | null;
  /** A JSON column, so its shape is whatever was written into it. */
  roleModels?: unknown;
  searchEnabled: boolean;
  searchProvider?: string | null;
  searchApiKey?: string | null;
  searchTopic?: string | null;
  searchDepth?: string | null;
}

export type AiProviderSettingReader = (
  organizationId: string
) => Promise<StoredAiProviderSetting | null>;

let lentReader: AiProviderSettingReader | undefined;

/**
 * This module used to hold a lazy `PrismaClient` of its own, which gave every
 * running application a second connection pool, opened on a path that runs
 * before every AI operation. The application has exactly one pool; the service
 * that already holds it lends it here instead. Until it does, resolution has no
 * reader and fails closed in the same way a database outage does.
 */
export const setAiProviderSettingReader = (reader: AiProviderSettingReader) => {
  lentReader = reader;
};

/**
 * Compatibility hook for existing callers. Resolution is deliberately
 * uncached so a mode switch is visible to every process on its next operation.
 */
export const resetAiConfigCache = (organizationId?: string) => {
  void organizationId;
};

export const loadAiConfig = async (
  organizationId: string,
  reader: AiProviderSettingReader | undefined = lentReader
): Promise<AiConfig> => {
  const defaults = envDefaults();
  let config: AiConfig = {
    ...defaults,
    usageMode: 'workspace_key',
    apiKey: '',
    workspaceKeyConfigured: false,
    workspaceSearchKeyConfigured: false,
    includedAvailable: !!process.env.AI_INCLUDED_API_KEY,
  };

  try {
    if (!reader) {
      throw new Error('No AI provider setting reader has been lent.');
    }
    const stored = await reader(organizationId);

    if (stored) {
      const usageMode = (stored.usageMode as AiUsageMode) || 'workspace_key';
      const workspaceKeyConfigured = !!stored.apiKey;
      const workspaceSearchKeyConfigured = !!stored.searchApiKey;
      if (usageMode === 'included') {
        config = {
          ...defaults,
          usageMode,
          apiKey: process.env.AI_INCLUDED_API_KEY || '',
          workspaceKeyConfigured,
          workspaceSearchKeyConfigured,
          includedAvailable: !!process.env.AI_INCLUDED_API_KEY,
          /**
           * The tenant's routing is deliberately not read here, for the same
           * reason their `textModel` is not: in `included` mode the key is the
           * operator's, and a model id chosen by whoever opened the settings
           * screen would spend it. Only the operator's own `AI_ROLE_MODELS`
           * applies, which is where the included bill can actually be cut.
           */
          roleModels: defaults.roleModels,
          search: {
            enabled: stored.searchEnabled,
            provider: (stored.searchProvider as SearchProvider) || 'tavily',
            apiKey: process.env.AI_INCLUDED_SEARCH_API_KEY || '',
            topic: (stored.searchTopic as SearchTopic) || 'general',
            depth: (stored.searchDepth as SearchDepth) || 'advanced',
          },
        };
      } else {
        const provider = (stored.provider as AiProvider) || defaults.provider;
        config = {
          provider,
          usageMode,
          apiKey: stored.apiKey
            ? AuthService.fixedDecryption(stored.apiKey)
            : '',
          baseUrl:
            provider === 'openrouter' ? OPENROUTER_BASE_URL : defaults.baseUrl,
          textModel: stored.textModel || DEFAULT_MODELS[provider].text,
          imageModel: stored.imageModel || DEFAULT_MODELS[provider].image,
          // On its own key the workspace routes only what it named itself.
          // `AI_ROLE_MODELS` is the operator's lever for the `included` bill,
          // and its names belong to the operator's provider: copied here they
          // would refuse at generation time, far from where anyone set them
          // (review of the 05.09 wave, P1).
          roleModels: parseRoleModels(stored.roleModels),
          workspaceKeyConfigured,
          workspaceSearchKeyConfigured,
          includedAvailable: !!process.env.AI_INCLUDED_API_KEY,
          search: {
            enabled: stored.searchEnabled,
            provider: (stored.searchProvider as SearchProvider) || 'tavily',
            apiKey: stored.searchApiKey
              ? AuthService.fixedDecryption(stored.searchApiKey)
              : '',
            topic: (stored.searchTopic as SearchTopic) || 'general',
            depth: (stored.searchDepth as SearchDepth) || 'advanced',
          },
        };
      }
    }
  } catch (err) {
    // Before the first push of the schema, or with the database briefly
    // unavailable. Falling through leaves an empty key, which reads as "not
    // configured" rather than as someone else's key.
    console.error('Could not read the AI provider setting:', err);
  }
  return config;
};

/** Whether this organization has configured generation at all. */
export const hasAiProvider = async (organizationId: string) =>
  !!(await loadAiConfig(organizationId)).apiKey;

/**
 * Thrown rather than returned, because every caller of an AI client would
 * otherwise have to remember to check, and forgetting means a request to the
 * provider with an empty key and an opaque 401 in the logs.
 */
export class AiProviderNotConfigured extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'AI_SELECTED_CREDENTIAL_UNAVAILABLE',
        message:
          'AI is unavailable for the selected mode. Ask the operator to configure included credentials, or have a workspace administrator configure workspace_key credentials.',
      },
      HttpStatus.SERVICE_UNAVAILABLE
    );
    this.name = 'AiProviderNotConfigured';
  }
}

export const requireAiConfig = async (
  organizationId: string
): Promise<AiConfig> => {
  const config = await loadAiConfig(organizationId);
  if (!config.apiKey) {
    throw new AiProviderNotConfigured();
  }
  return config;
};

interface ActiveAiConfig {
  organizationId: string;
  config: AiConfig;
  /**
   * The role the admitted operation runs under. A client built without naming
   * a role picks this up, so what the ledger recorded and what the provider
   * was actually asked for stay the same thing.
   */
  role: AiRole;
}

const activeAiConfig = new AsyncLocalStorage<ActiveAiConfig>();

export const getActiveAiOrganizationId = () =>
  activeAiConfig.getStore()?.organizationId;

export const getActiveAiRole = () => activeAiConfig.getStore()?.role;

export const getActiveAiConfig = (organizationId: string) => {
  const active = activeAiConfig.getStore();
  return active?.organizationId === organizationId ? active.config : undefined;
};

/**
 * An omitted role keeps the one already in flight rather than resetting to the
 * default. Re-entry is routine — a wrapped Mastra model, a stream pull — and a
 * reset there would quietly move a cheap operation back onto the expensive
 * model halfway through itself.
 */
export const withActiveAiConfig = <T>(
  organizationId: string,
  config: AiConfig,
  callback: () => T,
  role?: AiRole
): T =>
  activeAiConfig.run(
    { organizationId, config, role: role ?? getActiveAiRole() ?? DEFAULT_AI_ROLE },
    callback
  );

/** Client construction is legal only inside an admitted product operation. */
export const requireActiveAiConfig = async (
  organizationId: string
): Promise<AiConfig> => {
  const config = getActiveAiConfig(organizationId);
  if (!config) {
    const error = new Error(
      'AI clients can only be used inside an admitted AI operation.'
    );
    error.name = 'AiUsageContextRequired';
    throw error;
  }
  return config;
};
