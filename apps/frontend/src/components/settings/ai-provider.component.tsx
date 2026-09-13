'use client';

import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { Select } from '@contentfactory/react/form/select';
import { Input } from '@contentfactory/react/form/input';
import { Button } from '@contentfactory/react/form/button';
import { ControlButton } from '@contentfactory/react/choice/control.button';
import { Hint } from '@contentfactory/react/layout/hint';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { CloseIconSmall } from '@contentfactory/frontend/components/ui/icons';
import { SettingsSection } from '@contentfactory/frontend/components/settings/settings-section';
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
 * Which engine each task gets when nobody has said otherwise — the same table
 * the server routes by, and the reason this screen no longer asks.
 *
 * Owner, on the walk of 13.09.2026, looking at the three task selectors:
 * «зачем мы даём эти настройки, если мы с тобой уже знаем, как лучше сделать?»
 * The recommendation was printed directly above the controls that asked for
 * it, which is a question with its own answer attached. The answer now lives
 * in `DEFAULT_SEARCH_TASK_PROVIDERS` on the server and in this copy of it, and
 * the screen states the outcome instead of asking for it.
 */
const DEFAULT_SEARCH_TASK_PROVIDERS: Record<SearchTask, SearchProvider> = {
  research: 'exa',
  facts: 'tavily',
  discovery: 'tavily',
};

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

/**
 * Which engine a task actually reaches — the client's copy of
 * `providerForSearchTask`.
 *
 * It exists so the screen can say what is happening rather than offer to
 * change it. A sentence that guessed would be worse than the selectors it
 * replaced, so this is the server's algorithm step for step: an operator's
 * stored override first, then the product's own default while its engine has
 * a key, then any engine that has one.
 * `tests/ai.search-routing.guard.test.cjs` runs both over every combination of
 * stored keys and fails on the first disagreement.
 */
export const searchEngineForTask = (
  task: SearchTask,
  source: {
    provider: SearchProvider;
    taskProviders?: SearchTaskProviders;
    hasKey: (engine: SearchProvider) => boolean;
  }
): SearchProvider => {
  const usable = (engine: SearchProvider): boolean =>
    !searchProviderNeedsKey(engine) || source.hasKey(engine);

  const anyUsable = (): SearchProvider =>
    usable(source.provider)
      ? source.provider
      : SEARCH_PROVIDERS.find(
          (engine) => searchProviderNeedsKey(engine) && usable(engine)
        ) ?? source.provider;

  const routed = source.taskProviders?.[task];
  if (routed) return usable(routed) ? routed : anyUsable();

  const preferred = DEFAULT_SEARCH_TASK_PROVIDERS[task];
  return preferred && usable(preferred) ? preferred : anyUsable();
};

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
  /** Only the engines a person actually typed into during this visit. */
  searchApiKeys?: SearchKeyDrafts;
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

export const buildAiSettingsPayload = ({
  usageMode,
  provider,
  apiKey,
  textModel,
  imageModel,
  roleModels,
  searchEnabled,
  searchApiKeys = {},
  searchTopic,
  searchDepth,
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
     * Whether search runs at all is a workspace-key setting now.
     *
     * On the system keys the server decides it by the presence of an operator
     * search key and does not read the row's flag at all
     * (`ai.provider.config.ts`, `includedSearch`), so the screen shows no
     * switch there — and must not send one either. `searchEnabled` in this
     * mode holds what the *operator* has, not what this workspace chose, and
     * writing it back would overwrite a workspace's own «поиск выключен» the
     * first time anything on this screen autosaved
     * (`content-factory-next-75xn.26`, after `.20`).
     */
    ...(usageMode === 'workspace_key' ? { searchEnabled } : {}),
    /**
     * Everything else about search is a workspace-key setting, and in
     * `included` mode the screen is showing the operator's values rather than
     * the workspace's own. Sending them back would save somebody else's engine
     * as this workspace's (`content-factory-next-75xn.4`); the server already
     * refuses them in this mode, and the screen no longer offers them.
     *
     * `searchProvider` and `searchTaskProviders` are not here in either mode
     * any more. The door still accepts both, because rows written before
     * `content-factory-next-75xn.10` hold operator overrides that must keep
     * working; what changed is that this screen stopped asking, so it has
     * nothing to say about them and sending a value would mean overwriting an
     * override with a control the person never saw.
     */
    ...(usageMode === 'workspace_key'
      ? {
          searchTopic,
          searchDepth,
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
 *
 * `ControlButton` rather than `Button`, because the mark's distance from the
 * field's edge is the field's decision and not the button's: `Button` brings
 * its own `px-[16px]`, which is exactly how this glyph came to stand ten
 * pixels further in than the chevron beside it. `ControlButton` contributes
 * the focus ring, the disabled state and `type="button"` and no geometry, so
 * `cf-field-action-inset` on the slot is the only thing placing it. The box is
 * the glyph's own width and the hit area is widened past it, which keeps the
 * pointer target at 28px without moving the mark.
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
  <ControlButton
    aria-label={label}
    title={label}
    disabled={busy}
    onClick={onClear}
    className="relative inline-flex w-[12px] shrink-0 items-center justify-center rounded-[4px] text-cf-ink-muted transition-colors duration-state hover:text-cf-ink before:absolute before:-inset-x-[8px] before:inset-y-0 before:content-['']"
  >
    <CloseIconSmall />
  </ControlButton>
);

/**
 * A label, the sentence it could not fit, and the control underneath.
 *
 * Owner, 13.09.2026: «у нас же есть подсказки, знаки вопросика… а почему мы не
 * используем их здесь?» The section answered every question in a paragraph
 * that was on screen permanently, so four explanations occupied more of the
 * column than the eight controls they explained. `Hint` had twenty-five call
 * sites elsewhere in the product and none in settings.
 *
 * The label is written here rather than passed to the primitive because
 * `Input` and `Select` take a `string` label and a hint is a control, not a
 * string. `htmlFor` keeps the association the primitive would have made, so
 * the field still gets its name from its label.
 */
const LabelledField = ({
  id,
  label,
  hint,
  hintLabel,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  hintLabel?: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-[6px]">
    <span className="flex flex-wrap items-center gap-[4px]">
      <label htmlFor={id} className="cf-label-md text-cf-ink">
        {label}
      </label>
      {hint && hintLabel ? <Hint label={hintLabel}>{hint}</Hint> : null}
    </span>
    {children}
  </div>
);

/** A block inside the section: its name, and the hint that name needs. */
const BlockHeading = ({
  title,
  hint,
  hintLabel,
}: {
  title: string;
  hint?: ReactNode;
  hintLabel?: string;
}) => (
  <h5 className="flex flex-wrap items-center gap-[4px] cf-label-sm uppercase text-cf-ink-muted">
    {title}
    {hint && hintLabel ? <Hint label={hintLabel}>{hint}</Hint> : null}
  </h5>
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
  onChange,
  onCommit,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  options: ModelOption[];
  listId: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) => (
  <>
    <Input
      label={label}
      name={listId}
      value={value}
      placeholder={placeholder}
      disableForm={true}
      list={listId}
      // `helper` renders the hint and wires aria-describedby, so a screen
      // reader announces it with the field instead of as loose text after it.
      helper={hint}
      // A model id is typed a character at a time and none of the intermediate
      // ones is a model, so this field is saved when it is left rather than as
      // it is written. A key field has no such handler at all.
      onBlur={() => onCommit()}
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
  const [searchApiKeys, setSearchApiKeys] = useState<SearchKeyDrafts>({});
  const [searchTopic, setSearchTopic] = useState<'general' | 'news'>('general');
  const [searchDepth, setSearchDepth] = useState<'basic' | 'advanced'>(
    data?.searchDepth || 'advanced'
  );
  // Which engine's key is being removed, so only that field's button waits.
  const [clearingSearch, setClearingSearch] =
    useState<KeyedSearchProvider | null>(null);

  useEffect(() => {
    if (!data) return;
    setUsageMode(data.usageMode);
    setProvider(data.provider);
    setTextModel(data.textModel);
    setImageModel(data.imageModel);
    setRoleModels(data.roleModels || {});
    setSearchEnabled(data.searchEnabled);
    setSearchTopic(data.searchTopic);
    setSearchDepth(data.searchDepth);
  }, [data]);

  /**
   * What the form holds right now, readable from a callback that was created
   * before the last keystroke.
   *
   * Autosave posts the whole settings object, not the one field that changed,
   * so it has to read the other eight from somewhere. A dependency list would
   * do it and would also rebuild every handler on every character typed into
   * a model id; `email-notifications.component.tsx` solved the same problem
   * the same way.
   */
  const formRef = useRef({
    usageMode,
    provider,
    textModel,
    imageModel,
    roleModels,
    searchEnabled,
    searchTopic,
    searchDepth,
  });
  formRef.current = {
    usageMode,
    provider,
    textModel,
    imageModel,
    roleModels,
    searchEnabled,
    searchTopic,
    searchDepth,
  };

  /**
   * Save without being asked — everything except a key.
   *
   * Owner, 13.09.2026: «обязательно нажимать „Сохранить“ или есть
   * автосохранение?… я бы использовал автосохранение, и если человек очень
   * хочет, он может нажать и сохранить». Three of the four sections on this
   * tab already saved themselves, and the fourth had a button whose own
   * «remove key» control worked around it.
   *
   * A key is the exception and not an oversight. It is a secret, a keystroke
   * is not a decision to publish one, and a field that posted `sk-` as it was
   * being pasted would put a fragment of a credential into the request log of
   * every hop between here and the database. So `apiKey` and `searchApiKeys`
   * are empty on this path by construction rather than by being filtered
   * later: there is no value of the form state that makes this call carry one.
   */
  const autosave = useCallback(
    async (patch: Partial<typeof formRef.current> = {}) => {
      const next = { ...formRef.current, ...patch };
      try {
        const response = await fetch('/settings/ai', {
          method: 'POST',
          body: JSON.stringify(
            buildAiSettingsPayload({
              ...next,
              apiKey: '',
              searchApiKeys: {},
            })
          ),
        });
        if (!response.ok) throw new Error();
        await mutate();
        // The same announcement the other three sections of this tab make, so
        // «it saved» reads the same way wherever a person happens to be.
        toaster.show(t('settings_updated', 'Settings updated'), 'success');
      } catch {
        toaster.show(
          t('ai_provider_save_failed', 'Could not save the provider settings'),
          'warning'
        );
      }
    },
    []
  );

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
      const nextText = returning ? data?.textModel || '' : '';
      const nextImage = returning ? data?.imageModel || '' : '';
      // Role ids belong to their provider for exactly the same reason, and a
      // routed role left behind after a switch would send that one call to an
      // id the new provider has never heard of.
      const nextRoles = returning ? data?.roleModels || {} : {};
      setTextModel(nextText);
      setImageModel(nextImage);
      setRoleModels(nextRoles);
      autosave({
        provider: next,
        textModel: nextText,
        imageModel: nextImage,
        roleModels: nextRoles,
      });
    },
    [data, autosave]
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
   * The one sentence that replaced four selectors.
   *
   * It is computed rather than written down because the routing is: the same
   * keys that decide what the server does decide what this says, so there is
   * no state in which the screen claims an engine the next search will not
   * use. When no engine has anything to spend it says that instead of naming
   * one, which is the case the old «Поисковый сервер» selector answered by
   * silently switching the whole lane off.
   */
  const routing = useMemo(() => {
    const engines = SEARCH_TASKS.map((task) =>
      searchEngineForTask(task, {
        provider: data?.searchProvider || 'tavily',
        taskProviders: data?.searchTaskProviders,
        hasKey: hasStoredSearchKey,
      })
    );
    const payable = engines.some(
      (engine) => !searchProviderNeedsKey(engine) || hasStoredSearchKey(engine)
    );
    /**
     * В режиме ключей системы «сохраните свой ключ или включите ключи системы»
     * было бы советом человеку, который ключи системы уже включил: заводит их
     * не область, а суперадмин инстанса. Строка называет того, кто может.
     */
    if (!payable)
      return {
        line:
          usageMode === 'included'
            ? words.search.systemKeysMissing
            : words.search.routingNone,
        payable,
      };
    return {
      payable,
      line: words.search.routing(
        SEARCH_TASKS.map((task, index) => ({
          task: words.search.tasks[task].label,
          engine: words.search.engines[engines[index]].name,
        }))
      ),
    };
  }, [data, hasStoredSearchKey, usageMode, words]);

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

  /**
   * The explicit save, which exists for exactly one reason: it is the only
   * path a key travels. Everything else on this screen has already saved
   * itself by the time the button is reached, which is why the button no
   * longer says anything different when it is pressed with nothing typed.
   */
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
            searchApiKeys,
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
    searchApiKeys,
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
   * Remove one engine's stored key.
   *
   * The engine travels in the query string because that is what the door
   * reads, and the confirmation names the same engine: «the stored key» was an
   * honest sentence while a workspace had one, and is a guess now that it has
   * two. There is no all-engines form any more: it existed for the included
   * mode, and on the system keys a workspace administrator no longer removes
   * anything (`content-factory-next-75xn.26`).
   */
  const clearSearchKey = useCallback(
    async (engine: KeyedSearchProvider) => {
      setClearingSearch(engine);
      const outcome = await removeStoredKey({
        endpoint: `/settings/ai/search-key?provider=${engine}`,
        confirm: () =>
          deleteDialog(
            words.search.engines[engine].removeKeyConfirm,
            t('search_key_remove_approve', 'Yes, remove the key'),
            t('search_key_remove_title', 'Remove the stored search key?')
          ),
        request: fetch,
        onRemoved: async () => {
          setSearchApiKeys((current) => ({ ...current, [engine]: '' }));
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

  /**
   * Which of the two scenarios the person picked.
   *
   * Owner, 13.09.2026: «мы смешали два сценария». On the system keys there is
   * nothing to fill in, and the screen was still showing nine disabled fields
   * holding the operator's values — a form that looks like a form and refuses
   * to be one. On their own key, everything is theirs to set. So the fields
   * are absent rather than disabled, and the one line above says so.
   */
  const ownKeys = usageMode === 'workspace_key';

  return (
    <SettingsSection title={t('ai_provider', 'AI provider')}>
      <LabelledField
        id="ai-usage-mode"
        label={t('ai_usage_mode')}
        hintLabel={words.hintFor(t('ai_usage_mode'))}
        hint={words.search.ownKeyKept}
      >
        <Select
          id="ai-usage-mode"
          label=""
          name="usageMode"
          value={usageMode}
          disableForm={true}
          hideErrors={true}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
            const next =
              event.target.value === 'included' ? 'included' : 'workspace_key';
            setUsageMode(next);
            autosave({ usageMode: next });
          }}
        >
          <option value="included">{t('ai_usage_included')}</option>
          <option value="workspace_key">{t('ai_usage_workspace_key')}</option>
        </Select>
      </LabelledField>

      <div className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
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
        <BlockHeading
          title={t('ai_usage_by_member', 'AI usage by member, this period')}
          hintLabel={words.hintFor(
            t('ai_usage_by_member', 'AI usage by member, this period')
          )}
          hint={words.usageNoneHint}
        />
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
          <div className="flex items-baseline justify-between gap-[16px] cf-body-sm text-cf-ink">
            <span className="truncate">{words.usageNone}</span>
            <span className="cf-caption text-cf-ink-muted">0</span>
          </div>
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
        <BlockHeading
          title={t('ai_usage_by_role', 'AI usage by role, this period')}
          hintLabel={words.hintFor(
            t('ai_usage_by_role', 'AI usage by role, this period')
          )}
          hint={words.usageNoneHint}
        />
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
          /*
            Шесть нулей, а не одна строка «пусто»: роли известны заранее
            (`AI_ROLES`), и напечатанный ноль напротив каждой — это и есть
            ответ на вопрос «а где смотреть». Заодно список ролей виден
            раньше, чем человек доходит до полей ниже.
          */
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
        )}
      </div>

      {ownKeys && (
        <>
          <LabelledField id="ai-provider-name" label={t('provider', 'Provider')}>
            <Select
              id="ai-provider-name"
              label=""
              name="provider"
              value={provider}
              disableForm={true}
              hideErrors={true}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                changeProvider(e.target.value as Provider)
              }
            >
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
            </Select>
          </LabelledField>

          <Input
            label={t('api_key', 'API key')}
            name="apiKey"
            secret={true}
            value={apiKey}
            disableForm={true}
            action={
              data?.hasKey ? (
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
            /*
              A key is a secret and has no autosave handler of any kind: this
              field reaches the network only when «Сохранить» is pressed. The
              line below is state — whether a key is stored — so it stays on
              the surface rather than moving into a hint.
            */
            helper={
              !data?.hasKey
                ? t(
                    'ai_key_missing_org',
                    'This workspace has no key, so generation is off. Keys are per workspace: yours is never shown to anyone else, and no other workspace can spend it.'
                  )
                : t(
                    'ai_key_from_settings',
                    'A key is stored for this workspace. It is never shown again.'
                  )
            }
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setApiKey(e.target.value)
            }
          />

          <ModelField
            label={t('text_model', 'Text model')}
            hint={
              provider === 'openrouter'
                ? t(
                    'text_model_hint_openrouter',
                    'Only models that support structured output and tools are listed — the generator depends on both.'
                  )
                : t(
                    'text_model_hint',
                    'Leave empty to use the provider default.'
                  )
            }
            placeholder={t('provider_default_model', 'Provider default')}
            value={textModel}
            options={textOptions}
            listId="ai-text-models"
            onChange={setTextModel}
            onCommit={autosave}
          />

          <ModelField
            label={t('image_model', 'Image model')}
            hint={
              provider === 'openrouter'
                ? t(
                    'image_model_hint_openrouter',
                    'Only models that can return an image are listed.'
                  )
                : t(
                    'image_model_hint',
                    'Leave empty to use the provider default.'
                  )
            }
            placeholder={t('provider_default_model', 'Provider default')}
            value={imageModel}
            options={imageOptions}
            listId="ai-image-models"
            onChange={setImageModel}
            onCommit={autosave}
          />

          {/*
            One model for everything was the whole cost problem
            (`content-factory-next-x63z`): classifying a research subject — one
            sentence in, five short fields out — was billed at the price of
            writing a draft. Six rows, each a plain model id, each empty by
            default and empty meaning «the text model above», so the screen
            adds a lever without adding a decision anybody has to make.

            Три абзаца объяснения стояли здесь постоянно и занимали больше
            места, чем шесть полей. Решающее — что пустое поле это нормально —
            осталось строкой; что такое роль вызова и зачем её менять, уехало
            в подсказку (`content-factory-next-75xn.13`).
          */}
          <div
            data-ai-roles-hint="true"
            className="flex flex-col gap-[4px] border-t border-cf-border pt-[16px]"
          >
            <BlockHeading
              title={t('ai_role_models', 'Usage and call roles')}
              hintLabel={words.hintFor(
                t('ai_role_models', 'Usage and call roles')
              )}
              hint={words.rolesHint}
            />
            <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
              {words.rolesEmpty}
            </p>
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
              onBlur={() => autosave()}
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
        </>
      )}

      <div className="flex flex-col gap-[8px] border-t border-cf-border pt-[16px]">
        <BlockHeading
          title={t('web_search', 'Web research')}
          hintLabel={words.hintFor(t('web_search', 'Web research'))}
          hint={words.search.what}
        />
        {/*
          Одна строка вместо четырёх селекторов и абзаца объяснения. Она
          называет то, что происходит на самом деле: какой движок обслуживает
          ресерч, какой — проверку фактов, и что это следует из сохранённых
          ключей (`content-factory-next-75xn.10`).
        */}
        <p
          data-search-routing="true"
          className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
        >
          {routing.line}
        </p>
      </div>

      {/*
        Whether search runs at all is a person's decision and nothing on this
        screen makes it for them any more. It used to: changing the engine
        switched the lane off by itself when the new engine had no key, and the
        owner met that as «статус веб-исследования автоматически выключается»
        on 13.09.2026 without having touched the switch. The engine selector is
        gone, and with it the only writer of this value other than this control.

        На ключах системы переключателя нет вовсе: там поиск включён ровно
        тогда, когда у оператора есть поисковый ключ, и флаг области в этом
        режиме сервер не читает (`ai.provider.config.ts`, `includedSearch`).
        Переключатель, который ничего не переключает, — это не настройка, а
        обещание, которого продукт не держит (`content-factory-next-75xn.26`).
      */}
      {ownKeys && (
        <LabelledField
          id="ai-search-enabled"
          label={t('web_search_status', 'Web research status')}
        >
          <Select
            id="ai-search-enabled"
            label=""
            name="searchEnabled"
            value={searchEnabled ? 'enabled' : 'disabled'}
            disableForm={true}
            hideErrors={true}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              const next = event.target.value === 'enabled';
              setSearchEnabled(next);
              autosave({ searchEnabled: next });
            }}
          >
            <option value="disabled">{t('disabled', 'Disabled')}</option>
            <option value="enabled">{t('enabled', 'Enabled')}</option>
          </Select>
        </LabelledField>
      )}

      {/*
        Одна строка вместо переключателя: поиск на ключах системы работает, и
        вводить ничего не нужно. Когда ключей системы нет, это уже сказано
        строкой маршрутизации выше, и второй раз не повторяется.
      */}
      {!ownKeys && data?.searchEnabled && (
        <p
          data-search-system-keys="true"
          className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
        >
          {words.search.systemKeysOnly}
        </p>
      )}

      {/*
        Про свой ключ области сказано одним предложением — и больше ничего.

        Владелец 13.09.2026: «если я выбираю ключи системы — зачем кнопки
        „Убрать ключ Tavily“, „Убрать ключ Exa“? Для суперадмина они есть в его
        админке, обычному человеку зачем?» Убирать чужой ключ отсюда было
        нечего, а свой — незачем: он лежит нетронутым и снова заработает, как
        только область вернётся к своим ключам. Кнопка удаления стоит там, где
        стоит само поле ключа, то есть в режиме своих ключей
        (`content-factory-next-75xn.26`).
      */}
      {!ownKeys && data?.hasSearchKey && (
        <p
          data-search-included-key="true"
          className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
        >
          {words.search.includedOwnKey}
        </p>
      )}

      {ownKeys && (
        <>
          {/*
            Поле на движок, а не одно на область: ключ адресуется движком, и Exa
            не может прочитать ключ Tavily. Подписи и строки состояния живут в
            `ai-provider.copy.ts`, потому что название движка в подписи — это не
            перевод, а часть смысла: ключи локалей писались, когда движок был
            один, и до сих пор называют Tavily в поле, которое теперь
            принадлежит Exa.
          */}
          <BlockHeading
            title={words.search.ownKeysTitle}
            hintLabel={words.hintFor(words.search.ownKeysTitle)}
            hint={words.search.openrouterNoKey}
          />
          <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {words.search.ownKey}
          </p>

          {KEYED_SEARCH_PROVIDERS.map((engine) => (
            <Input
              key={engine}
              label={words.search.engines[engine].keyLabel}
              name={`searchApiKey-${engine}`}
              secret={true}
              value={searchApiKeys[engine] || ''}
              disableForm={true}
              action={
                hasStoredSearchKey(engine) ? (
                  <ClearStoredKeyButton
                    label={words.search.engines[engine].removeKey}
                    busy={clearingSearch === engine}
                    onClear={() => clearSearchKey(engine)}
                  />
                ) : undefined
              }
              placeholder={
                hasStoredSearchKey(engine)
                  ? words.search.keySavedPlaceholder
                  : words.search.keyEmptyPlaceholder
              }
              helper={
                hasStoredSearchKey(engine)
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

          <LabelledField id="ai-search-topic" label={t('search_topic', 'Search topic')}>
            <Select
              id="ai-search-topic"
              label=""
              name="searchTopic"
              value={searchTopic}
              disableForm={true}
              hideErrors={true}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                const next =
                  event.target.value === 'news' ? 'news' : 'general';
                setSearchTopic(next);
                autosave({ searchTopic: next });
              }}
            >
              <option value="general">
                {t('search_topic_general', 'General')}
              </option>
              <option value="news">{t('search_topic_news', 'News')}</option>
            </Select>
          </LabelledField>

          <LabelledField
            id="ai-search-depth"
            label={t('search_depth', 'Search depth')}
            hintLabel={words.hintFor(t('search_depth', 'Search depth'))}
            hint={t(
              'tavily_search_mode',
              'Tavily uses the selected search depth with full page content. Fresh requests use news results from the past week.'
            )}
          >
            <Select
              id="ai-search-depth"
              label=""
              name="searchDepth"
              value={searchDepth}
              disableForm={true}
              hideErrors={true}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                const next =
                  event.target.value === 'advanced' ? 'advanced' : 'basic';
                setSearchDepth(next);
                autosave({ searchDepth: next });
              }}
            >
              <option value="basic">{t('search_depth_basic', 'Basic')}</option>
              <option value="advanced">
                {t('search_depth_advanced', 'Advanced')}
              </option>
            </Select>
          </LabelledField>

          {/*
            Состояние, а не объяснение: доступен ли откат на OpenRouter — это
            факт про эту область прямо сейчас, и подсказка такого держать не
            может.
          */}
          <div className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
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
        </>
      )}

      {/*
        Кнопка осталась, хотя всё остальное сохраняется само. Владелец
        13.09.2026: «я бы использовал автосохранение, и если человек очень
        хочет, он может нажать и сохранить». И у неё есть работа, которой нет
        ни у кого другого: ключи уходят только отсюда.
      */}
      <div className="flex flex-wrap items-center gap-[8px]">
        <Button onClick={save} disabled={saving || !data}>
          {t('save', 'Save')}
        </Button>
        <span className="cf-body-sm text-cf-ink-muted">
          {words.autosaveNote}
        </span>
      </div>
    </SettingsSection>
  );
};

export default AiProviderComponent;
