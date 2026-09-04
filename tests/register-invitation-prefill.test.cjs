/**
 * The invited address, in the registration form.
 *
 * An invitation issued to one address can only be accepted by that address:
 * registering under another one ends in `invite_email_mismatch` after the
 * account already exists, and with approval switched on that discovery arrives
 * days later. The form cannot read the pending-invitation cookie — it is
 * `httpOnly` — so the only trace it has is the return address the proxy put in
 * the query, or the copy `ReturnUrlComponent` left in `localStorage`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/auth',
});

for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  Object.defineProperty(global, key, {
    configurable: true,
    get: () => dom.window[key],
  });
}
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const ts = require('typescript');
const {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} = require('@testing-library/react');

const repositoryRoot = path.resolve(__dirname, '..');
const registerFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/auth/register.tsx'
);

const h = React.createElement;
const emptyProvider = () => null;

const inviteToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImludjEyIiwib3JnSWQiOiJvcmcifQ.c2lnbmF0dXJlLXZhbHVl';
const PUBLIC_ORIGIN = 'https://example.test';

let searchParams = new URLSearchParams();
let previewBody = {};
let previewOk = true;
const fetchCalls = [];

const appFetch = jest.fn(async (url, options) => {
  fetchCalls.push({ url, method: options?.method || 'GET' });
  // The door open without a session. `/user/join-org` is behind
  // `AuthMiddleware` and answers this page Forbidden, so a request there would
  // be the defect, not the feature — anything else falls through to the
  // registration branch below and fails the call assertion.
  if (String(url).startsWith('/auth/join-org')) {
    return {
      ok: previewOk,
      status: previewOk ? 200 : 410,
      headers: new Headers(),
      json: async () => previewBody,
    };
  }
  return { ok: true, status: 200, headers: new Headers() };
});

const mocks = {
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => appFetch },
  '@contentfactory/react/form/button': {
    Button: ({ loading, children, ...props }) =>
      h('button', { ...props, disabled: props.disabled || loading }, children),
  },
  '@contentfactory/react/form/checkbox.field': {
    CheckboxField: ({ label, ...props }) =>
      h('label', {}, label, h('input', { type: 'checkbox', ...props })),
  },
  '@contentfactory/helpers/auth/newsletter.consent': {
    canOfferNewsletterConsent: () => false,
  },
  '@contentfactory/react/form/input': {
    Input: ({
      label,
      translationKey: _translationKey,
      translationParams: _translationParams,
      helper: _helper,
      error: _error,
      ...props
    }) => h('label', {}, label, h('input', { 'aria-label': label, ...props })),
  },
  '@hookform/resolvers/class-validator': {
    classValidatorResolver: () => async (values) => ({ values, errors: {} }),
  },
  '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
    CreateOrgUserDto: class CreateOrgUserDto {},
  },
  '@contentfactory/nestjs-libraries/dtos/auth/password.policy': {
    PASSWORD_POLICY: { minLength: 7, maxLength: 64 },
  },
  '@contentfactory/frontend/components/auth/providers/github.provider': {
    GithubProvider: emptyProvider,
  },
  '@contentfactory/frontend/components/auth/providers/google.provider': {
    GoogleProvider: emptyProvider,
  },
  '@contentfactory/frontend/components/auth/providers/oauth.provider': {
    OauthProvider: emptyProvider,
  },
  '@contentfactory/frontend/components/auth/providers/farcaster.provider': {
    FarcasterProvider: emptyProvider,
  },
  '@contentfactory/frontend/components/auth/providers/telegram.provider': {
    TelegramProvider: emptyProvider,
  },
  '@contentfactory/frontend/components/layout/loading': {
    LoadingComponent: emptyProvider,
  },
  '@contentfactory/frontend/components/auth/auth.divider': {
    AuthDivider: emptyProvider,
  },
  '@contentfactory/frontend/components/auth/legal.notice': {
    LegalNotice: () => h('p', {}, 'Legal notice'),
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({
      isGeneral: true,
      genericOauth: false,
      neynarClientId: '',
      googleAuthEnabled: false,
      telegramLoginEnabled: false,
    }),
  },
  '@contentfactory/react/form/password-input': {
    // The real control hands these to a translation component, never to the
    // DOM node; a mock that spreads them invents a React warning the product
    // does not produce.
    PasswordInput: ({
      label,
      showPasswordLabel: _show,
      hidePasswordLabel: _hide,
      translationKey: _translationKey,
      translationParams: _translationParams,
      helper: _helper,
      error: _error,
      ...props
    }) => h('label', {}, label, h('input', { 'aria-label': label, ...props })),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (_key, fallback) => fallback,
  },
  'next/navigation': {
    useRouter: () => ({ push: jest.fn() }),
    useSearchParams: () => searchParams,
  },
  'next/link': ({ href, children, ...props }) =>
    h('a', { href, ...props }, children),
  clsx: (...values) => values.filter(Boolean).join(' '),
};

const compiled = ts.transpileModule(fs.readFileSync(registerFile, 'utf8'), {
  fileName: registerFile,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const loaded = { exports: {} };
new Function(
  'exports',
  'require',
  'module',
  '__filename',
  '__dirname',
  compiled
)(
  loaded.exports,
  (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request),
  loaded,
  registerFile,
  path.dirname(registerFile)
);
const { RegisterAfter, invitationTokenFromReturnUrl } = loaded.exports;

const returnUrlFor = (token) =>
  `${PUBLIC_ORIGIN}/join-org?org=${encodeURIComponent(token)}`;
const emailField = () => screen.getByRole('textbox', { name: 'Email' });

beforeEach(() => {
  searchParams = new URLSearchParams();
  previewBody = {};
  previewOk = true;
  fetchCalls.length = 0;
  appFetch.mockClear();
  window.localStorage.clear();
});

afterEach(cleanup);

describe('the invitation an anonymous registration came from', () => {
  test('is read from the return address and nothing else', () => {
    expect(invitationTokenFromReturnUrl(returnUrlFor(inviteToken))).toBe(
      inviteToken
    );
    expect(invitationTokenFromReturnUrl(`/join-org?org=${inviteToken}`)).toBe(
      inviteToken
    );

    for (const value of [
      undefined,
      null,
      '',
      `${PUBLIC_ORIGIN}/launches?org=${inviteToken}`,
      `${PUBLIC_ORIGIN}/join-org?org=marketing-campaign`,
      `${PUBLIC_ORIGIN}/join-org`,
      'not a url at all ::',
    ]) {
      expect(invitationTokenFromReturnUrl(value)).toBe('');
    }
  });
});

describe('registration form prefilled from an invitation', () => {
  test('fills the invited address in from the return address', async () => {
    searchParams = new URLSearchParams({ returnUrl: returnUrlFor(inviteToken) });
    previewBody = { workspaceName: 'Studio', boundEmail: 'invited@example.com' };

    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));

    await waitFor(() => expect(emailField().value).toBe('invited@example.com'));
    expect(fetchCalls).toEqual([
      { url: `/auth/join-org?org=${encodeURIComponent(inviteToken)}`, method: 'GET' },
    ]);
  });

  test('finds the invitation in stored state after a detour through sign-in', async () => {
    window.localStorage.setItem('returnUrl', returnUrlFor(inviteToken));
    previewBody = { boundEmail: 'invited@example.com' };

    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));

    await waitFor(() => expect(emailField().value).toBe('invited@example.com'));
  });

  test('leaves the field alone for an invitation open to any address', async () => {
    searchParams = new URLSearchParams({ returnUrl: returnUrlFor(inviteToken) });
    previewBody = { workspaceName: 'Studio' };

    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));

    await waitFor(() => expect(appFetch).toHaveBeenCalledTimes(1));
    expect(emailField().value).toBe('');
  });

  test('never overwrites an address the person is already typing', async () => {
    searchParams = new URLSearchParams({ returnUrl: returnUrlFor(inviteToken) });
    previewBody = { boundEmail: 'invited@example.com' };
    let release;
    appFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              status: 200,
              headers: new Headers(),
              json: async () => previewBody,
            });
        })
    );

    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));
    fireEvent.change(emailField(), { target: { value: 'me@example.com' } });
    release();

    await waitFor(() => expect(appFetch).toHaveBeenCalledTimes(1));
    expect(emailField().value).toBe('me@example.com');
  });

  test('asks for nothing when there is no invitation, and survives a dead one', async () => {
    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));
    expect(appFetch).not.toHaveBeenCalled();
    cleanup();

    searchParams = new URLSearchParams({ returnUrl: returnUrlFor(inviteToken) });
    previewOk = false;
    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));

    await waitFor(() => expect(appFetch).toHaveBeenCalledTimes(1));
    expect(emailField().value).toBe('');
    expect(
      screen.getByRole('button', { name: 'Create Account' })
    ).toBeDefined();
  });
});
