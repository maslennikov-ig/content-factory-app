'use client';
import { useForm, SubmitHandler, FormProvider } from 'react-hook-form';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import Link from 'next/link';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { PasswordInput } from '@contentfactory/react/form/password-input';
import { useMemo, useState } from 'react';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { ForgotReturnPasswordDto } from '@contentfactory/nestjs-libraries/dtos/auth/forgot-return.password.dto';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import {
  PASSWORD_POLICY_ERROR_MESSAGE,
  PASSWORD_POLICY_RANGE,
} from '@contentfactory/nestjs-libraries/dtos/auth/password.policy';
type Inputs = {
  password: string;
  repeatPassword: string;
  token: string;
};
export function ForgotReturn({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const t = useT();
  const [state, setState] = useState(false);
  const resolver = useMemo(() => {
    return classValidatorResolver(ForgotReturnPasswordDto);
  }, []);
  const form = useForm<Inputs>({
    resolver,
    mode: 'onChange',
    defaultValues: {
      token,
    },
  });
  const passwordError = form.formState.errors.password?.message;
  const localizedPasswordError =
    passwordError === PASSWORD_POLICY_ERROR_MESSAGE
      ? t(
          'password_policy_error',
          'Use {{min}}–{{max}} characters with a letter, a number, and a special character.',
          PASSWORD_POLICY_RANGE
        )
      : passwordError;
  const fetchData = useFetch();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    const { reset } = await (
      await fetchData('/auth/forgot-return', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
        }),
      })
    ).json();
    setState(true);
    if (!reset) {
      form.setError('password', {
        type: 'manual',
        message: t(
          'password_reset_link_expired',
          'Your password reset link has expired. Please try again.'
        ),
      });
      return false;
    }
    setLoading(false);
  };
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div>
          <h1 className="text-3xl font-bold text-start mb-4 cursor-pointer">
            {t('forgot_password_1', 'Forgot Password')}
          </h1>
        </div>
        {!state ? (
          <>
            <div className="space-y-4 text-textColor">
              <PasswordInput
                label="New Password"
                translationKey="label_new_password"
                {...form.register('password')}
                error={localizedPasswordError}
                autoComplete="new-password"
                placeholder={t('label_password', 'Password')}
                helper={t(
                  'password_policy_hint',
                  'Use {{min}}–{{max}} characters with a letter, a number, and a special character.',
                  PASSWORD_POLICY_RANGE
                )}
                showPasswordLabel={t('show_password', 'Show password')}
                hidePasswordLabel={t('hide_password', 'Hide password')}
              />
              <PasswordInput
                label="Repeat Password"
                translationKey="label_repeat_password"
                {...form.register('repeatPassword')}
                autoComplete="new-password"
                placeholder={t('label_repeat_password', 'Repeat Password')}
                showPasswordLabel={t('show_password', 'Show password')}
                hidePasswordLabel={t('hide_password', 'Hide password')}
              />
            </div>
            <div className="text-center mt-6">
              <div className="w-full flex">
                <Button type="submit" className="flex-1" loading={loading}>
                  {t('change_password', 'Change Password')}
                </Button>
              </div>
              <p className="mt-4 text-sm">
                <Link href="/auth/login" className="underline cursor-pointer">
                  {t('go_back_to_login', 'Go back to login')}
                </Link>
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="text-start mt-6">
              {t(
                'we_successfully_reset_your_password_you_can_now_login_with_your',
                'We successfully reset your password. You can now login with your'
              )}
            </div>
            <p className="mt-4 text-sm">
              <Link href="/auth/login" className="underline cursor-pointer">
                {t('go_back_to_login', 'Go back to login')}
              </Link>
            </p>
          </>
        )}
      </form>
    </FormProvider>
  );
}
