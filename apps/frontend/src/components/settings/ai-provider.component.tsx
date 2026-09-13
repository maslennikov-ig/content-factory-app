'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { Select } from '@contentfactory/react/form/select';
import { Input } from '@contentfactory/react/form/input';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { CloseIconSmall } from '@contentfactory/frontend/components/ui/icons';
import {
  aiProviderCopy,
  resolveAiProviderLocale,
} from '@contentfactory/frontend/components/settings/ai-provider.copy';

type Provider = 'openai' | 'openrouter';
type SearchProvider = 'tavily' | 'openrouter' | 'exa';
type UsageMode = 'included' | 'workspace_key';

/**
 * The call roles, in the order a person reads them: the cheap and frequent
 * work first, the two that decide how the writing reads last.
 *
 * Declared again here because this bundle cannot import a backend module.
 * `tests/ai-role-routing.guard.test.cjs` holds the two lists together through
 * the locale keys, so a role added on the server without a name here fails
 * rather than becoming a setting nobody can reach.
 */
const AI_ROLES = [
  'classify',
  'extract',
  'research',
  'draft',
  'judge',
  'review',
  'image',
] as const;

type AiRole = (typeof AI_ROLES)[number];

type RoleModels = Partial<Record<AiRole, string>>;

/**
 * The search engines, and what a search is for.
 *
 * Declared again here for the same reason `AI_ROLES` is: this bundle cannot
 * import a backend module. Both lists live once in
 * `libraries/nestjs-libraries/src/openai/ai.search-tasks.ts` (`SEARCH_TASKS`,
 * `SEARCH_PROVIDERS`), and `tests/ai.search-routing.guard.test.cjs` holds the
 * copies together, so a task or an engine added on the server without a name
 * here fails rather than becoming a setting nobody can reach.
 */
const SEARCH_PROVIDERS = ['tavily', 'openrouter', 'exa'] as const;

const SEARCH_TASKS = ['research', 'facts', 'discovery'] as const;

type SearchTask = (typeof SEARCH_TASKS)[number];

type SearchTaskProviders = Partial<Record<SearchTask, SearchProvider>>;

type SearchKeyDrafts = Partial<Record<SearchProvider, string>>;

/**
 * Mirrors `searchProviderNeedsKey`: OpenRouter answers a search question with
 * the workspace's generation provider, so it spends the key above and has no
 * field of its own here.
 */
type KeyedSearchProvider = Exclude<SearchProvider, 'openrouter'>;

const searchProviderNeedsKey = (
  provider: SearchProvider
): provider is KeyedSearchProvider => provider !== 'openrouter';

const KEYED_SEARCH_PROVIDERS = SEARCH_PROVIDERS.filter(searchProviderNeedsKey);

interface AiSettings {
  usageMode: UsageMode;
  provider: Provider;
  textModel: string;
  imageModel: string;
  roleModels: RoleModels;
  hasKey: boolean;
  searchEnabled: boolean;
  searchProvider: SearchProvider;
  searchTopic: 'general' | 'news';
  searchDepth: 'basic' | 'advanced';
  hasSearchKey: boolean;
  /**
   * Which engines have a key of their own, and nothing about what the keys
   * are. Optional because a response cached by a build older than
   * `content-factory-next-75xn` carries only `hasSearchKey`.
   */
  searchKeys?: Partial<Record<SearchProvider, boolean>>;
  /**
   * Which engines this workspace has a key of its own for, in either mode.
   *
   * In `workspace_key` it repeats `searchKeys`; in `included` it is the only
   * thing that can name a key that is stored but dormant, and a key nobody can
   * name is a key nobody can decide to remove.
   */
  workspaceSearchKeys?: Partial<Record<SearchProvider, boolean>>;
  searchTaskProviders?: SearchTaskProviders;
  searchFallbackAvailable: boolean;
  workspaceKeyConfigured: boolean;
  includedAvailable: boolean;
  includedMonthlyOperations: number;
  includedUsedOperations: number;
  includedRemainingOperations: number;
  includedRestrictionReason:
    | 'managed_unavailable'
    | 'quota_unavailable'
    | 'quota_exhausted'
    | null;
  usageByMember: Array<{
    userId: string | null;
    email: string | null;
    operations: number;
  }>;
  usageByRole: Array<{ role: string | null; operations: number }>;
}

interface ModelOption {
  id: string;
  name: string;
  contextLength: number | null;
}

interface ModelList {
  text: ModelOption[];
  image: ModelOption[];
  error: boolean;
}

interface AiSettingsPayloadInput {
  usageMode: UsageMode;
  provider: Provider;
  apiKey: string;
  textModel: string;
  imageModel: string;
  roleModels: RoleModels;
  searchEnabled: boolean;
  searchProvider?: SearchProvider;
  /** Only the engines a person actually typed into during this visit. */
  searchApiKeys?: SearchKeyDrafts;
  searchTaskProviders?: SearchTaskProviders;
  searchTopic: 'general' | 'news';
  searchDepth: 'basic' | 'advanced';
}

/**
 * A blank row means «this role uses the text model», so it is dropped rather
 * than sent as an empty string: the door refuses an empty model id, and a
 * person who cleared one row would otherwise be told the whole form is wrong.
 * The id is trimmed for the same reason — an invisible trailing space carried
 * in by a paste is not a mistake worth a refused save.
 */
const submittedRoleModels = (roleModels: RoleModels) =>
  Object.fromEntries(
    AI_ROLES.map((role) => [role, (roleModels[role] || '').trim()]).filter(
      ([, model]) => model
    )
  );

/**
 * The same rule for the key fields: an untouched field is not a cleared key.
 *
 * Only engines a person typed into are sent, so a save made from the depth
 * selector cannot reach the stored keys of engines this visit never touched —
 * and a stray space around a pasted key is refused by the door, so it is
 * trimmed away here rather than turned into a refused save.
 */
const submittedSearchKeys = (drafts: SearchKeyDrafts) =>
  Object.fromEntries(
    SEARCH_PROVIDERS.map((engine) => [
      engine,
      (drafts[engine] || '').trim(),
    ]).filter(([, key]) => key)
  );

/**
 * The routed tasks, with «as for the workspace» left out rather than sent as
 * an empty string: an absent task means exactly that, and the door refuses a
 * value that is not an engine name.
 */
const submittedTaskProviders = (taskProviders: SearchTaskProviders) =>
  Object.fromEntries(
    SEARCH_TASKS.map((task) => [task, taskProviders[task] || '']).filter(
      ([, engine]) => engine
    )
  );

export const buildAiSettingsPayload = ({
  usageMode,
  provider,
  apiKey,
  textModel,
  imageModel,
  roleModels,
  searchEnabled,
  searchApiKeys = {},
  searchTaskProviders = {},
  searchTopic,
  searchDepth,
  searchProvider = 'tavily',
}: AiSettingsPayloadInput) => {
  const typedSearchKeys = submittedSearchKeys(searchApiKeys);
  return {
    usageMode,
    provider,
    ...(usageMode === 'workspace_key' && apiKey ? { apiKey } : {}),
    ...(usageMode === 'workspace_key'
      ? { textModel, imageModel, roleModels: submittedRoleModels(roleModels) }
      : {}),
    /**
     * Whether search runs at all belongs to both modes — the included keys are
     * spent by the same searches — so this is the one search field that is
     * sent either way, and the server writes it either way.
     */
    searchEnabled,
    /**
     * Everything else about search is a workspace-key setting, and in
     * `included` mode the screen is showing the operator's values rather than
     * the workspace's own. Sending them back would save somebody else's engine
     * as this workspace's (`content-factory-next-75xn.4`); the server already
     * refuses them in this mode, and the screen no longer offers them.
     */
    ...(usageMode === 'workspace_key'
      ? {
          searchProvider,
          searchTopic,
          searchDepth,
          searchTaskProviders: submittedTaskProviders(searchTaskProviders),
          ...(Object.keys(typedSearchKeys).length
            ? { searchApiKeys: typedSearchKeys }
            : {}),
        }
      : {}),
  };
};

/**
 * Asking first is the whole point of this control, so the order lives in one
 * named place instead of being repeated per field: a declined confirmation
 * must reach neither the network nor the cache, and a rejected request must
 * not report success — that would tell the operator the key is gone while the
 * instance keeps billing it.
 */
export const removeStoredKey = async ({
  endpoint,
  confirm,
  request,
  onRemoved,
}: {
  endpoint: string;
  confirm: () => Promise<boolean>;
  request: (url: string, init: { method: string }) => Promise<{ ok: boolean }>;
  onRemoved: () => Promise<unknown>;
}): Promise<'declined' | 'removed' | 'failed'> => {
  if (!(await confirm())) return 'declined';
  try {
    const response = await request(endpoint, { method: 'DELETE' });
    if (!response.ok) return 'failed';
  } catch {
    return 'failed';
  }
  await onRemoved();
  return 'removed';
};

/**
 * Removing a stored key belongs to the field that holds it, not to the row of
 * page actions at the bottom: down there it read as a third sibling of Save,
 * and neither its target nor its consequence was visible from where the key
 * is. Inside the field it is unmistakable, and the confirmation carries the
 * consequence — the key is not recoverable and the capability stops.
 */
const ClearStoredKeyButton = ({
  label,
  busy,
  onClear,
}: {
  label: string;
  busy: boolean;
  onClear: () => void;
}) => (
  <Button
    variant="quiet"
    type="button"
    aria-label={label}
    title={label}
    disabled={busy}
    onClick={onClear}
    className="inline-flex shrink-0 items-center justify-center rounded-[4px] transition-colors duration-state focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus disabled:cursor-not-allowed disabled:opacity-60"
  >
    <CloseIconSmall />
  </Button>
);

/**
 * A free-text field with a datalist rather than a plain select: OpenRouter
 * publishes hundreds of models, and a new one must be usable the day it
 * appears without waiting for this list to refresh.
 */
const ModelField = ({
  label,
  hint,
  placeholder,
  value,
  options,
  listId,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  options: ModelOption[];
  listId: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) => (
  <>
    <Input
      label={label}
      name={listId}
      value={value}
      placeholder={placeholder}
      disableForm={true}
      list={listId}
      disabled={disabled}
      // `helper` renders the hint and wires aria-describedby, so a screen
      // reader announces it with the field instead of as loose text after it.
      helper={hint}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        onChange(e.target.value)
      }
    />
    <datalist id={listId}>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </datalist>
  </>
);

const AiProviderComponent = () => {
  const t = useT();
  const { language } = useVariables();
  const words = aiProviderCopy[resolveAiProviderLocale(language)];
  const fetch = useFetch();
  const toaster = useToaster();

  const loadSettings = useCallback(
    async () => (await fetch('/settings/ai')).json(),
    []
  );
  const { data, mutate } = useSWR<AiSettings>('ai-provider', loadSettings, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  const [provider, setProvider] = useState<Provider>('openai');
  const [usageMode, setUsageMode] = useState<UsageMode>(
    data?.usageMode || 'workspace_key'
  );
  const [apiKey, setApiKey] = useState('');
  const [textModel, setTextModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [roleModels, setRoleModels] = useState<RoleModels>({});
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchProvider, setSearchProvider] = useState<SearchProvider>('tavily');
  const [searchApiKeys, setSearchApiKeys] = useState<SearchKeyDrafts>({});
  const [searchTaskProviders, setSearchTaskProviders] =
    useState<SearchTaskProviders>(data?.searchTaskProviders || {});
  const [searchTopic, setSearchTopic] = useState<'general' | 'news'>('general');
  const [searchDepth, setSearchDepth] = useState<'basic' | 'advanced'>(
    data?.searchDepth || 'advanced'
  );
  // Which engine's key is being removed, so only that field's button waits.
  // `all` is the one control that removes every stored search key at once.
  const [clearingSearch, setClearingSearch] = useState<
    KeyedSearchProvider | 'all' | null
  >(null);

  useEffect(() => {
    if (!data) return;
    setUsageMode(data.usageMode);
    setProvider(data.provider);
    setTextModel(data.textModel);
    setImageModel(data.imageModel);
    setRoleModels(data.roleModels || {});
    setSearchEnabled(data.searchEnabled);
    setSearchProvider(data.searchProvider || 'tavily');
    setSearchTaskProviders(data.searchTaskProviders || {});
    setSearchTopic(data.searchTopic);
    setSearchDepth(data.searchDepth);
  }, [data]);

  /**
   * Model ids belong to their provider: `gpt-4.1` is not a valid OpenRouter id,
   * and `openai/gpt-5.6-luna` means nothing to OpenAI. The loaded values are the
   * ones in effect, so keeping them across a provider switch would save a model
   * the new provider rejects — and that failure would surface later, as an error
   * from the provider during generation, not here. Switching therefore empties
   * both fields and lets the backend apply that provider's default; switching
   * back restores what is actually stored.
   */
  const changeProvider = useCallback(
    (next: Provider) => {
      setProvider(next);
      const returning = next === data?.provider;
      setTextModel(returning ? data?.textModel || '' : '');
      setImageModel(returning ? data?.imageModel || '' : '');
      // Role ids belong to their provider for exactly the same reason, and a
      // routed role left behind after a switch would send that one call to an
      // id the new provider has never heard of.
      setRoleModels(returning ? data?.roleModels || {} : {});
    },
    [data]
  );

  /**
   * Whether an engine has a key of its own to spend.
   *
   * Read from the map, and from the old single flag when the response predates
   * it: that one could only ever mean «the workspace's engine has a key», so
   * that is the only thing it is allowed to answer here.
   */
  const hasStoredSearchKey = useCallback(
    (engine: SearchProvider) =>
      data?.searchKeys?.[engine] ??
      (engine === data?.searchProvider && !!data?.hasSearchKey),
    [data]
  );

  /**
   * The workspace's own key, which in `included` mode is not the same question:
   * there `searchKeys` describes the operator's set, and a workspace's own key
   * is stored, unspent and otherwise invisible.
   */
  const hasOwnSearchKey = useCallback(
    (engine: SearchProvider) =>
      data?.workspaceSearchKeys?.[engine] ??
      (engine === data?.searchProvider && !!data?.hasSearchKey),
    [data]
  );

  /**
   * Changing the engine no longer touches the keys.
   *
   * It used to clear the field, because one stored key was handed to whichever
   * engine the name pointed at and a Tavily key could have been spent at Exa.
   * Since `content-factory-next-75xn.1` a key is addressed by its engine — a
   * Tavily key lives under `tavily` and `exa` cannot read it — so clearing the
   * field would only lose typing nobody asked to lose.
   *
   * The lane is still switched off when the new engine has nothing to spend,
   * which is the one part of the old defence that was about search working
   * rather than about the key.
   */
  const changeSearchProvider = useCallback(
    (next: SearchProvider) => {
      setSearchProvider(next);
      if (
        searchProviderNeedsKey(next) &&
        !hasStoredSearchKey(next) &&
        !(searchApiKeys[next] || '').trim()
      ) {
        setSearchEnabled(false);
      }
    },
    [hasStoredSearchKey, searchApiKeys]
  );

  // Only OpenRouter publishes a catalogue; for OpenAI the fields stay free text.
  const loadModels = useCallback(
    async () => (await fetch('/settings/ai/models')).json(),
    []
  );
  const { data: models } = useSWR<ModelList>(
    provider === 'openrouter' ? 'ai-models' : null,
    loadModels,
    { revalidateOnFocus: false, revalidateIfStale: false }
  );

  const textOptions = useMemo(() => models?.text || [], [models]);
  const imageOptions = useMemo(() => models?.image || [], [models]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch('/settings/ai', {
        method: 'POST',
        body: JSON.stringify(
          buildAiSettingsPayload({
            usageMode,
            provider,
            apiKey,
            textModel,
            imageModel,
            roleModels,
            searchEnabled,
            searchProvider,
            searchApiKeys,
            searchTaskProviders,
            searchTopic,
            searchDepth,
          })
        ),
      });
      if (!response.ok) throw new Error();
      setApiKey('');
      setSearchApiKeys({});
      await mutate();
      toaster.show(
        t('ai_provider_saved', 'Provider settings saved'),
        'success'
      );
    } catch {
      toaster.show(
        t('ai_provider_save_failed', 'Could not save the provider settings'),
        'warning'
      );
    } finally {
      setSaving(false);
    }
  }, [
    usageMode,
    provider,
    apiKey,
    textModel,
    imageModel,
    roleModels,
    searchEnabled,
    searchProvider,
    searchApiKeys,
    searchTaskProviders,
    searchTopic,
    searchDepth,
  ]);

  const clearKey = useCallback(async () => {
    setClearing(true);
    const outcome = await removeStoredKey({
      endpoint: '/settings/ai/key',
      confirm: () =>
        deleteDialog(
          t(
            'ai_key_remove_confirm',
            'The stored key is removed and cannot be recovered. The editor assistant, post generator, image generation and autopost rewriting stop until a new key is saved.'
          ),
          t('ai_key_remove_approve', 'Yes, remove the key'),
          t('ai_key_remove_title', 'Remove the stored key?')
        ),
      request: fetch,
      onRemoved: mutate,
    });
    setClearing(false);
    if (outcome === 'removed') {
      toaster.show(t('ai_key_removed', 'Stored key removed'), 'success');
    } else if (outcome === 'failed') {
      toaster.show(
        t('ai_key_remove_failed', 'Could not remove the stored key'),
        'warning'
      );
    }
  }, []);

  /**
   * Remove one engine's stored key, or — with no engine — every one of them.
   *
   * The engine travels in the query string because that is what the door
   * reads, and the confirmation names the same engine: «the stored key» was an
   * honest sentence while a workspace had one, and is a guess now that it has
   * two. The all-engines form exists for the included mode, where the response
   * cannot say which engine the workspace's own key belongs to.
   */
  const clearSearchKey = useCallback(
    async (engine: KeyedSearchProvider | null) => {
      setClearingSearch(engine ?? 'all');
      const outcome = await removeStoredKey({
        endpoint: engine
          ? `/settings/ai/search-key?provider=${engine}`
          : '/settings/ai/search-key',
        confirm: () =>
          deleteDialog(
            engine
              ? words.search.engines[engine].removeKeyConfirm
              : words.search.includedRemoveKeysConfirm,
            t('search_key_remove_approve', 'Yes, remove the key'),
            t('search_key_remove_title', 'Remove the stored search key?')
          ),
        request: fetch,
        onRemoved: async () => {
          setSearchApiKeys((current) =>
            engine ? { ...current, [engine]: '' } : {}
          );
          await mutate();
        },
      });
      setClearingSearch(null);
      if (outcome === 'removed') {
        toaster.show(
          t('search_key_removed', 'Stored search key removed'),
          'success'
        );
      } else if (outcome === 'failed') {
        toaster.show(
          t('search_key_remove_failed', 'Could not remove the search key'),
          'warning'
        );
      }
    },
    [words]
  );

  return (
    <div className="flex flex-col gap-[16px] py-[16px] border-t border-cf-border">
      <div>
        <h4 className="cf-heading-md text-cf-ink">
          {t('ai_provider', 'AI provider')}
        </h4>
        <div className="cf-body-sm text-cf-ink-muted">
          {t('ai_provider_description_org')}
        </div>
      </div>

      <Select
        label={t('ai_usage_mode')}
        name="usageMode"
        value={usageMode}
        disableForm={true}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
          setUsageMode(
            event.target.value === 'included' ? 'included' : 'workspace_key'
          )
        }
      >
        <option value="included">{t('ai_usage_included')}</option>
        <option value="workspace_key">{t('ai_usage_workspace_key')}</option>
      </Select>

      <div className="cf-body-sm text-cf-ink-muted">
        {usageMode === 'included'
          ? data?.includedRestrictionReason === 'managed_unavailable'
            ? t('ai_usage_managed_unavailable')
            : data?.includedRestrictionReason === 'quota_exhausted'
            ? t('ai_usage_exhausted')
            : data?.includedRestrictionReason === null
            ? `${data.includedRemainingOperations} / ${
                data.includedMonthlyOperations
              } · ${t('billing_period', 'Billing period')}`
            : t('ai_usage_zero_quota')
          : t('ai_usage_workspace_mode')}
      </div>

      {/*
        Who spent it. The ledger carried an organization and no person until
        `saas.2.1`, so this list is the first answer the product has ever had
        to «who is using the AI budget». Operations nobody asked for — the
        schedule, the API key — are shown as their own row rather than
        dropped, so the rows still add up to the total above.
      */}
      {/*
        Рисуется всегда, а не только при непустом списке
        (`content-factory-next-m2eg.24`). Владелец 07.09.2026: «расходы по
        участнику… не понимаю, где смотреть, потому что там же их нет». Их и
        правда не было: до первого вызова модели список пуст, а вместе с ним
        исчезал и заголовок — человек искал раздел, которого в этот момент не
        существовало на странице. Ноль — это ответ, и он печатается.
      */}
      <div data-ai-usage="member" className="flex flex-col gap-[8px]">
        <div className="cf-label-sm text-cf-ink-muted">
          {t('ai_usage_by_member', 'AI usage by member, this period')}
        </div>
        {data?.usageByMember?.length ? (
          <div className="flex flex-col gap-[4px]">
            {data.usageByMember.map((member) => (
              <div
                key={member.userId ?? 'unattributed'}
                className="flex items-baseline justify-between gap-[16px] cf-body-sm text-cf-ink"
              >
                <span className="truncate">
                  {member.email ??
                    t('ai_usage_scheduled_work', 'Scheduled and API work')}
                </span>
                <span className="cf-caption text-cf-ink-muted">
                  {member.operations}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-[16px] cf-body-sm text-cf-ink">
              <span className="truncate">{words.usageNone}</span>
              <span className="cf-caption text-cf-ink-muted">0</span>
            </div>
            <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
              {words.usageNoneHint}
            </p>
          </>
        )}
      </div>

      {/*
        The same period, read along the other axis. Routing is configured per
        role below, so it can only be judged per role: without this list
        «classification now runs on a small model» is a claim nobody in the
        product can check. Rows written before the ledger carried a role keep
        their own line rather than being dropped, so the parts still add up.
      */}
      <div data-ai-usage="role" className="flex flex-col gap-[8px]">
        <div className="cf-label-sm text-cf-ink-muted">
          {t('ai_usage_by_role', 'AI usage by role, this period')}
        </div>
        {data?.usageByRole?.length ? (
          <div className="flex flex-col gap-[4px]">
            {data.usageByRole.map((row) => (
              <div
                key={row.role ?? 'unrecorded'}
                className="flex items-baseline justify-between gap-[16px] cf-body-sm text-cf-ink"
              >
                <span className="truncate">
                  {row.role
                    ? t(`ai_role_${row.role}`, row.role)
                    : t('ai_usage_role_unknown', 'Recorded before roles')}
                </span>
                <span className="cf-caption text-cf-ink-muted">
                  {row.operations}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/*
              Шесть нулей, а не одна строка «пусто»: роли известны заранее
              (`AI_ROLES`), и напечатанный ноль напротив каждой — это и есть
              ответ на вопрос «а где смотреть». Заодно список ролей виден
              раньше, чем человек доходит до полей ниже.
            */}
            <div className="flex flex-col gap-[4px]">
              {AI_ROLES.map((role) => (
                <div
                  key={role}
                  className="flex items-baseline justify-between gap-[16px] cf-body-sm text-cf-ink"
                >
                  <span className="truncate">{t(`ai_role_${role}`, role)}</span>
                  <span className="cf-caption text-cf-ink-muted">0</span>
                </div>
              ))}
            </div>
            <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
              {words.usageNoneHint}
            </p>
          </>
        )}
      </div>

      <Select
        label={t('provider', 'Provider')}
        name="provider"
        value={provider}
        disabled={usageMode === 'included'}
        disableForm={true}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
          changeProvider(e.target.value as Provider)
        }
      >
        <option value="openai">OpenAI</option>
        <option value="openrouter">OpenRouter</option>
      </Select>

      <div className="flex flex-col gap-[4px]">
        <Input
          label={t('api_key', 'API key')}
          name="apiKey"
          secret={true}
          value={apiKey}
          disabled={usageMode === 'included'}
          disableForm={true}
          action={
            usageMode === 'workspace_key' && data?.hasKey ? (
              <ClearStoredKeyButton
                label={t('remove_stored_key', 'Remove stored key')}
                busy={clearing}
                onClear={clearKey}
              />
            ) : undefined
          }
          placeholder={
            data?.hasKey
              ? t(
                  'ai_key_set_placeholder',
                  'A key is saved — type to replace it'
                )
              : t('ai_key_empty_placeholder', 'Paste your key')
          }
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setApiKey(e.target.value)
          }
        />
        <div className="cf-body-sm text-cf-ink-muted">
          {!data?.hasKey
            ? t(
                'ai_key_missing_org',
                'This workspace has no key, so generation is off. Keys are per workspace: yours is never shown to anyone else, and no other workspace can spend it.'
              )
            : t(
                'ai_key_from_settings',
                'A key is stored for this workspace. It is never shown again.'
              )}
        </div>
      </div>

      <ModelField
        label={t('text_model', 'Text model')}
        hint={
          provider === 'openrouter'
            ? t(
                'text_model_hint_openrouter',
                'Only models that support structured output and tools are listed — the generator depends on both.'
              )
            : t('text_model_hint', 'Leave empty to use the provider default.')
        }
        placeholder={t('provider_default_model', 'Provider default')}
        value={textModel}
        options={textOptions}
        listId="ai-text-models"
        disabled={usageMode === 'included'}
        onChange={setTextModel}
      />

      <ModelField
        label={t('image_model', 'Image model')}
        hint={
          provider === 'openrouter'
            ? t(
                'image_model_hint_openrouter',
                'Only models that can return an image are listed.'
              )
            : t('image_model_hint', 'Leave empty to use the provider default.')
        }
        placeholder={t('provider_default_model', 'Provider default')}
        value={imageModel}
        options={imageOptions}
        listId="ai-image-models"
        disabled={usageMode === 'included'}
        onChange={setImageModel}
      />

      {/*
        One model for everything was the whole cost problem
        (`content-factory-next-x63z`): classifying a research subject — one
        sentence in, five short fields out — was billed at the price of writing
        a draft. Six rows, each a plain model id, each empty by default and
        empty meaning «the text model above», so the screen adds a lever
        without adding a decision anybody has to make.
      */}
      <div className="mt-[8px] border-t border-cf-border pt-[16px]">
        <h4 className="cf-heading-md text-cf-ink">
          {t('ai_role_models', 'Usage and call roles')}
        </h4>
        {/*
          Три предложения вместо одного, и каждое отвечает на свой вопрос
          (`content-factory-next-m2eg.24`). Владелец 07.09.2026: «разделы
          «модель на роль вызова»… непонятно написаны, непонятно, а зачем они
          нужны». Заголовок называл настройку, подсказка объясняла пустое поле,
          и нигде не было сказано, что такое роль вызова и зачем её трогать.
        */}
        <div
          data-ai-roles-hint="true"
          className="mt-[4px] flex flex-col gap-[4px]"
        >
          <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {words.rolesWhat}
          </p>
          <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {words.rolesEmpty}
          </p>
          <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {words.rolesWhy}
          </p>
        </div>
      </div>

      {AI_ROLES.map((role) => (
        <Input
          key={role}
          label={t(`ai_role_${role}`, role)}
          name={`ai-role-model-${role}`}
          value={roleModels[role] || ''}
          placeholder={t('provider_default_model', 'Provider default')}
          disableForm={true}
          // Одна строка про саму роль, рядом с её полем: список из шести
          // названий вроде «Разбор текста» ничего не объясняет тому, кто видит
          // его впервые.
          helper={words.roles[role].what}
          list={role === 'image' ? 'ai-image-models' : 'ai-text-models'}
          disabled={usageMode === 'included'}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setRoleModels((current) => ({
              ...current,
              [role]: event.target.value,
            }))
          }
        />
      ))}

      {provider === 'openrouter' && models?.error && (
        <div className="cf-body-sm text-cf-danger">
          {t(
            'ai_models_unavailable',
            'Could not reach the OpenRouter catalogue. You can still type a model id.'
          )}
        </div>
      )}

      {/*
        Раздел объясняется словами, а не одной строкой под заголовком
        (`content-factory-next-75xn.6`). Рычагов стало два — ключ на каждый
        движок и сервер на каждую задачу, — и главного нигде не было сказано:
        по умолчанию всё уже работает на ключах системы, и заполнять здесь
        ничего не надо.
      */}
      <div className="mt-[8px] border-t border-cf-border pt-[16px]">
        <h4 className="cf-heading-md text-cf-ink">
          {t('web_search', 'Web research')}
        </h4>
        <div
          data-search-intro="true"
          className="mt-[4px] flex flex-col gap-[4px]"
        >
          {[
            words.search.what,
            words.search.systemKeys,
            words.search.ownKey,
            words.search.ownKeyKept,
          ].map((sentence) => (
            <p
              key={sentence}
              className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
            >
              {sentence}
            </p>
          ))}
        </div>
      </div>

      {/*
        Режим включённых ключей молчал про свой ключ области: поля выключены,
        кнопки «убрать» нет, и сохранённый ключ не виден ниоткуда. Он никуда не
        делся и восстановится при возврате к своим ключам — значит, про него
        надо сказать и дать его убрать, не выходя из режима. Без названия
        движка: `searchKeys` в этом режиме описывает ключи системы, а про свои
        ответ сервера знает только «есть или нет».
      */}
      {usageMode === 'included' && data?.hasSearchKey && (
        <div data-search-included-key="true" className="flex flex-col gap-[8px]">
          <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {words.search.includedOwnKey}
          </p>
          {/*
            Поимённо, движок за движком: убрать чужой ключ вместе со своим —
            не то, о чём просили, а «убрать всё» ниже остаётся для случая,
            когда сервер ещё не умеет называть движки (старый ответ в кэше).
          */}
          {KEYED_SEARCH_PROVIDERS.filter(hasOwnSearchKey).map((engine) => (
            <div
              key={engine}
              data-search-included-engine={engine}
              className="flex flex-wrap items-center justify-between gap-[8px]"
            >
              <span className="cf-body-sm text-cf-ink-muted">
                {words.search.engines[engine].keyDormant}
              </span>
              <ClearStoredKeyButton
                label={words.search.engines[engine].removeKey}
                busy={clearingSearch === engine}
                onClear={() => clearSearchKey(engine)}
              />
            </div>
          ))}
          {!KEYED_SEARCH_PROVIDERS.some(hasOwnSearchKey) && (
            <ClearStoredKeyButton
              label={words.search.includedRemoveKeys}
              busy={clearingSearch === 'all'}
              onClear={() => clearSearchKey(null)}
            />
          )}
        </div>
      )}

      <Select
        label={t('search_provider', 'Search backend')}
        name="searchProvider"
        value={searchProvider}
        disabled={usageMode === 'included'}
        disableForm={true}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
          changeSearchProvider(
            event.target.value === 'exa'
              ? 'exa'
              : event.target.value === 'openrouter'
              ? 'openrouter'
              : 'tavily'
          )
        }
      >
        <option value="exa">Exa</option>
        <option value="tavily">Tavily</option>
        <option value="openrouter">OpenRouter web</option>
      </Select>

      <Select
        label={t('web_search_status', 'Web research status')}
        name="searchEnabled"
        value={searchEnabled ? 'enabled' : 'disabled'}
        disableForm={true}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
          setSearchEnabled(event.target.value === 'enabled')
        }
      >
        <option value="disabled">{t('disabled', 'Disabled')}</option>
        <option value="enabled">{t('enabled', 'Enabled')}</option>
      </Select>

      {/*
        Поле на движок, а не одно на область: ключ адресуется движком, и Exa не
        может прочитать ключ Tavily. Подписи и строки состояния живут в
        `ai-provider.copy.ts`, потому что название движка в подписи — это не
        перевод, а часть смысла: ключи локалей писались, когда движок был один,
        и до сих пор называют Tavily в поле, которое теперь принадлежит Exa.
      */}
      {KEYED_SEARCH_PROVIDERS.map((engine) => (
        <Input
          key={engine}
          label={words.search.engines[engine].keyLabel}
          name={`searchApiKey-${engine}`}
          secret={true}
          value={searchApiKeys[engine] || ''}
          disabled={usageMode === 'included'}
          disableForm={true}
          action={
            usageMode === 'workspace_key' && hasStoredSearchKey(engine) ? (
              <ClearStoredKeyButton
                label={words.search.engines[engine].removeKey}
                busy={clearingSearch === engine}
                onClear={() => clearSearchKey(engine)}
              />
            ) : undefined
          }
          placeholder={
            usageMode === 'workspace_key' && hasStoredSearchKey(engine)
              ? words.search.keySavedPlaceholder
              : words.search.keyEmptyPlaceholder
          }
          /*
            В режиме включённых ключей строка состояния молчит про сохранённое:
            `searchKeys` здесь описывает ключи системы, и «ключ Tavily сохранён
            для этой области» было бы неправдой. Про свой ключ области в этом
            режиме говорит строка выше.
          */
          helper={
            usageMode === 'included'
              ? words.search.engines[engine].what
              : hasStoredSearchKey(engine)
              ? words.search.engines[engine].keyStored
              : words.search.engines[engine].keyMissing
          }
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setSearchApiKeys((current) => ({
              ...current,
              [engine]: event.target.value,
            }))
          }
        />
      ))}

      <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {words.search.openrouterNoKey}
      </p>

      {/*
        Сервер на задачу, той же вёрсткой, что и модель на роль вызова: задачи
        не взаимозаменяемы, и один сервер на всю область означал выбор, чем
        именно пожертвовать. Пустая строка — «как в области», то есть поведение
        до появления задач.
      */}
      <div
        data-search-tasks-hint="true"
        className="mt-[8px] flex flex-col gap-[4px]"
      >
        <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {words.search.tasksWhat}
        </p>
        <p className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {words.search.tasksWhy}
        </p>
      </div>

      {SEARCH_TASKS.map((task) => (
        <div key={task} className="flex flex-col gap-[4px]">
          <Select
            label={words.search.tasks[task].label}
            name={`search-task-${task}`}
            value={searchTaskProviders[task] || ''}
            disabled={usageMode === 'included'}
            disableForm={true}
            // Подсказка стоит отдельной строкой, потому что `Select` своей не
            // умеет; связь с полем держится руками, чтобы скринридер прочитал
            // её вместе с подписью, а не как текст после.
            aria-describedby={`search-task-${task}-hint`}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              setSearchTaskProviders((current) => ({
                ...current,
                [task]: SEARCH_PROVIDERS.find(
                  (engine) => engine === event.target.value
                ),
              }))
            }
          >
            <option value="">{words.search.taskDefaultOption}</option>
            {SEARCH_PROVIDERS.map((engine) => (
              <option key={engine} value={engine}>
                {words.search.engines[engine].name}
              </option>
            ))}
          </Select>
          <p
            id={`search-task-${task}-hint`}
            className="max-w-[62ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
          >
            {words.search.tasks[task].what}
          </p>
        </div>
      ))}

      <Select
        label={t('search_topic', 'Search topic')}
        name="searchTopic"
        value={searchTopic}
        disabled={usageMode === 'included'}
        disableForm={true}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
          setSearchTopic(event.target.value === 'news' ? 'news' : 'general')
        }
      >
        <option value="general">{t('search_topic_general', 'General')}</option>
        <option value="news">{t('search_topic_news', 'News')}</option>
      </Select>

      <Select
        label={t('search_depth', 'Search depth')}
        name="searchDepth"
        value={searchDepth}
        disabled={usageMode === 'included'}
        disableForm={true}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
          setSearchDepth(
            event.target.value === 'advanced' ? 'advanced' : 'basic'
          )
        }
      >
        <option value="basic">{t('search_depth_basic', 'Basic')}</option>
        <option value="advanced">
          {t('search_depth_advanced', 'Advanced')}
        </option>
      </Select>

      <div className="cf-body-sm text-cf-ink-muted">
        {t(
          'tavily_search_mode',
          'Tavily uses the selected search depth with full page content. Fresh requests use news results from the past week.'
        )}
      </div>

      <div className="cf-body-sm text-cf-ink-muted">
        {data?.searchFallbackAvailable
          ? t(
              'openrouter_fallback_available',
              'Automatic fallback is available through the OpenRouter AI key above. It runs only after a Tavily outage, quota error, timeout or empty result.'
            )
          : data?.provider === 'openrouter'
          ? t(
              'openrouter_fallback_missing_key',
              'Automatic fallback needs an OpenRouter AI key above. Tavily remains primary.'
            )
          : t(
              'openrouter_fallback_wrong_provider',
              'Automatic fallback is unavailable while the AI provider is OpenAI. Tavily research still works normally.'
            )}
      </div>

      <div className="flex gap-[8px]">
        <Button onClick={save} disabled={saving || !data}>
          {t('save', 'Save')}
        </Button>
      </div>
    </div>
  );
};

export default AiProviderComponent;
