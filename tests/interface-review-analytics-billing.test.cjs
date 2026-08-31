'use strict';

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const sceneRoot = path.resolve(
  __dirname,
  '../apps/frontend/src/components/interface-review/analytics-billing'
);
const sceneFiles = [
  'production-analytics.scene.tsx',
  'audience-analytics.scene.tsx',
  'billing-first-use.scene.tsx',
  'billing-manage.scene.tsx',
];
const scenesExist = sceneFiles.every((file) =>
  fs.existsSync(path.join(sceneRoot, file))
);
const routePath = path.resolve(
  __dirname,
  '../apps/frontend/src/app/(stand)/interface-review/analytics-billing/[scene]/page.tsx'
);
const routeExists = fs.existsSync(routePath);

test('publishes four independent analytics and billing production scenes', () => {
  expect(scenesExist).toBe(true);
});

test('publishes a group-owned route for four stable analytics and billing URLs', () => {
  expect(routeExists).toBe(true);
});

if (!scenesExist || !routeExists) return;

const { resolveInterfaceReviewContext } = loadTypeScriptModule(
  'apps/frontend/src/components/interface-review/fixture-contract.tsx'
);
const production = loadTypeScriptModule(
  'apps/frontend/src/components/interface-review/analytics-billing/production-analytics.scene.tsx'
);
const audience = loadTypeScriptModule(
  'apps/frontend/src/components/interface-review/analytics-billing/audience-analytics.scene.tsx'
);
const firstUse = loadTypeScriptModule(
  'apps/frontend/src/components/interface-review/analytics-billing/billing-first-use.scene.tsx'
);
const manage = loadTypeScriptModule(
  'apps/frontend/src/components/interface-review/analytics-billing/billing-manage.scene.tsx'
);
const productionView = loadTypeScriptModule(
  'apps/frontend/src/components/platform-analytics/production.analytics.view.tsx'
);
const audienceView = loadTypeScriptModule(
  'apps/frontend/src/components/platform-analytics/audience.analytics.view.tsx'
);
const firstUseView = loadTypeScriptModule(
  'apps/frontend/src/components/billing/billing-first-use.view.tsx'
);
const manageView = loadTypeScriptModule(
  'apps/frontend/src/components/billing/billing-manage.view.tsx'
);
const reviewRoute = loadTypeScriptModule(
  'apps/frontend/src/app/(stand)/interface-review/analytics-billing/[scene]/page.tsx'
);

const renderScene = (module, state, locale = 'en') =>
  renderToStaticMarkup(
    React.createElement(module.Scene, {
      context: resolveInterfaceReviewContext(
        { state, theme: 'dark', locale, viewport: '390' },
        module.scene.states
      ),
    })
  );

describe('analytics and billing fixture contract', () => {
  test.each([
    ['production', 'selected', 'data-analytics-view="production"'],
    ['audience', 'empty', 'Metrics are unavailable for this channel'],
    ['billing-first-use', 'restricted', 'Another account with this email'],
    ['billing-manage', 'success', 'Coupon applied'],
  ])(
    'renders /interface-review/analytics-billing/%s from query context',
    async (sceneName, state, marker) => {
      const element = await reviewRoute.default({
        params: Promise.resolve({ scene: sceneName }),
        searchParams: Promise.resolve({
          state,
          theme: 'dark',
          locale: 'en',
          viewport: '390',
        }),
      });
      const markup = renderToStaticMarkup(element);

      expect(markup).toContain(marker);
      expect(markup).toContain(`data-interface-review-state="${state}"`);
      expect(markup).toContain('data-interface-review-theme="dark"');
      expect(markup).toContain('data-interface-review-viewport="390"');
    }
  );

  test('resolves failed and missing async payloads as errors instead of endless loading', () => {
    expect(
      productionView.resolveProductionAnalyticsState({
        isLoading: false,
        error: new Error('offline'),
        data: undefined,
      })
    ).toBe('error');
    expect(
      audienceView.resolveAudienceAnalyticsState({
        isLoading: false,
        error: new Error('provider unavailable'),
        metrics: undefined,
      })
    ).toBe('error');
    expect(
      firstUseView.resolveBillingFirstUseState({
        isLoading: false,
        error: new Error('checkout session failed'),
        data: undefined,
      })
    ).toBe('error');
    expect(
      manageView.resolveBillingManageState({
        isLoading: false,
        error: undefined,
        subscriptionLoaded: false,
      })
    ).toBe('error');
  });

  test('keeps fixture data deeply frozen and records contract-backed exclusions', () => {
    expect(production.scene.id).toBe('analytics-billing/production');
    expect(audience.scene.id).toBe('analytics-billing/audience');
    expect(firstUse.scene.id).toBe('analytics-billing/billing-first-use');
    expect(manage.scene.id).toBe('analytics-billing/billing-manage');

    expect(Object.isFrozen(audience.scene.fixture.channels)).toBe(true);
    expect(Object.isFrozen(firstUse.scene.fixture.plans[0])).toBe(true);
    expect(production.scene.fixture.exclusions).toEqual({
      success: 'Read-only local computation has no success transition.',
      restricted:
        'The endpoint has organization context but no surface-specific access gate.',
      disabled: 'The read-only report has no action that can be disabled.',
    });
    expect(audience.scene.fixture.exclusions).toEqual({
      success: 'Provider metrics are read-only and have no success transition.',
      restricted:
        'The endpoint has no surface-specific permission or billing gate.',
    });
    expect(firstUse.scene.fixture.exclusions.empty).toContain('static pricing');
    expect(manage.scene.fixture.exclusions.empty).toContain('FREE');
  });

  test('renders production analytics states from the contract without provider claims', () => {
    const selected = renderScene(production, 'selected');
    const empty = renderScene(production, 'empty');
    const error = renderScene(production, 'error', 'ru');

    expect(selected).toContain('data-analytics-view="production"');
    expect(selected).toContain('30 days');
    expect(selected).toContain('Synthetic editorial channel');
    expect(selected).toContain('12');
    expect(empty).toContain('No publishing attempts');
    expect(error).toContain('role="alert"');
    expect(error).toContain('Повторить безопасно');
    expect(selected).not.toContain('followers');
  });

  test('renders audience unavailable data without fake KPI values', () => {
    const selected = renderScene(audience, 'selected');
    const unavailable = renderScene(audience, 'empty');
    const disabled = renderScene(audience, 'disabled');

    expect(selected).toContain('data-analytics-view="audience"');
    expect(selected).toContain('Audience growth');
    expect(selected).toContain('48');
    expect(unavailable).toContain('Metrics are unavailable for this channel');
    expect(unavailable).not.toMatch(/>0<|0%|fake|estimated/i);
    expect(disabled).toContain('Channel disabled');
  });

  test('renders first-use billing chrome while keeping Stripe an external boundary', () => {
    const selected = renderScene(firstUse, 'selected');
    const restricted = renderScene(firstUse, 'restricted');
    const error = renderScene(firstUse, 'error');

    expect(selected).toContain('data-billing-view="first-use"');
    expect(selected).toContain('Standard');
    expect(selected).toContain('Monthly');
    expect(selected).toContain('Payment details are provided by Stripe');
    expect(selected).not.toContain('payment-element');
    expect(selected).not.toContain('client_secret');
    expect(restricted).toContain('Another account with this email');
    expect(error).toContain('role="alert"');
  });

  test('renders managed billing loading, success, restricted and disabled outcomes', () => {
    const loading = renderScene(manage, 'loading');
    const success = renderScene(manage, 'success');
    const restricted = renderScene(manage, 'restricted');
    const disabled = renderScene(manage, 'disabled');

    expect(loading).toContain('aria-busy="true"');
    expect(success).toContain('Coupon applied');
    expect(restricted).toContain('Workspace administrator access is required');
    expect(disabled).toContain('Current plan');
    expect(disabled).toContain('disabled=""');
  });
});

test('the Stripe-owned checkout boundary remains in the production adapter only', () => {
  const embedded = fs.readFileSync(
    path.resolve(
      __dirname,
      '../apps/frontend/src/components/billing/embedded.billing.tsx'
    ),
    'utf8'
  );
  const sceneSource = sceneFiles
    .map((file) => fs.readFileSync(path.join(sceneRoot, file), 'utf8'))
    .join('\n');

  expect(embedded).toContain('<CheckoutProvider');
  expect(embedded).toContain('<PaymentElement');
  expect(sceneSource).not.toMatch(
    /@stripe|EmbeddedBilling|client_secret|useFetch|useSWR/
  );
});
