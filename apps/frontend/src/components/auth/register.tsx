'use client';

import { FormProvider, SubmitHandler, useForm } from 'react-hook-form';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import Link from 'next/link';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { canOfferNewsletterConsent } from '@contentfactory/helpers/auth/newsletter.consent';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { CreateOrgUserDto } from '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto';
import { GithubProvider } from '@contentfactory/frontend/components/auth/providers/github.provider';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingComponent } from '@contentfactory/frontend/components/layout/loading';
import { GoogleProvider } from '@contentfactory/frontend/components/auth/providers/google.provider';
import { OauthProvider } from '@contentfactory/frontend/components/auth/providers/oauth.provider';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { FarcasterProvider } from '@contentfactory/frontend/components/auth/providers/farcaster.provider';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { AuthDivider } from '@contentfactory/frontend/components/auth/auth.divider';
import { LegalNotice } from '@contentfactory/frontend/components/auth/legal.notice';
import { TelegramProvider } from '@contentfactory/frontend/components/auth/providers/telegram.provider';
import type { StarterTemplate } from '@contentfactory/nestjs-libraries/dtos/auth/starter-template';
import { StarterTemplateChooser } from '@contentfactory/frontend/components/public-saas/starter-template-chooser';
import {
  consumeRegistrationIntent,
  issueRegistrationIntent,
  readRegistrationIntent,
} from '@contentfactory/frontend/components/public-saas/registration-intent';
type Inputs = {
  email: string;
  password: string;
  company?: string;
  workspaceName?: string;
  providerToken: string;
  provider: string;
  subscribeToNewsletter: boolean;
  starterTemplate: StarterTemplate;
};
export function Register() {
  const getQuery = useSearchParams();
  const router = useRouter();
  const fetch = useFetch();
  const [provider] = useState(getQuery?.get('provider')?.toUpperCase());
  const [code, setCode] = useState(getQuery?.get('code') || '');
  const [state] = useState(getQuery?.get('state') || '');
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (provider && code) {
      load();
    }
  }, []);
  const load = useCallback(async () => {
    const response = await fetch(
      `/auth/oauth/${provider?.toUpperCase() || 'LOCAL'}/exists`,
      {
        method: 'POST',
        body: JSON.stringify({
          code,
          state,
        }),
      }
    );

    // The account came back from the provider but is not switched on yet.
    // Without this the page would sit on its spinner forever.
    if (response.headers.get('approval') === 'true') {
      router.push('/auth/pending');
      return;
    }

    const { token } = await response.json();
    if (token) {
      setCode(token);
      setShow(true);
    }
  }, [provider, code, state, fetch, router]);
  if (!code && !provider) {
    return <RegisterAfter token="" provider="LOCAL" />;
  }
  if (!show) {
    return <LoadingComponent />;
  }
  return (
    <RegisterAfter token={code} provider={provider?.toUpperCase() || 'LOCAL'} />
  );
}
export function RegisterAfter({
  token,
  provider,
}: {
  token: string;
  provider: string;
}) {
  const t = useT();
  const {
    isGeneral,
    genericOauth,
    neynarClientId,
    googleAuthEnabled,
    telegramLoginEnabled,
  } = useVariables();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isAfterProvider = !!token && !!provider;
  // /auth is server-rendered and then hydrated, and the server has no
  // sessionStorage. Reading the intent while initialising state made the first
  // client render disagree with the markup React was hydrating, so React threw
  // the whole form away and rebuilt it. Both sides now start at 'blank' and the
  // stored choice arrives after mount.
  const [selectedStarterTemplate, setSelectedStarterTemplate] =
    useState<StarterTemplate>('blank');
  // Latched, not merely non-destructive: StrictMode runs mount effects twice,
  // and by the second pass the effect below may already have emptied the
  // storage. Reading again would quietly downgrade the choice to 'blank'.
  const storedIntentApplied = useRef(false);
  useEffect(() => {
    if (storedIntentApplied.current) return;
    storedIntentApplied.current = true;
    setSelectedStarterTemplate(readRegistrationIntent(window.sessionStorage));
  }, []);
  useEffect(() => {
    if (isAfterProvider) {
      consumeRegistrationIntent(window.sessionStorage);
    }
  }, [isAfterProvider]);
  const resolver = useMemo(() => {
    return classValidatorResolver(CreateOrgUserDto);
  }, []);
  const form = useForm<Inputs>({
    resolver,
    defaultValues: {
      providerToken: token,
      provider: provider,
      subscribeToNewsletter: false,
    },
  });
  const email = form.watch('email', '');
  // The same rule the auth service applies to the submitted body. Hiding the
  // checkbox is a courtesy; refusing the value is the enforcement, and both
  // read it from one file so they cannot drift apart.
  const canSubscribeToNewsletter = canOfferNewsletterConsent({
    provider,
    email,
  });
  useEffect(() => {
    if (!canSubscribeToNewsletter) {
      form.setValue('subscribeToNewsletter', false);
    }
  }, [canSubscribeToNewsletter, form]);
  const fetchData = useFetch();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    try {
      if (!isAfterProvider) {
        consumeRegistrationIntent(window.sessionStorage);
      }
      const normalizedWorkspace = data.workspaceName?.trim();
      const {
        company: _legacyCompany,
        workspaceName: _workspaceName,
        ...registration
      } = data;
      const response = await fetchData('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          ...registration,
          ...(normalizedWorkspace
            ? {
                workspaceName: normalizedWorkspace,
                company: normalizedWorkspace,
              }
            : {}),
          starterTemplate: selectedStarterTemplate,
        }),
      });
      if (response.status === 200) {
        if (response.headers.get('approval') === 'true') {
          router.push('/auth/pending');
        } else if (response.headers.get('activate') === 'true') {
          router.push('/auth/activate');
        } else {
          router.push('/auth/login');
        }
        return;
      } else {
        form.setError('email', {
          message: await response.text(),
        });
      }
    } catch (e: any) {
      form.setError('email', {
        message:
          'General error: ' +
          e.toString() +
          '. Please check your browser console.',
      });
    } finally {
      setLoading(false);
    }
  };
  const rememberProviderIntent = useCallback(() => {
    issueRegistrationIntent(
      window.sessionStorage,
      selectedStarterTemplate
    );
  }, [selectedStarterTemplate]);
  // Only offer a federated route the deployment has actually configured.
  const providers = useMemo(() => {
    if (isAfterProvider) return null;
    if (!isGeneral) return <GithubProvider />;
    if (genericOauth) return <OauthProvider />;

    const available = [
      googleAuthEnabled ? <GoogleProvider key="google" /> : null,
      neynarClientId ? <FarcasterProvider key="farcaster" /> : null,
      telegramLoginEnabled ? <TelegramProvider key="telegram" /> : null,
    ].filter(Boolean);

    if (!available.length) return null;
    return (
      // Wrapping keeps configured providers inside the 390px auth column
      // instead of pushing the page into horizontal overflow.
      <div className="flex flex-wrap gap-[8px]">{available}</div>
    );
  }, [
    isAfterProvider,
    isGeneral,
    genericOauth,
    googleAuthEnabled,
    neynarClientId,
    telegramLoginEnabled,
  ]);

  return (
    <FormProvider {...form}>
      {/* `required` stays on the fields so assistive technology and the
          label copy agree about what the form needs, but the browser's own
          validation stays out of the way: the class-validator resolver owns
          the messages, and a native bubble would otherwise stop the submit
          before the form could show its own error under the field. */}
      <form
        className="flex flex-col gap-[24px]"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div>
          <h1 className="cf-heading-lg">{t('sign_up', 'Sign Up')}</h1>
          <p className="mt-[4px] text-[14px] text-cf-ink-muted">
            {t(
              'sign_up_subtitle',
              'Create a workspace for your content operation.'
            )}
          </p>
        </div>

        <StarterTemplateChooser
          value={selectedStarterTemplate}
          onChange={setSelectedStarterTemplate}
          copy={{
            legend: t('starter_template_legend', 'Choose a starting point'),
            blank: t('starter_template_blank', 'Blank workspace'),
            blankDescription: t(
              'starter_template_blank_description',
              'Start without preset labels.'
            ),
            workflow: t(
              'starter_template_content_workflow',
              'Content workflow'
            ),
            workflowDescription: t(
              'starter_template_content_workflow_description',
              'Add Plan, Draft, Review, and Schedule labels.'
            ),
          }}
        />

        {providers && (
          <div
            className="flex flex-col gap-[16px]"
            onClickCapture={rememberProviderIntent}
          >
            <div className="text-[13px] font-[600] text-cf-ink-muted">
              {t('continue_with', 'Continue With')}
            </div>
            {providers}
            <AuthDivider label={t('or', 'or')} />
          </div>
        )}

        <div className="flex flex-col">
          {!isAfterProvider && (
            <>
              {/* `label` stays the plain field name: it is what the field is
                  called, and `field_required` is the wrapper that adds the
                  required marker around it in every locale. */}
              <Input
                label="Email"
                translationKey="field_required"
                translationParams={{
                  field: t('label_email', 'Email'),
                }}
                {...form.register('email')}
                type="email"
                required
                autoComplete="email"
                placeholder={t('email_address', 'Email Address')}
              />
              <Input
                label="Password"
                translationKey="field_required"
                translationParams={{
                  field: t('label_password', 'Password'),
                }}
                {...form.register('password')}
                autoComplete="new-password"
                type="password"
                required
                placeholder={t('label_password', 'Password')}
              />
            </>
          )}
          <Input
            label={t(
              'public_saas_workspace_optional',
              'Workspace name (optional)'
            )}
            {...form.register('workspaceName', {
              setValueAs: (value) => {
                const normalized =
                  typeof value === 'string' ? value.trim() : '';
                return normalized || undefined;
              },
            })}
            autoComplete="organization"
            type="text"
            placeholder={t(
              'public_saas_workspace_optional',
              'Workspace name (optional)'
            )}
            helper={t(
              'company_field_helper',
              'Used as the workspace name. You can change it later.'
            )}
          />
        </div>

        <div className="flex flex-col gap-[16px]">
          <LegalNotice />
          {canSubscribeToNewsletter && (
            <CheckboxField
              {...form.register('subscribeToNewsletter')}
              disabled={loading}
              label={t(
                'newsletter_consent',
                'Send me occasional product news and updates by email. I can unsubscribe at any time.'
              )}
            />
          )}
          <Button type="submit" className="w-full" loading={loading}>
            {t('create_account', 'Create Account')}
          </Button>
          <p className="text-[14px] text-cf-ink-muted">
            {t('already_have_an_account', 'Already Have An Account?')}&nbsp;
            <Link
              href="/auth/login"
              className="text-cf-accent underline font-[600]"
            >
              {t('sign_in', 'Sign In')}
            </Link>
          </p>
        </div>
      </form>
    </FormProvider>
  );
}
