'use client';
import { useEffect } from 'react';
import { orderBy } from 'lodash';
import { CalendarWeekProvider } from './calendar.context';
import { Filters } from './filters';
import { Calendar } from './calendar';
import { DNDProvider } from './helpers/dnd.provider';
import { useIntegrationList } from './helpers/use.integration.list';
import { ErrorState, SkeletonRows } from '../ui/surface';
import { Button } from '@contentfactory/react/form/button';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useSearchParams } from 'next/navigation';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { Onboarding } from '../onboarding/onboarding';

/** Shared selection marker used by the tools outside the calendar. */
export const SVGLine = () => (
  <span
    aria-hidden
    className="block w-[4px] h-full min-h-[24px] rounded-s-[3px] bg-cf-accent"
  />
);

export const LaunchesComponent = () => {
  const { language } = useVariables();
  const t = useT();
  const search = useSearchParams();
  const toast = useToaster();
  const { isLoading, error, data: integrations, mutate } = useIntegrationList();
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (search.get('msg')) {
      toast.show(search.get('msg')!, 'success');
      window?.opener?.postMessage(
        {
          msg: search.get('msg')!,
          success: false,
        },
        '*'
      );
    }
    if (search.get('added')) {
      window?.opener?.postMessage(
        {
          msg: t('channel_added', 'Channel added'),
          success: true,
        },
        '*'
      );
    }
    if (window.opener) {
      window.close();
    }
  }, []);

  if (error)
    return (
      <div className="flex-1 bg-cf-canvas p-[20px]">
        <ErrorState
          title={
            language.startsWith('ru')
              ? 'Не удалось загрузить каналы'
              : 'Could not load channels'
          }
          action={
            <Button variant="secondary" onClick={() => mutate()}>
              {t('try_again', 'Try Again')}
            </Button>
          }
        />
      </div>
    );
  if (isLoading)
    return (
      <div className="flex-1 bg-cf-canvas p-[20px]">
        <SkeletonRows rows={6} label={t('loading', 'Loading')} />
      </div>
    );
  return (
    <DNDProvider>
      <Onboarding />
      <CalendarWeekProvider
        integrations={orderBy(
          integrations || [],
          ['type', 'disabled', 'identifier'],
          ['desc', 'asc', 'asc']
        )}
      >
        <div className="bg-cf-canvas flex-1 min-w-0 flex-col flex p-[20px] gap-[16px] overflow-auto">
          <Filters />
          <div className="flex-1 min-w-0 flex">
            <Calendar />
          </div>
        </div>
      </CalendarWeekProvider>
    </DNDProvider>
  );
};
