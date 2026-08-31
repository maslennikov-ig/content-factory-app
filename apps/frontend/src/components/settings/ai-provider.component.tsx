'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { Select } from '@contentfactory/react/form/select';
import { Input } from '@contentfactory/react/form/input';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { CloseIconSmall } from '@contentfactory/frontend/components/ui/icons';

type Provider = 'openai' | 'openrouter';
type UsageMode = 'included' | 'workspace_key';

interface AiSettings {
  usageMode: UsageMode;
  provider: Provider;
  textModel: string;
  imageModel: string;
  hasKey: boolean;
  searchEnabled: boolean;
  searchProvider: 'tavily';
  searchTopic: 'general' | 'news';
  searchDepth: 'basic' | 'advanced';
  hasSearchKey: boolean;
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
  searchEnabled: boolean;
  searchApiKey: string;
  searchTopic: 'general' | 'news';
  searchDepth: 'basic' | 'advanced';
}

export const buildAiSettingsPayload = ({
  usageMode,
  provider,
  apiKey,
  textModel,
  imageModel,
  searchEnabled,
  searchApiKey,
  searchTopic,
  searchDepth,
}: AiSettingsPayloadInput) => ({
  usageMode,
  provider,
  ...(usageMode === 'workspace_key' && apiKey ? { apiKey } : {}),
  ...(usageMode === 'workspace_key' ? { textModel, imageModel } : {}),
  searchEnabled,
  searchProvider: 'tavily' as const,
  ...(usageMode === 'workspace_key' && searchApiKey ? { searchApiKey } : {}),
  searchTopic,
  searchDepth,
});

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
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchApiKey, setSearchApiKey] = useState('');
  const [searchTopic, setSearchTopic] = useState<'general' | 'news'>('general');
  const [searchDepth, setSearchDepth] = useState<'basic' | 'advanced'>(
    data?.searchDepth || 'advanced'
  );
  const [clearingSearch, setClearingSearch] = useState(false);

  useEffect(() => {
    if (!data) return;
    setUsageMode(data.usageMode);
    setProvider(data.provider);
    setTextModel(data.textModel);
    setImageModel(data.imageModel);
    setSearchEnabled(data.searchEnabled);
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
    },
    [data]
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
            searchEnabled,
            searchApiKey,
            searchTopic,
            searchDepth,
          })
        ),
      });
      if (!response.ok) throw new Error();
      setApiKey('');
      setSearchApiKey('');
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
    searchEnabled,
    searchApiKey,
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

  const clearSearchKey = useCallback(async () => {
    setClearingSearch(true);
    const outcome = await removeStoredKey({
      endpoint: '/settings/ai/search-key',
      confirm: () =>
        deleteDialog(
          t(
            'search_key_remove_confirm',
            'The stored Tavily key is removed and cannot be recovered. Web research stops for this workspace until a new key is saved.'
          ),
          t('search_key_remove_approve', 'Yes, remove the key'),
          t('search_key_remove_title', 'Remove the stored search key?')
        ),
      request: fetch,
      onRemoved: async () => {
        setSearchApiKey('');
        await mutate();
      },
    });
    setClearingSearch(false);
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
  }, []);

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

      {provider === 'openrouter' && models?.error && (
        <div className="cf-body-sm text-cf-danger">
          {t(
            'ai_models_unavailable',
            'Could not reach the OpenRouter catalogue. You can still type a model id.'
          )}
        </div>
      )}

      <div className="mt-[8px] border-t border-cf-border pt-[16px]">
        <h4 className="cf-heading-md text-cf-ink">
          {t('web_search', 'Web research')}
        </h4>
        <div className="cf-body-sm text-cf-ink-muted">
          {t(
            'web_search_description_org',
            'Tavily is the primary search backend. OpenRouter is used automatically only when Tavily is temporarily unavailable.'
          )}
        </div>
      </div>

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

      <div className="flex flex-col gap-[4px]">
        <Input
          label={t('search_api_key', 'Tavily API key')}
          name="searchApiKey"
          secret={true}
          value={searchApiKey}
          disabled={usageMode === 'included'}
          disableForm={true}
          action={
            usageMode === 'workspace_key' && data?.hasSearchKey ? (
              <ClearStoredKeyButton
                label={t(
                  'remove_stored_search_key',
                  'Remove stored search key'
                )}
                busy={clearingSearch}
                onClear={clearSearchKey}
              />
            ) : undefined
          }
          placeholder={
            data?.hasSearchKey
              ? t(
                  'search_key_set_placeholder',
                  'A search key is saved — type to replace it'
                )
              : t('search_key_empty_placeholder', 'Paste a Tavily key')
          }
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setSearchApiKey(event.target.value)
          }
        />
        <div className="cf-body-sm text-cf-ink-muted">
          {data?.hasSearchKey
            ? t(
                'search_key_from_settings',
                'A Tavily key is stored for this workspace. It is never shown again.'
              )
            : t(
                'search_key_missing_org',
                'No Tavily key is stored, so web research and fallback both stay unavailable.'
              )}
        </div>
      </div>

      <Select
        label={t('search_topic', 'Search topic')}
        name="searchTopic"
        value={searchTopic}
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
