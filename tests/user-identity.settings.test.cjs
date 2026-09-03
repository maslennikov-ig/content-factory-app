const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request))
      return mocks[request];
    if (request.startsWith('.')) {
      for (const extension of ['.ts', '.tsx']) {
        const candidate = `${path.resolve(
          path.dirname(filename),
          request
        )}${extension}`;
        if (fs.existsSync(candidate))
          return loadTypeScriptModule(
            path.relative(repositoryRoot, candidate),
            mocks
          );
      }
    }
    if (request.startsWith('@contentfactory/react/')) {
      const candidate = path.join(
        repositoryRoot,
        'libraries/react-shared-libraries/src',
        `${request.slice('@contentfactory/react/'.length)}.tsx`
      );
      if (fs.existsSync(candidate))
        return loadTypeScriptModule(
          path.relative(repositoryRoot, candidate),
          mocks
        );
    }
    return require(request);
  };

  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const Button = ({
  children,
  loading: _loading,
  loadingLabel: _loadingLabel,
  ...props
}) => React.createElement('button', props, children);
// The shared Input renders its own label and message row; the stub keeps that
// shape so the view's copy is still what the assertions read.
const Input = ({
  label,
  helper,
  error,
  disableForm: _disableForm,
  standalone: _standalone,
  fieldClassName: _fieldClassName,
  ...props
}) =>
  React.createElement(
    'label',
    null,
    label,
    React.createElement('input', props),
    React.createElement('span', null, error || helper)
  );

let translate = (_key, fallback) => fallback;

// i18next fills `{{name}}` placeholders from the third argument, in the default
// value as well as in a translated one. A mock that dropped them would let a
// message that never shows its address read as if it did.
const interpolate = (text, values) =>
  values
    ? String(text).replace(/{{(\w+)}}/g, (whole, name) => values[name] ?? whole)
    : text;

const component = loadTypeScriptModule(
  'apps/frontend/src/components/settings/sign-in-methods.component.tsx',
  {
    swr: { __esModule: true, default: jest.fn() },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: jest.fn() },
    '@contentfactory/react/form/button': { Button },
    '@contentfactory/react/form/input': { Input },
    '@contentfactory/react/form/password-input': {
      PasswordInput: ({
        showPasswordLabel: _show,
        hidePasswordLabel: _hide,
        ...props
      }) => React.createElement(Input, props),
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: jest.fn(),
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (key, fallback, values) =>
        interpolate(translate(key, fallback), values),
    },
    '@contentfactory/nestjs-libraries/dtos/auth/password.policy': {
      PASSWORD_POLICY: { minLength: 7, maxLength: 64 },
      isPasswordPolicyCompliant: (value) =>
        typeof value === 'string' &&
        Array.from(value).length >= 7 &&
        Array.from(value).length <= 64 &&
        /\p{L}/u.test(value) &&
        /\p{Nd}/u.test(value) &&
        /[\p{P}\p{S}]/u.test(value),
    },
  }
);

afterEach(() => {
  translate = (_key, fallback) => fallback;
});

const identity = (
  provider,
  providerIdentifier = `${provider.toLowerCase()}-id`
) => ({
  provider,
  providerIdentifier,
  linkedAt: '2026-08-17T10:00:00.000Z',
});

function renderView(props) {
  return renderToStaticMarkup(
    React.createElement(component.SignInMethodsView, {
      identities: [],
      availableProviders: ['LOCAL', 'TELEGRAM'],
      onRetry: jest.fn(),
      onLinkLocal: jest.fn(),
      onLinkExternal: jest.fn(),
      onUnlink: jest.fn(),
      onEmailChange: jest.fn(),
      onPasswordChange: jest.fn(),
      email: '',
      password: '',
      ...props,
    })
  );
}

test('a provider callback opens sign-in methods before the settings panels render', () => {
  expect(
    component.initialSettingsTab(
      new URLSearchParams('?code=provider-code&state=provider-state')
    )
  ).toBe('sign_in_methods');
  expect(
    component.initialSettingsTab(
      new URLSearchParams('?identity_confirmation=token')
    )
  ).toBe('sign_in_methods');
  expect(
    component.initialSettingsTab(new URLSearchParams('?onboarding=1'))
  ).toBe('global_settings');
});

test('SettingsPopup mounts the sign-in methods consumer for a provider callback', () => {
  const Empty = () => null;
  const Marker = ({ name }) =>
    React.createElement('div', { 'data-settings-consumer': name });
  const settings = loadTypeScriptModule(
    'apps/frontend/src/components/layout/settings.component.tsx',
    {
      '@contentfactory/frontend/components/layout/new-modal': {
        useModals: () => ({ closeAll: jest.fn(), openModal: jest.fn() }),
      },
      'react-hook-form': {
        FormProvider: ({ children }) => children,
        useForm: () => ({
          watch: jest.fn(),
          setValue: jest.fn(),
          handleSubmit: (submit) => submit,
        }),
      },
      '@contentfactory/frontend/components/media/media.component': {
        showMediaBox: jest.fn(),
      },
      '@contentfactory/helpers/utils/custom.fetch': {
        useFetch: () => jest.fn(),
      },
      '@hookform/resolvers/class-validator': {
        classValidatorResolver: jest.fn(),
      },
      '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {
        UserDetailDto: class {},
      },
      '@contentfactory/react/toaster/toaster': {
        useToaster: () => ({ show: jest.fn() }),
      },
      swr: { useSWRConfig: () => ({ mutate: jest.fn() }) },
      '@contentfactory/frontend/components/settings/teams.component': {
        TeamsComponent: Empty,
      },
      '@contentfactory/frontend/components/layout/user.context': {
        useUser: () => ({ tier: { current: 'FREE' } }),
      },
      '@contentfactory/frontend/components/layout/logout.component': {
        LogoutComponent: Empty,
      },
      'next/navigation': {
        useSearchParams: () =>
          new URLSearchParams('?code=provider-code&state=provider-state'),
      },
      '@contentfactory/react/helpers/variable.context': {
        useVariables: () => ({ isGeneral: true }),
      },
      '@contentfactory/frontend/components/public-api/public.component': {
        PublicComponent: Empty,
      },
      'next/link': {
        __esModule: true,
        default: ({ children }) => React.createElement('a', null, children),
      },
      '@contentfactory/frontend/components/webhooks/webhooks': {
        Webhooks: Empty,
      },
      '@contentfactory/frontend/components/sets/sets': { Sets: Empty },
      '@contentfactory/frontend/components/settings/signatures.component': {
        SignaturesComponent: Empty,
      },
      '@contentfactory/frontend/components/autopost/autopost': {
        Autopost: Empty,
      },
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (_key, fallback) => fallback,
      },
      '@contentfactory/frontend/components/launches/launches.component': {
        SVGLine: Empty,
      },
      '@contentfactory/frontend/components/settings/global.settings': {
        GlobalSettings: () => React.createElement(Marker, { name: 'global' }),
      },
      '@contentfactory/frontend/components/approved-apps/approved-apps.component':
        {
          ApprovedAppsComponent: Empty,
        },
      // The About panel carries the AGPL source offer for a signed-in person;
      // `tests/source.archive.test.cjs` owns what it says. Here it only has to
      // resolve, so the tab list this suite reads is the shipped one.
      '@contentfactory/frontend/components/settings/about-project.component': {
        AboutProjectComponent: Empty,
      },
      '@contentfactory/react/form/button': { Button },
      '@contentfactory/frontend/components/settings/sign-in-methods.component':
        {
          initialSettingsTab: component.initialSettingsTab,
          SignInMethodsComponent: () =>
            React.createElement(Marker, { name: 'sign-in-methods' }),
        },
      '@contentfactory/frontend/components/settings/settings-surface.component':
        {
          SettingsSurface: ({ value, children }) =>
            React.createElement(
              'div',
              { 'data-settings-tab': value, className: 'cf-control-h' },
              children
            ),
        },
      '@contentfactory/frontend/components/ui/surface': {
        RestrictedState: Empty,
      },
      '@contentfactory/nestjs-libraries/user/organization.roles': {
        isOrganizationAdmin: () => false,
      },
      '@contentfactory/react/choice/tabs': {
        Tabs: ({ value, children }) =>
          React.createElement('div', { 'data-settings-tab': value }, children),
        TabList: ({ children, ...props }) =>
          React.createElement('div', props, children),
        Tab: ({ children, value: _value, ...props }) =>
          React.createElement('button', props, children),
        TabPanel: ({ children, value: _value, ...props }) =>
          React.createElement('div', props, children),
      },
    }
  );

  const markup = renderToStaticMarkup(
    React.createElement(settings.SettingsPopup)
  );

  expect(markup).toContain('data-settings-tab="sign_in_methods"');
  expect(markup).toContain('data-settings-consumer="sign-in-methods"');
  expect(markup).not.toContain('data-settings-consumer="global"');
  expect(markup).toContain('cf-control-h');
  expect(markup).not.toContain('min-h-[44px]');
});

test('renders explicit loading, recoverable error, and empty feedback', () => {
  const loading = renderView({ loading: true });
  expect(loading).toContain('data-testid="sign-in-methods-skeleton"');
  expect(
    loading.match(/data-testid="sign-in-method-skeleton-row"/g)
  ).toHaveLength(2);
  expect(loading).toMatch(/Loading sign-in methods/);

  const error = renderView({ error: 'Could not load sign-in methods.' });
  expect(error).toMatch(/Could not load sign-in methods/);
  expect(error).toMatch(/>Try again<\/button>/);

  const empty = renderView({ identities: [] });
  expect(empty).toMatch(/No sign-in methods are listed yet/);
  expect(empty).toMatch(/Available/);
});

test('all method states and controls use translated fallbacks', () => {
  translate = (key) => `translated:${key}`;

  const connected = renderView({
    identities: [identity('TELEGRAM')],
    availableProviders: ['LOCAL', 'TELEGRAM'],
  });
  expect(connected).toMatch(/translated:sign_in_methods_subtitle/);
  expect(connected).toMatch(/translated:sign_in_method_connected/);
  expect(connected).toMatch(/translated:keep_one_sign_in_method/);
  expect(connected).toMatch(/translated:remove/);
  expect(connected).toMatch(/translated:available/);
  expect(connected).toMatch(/translated:email/);
  expect(connected).toMatch(/translated:password/);
  expect(connected).toMatch(/translated:add_password/);

  expect(
    renderView({ error: 'translated:sign_in_methods_load_failed' })
  ).toMatch(/translated:try_again/);
});

test('long identifiers wrap and interactive controls keep mobile touch targets', () => {
  const markup = renderView({
    identities: [
      identity(
        'LOCAL',
        'an-extremely-long-email-address-without-safe-breaks@example.test'
      ),
    ],
    availableProviders: ['LOCAL', 'TELEGRAM'],
  });

  expect(markup).toContain('[overflow-wrap:anywhere]');
  expect(markup).toContain('cf-control-h');
  expect(markup).not.toContain('min-h-[44px]');
  expect(markup).not.toContain('sm:min-h-[40px]');

  const loading = renderView({ loading: true });
  expect(loading).toContain('md:h-[40px]');
  expect(loading).not.toContain('sm:h-[40px]');
});

test('shows connected state and explains why the last method cannot be removed', () => {
  const markup = renderView({
    identities: [identity('TELEGRAM')],
    availableProviders: ['TELEGRAM'],
  });

  expect(markup).toMatch(/Connected/);
  expect(markup).toMatch(/Keep at least one sign-in method/);
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Remove<\/button>/);
});

test('LOCAL linking asks for a confirmation and connects nothing yet', async () => {
  const request = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: 'confirmation_sent',
      email: 'editor@example.com',
      expiresInMinutes: 20,
    }),
  });

  const pending = await component.linkLocalIdentity({
    email: 'Editor@Example.com ',
    password: 'safe-password',
    request,
  });

  expect(request).toHaveBeenCalledWith('/user/identities/link', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'LOCAL',
      email: 'Editor@Example.com ',
      password: 'safe-password',
    }),
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(pending).toEqual({
    email: 'editor@example.com',
    expiresInMinutes: 20,
  });
});

test('confirming sends only the token and then reloads the list', async () => {
  const request = jest.fn().mockResolvedValue({ ok: true });
  const refresh = jest.fn().mockResolvedValue(undefined);

  await component.confirmLocalIdentity({
    token: 'one-time-token',
    request,
    refresh,
  });

  expect(request).toHaveBeenCalledWith('/user/identities/confirm', {
    method: 'POST',
    body: JSON.stringify({ token: 'one-time-token' }),
  });
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('a named backend refusal becomes a translated sentence, never its English', async () => {
  const request = jest.fn().mockResolvedValue({
    ok: false,
    text: async () =>
      JSON.stringify({
        message: 'This confirmation link belongs to a different account',
        code: 'identity_confirmation_wrong_account',
      }),
  });

  const error = await component
    .confirmLocalIdentity({ token: 'x', request, refresh: jest.fn() })
    .catch((caught) => caught);

  expect(error).toMatchObject({
    translationKey: 'identity_confirmation_wrong_account',
  });
  // The backend's own wording must not be what the reader is shown.
  expect(error.message).not.toMatch(/belongs to a different account$/);
});

test('an unnamed backend failure keeps the caller key rather than forwarding raw text', async () => {
  const request = jest.fn().mockResolvedValue({
    ok: false,
    text: async () => JSON.stringify({ message: 'Internal server error' }),
  });

  const error = await component
    .unlinkUserIdentity({
      identity: identity('TELEGRAM'),
      request,
      refresh: jest.fn(),
    })
    .catch((caught) => caught);

  expect(error).toMatchObject({
    translationKey: 'remove_sign_in_method_failed',
  });
  expect(error.message).not.toMatch(/Internal server error/);
});

test('a pending confirmation is shown with its address and deadline', () => {
  const markup = renderView({
    identities: [identity('TELEGRAM')],
    availableProviders: ['LOCAL', 'TELEGRAM'],
    pendingConfirmation: { email: 'owner@example.com', expiresInMinutes: 20 },
  });

  expect(markup).toContain('data-testid="identity-confirmation-pending"');
  expect(markup).toMatch(/owner@example.com/);

  const withoutPending = renderView({
    identities: [identity('TELEGRAM')],
    availableProviders: ['LOCAL', 'TELEGRAM'],
  });
  expect(withoutPending).not.toContain(
    'data-testid="identity-confirmation-pending"'
  );
});

test('brand names keep their own spelling and unbound providers are not offered', () => {
  const markup = renderView({
    identities: [identity('GITHUB')],
    availableProviders: ['GOOGLE'],
  });

  expect(markup).toMatch(/GitHub/);
  expect(markup).not.toMatch(/Github/);
  expect(markup).toMatch(/Google/);

  // FARCASTER and WALLET have no browser-bound callback, so the backend
  // refuses them; the page must not start a connection it knows will fail.
  expect(
    component
      .beginExternalIdentityLink({
        provider: 'FARCASTER',
        origin: 'https://app.example',
        request: jest.fn(),
        storage: { setItem: jest.fn() },
        navigate: jest.fn(),
      })
      .catch((caught) => caught.translationKey)
  ).resolves.toBe('unsupported_sign_in_provider');
});

test('external linking records a short-lived same-tab intent before redirecting', async () => {
  const storage = { setItem: jest.fn() };
  const request = jest.fn().mockResolvedValue({
    ok: true,
    text: async () =>
      'https://oauth.telegram.org/auth?code_challenge=challenge&state=telegram-state',
  });
  const navigate = jest.fn();

  await component.beginExternalIdentityLink({
    provider: 'TELEGRAM',
    origin: 'https://app.example',
    request,
    storage,
    navigate,
    now: 1_000,
  });

  expect(request).toHaveBeenCalledWith(
    '/auth/oauth/TELEGRAM?redirect_uri=https%3A%2F%2Fapp.example%2Fsettings'
  );
  const saved = JSON.parse(storage.setItem.mock.calls[0][1]);
  expect(saved).toEqual({
    provider: 'TELEGRAM',
    redirectUri: 'https://app.example/settings',
    state: 'telegram-state',
    expiresAt: 301_000,
  });
  expect(navigate).toHaveBeenCalledWith(
    'https://oauth.telegram.org/auth?code_challenge=challenge&state=telegram-state'
  );
});

test('callback links only a live intent from this tab, then clears intent and query', async () => {
  const intent = {
    provider: 'TELEGRAM',
    redirectUri: 'https://app.example/settings',
    state: 'telegram-state',
    expiresAt: 301_000,
  };
  const storage = {
    getItem: jest.fn(() => JSON.stringify(intent)),
    removeItem: jest.fn(),
  };
  const request = jest.fn().mockResolvedValue({ ok: true });
  const refresh = jest.fn().mockResolvedValue(undefined);
  const clearCallback = jest.fn();

  await component.completeExternalIdentityLink({
    origin: 'https://app.example',
    search: '?code=provider-code&state=telegram-state',
    request,
    storage,
    refresh,
    clearCallback,
    now: 2_000,
  });

  expect(request).toHaveBeenCalledWith('/user/identities/link', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'TELEGRAM',
      code: 'provider-code',
      state: 'telegram-state',
      redirectUri: 'https://app.example/settings',
    }),
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(storage.removeItem).toHaveBeenCalledWith(
    component.IDENTITY_LINK_INTENT_KEY
  );
  expect(clearCallback).toHaveBeenCalledTimes(1);
});

test('two concurrent callback consumers cannot both spend the same tab intent', async () => {
  let saved = JSON.stringify({
    provider: 'TELEGRAM',
    redirectUri: 'https://app.example/settings',
    state: 'telegram-state',
    expiresAt: 301_000,
  });
  const storage = {
    getItem: jest.fn(() => saved),
    removeItem: jest.fn(() => {
      saved = null;
    }),
  };
  let finishRequest;
  const request = jest.fn(
    () =>
      new Promise((resolve) => {
        finishRequest = () => resolve({ ok: true });
      })
  );
  const input = {
    origin: 'https://app.example',
    search: '?code=provider-code&state=telegram-state',
    request,
    storage,
    refresh: jest.fn().mockResolvedValue(undefined),
    clearCallback: jest.fn(),
    now: 2_000,
  };

  const first = component.completeExternalIdentityLink(input);
  await expect(component.completeExternalIdentityLink(input)).rejects.toThrow(
    /started from this browser tab/i
  );
  finishRequest();
  await first;

  expect(request).toHaveBeenCalledTimes(1);
});

test('a rejected client callback carries a translation key for its alert', async () => {
  const error = await component
    .completeExternalIdentityLink({
      origin: 'https://app.example',
      search: '?code=provider-code&state=telegram-state',
      request: jest.fn(),
      storage: {
        getItem: jest.fn(() => null),
        removeItem: jest.fn(),
      },
      refresh: jest.fn(),
      clearCallback: jest.fn(),
      now: 2_000,
    })
    .catch((caught) => caught);

  expect(error).toMatchObject({
    translationKey: 'identity_link_not_started',
  });
});

test.each([
  ['missing', null, '?code=provider-code&state=telegram-state'],
  [
    'expired',
    JSON.stringify({
      provider: 'TELEGRAM',
      redirectUri: 'https://app.example/settings',
      state: 'telegram-state',
      expiresAt: 1_500,
    }),
    '?code=provider-code&state=telegram-state',
  ],
  [
    'wrong state',
    JSON.stringify({
      provider: 'TELEGRAM',
      redirectUri: 'https://app.example/settings',
      state: 'expected-state',
      expiresAt: 5_000,
    }),
    '?code=provider-code&state=other-state',
  ],
  [
    'wrong origin',
    JSON.stringify({
      provider: 'TELEGRAM',
      redirectUri: 'https://attacker.example/settings',
      state: 'telegram-state',
      expiresAt: 5_000,
    }),
    '?code=provider-code&state=telegram-state',
  ],
])(
  'a %s intent never reaches the linking endpoint',
  async (_name, raw, search) => {
    const request = jest.fn();

    await expect(
      component.completeExternalIdentityLink({
        origin: 'https://app.example',
        search,
        request,
        storage: {
          getItem: jest.fn(() => raw),
          removeItem: jest.fn(),
        },
        refresh: jest.fn(),
        clearCallback: jest.fn(),
        now: 2_000,
      })
    ).rejects.toThrow(/started|expired|state|origin/i);

    expect(request).not.toHaveBeenCalled();
  }
);
