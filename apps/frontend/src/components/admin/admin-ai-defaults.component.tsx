'use client';

import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { ControlButton } from '@contentfactory/react/choice/control.button';
import { Hint } from '@contentfactory/react/layout/hint';
import { PageHeader } from '@contentfactory/react/layout';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { formatLocalizedDateTime } from '@contentfactory/react/helpers/localized.date';
import { CloseIconSmall } from '@contentfactory/frontend/components/ui/icons';
import { Status, StatusTone } from '@contentfactory/frontend/components/ui/surface';
/**
 * Геометрия карточки берётся у того же компонента, что и разделы настроек, а
 * не переписывается здесь.
 *
 * `SettingsSection` лежит в папке настроек, но принадлежит не ей: это `Panel`
 * с ритмом вкладки, и `tests/component-geometry.guard.test.cjs` заведён ровно
 * затем, чтобы шестой рукописной копии этой строки не появилось. Экран
 * суперадмина — шестой претендент, и импорт через границу папки здесь честнее,
 * чем ещё одна копия `rounded-[8px] border border-cf-border bg-cf-surface
 * p-[24px]`. Переименование и переезд компонента в общий слой — отдельная
 * работа, которая тронет и четыре раздела настроек.
 */
import { SettingsSection } from '@contentfactory/frontend/components/settings/settings-section';
import {
  adminAiDefaultsCopy,
  resolveAdminAiDefaultsLocale,
  type KeyOrigin,
} from '@contentfactory/frontend/components/admin/admin-ai-defaults.copy';

type Provider = 'openai' | 'openrouter';

/**
 * Движки, у которых есть собственный поисковый ключ.
 *
 * Список повторён здесь, потому что этот бандл не может импортировать
 * серверный модуль; единственный экземпляр живёт в `SEARCH_PROVIDERS` и
 * `searchProviderNeedsKey` (`libraries/nestjs-libraries/src/openai/
 * ai.search-tasks.ts`), и OpenRouter в него не входит специально: он отвечает
 * на поисковый запрос ключом генерации.
 */
export const KEYED_SEARCH_PROVIDERS = ['tavily', 'exa'] as const;

export type KeyedSearchProvider = (typeof KEYED_SEARCH_PROVIDERS)[number];

/** Что отдаёт `GET /admin/ai-defaults`. Значения ключей — никогда. */
export interface AdminAiDefaults {
  provider: Provider | null;
  textModel: string | null;
  imageModel: string | null;
  roleModels: Record<string, string>;
  searchTaskProviders: Record<string, string>;
  monthlyOperations: number | null;
  hasKey: boolean;
  searchKeys: Partial<Record<'tavily' | 'openrouter' | 'exa', boolean>>;
  /**
   * Третье состояние, и единственный способ его узнать: что из этого сервер
   * получил переменной окружения. Без него суперадмин работающего инстанса
   * видит пустое поле, решает, что ключа нет, и вставляет второй.
   */
  fromEnvironment: {
    apiKey: boolean;
    provider: boolean;
    textModel: boolean;
    imageModel: boolean;
    monthlyOperations: boolean;
    searchKeys: Partial<Record<'tavily' | 'openrouter' | 'exa', boolean>>;
  };
  updatedAt: string | null;
  updatedByUserId: string | null;
}

/**
 * Три состояния поля ключа, посчитанные в одном месте.
 *
 * Порядок не случаен: сохранённое здесь сильнее переменной окружения — так
 * читает сервер (`instance-ai-defaults.service.ts`: переменная не заменяется,
 * а становится полом поля), — поэтому «задан здесь» проверяется первым. Если
 * поменять порядок, экран начнёт называть источником не тот ключ, которым
 * платит инстанс.
 */
export const keyOrigin = (stored: boolean, environment: boolean): KeyOrigin =>
  stored ? 'screen' : environment ? 'environment' : 'absent';

/**
 * Цвет маркера — не единственный носитель смысла: `Status` всегда печатает
 * своё слово. «Не задан» жёлтый потому, что это ограничение, а не поломка:
 * области на своих ключах работают дальше.
 */
const ORIGIN_TONE: Record<KeyOrigin, StatusTone> = {
  screen: 'accent',
  environment: 'info',
  absent: 'warning',
};

/**
 * Кнопка удаления живёт в поле, которое держит ключ, а не в ряду действий
 * страницы: внизу она читалась бы третьим соседом «Сохранить», и ни цель, ни
 * последствие не были бы видны оттуда, где стоит ключ.
 *
 * `ControlButton`, а не `Button`: отступ знака от края поля — решение поля, а
 * не кнопки, и `Button` принесёт собственный `px-[16px]`. Ровно тот же выбор
 * сделан в разделе ИИ настроек области.
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
 * Поле ключа со своим состоянием.
 *
 * Маркер и объяснение уезжают в `helper` поля, а не встают отдельной строкой
 * рядом: `Input` связывает `helper` с полем через `aria-describedby`, поэтому
 * «Задан на сервере» читается вместе с полем, а не как потерянный текст после
 * него. Состояние — это состояние, и в подсказке ему делать нечего.
 */
const KeyField = ({
  name,
  label,
  origin,
  originLabel,
  explanation,
  value,
  placeholder,
  removeLabel,
  busy,
  onChange,
  onClear,
}: {
  name: string;
  label: string;
  origin: KeyOrigin;
  originLabel: string;
  explanation: string;
  value: string;
  placeholder: string;
  removeLabel: string;
  busy: boolean;
  onChange: (value: string) => void;
  /** Отсутствует, когда убирать нечего: ключ сервера отсюда не удаляется. */
  onClear?: () => void;
}) => (
  <div data-key-field={name} data-key-origin={origin}>
    <Input
      label={label}
      name={name}
      secret={true}
      disableForm={true}
      value={value}
      placeholder={placeholder}
      action={
        origin === 'screen' && onClear ? (
          <ClearStoredKeyButton
            label={removeLabel}
            busy={busy}
            onClear={onClear}
          />
        ) : undefined
      }
      helper={
        <span className="flex flex-wrap items-center gap-[8px]">
          <Status tone={ORIGIN_TONE[origin]}>{originLabel}</Status>
          <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {explanation}
          </span>
        </span>
      }
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        onChange(event.target.value)
      }
    />
  </div>
);

/**
 * Название карточки и предложение, которое в него не поместилось.
 *
 * Подсказка стоит в заголовке секции, а не отдельной строкой под ним: у
 * `SettingsSection` заголовок принимает узел именно затем, и второй заголовок
 * внутри карточки повторял бы её собственный.
 */
const SectionTitle = ({
  title,
  hint,
  hintLabel,
}: {
  title: string;
  hint: ReactNode;
  hintLabel: string;
}) => (
  <span className="flex flex-wrap items-center gap-[4px]">
    {title}
    <Hint label={hintLabel}>{hint}</Hint>
  </span>
);

/** Подпись поля, подсказка к ней и сам контрол под ними. */
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
  <div className="flex flex-col gap-[4px]">
    <span className="flex flex-wrap items-center gap-[4px]">
      <label htmlFor={id} className="cf-label-md text-cf-ink">
        {label}
      </label>
      {hint && hintLabel ? <Hint label={hintLabel}>{hint}</Hint> : null}
    </span>
    {children}
  </div>
);

/** Значения полей формы. Ключи здесь только те, что набраны в этот заход. */
export interface AdminAiDefaultsForm {
  provider: Provider;
  apiKey: string;
  textModel: string;
  imageModel: string;
  monthlyOperations: string;
  searchApiKeys: Partial<Record<KeyedSearchProvider, string>>;
}

/**
 * Что уходит в `POST /admin/ai-defaults`.
 *
 * Пустой ключ не отправляется вовсе: пустое поле — это «оставить сохранённый»,
 * а не «убрать», и убирают отдельной дверью. Пустое число — «не задано здесь»,
 * и его тоже нельзя отправить нулём: ноль означает «включённый режим закрыт» и
 * является настоящим ответом, а не отсутствием ответа.
 */
export const buildAiDefaultsPayload = (form: AdminAiDefaultsForm) => {
  const searchApiKeys = Object.fromEntries(
    KEYED_SEARCH_PROVIDERS.map((engine) => [
      engine,
      (form.searchApiKeys[engine] || '').trim(),
    ]).filter(([, key]) => key)
  );
  const operations = form.monthlyOperations.trim();
  return {
    provider: form.provider,
    ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
    textModel: form.textModel.trim(),
    imageModel: form.imageModel.trim(),
    ...(Object.keys(searchApiKeys).length ? { searchApiKeys } : {}),
    ...(operations && Number.isFinite(Number(operations))
      ? { monthlyOperations: Math.max(0, Math.floor(Number(operations))) }
      : {}),
  };
};

/**
 * Спросить, потом сходить. Отклонённое подтверждение не должно достигать ни
 * сети, ни кэша, а отказ двери не должен отчитываться успехом: это сказало бы
 * суперадмину, что ключа больше нет, пока инстанс продолжает им платить.
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
 * Чистый экран на пропсах — ровно так же, как `AdminUsersView` и
 * `AdminStatsView`: сцену обзора интерфейса можно будет собрать на нём, не
 * поднимая сети.
 */
export function AdminAiDefaultsView({
  allowed,
  locale,
  data,
  loading,
  error,
  form,
  saving,
  clearing,
  onChange,
  onSave,
  onClearModelKey,
  onClearSearchKey,
  onRetry,
}: {
  allowed: boolean;
  locale: 'ru' | 'en';
  data?: AdminAiDefaults;
  loading?: boolean;
  error?: boolean;
  form: AdminAiDefaultsForm;
  saving?: boolean;
  clearing?: 'model' | KeyedSearchProvider | null;
  onChange: (patch: Partial<AdminAiDefaultsForm>) => void;
  onSave: () => void;
  onClearModelKey: () => void;
  onClearSearchKey: (engine: KeyedSearchProvider) => void;
  onRetry: () => void;
}) {
  const t = useT();
  const words = adminAiDefaultsCopy[locale];

  /**
   * Отказ ровно такой же, как у соседних админских экранов: одна рамка, одно
   * предложение и ни одного запроса — контейнер не открывает дверь, пока
   * `allowed` ложно.
   */
  if (!allowed) {
    return (
      <section
        data-production-surface="settings-admin/ai-defaults"
        className="rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[16px] cf-body-md text-cf-warning"
      >
        {t('no_access_to_page', 'You do not have access to this page.')}
      </section>
    );
  }

  const searchKeyField = (engine: KeyedSearchProvider) => {
    const field = words.keys[engine];
    const origin = keyOrigin(
      !!data?.searchKeys?.[engine],
      !!data?.fromEnvironment?.searchKeys?.[engine]
    );
    return (
      <KeyField
        key={engine}
        name={`admin-ai-search-key-${engine}`}
        label={field.label}
        origin={origin}
        originLabel={words.origins[origin]}
        explanation={
          origin === 'screen'
            ? field.storedHere
            : origin === 'environment'
            ? field.fromEnvironment
            : field.absent
        }
        value={form.searchApiKeys[engine] || ''}
        placeholder={
          origin === 'absent'
            ? field.placeholderEmpty
            : field.placeholderReplace
        }
        removeLabel={field.removeKey}
        busy={clearing === engine}
        onChange={(value) =>
          onChange({
            searchApiKeys: { ...form.searchApiKeys, [engine]: value },
          })
        }
        onClear={() => onClearSearchKey(engine)}
      />
    );
  };

  const modelKeyOrigin = keyOrigin(
    !!data?.hasKey,
    !!data?.fromEnvironment?.apiKey
  );

  return (
    <section
      data-production-surface="settings-admin/ai-defaults"
      className="flex flex-col text-cf-ink"
    >
      <PageHeader headingLevel={1} title={words.title} />

      <SettingsSection>
        <p className="cf-body-md text-cf-ink max-w-[70ch] [text-wrap:pretty]">
          {words.intro}
        </p>
        <p className="cf-body-sm text-cf-ink-muted max-w-[70ch] [text-wrap:pretty]">
          {words.ownKeyUntouched}
        </p>
        <p className="cf-body-sm text-cf-ink-muted max-w-[70ch] [text-wrap:pretty]">
          {words.neverShown}
        </p>
        <p
          data-manual-save-note="true"
          className="cf-body-sm text-cf-ink-muted max-w-[70ch] [text-wrap:pretty]"
        >
          {words.manualSave}
        </p>
        {loading && !data ? (
          <p aria-busy={true} className="cf-body-sm text-cf-ink-muted">
            {words.loading}
          </p>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-[8px] cf-body-sm text-cf-danger"
          >
            {words.loadFailed}
            <Button density="dense" onClick={onRetry}>
              {words.retry}
            </Button>
          </div>
        ) : null}
        {data?.updatedAt ? (
          <p className="cf-caption text-cf-ink-muted">
            {words.updatedAt(formatLocalizedDateTime(data.updatedAt))}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title={
          <SectionTitle
            title={words.keys.title}
            hintLabel={words.hintFor(words.keys.title)}
            hint={words.keys.what}
          />
        }
      >
        <KeyField
          name="admin-ai-api-key"
          label={words.keys.model.label}
          origin={modelKeyOrigin}
          originLabel={words.origins[modelKeyOrigin]}
          explanation={
            modelKeyOrigin === 'screen'
              ? words.keys.model.storedHere
              : modelKeyOrigin === 'environment'
              ? words.keys.model.fromEnvironment
              : words.keys.model.absent
          }
          value={form.apiKey}
          placeholder={
            modelKeyOrigin === 'absent'
              ? words.keys.model.placeholderEmpty
              : words.keys.model.placeholderReplace
          }
          removeLabel={words.keys.model.removeKey}
          busy={clearing === 'model'}
          onChange={(value) => onChange({ apiKey: value })}
          onClear={onClearModelKey}
        />

        {KEYED_SEARCH_PROVIDERS.map((engine) => searchKeyField(engine))}

        {/*
          Сказано словами, а не оставлено на догадку: поля OpenRouter здесь
          нет не по недосмотру — своего поискового ключа у него не бывает.
        */}
        <p
          data-openrouter-no-search-key="true"
          className="cf-body-sm text-cf-ink-muted max-w-[70ch] [text-wrap:pretty]"
        >
          {words.keys.openrouterNoKey}
        </p>
      </SettingsSection>

      <SettingsSection title={words.models.title}>
        <LabelledField
          id="admin-ai-provider"
          label={t('provider', 'Provider')}
          hintLabel={words.hintFor(t('provider', 'Provider'))}
          hint={words.models.providerHint}
        >
          <Select
            id="admin-ai-provider"
            label=""
            name="provider"
            value={form.provider}
            disableForm={true}
            hideErrors={true}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              onChange({
                provider:
                  event.target.value === 'openrouter' ? 'openrouter' : 'openai',
              })
            }
          >
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
          </Select>
        </LabelledField>
        {!data?.provider && data?.fromEnvironment?.provider ? (
          <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {words.models.fromEnvironment}
          </p>
        ) : null}

        <Input
          label={t('text_model', 'Text model')}
          name="admin-ai-text-model"
          disableForm={true}
          value={form.textModel}
          placeholder={t('provider_default_model', 'Provider default')}
          helper={
            !data?.textModel && data?.fromEnvironment?.textModel
              ? words.models.fromEnvironment
              : words.models.empty
          }
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onChange({ textModel: event.target.value })
          }
        />

        <Input
          label={t('image_model', 'Image model')}
          name="admin-ai-image-model"
          disableForm={true}
          value={form.imageModel}
          placeholder={t('provider_default_model', 'Provider default')}
          helper={
            !data?.imageModel && data?.fromEnvironment?.imageModel
              ? words.models.fromEnvironment
              : words.models.empty
          }
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onChange({ imageModel: event.target.value })
          }
        />
      </SettingsSection>

      <SettingsSection
        title={
          <SectionTitle
            title={words.allowance.title}
            hintLabel={words.hintFor(words.allowance.title)}
            hint={words.allowance.hint}
          />
        }
      >
        <Input
          label={words.allowance.label}
          name="admin-ai-monthly-operations"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          disableForm={true}
          value={form.monthlyOperations}
          helper={
            <span className="flex flex-col gap-[4px]">
              <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                {words.allowance.what}
              </span>
              {data?.monthlyOperations === null ? (
                <span
                  data-allowance-origin={
                    data?.fromEnvironment?.monthlyOperations
                      ? 'environment'
                      : 'absent'
                  }
                  className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
                >
                  {data?.fromEnvironment?.monthlyOperations
                    ? words.allowance.fromEnvironment
                    : words.allowance.absent}
                </span>
              ) : null}
            </span>
          }
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onChange({ monthlyOperations: event.target.value })
          }
        />
      </SettingsSection>

      {/*
        Автосохранения здесь нет намеренно, и об этом сказано выше строкой:
        каждое поле — либо секрет, либо число, которым платит инстанс.
      */}
      <div className="my-[16px] flex flex-wrap items-center gap-[8px]">
        <Button onClick={onSave} disabled={saving || !data}>
          {t('save', 'Save')}
        </Button>
      </div>
    </section>
  );
}

export const AdminAiDefaultsComponent = () => {
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const { language } = useVariables();
  const locale = resolveAdminAiDefaultsLocale(language);
  const words = adminAiDefaultsCopy[locale];
  const allowed = Boolean(user?.isSuperAdmin);

  /**
   * `null` вместо адреса, пока человек не суперадмин: отказ рисуется, а дверь
   * не открывается вовсе. Запрос всё равно вернул бы 403, но экран, который
   * его делает, — это экран, который считает попытку нормальной.
   */
  const { data, isLoading, error, mutate } = useSWR<AdminAiDefaults>(
    allowed ? '/admin/ai-defaults' : null,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load instance AI defaults');
      return response.json();
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  const [form, setForm] = useState<AdminAiDefaultsForm>({
    provider: 'openai',
    apiKey: '',
    textModel: '',
    imageModel: '',
    monthlyOperations: '',
    searchApiKeys: {},
  });
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState<'model' | KeyedSearchProvider | null>(
    null
  );

  /**
   * Поля ключей не заполняются из ответа никогда — их там и нет. Остальное
   * приходит с сервера, и пустая строка тут значит «не задано здесь», что и
   * есть правда: третье состояние рисует не поле, а строка под ним.
   */
  useEffect(() => {
    if (!data) return;
    setForm((current) => ({
      ...current,
      provider: data.provider || 'openai',
      textModel: data.textModel || '',
      imageModel: data.imageModel || '',
      monthlyOperations:
        data.monthlyOperations === null ? '' : String(data.monthlyOperations),
    }));
  }, [data]);

  const change = useCallback(
    (patch: Partial<AdminAiDefaultsForm>) =>
      setForm((current) => ({ ...current, ...patch })),
    []
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch('/admin/ai-defaults', {
        method: 'POST',
        body: JSON.stringify(buildAiDefaultsPayload(form)),
      });
      if (!response.ok) throw new Error('save failed');
      // Набранные ключи стираются из формы сразу: держать секрет в состоянии
      // экрана дольше, чем длится сохранение, незачем.
      setForm((current) => ({ ...current, apiKey: '', searchApiKeys: {} }));
      await mutate();
      toaster.show(words.saved, 'success');
    } catch {
      toaster.show(words.saveFailed, 'warning');
    } finally {
      setSaving(false);
    }
  }, [form, words]);

  const clearModelKey = useCallback(async () => {
    setClearing('model');
    const outcome = await removeStoredKey({
      endpoint: '/admin/ai-defaults/key',
      confirm: () =>
        deleteDialog(
          words.keys.model.removeKeyConfirm,
          t('ai_key_remove_approve', 'Yes, remove the key'),
          t('ai_key_remove_title', 'Remove the stored key?')
        ),
      request: fetch,
      onRemoved: mutate,
    });
    setClearing(null);
    if (outcome === 'removed') {
      toaster.show(t('ai_key_removed', 'Stored key removed'), 'success');
    } else if (outcome === 'failed') {
      toaster.show(
        t('ai_key_remove_failed', 'Could not remove the stored key'),
        'warning'
      );
    }
  }, [words]);

  /**
   * Движок едет в строке запроса, потому что дверь читает именно её, и то же
   * название стоит в подтверждении: «сохранённый ключ» было честной фразой,
   * пока ключ был один.
   */
  const clearSearchKey = useCallback(
    async (engine: KeyedSearchProvider) => {
      setClearing(engine);
      const outcome = await removeStoredKey({
        endpoint: `/admin/ai-defaults/search-key?provider=${engine}`,
        confirm: () =>
          deleteDialog(
            words.keys[engine].removeKeyConfirm,
            t('search_key_remove_approve', 'Yes, remove the key'),
            t('search_key_remove_title', 'Remove the stored search key?')
          ),
        request: fetch,
        onRemoved: async () => {
          setForm((current) => ({
            ...current,
            searchApiKeys: { ...current.searchApiKeys, [engine]: '' },
          }));
          await mutate();
        },
      });
      setClearing(null);
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
    <AdminAiDefaultsView
      allowed={allowed}
      locale={locale}
      data={data}
      loading={isLoading}
      error={Boolean(error)}
      form={form}
      saving={saving}
      clearing={clearing}
      onChange={change}
      onSave={save}
      onClearModelKey={clearModelKey}
      onClearSearchKey={clearSearchKey}
      onRetry={() => void mutate()}
    />
  );
};

export default AdminAiDefaultsComponent;
