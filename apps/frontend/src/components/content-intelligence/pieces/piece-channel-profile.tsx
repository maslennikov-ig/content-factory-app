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

/**
 * Профиль письма канала, как его читает рабочее место заготовки.
 *
 * Одна дверь и один ключ SWR на три нужды вкладки канала: предел площадки
 * для счётчика знаков, профиль для «Запомнить для канала» и сам диалог «Как
 * пишем в «X»». Ключ — адрес двери, поэтому ссылка и контейнер читают
 * профиль одним запросом, а сохранение в диалоге обновляет обоих.
 */
export function useChannelWritingProfile(integrationId: string | null) {
  const request = useFetch();
  const url = integrationId ? writingProfileUrl(integrationId) : null;
  return useSWR(
    url,
    async () => {
      const response = await request(url as string);
      if (!response.ok) throw new Error('writing profile unavailable');
      return readWritingProfileResponse(
        await response.json(),
        integrationId as string
      );
    },
    { revalidateOnFocus: false }
  );
}

/**
 * Ссылка «Как пишем в «канал»» и её диалог.
 *
 * Одно имя на этот объект везде (`97dq.39`, B5): до волны тот же профиль
 * звался «Настройки канала» здесь, «Как пишем» в разделе каналов и «Как пишем
 * сюда» на странице канала — а «Настройки канала» к тому же называли
 * совсем другое место в окне поста. Имя берётся из того же ключа, что и
 * заголовок диалога.
 */
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
  const [open, setOpen] = useState(false);
  const t = intakeCopy[locale];
  const { mutate } = useChannelWritingProfile(id);
  return (
    <>
      <Button
        type="button"
        variant="quiet"
        density="dense"
        className="self-start"
        data-piece-channel-profile={id}
        onClick={() => setOpen(true)}
      >
        <DesignMediaIcon size={16} aria-hidden="true" />
        {t.profileTitle(name)}
      </Button>
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
    </>
  );
}

export default PieceChannelProfile;
