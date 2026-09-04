'use client';

import useSWR from 'swr';
import { ContextWrapper } from '@contentfactory/frontend/components/layout/user.context';
import { ReactNode, useCallback } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Toaster } from '@contentfactory/react/toaster/toaster';
import { MantineWrapper } from '@contentfactory/react/helpers/mantine.wrapper';
import { ToolTip } from '@contentfactory/frontend/components/layout/top.tip';

/**
 * Оболочка страницы предпросмотра `/p/[id]` и модалки расширения.
 *
 * Здесь стоял `<CopilotKit>` вокруг всего содержимого, и ни один потребитель
 * помощника под ним не жил: страница предпросмотра только показывает пост.
 * Провайдер `@copilotkit/react-core@1.10.6` при монтировании безусловно шлёт
 * `availableAgents` на `runtimeUrl`, то есть каждое открытие публичной ссылки
 * стоило запроса к рантайму, а у области с настроенным поставщиком моделей —
 * платного вызова. Редактор поста, который модалка расширения открывает,
 * помощника получает от `manage.modal.tsx` — тот поднимает `<CopilotProvider>`
 * сам, и с уходом обёртки отсюда ничего не теряет.
 */
export const PreviewWrapper = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: user } = useSWR('/user/self', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });
  return (
    <ContextWrapper user={user}>
      <MantineWrapper>
        <Toaster />
        <ToolTip />
        {children}
      </MantineWrapper>
    </ContextWrapper>
  );
};
