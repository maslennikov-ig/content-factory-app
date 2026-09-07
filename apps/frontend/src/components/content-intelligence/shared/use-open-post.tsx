'use client';

import { useCallback } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useIntegrationList } from '../../launches/helpers/use.integration.list';
import type { Integrations } from '../../launches/calendar.context';
import { useOpenPostEditor } from '../../new-launch/compose.modal';
import { postEndpoint } from '../../brand-voice/voice-materials.adapter';

/**
 * Одна дверь в окно поста по его идентификатору.
 *
 * Клетка таблицы заготовок и вход одной мыслью знают только `postId`, а окно
 * поста открывается по группе. Здесь пост читается один раз ради его группы,
 * дальше — `useOpenPostEditor` из `compose.modal.ts`: те же флаги, тот же
 * запрос группы, то же сужение каналов и тот же контекст, что у календаря и
 * «Чистого листа». Своих флагов у этой двери нет и быть не должно: второй их
 * набор — это способ, каким два окна расходятся.
 */

export type OpenPost = (postId: string) => Promise<boolean>;

export function useOpenPost(given?: readonly Integrations[]): OpenPost {
  const request = useFetch();
  const openPostEditor = useOpenPostEditor();
  const { data: fetched } = useIntegrationList();
  const channels: readonly Integrations[] = given ?? fetched ?? [];

  return useCallback(
    async (postId: string) => {
      try {
        const response = await request(postEndpoint(postId));
        if (!response.ok) throw new Error('post unavailable');
        const existing = (await response.json()) as { group?: string };
        if (!existing?.group) throw new Error('post without group');
        await openPostEditor({
          group: existing.group,
          integrations: channels.slice(0) as Integrations[],
          mutate: () => undefined,
        });
        return true;
      } catch {
        return false;
      }
    },
    [channels, openPostEditor, request]
  );
}

export default useOpenPost;
