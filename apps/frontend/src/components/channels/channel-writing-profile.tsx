'use client';

import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { ErrorState, Panel, SkeletonRows } from '../ui/surface';
import {
  intakeCopy,
  type IntakeLocale,
} from '../content-intelligence/intake/intake.copy';
import {
  buildWritingProfilePayload,
  readWritingProfileResponse,
  writingProfileUrl,
  type ChannelWritingProfileV1,
} from '../content-intelligence/intake/writing-profile.adapter';
import {
  WritingProfileFields,
  writingProfileViewRows,
} from '../content-intelligence/intake/writing-profile.fields';

export type ChannelWritingProfileProps = {
  integrationId: string;
  integrationName: string;
  locale: string;
  canWrite: boolean;
  initiallyEditing?: boolean;
  onSaved?: () => void | Promise<void>;
};

const panelCopy = {
  ru: {
    title: 'Как пишем сюда',
    change: 'Изменить',
    fill: 'Заполнить',
    cancel: 'Отмена',
    retry: 'Повторить',
    defaults: (provider: string) =>
      `Карточка не заполнена: модель пишет по умолчаниям для ${
        provider || 'площадки'
      }. Проверьте их — это три минуты, и каждая адаптация станет точнее.`,
  },
  en: {
    title: 'How we write here',
    change: 'Edit',
    fill: 'Fill in',
    cancel: 'Cancel',
    retry: 'Retry',
    defaults: (provider: string) =>
      `This card is not filled in: the model uses the defaults for ${
        provider || 'this platform'
      }. Review them once so every adaptation is more accurate.`,
  },
} as const;

export function ChannelWritingProfile({
  integrationId,
  integrationName,
  locale,
  canWrite,
  initiallyEditing = false,
  onSaved,
}: ChannelWritingProfileProps) {
  const resolvedLocale: IntakeLocale = locale === 'en' ? 'en' : 'ru';
  const t = intakeCopy[resolvedLocale];
  const copy = panelCopy[resolvedLocale];
  const request = useFetch();
  const url = writingProfileUrl(integrationId);
  const [editing, setEditing] = useState(canWrite && initiallyEditing);
  const [draft, setDraft] = useState<ChannelWritingProfileV1 | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const load = useCallback(async () => {
    const response = await request(url);
    if (!response.ok) throw new Error('writing profile unavailable');
    return readWritingProfileResponse(await response.json(), integrationId);
  }, [integrationId, request, url]);

  const { data, error, isLoading, mutate } = useSWR(url, load, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (data) {
      setDraft((current) => (editing && current ? current : data.profile));
    }
  }, [data, editing]);

  const beginEditing = useCallback(() => {
    if (!canWrite || !data) return;
    setDraft(data.profile);
    setSaved(false);
    setSaveFailed(false);
    setEditing(true);
  }, [canWrite, data]);

  const cancelEditing = useCallback(() => {
    setDraft(data?.profile ?? null);
    setSaveFailed(false);
    setEditing(false);
  }, [data]);

  const change = useCallback((patch: Partial<ChannelWritingProfileV1>) => {
    setSaved(false);
    setSaveFailed(false);
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const acceptResponse = useCallback(
    async (response: Response) => {
      const next = readWritingProfileResponse(
        await response.json(),
        integrationId
      );
      setDraft(next.profile);
      await mutate(next, { revalidate: false });
      setEditing(false);
      setSaved(true);
      try {
        await onSaved?.();
      } catch {
        // The profile itself is already saved. A parent-list refresh may retry
        // independently without turning this successful write into an error.
      }
    },
    [integrationId, mutate, onSaved]
  );

  const save = useCallback(async () => {
    if (!canWrite || !draft || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const response = await request(url, {
        method: 'PUT',
        body: JSON.stringify(buildWritingProfilePayload(draft)),
      });
      if (!response.ok) throw new Error('writing profile not saved');
      await acceptResponse(response);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [acceptResponse, canWrite, draft, request, saving, url]);

  const reset = useCallback(async () => {
    if (!canWrite || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const response = await request(url, { method: 'DELETE' });
      if (!response.ok) throw new Error('writing profile not reset');
      await acceptResponse(response);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [acceptResponse, canWrite, request, saving, url]);

  const actions = editing ? (
    <>
      <Button
        type="button"
        variant="quiet"
        density="dense"
        disabled={saving}
        onClick={cancelEditing}
      >
        {copy.cancel}
      </Button>
      <Button
        type="button"
        variant="primary"
        density="dense"
        disabled={saving || !draft}
        onClick={() => void save()}
      >
        {saving ? t.profileSaving : t.profileSave}
      </Button>
    </>
  ) : canWrite && data ? (
    <Button
      type="button"
      variant="secondary"
      density="dense"
      onClick={beginEditing}
    >
      {data.stored ? copy.change : copy.fill}
    </Button>
  ) : undefined;

  return (
    <Panel
      title={copy.title}
      actions={actions}
      contentClassName="flex min-w-0 flex-col gap-[16px]"
    >
      <div
        data-channel-writing-profile={integrationId}
        data-channel-writing-profile-name={integrationName}
        data-channel-writing-profile-state={
          isLoading && !data
            ? 'loading'
            : error && !data
            ? 'error'
            : editing
            ? 'editing'
            : 'view'
        }
        data-channel-writing-profile-stored={String(data?.stored ?? false)}
      >
        {isLoading && !data ? (
          <SkeletonRows
            rows={4}
            label={`${t.profileLoading}: ${integrationName}`}
          />
        ) : error && !data ? (
          <ErrorState
            title={t.profileFailed}
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => void mutate()}
              >
                {copy.retry}
              </Button>
            }
          />
        ) : data ? (
          <div className="flex min-w-0 flex-col gap-[16px]">
            {!data.stored && !editing ? (
              <div className="flex flex-wrap items-center gap-[8px] rounded-[8px] border border-cf-warning bg-cf-warning-soft px-[12px] py-[12px]">
                <p className="min-w-[220px] flex-1 cf-body-sm text-cf-ink [text-wrap:pretty]">
                  {copy.defaults(data.provider.name)}
                </p>
                {canWrite ? (
                  <Button
                    type="button"
                    variant="quiet"
                    density="dense"
                    onClick={beginEditing}
                  >
                    {copy.fill}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {editing && draft ? (
              <>
                <WritingProfileFields
                  locale={resolvedLocale}
                  profile={draft}
                  onChange={change}
                />
                <div className="flex flex-wrap items-center gap-[8px]">
                  <Button
                    type="button"
                    variant="quiet"
                    density="dense"
                    disabled={saving || !data.stored}
                    onClick={() => void reset()}
                  >
                    {t.profileReset}
                  </Button>
                  {!data.stored ? (
                    <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                      {t.profileDefaultsCaption}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <dl className="grid min-w-0 grid-cols-1 gap-x-[16px] gap-y-[12px] sm:grid-cols-[160px_minmax(0,1fr)]">
                {writingProfileViewRows(resolvedLocale, data.profile).map(
                  (row) => (
                    <div key={row.key} className="contents">
                      <dt className="cf-label-sm uppercase text-cf-ink-muted">
                        {row.key}
                      </dt>
                      <dd className="min-w-0 cf-body-sm text-cf-ink [overflow-wrap:anywhere]">
                        {row.value}
                      </dd>
                    </div>
                  )
                )}
              </dl>
            )}

            {saveFailed ? <ErrorState title={t.profileSaveFailed} /> : null}
            {saved && !saveFailed ? (
              <p role="status" className="cf-body-sm text-cf-accent">
                {t.profileSaved}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export default ChannelWritingProfile;
