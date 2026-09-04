'use client';

import { ReactNode, useEffect, useState } from 'react';
import { LoadingComponent } from '@contentfactory/frontend/components/layout/loading';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import {
  IDENTITY_LINK_INTENT_KEY,
  identityLinkReturnUrl,
} from '@contentfactory/frontend/components/auth/identity-link-return';

/**
 * Stands in front of the sign-in page when Telegram sends someone back to it.
 *
 * Two journeys end at the same address now: signing in, and connecting Telegram
 * to an account that is already signed in. Only the second one left a note in
 * this tab, so only the second one is walked on to Settings — everything else
 * falls through to the page that was going to render anyway.
 */
export const TelegramLinkReturn = ({ children }: { children: ReactNode }) => {
  const t = useT();
  const [leaving, setLeaving] = useState<boolean | null>(null);

  useEffect(() => {
    const target = identityLinkReturnUrl({
      search: window.location.search,
      // Read, not taken: Settings claims this note when it finishes the
      // connection, and taking it here would leave nothing to finish with.
      rawIntent: window.sessionStorage.getItem(IDENTITY_LINK_INTENT_KEY),
    });
    if (!target) {
      setLeaving(false);
      return;
    }
    setLeaving(true);
    // `replace`, not `assign`: this URL carries a code that is spent once, and
    // the back button must not offer it again.
    window.location.replace(target);
  }, []);

  if (leaving === false) return <>{children}</>;

  return (
    <div
      className="flex flex-col items-center gap-[12px]"
      data-testid="telegram-link-return"
    >
      <LoadingComponent width={48} height={48} />
      {leaving && (
        <p
          role="status"
          className="max-w-[40ch] text-center cf-body-md text-cf-ink-muted [text-wrap:pretty]"
        >
          {t(
            'telegram_link_returning_to_settings',
            'Finishing the Telegram connection in your settings…'
          )}
        </p>
      )}
    </div>
  );
};
