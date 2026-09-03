/**
 * Conversion-facing auth behavior: the workflow preview is a real tab set,
 * and registration makes required versus optional fields explicit.
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
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const h = React.createElement;

function loadWithMocks(relativePath, mocks) {
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
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
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

/**
 * The flow space `.cf-dense-choice-touch-target` reserves, taken from the
 * stylesheet that defines it. A dense control keeps a 32px body, so the mobile
 * touch target is only as large as this margin makes it.
 */
function denseTouchTargetMarginBlock() {
  const config = require(path.join(
    repositoryRoot,
    'apps/frontend/tailwind.config.cjs'
  ));
  let reserved;
  for (const plugin of config.plugins ?? []) {
    const handler = typeof plugin === 'function' ? plugin : plugin?.handler;
    if (typeof handler !== 'function') continue;
    try {
      handler({
        addComponents: (components) => {
          reserved =
            components['.cf-dense-choice-touch-target']?.marginBlock ??
            reserved;
        },
        addUtilities: () => {},
        addBase: () => {},
        addVariant: () => {},
        matchUtilities: () => {},
        e: (value) => value,
        theme: (key) => (key === 'screens.md' ? '768px' : undefined),
      });
    } catch {
      // Other plugins in this config need a fuller Tailwind context than a
      // stub gives them. Only the hit-area component matters here.
    }
  }
  expect(reserved).toEqual(expect.any(String));
  return reserved;
}

const choiceTabs = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/choice/tabs.tsx'
);
const platformBadge = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/platform/platform.badge.tsx'
);

const { WorkflowOverview } = loadWithMocks(
  'apps/frontend/src/components/auth/workflow.overview.tsx',
  {
    '@contentfactory/react/choice/tabs': choiceTabs,
    '@contentfactory/react/platform/platform.badge': platformBadge,
  }
);

const registrationFetch = jest.fn(async () => ({
  status: 200,
  headers: new Headers(),
}));

const Input = ({
  label,
  translationKey,
  translationParams,
  helper,
  error,
  name,
  ...props
}) => {
  const visibleLabel =
    translationKey === 'field_required'
      ? `${translationParams.field} — required`
      : label;
  const helperId = helper ? `${name}-helper` : undefined;
  return h(
    'label',
    {},
    visibleLabel,
    h('input', {
      ...props,
      name,
      'aria-label': visibleLabel,
      'aria-describedby': helperId,
    }),
    helper && h('span', { id: helperId }, helper),
    error && h('span', { role: 'alert' }, error)
  );
};

const emptyProvider = () => null;
const registerMocks = {
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => registrationFetch,
  },
  '@contentfactory/react/form/button': {
    Button: ({ loading, children, ...props }) =>
      h('button', { ...props, disabled: props.disabled || loading }, children),
  },
  '@contentfactory/react/form/input': { Input },
  '@contentfactory/react/form/password-input': {
    PasswordInput: ({ showPasswordLabel: _show, hidePasswordLabel: _hide, ...props }) =>
      h(Input, props),
  },
  '@contentfactory/react/form/checkbox.field': { CheckboxField: emptyProvider },
  '@contentfactory/helpers/auth/newsletter.consent': {
    canOfferNewsletterConsent: () => false,
  },
  '@hookform/resolvers/class-validator': {
    classValidatorResolver: () => async (values) =>
      values.password === 'invalid'
        ? {
            values: {},
            errors: {
              password: {
                message:
                  'Password must contain 7 to 64 characters, including a letter, a number, and a special character.',
              },
            },
          }
        : { values, errors: {} },
  },
  '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
    CreateOrgUserDto: class CreateOrgUserDto {},
  },
  '@contentfactory/nestjs-libraries/dtos/auth/password.policy': {
    PASSWORD_POLICY: { minLength: 7, maxLength: 64 },
    PASSWORD_POLICY_ERROR_MESSAGE:
      'Password must contain 7 to 64 characters, including a letter, a number, and a special character.',
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
    useT: () => (key, fallback, params) => {
      if (key === 'password_policy_error')
        return 'Localized password policy error';
      return params?.field
        ? fallback.replace('{{field}}', params.field)
        : fallback;
    },
  },
  'next/navigation': {
    useRouter: () => ({ push: jest.fn() }),
    useSearchParams: () => new URLSearchParams(),
  },
  'next/link': ({ href, children, ...props }) =>
    h('a', { href, ...props }, children),
};

const { RegisterAfter } = loadWithMocks(
  'apps/frontend/src/components/auth/register.tsx',
  registerMocks
);

const { ForgotReturn } = loadWithMocks(
  'apps/frontend/src/components/auth/forgot-return.tsx',
  {
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => jest.fn() },
    '@contentfactory/react/form/button':
      registerMocks['@contentfactory/react/form/button'],
    '@contentfactory/react/form/input': { Input },
    '@contentfactory/react/form/password-input':
      registerMocks['@contentfactory/react/form/password-input'],
    '@hookform/resolvers/class-validator': {
      classValidatorResolver: () => async (values) =>
        values.password === 'invalid'
          ? {
              values: {},
              errors: {
                password: {
                  message:
                    'Password must contain 7 to 64 characters, including a letter, a number, and a special character.',
                },
              },
            }
          : { values, errors: {} },
    },
    '@contentfactory/nestjs-libraries/dtos/auth/forgot-return.password.dto': {
      ForgotReturnPasswordDto: class ForgotReturnPasswordDto {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/password.policy': {
      PASSWORD_POLICY: { minLength: 7, maxLength: 64 },
      PASSWORD_POLICY_ERROR_MESSAGE:
        'Password must contain 7 to 64 characters, including a letter, a number, and a special character.',
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (key, fallback) =>
        key === 'password_policy_error'
          ? 'Localized password policy error'
          : fallback,
    },
    'next/link': registerMocks['next/link'],
  }
);

afterEach(() => {
  cleanup();
  registrationFetch.mockClear();
});

describe('auth landing conversion surface', () => {
  const steps = [
    { title: 'Plan', body: 'Plan every channel.' },
    { title: 'Draft', body: 'Write and adapt.' },
    { title: 'Review', body: 'Resolve checks.' },
    { title: 'Calendar', body: 'Schedule the result.' },
  ];

  test('switches the workflow preview with tabs and keyboard arrows', () => {
    render(
      h(WorkflowOverview, {
        heading: 'One workflow',
        intro: 'See the work before creating an account.',
        steps,
      })
    );

    const plan = screen.getByRole('tab', { name: 'Plan' });
    const draft = screen.getByRole('tab', { name: 'Draft' });
    // Visual height is the primitive's: a dense 32px body, with the 44px
    // mobile hit area coming from the reserved pseudo-element rather than a
    // hand-typed `min-h-[44px]` the shared control would strip anyway.
    expect(plan.className.split(' ')).toContain('h-[32px]');
    expect(plan.className).toContain('cf-dense-choice-touch-target');
    expect(plan.className).toContain('before:-inset-y-1.5');
    expect(plan.className).toContain('before:inset-x-0');
    expect(plan.className).toContain('md:before:inset-y-0');
    // 32px body plus the 6px this utility reserves above and below is the
    // 44px target, read from the stylesheet instead of restated here.
    expect(32 + 2 * Number.parseFloat(denseTouchTargetMarginBlock())).toBe(44);
    expect(plan.hasAttribute('mobiletouchtarget')).toBe(false);
    expect(plan.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toContain(
      'Plan every channel.'
    );

    plan.focus();
    fireEvent.keyDown(plan, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(draft);
    expect(draft.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toContain(
      'Write and adapt.'
    );
    expect(screen.queryByText('Plan every channel.')).toBeNull();
  });

  test('keeps the full stage title in the panel while the tab stays compact', () => {
    render(
      h(WorkflowOverview, {
        heading: 'One workflow',
        intro: 'See the work before creating an account.',
        steps: [
          ...steps.slice(0, 3),
          {
            title: 'Schedule and publish',
            tabTitle: 'Schedule',
            body: 'Queue the result and follow what happened.',
          },
        ],
      })
    );

    const schedule = screen.getByRole('tab', { name: 'Schedule' });
    fireEvent.click(schedule);

    expect(schedule.getAttribute('aria-selected')).toBe('true');
    expect(
      screen.getByRole('heading', { name: 'Schedule and publish' })
    ).toBeTruthy();
  });

  test('shows multi-platform publishing and measurement proof before signup', () => {
    render(
      h(WorkflowOverview, {
        heading: 'Create content. Publish everywhere. Track what works.',
        intro: 'Turn one idea into ready-to-publish content.',
        platformProof:
          '30+ platforms in one launch—with reach, clicks, and engagement tracked in one place.',
        steps,
      })
    );

    expect(
      screen.getByText(
        '30+ platforms in one launch—with reach, clicks, and engagement tracked in one place.'
      )
    ).toBeTruthy();
    for (const platform of [
      'Instagram',
      'LinkedIn',
      'YouTube',
      'TikTok',
      'Telegram',
      'WordPress',
    ]) {
      expect(screen.getByRole('img', { name: platform })).toBeTruthy();
    }
  });

  test('leads with content creation and separates live capability from roadmap', () => {
    render(
      h(WorkflowOverview, {
        heading: 'One workflow',
        intro: 'See the work before creating an account.',
        initialStep: 1,
        steps: [
          steps[0],
          {
            ...steps[1],
            momentum: {
              availableLabel: 'Available now',
              availableBody:
                'Web research with cited sources and RSS or Telegram feeds turned into drafts.',
              nextLabel: 'Next on the roadmap',
              nextBody:
                'A brand voice profile that carries audience, vocabulary, tone, and rules into every draft.',
            },
          },
          ...steps.slice(2),
        ],
      })
    );

    expect(
      screen.getByRole('tab', { name: 'Draft' }).getAttribute('aria-selected')
    ).toBe('true');
    expect(screen.getByText('Available now')).toBeTruthy();
    expect(
      screen.getByText(
        'Web research with cited sources and RSS or Telegram feeds turned into drafts.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Next on the roadmap')).toBeTruthy();
    expect(
      screen.getByText(
        'A brand voice profile that carries audience, vocabulary, tone, and rules into every draft.'
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Plan' }));
    expect(screen.queryByText('Available now')).toBeNull();
    expect(screen.queryByText('Next on the roadmap')).toBeNull();
  });

  test('marks required account fields and exposes an optional workspace', () => {
    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));

    const email = screen.getByRole('textbox', { name: 'Email — required' });
    const password = screen.getByLabelText('Password — required');
    const workspace = screen.getByRole('textbox', {
      name: 'Workspace name (optional)',
    });

    expect(email.required).toBe(true);
    expect(password.required).toBe(true);
    expect(workspace.required).toBe(false);
    expect(email.getAttribute('name')).toBe('email');
    expect(password.getAttribute('name')).toBe('password');
    expect(workspace.getAttribute('name')).toBe('workspaceName');
    expect(
      document.getElementById(workspace.getAttribute('aria-describedby'))
        .textContent
    ).toBe('Used as the workspace name. You can change it later.');
  });

  test('renders the localized password-policy error instead of validator English', async () => {
    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));

    fireEvent.change(screen.getByLabelText('Password — required'), {
      target: { value: 'invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Localized password policy error'
      )
    );
  });

  test('renders the localized password-policy error while resetting a password', async () => {
    render(h(ForgotReturn, { token: 'reset-token' }));

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'invalid' },
    });

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Localized password policy error'
      )
    );
  });

  test('every locale provides the new field clarity copy', () => {
    const localesRoot = path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/translation/locales'
    );
    const localeFiles = fs
      .readdirSync(localesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(localesRoot, entry.name, 'translation.json'))
      .filter((file) => fs.existsSync(file));

    expect(localeFiles).toHaveLength(16);
    for (const file of localeFiles) {
      const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of [
        'field_required',
        'company_field_helper',
        'auth_overview_create_tab',
        'auth_overview_platform_proof',
        'auth_overview_available_now_label',
        'auth_overview_available_now_body',
        'auth_overview_coming_next_label',
        'auth_overview_coming_next_body',
      ]) {
        expect(messages[key]).toEqual(expect.any(String));
        expect(messages[key].trim()).not.toBe('');
      }
    }
  });
});
