const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/auth',
});
for (const key of ['window', 'document', 'navigator'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
for (const key of ['localStorage', 'sessionStorage'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: dom.window[key],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;
const {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} = require('@testing-library/react');
const { useFormContext } = require('react-hook-form');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const fs = require('node:fs');
const path = require('node:path');
const h = React.createElement;
const words = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      '../libraries/react-shared-libraries/src/translation/locales/ru/translation.json'
    )
  )
);
let request, query, push;
const Input = ({ name, label, type = 'text' }) => {
  const form = useFormContext();
  return h(
    'label',
    null,
    label || name,
    h('input', { ...form.register(name), type }),
    form.formState.errors[name] &&
      h('span', { role: 'alert' }, form.formState.errors[name].message)
  );
};
const Button = ({ children, loading, onClick, type }) =>
  h(
    'button',
    { disabled: loading, 'aria-busy': !!loading, onClick, type },
    children
  );
const Empty = () => null;
function load(name) {
  return loadWithMocks(
    'apps/frontend/src/components/auth/' + name + '.tsx',
    {
      '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (key, fallback) => words[key] || fallback,
      },
      '@contentfactory/react/helpers/variable.context': {
        useVariables: () => ({ isGeneral: true, language: 'ru' }),
      },
      '@contentfactory/react/form/button': { Button },
      '@contentfactory/react/form/input': { Input },
      '@contentfactory/react/form/password-input': {
        PasswordInput: (p) => h(Input, { ...p, type: 'password' }),
      },
      '@contentfactory/react/form/checkbox.field': { CheckboxField: Empty },
      '@hookform/resolvers/class-validator': {
        classValidatorResolver: () => async (values) => ({
          values,
          errors: {},
        }),
      },
      '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto': {
        LoginUserDto: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/auth/forgot.password.dto': {
        ForgotPasswordDto: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
        CreateOrgUserDto: class {},
      },
      ...Object.fromEntries(
        ['github', 'google', 'oauth', 'telegram'].map((p) => [
          '@contentfactory/frontend/components/auth/providers/' +
            p +
            '.provider',
          { [p[0].toUpperCase() + p.slice(1) + 'Provider']: Empty },
        ])
      ),
      '@contentfactory/frontend/components/auth/providers/lazy-farcaster.provider':
        { LazyFarcasterProvider: Empty },
      '@contentfactory/frontend/components/auth/auth.divider': {
        AuthDivider: Empty,
      },
      '@contentfactory/frontend/components/auth/legal.notice': {
        LegalNotice: Empty,
      },
      '@contentfactory/frontend/components/auth/approval-marker': {
        rememberAwaitingApproval: jest.fn(),
      },
      '@contentfactory/frontend/components/layout/loading': {
        LoadingComponent: () => h('div', { role: 'status' }, 'Loading OAuth'),
      },
      'next/navigation': {
        useRouter: () => ({ push }),
        useSearchParams: () => query,
      },
      'next/link': ({ children, href }) => h('a', { href }, children),
    },
    process.env.CF_TEST_BASELINE
  );
}
beforeEach(() => {
  query = new URLSearchParams();
  push = jest.fn();
  request = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});
afterAll(() => dom.window.close());
const failure = (kind) =>
  kind === 'network'
    ? Promise.reject(Error('private network detail'))
    : kind === 'protocol'
    ? Promise.resolve({
        ok: true,
        headers: new Headers(),
        json: async () => {
          throw Error('bad json');
        },
      })
    : Promise.resolve(new Response('{}', { status: kind }));
const submit = async () => {
  await act(async () => {
    fireEvent.submit(document.querySelector('form'));
  });
};
describe('login and forgot request failures', () => {
  test.each(
    ['login', 'forgot'].flatMap((name) =>
      ['network', 403, 500].map((kind) => [name, kind])
    )
  )('%s %s ends loader and retains a retryable form', async (name, kind) => {
    request.mockImplementation(() => failure(kind));
    const component = load(name)[name === 'login' ? 'Login' : 'Forgot'];
    render(h(component));
    const email = screen.getByRole('textbox');
    fireEvent.change(email, { target: { value: 'reader@example.invalid' } });
    await submit();
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name:
            name === 'login' ? words.sign_in : words.send_password_reset_email,
        }).disabled
      ).toBe(false)
    );
    expect(screen.getByRole('alert').textContent).toBeTruthy();
    expect(document.body.textContent).not.toContain('private network');
    expect(email.value).toBe('reader@example.invalid');
    expect(document.body.textContent).not.toContain(
      words.we_have_send_you_an_email_with_a_link_to_reset_your_password
    );
    request.mockResolvedValue(new Response('{}', { status: 200 }));
    await submit();
    if (name === 'forgot')
      expect(document.body.textContent).toContain(
        words.we_have_send_you_an_email_with_a_link_to_reset_your_password
      );
    else expect(request).toHaveBeenCalledTimes(2);
  });
  test('login approval and inactive paths remain distinct', async () => {
    const { Login } = load('login');
    request.mockResolvedValue(
      new Response('User is awaiting approval', { status: 400 })
    );
    render(h(Login));
    await submit();
    expect(document.body.textContent).toContain(
      words.account_awaiting_approval
    );
    expect(screen.getByRole('button', { name: words.sign_in }).disabled).toBe(
      false
    );
  });
});
describe('OAuth registration', () => {
  test.each(['network', 'protocol', 403, 500, 'missing-token'])(
    '%s exits spinner and succeeds after explicit retry',
    async (kind) => {
      query = new URLSearchParams(
        'provider=google&code=authorization&state=fixture-state'
      );
      request.mockImplementation(() =>
        kind === 'missing-token'
          ? Promise.resolve(new Response('{}'))
          : failure(kind)
      );
      const { Register } = load('register');
      render(h(Register));
      await waitFor(() =>
        expect(screen.queryByText('Loading OAuth')).toBeNull()
      );
      expect(screen.getByRole('alert').textContent).toContain(
        words.auth_request_failed_retry
      );
      expect(document.querySelector('form')).toBeNull();
      request.mockResolvedValue(
        new Response(JSON.stringify({ token: 'verified-token' }))
      );
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: words.try_again }))
      );
      await waitFor(() =>
        expect(document.querySelector('form')).not.toBeNull()
      );
      expect(push).not.toHaveBeenCalled();
    }
  );
  test('approval navigates to pending without registration form', async () => {
    query = new URLSearchParams('provider=google&code=authorization');
    request.mockResolvedValue(
      new Response('{}', { headers: { approval: 'true' } })
    );
    const { Register } = load('register');
    render(h(Register));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/pending'));
    expect(document.querySelector('form')).toBeNull();
  });
});
