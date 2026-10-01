'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { LoadingComponent } from '@contentfactory/frontend/components/layout/loading';
import { ErrorState } from '@contentfactory/frontend/components/ui/surface';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import {
  IDENTITY_LINK_INTENT_KEY,
  IDENTITY_LINK_RETURN_PATH,
  identityLinkReturnUrl,
} from '@contentfactory/frontend/components/auth/identity-link-return';

/**
 * Stands in front of the sign-in page when Telegram sends someone back to it.
 *
 * Two journeys end at the same address now: signing in, and connecting Telegram
 * to an account that is already signed in. The server's browser-bound state
 * decides which one this is; the tab note only allows a connection to continue
 * through Settings, whose consumer still validates and claims that note.
 */
export const TelegramLinkReturn = ({ children }: { children: ReactNode }) => {
  const t = useT();
  const fetch = useFetch();
  const [outcome, setOutcome] = useState<
    'checking' | 'login' | 'returning' | 'restart' | 'failed'
  >('checking');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      active = false;
      controller.abort();
      setOutcome('failed');
    }, 10_000);

    const inspect = async () => {
      let linkConfirmed = false;
      try {
        const search = window.location.search;
        const query = new URLSearchParams(search);
        const state = query.get('state');
        if (!query.get('code') || !state)
          throw new Error('Missing Telegram callback');

        const response = await fetch(
          `/auth/telegram/state?${new URLSearchParams({ state })}`,
          { signal: controller.signal, cache: 'no-store' }
        );
        if (!active) return;
        if (!response.ok) throw new Error('Telegram state inspection failed');
        const result = await response.json();
        if (!active) return;
        if (result?.purpose === 'login') {
          setOutcome('login');
          return;
        }
        if (result?.purpose !== 'link')
          throw new Error('Unknown Telegram purpose');
        linkConfirmed = true;

        const target = identityLinkReturnUrl({
          search,
          // Settings claims this note; inspection must leave it available.
          rawIntent: window.sessionStorage.getItem(IDENTITY_LINK_INTENT_KEY),
        });
        if (!target) {
          setOutcome('restart');
          return;
        }
        setOutcome('returning');
        // A spent code must not remain a destination for the back button.
        window.location.replace(target);
      } catch {
        // Includes unavailable browser storage and unreadable server replies.
        if (active) setOutcome(linkConfirmed ? 'restart' : 'failed');
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void inspect();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [fetch]);

  if (outcome === 'login') return <>{children}</>;

  if (outcome === 'restart' || outcome === 'failed') {
    return (
      <ErrorState
        title={t(
          'telegram_link_return_unavailable',
          'Could not continue with Telegram'
        )}
        description={
          outcome === 'restart'
            ? t(
                'telegram_link_return_restart',
                'This connection attempt is no longer available. Open settings and connect Telegram again.'
              )
            : t(
                'telegram_link_return_check_failed',
                'Could not verify this Telegram attempt. Start sign-in again, or open settings to reconnect Telegram.'
              )
        }
        action={
          <div className="flex flex-wrap items-center gap-[8px]">
            {outcome === 'failed' && (
              <ButtonLink href="/auth/login">
                {t(
                  'telegram_link_return_restart_sign_in',
                  'Start sign-in again'
                )}
              </ButtonLink>
            )}
            <ButtonLink
              href={IDENTITY_LINK_RETURN_PATH}
              variant={outcome === 'failed' ? 'quiet' : 'secondary'}
            >
              {t('telegram_link_return_open_settings', 'Open settings')}
            </ButtonLink>
          </div>
        }
      />
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-[12px]"
      data-testid="telegram-link-return"
    >
      <LoadingComponent width={48} height={48} />
      <p
        role="status"
        className="max-w-[40ch] text-center cf-body-md text-cf-ink-muted [text-wrap:pretty]"
      >
        {outcome === 'returning'
          ? t(
              'telegram_link_returning_to_settings',
              'Finishing the Telegram connection in your settings…'
            )
          : t('telegram_link_return_checking', 'Checking the Telegram return…')}
      </p>
    </div>
  );
};
