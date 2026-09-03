/**
 * Registration newsletter consent, proven through the rendered form.
 *
 * The regression this catches is a consent value surviving after the entered
 * address stops being newsletter-eligible, or synthetic provider identities
 * being offered a mail subscription they cannot receive.
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
const registerFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/auth/register.tsx'
);

// The real shared control and the real shared rule, compiled from source. A
// stub for either would let the form and the server disagree while the test
// still passed, which is the exact defect this suite exists for.
const checkboxField = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/form/checkbox.field.tsx'
);
const newsletterConsentRules = loadTypeScriptModule(
  'libraries/helpers/src/auth/newsletter.consent.ts'
);

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
      h('button', { ...props, disabled: props.disabled || loading }, children),
  },
  '@contentfactory/react/form/checkbox.field': checkboxField,
  '@contentfactory/helpers/auth/newsletter.consent': newsletterConsentRules,
  '@contentfactory/react/form/input': {
    // `translationParams` is dropped for the same reason `translationKey` is:
    // the real Input hands both to a translation component and never to the
    // DOM node. A mock that spreads them onto `<input>` invents a React
    // warning the product does not produce.
    Input: ({
      label,
      translationKey: _translationKey,
      translationParams: _translationParams,
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
    LegalNotice: () =>
      h('p', { 'data-testid': 'legal-notice' }, 'Legal notice'),
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
    PasswordInput: ({ label, showPasswordLabel: _show, hidePasswordLabel: _hide, ...props }) =>
      h('label', {}, label, h('input', { 'aria-label': label, ...props })),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (_key, fallback) => fallback,
  },
  'next/navigation': {
    useRouter: () => ({ push }),
    useSearchParams: () => new URLSearchParams(),
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
)(
  loaded.exports,
  localRequire,
  loaded,
  registerFile,
  path.dirname(registerFile)
);
const { RegisterAfter } = loaded.exports;

const consentName = /product news and updates/i;

const submit = async () => {
  fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }).form);
  await waitFor(() => expect(registrationFetch).toHaveBeenCalledTimes(1));
  return JSON.parse(registrationFetch.mock.calls[0][1].body);
};

afterEach(() => {
  cleanup();
  registrationFetch.mockClear();
  push.mockClear();
});

describe('registration newsletter consent', () => {
  test('LOCAL resets stale consent when the address stops containing @', async () => {
    render(h(RegisterAfter, { token: '', provider: 'LOCAL' }));

    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'editor@example.com' },
    });
    const consent = await screen.findByRole('checkbox', { name: consentName });
    expect(consent.checked).toBe(false);

    fireEvent.click(consent);
    expect(consent.checked).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'editor.example.com' },
    });
    await waitFor(() => expect(screen.queryByRole('checkbox')).toBeNull());

    expect(await submit()).toEqual(
      expect.objectContaining({ subscribeToNewsletter: false })
    );
  });

  test.each(['GOOGLE', 'GITHUB', 'GENERIC'])(
    '%s gets an unchecked native 44px consent and submits explicit false',
    async (provider) => {
      render(h(RegisterAfter, { token: 'provider-token', provider }));

      const consent = screen.getByRole('checkbox', { name: consentName });
      const legal = screen.getByTestId('legal-notice');
      const submitButton = screen.getByRole('button', {
        name: 'Create Account',
      });

      expect(consent.tagName).toBe('INPUT');
      expect(consent.type).toBe('checkbox');
      expect(consent.checked).toBe(false);
      expect(consent.closest('label').className).toContain('min-h-[44px]');
      expect(legal.compareDocumentPosition(consent)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
      expect(consent.compareDocumentPosition(submitButton)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );

      expect(await submit()).toEqual(
        expect.objectContaining({ subscribeToNewsletter: false })
      );
    }
  );

  test('checked eligible consent submits true', async () => {
    render(h(RegisterAfter, { token: 'provider-token', provider: 'GOOGLE' }));

    fireEvent.click(screen.getByRole('checkbox', { name: consentName }));

    expect(await submit()).toEqual(
      expect.objectContaining({ subscribeToNewsletter: true })
    );
  });

  test('a rejected registration recovers the controls and permits retry', async () => {
    registrationFetch.mockRejectedValueOnce(new Error('offline'));
    render(h(RegisterAfter, { token: 'provider-token', provider: 'GOOGLE' }));

    const consent = screen.getByRole('checkbox', { name: consentName });
    const submitButton = screen.getByRole('button', { name: 'Create Account' });
    fireEvent.click(submitButton);

    await waitFor(() => expect(registrationFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(consent.disabled).toBe(false));
    expect(submitButton.disabled).toBe(false);

    fireEvent.click(submitButton);
    await waitFor(() => expect(registrationFetch).toHaveBeenCalledTimes(2));
  });

  test.each(['TELEGRAM', 'FARCASTER'])(
    '%s never offers consent and submits an explicit false value',
    async (provider) => {
      render(h(RegisterAfter, { token: 'synthetic-token', provider }));

      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(await submit()).toEqual(
        expect.objectContaining({ subscribeToNewsletter: false })
      );
    }
  );

  /**
   * The checkbox is the shared control, not a fourth hand-rolled one.
   *
   * The form used to repeat the focus ring by hand, and the copy was missing
   * `focus-visible:outline-none` — so in the browsers that still paint a default
   * outline the ring arrived with a second outline beside it.
   */
  test('wears the shared control focus ring, outline suppression included', () => {
    const { CONTROL_FOCUS_RING } = loadTypeScriptModule(
      'libraries/react-shared-libraries/src/choice/control.button.tsx'
    );
    render(h(RegisterAfter, { token: 'provider-token', provider: 'GOOGLE' }));

    const consent = screen.getByRole('checkbox', { name: consentName });
    for (const className of CONTROL_FOCUS_RING.split(' ')) {
      expect(consent.className.split(' ')).toContain(className);
    }
    expect(CONTROL_FOCUS_RING).toContain('focus-visible:outline-none');
  });

  test.each([
    ['LOCAL', 'editor@example.com', true],
    ['LOCAL', 'editor.example.com', false],
    ['GOOGLE', '', true],
    ['TELEGRAM', '', false],
    ['FARCASTER', '', false],
  ])(
    'offers the checkbox exactly when the shared rule says so (%s, %s)',
    async (provider, email, expected) => {
      render(h(RegisterAfter, { token: provider === 'LOCAL' ? '' : 'token', provider }));

      if (provider === 'LOCAL') {
        fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
          target: { value: email },
        });
      }

      await waitFor(() =>
        expect(screen.queryByRole('checkbox') !== null).toBe(
          newsletterConsentRules.canOfferNewsletterConsent({ provider, email })
        )
      );
      expect(screen.queryByRole('checkbox') !== null).toBe(expected);
    }
  );

  test('every locale carries non-empty consent copy, including RTL locales', () => {
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
      expect(messages.newsletter_consent).toEqual(expect.any(String));
      expect(messages.newsletter_consent.trim()).not.toBe('');
    }
  });
});
