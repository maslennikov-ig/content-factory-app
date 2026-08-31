'use client';

import { useForm, SubmitHandler, FormProvider } from 'react-hook-form';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import Link from 'next/link';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { useMemo, useState } from 'react';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { LoginUserDto } from '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto';
import { GithubProvider } from '@contentfactory/frontend/components/auth/providers/github.provider';
import { OauthProvider } from '@contentfactory/frontend/components/auth/providers/oauth.provider';
import { GoogleProvider } from '@contentfactory/frontend/components/auth/providers/google.provider';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { FarcasterProvider } from '@contentfactory/frontend/components/auth/providers/farcaster.provider';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { AuthDivider } from '@contentfactory/frontend/components/auth/auth.divider';
import { TelegramProvider } from '@contentfactory/frontend/components/auth/providers/telegram.provider';

type Inputs = {
  email: string;
  password: string;
  providerToken: '';
  provider: 'LOCAL';
};

export function Login() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [notActivated, setNotActivated] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const {
    isGeneral,
    neynarClientId,
    genericOauth,
    googleAuthEnabled,
    telegramLoginEnabled,
  } = useVariables();

  const resolver = useMemo(() => {
    return classValidatorResolver(LoginUserDto);
  }, []);
  const form = useForm<Inputs>({
    resolver,
    defaultValues: {
      providerToken: '',
      provider: 'LOCAL',
    },
  });
  const fetchData = useFetch();

  // Only offer a federated route the deployment has actually configured.
  const providers = useMemo(() => {
    if (isGeneral && genericOauth) return <OauthProvider />;
    if (!isGeneral) return <GithubProvider />;

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
    isGeneral,
    genericOauth,
    googleAuthEnabled,
    neynarClientId,
    telegramLoginEnabled,
  ]);

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    setNotActivated(false);
    setAwaitingApproval(false);
    const login = await fetchData('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        provider: 'LOCAL',
      }),
    });
    if (login.status === 400) {
      const errorMessage = await login.text();
      if (errorMessage === 'User is awaiting approval') {
        setAwaitingApproval(true);
      } else if (errorMessage === 'User is not activated') {
        setNotActivated(true);
      } else {
        form.setError('email', {
          message: errorMessage,
        });
      }
      setLoading(false);
    }
  };

  return (
    <FormProvider {...form}>
      <form
        className="flex flex-col gap-[24px]"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div>
          <h1 className="cf-heading-lg">{t('sign_in', 'Sign In')}</h1>
          <p className="mt-[4px] text-[14px] text-cf-ink-muted">
            {t(
              'sign_in_subtitle',
              'Continue to your Content Factory workspace.'
            )}
          </p>
        </div>

        {providers && (
          <div className="flex flex-col gap-[16px]">
            <div className="text-[13px] font-[600] text-cf-ink-muted">
              {t('continue_with', 'Continue With')}
            </div>
            {providers}
            <AuthDivider label={t('or', 'or')} />
          </div>
        )}

        <div className="flex flex-col">
          <Input
            label="Email"
            translationKey="label_email"
            {...form.register('email')}
            type="email"
            autoComplete="email"
            placeholder={t('email_address', 'Email Address')}
          />
          <Input
            label="Password"
            translationKey="label_password"
            {...form.register('password')}
            autoComplete="current-password"
            type="password"
            placeholder={t('label_password', 'Password')}
          />
        </div>

        {awaitingApproval && (
          <div
            role="alert"
            className="rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[12px]"
          >
            <p className="cf-body-sm text-cf-warning text-pretty">
              {t(
                'account_awaiting_approval',
                'This account is waiting for an administrator to approve it. There is nothing to resend — you will be able to sign in once it is approved.'
              )}
            </p>
          </div>
        )}

        {notActivated && (
          <div
            role="alert"
            className="rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[12px]"
          >
            <p className="text-[13px] text-cf-warning">
              {t(
                'account_not_activated',
                'Your account is not activated yet. Please check your email for the activation link.'
              )}
            </p>
            <Link
              href="/auth/activate"
              className="mt-[6px] inline-block text-[13px] font-[600] text-cf-warning underline"
            >
              {t('resend_activation_email', 'Resend Activation Email')}
            </Link>
          </div>
        )}

        <div className="flex flex-col gap-[16px]">
          <Button type="submit" className="w-full" loading={loading}>
            {t('sign_in_1', 'Sign in')}
          </Button>

          <div className="flex flex-col gap-[6px] text-[14px] text-cf-ink-muted">
            <p>
              {t('don_t_have_an_account', "Don't Have An Account?")}&nbsp;
              <Link href="/auth" className="text-cf-accent underline font-[600]">
                {t('sign_up', 'Sign Up')}
              </Link>
            </p>
            <p>
              <Link
                href="/auth/forgot"
                className="text-cf-accent underline font-[600]"
              >
                {t('forgot_password', 'Forgot password')}
              </Link>
            </p>
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
