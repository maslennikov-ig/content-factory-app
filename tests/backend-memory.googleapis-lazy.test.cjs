const fs = require('node:fs');
const path = require('node:path');
const {
  loadTypeScriptModule,
  repositoryRoot,
} = require('./helpers/load-ts-module.cjs');

const GOOGLE_SDK_REQUEST =
  '@contentfactory/nestjs-libraries/integrations/social/google.sdk';
const GOOGLE_SDK_SOURCE =
  'libraries/nestjs-libraries/src/integrations/social/google.sdk.ts';

function createGoogleApisHarness() {
  const calls = {
    loads: 0,
    clients: [],
    authUrls: [],
    tokenCodes: [],
    credentials: [],
  };

  class OAuth2Client {
    constructor(options) {
      calls.clients.push(options);
    }

    generateAuthUrl(options) {
      calls.authUrls.push(options);
      return 'https://accounts.google.test/o/oauth2/auth';
    }

    async getToken(code) {
      calls.tokenCodes.push(code);
      return {
        tokens: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expiry_date: Date.now() + 3_600_000,
        },
      };
    }

    setCredentials(credentials) {
      calls.credentials.push(credentials);
    }

    async getTokenInfo() {
      return { scopes: [] };
    }

    async refreshAccessToken() {
      return {
        credentials: {
          access_token: 'refreshed-access-token',
          refresh_token: 'refreshed-refresh-token',
          expiry_date: Date.now() + 3_600_000,
        },
      };
    }
  }

  const googleapis = {
    google: {
      auth: { OAuth2: OAuth2Client },
      oauth2: () => ({
        userinfo: {
          get: async () => ({
            data: {
              id: 'google-user-id',
              email: 'person@example.test',
              name: 'Google User',
              picture: 'https://images.example.test/person.png',
            },
          }),
        },
      }),
      youtube: () => ({}),
      youtubeAnalytics: () => ({}),
    },
    youtube_v3: {},
  };

  return {
    calls,
    load() {
      calls.loads += 1;
      return googleapis;
    },
  };
}

// Every provider reaches googleapis through the shared loader, so the loader is
// compiled from its own source here rather than mocked. Mocking it would leave
// the memoization assertions below testing the mock.
function loadProvider(relativePath, googleApisHarness, mocks = {}) {
  return loadTypeScriptModule(relativePath, mocks, {
    sources: { [GOOGLE_SDK_REQUEST]: GOOGLE_SDK_SOURCE },
    resolve: (request) =>
      request === 'googleapis' ? googleApisHarness.load() : undefined,
  });
}

const YOUTUBE_REDIRECT =
  'https://app.example.test/integrations/social/youtube';

// The OAuth state store is Redis-backed and belongs to the sign-in tests. Here
// it is stubbed so the lazy-load assertions below measure the SDK load and
// nothing else.
const oauthStateMock = {
  issueOAuthState: jest.fn(async () => 'issued-state'),
  consumeOAuthState: jest.fn(async () => YOUTUBE_REDIRECT),
};

const authProviderMocks = {
  '@contentfactory/backend/services/auth/providers.interface': {
    AuthProviderAbstract: class {},
    AuthProvider: () => (target) => target,
  },
  '@contentfactory/backend/services/auth/providers/oauth.state': oauthStateMock,
};

const socialProviderMocks = {
  '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface':
    {},
  '@contentfactory/nestjs-libraries/services/make.is': {
    makeId: (length) => 's'.repeat(length),
  },
  'google-auth-library/build/src/auth/oauth2client': {},
  '@contentfactory/nestjs-libraries/integrations/social.abstract': {
    SocialAbstract: class {
      checkScopes() {}
    },
  },
  '@contentfactory/nestjs-libraries/chat/rules.description.decorator': {
    Rules: () => (target) => target,
  },
  '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/gmb.settings.dto':
    { GmbSettingsDto: class {} },
  '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto':
    { YoutubeSettingsDto: class {} },
  axios: jest.fn(),
  'gaxios/build/src/common': {},
};

beforeEach(() => {
  process.env.FRONTEND_URL = 'https://app.example.test';
  process.env.YOUTUBE_CLIENT_ID = 'youtube-client';
  process.env.YOUTUBE_CLIENT_SECRET = 'youtube-secret';
  process.env.GOOGLE_GMB_CLIENT_ID = 'gmb-client';
  process.env.GOOGLE_GMB_CLIENT_SECRET = 'gmb-secret';
});

afterAll(() => {
  delete process.env.FRONTEND_URL;
  delete process.env.YOUTUBE_CLIENT_ID;
  delete process.env.YOUTUBE_CLIENT_SECRET;
  delete process.env.GOOGLE_GMB_CLIENT_ID;
  delete process.env.GOOGLE_GMB_CLIENT_SECRET;
});

test('Google login loads googleapis on first use and memoizes it without changing OAuth behavior', async () => {
  const harness = createGoogleApisHarness();
  const { GoogleProvider } = loadProvider(
    'apps/backend/src/services/auth/providers/google.provider.ts',
    harness,
    authProviderMocks
  );
  const provider = new GoogleProvider();

  expect(harness.calls.loads).toBe(0);

  await expect(
    provider.generateLink({ redirect_uri: YOUTUBE_REDIRECT })
  ).resolves.toBe('https://accounts.google.test/o/oauth2/auth');
  expect(harness.calls.loads).toBe(1);
  expect(harness.calls.clients[0]).toEqual({
    clientId: 'youtube-client',
    clientSecret: 'youtube-secret',
    redirectUri: YOUTUBE_REDIRECT,
  });
  expect(harness.calls.authUrls[0]).toEqual({
    access_type: 'online',
    prompt: 'consent',
    state: 'issued-state',
    redirect_uri: YOUTUBE_REDIRECT,
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });

  await provider.generateLink();
  await expect(provider.getToken('authorization-code')).resolves.toBe(
    'access-token'
  );
  await expect(provider.getUser('provider-token')).resolves.toEqual({
    id: 'google-user-id',
    email: 'person@example.test',
  });
  expect(harness.calls.loads).toBe(1);
  expect(harness.calls.tokenCodes).toEqual(['authorization-code']);
  expect(harness.calls.credentials).toContainEqual({
    access_token: 'provider-token',
  });
});

test('GMB provider loads googleapis on first use and memoizes it without changing OAuth behavior', async () => {
  const harness = createGoogleApisHarness();
  const { GmbProvider } = loadProvider(
    'libraries/nestjs-libraries/src/integrations/social/gmb.provider.ts',
    harness,
    socialProviderMocks
  );
  const provider = new GmbProvider();

  expect(harness.calls.loads).toBe(0);

  await expect(provider.generateAuthUrl()).resolves.toEqual({
    url: 'https://accounts.google.test/o/oauth2/auth',
    codeVerifier: 's'.repeat(11),
    state: 's'.repeat(7),
  });
  expect(harness.calls.loads).toBe(1);
  expect(harness.calls.clients[0]).toEqual({
    clientId: 'gmb-client',
    clientSecret: 'gmb-secret',
    redirectUri: 'https://app.example.test/integrations/social/gmb',
  });
  expect(harness.calls.authUrls[0]).toEqual({
    access_type: 'offline',
    prompt: 'consent',
    state: 's'.repeat(7),
    redirect_uri: 'https://app.example.test/integrations/social/gmb',
    scope: provider.scopes,
  });

  await provider.generateAuthUrl();
  await expect(
    provider.authenticate({ code: 'gmb-code', codeVerifier: 'verifier' })
  ).resolves.toEqual(
    expect.objectContaining({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      id: 'google-user-id',
      name: 'Google User',
      picture: 'https://images.example.test/person.png',
      username: '',
    })
  );
  expect(harness.calls.loads).toBe(1);
});

test('YouTube provider loads googleapis on first use and memoizes it without changing OAuth behavior', async () => {
  const harness = createGoogleApisHarness();
  const { YoutubeProvider } = loadProvider(
    'libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts',
    harness,
    socialProviderMocks
  );
  const provider = new YoutubeProvider();

  expect(harness.calls.loads).toBe(0);

  await expect(provider.generateAuthUrl()).resolves.toEqual({
    url: 'https://accounts.google.test/o/oauth2/auth',
    codeVerifier: 's'.repeat(11),
    state: 's'.repeat(7),
  });
  expect(harness.calls.loads).toBe(1);
  expect(harness.calls.clients[0]).toEqual({
    clientId: 'youtube-client',
    clientSecret: 'youtube-secret',
    redirectUri: 'https://app.example.test/integrations/social/youtube',
  });
  expect(harness.calls.authUrls[0]).toEqual({
    access_type: 'offline',
    prompt: 'consent',
    state: 's'.repeat(7),
    redirect_uri: 'https://app.example.test/integrations/social/youtube',
    scope: provider.scopes,
  });

  await provider.generateAuthUrl();
  await expect(
    provider.authenticate({ code: 'youtube-code', codeVerifier: 'verifier' })
  ).resolves.toEqual(
    expect.objectContaining({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      id: 'google-user-id',
      name: 'Google User',
      picture: 'https://images.example.test/person.png',
      username: '',
    })
  );
  expect(harness.calls.loads).toBe(1);
});

test('a rejected googleapis load is dropped, so the next Google request retries', async () => {
  const harness = createGoogleApisHarness();
  let failuresLeft = 1;
  const { loadGoogleApis } = loadTypeScriptModule(
    GOOGLE_SDK_SOURCE,
    {},
    {
      resolve: (request) => {
        if (request !== 'googleapis') {
          return undefined;
        }
        if (failuresLeft > 0) {
          failuresLeft -= 1;
          throw new Error('Cannot find module googleapis');
        }
        return harness.load();
      },
    }
  );

  await expect(loadGoogleApis()).rejects.toThrow(
    'Cannot find module googleapis'
  );
  expect(harness.calls.loads).toBe(0);

  // A memoized rejection would leave Google login, YouTube and GMB dead until
  // somebody restarts the container. The static import this replaced failed
  // loudly at start-up instead, and a transient failure has to stay transient.
  await expect(loadGoogleApis()).resolves.toHaveProperty('google');
  expect(harness.calls.loads).toBe(1);

  // Success is still memoized: the retry must not turn into a load per call.
  await expect(loadGoogleApis()).resolves.toHaveProperty('google');
  expect(harness.calls.loads).toBe(1);
});

const SOURCE_ROOTS = ['apps', 'libraries'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.nx',
]);

// The only module allowed to pull googleapis in at runtime. Everything else
// goes through `loadGoogleApis` and pays the cost on the first Google request.
const DYNAMIC_IMPORT_ALLOWLIST = [GOOGLE_SDK_SOURCE];

function* walkSourceFiles(directory) {
  for (const entry of fs.readdirSync(path.join(repositoryRoot, directory), {
    withFileTypes: true,
  })) {
    const relativePath = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        yield* walkSourceFiles(relativePath);
      }
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      yield relativePath;
    }
  }
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function findGoogleApisImports(relativePath) {
  const source = fs.readFileSync(
    path.join(repositoryRoot, relativePath),
    'utf8'
  );
  const findings = { statik: [], dynamic: [] };

  // `import type … from 'googleapis'` is erased by the compiler and costs
  // nothing; any other form of the statement emits a require at module scope.
  const staticImport =
    /^[ \t]*import\s+(?!type\b)[^;]*?from\s*['"]googleapis['"]/gm;
  const commonJsRequire = /require\(\s*['"]googleapis['"]\s*\)/g;
  // `typeof import('googleapis')` is a type query, not a load.
  const dynamicImport =
    /(?<!typeof\s{0,32})import\(\s*['"]googleapis['"]\s*\)/g;

  for (const pattern of [staticImport, commonJsRequire]) {
    for (const match of source.matchAll(pattern)) {
      findings.statik.push(`${relativePath}:${lineOf(source, match.index)}`);
    }
  }
  for (const match of source.matchAll(dynamicImport)) {
    findings.dynamic.push(`${relativePath}:${lineOf(source, match.index)}`);
  }

  return findings;
}

test('no source file outside the shared loader pulls googleapis in', () => {
  const eagerImports = [];
  const dynamicImportFiles = new Set();

  for (const root of SOURCE_ROOTS) {
    for (const relativePath of walkSourceFiles(root)) {
      const findings = findGoogleApisImports(relativePath);
      eagerImports.push(...findings.statik);
      if (findings.dynamic.length > 0) {
        dynamicImportFiles.add(relativePath);
      }
    }
  }

  // A static import anywhere boot-reachable hands the whole start-up cost back,
  // and the three named-file assertions above would stay green while it did.
  expect(eagerImports).toEqual([]);

  // Guarding by name is what let this regress. The allowlist is compared as a
  // set, so a fourth loader has to be argued for here rather than added quietly.
  expect([...dynamicImportFiles].sort()).toEqual(
    [...DYNAMIC_IMPORT_ALLOWLIST].sort()
  );
});
