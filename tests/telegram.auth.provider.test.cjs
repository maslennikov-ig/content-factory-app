const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { exportJWK, generateKeyPair, SignJWT } = require('jose');

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

const { TelegramProvider } = loadTypeScriptModule(
  'apps/backend/src/services/auth/providers/telegram.provider.ts',
  {
    '@contentfactory/backend/services/auth/providers.interface': {
      AuthProviderAbstract: class {},
      AuthProvider: () => (target) => target,
    },
    '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis },
  }
);

const issuer = 'https://oauth.telegram.org';
const testClientId = 'telegram-test-client';
const testClientCredential = 'not-a-real-credential';
let primaryKeys;
let rotatedKeys;

const response = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 400,
  json: jest.fn(async () => body),
});

const signToken = async ({
  privateKey = primaryKeys.privateKey,
  kid = 'primary-key',
  audience = testClientId,
  tokenIssuer = issuer,
  expiration = '5m',
} = {}) =>
  new SignJWT({ name: 'Test user' })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(tokenIssuer)
    .setAudience(audience)
    .setSubject('telegram-user-42')
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(privateKey);

const publicJwk = async (keys, kid) => ({
  ...(await exportJWK(keys.publicKey)),
  alg: 'RS256',
  kid,
  use: 'sig',
});

const mockTelegram = async (idToken) => {
  const jwk = await publicJwk(primaryKeys, 'primary-key');
  global.fetch.mockImplementation(async (url) => {
    if (url === `${issuer}/token`) return response({ id_token: idToken });
    if (url === `${issuer}/.well-known/jwks.json`)
      return response({ keys: [jwk] });
    throw new Error(`Unexpected URL: ${url}`);
  });
};

const tokenRequestBody = () =>
  global.fetch.mock.calls.find(([url]) => url === `${issuer}/token`)[1].body;

beforeAll(async () => {
  primaryKeys = await generateKeyPair('RS256');
  rotatedKeys = await generateKeyPair('RS256');
});

beforeEach(() => {
  process.env.TELEGRAM_CLIENT_ID = testClientId;
  process.env.TELEGRAM_CLIENT_SECRET = testClientCredential;
  process.env.FRONTEND_URL = 'https://app.example';
  redisValues.clear();
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

afterAll(() => {
  delete process.env.TELEGRAM_CLIENT_ID;
  delete process.env.TELEGRAM_CLIENT_SECRET;
  delete process.env.FRONTEND_URL;
  delete global.fetch;
});

describe('Telegram OIDC provider', () => {
  test('builds a short-lived S256 authorization request without extra scopes', async () => {
    const provider = new TelegramProvider();
    const link = new URL(await provider.generateLink());
    const state = link.searchParams.get('state');

    expect(link.origin + link.pathname).toBe(`${issuer}/auth`);
    expect(link.searchParams.get('response_type')).toBe('code');
    expect(link.searchParams.get('client_id')).toBe(testClientId);
    expect(link.searchParams.get('redirect_uri')).toBe(
      'https://app.example/auth?provider=TELEGRAM'
    );
    expect(link.searchParams.get('scope')).toBe('openid profile');
    expect(link.searchParams.get('code_challenge_method')).toBe('S256');
    expect(link.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(state).toMatch(/^[\w-]{43}$/);
    expect(link.searchParams.get('phone')).toBeNull();
    expect(link.searchParams.get('telegram:bot_access')).toBeNull();
    expect(ioRedis.set).toHaveBeenCalledWith(
      `auth:telegram:pkce:${state}`,
      expect.any(String),
      'EX',
      300
    );
    expect(JSON.parse(redisValues.get(`auth:telegram:pkce:${state}`))).toEqual({
      verifier: expect.stringMatching(/^[\w-]{43}$/),
      redirectUri: 'https://app.example/auth?provider=TELEGRAM',
      purpose: 'login',
    });
  });

  test('sends Telegram the single login address even when settings starts it', async () => {
    const provider = new TelegramProvider();
    const link = new URL(
      await provider.generateLink({
        redirect_uri: 'https://app.example/settings',
      })
    );
    const state = link.searchParams.get('state');

    // The settings address stopped being an address Telegram is told about. It
    // is the caller saying "this is a link, not a sign-in", and BotFather keeps
    // one Allowed URL — the one below.
    expect(link.searchParams.get('redirect_uri')).toBe(
      'https://app.example/auth?provider=TELEGRAM'
    );
    expect(JSON.parse(redisValues.get(`auth:telegram:pkce:${state}`))).toEqual({
      verifier: expect.stringMatching(/^[\w-]{43}$/),
      redirectUri: 'https://app.example/auth?provider=TELEGRAM',
      purpose: 'link',
    });
  });

  test.each([
    'https://attacker.example/settings',
    'https://app.example/profile',
    'https://app.example/settings?next=https://attacker.example',
  ])(
    'rejects an untrusted requested redirect before storing state: %s',
    async (redirectUri) => {
      const provider = new TelegramProvider();

      await expect(
        provider.generateLink({ redirect_uri: redirectUri })
      ).rejects.toThrow(/redirect/i);
      expect(ioRedis.set).not.toHaveBeenCalled();
    }
  );

  test('exchanges a settings callback against that same single address', async () => {
    const provider = new TelegramProvider();
    const link = new URL(
      await provider.generateLink({
        redirect_uri: 'https://app.example/settings',
      })
    );
    const state = link.searchParams.get('state');
    const idToken = await signToken();
    await mockTelegram(idToken);

    await expect(
      provider.getToken('settings-code', 'https://app.example/settings', {
        state,
        browserState: state,
      })
    ).resolves.toBe(idToken);

    expect(tokenRequestBody().get('redirect_uri')).toBe(
      'https://app.example/auth?provider=TELEGRAM'
    );
  });

  test('refuses to spend a sign-in state on an account link', async () => {
    const provider = new TelegramProvider();
    const link = new URL(await provider.generateLink());
    const state = link.searchParams.get('state');
    global.fetch.mockImplementation(async () => {
      throw new Error('the token endpoint must not be reached');
    });

    await expect(
      provider.getToken('login-code', 'https://app.example/settings', {
        state,
        browserState: state,
      })
    ).rejects.toThrow(/different purpose/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('refuses to spend a link state on a sign-in', async () => {
    const provider = new TelegramProvider();
    const link = new URL(
      await provider.generateLink({
        redirect_uri: 'https://app.example/settings',
      })
    );
    const state = link.searchParams.get('state');
    global.fetch.mockImplementation(async () => {
      throw new Error('the token endpoint must not be reached');
    });

    // Both flows now come back to the same address, so nothing in the callback
    // URL says which one it belongs to. The state does.
    await expect(
      provider.getToken('link-code', undefined, {
        state,
        browserState: state,
      })
    ).rejects.toThrow(/different purpose/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('still finishes a settings state issued by the previous version', async () => {
    const provider = new TelegramProvider();
    const state = 'state-from-the-previous-version';
    // Written by the version that sent Telegram two different addresses. It has
    // five minutes left, and Telegram accepts only the address it was given, so
    // the exchange has to use that one rather than today's.
    redisValues.set(
      `auth:telegram:pkce:${state}`,
      JSON.stringify({
        verifier: 'verifier-from-the-previous-version',
        redirectUri: 'https://app.example/settings',
      })
    );
    const idToken = await signToken();
    await mockTelegram(idToken);

    await expect(
      provider.getToken('old-settings-code', 'https://app.example/settings', {
        state,
        browserState: state,
      })
    ).resolves.toBe(idToken);

    expect(tokenRequestBody().get('redirect_uri')).toBe(
      'https://app.example/settings'
    );
    expect(tokenRequestBody().get('code_verifier')).toBe(
      'verifier-from-the-previous-version'
    );
  });

  test('still finishes a bare-verifier state issued by the oldest version', async () => {
    const provider = new TelegramProvider();
    const state = 'state-from-the-oldest-version';
    redisValues.set(`auth:telegram:pkce:${state}`, 'bare-verifier');
    const idToken = await signToken();
    await mockTelegram(idToken);

    await expect(
      provider.getToken('old-login-code', undefined, {
        state,
        browserState: state,
      })
    ).resolves.toBe(idToken);

    expect(tokenRequestBody().get('redirect_uri')).toBe(
      'https://app.example/auth?provider=TELEGRAM'
    );
    expect(tokenRequestBody().get('code_verifier')).toBe('bare-verifier');
  });

  test('refuses a stored state that names an address we never send', async () => {
    const provider = new TelegramProvider();
    const state = 'state-for-another-deployment';
    // The shape of a real state, with an address this deployment would never
    // have asked for — a stale `FRONTEND_URL`, or a planted value. Reading it
    // as if it were an old bare verifier would put the whole record where the
    // verifier belongs and ask Telegram about it.
    redisValues.set(
      `auth:telegram:pkce:${state}`,
      JSON.stringify({
        verifier: 'a-verifier',
        redirectUri: 'https://attacker.example/settings',
      })
    );
    global.fetch.mockImplementation(async () => {
      throw new Error('the token endpoint must not be reached');
    });

    await expect(
      provider.getToken('foreign-code', undefined, {
        state,
        browserState: state,
      })
    ).rejects.toThrow(/redirect/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('exchanges a code once and verifies the returned id_token', async () => {
    const provider = new TelegramProvider();
    const link = new URL(await provider.generateLink());
    const state = link.searchParams.get('state');
    const idToken = await signToken();
    const jwk = await publicJwk(primaryKeys, 'primary-key');

    global.fetch.mockImplementation(async (url) => {
      if (url === `${issuer}/token`) return response({ id_token: idToken });
      if (url === `${issuer}/.well-known/jwks.json`)
        return response({ keys: [jwk] });
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(
      provider.getToken('one-time-code', undefined, {
        state,
        browserState: state,
      })
    ).resolves.toBe(idToken);

    const tokenRequest = global.fetch.mock.calls.find(
      ([url]) => url === `${issuer}/token`
    );
    const options = tokenRequest[1];
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from(`${testClientId}:${testClientCredential}`).toString(
        'base64'
      )}`
    );
    expect(options.body.get('grant_type')).toBe('authorization_code');
    expect(options.body.get('code')).toBe('one-time-code');
    expect(options.body.get('redirect_uri')).toBe(
      'https://app.example/auth?provider=TELEGRAM'
    );
    expect(options.body.get('code_verifier')).toEqual(expect.any(String));
    expect(redisValues.has(`auth:telegram:pkce:${state}`)).toBe(false);
    await expect(
      provider.getToken('replayed-code', undefined, {
        state,
        browserState: state,
      })
    ).rejects.toThrow(/state/i);
  });

  test('refuses a callback that no browser of ours started', async () => {
    const provider = new TelegramProvider();
    const link = new URL(await provider.generateLink());
    const state = link.searchParams.get('state');
    global.fetch.mockImplementation(async () => {
      throw new Error('the token endpoint must not be reached');
    });

    // This is the login-CSRF shape: the attacker holds a genuine code and
    // state, the victim's browser holds no matching cookie.
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
    // The rejected attempts must not burn the verifier of the real one.
    expect(redisValues.has(`auth:telegram:pkce:${state}`)).toBe(true);
  });

  test('rejects an id_token whose header contradicts the published key', async () => {
    const provider = new TelegramProvider();
    const token = await signToken();
    const jwk = {
      ...(await publicJwk(primaryKeys, 'primary-key')),
      alg: 'ES256',
    };
    global.fetch.mockResolvedValue(response({ keys: [jwk] }));

    await expect(provider.getUser(token)).rejects.toThrow(
      /does not match its key/i
    );
  });

  test('rejects an id_token with an invalid signature', async () => {
    const provider = new TelegramProvider();
    const token = await signToken({ privateKey: rotatedKeys.privateKey });
    const jwk = await publicJwk(primaryKeys, 'primary-key');
    global.fetch.mockResolvedValue(response({ keys: [jwk] }));

    await expect(provider.getUser(token)).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects an id_token issued for another audience', async () => {
    const provider = new TelegramProvider();
    const token = await signToken({ audience: 'another-client' });
    const jwk = await publicJwk(primaryKeys, 'primary-key');
    global.fetch.mockResolvedValue(response({ keys: [jwk] }));

    await expect(provider.getUser(token)).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects an id_token issued by another issuer', async () => {
    const provider = new TelegramProvider();
    const token = await signToken({ tokenIssuer: 'https://issuer.example' });
    const jwk = await publicJwk(primaryKeys, 'primary-key');
    global.fetch.mockResolvedValue(response({ keys: [jwk] }));

    await expect(provider.getUser(token)).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects an expired id_token', async () => {
    const provider = new TelegramProvider();
    const token = await signToken({
      expiration: Math.floor(Date.now() / 1000) - 60,
    });
    const jwk = await publicJwk(primaryKeys, 'primary-key');
    global.fetch.mockResolvedValue(response({ keys: [jwk] }));

    await expect(provider.getUser(token)).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('refreshes JWKS once when Telegram rotates to an unknown kid', async () => {
    const provider = new TelegramProvider();
    const token = await signToken({
      privateKey: rotatedKeys.privateKey,
      kid: 'rotated-key',
    });
    const oldJwk = await publicJwk(primaryKeys, 'primary-key');
    const rotatedJwk = await publicJwk(rotatedKeys, 'rotated-key');
    global.fetch
      .mockResolvedValueOnce(response({ keys: [oldJwk] }))
      .mockResolvedValueOnce(response({ keys: [rotatedJwk] }));

    await expect(provider.getUser(token)).resolves.toEqual({
      id: 'telegram-user-42',
      email: 'telegram_telegram-user-42',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('an unconfigured instance stays inert instead of half-working', async () => {
    delete process.env.TELEGRAM_CLIENT_ID;
    delete process.env.TELEGRAM_CLIENT_SECRET;

    // Nest instantiates every registered provider at boot, so construction has
    // to survive an empty environment; every route into Telegram then has to
    // refuse rather than build a request with an undefined client id.
    let provider;
    expect(() => {
      provider = new TelegramProvider();
    }).not.toThrow();

    await expect(provider.generateLink()).rejects.toThrow(/not configured/i);
    await expect(
      provider.getToken('code', undefined, { state: 's', browserState: 's' })
    ).rejects.toThrow(/not configured/i);
    await expect(provider.getUser('token')).rejects.toThrow(/not configured/i);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(ioRedis.set).not.toHaveBeenCalled();
  });
});
