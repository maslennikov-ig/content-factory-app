'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { ErrorState, SkeletonRows } from '../ui/surface';
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
import { useWritingProfileAvatars } from '../content-intelligence/intake/writing-profile.fields';
import { useChannelPlanField } from '../content-intelligence/intake/channel-plan.field';
import { WritingSettingsPanel } from '../content-intelligence/pieces/post-options.panel';

export type ChannelWritingProfileProps = {
  integrationId: string;
  integrationName: string;
  locale: string;
  canWrite: boolean;
  /** Прежний вход «сразу править»: панель теперь всегда открыта. */
  initiallyEditing?: boolean;
  onSaved?: () => void | Promise<void>;
};

const sameProfile = (
  left: ChannelWritingProfileV1 | null,
  right: ChannelWritingProfileV1 | null
) => JSON.stringify(left) === JSON.stringify(right);

/**
 * «Как пишем в «X»» — настройки канала в той же панели, что и настройки
 * поста (`97dq.70`, область `channel`).
 *
 * Панель всегда открыта (владелец на одиннадцатом заходе убрал «Изменить» у
 * поста, на тринадцатом попросил один компонент для обоих): те же поля, тот
 * же порядок, те же «?». Поля текста сохраняются кнопкой «Сохранить»;
 * «План» — сразу при выборе, с вопросом «Только к новым / Ко всем N», если
 * у канала есть написанные посты. Рисуется на странице канала и в окне
 * «Настройки канала», где живёт и «Изменить расписание».
 */
export function ChannelWritingProfile({
  integrationId,
  integrationName,
  locale,
  canWrite,
  onSaved,
}: ChannelWritingProfileProps) {
  const resolvedLocale: IntakeLocale = locale === 'en' ? 'en' : 'ru';
  const t = intakeCopy[resolvedLocale];
  const request = useFetch();
  const url = writingProfileUrl(integrationId);
  const [draft, setDraft] = useState<ChannelWritingProfileV1 | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const readOnlyNoteId = `channel-writing-profile-read-only-${integrationId}`;

  const load = useCallback(async () => {
    const response = await request(url);
    if (!response.ok) throw new Error('writing profile unavailable');
    return readWritingProfileResponse(await response.json(), integrationId);
  }, [integrationId, request, url]);

  const { data, error, isLoading, mutate } = useSWR(url, load, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const avatars = useWritingProfileAvatars();
  const avatarOptions = useMemo(
    () =>
      avatars.map((avatar) => ({
        id: avatar.id,
        label: avatar.name ?? t.profileSpeakerUnnamed,
      })),
    [avatars, t.profileSpeakerUnnamed]
  );
  const plan = useChannelPlanField({
    integrationId,
    locale: resolvedLocale,
    canWrite,
  });

  useEffect(() => {
    if (data) setDraft((current) => current ?? data.profile);
  }, [data]);

  const profile = draft ?? data?.profile ?? null;
  const dirty = Boolean(data && !sameProfile(profile, data.profile));

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
    if (!canWrite || !profile || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const response = await request(url, {
        method: 'PUT',
        body: JSON.stringify(buildWritingProfilePayload(profile)),
      });
      if (!response.ok) throw new Error('writing profile not saved');
      await acceptResponse(response);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [acceptResponse, canWrite, profile, request, saving, url]);

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

  return (
    <div
      data-channel-writing-profile={integrationId}
      data-channel-writing-profile-name={integrationName}
      data-channel-writing-profile-state={
        isLoading && !data
          ? 'loading'
          : error && !data
          ? 'error'
          : canWrite
          ? 'editing'
          : 'view'
      }
      data-channel-writing-profile-stored={String(data?.stored ?? false)}
      className="min-w-0"
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
              {t.retry}
            </Button>
          }
        />
      ) : data && profile ? (
        <WritingSettingsPanel
          scope="channel"
          locale={resolvedLocale}
          title={t.profileTitle(integrationName)}
          profile={profile}
          avatars={avatarOptions}
          disabled={!canWrite || saving}
          describedBy={canWrite ? undefined : readOnlyNoteId}
          onProfileChange={change}
          plan={plan}
          footer={
            <div className="flex min-w-0 flex-col gap-[8px]">
              {!data.stored ? (
                <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                  {t.profileDefaultsBody(data.provider.name)}
                </p>
              ) : null}
              {canWrite ? (
                <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
                  <Button
                    type="button"
                    variant="primary"
                    density="dense"
                    disabled={!dirty && data.stored}
                    loading={saving}
                    loadingLabel={t.profileSaving}
                    data-channel-writing-profile-save="true"
                    onClick={() => void save()}
                  >
                    {t.profileSave}
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    density="dense"
                    disabled={saving || !data.stored}
                    onClick={() => void reset()}
                  >
                    {t.profileReset}
                  </Button>
                </div>
              ) : (
                <p
                  id={readOnlyNoteId}
                  className="cf-caption text-cf-ink-muted [text-wrap:pretty]"
                >
                  {t.readOnlyBody}
                </p>
              )}
              {saveFailed ? <ErrorState title={t.profileSaveFailed} /> : null}
              {saved && !saveFailed ? (
                <p role="status" className="cf-body-sm text-cf-accent">
                  {t.profileSaved}
                </p>
              ) : null}
            </div>
          }
        />
      ) : null}
    </div>
  );
}

export default ChannelWritingProfile;
