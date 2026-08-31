const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const originalFetch = global.fetch;
const originalFrontendUrl = process.env.FRONTEND_URL;
const providersDirectory = path.join(
  repositoryRoot,
  'libraries/nestjs-libraries/src/integrations/social'
);

const providerFiles = fs
  .readdirSync(providersDirectory)
  .filter((file) => file.endsWith('.provider.ts'))
  .sort();

const readProvider = (file) =>
  fs.readFileSync(path.join(providersDirectory, file), 'utf8');

const noopDecorator = () => (target) => target;

function loadProvider(file) {
  const filename = path.join(providersDirectory, file);
  const compiled = ts.transpileModule(readProvider(file), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) => {
    if (request.endsWith('/services/make.is')) {
      return { makeId: (length) => 'x'.repeat(length) };
    }
    if (request.endsWith('/integrations/social.abstract')) {
      return { SocialAbstract: class {} };
    }
    if (request.endsWith('/integrations/social/instagram.provider')) {
      return {
        InstagramProvider: class {
          handleErrors() {}
        },
      };
    }
    if (request.endsWith('/chat/rules.description.decorator')) {
      return { Rules: noopDecorator };
    }
    if (request.endsWith('/decorators/plug.decorator')) {
      return { Plug: noopDecorator };
    }
    if (request.endsWith('/integrations/tool.decorator')) {
      return { Tool: noopDecorator };
    }
    if (request.startsWith('@contentfactory/') || request === '@prisma/client') {
      return {};
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
  )(loaded.exports, localRequire, loaded, filename, providersDirectory);
  return loaded.exports;
}

describe('social OAuth redirect domains', () => {
  test('scans every provider implementation for foreign redirect services', () => {
    assert.ok(providerFiles.length > 0);

    for (const file of providerFiles) {
      const source = readProvider(file);
      assert.doesNotMatch(
        source,
        /redirectmeto\.com/i,
        `${file} must never route an OAuth callback through redirectmeto.com`
      );

      // Callback URLs may be configured per provider, but they must not embed
      // a third-party redirect service in source. Keep this list deliberately
      // broad so a future spelling/port variation cannot bypass the guard.
      assert.doesNotMatch(
        source,
        /https?:\/\/[^\s`'"$}]+(?:redirect|callback)[^\s`'"$}]*/i,
        `${file} must not contain a hard-coded foreign redirect/callback URL`
      );
      assert.doesNotMatch(
        source,
        /redirect_uri\s*(?:=|:)\s*[`'"]?https?:\/\//i,
        `${file} must derive redirect_uri from configuration, not a foreign URL literal`
      );
    }
  });

  test('the five local OAuth providers build callbacks from FRONTEND_URL', () => {
    const expected = {
      'threads.provider.ts': '/integrations/social/threads',
      'instagram.standalone.provider.ts':
        '/integrations/social/instagram-standalone',
      'vk.provider.ts': '/integrations/social/vk',
      'tiktok.provider.ts': '/integrations/social/tiktok',
      'slack.provider.ts': '/integrations/social/slack',
    };

    for (const [file, callbackPath] of Object.entries(expected)) {
      const source = readProvider(file);
      assert.match(source, /FRONTEND_URL/);
      assert.match(source, new RegExp(callbackPath.replaceAll('/', '\\/')));
    }
  });

  test.each([
    ['threads.provider.ts', 'ThreadsProvider', '/integrations/social/threads'],
    [
      'instagram.standalone.provider.ts',
      'InstagramStandaloneProvider',
      '/integrations/social/instagram-standalone',
    ],
    ['vk.provider.ts', 'VkProvider', '/integrations/social/vk'],
    ['tiktok.provider.ts', 'TiktokProvider', '/integrations/social/tiktok'],
    ['slack.provider.ts', 'SlackProvider', '/integrations/social/slack'],
  ])(
    '%s emits its exact first-party callback',
    async (file, exportName, callbackPath) => {
      process.env.FRONTEND_URL = 'https://local.content-factory.test';
      global.fetch = jest.fn(() => {
        throw new Error('generateAuthUrl must not use the network');
      });
      const Provider = loadProvider(file)[exportName];

      const authorizationUrl = new URL(
        (await new Provider().generateAuthUrl()).url
      );

      expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
        `https://local.content-factory.test${callbackPath}`
      );
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );
});

afterEach(() => {
  if (originalFrontendUrl === undefined) {
    delete process.env.FRONTEND_URL;
  } else {
    process.env.FRONTEND_URL = originalFrontendUrl;
  }
  global.fetch = originalFetch;
});
