const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');

const repositoryRoot = path.resolve(__dirname, '..');
const componentFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/public-saas/email-first-signup.tsx'
);
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:4200/demo',
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

function loadRegistration(fetchData, push, options = {}) {
  const {
    isPasswordPolicyCompliant = (value) => value.length >= 7,
    translate = (_key, fallback) => fallback,
  } = options;
  const compiled = ts.transpileModule(fs.readFileSync(componentFile, 'utf8'), {
    fileName: componentFile,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  const mocks = {
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetchData },
    '@contentfactory/react/form/input': {
      Input: ({
        label,
        standalone: _standalone,
        fieldClassName: _fieldClassName,
        ...props
      }) =>
        React.createElement(
          'label',
          {},
          label,
          React.createElement('input', { 'aria-label': label, ...props })
        ),
    },
    '@contentfactory/react/form/password-input': {
      PasswordInput: ({
        label,
        standalone: _standalone,
        showPasswordLabel: _show,
        hidePasswordLabel: _hide,
        ...props
      }) =>
        React.createElement(
          'label',
          {},
          label,
          React.createElement('input', { 'aria-label': label, ...props })
        ),
    },
    '@contentfactory/react/form/button': {
      Button: ({ loading, children, ...props }) =>
        React.createElement(
          'button',
          { ...props, disabled: loading },
          children
        ),
    },
    './public-copy': {
      usePublicCopy: () => (key) =>
        ({
          emailTitle: 'Keep this workflow',
          emailBody: 'Continue with email',
          emailContinue: 'Continue',
          emailLabel: 'Email',
          passwordLabel: 'Password',
          workspaceOptional: 'Workspace name (optional)',
          createAccount: 'Create account',
          newsletterConsent: 'Send occasional product news',
          legalUnavailable: 'Terms and privacy links are not configured.',
          authOptions: 'Use configured sign-in options',
        }[key]),
    },
    './public-telemetry': {
      usePublicTelemetry: () => jest.fn(),
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ termsUrl: '', privacyUrl: '' }),
    },
    '@contentfactory/helpers/auth/newsletter.consent': {
      canOfferNewsletterConsent: () => true,
    },
    '@contentfactory/nestjs-libraries/dtos/auth/password.policy': {
      PASSWORD_POLICY: { minLength: 7, maxLength: 64 },
      isPasswordPolicyCompliant,
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => translate,
    },
    '@contentfactory/frontend/components/auth/legal.notice': {
      LegalNotice: () =>
        React.createElement('p', {}, 'configured legal notice'),
    },
    '@contentfactory/react/form/checkbox.field': {
      CheckboxField: ({ label, ...props }) =>
        React.createElement(
          'label',
          {},
          label,
          React.createElement('input', { type: 'checkbox', ...props })
        ),
    },
    'next/navigation': { useRouter: () => ({ push }) },
    'next/link': ({ href, children, ...props }) =>
      React.createElement('a', { href, ...props }, children),
  };
  new Function('require', 'module', 'exports', compiled)(
    (request) => mocks[request] ?? require(request),
    loaded,
    loaded.exports
  );
  return loaded.exports;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('public email-first registration', () => {
  test('renders the localized password-policy error instead of the generic registration failure', async () => {
    const fetchData = jest.fn();
    const push = jest.fn();
    const { EmailFirstSignup } = loadRegistration(fetchData, push, {
      isPasswordPolicyCompliant: () => false,
      translate: (key, fallback) =>
        key === 'password_policy_error'
          ? 'Localized password policy error'
          : fallback,
    });
    render(React.createElement(EmailFirstSignup));

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'editor@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Localized password policy error'
    );
    expect(fetchData).not.toHaveBeenCalled();
  });

  test('keeps email in memory and submits the existing registration payload on step two', async () => {
    const fetchData = jest.fn(async () => ({
      status: 200,
      headers: new Headers(),
    }));
    const push = jest.fn();
    const { EmailFirstSignup } = loadRegistration(fetchData, push);
    render(React.createElement(EmailFirstSignup));

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'editor@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('textbox', { name: 'Email' }).value).toBe(
      'editor@example.com'
    );
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret-pass' },
    });
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Workspace name (optional)' }),
      {
        target: { value: 'Editorial desk' },
      }
    );
    // The notice is unconditional now. It used to be swapped for a "links are
    // not configured" line whenever the deployment variables were empty, which
    // is how the running instance ended up collecting an email, a password hash
    // and an IP address with nothing on the form pointing at the three legal
    // documents it was already publishing.
    expect(screen.getByText('configured legal notice')).toBeTruthy();
    expect(
      screen.queryByText('Terms and privacy links are not configured.')
    ).toBeNull();
    expect(
      screen
        .getByRole('link', { name: 'Use configured sign-in options' })
        .getAttribute('href')
    ).toBe('/auth');
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Send occasional product news' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(fetchData).toHaveBeenCalledTimes(1));
    expect(fetchData.mock.calls[0][0]).toBe('/auth/register');
    expect(JSON.parse(fetchData.mock.calls[0][1].body)).toMatchObject({
      email: 'editor@example.com',
      password: 'secret-pass',
      provider: 'LOCAL',
      providerToken: '',
      workspaceName: 'Editorial desk',
      company: 'Editorial desk',
      subscribeToNewsletter: true,
    });
    // content-factory-next-pdbe: there is no starter-template choice left on
    // this form, so the request never carries the field at all.
    expect(JSON.parse(fetchData.mock.calls[0][1].body)).not.toHaveProperty(
      'starterTemplate'
    );
    expect(push).toHaveBeenCalledWith('/launches');
    expect(window.location.search).toBe('');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  test('hands approval-gated registration to the existing pending route', async () => {
    const fetchData = jest.fn(async () => ({
      status: 200,
      headers: new Headers({ approval: 'true', auth: 'new-session' }),
    }));
    const push = jest.fn();
    const { EmailFirstSignup } = loadRegistration(fetchData, push);
    render(React.createElement(EmailFirstSignup));
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'e@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/pending'));
  });

  test('uses the approval response body when the header is not exposed', async () => {
    const fetchData = jest.fn(
      async () =>
        new Response(JSON.stringify({ approval: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    const push = jest.fn();
    const { EmailFirstSignup } = loadRegistration(fetchData, push);
    render(React.createElement(EmailFirstSignup));
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'e@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'long-secret12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/pending'));
    expect(push).not.toHaveBeenCalledWith('/launches');
  });

  test('hands activation-required registration to the existing activation route', async () => {
    const fetchData = jest.fn(async () => ({
      status: 200,
      headers: new Headers({ activate: 'true' }),
    }));
    const push = jest.fn();
    const { EmailFirstSignup } = loadRegistration(fetchData, push);
    render(React.createElement(EmailFirstSignup));
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'e@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/activate'));
    expect(push).not.toHaveBeenCalledWith('/launches');
  });
});
