import { z } from 'zod';
import { SettingsController } from '@contentfactory/backend/api/routes/settings.controller';
import { AiProviderService } from '@contentfactory/nestjs-libraries/openai/ai.provider.service';
import {
  SEARCH_TASKS,
  isSearchProvider,
  providerForSearchTask,
  type SearchProvider,
} from '@contentfactory/nestjs-libraries/openai/ai.search-tasks';
import {
  SECRET_SEARCH_ENGINES,
  type AgentCardPayloads,
  type SecretSearchEngine,
} from '../agent-parts.contract';
import {
  defineCapability,
  door,
  type ApprovalDescribeContext,
  type CapabilityRunContext,
} from '../capability.types';
import { codedFailure } from './selection';

/**
 * AI settings from the chat (spec §5.2 «AI settings (admin)»,
 * `content-factory-next-kcxz.20`).
 *
 * Every capability calls the `AiProviderService` step its `/settings/ai` door
 * calls and names that door, so the door's `@CheckPolicies` decide the role:
 * all of them are the administrator's, and an editor or a user is not offered
 * any of them.
 *
 * No key ever passes through here. `getSettings` answers whether a key is
 * stored, never the key; the reads repeat only that. A key is typed into the
 * key card (`secret`), which the browser posts to `POST /settings/ai` itself —
 * the same request the settings screen sends — so the model, the message
 * history, the memory, the traces and the logs never hold it. The model hears
 * only that the card is shown, and afterwards reads the stored flag.
 *
 * On «Ключи системы» the workspace's own keys are dormant and the settings
 * screen shows no field for them (owner, 18.09.2026, `97dq.6`, `75xn.26`): the
 * chat says nothing about them there, takes no search key and removes none.
 */

type UsageMode = 'included' | 'workspace_key';

/** What `AiProviderService.getSettings` answers, as far as the chat reads it. */
type StoredSettings = {
  usageMode: UsageMode;
  provider: string;
  /** The provider the workspace's own key is filed under (review W3-20 F1). */
  workspaceProvider?: string | null;
  textModel?: string | null;
  imageModel?: string | null;
  roleModels?: Record<string, string> | null;
  hasKey?: boolean;
  includedAvailable?: boolean;
  includedMonthlyOperations?: number | null;
  includedUnlimited?: boolean;
  includedUsedOperations?: number;
  includedRemainingOperations?: number | null;
  includedRestrictionReason?: string | null;
  usageByMember?: Array<{
    userId: string | null;
    email: string | null;
    name?: string | null;
    operations: number;
  }>;
  usageByRole?: Array<{ role: string | null; operations: number }>;
  searchEnabled?: boolean;
  searchProvider?: string;
  searchTaskProviders?: Record<string, string>;
  searchKeys?: Partial<Record<string, boolean>>;
  workspaceSearchKeys?: Partial<Record<string, boolean>>;
};

type ServiceContext = Pick<CapabilityRunContext, 'organizationId' | 'service'>;

const readSettings = async (ctx: ServiceContext): Promise<StoredSettings> =>
  (await ctx.service(AiProviderService).getSettings(ctx.organizationId)) as StoredSettings;

const ENGINE_NAME: Record<SearchProvider, string> = {
  tavily: 'Tavily',
  exa: 'Exa',
  openrouter: 'OpenRouter',
};

const MODE_NAME: Record<UsageMode, { ru: string; en: string }> = {
  included: { ru: '«Ключи системы»', en: '“System keys”' },
  workspace_key: { ru: '«Свой ключ»', en: '“Own key”' },
};

/** The workspace's own stored keys, as flags; never anything about the value. */
const ownKeysOf = (settings: StoredSettings) => ({
  workspace: settings.hasKey === true,
  tavily: settings.workspaceSearchKeys?.tavily === true,
  exa: settings.workspaceSearchKeys?.exa === true,
});

/**
 * Which engine each search task reaches now: the server's own routing
 * (`providerForSearchTask`), fed with which engines can be paid for. The
 * values stand in for keys only as presence; no key is read here.
 */
const searchByTask = (settings: StoredSettings) => {
  const usable = Object.fromEntries(
    Object.entries(settings.searchKeys ?? {})
      .filter(([engine, present]) => present === true && isSearchProvider(engine))
      .map(([engine]) => [engine, 'present'])
  );
  const provider = isSearchProvider(settings.searchProvider)
    ? settings.searchProvider
    : 'tavily';
  return Object.fromEntries(
    SEARCH_TASKS.map((task) => [
      task,
      ENGINE_NAME[
        providerForSearchTask(task, {
          provider,
          taskProviders: (settings.searchTaskProviders ?? {}) as never,
          apiKeys: usable,
        })
      ],
    ])
  );
};

/** The monthly allowance of «Ключи системы», as the settings screen says it. */
const allowanceOf = (settings: StoredSettings) =>
  settings.includedUnlimited
    ? { unlimited: true }
    : {
        unlimited: false,
        limit: settings.includedMonthlyOperations ?? 0,
        used: settings.includedUsedOperations ?? 0,
        remaining: settings.includedRemainingOperations ?? 0,
        // `managed_unavailable` · `quota_unavailable` · `quota_exhausted` · null
        restriction: settings.includedRestrictionReason ?? null,
      };

/* ---- Reading ------------------------------------------------------------- */

type SettingsRead =
  | {
      mode: 'included';
      systemKeysAvailable: boolean;
      allowance: ReturnType<typeof allowanceOf>;
      search: 'system-keys';
    }
  | {
      mode: 'workspace_key';
      provider: string;
      keys: ReturnType<typeof ownKeysOf>;
      textAi: string | null;
      imageAi: string | null;
      aiByRole: Record<string, string>;
      search: { enabled: boolean; byTask: Record<string, string> };
      systemKeysAvailable: boolean;
    };

export const aiSettingsRead = (settings: StoredSettings): SettingsRead =>
  settings.usageMode === 'included'
    ? {
        mode: 'included',
        systemKeysAvailable: settings.includedAvailable === true,
        allowance: allowanceOf(settings),
        search: 'system-keys',
      }
    : {
        mode: 'workspace_key',
        provider: settings.provider,
        keys: ownKeysOf(settings),
        textAi: settings.textModel || null,
        imageAi: settings.imageModel || null,
        aiByRole: { ...(settings.roleModels ?? {}) },
        search: {
          enabled: settings.searchEnabled === true,
          byTask: searchByTask(settings),
        },
        systemKeysAvailable: settings.includedAvailable === true,
      };

export const aiSettings = defineCapability({
  id: 'ai.settings',
  group: 'ai-settings',
  label: { ru: 'Настройки ИИ', en: 'AI settings' },
  description:
    'Read the workspace’s AI settings, free: whose keys everything runs on (`included` — «Ключи системы», with the monthly allowance left; `workspace_key` — «Свой ключ»), and on its own key which keys are stored (flags only — a key itself is never readable), the AI for text and pictures, the AI per role, and which search engine each search task reaches. On «Ключи системы» the workspace’s own keys are asleep and not listed.',
  input: z.object({}),
  risk: 'read',
  door: door(SettingsController, 'getAiProvider'),
  // Model ids are free text an administrator typed on the settings screen.
  untrusted: ['workspace-text'],
  run: async (ctx) => aiSettingsRead(await readSettings(ctx)),
  summarize: (output) => ({ ...output }),
});

type UsageRead = {
  members: Array<{ member: string | null; operations: number }>;
  byRole: Array<{ role: string | null; operations: number }>;
  total: number;
};

/**
 * A member as the model and an MCP client may read one: the name, else
 * «Участник N» (review W3-20 F6). Never the email — it would go to the AI
 * provider and to every MCP client. N counts the unnamed members in the order
 * of their ids, so one person keeps one number while the set is the same,
 * whatever each of them spent.
 */
const memberName = (
  row: { userId: string | null; name?: string | null },
  rows: ReadonlyArray<{ userId: string | null; name?: string | null }>,
  language: 'ru' | 'en'
) => {
  if (row.name) return row.name;
  const unnamed = rows
    .filter((one) => one.userId && !one.name)
    .map((one) => one.userId as string)
    .sort();
  const number = unnamed.indexOf(row.userId as string) + 1;
  return language === 'ru' ? `Участник ${number}` : `Member ${number}`;
};

/** Members the model is told about at most; a workspace rarely has more. */
const MEMBERS_MAX = 50;

export const aiUsage = defineCapability({
  id: 'ai.usage',
  group: 'ai-settings',
  label: { ru: 'Расход ИИ по участникам', en: 'AI usage by member' },
  description:
    'Read what each member of the workspace spent this billing period, in AI operations (the settings screen’s «Расход»), every mode counted, plus the split by call role. A member is named by their name, or «Участник N» when they have none (never an email). A row with `member: null` is work nobody started by hand (autoposting, the API). Free.',
  input: z.object({}),
  risk: 'read',
  door: door(SettingsController, 'getAiProvider'),
  // Member names are typed by the members themselves.
  untrusted: ['workspace-text'],
  run: async (ctx): Promise<UsageRead> => {
    const settings = await readSettings(ctx);
    const rows = settings.usageByMember ?? [];
    return {
      members: rows.slice(0, MEMBERS_MAX).map((row) => ({
        member: row.userId ? memberName(row, rows, ctx.language) : null,
        operations: row.operations,
      })),
      byRole: (settings.usageByRole ?? []).map((row) => ({ ...row })),
      total: rows.reduce((sum, row) => sum + row.operations, 0),
    };
  },
  summarize: (output) => ({ ...output }),
});

/* ---- Asking first -------------------------------------------------------- */

const MODES = ['included', 'workspace_key'] as const;

type ModeResult = { mode: UsageMode; changed: boolean; keyNeeded?: boolean };

const modeLine = async (ctx: ApprovalDescribeContext, mode: UsageMode) => {
  const ru = ctx.language === 'ru';
  const settings = await readSettings(ctx);
  const name = MODE_NAME[mode][ru ? 'ru' : 'en'];
  if (settings.usageMode === mode) {
    return ru
      ? `Пространство уже на ${name} — ничего не изменится`
      : `The workspace is already on ${name} — nothing will change`;
  }
  if (mode === 'included') {
    if (settings.includedAvailable !== true) {
      return ru
        ? 'Ключи системы на этом сервере не настроены — ничего не изменится'
        : 'System keys are not set up on this server — nothing will change';
    }
    const allowance = allowanceOf(settings);
    const left =
      'limit' in allowance
        ? ru
          ? ` (в этом месяце осталось ${allowance.remaining} из ${allowance.limit})`
          : ` (${allowance.remaining} of ${allowance.limit} left this month)`
        : '';
    return ru
      ? `Перевести пространство на ${name}: ИИ и поиск будут работать на ключах системы в пределах месячного лимита${left}. Ваши сохранённые ключи останутся, но спят, пока вы не вернёте «Свой ключ»`
      : `Move the workspace to ${name}: AI and search will run on the system keys within the monthly allowance${left}. Your saved keys stay, asleep until you choose “Own key” again`;
  }
  // Nothing here says whether an own key is stored: on «Ключи системы» the
  // own keys are asleep and the chat names none, not even as a flag (spec
  // §5.5, review W3-20 F8). Without one, «Да» shows the key card instead.
  return ru
    ? `Перевести пространство на ${name}: ИИ будет работать на ключе пространства и за его счёт. Если своего ключа ещё нет, переключения не будет — покажем карточку для ключа, и сохранение ключа переключит само`
    : `Move the workspace to ${name}: AI will run on the workspace’s key, at its cost. If there is no own key yet, nothing switches — the key card is shown, and saving the key switches`;
};

export const aiMode = defineCapability({
  id: 'ai.mode',
  group: 'ai-settings',
  // An action, as every approval card's title is one (W3 walk P3-M): the
  // card asks it with «Да / Нет», and a choice question does not fit them.
  label: { ru: 'Сменить ключи ИИ', en: 'Switch the AI keys' },
  description:
    'Switch whose keys the workspace runs on: `included` («Ключи системы» — the operator’s keys within the monthly allowance; the workspace’s own keys stay saved but asleep) or `workspace_key` («Свой ключ» — the workspace’s own key, at its cost). The person approves it on a card. Without a saved own key the switch to `workspace_key` does not happen: the key card is shown instead (`keyNeeded`), and saving the key there switches the mode.',
  input: z.object({
    mode: z.enum(MODES).describe('`included` or `workspace_key`'),
  }),
  risk: 'confirm',
  door: door(SettingsController, 'updateAiProvider'),
  card: 'secret',
  untrusted: [],
  describeApproval: (ctx, input) => modeLine(ctx, input.mode),
  run: async (ctx, input): Promise<ModeResult> => {
    const settings = await readSettings(ctx);
    if (settings.usageMode === input.mode) {
      return { mode: input.mode, changed: false };
    }
    if (input.mode === 'included' && settings.includedAvailable !== true) {
      throw codedFailure(
        'AI_SYSTEM_KEYS_UNAVAILABLE',
        'System keys are not set up on this server; the workspace stays on its own key.'
      );
    }
    // «Свой ключ» without a key would leave the chat itself without an AI to
    // answer with (review W3-20 F7): the key card instead; saving the key
    // switches the mode.
    if (input.mode === 'workspace_key' && settings.hasKey !== true) {
      return { mode: settings.usageMode, changed: false, keyNeeded: true };
    }
    // The mode alone (review W3-20 F1): on «Ключи системы» `provider` is the
    // operator's, and sending it back re-filed the workspace's key under it.
    // The service keeps a stored key's provider either way.
    const saved = (await ctx.service(AiProviderService).updateSettings(ctx.organizationId, {
      usageMode: input.mode,
    })) as StoredSettings;
    return { mode: saved.usageMode, changed: true };
  },
  summarize: (output) =>
    output.keyNeeded
      ? {
          mode: output.mode,
          changed: false,
          shown: 'card',
          next: 'The workspace has no own AI key yet, so nothing switched. The key card is shown: the person types the key there, and saving it moves the workspace to «Свой ключ». Wait for them to say it is saved, then read ai.settings.',
        }
      : { mode: output.mode, changed: output.changed },
  cardOf: (output) => (output.keyNeeded ? secretCardOf('workspace') : null),
});

/* ---- The key card ---------------------------------------------------------- */

const KEY_FIELDS = ['workspace', ...SECRET_SEARCH_ENGINES] as const;
type KeyField = (typeof KEY_FIELDS)[number];

const searchKeysAsleep = () =>
  codedFailure(
    'AI_SEARCH_KEY_ON_SYSTEM_KEYS',
    'On “System keys” search runs on the system keys and the workspace’s own search keys are asleep; the settings take none here. Nothing was shown.'
  );

type SecretCard = AgentCardPayloads['secret'];

const secretCardOf = (field: KeyField): SecretCard =>
  field === 'workspace'
    ? { kind: 'secret', id: 'workspace-key', field: 'workspace-key' }
    : {
        kind: 'secret',
        id: `search-key:${field}`,
        field: 'search-key',
        engine: field as SecretSearchEngine,
      };

export const aiKeyEnter = defineCapability({
  id: 'ai.key.enter',
  group: 'ai-settings',
  label: { ru: 'Ввести ключ', en: 'Enter a key' },
  description:
    'Show the key card for the workspace’s own AI key (`workspace`) or a search key (`tavily`, `exa`). The person types the key into the card, and it goes straight to the settings — never to you, the chat or the memory. You only learn that the card is shown; when the person says it is saved, read ai.settings for the stored flag. Saving the AI key on «Ключи системы» moves the workspace to «Свой ключ» (the card says so). Search keys are taken only on «Свой ключ». Never ask for a key in the chat.',
  input: z.object({
    field: z.enum(KEY_FIELDS).describe('`workspace` (the AI key), `tavily` or `exa`'),
  }),
  risk: 'secret',
  card: 'secret',
  door: door(SettingsController, 'updateAiProvider'),
  untrusted: [],
  run: async (ctx, input) => {
    const settings = await readSettings(ctx);
    if (input.field !== 'workspace' && settings.usageMode === 'included') {
      throw searchKeysAsleep();
    }
    const keys = ownKeysOf(settings);
    return {
      field: input.field,
      mode: settings.usageMode,
      // Whether one is already saved: the card offers to replace it.
      stored: keys[input.field],
    };
  },
  summarize: (output) => ({
    field: output.field,
    shown: 'card',
    // On «Ключи системы» the own key is asleep and not named, not even as a
    // flag (spec §5.5, review W3-20 F8).
    ...(output.mode === 'included' ? {} : { stored: output.stored }),
    ...(output.field === 'workspace' && output.mode === 'included'
      ? { savingSwitchesTo: 'workspace_key' }
      : {}),
    next: 'The person types the key into the card; it never reaches you. Wait for them to say it is saved, then read ai.settings.',
  }),
  cardOf: (output) => secretCardOf(output.field),
});

/* ---- Removing a key -------------------------------------------------------- */

const ownKeysOnly = () =>
  codedFailure(
    'AI_KEYS_ON_SYSTEM_KEYS',
    'On “System keys” the workspace’s own keys are asleep and are not removed from here; nothing was removed.'
  );
const noKeyStored = () =>
  codedFailure('AI_KEY_NOT_STORED', 'No such key is saved; nothing was removed.');

const nothingLine = (ru: boolean) =>
  ru ? 'Такого ключа не сохранено — ничего не изменится' : 'No such key is saved — nothing will change';
const asleepLine = (ru: boolean) =>
  ru
    ? 'На «Ключах системы» свои ключи спят и отсюда не удаляются — ничего не изменится'
    : 'On “System keys” own keys are asleep and are not removed from here — nothing will change';

export const aiKeyClear = defineCapability({
  id: 'ai.key.clear',
  group: 'ai-settings',
  label: { ru: 'Удалить ключ ИИ', en: 'Remove the AI key' },
  description:
    'Remove the workspace’s own saved AI key (only on «Свой ключ»). It cannot be recovered, and AI stops until a new key is entered. The person approves it on a card.',
  input: z.object({}),
  risk: 'confirm',
  door: door(SettingsController, 'clearAiProviderKey'),
  untrusted: [],
  describeApproval: async (ctx) => {
    const ru = ctx.language === 'ru';
    const settings = await readSettings(ctx);
    if (settings.usageMode === 'included') return asleepLine(ru);
    if (settings.hasKey !== true) return nothingLine(ru);
    // The settings screen's own warning (`ai_key_remove_confirm`).
    return ru
      ? 'Удалить сохранённый ключ ИИ пространства: восстановить его нельзя, и пока не сохранят новый, ИИ в пространстве работать не будет'
      : 'Remove the workspace’s saved AI key: it cannot be recovered, and AI in the workspace stops until a new key is saved';
  },
  run: async (ctx) => {
    const settings = await readSettings(ctx);
    if (settings.usageMode === 'included') throw ownKeysOnly();
    if (settings.hasKey !== true) throw noKeyStored();
    const saved = (await ctx
      .service(AiProviderService)
      .clearKey(ctx.organizationId)) as StoredSettings;
    return { field: 'workspace' as const, removed: saved.hasKey !== true };
  },
  summarize: (output) => ({ ...output }),
});

export const aiSearchKeyClear = defineCapability({
  id: 'ai.search_key.clear',
  group: 'ai-settings',
  label: { ru: 'Удалить ключ поиска', en: 'Remove a search key' },
  description:
    'Remove the workspace’s own saved search key of one engine (`tavily` or `exa`; only on «Свой ключ»). That engine goes back to the system key, and stops if there is none. The person approves it on a card.',
  input: z.object({
    engine: z.enum(SECRET_SEARCH_ENGINES).describe('`tavily` or `exa`'),
  }),
  risk: 'confirm',
  door: door(SettingsController, 'clearSearchKey'),
  untrusted: [],
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const settings = await readSettings(ctx);
    if (settings.usageMode === 'included') return asleepLine(ru);
    if (settings.workspaceSearchKeys?.[input.engine] !== true) return nothingLine(ru);
    const name = ENGINE_NAME[input.engine];
    // The settings screen's own warning (`removeKeyConfirm`).
    return ru
      ? `Удалить сохранённый ключ ${name}: восстановить его нельзя. Поиск через ${name} вернётся на ключ системы, а если его нет — перестанет работать`
      : `Remove the saved ${name} key: it cannot be recovered. ${name} search falls back to the system key, and stops if there is none`;
  },
  run: async (ctx, input) => {
    const settings = await readSettings(ctx);
    if (settings.usageMode === 'included') throw ownKeysOnly();
    if (settings.workspaceSearchKeys?.[input.engine] !== true) throw noKeyStored();
    const saved = (await ctx
      .service(AiProviderService)
      .clearSearchKey(ctx.organizationId, input.engine)) as StoredSettings;
    return {
      field: input.engine,
      removed: saved.workspaceSearchKeys?.[input.engine] !== true,
    };
  },
  summarize: (output) => ({ ...output }),
});
