'use client';

import { useCallback } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { AuthProviderButton } from '@contentfactory/frontend/components/auth/providers/provider.button';

export const TelegramProvider = () => {
  const fetch = useFetch();
  const t = useT();
  const gotoLogin = useCallback(async () => {
    const response = await fetch('/auth/oauth/TELEGRAM');
    if (!response.ok) {
      throw new Error('Telegram login is unavailable');
    }
    window.location.href = await response.text();
  }, [fetch]);

  return (
    <AuthProviderButton
      onClick={gotoLogin}
      label={t('sign_in_with_telegram', 'Sign in with Telegram')}
      icon={
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
          className="text-cf-info"
        >
          <path d="M21.6 3.8 18.4 19c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.1c.4-.4-.1-.6-.6-.2L6 12.8l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20 2.6c.9-.3 1.7.2 1.6 1.2Z" />
        </svg>
      }
    />
  );
};
