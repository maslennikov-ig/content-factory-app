'use strict';

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const sceneFiles = [
  'developer.scene.tsx',
  'public-api.scene.tsx',
  'preview.scene.tsx',
  'extension.scene.tsx',
  'oauth-authorize.scene.tsx',
  'provider-preview.scene.tsx',
  'provider-add.scene.tsx',
];
const sceneRoot =
  'apps/frontend/src/components/interface-review/developer-preview';
const routeFile =
  'apps/frontend/src/app/(stand)/interface-review/developer-preview/[scene]/page.tsx';
const scenesExist = sceneFiles.every((file) =>
  fs.existsSync(path.join(root, sceneRoot, file))
);
const routeExists = fs.existsSync(path.join(root, routeFile));

test('publishes independent developer and preview production scenes', () => {
  expect(scenesExist).toBe(true);
});

if (!scenesExist) return;

test('publishes a group-owned browser route for developer and preview scenes', () => {
  expect(routeExists).toBe(true);
});

if (!routeExists) return;

const reviewStates = [
  'loading',
  'empty',
  'default',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
];

const expectedExclusions = {
  developer: [],
  'public-api': ['empty'],
  preview: ['selected'],
  extension: ['success'],
  'oauth-authorize': ['empty', 'selected', 'success', 'restricted'],
  'provider-preview': ['empty', 'selected', 'success', 'restricted', 'disabled'],
  'provider-add': ['success', 'restricted', 'disabled'],
};

const modules = Object.fromEntries(
  sceneFiles.map((file) => {
    const loaded = loadTypeScriptModule(`${sceneRoot}/${file}`);
    return [loaded.scene.id.split('/').at(-1), loaded];
  })
);

describe('developer and preview scene contract', () => {
  test.each(Object.keys(expectedExclusions))(
    '/interface-review/developer-preview/%s resolves query context and renders the scene',
    async (id) => {
      const route = loadTypeScriptModule(routeFile);
      const output = await route.default({
        params: Promise.resolve({ scene: id }),
        searchParams: Promise.resolve({
          state: 'default',
          theme: 'dark',
          locale: 'ru',
          viewport: '390',
        }),
      });
      const markup = renderToStaticMarkup(output);

      expect(markup).toContain(
        `data-interface-review-scene="developer-preview/${id}"`
      );
      expect(markup).toContain('data-interface-review-state="default"');
      expect(markup).toContain('data-interface-review-theme="dark"');
      expect(markup).toContain('data-interface-review-locale="ru"');
      expect(markup).toContain('data-interface-review-viewport="390"');
    }
  );

  test.each(Object.entries(expectedExclusions))(
    '%s declares the full state matrix with contract-backed exclusions',
    (id, exclusions) => {
      const loaded = modules[id];
      expect(loaded.exclusions.map(({ state }) => state)).toEqual(exclusions);
      expect(
        [...loaded.scene.states, ...loaded.exclusions.map(({ state }) => state)].sort()
      ).toEqual([...reviewStates].sort());
      for (const exclusion of loaded.exclusions) {
        expect(exclusion.contract.length).toBeGreaterThan(24);
      }
    }
  );

  test.each(Object.keys(expectedExclusions))(
    '%s renders its production surface from frozen synthetic data',
    (id) => {
      const loaded = modules[id];
      expect(Object.isFrozen(loaded.scene.fixture)).toBe(true);
      const state = loaded.scene.states.includes('long-content')
        ? 'long-content'
        : loaded.scene.states[0];
      const markup = renderToStaticMarkup(
        React.createElement(loaded.Scene, {
          context: { state, theme: 'dark', locale: 'ru', viewport: 390 },
        })
      );

      expect(markup).toContain(`data-product-surface="${id}"`);
      expect(markup).toContain(`data-surface-state="${state}"`);
      expect(markup).toContain('data-interface-review-data="synthetic"');
    }
  );

  test('fixtures contain data only and no credential or callback material', () => {
    const serialized = JSON.stringify(
      Object.values(modules).map(({ scene }) => scene.fixture)
    );

    expect(serialized).not.toMatch(
      /client[_ -]?secret|api[_ -]?key|bearer|jwt|token|https?:\/\/|callback/i
    );
  });
});

describe('runtime protocol boundaries', () => {
  test('OAuth authorize keeps its validation and decision endpoints', () => {
    const source = read(
      'apps/frontend/src/app/(app)/oauth/authorize/page.tsx'
    );
    expect(source).toContain('fetch(`/oauth/authorize?${params}`)');
    expect(source).toContain("fetch('/oauth/authorize', {");
    expect(source).toContain('window.location.href = result.redirect');
  });

  test('provider bridge keeps the native pull protocol globals', () => {
    const source = read(
      'apps/frontend/src/app/(provider)/provider/[p]/bridge.tsx'
    );
    expect(source).toContain('__PROVIDER_INIT__');
    expect(source).toContain('__getProviderPreviewValues__');
    expect(source).toContain('__validateProviderPreview__');
    expect(source).toContain('__getProviderMaxCharacters__');
    expect(source).toContain("errors: ['not-ready']");
  });

  test('extension and provider add still delegate full runtime behavior', () => {
    expect(
      read('apps/frontend/src/app/(extension)/modal/[style]/[platform]/page.tsx')
    ).toContain('<StandaloneModal />');
    expect(
      read('apps/frontend/src/app/(provider)/provider/add/page.tsx')
    ).toContain('<MobileIntegration />');
  });
});
