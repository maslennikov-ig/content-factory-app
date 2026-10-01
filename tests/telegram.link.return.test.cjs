const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const { IDENTITY_LINK_INTENT_KEY, identityLinkReturnUrl } =
  loadTypeScriptModule(
    'apps/frontend/src/components/auth/identity-link-return.ts'
  );

const intent = (overrides = {}) =>
  JSON.stringify({
    provider: 'TELEGRAM',
    redirectUri: 'https://app.example/settings',
    state: 'the-state',
    expiresAt: 2_000,
    ...overrides,
  });

const callback = '?provider=TELEGRAM&code=the-code&state=the-state';

describe('Telegram connection returning through the sign-in page', () => {
  test('sends a connection callback on to settings with its code and state', () => {
    expect(
      identityLinkReturnUrl({
        search: callback,
        rawIntent: intent(),
        now: 1_000,
      })
    ).toBe('/settings?code=the-code&state=the-state');
  });

  test('a missing tab note provides no settings callback target', () => {
    // The server purpose decides whether this is login or a connection that
    // must restart; a missing note alone cannot authorize rendering login.
    expect(
      identityLinkReturnUrl({ search: callback, rawIntent: null, now: 1_000 })
    ).toBeNull();
  });

  test.each([
    ['a note from another provider', intent({ provider: 'GOOGLE' })],
    ['an expired note', intent({ expiresAt: 500 })],
    ['a note from a different attempt', intent({ state: 'another-state' })],
    ['a note that is not JSON', 'not-json'],
  ])('refuses to carry a callback with %s', (_case, rawIntent) => {
    expect(
      identityLinkReturnUrl({ search: callback, rawIntent, now: 1_000 })
    ).toBeNull();
  });

  test('a callback without a code or a state goes nowhere', () => {
    expect(
      identityLinkReturnUrl({
        search: '?provider=TELEGRAM&state=the-state',
        rawIntent: intent(),
        now: 1_000,
      })
    ).toBeNull();
    expect(
      identityLinkReturnUrl({
        search: '?provider=TELEGRAM&code=the-code',
        rawIntent: intent(),
        now: 1_000,
      })
    ).toBeNull();
  });

  test('the target is fixed, so a stored note cannot choose where to send anyone', () => {
    const url = identityLinkReturnUrl({
      search: callback,
      rawIntent: intent({ redirectUri: 'https://attacker.example/settings' }),
      now: 1_000,
    });

    expect(url).toBe('/settings?code=the-code&state=the-state');
    expect(url).not.toMatch(/attacker/);
  });

  test('settings and the sign-in page read one storage key', () => {
    // Two spellings of this string would break the connection silently, and
    // only for the person trying to connect an account.
    expect(IDENTITY_LINK_INTENT_KEY).toBe(
      'content-factory:identity-link-intent'
    );
    expect(
      read(
        'apps/frontend/src/components/settings/sign-in-methods.component.tsx'
      )
    ).toContain(
      "from '@contentfactory/frontend/components/auth/identity-link-return'"
    );
  });

  test('the sign-in page puts the gate in front of a Telegram callback', () => {
    const page = read('apps/frontend/src/app/(app)/auth/page.tsx');

    expect(page).toContain('TelegramLinkReturn');
    expect(page).toMatch(/TELEGRAM'\s*&&\s*searchParams\?\.code/);
  });

  test('the gate replaces the callback URL instead of stacking it', () => {
    const gate = read(
      'apps/frontend/src/components/auth/telegram.link.return.tsx'
    );

    // A spent code left in history is an error the back button can reach.
    expect(gate).toContain('window.location.replace(');
    expect(gate).not.toContain('window.location.assign(');
    // Settings claims the note; the gate only reads it.
    expect(gate).toContain('window.sessionStorage.getItem(');
    expect(gate).not.toContain('removeItem');
    expect(gate).toContain('telegram_link_returning_to_settings');
  });

  test('ships the visible return and recovery words in every existing locale', () => {
    const localesRoot = path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/translation/locales'
    );
    const locales = fs
      .readdirSync(localesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());
    expect(locales).toHaveLength(16);
    for (const locale of locales) {
      const messages = JSON.parse(
        fs.readFileSync(
          path.join(localesRoot, locale.name, 'translation.json'),
          'utf8'
        )
      );
      for (const key of [
        'telegram_link_return_unavailable',
        'telegram_link_return_restart',
        'telegram_link_return_check_failed',
        'telegram_link_return_open_settings',
        'telegram_link_return_checking',
        'telegram_link_return_restart_sign_in',
      ]) {
        expect(messages[key]).toEqual(expect.any(String));
        expect(messages[key].trim()).not.toBe('');
      }
    }
  });
});

describe('Telegram return gate outcomes', () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: `https://app.example/auth${callback}`,
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
  const {
    act,
    cleanup,
    render,
    screen,
    waitFor,
  } = require('@testing-library/react/pure');
  const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
  const h = React.createElement;
  const request = jest.fn();
  const exchange = jest.fn();
  const replace = jest.fn();
  const getItem = jest.fn();
  const { TelegramLinkReturn } = loadWithMocks(
    'apps/frontend/src/components/auth/telegram.link.return.tsx',
    {
      '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (_key, fallback) => fallback,
      },
      '@contentfactory/frontend/components/layout/loading': {
        LoadingComponent: () => h('div', { 'data-testid': 'callback-loading' }),
      },
      '@contentfactory/react/layout': {},
      'next/link': {
        default: ({ children, ...props }) => h('a', props, children),
        __esModule: true,
      },
    }
  );
  const Login = () => {
    React.useEffect(() => {
      exchange();
    }, []);
    return h('div', { 'data-testid': 'login-page' }, 'Login form');
  };
  const renderGate = () => render(h(TelegramLinkReturn, null, h(Login)));
  const response = (purpose) => ({ ok: true, json: async () => ({ purpose }) });

  beforeEach(() => {
    jest.clearAllMocks();
    request.mockResolvedValue(response('link'));
    getItem.mockReturnValue(intent({ expiresAt: Date.now() + 300_000 }));
    // jsdom's own location is non-configurable; this browser facade retains
    // the DOM constructors while allowing callback navigation to be observed.
    const browser = Object.create(dom.window);
    Object.defineProperty(browser, 'location', {
      value: {
        search: callback,
        href: `https://app.example/auth${callback}`,
        replace,
      },
    });
    Object.defineProperty(browser, 'sessionStorage', { value: { getItem } });
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: browser,
    });
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  const expectRecovery = async () => {
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(
      screen.getByRole('link', { name: 'Open settings' }).getAttribute('href')
    ).toBe('/settings');
    expect(screen.queryByTestId('callback-loading')).toBeNull();
    expect(screen.queryByTestId('login-page')).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  };

  test('waits for server login purpose before rendering the existing exchange flow', async () => {
    let finish;
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    renderGate();
    expect(screen.queryByTestId('login-page')).toBeNull();
    expect(exchange).not.toHaveBeenCalled();

    await act(async () => {
      finish(response('login'));
    });

    expect(screen.getByTestId('login-page')).toBeTruthy();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      '/auth/telegram/state?state=the-state',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(getItem).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  test('confirmed link purpose with the matching note replaces to the fixed Settings callback', async () => {
    renderGate();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        '/settings?code=the-code&state=the-state'
      )
    );
    expect(getItem).toHaveBeenCalledWith(IDENTITY_LINK_INTENT_KEY);
    expect(exchange).not.toHaveBeenCalled();
  });

  test('Strict Mode replay sends only the active inspected callback to Settings', async () => {
    render(h(React.StrictMode, null, h(TelegramLinkReturn, null, h(Login))));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith(
      '/settings?code=the-code&state=the-state'
    );
    expect(exchange).not.toHaveBeenCalled();
  });

  test.each([
    ['missing', null],
    ['expired', intent({ expiresAt: Date.now() - 1 })],
    [
      'different attempt',
      intent({ state: 'another-state', expiresAt: Date.now() + 300_000 }),
    ],
    [
      'another provider',
      intent({ provider: 'GOOGLE', expiresAt: Date.now() + 300_000 }),
    ],
    ['malformed', 'not-json'],
  ])(
    'confirmed link purpose with a %s note stops and offers a clean restart',
    async (_case, note) => {
      getItem.mockReturnValue(note);
      renderGate();
      await expectRecovery();
      expect(screen.queryByRole('link', { name: 'Start sign-in again' })).toBeNull();
    }
  );

  test('query hints cannot turn a server-confirmed link into login', async () => {
    window.location.search = `${callback}&purpose=login`;
    getItem.mockReturnValue(null);
    renderGate();
    await expectRecovery();
  });

  test.each([
    ['HTTP refusal', () => Promise.resolve({ ok: false, status: 400 })],
    ['network failure', () => Promise.reject(new Error('offline'))],
    [
      'unreadable response',
      () =>
        Promise.resolve({
          ok: true,
          json: async () => {
            throw new Error('invalid JSON');
          },
        }),
    ],
    ['unknown purpose', () => Promise.resolve(response('other'))],
  ])('%s stops before storage or auto-exchange', async (_case, failure) => {
    request.mockImplementation(failure);
    renderGate();
    await expectRecovery();
    expect(getItem).not.toHaveBeenCalled();
  });

  test('an unclassified inspection refusal also offers a clean manual sign-in restart', async () => {
    request.mockResolvedValue({ ok: false, status: 400 });
    renderGate();
    await expectRecovery();
    expect(
      screen
        .getByRole('link', { name: 'Start sign-in again' })
        .getAttribute('href')
    ).toBe('/auth/login');
  });

  test('blocked browser storage stops at visible recovery', async () => {
    getItem.mockImplementation(() => {
      throw new dom.window.DOMException('Storage blocked', 'SecurityError');
    });
    renderGate();
    await expectRecovery();
    expect(screen.queryByRole('link', { name: 'Start sign-in again' })).toBeNull();
  });

  test('a stalled inspection reaches recovery within a bounded wait', async () => {
    jest.useFakeTimers();
    request.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    renderGate();
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByTestId('callback-loading')).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
  });

  test('a late successful inspection cannot resume login after terminal timeout', async () => {
    jest.useFakeTimers();
    let finish;
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    renderGate();
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(screen.getByRole('alert')).toBeTruthy();

    await act(async () => {
      finish(response('login'));
    });

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByTestId('login-page')).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
  });
});
