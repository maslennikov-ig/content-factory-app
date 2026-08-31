'use client';

import { useCallback } from 'react';
import SafeImage from '@contentfactory/react/helpers/safe.image';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { AuthProviderButton } from '@contentfactory/frontend/components/auth/providers/provider.button';
export const OauthProvider = () => {
  const fetch = useFetch();
  const { oauthLogoUrl, oauthDisplayName } = useVariables();
  const t = useT();
  const gotoLogin = useCallback(async () => {
    try {
      const response = await fetch('/auth/oauth/GENERIC');
      if (!response.ok) {
        throw new Error(
          `Login link request failed with status ${response.status}`
        );
      }
      const link = await response.text();
      window.location.href = link;
    } catch (error) {
      console.error('Failed to get generic oauth login link:', error);
    }
  }, []);
  return (
    <AuthProviderButton
      onClick={gotoLogin}
      label={`${t('sign_in_with', 'Sign in with')} ${oauthDisplayName || 'OAuth'}`}
      icon={
        <SafeImage
          src={oauthLogoUrl || '/icons/generic-oauth.svg'}
          alt=""
          width={18}
          height={18}
        />
      }
    />
  );
};
