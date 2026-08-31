const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/auth?provider=GOOGLE&code=opaque&state=provider-state',
  pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
const {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} = require('@testing-library/react');
const { act } = require('react');
const { renderToString } = require('react-dom/server');
const { hydrateRoot } = require('react-dom/client');

const repositoryRoot = path.resolve(__dirname, '..');
const registrationFetch = jest.fn(async () => ({
  status: 200,
  headers: new Headers(),
}));
const push = jest.fn();
const h = React.createElement;
const emptyProvider = () => null;

const mocks = {
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => registrationFetch,
  },
  '@contentfactory/react/form/button': {
    Button: ({ loading, children, ...props }) =>
      h('button', { ...props, disabled: loading }, children),
  },
  '@contentfactory/react/form/input': {
    Input: ({
      label,
      translationKey: _translationKey,
      translationParams: _translationParams,
      helper: _helper,
      ...props
    }) => h('label', {}, label, h('input', { 'aria-label': label, ...props })),
  },
  '@contentfactory/react/form/checkbox.field': {
    CheckboxField: ({ label, ...props }) =>
      h('label', {}, label, h('input', { type: 'checkbox', ...props })),
  },
  '@contentfactory/helpers/auth/newsletter.consent': {
    canOfferNewsletterConsent: () => false,
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
    LegalNotice: emptyProvider,
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
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (_key, fallback) => fallback,
  },
  'next/navigation': {
    useRouter: () => ({ push }),
    useSearchParams: () => new URLSearchParams(window.location.search),
  },
  'next/link': ({ href, children, ...props }) =>
    h('a', { href, ...props }, children),
};

const sources = {
  '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto':
    'libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts',
  '@contentfactory/nestjs-libraries/dtos/auth/starter-template':
    'libraries/nestjs-libraries/src/dtos/auth/starter-template.ts',
  './starter-template':
    'libraries/nestjs-libraries/src/dtos/auth/starter-template.ts',
  '@contentfactory/frontend/components/public-saas/starter-template-chooser':
    'apps/frontend/src/components/public-saas/starter-template-chooser.tsx',
  '@contentfactory/frontend/components/public-saas/registration-intent':
    'apps/frontend/src/components/public-saas/registration-intent.ts',
  '@contentfactory/react/choice/radio.group':
    'libraries/react-shared-libraries/src/choice/radio.group.tsx',
  './control.button':
    'libraries/react-shared-libraries/src/choice/control.button.tsx',
  './roving': 'libraries/react-shared-libraries/src/choice/roving.ts',
  '../form/control-height':
    'libraries/react-shared-libraries/src/form/control-height.ts',
};
const requestedModules = new Set();

function loadModule(relativePath, cache = new Map()) {
  if (cache.has(relativePath)) return cache.get(relativePath).exports;
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  cache.set(relativePath, loaded);
  const localRequire = (request) => {
    requestedModules.add(request);
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    if (Object.prototype.hasOwnProperty.call(sources, request)) {
      return loadModule(sources[request], cache);
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

const { RegisterAfter } = loadModule(
  'apps/frontend/src/components/auth/register.tsx'
);
const intentKey = 'content-factory:registration-intent';

function putIntent(value) {
  window.sessionStorage.setItem(intentKey, JSON.stringify(value));
}

async function submitRegistration({
  local = false,
  workspaceName,
} = {}) {
  if (local) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'long-secret12' },
    });
  }
  const workspace = screen.getByRole('textbox', {
    name: 'Workspace name (optional)',
  });
  expect(workspace.required).toBe(false);
  expect(workspace.getAttribute('name')).toBe('workspaceName');
  if (workspaceName !== undefined) {
    fireEvent.change(workspace, { target: { value: workspaceName } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  await waitFor(() => expect(registrationFetch).toHaveBeenCalledTimes(1));
  return JSON.parse(registrationFetch.mock.calls[0][1].body);
}

afterEach(() => {
  cleanup();
  registrationFetch.mockClear();
  push.mockClear();
  window.sessionStorage.clear();
});

describe('standard OAuth starter-template continuity', () => {
  test('RegisterAfter uses the owned chooser and intent modules', () => {
    expect(
      requestedModules.has(
        '@contentfactory/frontend/components/public-saas/starter-template-chooser'
      )
    ).toBe(true);
    expect(
      requestedModules.has(
        '@contentfactory/frontend/components/public-saas/registration-intent'
      )
    ).toBe(true);
  });

  test('StrictMode captures a valid intent once, removes storage, and submits it', async () => {
    putIntent({
      version: 1,
      starterTemplate: 'content-workflow',
      issuedAt: Date.now(),
    });

    render(
      h(
        React.StrictMode,
        {},
        h(RegisterAfter, { token: 'provider-token', provider: 'GOOGLE' })
      )
    );

    expect(
      screen
        .getByRole('radio', { name: /Content workflow/ })
        .getAttribute('aria-checked')
    ).toBe('true');
    await waitFor(() =>
      expect(window.sessionStorage.getItem(intentKey)).toBeNull()
    );
    const body = await submitRegistration();
    expect(body).toEqual(
      expect.objectContaining({ starterTemplate: 'content-workflow' })
    );
    expect(body).not.toHaveProperty('workspaceName');
    expect(body).not.toHaveProperty('company');
    expect(window.location.search).toBe(
      '?provider=GOOGLE&code=opaque&state=provider-state'
    );
    expect(window.location.search).not.toContain('starterTemplate');
  });

  test.each([
    [
      'stale',
      {
        version: 1,
        starterTemplate: 'content-workflow',
        issuedAt: Date.now() - 11 * 60 * 1000,
      },
    ],
    [
      'tampered',
      {
        version: 1,
        starterTemplate: 'content-workflow',
        issuedAt: Date.now(),
        email: 'private@example.com',
      },
    ],
  ])('%s intent falls back to blank and is consumed', async (_label, intent) => {
    putIntent(intent);
    render(h(RegisterAfter, { token: 'provider-token', provider: 'GOOGLE' }));

    expect(
      screen
        .getByRole('radio', { name: /Blank workspace/ })
        .getAttribute('aria-checked')
    ).toBe('true');
    await waitFor(() =>
      expect(window.sessionStorage.getItem(intentKey)).toBeNull()
    );
    const body = await submitRegistration();
    expect(body).toEqual(expect.objectContaining({ starterTemplate: 'blank' }));
    expect(body).not.toHaveProperty('workspaceName');
    expect(body).not.toHaveProperty('company');
  });

  test('LOCAL submits a genuinely blank optional workspace', async () => {
    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));

    const body = await submitRegistration({
      local: true,
      workspaceName: '   ',
    });
    expect(body).not.toHaveProperty('workspaceName');
    expect(body).not.toHaveProperty('company');
    expect(body).toEqual(expect.objectContaining({ starterTemplate: 'blank' }));
  });

  test.each([
    ['LOCAL', '', true],
    ['GOOGLE', 'provider-token', false],
  ])(
    '%s trims and forwards a nonblank workspace with legacy company and selected template',
    async (provider, token, local) => {
      if (!local) {
        putIntent({
          version: 1,
          starterTemplate: 'content-workflow',
          issuedAt: Date.now(),
        });
      }
      render(h(RegisterAfter, { token, provider }));
      if (local) {
        fireEvent.click(
          screen.getByRole('radio', { name: /Content workflow/ })
        );
      }

      expect(
        await submitRegistration({
          local,
          workspaceName: '  Editorial desk  ',
        })
      ).toEqual(
        expect.objectContaining({
          workspaceName: 'Editorial desk',
          company: 'Editorial desk',
          starterTemplate: 'content-workflow',
        })
      );
    }
  );
});

describe('server and client first render of the starter-template chooser', () => {
  // /auth is server-rendered and hydrated, and the server has no
  // sessionStorage. Reading the intent while initialising state used to make
  // the client's first render disagree with the markup it was hydrating, so
  // React discarded the whole form and rebuilt it. Render the component the
  // way the server does — with no window at all — and hydrate that markup.
  function renderWithoutWindow(element) {
    const descriptor = Object.getOwnPropertyDescriptor(global, 'window');
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: undefined,
    });
    try {
      return renderToString(element);
    } finally {
      Object.defineProperty(global, 'window', descriptor);
    }
  }

  test('a stored intent hydrates without a mismatch and still reaches the body', async () => {
    putIntent({
      version: 1,
      starterTemplate: 'content-workflow',
      issuedAt: Date.now(),
    });
    const element = h(RegisterAfter, {
      token: 'provider-token',
      provider: 'GOOGLE',
    });

    const serverHtml = renderWithoutWindow(element);
    expect(serverHtml).toContain('data-cf-choice-value="blank"');
    expect(serverHtml).toContain('data-cf-choice-value="content-workflow"');

    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    const recoverableErrors = [];
    let root;
    await act(async () => {
      root = hydrateRoot(container, element, {
        onRecoverableError: (error) =>
          recoverableErrors.push(String(error?.message ?? error)),
      });
    });

    try {
      expect(recoverableErrors).toEqual([]);
      expect(
        screen
          .getByRole('radio', { name: /Content workflow/ })
          .getAttribute('aria-checked')
      ).toBe('true');
      await waitFor(() =>
        expect(window.sessionStorage.getItem(intentKey)).toBeNull()
      );
      expect(await submitRegistration()).toEqual(
        expect.objectContaining({ starterTemplate: 'content-workflow' })
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
