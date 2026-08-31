'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@contentfactory/react/choice/tabs';
import { PlatformAnalytics } from '@contentfactory/frontend/components/platform-analytics/platform.analytics';
import { ProductionAnalytics } from '@contentfactory/frontend/components/platform-analytics/production.analytics';

type AnalyticsView = 'production' | 'audience';

export const AnalyticsScreen = () => {
  const t = useT();
  const [view, setView] = useState<AnalyticsView>('production');

  return (
    <Tabs value={view} onChange={(next) => setView(next as AnalyticsView)}>
      <div className="flex min-h-0 flex-1 flex-col bg-cf-canvas text-cf-ink">
        <header className="border-b border-cf-border bg-cf-surface px-[24px] pt-[22px]">
          <h1 className="text-[24px] font-[650] tracking-[-0.02em]">
            {t('analytics', 'Analytics')}
          </h1>
          <TabList
            className="mt-[16px] flex gap-[24px]"
            aria-label={t('analytics_sections', 'Analytics sections')}
          >
            {(['production', 'audience'] as const).map((item) => (
              <Tab
                key={item}
                value={item}
                className={clsx(
                  'border-b-2 pb-[12px] text-[14px] font-[600] transition-colors',
                  view === item
                    ? 'border-cf-accent text-cf-accent'
                    : 'border-transparent text-cf-ink-muted hover:text-cf-ink'
                )}
              >
                {item === 'production'
                  ? t('production_analytics_tab', 'Production')
                  : t('audience_analytics_tab', 'Audience')}
              </Tab>
            ))}
          </TabList>
        </header>
        {view === 'production' ? (
          <TabPanel value="production" className="flex min-h-0 flex-1 flex-col">
            <ProductionAnalytics />
          </TabPanel>
        ) : (
          <TabPanel value="audience" className="flex min-h-0 flex-1">
            <PlatformAnalytics />
          </TabPanel>
        )}
      </div>
    </Tabs>
  );
};
