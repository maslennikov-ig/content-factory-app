'use client';

import { FC, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * `?onboarding=true` → «С чего начать» (2q28.6). One onboarding, not two.
 *
 * The inherited upstream modal opened here on that parameter. The parameter
 * itself still arrives from real places: the channel-connect round trip
 * carries it back to `/launches` (`add.provider.component.tsx`,
 * `continue.integration.tsx`) and the billing return sends
 * `/launches?onboarding=true&trialStart=true&check=…`
 * (`stripe.service.ts`). So the mount stays and becomes a hand-over to the
 * page.
 *
 * It waits while something else on `/launches` still needs the address: a
 * two-step provider's picker (`added` + `continue`, `ContinueProvider`) or a
 * connect popup that is about to close itself (`window.opener`). The payment
 * check (`check`) is read by the layout on every page, so it travels along.
 */
export const Onboarding: FC = () => {
  const query = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (!query.get('onboarding')) return;
    if (query.get('continue')) return;
    if (typeof window !== 'undefined' && window.opener) return;
    const check = query.get('check');
    router.replace(
      check ? `/onboarding?check=${encodeURIComponent(check)}` : '/onboarding'
    );
  }, [query, router]);

  return null;
};
