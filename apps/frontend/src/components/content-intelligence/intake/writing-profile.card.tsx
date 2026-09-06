'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Dialog } from '../../ui/layers';
import { ErrorState, SkeletonRows } from '../../ui/surface';
import { ContentReadOnlyNote } from '../content-write-right';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import {
  CTA_KINDS,
  EMOJI_LEVELS,
  FORMAT_PREFERENCES,
  HASHTAG_POLICIES,
  LENGTH_PRESETS,
  LENGTH_PRESET_ORDER,
  LINK_POLICIES,
  PROFILE_NOTES_MAX,
  buildWritingProfilePayload,
  lengthPresetOf,
  readWritingProfileResponse,
  writingProfileUrl,
  type ChannelWritingProfileV1,
  type LengthPreset,
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

  const preset: LengthPreset = useMemo(
    () => (profile ? lengthPresetOf(profile.lengthPolicy) : 'ideal'),
    [profile]
  );

  const change = useCallback(
    (patch: Partial<ChannelWritingProfileV1>) => {
      setSaved(false);
      setSaveFailed(false);
      setDraft((current) => (current ? { ...current, ...patch } : current));
    },
    []
  );

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

  const lengthLabel: Record<LengthPreset, string> = {
    short: t.profileLengthShort,
    ideal: t.profileLengthIdeal,
    long: t.profileLengthLong,
    max: t.profileLengthMax,
  };
  const emojiLabel = {
    none: t.profileEmojiNone,
    few: t.profileEmojiFew,
    free: t.profileEmojiFree,
  } as const;
  const linkLabel = {
    none: t.profileLinkNone,
    end: t.profileLinkEnd,
    inline: t.profileLinkInline,
  } as const;
  const hashtagLabel = {
    none: t.profileHashtagNone,
    end_1_3: t.profileHashtagEnd,
    free: t.profileHashtagFree,
  } as const;
  const ctaLabel = {
    none: t.profileCtaNone,
    question: t.profileCtaQuestion,
    comment: t.profileCtaComment,
    link: t.profileCtaLink,
    subscribe: t.profileCtaSubscribe,
    reply: t.profileCtaReply,
  } as const;
  const formatLabel = {
    auto: t.formatAuto,
    opinion: t.formatOpinion,
    announcement: t.formatAnnouncement,
    list: t.formatList,
    expert: t.formatExpert,
    case: t.formatCase,
    story: t.formatStory,
  } as const;

  const notes = profile?.notes ?? '';

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
              <Button type="button" variant="secondary" onClick={() => void mutate()}>
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
            <fieldset
              disabled={!canWrite}
              aria-describedby={canWrite ? undefined : readOnlyNoteId}
              className="contents min-w-0"
            >
              <Select
                standalone
                name="writing-profile-length"
                aria-label={t.profileLength}
                value={preset}
                onChange={(event) =>
                  change({
                    lengthPolicy:
                      LENGTH_PRESETS[event.target.value as LengthPreset],
                  })
                }
              >
                {LENGTH_PRESET_ORDER.map((option) => (
                  <option key={option} value={option}>
                    {`${t.profileLength}: ${lengthLabel[option]}`}
                  </option>
                ))}
              </Select>

              <Select
                standalone
                name="writing-profile-emoji"
                aria-label={t.profileEmoji}
                value={profile?.emojiLevel ?? 'few'}
                onChange={(event) =>
                  change({
                    emojiLevel: event.target
                      .value as ChannelWritingProfileV1['emojiLevel'],
                  })
                }
              >
                {EMOJI_LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {`${t.profileEmoji}: ${emojiLabel[option]}`}
                  </option>
                ))}
              </Select>

              <Select
                standalone
                name="writing-profile-link"
                aria-label={t.profileLink}
                value={profile?.linkPolicy ?? 'end'}
                onChange={(event) =>
                  change({
                    linkPolicy: event.target
                      .value as ChannelWritingProfileV1['linkPolicy'],
                  })
                }
              >
                {LINK_POLICIES.map((option) => (
                  <option key={option} value={option}>
                    {`${t.profileLink}: ${linkLabel[option]}`}
                  </option>
                ))}
              </Select>

              <Select
                standalone
                name="writing-profile-hashtag"
                aria-label={t.profileHashtag}
                value={profile?.hashtagPolicy ?? 'none'}
                onChange={(event) =>
                  change({
                    hashtagPolicy: event.target
                      .value as ChannelWritingProfileV1['hashtagPolicy'],
                  })
                }
              >
                {HASHTAG_POLICIES.map((option) => (
                  <option key={option} value={option}>
                    {`${t.profileHashtag}: ${hashtagLabel[option]}`}
                  </option>
                ))}
              </Select>

              <Select
                standalone
                name="writing-profile-cta"
                aria-label={t.profileCta}
                value={profile?.ctaKind ?? 'question'}
                onChange={(event) =>
                  change({
                    ctaKind: event.target
                      .value as ChannelWritingProfileV1['ctaKind'],
                  })
                }
              >
                {CTA_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {`${t.profileCta}: ${ctaLabel[option]}`}
                  </option>
                ))}
              </Select>

              <Select
                standalone
                name="writing-profile-format"
                aria-label={t.profileFormat}
                value={profile?.formatPreference ?? 'auto'}
                onChange={(event) =>
                  change({
                    formatPreference: event.target
                      .value as ChannelWritingProfileV1['formatPreference'],
                  })
                }
              >
                {FORMAT_PREFERENCES.map((option) => (
                  <option key={option} value={option}>
                    {`${t.profileFormat}: ${formatLabel[option]}`}
                  </option>
                ))}
              </Select>

              <div className="flex min-w-0 flex-col gap-[4px]">
                <p className="cf-label-sm uppercase text-cf-ink-muted">
                  {t.profileNotes}
                </p>
                <Textarea
                  standalone
                  layout="content"
                  name="writing-profile-notes"
                  aria-label={t.profileNotes}
                  maxLength={PROFILE_NOTES_MAX}
                  className="w-full"
                  value={notes}
                  onChange={(event) =>
                    change({ notes: event.target.value.slice(0, PROFILE_NOTES_MAX) })
                  }
                />
                <p className="cf-caption text-cf-ink-muted">
                  {`${t.profileNotesHint} ${t.profileNotesCount(
                    notes.length,
                    PROFILE_NOTES_MAX
                  )}`}
                </p>
              </div>
            </fieldset>

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
