'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';

type IdentityProvider =
  | 'LOCAL'
  | 'GITHUB'
  | 'GOOGLE'
  | 'FARCASTER'
  | 'WALLET'
  | 'GENERIC'
  | 'TELEGRAM';

type ExternalIdentityProvider = Exclude<IdentityProvider, 'LOCAL'>;

export type UserIdentity = {
  provider: IdentityProvider;
  providerIdentifier: string;
  linkedAt: string;
};

type IdentityLinkIntent = {
  provider: ExternalIdentityProvider;
  redirectUri: string;
  state?: string;
  expiresAt: number;
};

type Request = (url: string, options?: RequestInit) => Promise<Response>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type SearchParamsLike = Pick<URLSearchParams, 'has'>;
type Translate = ReturnType<typeof useT>;

export const IDENTITY_LINK_INTENT_KEY = 'content-factory:identity-link-intent';
export const IDENTITY_LINK_INTENT_TTL_MS = 5 * 60 * 1000;
export const IDENTITY_CONFIRMATION_PARAM = 'identity_confirmation';

export function initialSettingsTab(searchParams: SearchParamsLike) {
  return searchParams.has('code') ||
    searchParams.has(IDENTITY_CONFIRMATION_PARAM)
    ? 'sign_in_methods'
    : 'global_settings';
}

/**
 * Providers this page can start a connection for. FARCASTER and WALLET are not
 * here: the backend refuses to link them because their token exchange is not
 * bound to the browser that started it, and offering a button for a refusal is
 * worse than offering nothing.
 */
const EXTERNAL_PROVIDERS = new Set<IdentityProvider>([
  'GITHUB',
  'GOOGLE',
  'GENERIC',
  'TELEGRAM',
]);

/**
 * Brand names, spelled the way the brand spells them. `GITHUB.toLowerCase()`
 * with one capital gives "Github", which is not the name of anything. These are
 * not translated: a product name is the same word in every locale, and the one
 * label that is a description rather than a name — the password method — goes
 * through `t` like all other copy.
 */
const PROVIDER_NAMES: Record<Exclude<IdentityProvider, 'LOCAL'>, string> = {
  GITHUB: 'GitHub',
  GOOGLE: 'Google',
  TELEGRAM: 'Telegram',
  FARCASTER: 'Farcaster',
  WALLET: 'Wallet',
  GENERIC: 'Single sign-on',
};

/**
 * Every refusal the backend can name, and the translated sentence each one
 * becomes. The backend writes English for its logs; the page must never forward
 * that English to someone reading in one of the other fifteen locales, so an
 * unrecognised code falls back to the caller's own key rather than to whatever
 * text arrived over the wire.
 */
const BACKEND_ERRORS: Record<string, { key: string; message: string }> = {
  identity_already_linked: {
    key: 'identity_already_linked',
    message: 'This address is already connected to an account.',
  },
  password_sign_in_already_connected: {
    key: 'password_sign_in_already_connected',
    message: 'This account already has an email and password method.',
  },
  last_sign_in_method_protected: {
    key: 'last_sign_in_method_protected',
    message: 'Your last sign-in method cannot be removed.',
  },
  identity_not_found: {
    key: 'sign_in_method_not_found',
    message: 'This sign-in method is no longer connected.',
  },
  identity_confirmation_expired: {
    key: 'identity_confirmation_expired',
    message: 'This confirmation link has expired or was already used.',
  },
  identity_confirmation_wrong_account: {
    key: 'identity_confirmation_wrong_account',
    message: 'This confirmation link belongs to a different account.',
  },
  email_plus_not_allowed: {
    key: 'email_plus_not_allowed',
    message: 'An address with a plus sign cannot be used here.',
  },
  unsupported_sign_in_provider: {
    key: 'unsupported_sign_in_provider',
    message: 'This sign-in provider is not supported.',
  },
  identity_mutation_forbidden: {
    key: 'sign_in_method_request_refused',
    message: 'This request was refused. Reload the page and try again.',
  },
  sign_in_method_busy: {
    key: 'sign_in_method_change_failed',
    message: 'The sign-in method could not be changed.',
  },
  identity_mutations_unavailable: {
    key: 'sign_in_methods_unavailable',
    message: 'Sign-in methods cannot be changed on this deployment right now.',
  },
  identity_confirmation_unavailable: {
    key: 'sign_in_methods_unavailable',
    message: 'Sign-in methods cannot be changed on this deployment right now.',
  },
};

class IdentityMethodError extends Error {
  constructor(readonly translationKey: string, message: string) {
    super(message);
    this.name = 'IdentityMethodError';
  }
}

async function responseErrorCode(response: Response) {
  try {
    const body = await response.text();
    if (!body) return null;
    return (JSON.parse(body).code as string) || null;
  } catch {
    return null;
  }
}

async function requireOk(
  response: Response,
  translationKey: string,
  fallback: string
) {
  if (!response.ok) {
    const code = await responseErrorCode(response);
    const named = code ? BACKEND_ERRORS[code] : undefined;
    throw new IdentityMethodError(
      named?.key ?? translationKey,
      named?.message ?? fallback
    );
  }
  return response;
}

function trustedSettingsRedirect(origin: string) {
  return new URL('/settings', origin).toString();
}

/**
 * Asks for the address; does not get it. Nothing is connected here — the reply
 * says a confirmation was sent, and the method appears only after the link in
 * that mailbox is opened. So there is nothing to refresh yet.
 */
export async function linkLocalIdentity({
  email,
  password,
  request,
}: {
  email: string;
  password: string;
  request: Request;
}) {
  const response = await requireOk(
    await request('/user/identities/link', {
      method: 'POST',
      body: JSON.stringify({ provider: 'LOCAL', email, password }),
    }),
    'add_email_password_failed',
    'Could not add email and password.'
  );
  const pending = (await response.json()) as {
    email?: string;
    expiresInMinutes?: number;
  };
  return {
    email: pending.email || email.trim().toLowerCase(),
    expiresInMinutes: pending.expiresInMinutes ?? 20,
  };
}

/**
 * Spends the link from the mailbox. The token travels in the request body, not
 * in a query string the browser would keep in history — the caller has already
 * taken it out of the address bar by the time this runs.
 */
export async function confirmLocalIdentity({
  token,
  request,
  refresh,
}: {
  token: string;
  request: Request;
  refresh: () => Promise<unknown>;
}) {
  await requireOk(
    await request('/user/identities/confirm', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
    'confirm_email_address_failed',
    'Could not confirm this email address.'
  );
  await refresh();
}

export async function unlinkUserIdentity({
  identity,
  request,
  refresh,
}: {
  identity: UserIdentity;
  request: Request;
  refresh: () => Promise<unknown>;
}) {
  await requireOk(
    await request('/user/identities/unlink', {
      method: 'DELETE',
      body: JSON.stringify({
        provider: identity.provider,
        providerIdentifier: identity.providerIdentifier,
      }),
    }),
    'remove_sign_in_method_failed',
    'Could not remove this sign-in method.'
  );
  await refresh();
}

export async function beginExternalIdentityLink({
  provider,
  origin,
  request,
  storage,
  navigate,
  now = Date.now(),
}: {
  provider: ExternalIdentityProvider;
  origin: string;
  request: Request;
  storage: Pick<StorageLike, 'setItem'>;
  navigate: (url: string) => void;
  now?: number;
}) {
  if (!EXTERNAL_PROVIDERS.has(provider)) {
    throw new IdentityMethodError(
      'unsupported_sign_in_provider',
      'Unsupported sign-in provider.'
    );
  }
  const redirectUri = trustedSettingsRedirect(origin);
  const response = await requireOk(
    await request(
      `/auth/oauth/${provider}?redirect_uri=${encodeURIComponent(redirectUri)}`
    ),
    'start_provider_connection_failed',
    'Could not start provider connection.'
  );
  const authorizationUrl = await response.text();
  const parsedAuthorizationUrl = new URL(authorizationUrl);
  const state = parsedAuthorizationUrl.searchParams.get('state') || undefined;
  const intent: IdentityLinkIntent = {
    provider,
    redirectUri,
    state,
    expiresAt: now + IDENTITY_LINK_INTENT_TTL_MS,
  };
  storage.setItem(IDENTITY_LINK_INTENT_KEY, JSON.stringify(intent));
  navigate(authorizationUrl);
}

function parseLinkIntent(
  raw: string | null,
  origin: string,
  callbackState: string,
  now: number
) {
  if (!raw) {
    throw new IdentityMethodError(
      'identity_link_not_started',
      'This connection was not started from this browser tab.'
    );
  }
  let intent: IdentityLinkIntent;
  try {
    intent = JSON.parse(raw) as IdentityLinkIntent;
  } catch {
    throw new IdentityMethodError(
      'identity_link_not_started',
      'This connection was not started from this browser tab.'
    );
  }
  if (!EXTERNAL_PROVIDERS.has(intent.provider)) {
    throw new IdentityMethodError(
      'identity_link_unsupported_provider',
      'This connection has an unsupported provider.'
    );
  }
  if (intent.expiresAt <= now) {
    throw new IdentityMethodError(
      'identity_link_expired',
      'This connection attempt expired. Start it again.'
    );
  }
  if (intent.redirectUri !== trustedSettingsRedirect(origin)) {
    throw new IdentityMethodError(
      'identity_link_invalid_origin',
      'This connection callback has an invalid origin.'
    );
  }
  if (intent.state && intent.state !== callbackState) {
    throw new IdentityMethodError(
      'identity_link_invalid_state',
      'This connection callback has an invalid state.'
    );
  }
  return intent;
}

export async function completeExternalIdentityLink({
  origin,
  search,
  request,
  storage,
  refresh,
  clearCallback,
  now = Date.now(),
}: {
  origin: string;
  search: string;
  request: Request;
  storage: Pick<StorageLike, 'getItem' | 'removeItem'>;
  refresh: () => Promise<unknown>;
  clearCallback: () => void;
  now?: number;
}) {
  const query = new URLSearchParams(search);
  const code = query.get('code');
  if (!code) return null;
  const state = query.get('state') || '';
  // Claim the intent synchronously, before the first network await. React
  // Strict Mode may run the mount effect twice in development; the second
  // consumer must see an empty slot rather than repeat an account-link call.
  const rawIntent = storage.getItem(IDENTITY_LINK_INTENT_KEY);
  storage.removeItem(IDENTITY_LINK_INTENT_KEY);

  try {
    const intent = parseLinkIntent(rawIntent, origin, state, now);
    await requireOk(
      await request('/user/identities/link', {
        method: 'POST',
        body: JSON.stringify({
          provider: intent.provider,
          code,
          state,
          redirectUri: intent.redirectUri,
        }),
      }),
      'connect_sign_in_method_failed',
      'Could not connect this sign-in method.'
    );
    await refresh();
    return intent.provider;
  } finally {
    clearCallback();
  }
}

const providerLabel = (
  provider: IdentityProvider,
  genericName?: string,
  t?: Translate
) => {
  if (provider === 'LOCAL')
    return (
      t?.('email_and_password', 'Email and password') || 'Email and password'
    );
  if (provider === 'GENERIC' && genericName) return genericName;
  return PROVIDER_NAMES[provider] || provider;
};

const StatusMark = ({ connected = true }: { connected?: boolean }) => (
  <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
    {connected ? (
      <path
        d="m5 8 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <path
        d="M5.5 8h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    )}
  </svg>
);

export function SignInMethodsView({
  identities,
  availableProviders,
  loading = false,
  error,
  actionError,
  statusMessage,
  busyProvider,
  email,
  password,
  fieldError,
  genericName,
  pendingConfirmation,
  onRetry,
  onEmailChange,
  onPasswordChange,
  onLinkLocal,
  onLinkExternal,
  onUnlink,
}: {
  identities: UserIdentity[];
  availableProviders: IdentityProvider[];
  loading?: boolean;
  error?: string;
  actionError?: string;
  statusMessage?: string;
  busyProvider?: IdentityProvider | 'CALLBACK' | null;
  email: string;
  password: string;
  fieldError?: string;
  genericName?: string;
  pendingConfirmation?: { email: string; expiresInMinutes: number } | null;
  onRetry: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLinkLocal: () => void;
  onLinkExternal: (provider: ExternalIdentityProvider) => void;
  onUnlink: (identity: UserIdentity) => void;
}) {
  const t = useT();
  const connectedProviders = new Set(
    identities.map(({ provider }) => provider)
  );
  const available = availableProviders.filter(
    (provider) => !connectedProviders.has(provider)
  );
  const allActionsDisabled = Boolean(busyProvider);

  if (loading) {
    return (
      <section
        data-testid="sign-in-methods-skeleton"
        aria-busy="true"
        aria-live="polite"
        className="flex w-full max-w-[720px] flex-col gap-[20px]"
      >
        <h2 className="cf-heading-md text-cf-ink">
          {t('sign_in_methods', 'Sign-in methods')}
        </h2>
        <p className="sr-only">
          {t('loading_sign_in_methods', 'Loading sign-in methods…')}
        </p>
        <div
          aria-hidden
          className="overflow-hidden rounded-[8px] border border-cf-border bg-cf-surface"
        >
          {[0, 1].map((row) => (
            <div
              key={row}
              data-testid="sign-in-method-skeleton-row"
              className="flex min-h-[72px] items-center justify-between gap-[16px] border-b border-cf-border p-[16px] last:border-b-0"
            >
              <div className="flex flex-1 flex-col gap-[8px]">
                <span className="h-[16px] w-[144px] max-w-full rounded-[4px] bg-cf-surface-subtle motion-safe:animate-pulse" />
                <span className="h-[12px] w-[220px] max-w-[75%] rounded-[4px] bg-cf-surface-subtle motion-safe:animate-pulse" />
              </div>
              <span className="h-[44px] w-[88px] rounded-[8px] bg-cf-surface-subtle motion-safe:animate-pulse md:h-[40px]" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex max-w-[720px] flex-col gap-[16px]">
        <h2 className="cf-heading-md text-cf-ink">
          {t('sign_in_methods', 'Sign-in methods')}
        </h2>
        <div
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[16px]"
        >
          <p className="cf-body-md text-cf-danger">{error}</p>
          <Button
            variant="secondary"
            className="mt-[12px] cf-control-h"
            onClick={onRetry}
          >
            {t('try_again', 'Try again')}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex w-full max-w-[720px] flex-col gap-[20px]">
      <header>
        <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {t('sign_in_methods', 'Sign-in methods')}
        </h2>
        <p className="mt-[4px] max-w-[70ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
          {t(
            'sign_in_methods_subtitle',
            'Use any connected method to sign in. Add another before removing the one you use now.'
          )}
        </p>
      </header>

      {actionError && (
        <p
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-danger"
        >
          {actionError}
        </p>
      )}
      <p aria-live="polite" className="min-h-[20px] cf-body-sm text-cf-accent">
        {statusMessage}
      </p>

      {!identities.length && (
        <div className="rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[12px]">
          <p className="cf-body-sm text-cf-warning">
            {t(
              'no_sign_in_methods_listed',
              'No sign-in methods are listed yet. Connect one before signing out.'
            )}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-[8px] border border-cf-border bg-cf-surface">
        {identities.map((identity) => {
          const protectedRemoval = identities.length <= 1;
          const loadingThis = busyProvider === identity.provider;
          return (
            <div
              key={`${identity.provider}:${identity.providerIdentifier}`}
              className="flex min-h-[72px] flex-col gap-[12px] border-b border-cf-border p-[16px] last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[8px]">
                  <h3 className="cf-label-md text-cf-ink">
                    {providerLabel(identity.provider, genericName, t)}
                  </h3>
                  <span className="inline-flex items-center gap-[4px] rounded-full border border-cf-accent bg-cf-accent-soft px-[8px] py-[4px] cf-caption text-cf-accent">
                    <StatusMark />{' '}
                    {t('sign_in_method_connected', 'Connected')}
                  </span>
                </div>
                <p className="mt-[4px] cf-body-sm text-cf-ink-muted [overflow-wrap:anywhere] [text-wrap:pretty]">
                  {identity.provider === 'LOCAL'
                    ? identity.providerIdentifier
                    : t(
                        'verified_provider_account',
                        'Verified provider account'
                      )}
                </p>
                {protectedRemoval && (
                  <p className="mt-[4px] cf-body-sm text-cf-warning [text-wrap:pretty]">
                    {t(
                      'keep_one_sign_in_method',
                      'Keep at least one sign-in method connected to avoid losing access.'
                    )}
                  </p>
                )}
              </div>
              <Button
                variant="quiet"
                className="cf-control-h"
                disabled={protectedRemoval || allActionsDisabled}
                loading={loadingThis}
                loadingLabel={t(
                  'removing_sign_in_method',
                  'Removing sign-in method'
                )}
                onClick={() => onUnlink(identity)}
              >
                {t('remove', 'Remove')}
              </Button>
            </div>
          );
        })}

        {available.map((provider) => (
          <div
            key={provider}
            className="flex min-h-[72px] flex-col gap-[12px] border-b border-cf-border p-[16px] last:border-b-0"
          >
            <div className="flex flex-col gap-[12px] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-[8px]">
                  <h3 className="cf-label-md text-cf-ink">
                    {providerLabel(provider, genericName, t)}
                  </h3>
                  <span className="inline-flex items-center gap-[4px] rounded-full border border-cf-border-control bg-cf-surface-subtle px-[8px] py-[4px] cf-caption text-cf-ink-muted">
                    <StatusMark connected={false} />{' '}
                    {t('available', 'Available')}
                  </span>
                </div>
                <p className="mt-[4px] cf-body-sm text-cf-ink-muted">
                  {provider === 'LOCAL'
                    ? t(
                        'add_password_backup_method',
                        'Add an email and password as a backup method.'
                      )
                    : t(
                        'connect_provider_sign_in',
                        'Connect this provider to use it on the sign-in screen.'
                      )}
                </p>
                {provider === 'LOCAL' && (
                  <p className="mt-[4px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                    {t(
                      'add_password_confirmation_note',
                      'We send a confirmation link to that address. The method is added once you open it.'
                    )}
                  </p>
                )}
              </div>
              {provider !== 'LOCAL' && (
                <Button
                  variant="secondary"
                  className="cf-control-h"
                  disabled={allActionsDisabled}
                  loading={busyProvider === provider}
                  loadingLabel={t('connecting_provider', 'Connecting provider')}
                  onClick={() => onLinkExternal(provider)}
                >
                  {t('connect', 'Connect')}
                </Button>
              )}
            </div>

            {provider === 'LOCAL' && pendingConfirmation && (
              <p
                data-testid="identity-confirmation-pending"
                role="status"
                className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-accent [overflow-wrap:anywhere] [text-wrap:pretty]"
              >
                {t(
                  'email_confirmation_sent',
                  'Confirmation sent to {{email}}. Open the link within {{minutes}} minutes to finish adding this method.',
                  {
                    email: pendingConfirmation.email,
                    minutes: String(pendingConfirmation.expiresInMinutes),
                  }
                )}
              </p>
            )}

            {provider === 'LOCAL' && (
              <div className="grid gap-[12px] border-t border-cf-border bg-cf-surface-subtle p-[12px] sm:grid-cols-2">
                {/*
                  `disableForm` rather than `standalone`: this pair is not
                  inside a react-hook-form provider, but the message row still
                  has to be reserved. A standalone field only draws the row when
                  it has something to say, and the two fields sit in one grid
                  row — the moment one of them found an error, the other would
                  jump.
                */}
                <Input
                  disableForm
                  id="sign-in-method-email"
                  name="sign-in-method-email"
                  label={t('email', 'Email')}
                  error={fieldError}
                  type="email"
                  autoComplete="email"
                  value={email}
                  disabled={allActionsDisabled}
                  className="cf-control-h"
                  onChange={(event) => onEmailChange(event.target.value)}
                />
                <Input
                  disableForm
                  id="sign-in-method-password"
                  name="sign-in-method-password"
                  label={t('password', 'Password')}
                  helper={t(
                    'password_minimum_six_characters',
                    'At least 6 characters.'
                  )}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  disabled={allActionsDisabled}
                  className="cf-control-h"
                  onChange={(event) => onPasswordChange(event.target.value)}
                />
                <div className="sm:col-span-2 sm:justify-self-end">
                  <Button
                    variant="primary"
                    className="cf-control-h"
                    disabled={
                      allActionsDisabled || !email || password.length < 6
                    }
                    loading={busyProvider === 'LOCAL'}
                    loadingLabel={t(
                      'adding_email_and_password',
                      'Adding email and password'
                    )}
                    onClick={onLinkLocal}
                  >
                    {t('add_password', 'Add password')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export const SignInMethodsComponent = () => {
  const request = useFetch();
  const variables = useVariables();
  const t = useT();
  const [busyProvider, setBusyProvider] = useState<
    IdentityProvider | 'CALLBACK' | null
  >(null);
  const [actionError, setActionError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    email: string;
    expiresInMinutes: number;
  } | null>(null);

  const load = useCallback(async () => {
    const response = await requireOk(
      await request('/user/identities'),
      'sign_in_methods_load_failed',
      'Could not load sign-in methods.'
    );
    return (await response.json()) as UserIdentity[];
  }, [request]);
  const { data, error, mutate, isLoading } = useSWR('/user/identities', load, {
    revalidateOnFocus: false,
  });

  const availableProviders = useMemo<IdentityProvider[]>(() => {
    if (!variables.isGeneral) return ['LOCAL', 'GITHUB'];
    if (variables.genericOauth) return ['LOCAL', 'GENERIC'];
    return [
      'LOCAL',
      ...(variables.googleAuthEnabled ? (['GOOGLE'] as const) : []),
      ...(variables.telegramLoginEnabled ? (['TELEGRAM'] as const) : []),
    ];
  }, [
    variables.isGeneral,
    variables.genericOauth,
    variables.googleAuthEnabled,
    variables.telegramLoginEnabled,
  ]);

  const run = useCallback(
    async (
      provider: IdentityProvider | 'CALLBACK',
      operation: () => Promise<void>
    ) => {
      setBusyProvider(provider);
      setActionError('');
      setStatusMessage('');
      try {
        await operation();
      } catch (caught) {
        setActionError(
          caught instanceof IdentityMethodError
            ? t(caught.translationKey, caught.message)
            : caught instanceof Error
            ? caught.message
            : t(
                'sign_in_method_change_failed',
                'The sign-in method could not be changed.'
              )
        );
      } finally {
        setBusyProvider(null);
      }
    },
    [t]
  );

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !new URLSearchParams(window.location.search).has('code')
    ) {
      return;
    }
    void run('CALLBACK', async () => {
      const provider = await completeExternalIdentityLink({
        origin: window.location.origin,
        search: window.location.search,
        request,
        storage: window.sessionStorage,
        refresh: () => mutate(),
        clearCallback: () => {
          const cleaned = new URL(window.location.href);
          cleaned.searchParams.delete('code');
          cleaned.searchParams.delete('state');
          window.history.replaceState(null, '', cleaned.toString());
        },
      });
      if (provider)
        setStatusMessage(
          t('provider_now_connected', '{{provider}} is now connected.', {
            provider: providerLabel(provider, undefined, t),
          })
        );
    });
  }, [mutate, request, run, t]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Claimed synchronously, before the first await, for the same reason the
    // provider callback is: a second Strict Mode pass must find the slot empty
    // rather than spend the confirmation twice.
    const query = new URLSearchParams(window.location.search);
    const token = query.get(IDENTITY_CONFIRMATION_PARAM);
    if (!token) return;

    const cleaned = new URL(window.location.href);
    cleaned.searchParams.delete(IDENTITY_CONFIRMATION_PARAM);
    window.history.replaceState(null, '', cleaned.toString());

    void run('LOCAL', async () => {
      await confirmLocalIdentity({
        token,
        request,
        refresh: () => mutate(),
      });
      setPendingConfirmation(null);
      setStatusMessage(
        t(
          'email_password_now_connected',
          'Email and password are now connected.'
        )
      );
    });
  }, [mutate, request, run, t]);

  const connectExternal = useCallback(
    (provider: ExternalIdentityProvider) => {
      void run(provider, async () => {
        if (
          variables.frontEndUrl &&
          new URL(variables.frontEndUrl).origin !== window.location.origin
        ) {
          throw new Error(
            t(
              'invalid_frontend_origin',
              'This page is not running on the configured frontend origin.'
            )
          );
        }
        await beginExternalIdentityLink({
          provider,
          origin: window.location.origin,
          request,
          storage: window.sessionStorage,
          navigate: (url) => window.location.assign(url),
        });
      });
    },
    [request, run, t, variables.frontEndUrl]
  );

  const connectLocal = useCallback(() => {
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFieldError(t('enter_valid_email', 'Enter a valid email address.'));
      return;
    }
    if (password.length < 6) {
      setFieldError(t('use_six_characters', 'Use at least 6 characters.'));
      return;
    }
    setFieldError('');
    void run('LOCAL', async () => {
      const pending = await linkLocalIdentity({
        email: normalizedEmail,
        password,
        request,
      });
      setPassword('');
      setPendingConfirmation(pending);
      setStatusMessage(
        t(
          'email_confirmation_sent',
          'Confirmation sent to {{email}}. Open the link within {{minutes}} minutes to finish adding this method.',
          {
            email: pending.email,
            minutes: String(pending.expiresInMinutes),
          }
        )
      );
    });
  }, [email, password, request, run, t]);

  const unlink = useCallback(
    (identity: UserIdentity) => {
      void run(identity.provider, async () => {
        await unlinkUserIdentity({
          identity,
          request,
          refresh: () => mutate(),
        });
        setStatusMessage(
          t('provider_was_removed', '{{provider}} was removed.', {
            provider: providerLabel(identity.provider, undefined, t),
          })
        );
      });
    },
    [mutate, request, run, t]
  );

  return (
    <SignInMethodsView
      identities={data || []}
      availableProviders={availableProviders}
      loading={isLoading || (data === undefined && !error)}
      error={
        error
          ? t('sign_in_methods_load_failed', 'Could not load sign-in methods.')
          : undefined
      }
      actionError={actionError}
      statusMessage={statusMessage}
      busyProvider={busyProvider}
      email={email}
      password={password}
      fieldError={fieldError}
      genericName={variables.oauthDisplayName}
      pendingConfirmation={pendingConfirmation}
      onRetry={() => void mutate()}
      onEmailChange={(value) => {
        setEmail(value);
        setFieldError('');
      }}
      onPasswordChange={(value) => {
        setPassword(value);
        setFieldError('');
      }}
      onLinkLocal={connectLocal}
      onLinkExternal={connectExternal}
      onUnlink={unlink}
    />
  );
};
