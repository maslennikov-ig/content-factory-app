'use client';

import React, { ReactNode, useCallback, useState } from 'react';
import { appSans } from '@contentfactory/frontend/styles/fonts';
const ModeComponent = dynamic(
  () => import('@contentfactory/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckPayment } from '@contentfactory/frontend/components/layout/check.payment';
import { ToolTip } from '@contentfactory/frontend/components/layout/top.tip';
import { ShowMediaBoxModal } from '@contentfactory/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@contentfactory/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@contentfactory/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@contentfactory/react/toaster/toaster';
import { ShowPostSelector } from '@contentfactory/frontend/components/post-url-selector/post.url.selector';
import { Support } from '@contentfactory/frontend/components/layout/support';
import { ContinueProvider } from '@contentfactory/frontend/components/layout/continue.provider';
import { ContextWrapper } from '@contentfactory/frontend/components/layout/user.context';
import { CopilotKit } from '@copilotkit/react-core';
import { MantineWrapper } from '@contentfactory/react/helpers/mantine.wrapper';
import {
  AdminBarToggle,
  Impersonate,
} from '@contentfactory/frontend/components/layout/impersonate';
import { AnnouncementBanner } from '@contentfactory/frontend/components/layout/announcement.banner';
import { Title } from '@contentfactory/frontend/components/layout/title';
import { LanguageComponent } from '@contentfactory/frontend/components/layout/language.component';
import { ChromeExtensionComponent } from '@contentfactory/frontend/components/layout/chrome.extension.component';
import NotificationComponent from '@contentfactory/frontend/components/notifications/notification.component';
import { OrganizationSelector } from '@contentfactory/frontend/components/layout/organization.selector';
import { StreakComponent } from '@contentfactory/frontend/components/layout/streak.component';
import { PreConditionComponent } from '@contentfactory/frontend/components/layout/pre-condition.component';
import { FirstBillingComponent } from '@contentfactory/frontend/components/billing/first.billing.component';
import { Sidebar } from '@contentfactory/frontend/components/new-layout/sidebar';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Button } from '@contentfactory/react/form/button';

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
    <path
      d="M3 5h14M3 10h14M3 15h14"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();
  const t = useT();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { backendUrl, billingEnabled, isGeneral } = useVariables();

  const searchParams = useSearchParams();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: user, mutate } = useSWR('/user/self', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  if (!user) return null;

  return (
    <ContextWrapper user={user}>
      <CopilotKit
        credentials="include"
        runtimeUrl={backendUrl + '/copilot/chat'}
        showDevConsole={false}
      >
        <MantineWrapper>
          <ToolTip />
          <Toaster />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            <ShowMediaBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <ContinueProvider />
            <div
              className={clsx(
                'flex flex-col min-h-screen bg-cf-canvas text-cf-ink',
                appSans.className
              )}
            >
              <a
                href="#cf-main"
                className="sr-only focus:not-sr-only focus:absolute focus:z-[1000] focus:m-[8px] focus:rounded-[8px] focus:bg-cf-surface focus:px-[12px] focus:py-[8px] focus:text-[14px] focus:font-[600] focus:text-cf-ink focus:border focus:border-cf-border-control"
              >
                {t('skip_to_content', 'Skip to content')}
              </a>

              {user?.admin ? <Impersonate /> : null}

              {user.tier === 'FREE' && isGeneral && billingEnabled ? (
                <FirstBillingComponent />
              ) : (
                <>
                  <AnnouncementBanner />
                  <div className="flex-1 flex min-h-0">
                    <Sidebar
                      mobileOpen={mobileNavOpen}
                      onCloseMobile={closeMobileNav}
                    />

                    <div className="flex-1 flex flex-col min-w-0 blurMe">
                      <header className="h-[56px] shrink-0 flex items-center gap-[8px] px-[12px] md:px-[20px] bg-cf-surface border-b border-cf-border">
                        <Button
                          iconOnly
                          variant="quiet"
                          type="button"
                          onClick={() => setMobileNavOpen(true)}
                          aria-label={t('open_navigation', 'Open navigation')}
                          aria-expanded={mobileNavOpen}
                          className="md:hidden shrink-0 rounded-[8px] flex items-center justify-center transition-colors duration-state"
                        >
                          <MenuIcon />
                        </Button>

                        <div className="flex-1 min-w-0 text-[18px] font-[650] tracking-[-0.015em] truncate">
                          <Title />
                        </div>

                        <div className="flex items-center gap-[4px] text-cf-ink-muted">
                          <StreakComponent />
                          <OrganizationSelector />
                          {/* Панель администратора живёт здесь значком, а не
                              строкой над содержимым: см. `AdminBarToggle`. */}
                          {user?.admin ? <AdminBarToggle /> : null}
                          <ModeComponent />
                          <LanguageComponent />
                          <ChromeExtensionComponent />
                          <NotificationComponent />
                        </div>
                      </header>

                      {/* Row direction: working surfaces place their own
                          secondary rail beside the main content. */}
                      <main
                        id="cf-main"
                        className="flex-1 min-w-0 min-h-0 flex flex-col md:flex-row overflow-x-hidden"
                      >
                        {children}
                      </main>
                    </div>
                  </div>
                  <Support />
                </>
              )}
            </div>
          </CheckPayment>
        </MantineWrapper>
      </CopilotKit>
    </ContextWrapper>
  );
};
