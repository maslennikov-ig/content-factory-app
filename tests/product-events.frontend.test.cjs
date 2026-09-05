/**
 * Focused browser-level contract for the in-house product-events frontend.
 *
 * The components are transpiled from their real TypeScript sources and rendered
 * into jsdom. Slow application-shell dependencies are replaced at their public
 * boundaries; state transitions, DOM structure and event payloads stay real.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
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
  cleanup,
  fireEvent,
  render,
  waitFor,
} = require('@testing-library/react');

const repositoryRoot = path.resolve(__dirname, '..');
const hookPath = path.join(
  repositoryRoot,
  'libraries/helpers/src/utils/use.fire.events.ts'
);
const paymentPath = path.join(
  repositoryRoot,
  'apps/frontend/src/components/layout/check.payment.tsx'
);
const lifetimePath = path.join(
  repositoryRoot,
  'apps/frontend/src/components/billing/lifetime.deal.tsx'
);
const adminPath = path.join(
  repositoryRoot,
  'apps/frontend/src/components/admin/admin-product-events.component.tsx'
);
const adminPagePath = path.join(
  repositoryRoot,
  'apps/frontend/src/app/(app)/(site)/admin/product-events/page.tsx'
);

const resolveLocal = (fromDir, request) => {
  const base = path.resolve(fromDir, request);
  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, 'index.tsx'),
    path.join(base, 'index.ts'),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve ${request} from ${fromDir}`);
};

const createLoader = (mocks = {}) => {
  const cache = new Map();
  const load = (filename) => {
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const directory = path.dirname(filename);
    const localRequire = (request) => {
      if (Object.prototype.hasOwnProperty.call(mocks, request)) {
        return mocks[request];
      }
      if (request.startsWith('.')) {
        return load(resolveLocal(directory, request));
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
    )(loaded.exports, localRequire, loaded, filename, directory);
    return loaded.exports;
  };
  return load;
};

afterEach(() => cleanup());

describe('useFireEvents', () => {
  test('posts the exact first-party payload to a relative endpoint', async () => {
    const requests = [];
    const fetch = async (url, init) => {
      requests.push({ url, init });
      return { ok: true };
    };
    const load = createLoader({
      '@contentfactory/helpers/utils/custom.fetch': {
        useFetch: () => fetch,
      },
      './custom.fetch': { useFetch: () => fetch },
    });
    const { useFireEvents } = load(hookPath);
    let fireProductEvent;
    const Harness = () => {
      fireProductEvent = useFireEvents();
      return null;
    };
    render(React.createElement(Harness));

    await fireProductEvent('purchase', {
      deduplicationKey: 'purchase:checkout_123',
      properties: { plan: 'PRO' },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/product-events');
    expect(requests[0].init.method).toBe('POST');
    expect(JSON.parse(requests[0].init.body)).toEqual({
      name: 'purchase',
      properties: { plan: 'PRO' },
      deduplicationKey: 'purchase:checkout_123',
    });
  });

  /**
   * `crypto.subtle` exists only in a secure context, so on a plain-HTTP stand
   * the digest threw and the swallowed exception took the whole
   * `lifetime_claimed` event with it.
   */
  test('still produces a stable opaque key without crypto.subtle', async () => {
    const { productEventKeyFromIdentifier } = createLoader({
      '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => null },
      './custom.fetch': { useFetch: () => null },
    })(hookPath);
    const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: () => undefined },
    });

    try {
      const key = await productEventKeyFromIdentifier('lifetime', 'claim-code');
      const again = await productEventKeyFromIdentifier(
        'lifetime',
        'claim-code'
      );
      const other = await productEventKeyFromIdentifier(
        'lifetime',
        'other-code'
      );

      expect(key).toBe(again);
      expect(key).not.toBe(other);
      expect(key).toMatch(/^lifetime:[0-9a-f]{32}$/);
      expect(key).not.toContain('claim-code');
    } finally {
      Object.defineProperty(globalThis, 'crypto', real);
    }
  });
});

describe('confirmed client event gates', () => {
  const paymentModule = (status, eventCalls) => {
    const fetch = async () => ({ json: async () => ({ status }) });
    return createLoader({
      '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetch },
      '@contentfactory/helpers/utils/use.fire.events': {
        useFireEvents:
          () =>
          async (...args) =>
            eventCalls.push(args),
      },
      '@contentfactory/frontend/components/layout/loading': () => null,
      '@contentfactory/helpers/utils/timer': { timer: async () => {} },
      '@contentfactory/react/toaster/toaster': { useToaster: () => ({}) },
      '@contentfactory/frontend/components/layout/new-modal': {
        useDecisionModal: () => ({ open: () => {} }),
      },
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (_key, fallback) => fallback,
      },
    })(paymentPath);
  };

  test('does not turn a check query marker into a purchase', async () => {
    const eventCalls = [];
    const { CheckPaymentInner } = paymentModule(1, eventCalls);
    render(
      React.createElement(
        CheckPaymentInner,
        { check: 'checkout_failed', mutate: () => {} },
        React.createElement('div', null, 'billing')
      )
    );

    await waitFor(() => expect(document.body.textContent).toContain('billing'));
    expect(eventCalls).toEqual([]);
  });

  test('records purchase only after status 2 with the confirmed check id', async () => {
    const eventCalls = [];
    const { CheckPaymentInner } = paymentModule(2, eventCalls);
    render(
      React.createElement(
        CheckPaymentInner,
        { check: 'checkout_confirmed_42', mutate: () => {} },
        React.createElement('div', null, 'billing')
      )
    );

    await waitFor(() => expect(eventCalls).toHaveLength(1));
    expect(eventCalls[0]).toEqual([
      'purchase',
      { deduplicationKey: 'purchase:checkout_confirmed_42' },
    ]);
  });

  /**
   * `useDecisionModal` returns a fresh object literal on every render, so an
   * effect keyed on the callback that closes over it restarted the poll on
   * every parent render and left the previous one running: one open billing
   * screen meant an unbounded number of parallel `GET /billing/check/<id>`
   * loops and repeated purchase events.
   */
  test('polls the payment status once, however often the parent re-renders', async () => {
    const eventCalls = [];
    let fetchCalls = 0;
    const fetch = async () => {
      fetchCalls += 1;
      return { json: async () => ({ status: 2 }) };
    };
    const { CheckPaymentInner } = createLoader({
      '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetch },
      '@contentfactory/helpers/utils/use.fire.events': {
        useFireEvents:
          () =>
          async (...args) =>
            eventCalls.push(args),
      },
      '@contentfactory/frontend/components/layout/loading': () => null,
      '@contentfactory/helpers/utils/timer': { timer: async () => {} },
      '@contentfactory/react/toaster/toaster': { useToaster: () => ({}) },
      '@contentfactory/frontend/components/layout/new-modal': {
        // A new object per call, exactly like the real hook.
        useDecisionModal: () => ({ open: () => {} }),
      },
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (_key, fallback) => fallback,
      },
    })(paymentPath);

    const element = React.createElement(
      CheckPaymentInner,
      { check: 'checkout_confirmed_42', mutate: () => {} },
      React.createElement('div', null, 'billing')
    );
    const { rerender } = render(element);
    await waitFor(() => expect(eventCalls).toHaveLength(1));
    for (let index = 0; index < 5; index += 1) rerender(element);
    await waitFor(() => expect(document.body.textContent).toContain('billing'));

    expect(fetchCalls).toBe(1);
    expect(eventCalls).toHaveLength(1);
  });

  const lifetimeModule = (success, eventCalls) => {
    const fetch = async () => ({ json: async () => ({ success }) });
    const realEvents = createLoader({
      '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetch },
      './custom.fetch': { useFetch: () => fetch },
    })(hookPath);
    const Input = ({
      label,
      name,
      translationKey: _translationKey,
      disableForm: _disableForm,
      removeError: _removeError,
      ...props
    }) =>
      React.createElement(
        'label',
        null,
        label,
        React.createElement('input', { name, ...props })
      );
    const Button = ({ children, ...props }) =>
      React.createElement('button', props, children);
    return createLoader({
      '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetch },
      '@contentfactory/helpers/utils/use.fire.events': {
        useFireEvents:
          () =>
          async (...args) =>
            eventCalls.push(args),
        productEventKeyFromIdentifier: realEvents.productEventKeyFromIdentifier,
      },
      '@contentfactory/frontend/components/layout/user.context': {
        useUser: () => ({
          id: 'opaque-user',
          totalChannels: 0,
          isLifetime: false,
          tier: { current: 'FREE', channel: 1, posts_per_month: 100 },
        }),
      },
      '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing':
        {
          pricing: {
            STANDARD: { channel: 3, posts_per_month: 100 },
            PRO: { channel: 10, posts_per_month: 1000 },
          },
        },
      '@contentfactory/react/form/input': { Input },
      '@contentfactory/react/form/button': { Button },
      swr: { useSWRConfig: () => ({ mutate: () => {} }) },
      '@contentfactory/react/toaster/toaster': {
        useToaster: () => ({ show: () => {} }),
      },
      'next/navigation': { useRouter: () => ({ replace: () => {} }) },
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (_key, fallback) => fallback,
      },
    })(lifetimePath);
  };

  test('does not record an unsuccessful lifetime claim', async () => {
    const eventCalls = [];
    const { LifetimeDeal } = lifetimeModule(false, eventCalls);
    const { getByRole } = render(React.createElement(LifetimeDeal));
    fireEvent.change(getByRole('textbox'), { target: { value: 'claim-code' } });
    fireEvent.click(getByRole('button', { name: 'Claim' }));

    await waitFor(() => expect(getByRole('textbox').value).toBe(''));
    expect(eventCalls).toEqual([]);
  });

  test('records a successful lifetime claim with a non-reversible stable key', async () => {
    const eventCalls = [];
    const { LifetimeDeal } = lifetimeModule(true, eventCalls);
    const { getByRole } = render(React.createElement(LifetimeDeal));
    fireEvent.change(getByRole('textbox'), { target: { value: 'claim-code' } });
    fireEvent.click(getByRole('button', { name: 'Claim' }));

    const digest = crypto
      .createHash('sha256')
      .update('claim-code')
      .digest('hex');
    await waitFor(() => expect(eventCalls).toHaveLength(1));
    expect(eventCalls[0]).toEqual([
      'lifetime_claimed',
      { deduplicationKey: `lifetime:${digest}` },
    ]);
    expect(JSON.stringify(eventCalls[0])).not.toContain('claim-code');
  });
});

describe('AdminProductEventsComponent', () => {
  const apiData = {
    range: {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-18T23:59:59.999Z',
    },
    activation: {
      registeredOrganizations: 8,
      activatedOrganizations: 3,
      ratePercentage: 37.5,
    },
    events: [
      { name: 'register', count: 8, latestAt: '2026-08-18T12:00:00.000Z' },
      { name: 'purchase', count: 2, latestAt: '2026-08-17T12:00:00.000Z' },
      { name: 'channel_added', count: 3, latestAt: '2026-08-18T10:00:00.000Z' },
      { name: 'lifetime_claimed', count: 1, latestAt: null },
      { name: 'cancel_subscription', count: 2, latestAt: '2026-08-18T11:00:00.000Z' },
    ],
    recent: [
      {
        id: 'event_01',
        name: 'channel_added',
        organizationId: `org_${'x'.repeat(90)}`,
        userId: `user_${'y'.repeat(90)}`,
        createdAt: '2026-08-18T10:00:00.000Z',
      },
    ],
  };

  let currentUser;
  let swrState;
  let swrKeys;
  let adminFetch;
  let AdminProductEventsComponent;

  beforeEach(() => {
    currentUser = { isSuperAdmin: true };
    swrState = {
      data: apiData,
      isLoading: false,
      error: null,
      mutate: jest.fn(),
    };
    swrKeys = [];
    adminFetch = jest.fn(async () => ({
      ok: true,
      json: async () => apiData,
    }));
    const Button = ({ children, ...props }) =>
      React.createElement('button', props, children);
    const load = createLoader({
      swr: {
        __esModule: true,
        default: (key) => {
          swrKeys.push(key);
          return swrState;
        },
      },
      '@contentfactory/helpers/utils/custom.fetch': {
        useFetch: () => adminFetch,
      },
      '@contentfactory/frontend/components/layout/user.context': {
        useUser: () => currentUser,
      },
      '@contentfactory/react/form/button': { Button },
      '@contentfactory/react/choice/radio.group': createLoader()(
        path.join(
          repositoryRoot,
          'libraries/react-shared-libraries/src/choice/radio.group.tsx'
        )
      ),
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (_key, fallback) => fallback,
      },
    });
    ({ AdminProductEventsComponent } = load(adminPath));
  });

  test('exists as the focused admin surface', () => {
    expect(fs.existsSync(adminPath)).toBe(true);
  });

  test('refuses access without exposing event data', () => {
    currentUser = { isSuperAdmin: false };
    const { queryByRole, getByRole } = render(
      React.createElement(AdminProductEventsComponent)
    );

    expect(getByRole('alert').textContent).toContain('do not have access');
    expect(queryByRole('table')).toBeNull();
    expect(swrKeys.at(-1)).toBeNull();
    expect(adminFetch).not.toHaveBeenCalled();
  });

  test('shows structural loading and a recoverable error', () => {
    swrState = {
      data: undefined,
      isLoading: true,
      error: null,
      mutate: jest.fn(),
    };
    const loading = render(React.createElement(AdminProductEventsComponent));
    const loadingStatus = loading.getByRole('status');
    expect(loadingStatus.getAttribute('aria-busy')).toBe('true');
    expect(loadingStatus.querySelectorAll('section')).toHaveLength(3);
    expect(loadingStatus.querySelector('table')).not.toBeNull();
    for (const skeleton of loadingStatus.querySelectorAll('.animate-pulse')) {
      expect(skeleton.className).toContain('motion-reduce:animate-none');
    }
    loading.unmount();

    const retry = jest.fn();
    swrState = {
      data: undefined,
      isLoading: false,
      error: new Error('down'),
      mutate: retry,
    };
    const error = render(React.createElement(AdminProductEventsComponent));
    expect(error.getByRole('alert').textContent).toContain('could not load');
    fireEvent.click(error.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test('answers cohort activation first, then gives precise event counts', () => {
    const { container, getByRole, getByText } = render(
      React.createElement(AdminProductEventsComponent)
    );

    expect(swrKeys.at(-1)).toMatch(
      /^\/admin\/product-events\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/
    );
    expect(getByRole('radiogroup', { name: 'Date range' })).not.toBeNull();
    expect(getByText('37.5%')).not.toBeNull();
    const text = container.textContent;
    expect(text.indexOf('Activation')).toBeLessThan(text.indexOf('All events'));
    const eventTable = getByRole('table', { name: 'Product event totals' });
    expect(eventTable.textContent).toContain('lifetime_claimed');
    expect(eventTable.textContent).toContain('cancel_subscription');
    expect(eventTable.textContent).toContain('8');
  });

  test('changes the request range when the period selection changes', async () => {
    const { getByRole } = render(
      React.createElement(AdminProductEventsComponent)
    );
    const initialKey = swrKeys.at(-1);

    fireEvent.click(getByRole('radio', { name: 'Last 7 days' }));

    await waitFor(() => expect(swrKeys.at(-1)).not.toBe(initialKey));
    const initialUrl = new URL(initialKey, 'http://localhost');
    const selectedUrl = new URL(swrKeys.at(-1), 'http://localhost');
    expect(selectedUrl.searchParams.get('from')).not.toBe(
      initialUrl.searchParams.get('from')
    );
    expect(selectedUrl.searchParams.get('to')).toBe(
      initialUrl.searchParams.get('to')
    );
  });

  test('does not nest a second main landmark inside the app shell', () => {
    const { container } = render(
      React.createElement(AdminProductEventsComponent)
    );

    expect(container.querySelector('main')).toBeNull();
  });

  test('shows compact range dates while preserving the full ISO values', () => {
    const { container } = render(
      React.createElement(AdminProductEventsComponent)
    );

    const rangeTimes = Array.from(container.querySelectorAll('header time'));
    expect(rangeTimes.map((node) => node.getAttribute('datetime'))).toEqual([
      '2026-08-01T00:00:00.000Z',
      '2026-08-18T23:59:59.999Z',
    ]);
    expect(rangeTimes.map((node) => node.textContent)).toEqual([
      'Aug 1, 2026',
      'Aug 18, 2026',
    ]);
  });

  test('labels the bounded recent feed as latest and up to 50', () => {
    const { getByRole } = render(
      React.createElement(AdminProductEventsComponent)
    );

    expect(
      getByRole('heading', { name: 'Latest events (up to 50)' })
    ).not.toBeNull();
  });

  test('renders an honest empty state and keeps long opaque ids wrap-safe', () => {
    swrState = {
      ...swrState,
      data: {
        ...apiData,
        events: [],
        recent: [],
        activation: {
          registeredOrganizations: 0,
          activatedOrganizations: 0,
          ratePercentage: 0,
        },
      },
    };
    const empty = render(React.createElement(AdminProductEventsComponent));
    expect(empty.getByRole('status').textContent).toContain(
      'No product events'
    );
    empty.unmount();

    swrState = { ...swrState, data: apiData };
    const populated = render(React.createElement(AdminProductEventsComponent));
    const organization = populated.getByText(apiData.recent[0].organizationId);
    expect(organization.className).toMatch(/break-all|break-words/);
    expect(populated.container.querySelector('.tabular-nums')).not.toBeNull();
    expect(populated.container.textContent).not.toMatch(/@|example\.com/i);
  });
});

describe('AdminProductEventsComponent localization and clock', () => {
  const apiData = {
    range: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-18T23:59:59.999Z' },
    activation: {
      registeredOrganizations: 8,
      activatedOrganizations: 3,
      ratePercentage: 37.5,
    },
    events: [
      { name: 'register', count: 8, latestAt: '2026-08-18T23:30:00.000Z' },
      { name: 'purchase', count: 0, latestAt: null },
      { name: 'channel_added', count: 3, latestAt: null },
      { name: 'lifetime_claimed', count: 0, latestAt: null },
    ],
    recent: [
      {
        id: 'event_01',
        name: 'channel_added',
        organizationId: 'org_1',
        userId: 'user_1',
        createdAt: '2026-08-18T23:30:00.000Z',
      },
    ],
  };

  const load = (state) => {
    const Button = ({ children, ...props }) =>
      React.createElement('button', props, children);
    return createLoader({
      swr: { __esModule: true, default: () => state },
      '@contentfactory/helpers/utils/custom.fetch': {
        useFetch: () => async () => ({ ok: true, json: async () => apiData }),
      },
      '@contentfactory/frontend/components/layout/user.context': {
        useUser: () => ({ isSuperAdmin: true }),
      },
      '@contentfactory/react/form/button': { Button },
      '@contentfactory/react/choice/radio.group': createLoader()(
        path.join(
          repositoryRoot,
          'libraries/react-shared-libraries/src/choice/radio.group.tsx'
        )
      ),
      '@contentfactory/react/translation/get.transation.service.client': {
        // Every translated string becomes recognisable; anything left in
        // English is a literal that never reaches the other fifteen locales.
        useT: () => (key) => `tr:${key}`,
      },
    })(adminPath).AdminProductEventsComponent;
  };

  test('names the screen-reader-only surfaces from the translation bundle', () => {
    const Loading = load({ data: undefined, isLoading: true, error: null });
    const loading = render(React.createElement(Loading));
    const status = loading.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('tr:product_events_loading');
    expect(status.querySelector('.sr-only').textContent).toBe(
      'tr:product_events_loading'
    );
    loading.unmount();

    const Report = load({
      data: apiData,
      isLoading: false,
      error: null,
      mutate: jest.fn(),
    });
    const report = render(React.createElement(Report));
    expect(
      report.container.querySelector('table').getAttribute('aria-label')
    ).toBe('tr:product_events_totals_table');
    expect(
      report.container.querySelector('ol').getAttribute('aria-label')
    ).toBe('tr:product_events_recent_list');
    expect(report.container.innerHTML).not.toMatch(
      /aria-label="[A-Z][a-z]+ [a-z]/
    );
  });

  /**
   * The requested range is built from UTC dates, so printing the range in UTC
   * and the timestamps in the reader's own zone put two different times for
   * the same moment on one screen.
   */
  test('prints one clock and says which one it is', () => {
    const Report = load({
      data: apiData,
      isLoading: false,
      error: null,
      mutate: jest.fn(),
    });
    const { container } = render(React.createElement(Report));
    const times = Array.from(container.querySelectorAll('time'));

    expect(times.map((node) => node.textContent)).toEqual([
      'Aug 1, 2026',
      'Aug 18, 2026',
      'Aug 18, 2026, 11:30 PM UTC',
    ]);
    expect(container.textContent).toContain('Aug 18, 2026, 11:30 PM UTC');
  });
});

describe('product-events admin page boundary', () => {
  test('mounts the report inside the shared page shell', () => {
    const AdminProductEventsComponent = () =>
      React.createElement('div', null, 'product-events-report');
    const PageShell = ({ children }) =>
      React.createElement('div', { 'data-page-shell': '' }, children);
    const page = createLoader({
      '@contentfactory/frontend/components/admin/admin-product-events.component':
        {
          AdminProductEventsComponent,
        },
      '@contentfactory/react/layout': { PageShell },
      // Заголовок вкладки идёт через общего помощника (fn33.94); здесь он не
      // под проверкой — страница получает заглушку той же формы.
      '@contentfactory/frontend/app/page-title': {
        pageTitle: () => async () => ({ title: '', description: '' }),
      },
      next: {},
    })(adminPagePath);

    const mounted = render(React.createElement(page.default));
    expect(mounted.getByText('product-events-report')).not.toBeNull();
    expect(mounted.container.querySelector('[data-page-shell]')).not.toBeNull();
  });
});
