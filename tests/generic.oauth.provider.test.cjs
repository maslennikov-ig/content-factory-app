const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);

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

const redisValues = new Map();
const ioRedis = {
  set: jest.fn(async (key, value) => {
    redisValues.set(key, value);
    return 'OK';
  }),
  get: jest.fn(async (key) => redisValues.get(key) || null),
  del: jest.fn(async (key) => (redisValues.delete(key) ? 1 : 0)),
  getdel: jest.fn(async (key) => {
    const value = redisValues.get(key) || null;
    redisValues.delete(key);
    return value;
  }),
};

const { OauthProvider } = loadTypeScriptModule(
  'apps/backend/src/services/auth/providers/oauth.provider.ts',
  {
    '@contentfactory/backend/services/auth/providers.interface': {
      AuthProviderAbstract: class {},
      AuthProvider: () => (target) => target,
    },
    '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis },
  }
);

const authUrl = 'https://auth.example/application/o/authorize';
const tokenUrl = 'https://auth.example/application/o/token';
const userInfoUrl = 'https://auth.example/application/o/userinfo';
const clientId = 'generic-test-client';
const clientCredential = 'not-a-real-credential';
const redirectUri = 'https://app.example/settings';

const response = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 400,
  json: jest.fn(async () => body),
  text: jest.fn(async () => JSON.stringify(body)),
});

beforeEach(() => {
  process.env.CONTENT_FACTORY_OAUTH_AUTH_URL = authUrl;
  process.env.CONTENT_FACTORY_OAUTH_TOKEN_URL = tokenUrl;
  process.env.CONTENT_FACTORY_OAUTH_USERINFO_URL = userInfoUrl;
  process.env.CONTENT_FACTORY_OAUTH_CLIENT_ID = clientId;
  process.env.CONTENT_FACTORY_OAUTH_CLIENT_SECRET = clientCredential;
  process.env.FRONTEND_URL = 'https://app.example';
  redisValues.clear();
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

afterAll(() => {
  delete process.env.CONTENT_FACTORY_OAUTH_AUTH_URL;
  delete process.env.CONTENT_FACTORY_OAUTH_TOKEN_URL;
  delete process.env.CONTENT_FACTORY_OAUTH_USERINFO_URL;
  delete process.env.CONTENT_FACTORY_OAUTH_CLIENT_ID;
  delete process.env.CONTENT_FACTORY_OAUTH_CLIENT_SECRET;
  delete process.env.FRONTEND_URL;
  delete global.fetch;
});

describe('generic OAuth provider', () => {
  test('sends a one-time state on the registered callback', async () => {
    const provider = new OauthProvider();
    const link = new URL(await provider.generateLink());
    const state = link.searchParams.get('state');

    expect(link.origin + link.pathname).toBe(authUrl);
    expect(link.searchParams.get('response_type')).toBe('code');
    expect(link.searchParams.get('client_id')).toBe(clientId);
    expect(link.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(state).toMatch(/^[\w-]{43}$/);
    expect(ioRedis.set).toHaveBeenCalledWith(
      `auth:generic:state:${state}`,
      '1',
      'EX',
      300
    );
  });

  test('exchanges a code once and refuses the replay', async () => {
    const provider = new OauthProvider();
    const link = new URL(await provider.generateLink());
    const state = link.searchParams.get('state');
    global.fetch.mockResolvedValue(response({ access_token: 'access-token' }));

    await expect(
      provider.getToken('one-time-code', undefined, {
        state,
        browserState: state,
      })
    ).resolves.toBe('access-token');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(tokenUrl);
    expect(options.method).toBe('POST');
    expect(options.body.get('grant_type')).toBe('authorization_code');
    expect(options.body.get('code')).toBe('one-time-code');
    expect(options.body.get('redirect_uri')).toBe(redirectUri);
    expect(redisValues.has(`auth:generic:state:${state}`)).toBe(false);

    await expect(
      provider.getToken('replayed-code', undefined, {
        state,
        browserState: state,
      })
    ).rejects.toThrow(/state/i);
  });

  test('refuses a callback that no browser of ours started', async () => {
    const provider = new OauthProvider();
    const link = new URL(await provider.generateLink());
    const state = link.searchParams.get('state');
    global.fetch.mockImplementation(async () => {
      throw new Error('the token endpoint must not be reached');
    });

    // Login-CSRF shape: the attacker holds a genuine code and state, the
    // victim's browser holds no matching cookie.
    await expect(
      provider.getToken('attacker-code', undefined, { state })
    ).rejects.toThrow(/browser/i);
    await expect(
      provider.getToken('attacker-code', undefined, {
        state,
        browserState: 'a-different-login-attempt',
      })
    ).rejects.toThrow(/browser/i);

    expect(global.fetch).not.toHaveBeenCalled();
    // The rejected attempts must not consume the real attempt's state.
    expect(redisValues.has(`auth:generic:state:${state}`)).toBe(true);
  });

  test('refuses a state this instance never issued', async () => {
    const provider = new OauthProvider();
    const forged = 'a'.repeat(43);
    global.fetch.mockImplementation(async () => {
      throw new Error('the token endpoint must not be reached');
    });

    await expect(
      provider.getToken('attacker-code', undefined, {
        state: forged,
        browserState: forged,
      })
    ).rejects.toThrow(/state/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('refuses a redirect URI that is not the registered one', async () => {
    const provider = new OauthProvider();
    const link = new URL(await provider.generateLink());
    const state = link.searchParams.get('state');
    global.fetch.mockImplementation(async () => {
      throw new Error('the token endpoint must not be reached');
    });

    await expect(
      provider.getToken('code', 'https://attacker.example/auth', {
        state,
        browserState: state,
      })
    ).rejects.toThrow(/redirect/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('an unconfigured instance stays inert instead of half-working', async () => {
    delete process.env.CONTENT_FACTORY_OAUTH_CLIENT_ID;
    delete process.env.CONTENT_FACTORY_OAUTH_CLIENT_SECRET;

    // Nest instantiates every registered provider at boot, so construction has
    // to survive an empty environment.
    let provider;
    expect(() => {
      provider = new OauthProvider();
    }).not.toThrow();

    await expect(provider.generateLink()).rejects.toThrow(/are not set/i);
    await expect(
      provider.getToken('code', undefined, { state: 's', browserState: 's' })
    ).rejects.toThrow(/are not set/i);
    await expect(provider.getUser('token')).rejects.toThrow(/are not set/i);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(ioRedis.set).not.toHaveBeenCalled();
  });
});
