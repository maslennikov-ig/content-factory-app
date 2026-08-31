'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { HttpStatusCode } from 'axios';
import { useRouter } from 'next/navigation';
import { Redirect } from '@contentfactory/frontend/components/layout/redirect';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import dayjs from 'dayjs';
import { continueProviderList } from '@contentfactory/frontend/components/new-launch/providers/continue-provider/list';
import { IntegrationContext } from '@contentfactory/frontend/components/launches/helpers/use.integration';
import { newDayjs } from '@contentfactory/frontend/components/layout/set.timezone';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import {
  ErrorState,
  PageHeader,
  Panel,
  Skeleton,
  Status,
} from '@contentfactory/frontend/components/ui/surface';

interface TwoStepState {
  integrationId: string;
  onboarding: boolean;
  pages: any[];
  returnURL?: string;
}

interface SuccessState {
  message: string;
}

export const ContinueIntegration: FC<{
  provider: string;
  searchParams: any;
  logged: boolean;
}> = (props) => {
  const { provider, searchParams, logged } = props;
  const { push } = useRouter();
  const t = useT();
  const fetch = useFetch();
  const { extensionId, backendUrl } = useVariables();
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [twoStepState, setTwoStepState] = useState<TwoStepState | null>(null);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Helper to handle navigation - redirects if logged or returnURL exists, otherwise shows inline
  const navigateOrShow = useCallback(
    (path: string, returnURL: string | undefined, successMessage: string) => {
      if (returnURL) {
        // If returnURL exists, always redirect to it with the path params
        const params = path.includes('?') ? path.split('?')[1] : '';
        push(params ? `${returnURL}?${params}` : returnURL);
      } else if (logged) {
        // If logged in without returnURL, use normal navigation
        push(path);
      } else {
        // If not logged in without returnURL, show success inline
        setSuccessState({ message: successMessage });
      }
    },
    [logged, push]
  );
  const modifiedParams = useMemo(() => {
    if (provider === 'mewe') {
      return {
        state: searchParams.state || '',
        code: searchParams.loginRequestToken || '',
        refresh: searchParams.refresh || '',
      };
    }
    if (provider === 'x') {
      return {
        state: searchParams.oauth_token || '',
        code: searchParams.oauth_verifier || '',
        refresh: searchParams.refresh || '',
      };
    }

    if (provider === 'vk') {
      return {
        ...searchParams,
        state: searchParams.state || '',
        code: searchParams.code + '&&&&' + searchParams.device_id,
      };
    }

    if (provider === 'mewe') {
      const hash =
        typeof window !== 'undefined' ? window.location.hash.substring(1) : '';
      const hashParams = new URLSearchParams(hash);
      return {
        state: hashParams.get('state') || searchParams.state || '',
        code: hashParams.get('loginRequestToken') || '',
        refresh: searchParams.refresh || '',
      };
    }

    return searchParams;
  }, []);

  useEffect(() => {
    (async () => {
      const timezone = String(dayjs.tz().utcOffset());

      // Try public endpoint first (handles both public and fallback scenarios)
      let data = await fetch(`/integrations/social-connect/${provider}`, {
        method: 'POST',
        body: JSON.stringify({ ...modifiedParams, timezone }),
      });

      // If public endpoint fails with specific errors, try authenticated endpoint
      if (data.status === HttpStatusCode.BadRequest) {
        const errorData = await data.json().catch(() => ({}));
        // "Invalid connection type" means this wasn't started as a public flow
        if (
          errorData.message?.includes('Invalid connection type') ||
          errorData.message?.includes('Invalid or expired state')
        ) {
          data = await fetch(`/integrations/social-connect/${provider}`, {
            method: 'POST',
            body: JSON.stringify({ ...modifiedParams, timezone }),
          });
        }
      }

      if (data.status === HttpStatusCode.PreconditionFailed) {
        const { returnURL } = await data.json().catch(() => ({}));
        navigateOrShow(
          `/launches?precondition=true`,
          returnURL,
          'Precondition failed'
        );
        return;
      }

      if (data.status === HttpStatusCode.NotAcceptable) {
        const { msg, returnURL } = await data.json();
        navigateOrShow(`/launches?msg=${msg}`, returnURL, msg);
        return;
      }

      if (
        data.status !== HttpStatusCode.Ok &&
        data.status !== HttpStatusCode.Created
      ) {
        const errorData = await data.json().catch(() => ({}));
        setErrorMessage(
          errorData.message || errorData.msg || 'Could not add provider'
        );
        setError(true);
        return;
      }

      const {
        inBetweenSteps,
        id,
        onboarding: resOnboarding,
        pages,
        returnURL,
        extensionToken,
      } = await data.json();
      const onboarding = resOnboarding || searchParams.onboarding === 'true';

      // Store refresh token in extension for background cookie refresh
      if (
        extensionToken &&
        extensionId &&
        typeof chrome !== 'undefined' &&
        chrome?.runtime?.sendMessage
      ) {
        try {
          chrome.runtime.sendMessage(
            extensionId,
            {
              type: 'STORE_REFRESH_TOKEN',
              provider,
              integrationId: id,
              jwt: extensionToken,
              backendUrl,
            },
            () => {}
          );
        } catch {
          // Silently ignore — extension may not be available
        }
      }

      // If it's a two-step provider, show the selection UI inline
      if (inBetweenSteps && !searchParams.refresh) {
        setTwoStepState({
          integrationId: id,
          onboarding,
          pages: pages || [],
          returnURL,
        });
        return;
      }

      navigateOrShow(
        `/launches?added=${provider}&msg=Channel Updated${
          onboarding ? '&onboarding=true' : ''
        }`,
        returnURL,
        'Channel Updated'
      );
    })();
  }, []);

  const onSave = useCallback(
    async (data: any) => {
      if (!twoStepState) return;

      setIsSaving(true);

      try {
        // Use public or authenticated endpoint based on the flow
        const endpoint = logged
          ? `/integrations/provider/${twoStepState.integrationId}/connect`
          : `/integrations/public/provider/${twoStepState.integrationId}/connect`;

        const response = await fetch(endpoint, {
          method: 'POST',
          body: JSON.stringify({ ...modifiedParams, ...data }),
        });

        if (
          response.status !== HttpStatusCode.Ok &&
          response.status !== HttpStatusCode.Created
        ) {
          const errorData = await response.json().catch(() => ({}));
          setErrorMessage(
            errorData.message || 'Failed to save channel configuration'
          );
          setError(true);
          return;
        }

        navigateOrShow(
          `/launches?added=${provider}&msg=Channel Added${
            twoStepState.onboarding ? '&onboarding=true' : ''
          }`,
          twoStepState.returnURL,
          'Channel Added'
        );
      } finally {
        setIsSaving(false);
      }
    },
    [twoStepState, fetch, modifiedParams, provider, navigateOrShow]
  );

  const Provider = useMemo(() => {
    return (
      continueProviderList[provider as keyof typeof continueProviderList] ||
      null
    );
  }, [provider]);

  const providerDisplayName = useMemo(() => {
    const names: Record<string, string> = {
      facebook: 'Facebook',
      instagram: 'Instagram',
      'linkedin-page': 'LinkedIn',
      youtube: 'YouTube',
      gmb: 'Google Business',
      tumblr: 'Tumblr',
    };
    return names[provider] || provider;
  }, [provider]);

  // Success state for non-logged users without returnURL
  if (successState) {
    return (
      <div className="flex flex-1 items-center justify-center bg-cf-canvas p-[20px]">
        <Panel className="w-full max-w-[520px]" as="div">
          <div className="flex flex-col items-start gap-[16px]">
            <Status tone="accent" icon={<CheckGlyph />}>
              {t('connected', 'Connected')}
            </Status>
            <PageHeader
              title={t('channel_connected', 'Channel Connected!')}
              description={
                successState.message ||
                t(
                  'channel_connected_description',
                  `Your ${providerDisplayName} channel has been successfully connected. You can close this window now.`
                )
              }
            />
          </div>
        </Panel>
      </div>
    );
  }

  // Show the two-step selection UI
  if (twoStepState && Provider) {
    return (
      <div className="flex flex-1 items-center justify-center bg-cf-canvas p-[20px]">
        <Panel className="w-full max-w-[550px]" as="div">
          <div className="flex flex-col gap-[24px]">
            <PageHeader
              title={t('configure_your_channel', 'Configure Your Channel')}
              description={t(
                'select_the_page_or_account',
                `Select the ${providerDisplayName} page or account you want to connect.`
              )}
            />

            <IntegrationContext.Provider
              value={{
                date: newDayjs(),
                value: [],
                allIntegrations: [],
                integration: {
                  editor: 'normal',
                  additionalSettings: '',
                  display: '',
                  time: [{ time: 0 }],
                  id: twoStepState.integrationId,
                  type: '',
                  name: '',
                  picture: '',
                  inBetweenSteps: true,
                  changeNickName: false,
                  changeProfilePicture: false,
                  identifier: provider,
                },
              }}
            >
              <Provider
                onSave={onSave}
                existingId={[]}
                initialData={twoStepState.pages}
                isSaving={isSaving}
              />
            </IntegrationContext.Provider>
          </div>
        </Panel>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-cf-canvas p-[20px]">
        <div className="w-full max-w-[520px]">
          <ErrorState
            title={t('could_not_add_provider', 'Could not add provider')}
            description={
              errorMessage ||
              t(
                'you_are_being_redirected_back',
                'An error occurred. Please try again.'
              )
            }
            action={
              logged ? <Redirect url="/launches" delay={3000} /> : undefined
            }
          />
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div className="flex flex-1 items-center justify-center bg-cf-canvas p-[20px]">
      <Panel className="w-full max-w-[520px]" as="div">
        <div className="flex flex-col gap-[20px]">
          <PageHeader
            title={t('adding_channel', 'Adding Channel')}
            description={t(
              'please_wait',
              'Please wait while we connect your account...'
            )}
          />
          <div
            className="flex flex-col gap-[8px]"
            role="status"
            aria-live="polite"
          >
            <span className="sr-only">{t('loading', 'Loading')}</span>
            <Skeleton className="h-[40px] w-full" />
            <Skeleton className="h-[40px] w-3/4" />
          </div>
        </div>
      </Panel>
    </div>
  );
};

const CheckGlyph: FC = () => (
  <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path
      d="m3 8 3 3 7-7"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
