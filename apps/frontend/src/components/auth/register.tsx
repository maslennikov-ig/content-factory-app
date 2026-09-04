'use client';

import { FormProvider, SubmitHandler, useForm } from 'react-hook-form';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import Link from 'next/link';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { PasswordInput } from '@contentfactory/react/form/password-input';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { canOfferNewsletterConsent } from '@contentfactory/helpers/auth/newsletter.consent';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { PASSWORD_POLICY_RANGE } from '@contentfactory/nestjs-libraries/dtos/auth/password.policy';
import {
  parseRequestFailure,
  useFieldErrorMessage,
  useRequestErrorMessage,
} from '@contentfactory/frontend/components/auth/form.errors';

// The same three base64url segments the proxy recognises as an invitation.
const INVITE_TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * The invitation behind a registration, read from the address to come back to.
 *
 * An invitation link opened without a session is answered by the proxy with
 * `/auth?returnUrl=<public origin>/join-org?org=<token>`. The pending-invitation
 * cookie it writes alongside is `httpOnly`, so that return address is the only
 * place this form can still see the invitation — and `ReturnUrlComponent` keeps
 * a copy in `localStorage`, which survives a detour through the sign-in link.
 */
export const invitationTokenFromReturnUrl = (returnUrl?: string | null) => {
  if (!returnUrl) return '';
  try {
    // The base only matters for a relative value; a stored absolute address
    // brings its own.
    const url = new URL(returnUrl, 'http://invitation.invalid');
    if (url.pathname !== '/join-org') return '';
    const token = url.searchParams.get('org') || '';
    return INVITE_TOKEN_SHAPE.test(token) ? token : '';
  } catch {
    return '';
  }
};

/**
 * What the door open without a session says about an invitation
 * (`GET /auth/join-org`). `workspaceName` is always there; `boundEmail` is
 * absent for a link copied out of the interface, and the inviter's name and
 * address are absent today by design — see the heading below.
 */
type InvitationPreview = {
  workspaceName: string;
  boundEmail?: string;
  inviterName?: string;
  inviterEmail?: string;
};

type Inputs = {
  email: string;
  password: string;
  company?: string;
  workspaceName?: string;
  providerToken: string;
  provider: string;
  subscribeToNewsletter: boolean;
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
    language,
  } = useVariables();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isAfterProvider = !!token && !!provider;
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
  const fieldErrorMessage = useFieldErrorMessage();
  const requestErrorMessage = useRequestErrorMessage();
  const localizedPasswordError = fieldErrorMessage(
    'password',
    form.formState.errors.password?.message
  );
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
  const getQuery = useSearchParams();
  const [invitationToken, setInvitationToken] = useState('');
  /**
   * `content-factory-next-fn33.18`: what the invitation says, once the public
   * preview has answered. While it is `null` this is an ordinary
   * registration — which is also what a spent or expired link leaves behind.
   */
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  /**
   * `content-factory-next-fn33.29`: why the link in the address bar is not
   * doing anything. The owner opened an already-accepted invitation in
   * another browser and got the plain registration form, with no address
   * filled in and not a word about the invitation. The form stays a plain
   * registration form — that is what is still available to this person — but
   * it now says which of the two things happened.
   */
  const [invitationIssue, setInvitationIssue] = useState('');
  useEffect(() => {
    const fromQuery = invitationTokenFromReturnUrl(getQuery?.get('returnUrl'));
    if (fromQuery) {
      setInvitationToken(fromQuery);
      return;
    }
    try {
      setInvitationToken(
        invitationTokenFromReturnUrl(localStorage.getItem('returnUrl'))
      );
    } catch {
      // Storage can be denied outright; the form works without the hint.
      setInvitationToken('');
    }
  }, [getQuery]);
  // An invitation issued to one address can only be accepted by that address,
  // so registering under a different one ends in `invite_email_mismatch`.
  // Filling the field in — and, since `content-factory-next-fn33.18`, closing
  // it — is what keeps the two halves of the invited path pointing at the
  // same person.
  useEffect(() => {
    if (!invitationToken || isAfterProvider) return;
    let cancelled = false;
    (async () => {
      try {
        // `/user/join-org` answers the same question but sits behind
        // `AuthMiddleware`, and this page has no session: that request comes
        // back Forbidden every time. `/auth/join-org` is the door open without
        // one, and it answers with the workspace and the bound address only.
        const query = new URLSearchParams({ org: invitationToken });
        const response = await fetchData(`/auth/join-org?${query}`);
        if (cancelled) return;
        if (!response.ok) {
          // 410 and a code, the same pair the invitation page reads. Anything
          // else — the door unreachable, a proxy in the way — says nothing:
          // an explanation that may be wrong is worse than none.
          const body = (await response
            .json()
            .catch(() => null)) as { code?: string } | null;
          if (cancelled) return;
          if (body?.code === 'invite_used' || body?.code === 'invite_invalid') {
            setInvitationIssue(body.code);
          }
          return;
        }
        const preview = (await response.json()) as InvitationPreview;
        if (cancelled || !preview) return;
        setInvitation(preview);
        // An invitation open to any address has no `boundEmail`, and a person
        // already typing must not have their own address replaced.
        if (!preview.boundEmail || form.getValues('email')) return;
        form.setValue('email', preview.boundEmail);
      } catch {
        // A preview that cannot be fetched costs a convenience, not the form.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invitationToken, isAfterProvider, fetchData, form]);

  // The address is the invitation's, not a choice. It used to be filled in and
  // still editable, and an edited one produced an account that could never
  // join the workspace it was invited to.
  const emailLocked = Boolean(invitation?.boundEmail);
  /**
   * The invitation, when there is enough of it to say so out loud. The
   * workspace name is what the heading is built from; without it the form
   * still carries the token and still fills the address in, it just says
   * nothing it cannot say correctly.
   */
  const invited = invitation?.workspaceName ? invitation : null;

  const invitationIssueNote = useMemo(() => {
    if (invitationIssue === 'invite_used') {
      return t(
        'register_invitation_used',
        'That invitation link has already been used. You can still create a new account here, or ask the workspace administrator for a new invitation.'
      );
    }
    if (invitationIssue === 'invite_invalid') {
      return t(
        'register_invitation_expired',
        'That invitation link has expired. You can still create a new account here, or ask the workspace administrator for a new invitation.'
      );
    }
    return '';
  }, [invitationIssue, t]);
  /**
   * `content-factory-next-fn33.37`: where an invited registration lands.
   *
   * The stored return address is the invitation page with the invitation's own
   * token — that is how the proxy sends an anonymous visitor here. Registering
   * spends that token, so following the stored address afterwards asked the
   * invitation door about an invitation that had just been used, and the first
   * thing a new member saw was a red «Invitation unavailable» about their own
   * link.
   *
   * Clearing the address is not enough on its own: the pending-invitation
   * cookie the proxy wrote is `httpOnly` and still live, and it turns the very
   * next visit to `/` back into the same invitation page. So the return address
   * is rewritten rather than dropped — same page, same token, plus the flag
   * that says the invitation has already been accepted. Landing there lets the
   * proxy clear its cookie, and `join-org` passes straight through to the
   * workspace instead of asking about a spent token.
   */
  const invitedLandingUrl = useCallback(() => {
    const landing = new URL('/join-org', window.location.origin);
    landing.searchParams.set('org', invitationToken);
    landing.searchParams.set('joined', '1');
    return landing.toString();
  }, [invitationToken]);

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    // Before the request, not after: the response carries an `onboarding`
    // header, and `layout.context` acts on the stored return address the
    // moment that header arrives — while this function is still awaiting.
    let landing = '';
    if (invitation && invitationToken) {
      try {
        landing = invitedLandingUrl();
        localStorage.setItem('returnUrl', landing);
      } catch {
        // Storage can be denied outright; the navigation below still works.
      }
    }
    try {
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
          // Only when the preview said the invitation is live. Sending a token
          // this form knows to be spent would make the server decide again
          // what the person has already been told.
          ...(invitation ? { invitationToken } : {}),
          ...(normalizedWorkspace && !invited
            ? {
                workspaceName: normalizedWorkspace,
                company: normalizedWorkspace,
              }
            : {}),
          // The interface language the layout already resolved from the
          // cookie, not detected again here: the account should speak the
          // language the person was reading when they signed up.
          ...(language ? { language } : {}),
        }),
      });
      if (response.status === 200) {
        if (response.headers.get('approval') === 'true') {
          router.push('/auth/pending');
          return;
        }
        if (response.headers.get('activate') === 'true') {
          router.push('/auth/activate');
          return;
        }
        // `content-factory-next-fn33.18`: an invited registration comes back
        // signed in, with `showorg` already pointing at the workspace. A
        // client transition would keep the layout it was rendered with and
        // ignore both cookies, which is the same defect
        // `content-factory-next-fn33.26` fixes on the invitation page — so
        // this leaves through the browser.
        const body = (await response.json().catch(() => null)) as {
          invitation?: unknown;
        } | null;
        if (body?.invitation) {
          window.location.assign(landing || invitedLandingUrl());
          return;
        }
        router.push('/auth/login');
        return;
      } else {
        // `content-factory-next-fn33.38`: the body used to go under the email
        // field exactly as it arrived, so a throttled registration answered a
        // person with `{"statusCode":429,...}`. The raw answer is worth having
        // when something is being debugged, and worth nothing on the screen.
        const failure = await parseRequestFailure(response);
        console.error('Registration refused', failure.status, failure.raw);
        form.setError('email', {
          message: requestErrorMessage(failure),
        });
      }
    } catch (e: any) {
      console.error('Registration failed', e);
      form.setError('email', {
        message: t(
          'error_network',
          'The service could not be reached. Check your connection and try again.'
        ),
      });
    } finally {
      setLoading(false);
    }
  };
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
          <h1 className="cf-heading-lg">
            {invited
              ? t('register_invited_title', 'You were invited to “{{workspace}}”', {
                  workspace: invited.workspaceName,
                })
              : t('sign_up', 'Sign Up')}
          </h1>
          {/* Who invited whom is shown only when the preview says it. The
              door open without a session answers with the workspace and the
              bound address and nothing else today, on purpose
              (`auth.controller.ts`), so this line stays absent rather than
              inventing an inviter. */}
          {invited?.inviterName && (
            <p className="mt-[4px] cf-body-sm text-cf-ink-muted">
              {t('register_invited_by', 'Invited by {{inviter}}', {
                inviter: invited.inviterEmail
                  ? `${invited.inviterName} · ${invited.inviterEmail}`
                  : invited.inviterName,
              })}
            </p>
          )}
          <p className="mt-[4px] text-[14px] text-cf-ink-muted">
            {invited
              ? t(
                  'register_invited_subtitle',
                  'Create a password to join. Your email address comes from the invitation.'
                )
              : t(
                  'sign_up_subtitle',
                  'Create a workspace for your content operation.'
                )}
          </p>
        </div>

        {invitationIssueNote && (
          <div
            role="status"
            className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[16px]"
          >
            <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
              {invitationIssueNote}
            </p>
          </div>
        )}

        {providers && (
          <div className="flex flex-col gap-[16px]">
            <div className="text-[13px] font-[600] text-cf-ink-muted">
              {t('continue_with', 'Continue With')}
            </div>
            {providers}
            <AuthDivider label={t('or', 'or')} />
          </div>
        )}

        {/* `content-factory-next-fn33.44`: the fields used to sit flush against
            each other, so the red row under the password ran straight into the
            label of the field below and read as part of it. */}
        <div className="flex flex-col gap-[12px]">
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
                // `readOnly` rather than `disabled`: a disabled field is left
                // out of the submitted values, and this address is the one
                // thing the registration must carry.
                readOnly={emailLocked}
                helper={
                  emailLocked
                    ? t(
                        'register_invited_email_locked',
                        'The invitation was sent to this address.'
                      )
                    : undefined
                }
              />
              <PasswordInput
                label="Password"
                translationKey="field_required"
                translationParams={{
                  field: t('label_password', 'Password'),
                }}
                {...form.register('password')}
                error={localizedPasswordError}
                autoComplete="new-password"
                required
                placeholder={t('label_password', 'Password')}
                showPasswordLabel={t('show_password', 'Show password')}
                hidePasswordLabel={t('hide_password', 'Hide password')}
                // `content-factory-next-fn33.44`: the hint and the refusal say
                // the same thing, so showing both printed one sentence twice —
                // once grey, once red. The refusal replaces the hint it
                // repeats.
                helper={
                  localizedPasswordError
                    ? undefined
                    : t(
                        'password_policy_hint',
                        'Use {{min}}–{{max}} characters with a letter, a number, and a special character.',
                        PASSWORD_POLICY_RANGE
                      )
                }
              />
            </>
          )}
          {/* `content-factory-next-fn33.18`: an invited registration founds no
              workspace, so there is nothing here to name. Asking for one and
              then ignoring it is how the owner ended up with two workspaces,
              one of them empty. */}
          {!invited && (
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
          )}
        </div>

        <div className="flex flex-col gap-[16px]">
          <LegalNotice invited={!!invited} />
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
            {invited
              ? t('register_invited_action', 'Create password and join')
              : t('create_account', 'Create Account')}
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
