'use strict';

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const contractPath = path.resolve(
  __dirname,
  '../apps/frontend/src/components/interface-review/fixture-contract.tsx'
);
const accessPath = path.resolve(
  __dirname,
  '../apps/frontend/src/components/interface-review/review-access.ts'
);
const contractExists = fs.existsSync(contractPath) && fs.existsSync(accessPath);
const proxyPath = path.resolve(__dirname, '../apps/frontend/src/proxy.ts');

test('publishes the interface review fixture boundary', () => {
  expect(contractExists).toBe(true);
});

if (!contractExists) return;

const {
  INTERFACE_REVIEW_STATES,
  defineInterfaceReviewScene,
  resolveInterfaceReviewContext,
  InterfaceReviewDocument,
  InterfaceReviewFrame,
} = loadTypeScriptModule(
  'apps/frontend/src/components/interface-review/fixture-contract.tsx'
);

const allowedByDirective = (policy, directive, candidate) => {
  const sources = policy
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&')
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([name]) => name === directive)
    ?.slice(1);

  if (!sources || sources.includes("'none'")) return false;
  if (sources.includes('*')) return true;
  const url = new URL(candidate, 'http://localhost:4200');
  return sources.some(
    (source) =>
      (source === "'self'" && url.origin === 'http://localhost:4200') ||
      (source === 'data:' && url.protocol === 'data:')
  );
};

describe('interface review fixture contract', () => {
  test('keeps the local review routes reachable without opening them in production', () => {
    const source = fs.readFileSync(proxyPath, 'utf8');

    expect(source).toMatch(
      /process\.env\.NODE_ENV\s*===\s*'development'[\s\S]*nextUrl\.pathname\s*===\s*'\/interface-review'/
    );
    expect(source).toMatch(/nextUrl\.pathname\.startsWith\('\/interface-review\/'\)/);
    const publicPaths = source.match(
      /export const PUBLIC_PATHS\s*=\s*\[([\s\S]*?)\];/
    )?.[1];
    expect(publicPaths).toBeDefined();
    expect(publicPaths).not.toMatch(/['"]\/interface-review['"]/);
  });

  test('resolves the exact state, theme, locale and viewport from a scene URL', () => {
    const context = resolveInterfaceReviewContext({
      state: 'loading',
      theme: 'dark',
      locale: 'ru',
      viewport: '390',
    });

    expect(context).toEqual({
      state: 'loading',
      theme: 'dark',
      locale: 'ru',
      viewport: 390,
    });
    expect(INTERFACE_REVIEW_STATES).toEqual([
      'loading',
      'empty',
      'default',
      'selected',
      'success',
      'error',
      'restricted',
      'disabled',
      'long-content',
    ]);
  });

  test.each([
    ['state', 'connected'],
    ['theme', 'system'],
    ['locale', 'production'],
    ['viewport', '412'],
  ])('rejects an unknown %s instead of silently changing the review', (key, value) => {
    expect(() => resolveInterfaceReviewContext({ [key]: value })).toThrow(
      `Unsupported interface review ${key}: ${value}`
    );
  });

  test('creates independent frozen scenes without a shared registry', () => {
    const first = defineInterfaceReviewScene({
      id: 'settings-admin/profile',
      fixture: { account: { name: 'Synthetic team' } },
      states: ['default', 'loading', 'success'],
    });
    const second = defineInterfaceReviewScene({
      id: 'analytics-billing/overview',
      fixture: { totals: [0, 3] },
      states: ['empty', 'error', 'long-content'],
    });

    expect(first.id).toBe('settings-admin/profile');
    expect(second.id).toBe('analytics-billing/overview');
    expect(first.fixture).toEqual({ account: { name: 'Synthetic team' } });
    expect(Object.isFrozen(first.fixture.account)).toBe(true);
    expect(() => {
      first.fixture.account.name = 'Production team';
    }).toThrow();
    expect(() =>
      resolveInterfaceReviewContext({ state: 'error' }, first.states)
    ).toThrow('Unsupported interface review state: error');
  });

  test('rejects runtime clients and non-local scene identifiers from fixture data', () => {
    expect(() =>
      defineInterfaceReviewScene({
        id: 'https://provider.example/live',
        fixture: {},
        states: ['default'],
      })
    ).toThrow('Interface review scene id must be a local route path');
    expect(() =>
      defineInterfaceReviewScene({
        id: 'developer-preview/oauth',
        fixture: { connect: () => fetch('https://provider.example/live') },
        states: ['default'],
      })
    ).toThrow('Interface review fixtures must contain data only');
  });

  test('renders a browser-enforced offline document around synthetic scene output', () => {
    const scene = defineInterfaceReviewScene({
      id: 'settings-admin/profile',
      fixture: {},
      states: ['empty'],
    });
    const context = {
      state: 'empty',
      theme: 'dark',
      locale: 'en',
      viewport: 768,
    };
    const markup = renderToStaticMarkup(
      React.createElement(
        InterfaceReviewDocument,
        {
          sceneId: 'interface-review',
          context: resolveInterfaceReviewContext({}),
        },
        React.createElement(
          InterfaceReviewFrame,
          { scene, context },
          React.createElement('p', null, 'Synthetic scene')
        )
      )
    );
    const encodedPolicy = markup.match(
      /http-equiv="Content-Security-Policy" content="([^"]+)"/
    )?.[1];
    const policy = encodedPolicy
      ?.replaceAll('&#x27;', "'")
      .replaceAll('&amp;', '&');

    expect(policy).toBeDefined();
    expect(
      allowedByDirective(policy, 'connect-src', 'https://provider.example/live')
    ).toBe(false);
    expect(
      allowedByDirective(policy, 'img-src', 'https://provider.example/logo.png')
    ).toBe(false);
    expect(allowedByDirective(policy, 'script-src', '/_next/static/review.js')).toBe(
      true
    );
    expect(
      allowedByDirective(
        policy,
        'script-src',
        'https://provider.example/provider.js'
      )
    ).toBe(false);
    expect(policy).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    );
    expect(allowedByDirective(policy, 'connect-src', '/api/provider/live')).toBe(
      false
    );
    expect(policy).toContain("form-action 'none'");
    expect(markup).toContain('data-interface-review-scene="settings-admin/profile"');
    expect(markup).toContain('data-interface-review-state="empty"');
    expect(markup).toContain('data-interface-review-viewport="768"');
    expect(markup).toContain(
      'class="dark min-h-screen bg-cf-canvas text-cf-ink" lang="en"'
    );
    expect(markup).toContain('data-interface-review-data="synthetic"');
    expect(markup).toContain('data-interface-review-persistence="disabled"');
  });

  test('turns the route into not-found outside development and test', () => {
    const { assertInterfaceReviewEnvironment } = loadTypeScriptModule(
      'apps/frontend/src/components/interface-review/review-access.ts'
    );
    const unavailable = jest.fn(() => {
      throw new Error('not found');
    });

    expect(() => assertInterfaceReviewEnvironment('production', unavailable)).toThrow(
      'not found'
    );
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(() => assertInterfaceReviewEnvironment(undefined, unavailable)).toThrow(
      'not found'
    );
    expect(unavailable).toHaveBeenCalledTimes(2);
    expect(() => assertInterfaceReviewEnvironment('development', unavailable)).not.toThrow();
    expect(() => assertInterfaceReviewEnvironment('test', unavailable)).not.toThrow();
  });
});
