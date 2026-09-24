'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Tab, TabList, Tabs } from '@contentfactory/react/choice/tabs';
import {
  SECTION_TAB_LIST_CLASS,
  SectionTabPanel,
  sectionTabClass,
} from '@contentfactory/frontend/components/ui/section-tabs';
import { PlatformAnalytics } from '@contentfactory/frontend/components/platform-analytics/platform.analytics';
import { ProductionAnalytics } from '@contentfactory/frontend/components/platform-analytics/production.analytics';

type AnalyticsView = 'production' | 'audience';

export const AnalyticsScreen = () => {
  const t = useT();
  const [view, setView] = useState<AnalyticsView>('production');

  return (
    <Tabs value={view} onChange={(next) => setView(next as AnalyticsView)}>
      <div className="flex min-h-0 flex-1 flex-col bg-cf-canvas text-cf-ink">
        {/*
          The section's tab strip is the content section's (`ui/section-tabs`,
          `97dq.76`, audit §2.4): same gutter, same underline, same motion.
        */}
        <header className="border-b border-cf-border bg-cf-surface px-[20px] pt-[20px] md:px-[24px]">
          <TabList
            className={SECTION_TAB_LIST_CLASS}
            aria-label={t('analytics_sections', 'Analytics sections')}
          >
            {(['production', 'audience'] as const).map((item) => (
              <Tab
                key={item}
                value={item}
                className={sectionTabClass(view === item)}
              >
                {item === 'production'
                  ? t('production_analytics_tab', 'Production')
                  : t('audience_analytics_tab', 'Audience')}
              </Tab>
            ))}
          </TabList>
        </header>
        <SectionTabPanel
          value={view}
          className={clsx(
            'flex min-h-0 flex-1',
            view === 'production' && 'flex-col'
          )}
        >
          {view === 'production' ? <ProductionAnalytics /> : <PlatformAnalytics />}
        </SectionTabPanel>
      </div>
    </Tabs>
  );
};
