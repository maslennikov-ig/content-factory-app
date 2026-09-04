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
let previewStatus = 410;
let registerBody = { register: true };
const fetchCalls = [];

const appFetch = jest.fn(async (url, options) => {
  fetchCalls.push({
    url,
    method: options?.method || 'GET',
    body: options?.body ? JSON.parse(options.body) : undefined,
  });
  // The door open without a session. `/user/join-org` is behind
  // `AuthMiddleware` and answers this page Forbidden, so a request there would
  // be the defect, not the feature — anything else falls through to the
  // registration branch below and fails the call assertion.
  if (String(url).startsWith('/auth/join-org')) {
    return {
      ok: previewOk,
      status: previewOk ? 200 : previewStatus,
      headers: new Headers(),
      json: async () => previewBody,
    };
  }
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => registerBody,
  };
});

const routerPush = jest.fn();

const { formErrorsMock } = require('./helpers/form-errors-mock.cjs');

const mocks = {
  // The shared refusal helper is `.ts`, which this loader cannot compile.
  '@contentfactory/frontend/components/auth/form.errors': formErrorsMock,
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
    // The real `t` interpolates `{{name}}` from the third argument, and the
    // invited heading is built out of one. A mock that returned the raw
    // fallback would pass on a page printing braces at the person.
    useT: () => (_key, fallback, params) =>
      String(fallback).replace(/\{\{(\w+)\}\}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
  },
  'next/navigation': {
    useRouter: () => ({ push: routerPush }),
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

// Leaving through the browser rather than the router is the fix for
// `content-factory-next-fn33.18` and `content-factory-next-fn33.26` alike, so
// the test has to be able to see it happen.
// jsdom refuses to have `location` replaced or `assign` redefined on it, and
// its own `assign` does nothing but log «not implemented». The component
// reaches the object through the global `window`, so that is what is stood in
// for — everything except `location` still comes from the real one, which is
// what `@testing-library` and React are holding.
const assign = jest.fn();
const locationStub = {
  assign,
  replace: () => undefined,
  reload: () => undefined,
  href: dom.window.location.href,
  origin: dom.window.location.origin,
  protocol: dom.window.location.protocol,
  host: dom.window.location.host,
  hostname: dom.window.location.hostname,
  pathname: dom.window.location.pathname,
  search: dom.window.location.search,
  hash: dom.window.location.hash,
  toString: () => dom.window.location.href,
};
Object.defineProperty(global, 'window', {
  configurable: true,
  value: new Proxy(dom.window, {
    get: (target, key) => {
      if (key === 'location') return locationStub;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' && !value.prototype
        ? value.bind(target)
        : value;
    },
  }),
});

beforeEach(() => {
  searchParams = new URLSearchParams();
  previewBody = {};
  previewOk = true;
  previewStatus = 410;
  registerBody = { register: true };
  fetchCalls.length = 0;
  appFetch.mockClear();
  assign.mockClear();
  routerPush.mockClear();
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


/**
 * `content-factory-next-fn33.18`: the form an invited person actually sees.
 *
 * The owner registered through an invitation on 04.09.2026 and got the plain
 * sign-up form: the invited address filled in but editable, a «Workspace
 * name» field for a workspace that would never be theirs, and no sign of who
 * had invited them or where. Everything below is that page, corrected.
 */
describe('the registration form of an invited person', () => {
  const inviteHeading = () => screen.getByRole('heading', { level: 1 });

  const renderInvited = async (preview) => {
    searchParams = new URLSearchParams({ returnUrl: returnUrlFor(inviteToken) });
    previewBody = preview;
    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));
    await waitFor(() =>
      expect(inviteHeading().textContent).toContain('Studio')
    );
  };

  test('names the workspace instead of offering to found one', async () => {
    await renderInvited({
      workspaceName: 'Studio',
      boundEmail: 'invited@example.com',
    });

    expect(inviteHeading().textContent).toBe('You were invited to “Studio”');
    expect(
      screen.queryByRole('textbox', { name: /Workspace name/ })
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Create password and join' })
    ).toBeDefined();
  });

  test('closes the address the invitation was sent to', async () => {
    await renderInvited({
      workspaceName: 'Studio',
      boundEmail: 'invited@example.com',
    });

    const email = emailField();
    expect(email.value).toBe('invited@example.com');
    expect(email.readOnly).toBe(true);
    // Not `disabled`: react-hook-form drops a disabled field from the
    // submitted values, and this address is the whole point of the request.
    expect(email.disabled).toBe(false);
  });

  test('names the inviter when the preview says who it was', async () => {
    await renderInvited({
      workspaceName: 'Studio',
      boundEmail: 'invited@example.com',
      inviterName: 'Ada',
      inviterEmail: 'ada@example.com',
    });

    expect(screen.getByText('Invited by Ada · ada@example.com')).toBeDefined();
  });

  test('says nothing about an inviter the preview withheld', async () => {
    await renderInvited({
      workspaceName: 'Studio',
      boundEmail: 'invited@example.com',
    });

    expect(screen.queryByText(/Invited by/)).toBeNull();
  });

  test('carries the invitation into the registration and lands inside it', async () => {
    registerBody = {
      register: true,
      invitation: { organizationId: 'org-1', workspaceName: 'Studio', role: 'EDITOR' },
    };
    await renderInvited({
      workspaceName: 'Studio',
      boundEmail: 'invited@example.com',
    });

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Passw0rd!' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create password and join' })
    );

    // `content-factory-next-fn33.37`: it used to land on `/`, and the proxy
    // sent it straight back to the invitation page with the token it had just
    // spent — a red «Invitation unavailable» as the first thing a new member
    // saw. It goes to that page deliberately now, flagged as already accepted,
    // so the proxy can clear its own pending-invitation cookie on the way.
    await waitFor(() => expect(assign).toHaveBeenCalled());
    const landing = new URL(assign.mock.calls[0][0], 'http://localhost');
    expect(landing.pathname).toBe('/join-org');
    expect(landing.searchParams.get('org')).toBe(inviteToken);
    expect(landing.searchParams.get('joined')).toBe('1');
    const registration = fetchCalls.find((call) => call.method === 'POST');
    expect(registration.url).toBe('/auth/register');
    expect(registration.body.invitationToken).toBe(inviteToken);
    expect(registration.body.workspaceName).toBeUndefined();
    // The invited path ends signed in; the sign-in page is for everyone else.
    expect(routerPush).not.toHaveBeenCalled();
  });

  test('an ordinary registration still leaves through the router', async () => {
    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));

    fireEvent.change(emailField(), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Passw0rd!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/auth/login'));
    expect(assign).not.toHaveBeenCalled();
  });
});

/**
 * `content-factory-next-fn33.29`: a link that no longer works says so.
 *
 * The owner opened an invitation he had already accepted, in another browser,
 * and got the plain form — no address, no explanation, no mention that the
 * link in the address bar had meant something. The form stays plain, because
 * registering is still available to this person; what it owes them is the
 * reason the rest of it is missing.
 */
describe('a registration form reached by a dead invitation link', () => {
  const renderWithDeadLink = async (code) => {
    searchParams = new URLSearchParams({ returnUrl: returnUrlFor(inviteToken) });
    previewOk = false;
    previewStatus = 410;
    previewBody = { message: 'no', code };
    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));
    await waitFor(() => expect(appFetch).toHaveBeenCalledTimes(1));
  };

  test('says the invitation was already used, and stays a registration form', async () => {
    await renderWithDeadLink('invite_used');

    await waitFor(() =>
      expect(
        screen.getByText(/That invitation link has already been used/)
      ).toBeDefined()
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Sign Up'
    );
    expect(
      screen.getByRole('button', { name: 'Create Account' })
    ).toBeDefined();
    expect(emailField().readOnly).toBe(false);
  });

  test('says the invitation expired when that is what happened', async () => {
    await renderWithDeadLink('invite_invalid');

    await waitFor(() =>
      expect(
        screen.getByText(/That invitation link has expired/)
      ).toBeDefined()
    );
  });

  test('does not carry a dead token into the registration', async () => {
    await renderWithDeadLink('invite_used');

    fireEvent.change(emailField(), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Passw0rd!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/auth/login'));
    const registration = fetchCalls.find((call) => call.method === 'POST');
    expect(registration.body.invitationToken).toBeUndefined();
  });

  test('a door that answers something else explains nothing', async () => {
    searchParams = new URLSearchParams({ returnUrl: returnUrlFor(inviteToken) });
    previewOk = false;
    previewStatus = 502;
    previewBody = {};
    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));

    await waitFor(() => expect(appFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/That invitation link/)).toBeNull();
  });
});
