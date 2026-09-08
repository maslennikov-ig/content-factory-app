'use client';

import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { Dialog } from '../../ui/layers';
import { ErrorState, SkeletonRows } from '../../ui/surface';
import { ContentReadOnlyNote } from '../content-write-right';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import { WritingProfileFields } from './writing-profile.fields';
import {
  buildWritingProfilePayload,
  readWritingProfileResponse,
  writingProfileUrl,
  type ChannelWritingProfileV1,
} from './writing-profile.adapter';

/**
 * «Как пишем в «X»» — то, что продукт знает о канале, в одном месте.
 *
 * Решение владельца 06.09.2026 (пункт 5). До неё знание о канале не доходило
 * до генератора вовсе: длина бралась из провайдера, эмодзи и призыв — ниоткуда.
 * Карточка не заводит третью таблицу настроек: она правит одну колонку
 * `Integration.writingProfile`, а лимит знаков по-прежнему принадлежит
 * провайдеру и здесь только показан.
 *
 * Права: правит редактор и администратор, участник читает. Роль читается из
 * сессии до отрисовки — тем же `writeRightFromRole`, что и остальные экраны
 * раздела, — потому что заполнить шесть полей и узнать про 403 после
 * «Сохранить» это ровно тот дефект, который здесь уже чинили однажды.
 *
 * Диалог, а не отдельная страница: карточка открывается из строки канала
 * рядом с выбором «Куда», человек не уходит с экрана и возвращается к своему
 * тексту нажатием Escape.
 */

export function WritingProfileCard({
  locale,
  integrationId,
  integrationName,
  canWrite,
  open,
  onClose,
}: {
  locale: IntakeLocale;
  integrationId: string;
  integrationName: string;
  canWrite: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const t = intakeCopy[locale];
  const request = useFetch();
  const url = writingProfileUrl(integrationId);
  const readOnlyNoteId = `writing-profile-read-only-${integrationId}`;

  const load = useCallback(async () => {
    const response = await request(url);
    if (!response.ok) throw new Error('writing profile unavailable');
    return readWritingProfileResponse(await response.json(), integrationId);
  }, [integrationId, request, url]);

  // Ключ `null`, пока диалог закрыт: карточка канала, которую никто не
  // открывал, не стоит запроса — тот же договор SWR, что у проверки ИИ.
  const { data, error, isLoading, mutate } = useSWR(open ? url : null, load, {
    revalidateOnFocus: false,
  });

  const [draft, setDraft] = useState<ChannelWritingProfileV1 | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (data) setDraft(data.profile);
  }, [data]);

  const profile = draft ?? data?.profile ?? null;

  const change = useCallback((patch: Partial<ChannelWritingProfileV1>) => {
    setSaved(false);
    setSaveFailed(false);
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const save = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const response = await request(url, {
        method: 'PUT',
        body: JSON.stringify(buildWritingProfilePayload(profile)),
      });
      if (!response.ok) throw new Error('writing profile not saved');
      setSaved(true);
      await mutate();
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [mutate, profile, request, url]);

  const reset = useCallback(async () => {
    setSaving(true);
    setSaveFailed(false);
    try {
      const response = await request(url, { method: 'DELETE' });
      if (!response.ok) throw new Error('writing profile not reset');
      setDraft(null);
      setSaved(true);
      await mutate();
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }, [mutate, request, url]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.profileTitle(integrationName)}
      footer={
        <>
          <Button type="button" variant="quiet" onClick={onClose}>
            {t.profileClose}
          </Button>
          {canWrite && (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={saving || !data?.stored}
                onClick={() => void reset()}
              >
                {t.profileReset}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={saving || !profile}
                onClick={() => void save()}
              >
                {saving ? t.profileSaving : t.profileSave}
              </Button>
            </>
          )}
        </>
      }
    >
      <div
        data-writing-profile={integrationId}
        data-writing-profile-stored={String(data?.stored ?? false)}
        className="flex min-w-0 flex-col gap-[12px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
      >
        {isLoading && !data ? (
          <SkeletonRows rows={4} label={t.profileLoading} />
        ) : error && !data ? (
          <ErrorState
            title={t.profileFailed}
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => void mutate()}
              >
                {t.slopRetry}
              </Button>
            }
          />
        ) : (
          <>
            {!canWrite && (
              <ContentReadOnlyNote
                id={readOnlyNoteId}
                surface="brief"
                refusal="role"
              >
                {t.readOnlyBody}
              </ContentReadOnlyNote>
            )}
            {data && !data.stored && (
              <p className="max-w-[64ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.profileDefaultsCaption}
              </p>
            )}
            {profile ? (
              <WritingProfileFields
                locale={locale}
                profile={profile}
                disabled={!canWrite}
                describedBy={canWrite ? undefined : readOnlyNoteId}
                onChange={change}
              />
            ) : null}

            {saveFailed && <ErrorState title={t.profileSaveFailed} />}
            {saved && !saveFailed && (
              <p role="status" className="cf-body-sm text-cf-accent">
                {t.profileSaved}
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

export default WritingProfileCard;
