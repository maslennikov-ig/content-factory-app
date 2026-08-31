'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@contentfactory/react/choice/tabs';

export type SettingsSurfaceTab = Readonly<{ value: string; label: string }>;

export function SettingsSurface({
  tabs,
  value,
  onChange,
  navigationFooter,
  children,
}: {
  tabs: readonly SettingsSurfaceTab[];
  value: string;
  onChange: (value: string) => void;
  navigationFooter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tabs value={value} onChange={onChange}>
      <div
        data-production-surface="settings-admin/settings"
        className="flex min-h-0 w-full flex-1 flex-col bg-cf-canvas text-cf-ink md:flex-row"
      >
        <nav
          aria-label="Settings"
          className="flex w-full shrink-0 flex-col border-b border-cf-border bg-cf-surface p-[16px] md:w-[240px] md:border-b-0 md:border-e"
        >
          <TabList
            orientation="vertical"
            aria-label="Settings sections"
            className="flex flex-1 flex-col gap-[4px]"
          >
            {tabs.map((tab) => (
              <Tab
                key={tab.value}
                value={tab.value}
                className={clsx(
                  'cf-control-h w-full rounded-[8px] px-[12px] text-start cf-label-md transition-colors duration-state',
                  value === tab.value
                    ? 'bg-cf-accent-soft text-cf-accent'
                    : 'text-cf-ink-muted hover:bg-cf-surface-subtle hover:text-cf-ink'
                )}
              >
                <span className="block truncate">{tab.label}</span>
              </Tab>
            ))}
          </TabList>
          {navigationFooter}
        </nav>
        <TabPanel
          value={value}
          className="flex min-w-0 flex-1 flex-col gap-[16px] overflow-auto bg-cf-canvas p-[20px]"
        >
          {children}
        </TabPanel>
      </div>
    </Tabs>
  );
}
