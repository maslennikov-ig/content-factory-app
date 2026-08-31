'use strict';

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const cache = new Map();
const suffixes = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'];

const mocks = {
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => async () => new Response(),
  },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => ({ isSuperAdmin: true, role: 'SUPERADMIN' }),
  },
  '@contentfactory/frontend/components/new-launch/store': {
    useLaunchStore: () => ({}),
  },
  '@contentfactory/frontend/components/launches/helpers/use.existing.data': {
    useExistingData: () => ({ integration: '' }),
  },
  '@contentfactory/frontend/components/layout/loading': {
    LoadingComponent: () => React.createElement('div', { 'aria-busy': true }),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (_key, fallback) => fallback,
  },
  '../translation/translated-label': {
    TranslatedLabel: ({ label, children }) =>
      React.createElement(React.Fragment, null, label, children),
  },
  '@contentfactory/react/toaster/toaster': {
    useToaster: () => ({ show: () => undefined }),
  },
  'zustand/react/shallow': { useShallow: (selector) => selector },
  'next/navigation': {
    notFound: () => {
      throw new Error('not found');
    },
  },
  swr: { __esModule: true, default: () => ({}) },
};

function resolveLocal(fromDirectory, request) {
  let base;
  if (request.startsWith('.')) base = path.resolve(fromDirectory, request);
  else if (request.startsWith('@contentfactory/frontend/')) {
    base = path.join(
      repositoryRoot,
      'apps/frontend/src',
      request.slice('@contentfactory/frontend/'.length)
    );
  } else if (request.startsWith('@contentfactory/react/')) {
    base = path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src',
      request.slice('@contentfactory/react/'.length)
    );
  } else return null;

  for (const suffix of suffixes) {
    const candidate = base + suffix;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  }
  throw new Error(`Cannot resolve ${request} from ${fromDirectory}`);
}

function loadFile(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
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
  cache.set(filename, loaded);
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request))
      return mocks[request];
    const local = resolveLocal(path.dirname(filename), request);
    return local ? loadFile(local) : require(request);
  };
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

const load = (relativePath) =>
  loadFile(path.join(repositoryRoot, relativePath));
const SCENE_ROOT =
  'apps/frontend/src/components/interface-review/settings-admin';
const matrix = [
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

const sceneModules = [
  [
    'settings.scene.tsx',
    'settingsScene',
    'settingsExclusions',
    'SettingsReviewScene',
  ],
  [
    'admin-users.scene.tsx',
    'adminUsersScene',
    'adminUsersExclusions',
    'AdminUsersReviewScene',
  ],
  [
    'admin-stats.scene.tsx',
    'adminStatsScene',
    'adminStatsExclusions',
    'AdminStatsReviewScene',
  ],
  [
    'channel-picker.scene.tsx',
    'channelPickerScene',
    'channelPickerExclusions',
    'ChannelPickerReviewScene',
  ],
];

test.each(sceneModules)(
  '%s is a browser client boundary for its inert review controls',
  (file) => {
    const source = fs.readFileSync(
      path.join(repositoryRoot, SCENE_ROOT, file),
      'utf8'
    );
    expect(source).toMatch(/^'use client';/);
  }
);

test.each(sceneModules)(
  '%s covers every surface state or gives a contract-backed exclusion',
  (file, sceneExport, exclusionsExport) => {
    const module = load(`${SCENE_ROOT}/${file}`);
    const covered = [
      ...module[sceneExport].states,
      ...Object.keys(module[exclusionsExport]),
    ].sort();
    expect(covered).toEqual([...matrix].sort());
    expect(
      Object.values(module[exclusionsExport]).every(
        (reason) => reason.length >= 24
      )
    ).toBe(true);
  }
);

test.each([
  ['settings', 'settings-admin/settings'],
  ['users', 'settings-admin/users'],
  ['stats', 'settings-admin/stats'],
  ['channel-picker', 'settings-admin/channel-picker'],
])(
  'the %s route passes its exact review query to the production scene',
  async (slug, sceneId) => {
    const route = load(
      `apps/frontend/src/app/(stand)/interface-review/settings-admin/${slug}/page.tsx`
    );
    const element = await route.default({
      searchParams: Promise.resolve({
        state: 'long-content',
        theme: 'dark',
        locale: 'ru',
        viewport: '390',
      }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain(`data-interface-review-scene="${sceneId}"`);
    expect(markup).toContain('data-interface-review-state="long-content"');
    expect(markup).toContain('data-interface-review-theme="dark"');
    expect(markup).toContain('data-interface-review-locale="ru"');
    expect(markup).toContain('data-interface-review-viewport="390"');
  }
);

test.each(sceneModules)(
  '%s renders its production surface for every supported synthetic state',
  (file, sceneExport, _exclusionsExport, componentExport) => {
    const module = load(`${SCENE_ROOT}/${file}`);
    for (const state of module[sceneExport].states) {
      const markup = renderToStaticMarkup(
        React.createElement(module[componentExport], {
          context: { state, theme: 'light', locale: 'en', viewport: 390 },
        })
      );
      expect(markup).toContain(
        `data-production-surface="${module[sceneExport].id}"`
      );
    }
  }
);

test('locked channel picker exposes disabled toggle buttons and an explanation', () => {
  const module = load(`${SCENE_ROOT}/channel-picker.scene.tsx`);
  const markup = renderToStaticMarkup(
    React.createElement(module.ChannelPickerReviewScene, {
      context: {
        state: 'restricted',
        theme: 'dark',
        locale: 'en',
        viewport: 390,
      },
    })
  );

  expect(markup).toMatch(
    /<button[^>]+disabled=""[^>]+aria-describedby="channel-picker-restriction"/
  );
  expect(markup).toContain('id="channel-picker-restriction"');
});

test('dark channel fixture uses only local Mastodon, Dev.to, Listmonk and YouTube assets', () => {
  const module = load(`${SCENE_ROOT}/channel-picker.scene.tsx`);
  const markup = renderToStaticMarkup(
    React.createElement(module.ChannelPickerReviewScene, {
      context: {
        state: 'selected',
        theme: 'dark',
        locale: 'en',
        viewport: 390,
      },
    })
  );
  const imageSources = [...markup.matchAll(/<img[^>]+src="([^"]+)"/g)].map(
    (match) => match[1]
  );

  expect(imageSources.sort()).toEqual([
    '/icons/platforms/devto.svg',
    '/icons/platforms/listmonk.svg',
    '/icons/platforms/mastodon.svg',
    '/icons/platforms/youtube.png',
  ]);
  expect(markup).not.toMatch(/https?:\/\//);
  expect(markup).toContain('data-live-provider-connection="false"');
});

test.each([
  ['settings.scene.tsx', 'SettingsReviewScene', 'распределённой'],
  ['admin-users.scene.tsx', 'AdminUsersReviewScene', 'распределённой'],
  ['admin-stats.scene.tsx', 'AdminStatsReviewScene', 'федеративная'],
  ['channel-picker.scene.tsx', 'ChannelPickerReviewScene', 'локализованное'],
])(
  '%s renders long Russian content instead of changing only the lang attribute',
  (file, componentExport, expectedLongWord) => {
    const module = load(`${SCENE_ROOT}/${file}`);
    const markup = renderToStaticMarkup(
      React.createElement(module[componentExport], {
        context: {
          state: 'long-content',
          theme: 'light',
          locale: 'ru',
          viewport: 390,
        },
      })
    );

    expect(markup).toContain(expectedLongWord);
  }
);
