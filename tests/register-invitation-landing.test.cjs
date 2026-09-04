/**
 * Where an invited registration lands — `content-factory-next-fn33.37`.
 *
 * On the live walkthrough of 04.09.2026 the invited account was created
 * correctly, signed in correctly and placed in the right workspace with the
 * right role — and the first thing the new member saw was a red panel headed
 * «Invitation unavailable», about the invitation they had just used.
 *
 * Two things sent them there, and only one of them was in this form. The
 * address to come back to, stored by `ReturnUrlComponent` when the proxy
 * bounced the anonymous invitation link to the registration page, is the
 * invitation page with the invitation's own token; `layout.context` follows it
 * the moment the registration answers. And the proxy's pending-invitation
 * cookie, which is `httpOnly` and cannot be cleared from here, turns the very
 * next visit to `/` back into the same page. So the address is rewritten
 * rather than dropped: same page, same token, plus the flag that says the
 * invitation is already spent. The proxy clears its cookie on that request and
 * the page passes the person straight through.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

/**
 * `window.location.assign` cannot be replaced in jsdom — `Location` refuses
 * both assignment and `defineProperty` — so the real call raises «Not
 * implemented: navigation». That is expected here and says nothing, so it is
 * swallowed rather than printed. What the assertions read instead is the
 * return address in storage, which is the thing that actually decides where an
 * invited registration lands: `layout.context` follows it the moment the
 * `onboarding` header arrives.
 */
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => undefined);

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/auth',
  virtualConsole,
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
const { fireEvent, render, screen, waitFor } = require('@testing-library/react');

const repositoryRoot = path.resolve(__dirname, '..');
const registerFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/auth/register.tsx'
);

const h = React.createElement;
const emptyProvider = () => null;

const inviteToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImludjEyIiwib3JnSWQiOiJvcmcifQ.c2lnbmF0dXJlLXZhbHVl';
const PUBLIC_ORIGIN = 'http://localhost';

let searchParams = new URLSearchParams();
let registerStatus = 200;
let registerBody = { register: true };

/**
 * The return address as it stood at the moment the response arrived.
 * `layout.context` reads it while this form is still awaiting its own request,
 * so an address rewritten afterwards would be rewritten too late.
 */
let returnUrlWhenAnswered;

const appFetch = jest.fn(async (url) => {
  if (String(url).startsWith('/auth/join-org')) {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ workspaceName: 'Область Прогона 1' }),
    };
  }
  returnUrlWhenAnswered = window.localStorage.getItem('returnUrl');
  return {
    ok: registerStatus === 200,
    status: registerStatus,
    headers: new Headers(),
    text: async () => JSON.stringify(registerBody),
    json: async () => registerBody,
  };
});

const routerPush = jest.fn();

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
      error,
      ...props
    }) =>
      h(
        'label',
        {},
        label,
        h('input', { 'aria-label': label, ...props }),
        error ? h('span', { role: 'alert' }, error) : null
      ),
  },
  '@hookform/resolvers/class-validator': {
    classValidatorResolver: () => async (values) => ({ values, errors: {} }),
  },
  '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
    CreateOrgUserDto: class CreateOrgUserDto {},
  },
  '@contentfactory/nestjs-libraries/dtos/auth/password.policy': {
    PASSWORD_POLICY_RANGE: { min: 7, max: 64 },
    PASSWORD_POLICY_ERROR_MESSAGE: 'policy',
  },
  '@contentfactory/frontend/components/auth/form.errors': {
    parseRequestFailure: async (response) => ({
      status: response.status,
      fields: {},
      raw: await response.text(),
    }),
    useFieldErrorMessage: () => (_field, message) => message,
    useRequestErrorMessage: () => (failure) => `refused:${failure.status}`,
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
    LegalNotice: ({ invited }) =>
      h('p', {}, invited ? 'invited notice' : 'general notice'),
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({
      isGeneral: true,
      genericOauth: false,
      neynarClientId: '',
      googleAuthEnabled: false,
      telegramLoginEnabled: false,
      language: 'ru',
    }),
  },
  '@contentfactory/react/form/password-input': {
    PasswordInput: ({
      label,
      showPasswordLabel: _show,
      hidePasswordLabel: _hide,
      translationKey: _translationKey,
      translationParams: _translationParams,
      helper,
      error,
      ...props
    }) =>
      h(
        'label',
        {},
        label,
        h('input', { 'aria-label': label, ...props }),
        helper ? h('span', { 'data-role': 'helper' }, helper) : null,
        error ? h('span', { role: 'alert' }, error) : null
      ),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
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
const { RegisterAfter } = loaded.exports;

beforeEach(() => {
  returnUrlWhenAnswered = undefined;
  registerStatus = 200;
  registerBody = { register: true };
  appFetch.mockClear();
  routerPush.mockClear();
  window.localStorage.clear();
  searchParams = new URLSearchParams({
    returnUrl: `${PUBLIC_ORIGIN}/join-org?org=${inviteToken}`,
  });
  window.localStorage.setItem(
    'returnUrl',
    `${PUBLIC_ORIGIN}/join-org?org=${inviteToken}`
  );
});

const submitInvitedRegistration = async () => {
  render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));
  // The heading only names the workspace once the preview has answered, which
  // is also when the form knows the invitation is live.
  await screen.findByText('You were invited to “Область Прогона 1”');
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'Str0ng!pass' },
  });
  fireEvent.submit(screen.getByRole('button', { name: /join/i }));
};

test('an accepted invitation is never asked about again', async () => {
  registerBody = { register: true, invitation: { organizationId: 'org' } };

  await submitInvitedRegistration();
  await waitFor(() => expect(returnUrlWhenAnswered).toBeTruthy());

  const landing = new URL(returnUrlWhenAnswered, PUBLIC_ORIGIN);
  expect(landing.pathname).toBe('/join-org');
  expect(landing.searchParams.get('org')).toBe(inviteToken);
  // The flag the invitation page reads instead of asking about a spent token.
  expect(landing.searchParams.get('joined')).toBe('1');
});

test('an ordinary registration leaves the stored address alone', async () => {
  searchParams = new URLSearchParams();
  window.localStorage.clear();

  render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'someone@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'Str0ng!pass' },
  });
  fireEvent.submit(screen.getByRole('button', { name: /create account/i }));

  await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/auth/login'));
  expect(returnUrlWhenAnswered).toBeNull();
  expect(window.localStorage.getItem('returnUrl')).toBeNull();
});

test('the invitation page passes an accepted invitation through', () => {
  const source = fs.readFileSync(
    path.join(
      repositoryRoot,
      'apps/frontend/src/app/(app)/(site)/join-org/page.tsx'
    ),
    'utf8'
  );

  expect(source).toContain("query.get('joined') === '1'");
  // No question about a token that has just been spent, and a full load so the
  // workspace cookie set during registration counts.
  expect(source).toMatch(
    /if \(alreadyJoined\) \{[\s\S]*window\.location\.assign\('\/'\);[\s\S]*return;/
  );
});

test('the invited form no longer promises a wait for approval', () => {
  const notice = fs.readFileSync(
    path.join(
      repositoryRoot,
      'apps/frontend/src/components/auth/legal.notice.tsx'
    ),
    'utf8'
  );
  const strings = JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'libraries/react-shared-libraries/src/translation/locales/en/translation.json'
      ),
      'utf8'
    )
  );

  // `content-factory-next-fn33.40`: an invitation is the administrator's
  // decision; there is nothing left to approve.
  expect(strings.registration_stores_email_hash_ip).not.toMatch(/approve/i);
  expect(notice).toContain('registration_invited_no_approval');
  expect(
    fs.readFileSync(registerFile, 'utf8')
  ).toContain('<LegalNotice invited={!!invited} />');
});
