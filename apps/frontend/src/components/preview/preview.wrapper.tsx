'use client';

import useSWR from 'swr';
import { ContextWrapper } from '@contentfactory/frontend/components/layout/user.context';
import { ReactNode, useCallback } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Toaster } from '@contentfactory/react/toaster/toaster';
import { MantineWrapper } from '@contentfactory/react/helpers/mantine.wrapper';
import { ToolTip } from '@contentfactory/frontend/components/layout/top.tip';

/**
 * Оболочка страницы предпросмотра `/p/[id]` и модалки расширения: только
 * пользователь, всплывающие подсказки и уведомления. `<CopilotKit>`, который
 * стоял здесь раньше, ушёл вместе с библиотекой (`content-factory-next-kcxz.28`).
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
