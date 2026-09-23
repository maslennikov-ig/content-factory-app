'use client';

import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import {
  writingProfileUrl,
  readWritingProfileResponse,
} from '../intake/writing-profile.adapter';

/**
 * Профиль письма канала, как его читает рабочее место заготовки.
 *
 * Одна дверь и один ключ SWR на нужды вкладки канала: предел площадки для
 * счётчика знаков и значения канала для панели настроек поста — «как в
 * канале» и «Сохранить для канала». Отдельного диалога «Как пишем в «X»» на
 * вкладке больше нет (`97dq.70`): те же поля — в самой панели.
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
