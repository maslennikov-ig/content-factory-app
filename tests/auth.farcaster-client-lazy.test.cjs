/** Real auth SSR and client-mount behavior with an inert provider transport. */
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/auth',
});
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  Object.defineProperty(global, key, { configurable: true, get: () => dom.window[key] });
}
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { renderToString } = require('react-dom/server');
const { render, cleanup, screen, fireEvent, waitFor, act } = require('@testing-library/react');
const { useFormContext } = require('react-hook-form');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const h = React.createElement;
const root = path.resolve(__dirname, '..');
const lazyFile = 'apps/frontend/src/components/auth/providers/lazy-farcaster.provider.tsx';
const actualRequest = '@contentfactory/frontend/components/auth/providers/farcaster.provider';
const lazyRequest = '@contentfactory/frontend/components/auth/providers/lazy-farcaster.provider';
const languages = Object.fromEntries(['en', 'ru'].map(language => [language,
  JSON.parse(fs.readFileSync(path.join(root,
    'libraries/react-shared-libraries/src/translation/locales', language, 'translation.json'), 'utf8'))]));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  // The existing TS loader lowers dynamic import through __importStar(require).
  // An ESM-marked thenable preserves native import's pending module semantics.
  Object.defineProperty(promise, '__esModule', { value: true });
  return { promise, resolve, reject };
}
function fixture({ variables = {}, language = 'en', importModule } = {}) {
  const counters = { imports: 0, sdkLoads: 0, providerMounts: 0, providerClicks: 0 };
  const vars = { isGeneral: true, genericOauth: false, neynarClientId: 'fictional-client',
    googleAuthEnabled: false, telegramLoginEnabled: false, language, ...variables };
  const t = (key, fallback) => languages[language][key] || fallback || key;
  const provider = name => () => h('button', { type: 'button' }, name);
  const Input = ({ name, label, type = 'text' }) => {
    const form = useFormContext();
    return h('label', null, label || name, h('input', { ...form.register(name), type }));
  };
  const sources = {
    [lazyRequest]: lazyFile,
    [actualRequest]: 'apps/frontend/src/components/auth/providers/farcaster.provider.tsx',
    '@contentfactory/frontend/components/auth/nayner.auth.button':
      'apps/frontend/src/components/auth/nayner.auth.button.tsx',
    '@contentfactory/frontend/components/auth/providers/provider.button':
      'apps/frontend/src/components/auth/providers/provider.button.tsx',
    '@contentfactory/react/form/button': 'libraries/react-shared-libraries/src/form/button.tsx',
  };
  const mocks = {
    '@contentfactory/react/helpers/variable.context': { useVariables: () => vars },
    '@contentfactory/react/translation/get.transation.service.client': { useT: () => t },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => jest.fn(() => {
      throw new Error('No HTTP in this fixture');
    }) },
    '@contentfactory/react/form/input': { Input },
    '@contentfactory/react/form/password-input': { PasswordInput: props => h(Input, { ...props, type: 'password' }) },
    '@contentfactory/react/form/checkbox.field': { CheckboxField: () => null },
    '@contentfactory/helpers/auth/newsletter.consent': { canOfferNewsletterConsent: () => false },
    '@hookform/resolvers/class-validator': { classValidatorResolver: () => async values => ({ values, errors: {} }) },
    '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto': { LoginUserDto: class {} },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': { CreateOrgUserDto: class {} },
    '@contentfactory/nestjs-libraries/dtos/auth/password.policy': { PASSWORD_POLICY_RANGE: '7–64' },
    '@contentfactory/frontend/components/auth/providers/github.provider': { GithubProvider: provider('GitHub') },
    '@contentfactory/frontend/components/auth/providers/google.provider': { GoogleProvider: provider('Google') },
    '@contentfactory/frontend/components/auth/providers/oauth.provider': { OauthProvider: provider('OIDC') },
    '@contentfactory/frontend/components/auth/providers/telegram.provider': { TelegramProvider: provider('Telegram') },
    '@contentfactory/frontend/components/auth/auth.divider': { AuthDivider: () => null },
    '@contentfactory/frontend/components/auth/legal.notice': { LegalNotice: () => null },
    '@contentfactory/frontend/components/auth/approval-marker': { rememberAwaitingApproval: () => undefined },
    '@contentfactory/frontend/components/layout/loading': { LoadingComponent: () => null },
    '@contentfactory/frontend/components/auth/form.errors': {
      parseRequestFailure: jest.fn(), useFieldErrorMessage: () => value => value,
      useRequestErrorMessage: () => () => 'refused',
    },
    'next/navigation': { useRouter: () => ({ push: jest.fn() }), useSearchParams: () => new URLSearchParams() },
    'next/link': ({ href, children, ...props }) => h('a', { href, ...props }, children),
  };
  const resolve = request => {
    if (request === actualRequest) {
      counters.imports += 1;
      if (importModule) return importModule(counters);
    }
    if (request === '@neynar/react') {
      counters.sdkLoads += 1;
      return { NeynarContextProvider: ({ children }) => children, Theme: { Dark: 'dark' },
        useNeynarContext: () => ({ client_id: 'fictional-client' }) };
    }
    return undefined;
  };
  const load = file => loadTypeScriptModule(file, mocks, { sources, resolve });
  return { counters, vars, t, load };
}
function readyModule(counters) {
  return { FarcasterProvider: () => {
    React.useEffect(() => { counters.providerMounts += 1; }, []);
    return h('button', { type: 'button', onClick: () => { counters.providerClicks += 1; } }, 'Farcaster ready');
  } };
}
afterEach(() => { cleanup(); jest.restoreAllMocks(); });
afterAll(() => dom.window.close());

describe('auth SSR stays cold before and after visibility gates', () => {
  test.each([
    ['Login', 'login', { neynarClientId: '' }],
    ['Login', 'login', {}],
    ['Login', 'login', { genericOauth: true }],
    ['Login', 'login', { isGeneral: false }],
    ['Register', 'register', { neynarClientId: '' }],
    ['Register', 'register', {}],
    ['Register', 'register', { genericOauth: true }],
    ['Register', 'register', { isGeneral: false }],
  ])('SSR %s %s %j does not evaluate Farcaster or SDK', (name, file, variables) => {
    const own = fixture({ variables });
    const component = own.load('apps/frontend/src/components/auth/' + file + '.tsx')[name];
    const html = renderToString(h(component));
    expect(html).toContain('form');
    expect(own.counters.imports).toBe(0);
    expect(own.counters.sdkLoads).toBe(0);
  });
});

describe('visible client wrapper', () => {
  test('SSR loading is disabled, accessible, and never starts the dynamic import', () => {
    const own = fixture({ importModule: () => { throw new Error('SSR import'); } });
    const { LazyFarcasterProvider } = own.load(lazyFile);
    const html = renderToString(h(LazyFarcasterProvider));
    expect(html).toContain('disabled');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(own.t('loading_sign_in_methods'));
    expect(own.counters.imports).toBe(0);
  });
  test('visible mount starts once; ordinary rerender and concurrent mount share the load', async () => {
    const pending = deferred();
    const own = fixture({ importModule: () => pending.promise });
    const { LazyFarcasterProvider } = own.load(lazyFile);
    const view = render(h(LazyFarcasterProvider));
    await waitFor(() => expect(own.counters.imports).toBe(1));
    expect(screen.getByRole('button').disabled).toBe(true);
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');
    view.rerender(h(React.Fragment, null, h(LazyFarcasterProvider), h(LazyFarcasterProvider)));
    expect(own.counters.imports).toBe(1);
    await act(async () => pending.resolve(readyModule(own.counters)));
    expect(screen.getAllByRole('button', { name: 'Farcaster ready' })).toHaveLength(2);
    expect(own.counters.providerClicks).toBe(0);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(own.counters.providerClicks).toBe(1);
  });
  test('React StrictMode effect replay does not start a second import', async () => {
    const pending = deferred();
    const own = fixture({ importModule: () => pending.promise });
    const { LazyFarcasterProvider } = own.load(lazyFile);
    render(h(React.StrictMode, null, h(LazyFarcasterProvider)));
    await waitFor(() => expect(own.counters.imports).toBe(1));
    await act(async () => pending.resolve(readyModule(own.counters)));
    expect(screen.getByRole('button', { name: 'Farcaster ready' })).toBeDefined();
  });
  test.each(['en', 'ru'])('localized rejection stays failed until an explicit %s retry', async language => {
    const first = deferred();
    const second = deferred();
    const own = fixture({ language, importModule: counters => counters.imports === 1 ? first.promise : second.promise });
    const { LazyFarcasterProvider } = own.load(lazyFile);
    const view = render(h(LazyFarcasterProvider));
    await waitFor(() => expect(own.counters.imports).toBe(1));
    await act(async () => first.reject(new Error('Synthetic private error must not be displayed')));
    expect(screen.getByRole('alert').textContent).toContain(own.t('sign_in_methods_load_failed'));
    expect(document.body.textContent).not.toContain('Synthetic private');
    expect(screen.getByRole('button').disabled).toBe(false);
    view.rerender(h(LazyFarcasterProvider));
    await act(async () => Promise.resolve());
    expect(own.counters.imports).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(own.t('try_again')) }));
    await waitFor(() => expect(own.counters.imports).toBe(2));
    expect(screen.getByRole('button').disabled).toBe(true);
    await act(async () => second.resolve(readyModule(own.counters)));
    expect(screen.queryByRole('alert')).toBe(null);
    expect(screen.getByRole('button', { name: 'Farcaster ready' })).toBeDefined();
    expect(own.counters.providerClicks).toBe(0);
  });
  test.each(['resolve', 'reject'])('settling after unmount (%s) does not mount a provider or leak a rejection', async outcome => {
    const pending = deferred();
    const own = fixture({ importModule: () => pending.promise });
    const { LazyFarcasterProvider } = own.load(lazyFile);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(h(LazyFarcasterProvider));
    await waitFor(() => expect(own.counters.imports).toBe(1));
    view.unmount();
    await act(async () => outcome === 'resolve' ? pending.resolve(readyModule(own.counters)) : pending.reject(new Error('unmounted')));
    expect(document.body.textContent).toBe('');
    expect(own.counters.providerMounts).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  });
  test('failed remount stays failed and two explicit retrying mounts share one pending attempt', async () => {
    const first = deferred(); const second = deferred();
    const own = fixture({ importModule: counters => counters.imports === 1 ? first.promise : second.promise });
    const { LazyFarcasterProvider } = own.load(lazyFile);
    const initial = render(h(LazyFarcasterProvider));
    await waitFor(() => expect(own.counters.imports).toBe(1));
    await act(async () => first.reject(new Error('first offline failure')));
    initial.unmount();
    render(h(React.Fragment, null, h(LazyFarcasterProvider), h(LazyFarcasterProvider)));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    expect(own.counters.imports).toBe(1);
    const retries = screen.getAllByRole('button', { name: new RegExp(own.t('try_again')) });
    fireEvent.click(retries[0]);
    fireEvent.click(retries[1]);
    await waitFor(() => expect(own.counters.imports).toBe(2));
    await act(async () => second.resolve(readyModule(own.counters)));
    expect(screen.getAllByRole('button', { name: 'Farcaster ready' })).toHaveLength(2);
    expect(own.counters.imports).toBe(2);
  });
  test('retry preserves the actual Login form values and does not submit authentication', async () => {
    const first = deferred(); const second = deferred();
    const own = fixture({ importModule: counters => counters.imports === 1 ? first.promise : second.promise });
    const { Login } = own.load('apps/frontend/src/components/auth/login.tsx');
    render(h(Login));
    const email = screen.getByLabelText(/email/i);
    const password = screen.getByLabelText(/password/i);
    fireEvent.change(email, { target: { value: 'fictional@example.invalid' } });
    fireEvent.change(password, { target: { value: 'local-fixture-only' } });
    await waitFor(() => expect(own.counters.imports).toBe(1));
    await act(async () => first.reject(new Error('offline rejected chunk')));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(own.t('try_again')) }));
    await waitFor(() => expect(own.counters.imports).toBe(2));
    await act(async () => second.resolve(readyModule(own.counters)));
    expect(email.value).toBe('fictional@example.invalid');
    expect(password.value).toBe('local-fixture-only');
    expect(own.counters.providerClicks).toBe(0);
  });
  test.each(['Login', 'Register'])('client %s with disabled provider never loads the real module', async name => {
    const own = fixture({ variables: { neynarClientId: '' }, importModule: () => {
      throw new Error('disabled provider imported');
    } });
    const Component = own.load('apps/frontend/src/components/auth/' + name.toLowerCase() + '.tsx')[name];
    render(h(Component));
    await act(async () => Promise.resolve());
    expect(own.counters.imports).toBe(0);
  });
});
