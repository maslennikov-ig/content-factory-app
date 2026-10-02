'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { AUTH_PROVIDER_BUTTON_CLASS } from '@contentfactory/frontend/components/auth/providers/provider.button';

type FarcasterComponent =
  typeof import('@contentfactory/frontend/components/auth/providers/farcaster.provider').FarcasterProvider;

let pendingLoad: Promise<FarcasterComponent> | undefined;
let loadFailed = false;

function loadFarcaster() {
  if (!pendingLoad) {
    const request = import('@contentfactory/frontend/components/auth/providers/farcaster.provider')
      .then((module) => module.FarcasterProvider);
    pendingLoad = request;
    request.catch(() => {
      if (pendingLoad === request) loadFailed = true;
    });
  }
  return pendingLoad;
}

/** Keep the optional SDK out of auth SSR; only a visible client mount loads it. */
export const LazyFarcasterProvider = () => {
  const t = useT();
  const errorId = useId();
  const [Provider, setProvider] = useState<FarcasterComponent | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    setFailed(false);
    loadFarcaster().then(
      (component) => {
        if (mounted) setProvider(() => component);
      },
      () => {
        if (mounted) setFailed(true);
      }
    );
    return () => {
      mounted = false;
    };
  }, [attempt]);

  const retry = () => {
    // Failed loads stay cached until a person asks to retry, including remounts.
    if (loadFailed) {
      pendingLoad = undefined;
      loadFailed = false;
    }
    setFailed(false);
    setAttempt((value) => value + 1);
  };
  const providerName = t('farcaster', 'Farcaster');
  const loadingLabel = t('loading_sign_in_methods', 'Loading sign-in methods…');
  const retryLabel = t('try_again', 'Try Again');

  return (
    <div className="grid flex-1 min-w-[120px] xs:w-full xs:flex-none">
      {Provider ? (
        <Provider />
      ) : (
        <>
          <Button
            type="button"
            className={AUTH_PROVIDER_BUTTON_CLASS}
            loading={!failed}
            loadingLabel={loadingLabel}
            aria-label={`${providerName}. ${failed ? retryLabel : loadingLabel}`}
            aria-describedby={failed ? errorId : undefined}
            onClick={retry}
          >
            <span className="truncate">{providerName}</span>
            {failed && <span className="truncate">{retryLabel}</span>}
          </Button>
          {failed && (
            <p id={errorId} role="alert" className="mt-[4px] text-caption font-mono text-cf-danger">
              {t('sign_in_methods_load_failed', 'Could not load sign-in methods.')}
            </p>
          )}
        </>
      )}
    </div>
  );
};
