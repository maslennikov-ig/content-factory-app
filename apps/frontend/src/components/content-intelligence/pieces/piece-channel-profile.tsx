'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { DesignMediaIcon } from '@contentfactory/frontend/components/ui/icons';
import { WritingProfileCard } from '../intake/writing-profile.card';
import {
  writingProfileUrl,
  readWritingProfileResponse,
} from '../intake/writing-profile.adapter';
import { intakeCopy, type IntakeLocale } from '../intake/intake.copy';

/** Карточка выбранного канала рядом с адаптацией; правит существующий диалог. */
export function PieceChannelProfile({
  locale,
  id,
  name,
  canWrite,
}: {
  locale: IntakeLocale;
  id: string;
  name: string;
  canWrite: boolean;
}) {
  const request = useFetch();
  const [open, setOpen] = useState(false);
  const t = intakeCopy[locale];
  const url = writingProfileUrl(id);
  const { data, error, mutate } = useSWR(
    url,
    async () => {
      const response = await request(url);
      if (!response.ok) throw new Error('writing profile unavailable');
      return readWritingProfileResponse(await response.json(), id);
    },
    { revalidateOnFocus: false }
  );
  const profile = data?.profile;
  const emoji =
    profile?.emojiLevel === 'none'
      ? t.profileEmojiNone
      : profile?.emojiLevel === 'few'
      ? t.profileEmojiFew
      : t.profileEmojiFree;
  const cta = profile
    ? {
        none: t.profileCtaNone,
        question: t.profileCtaQuestion,
        comment: t.profileCtaComment,
        link: t.profileCtaLink,
        subscribe: t.profileCtaSubscribe,
        reply: t.profileCtaReply,
      }[profile.ctaKind]
    : '';
  return (
    <div className="flex min-w-0 flex-col gap-[4px]">
      <span className="cf-body-sm text-cf-ink">{name}</span>
      <div className="flex flex-wrap items-center gap-[8px] cf-caption text-cf-ink-muted">
        <span>
          {profile
            ? `${
                data?.stored
                  ? ''
                  : locale === 'ru'
                  ? 'по умолчанию · '
                  : 'defaults · '
              }${
                profile.lengthPolicy === 'provider_max'
                  ? locale === 'ru'
                    ? 'лимит площадки'
                    : 'platform limit'
                  : `${profile.lengthPolicy.idealMin}–${profile.lengthPolicy.idealMax}`
              } · ${emoji} · ${cta}`
            : error
            ? t.profileFailed
            : t.profileLoading}
        </span>
        <Button
          type="button"
          variant="secondary"
          density="dense"
          onClick={() => setOpen(true)}
        >
          {canWrite ? <DesignMediaIcon size={16} aria-hidden="true" /> : null}
          {locale === 'ru'
            ? canWrite
              ? 'Настройки канала'
              : 'Как пишем'
            : canWrite
              ? 'Channel settings'
              : 'Writing settings'}
        </Button>
        {error ? (
          <Button
            type="button"
            variant="quiet"
            density="dense"
            onClick={() => void mutate()}
          >
            {locale === 'ru' ? 'Повторить' : 'Retry'}
          </Button>
        ) : null}
      </div>
      {open ? (
        <WritingProfileCard
          locale={locale}
          integrationId={id}
          integrationName={name}
          canWrite={canWrite}
          open
          onClose={() => {
            setOpen(false);
            void mutate();
          }}
        />
      ) : null}
    </div>
  );
}
