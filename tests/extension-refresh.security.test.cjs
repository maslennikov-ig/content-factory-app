'use strict';

const {
  AuthService,
  GENERATION_KEY,
  COOKIES,
  grant,
  fixture,
  encryptedDetails,
  encodedCookies,
  loadWithMocks,
} = require('./helpers/extension-refresh.module.cjs');
let savedSecret;
beforeAll(() => {
  savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'synthetic-extension-test-secret';
});
afterAll(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

test.each([
  ['deleted', { deletedAt: new Date('2000-01-01T00:00:00Z') }],
  ['disabled', { disabled: true }],
  ['different provider', { providerIdentifier: 'other-provider' }],
])(
  '%s connection refuses the grant before calling the provider',
  async (_name, patch) => {
    const f = fixture();
    Object.assign(f.row(), patch);
    const before = { ...f.row() };
    await expect(f.refresh()).rejects.toMatchObject({ status: 401 });
    expect(f.provider.authenticate).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
    expect(f.row()).toEqual(before);
  }
);

test('a stale connection generation is rejected before the provider', async () => {
  const f = fixture();
  await expect(f.refresh(grant('old-connection'))).rejects.toMatchObject({
    status: 401,
  });
  expect(f.provider.authenticate).not.toHaveBeenCalled();
  expect(f.writes).toEqual([]);
});

test('normal refresh keeps the grant and writes real encrypted cookie JSON', async () => {
  const f = fixture(),
    jwt = grant();
  await expect(f.refresh(jwt)).resolves.toEqual({ success: true });
  const decoded = JSON.parse(
    AuthService.fixedDecryption(f.row().customInstanceDetails)
  );
  expect(decoded).toEqual({ ...COOKIES, [GENERATION_KEY]: 'connection-1' });
  expect(() => AuthService.verifyJWT(f.row().customInstanceDetails)).toThrow();
  await expect(f.refresh(jwt)).resolves.toEqual({ success: true });
  expect(f.row()).toMatchObject({
    disabled: false,
    deletedAt: null,
    token: 'fresh-token',
  });
});

test('an explicit reconnect with identical cookies replaces the old grant', async () => {
  const f = fixture();
  const body = {
    state: 'fixture-state',
    code: encodedCookies(),
    timezone: '0',
  };
  const first = await f.controller.connectSocialMedia('skool', body);
  const second = await f.controller.connectSocialMedia('skool', body);
  const firstPayload = AuthService.verifyJWT(first.extensionToken);
  const secondPayload = AuthService.verifyJWT(second.extensionToken);
  expect(secondPayload.purpose).toBe('extension_refresh');
  expect(firstPayload.connectionGeneration).not.toBe(
    secondPayload.connectionGeneration
  );
  expect(
    JSON.parse(AuthService.fixedDecryption(f.row().customInstanceDetails))[
      GENERATION_KEY
    ]
  ).toBe(secondPayload.connectionGeneration);
  for (const secret of ['token', 'refreshToken', 'customInstanceDetails']) {
    expect(second).not.toHaveProperty(secret);
  }
  f.provider.authenticate.mockClear();
  await expect(f.refresh(first.extensionToken)).rejects.toMatchObject({
    status: 401,
  });
  expect(f.provider.authenticate).not.toHaveBeenCalled();
  await expect(f.refresh(second.extensionToken)).resolves.toEqual({
    success: true,
  });
});

test.each([
  ['wrong purpose', { purpose: 'session' }],
  [
    'untagged legacy token',
    { purpose: undefined, connectionGeneration: undefined },
  ],
  ['missing generation', { connectionGeneration: undefined }],
  ['foreign organization', { organizationId: 'b' }],
  ['foreign account', { internalId: 'other' }],
  ['foreign provider', { provider: 'other' }],
  ['invalid claim type', { integrationId: 1 }],
])(
  '%s does not call the provider or mutate credentials',
  async (_name, claims) => {
    const f = fixture();
    await expect(
      f.refresh(grant('connection-1', claims))
    ).rejects.toMatchObject({ status: 401 });
    expect(f.provider.authenticate).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  }
);

test('a tampered signature is refused', async () => {
  const f = fixture();
  await expect(f.refresh(grant() + 'tampered')).rejects.toMatchObject({
    status: 401,
  });
  expect(f.provider.authenticate).not.toHaveBeenCalled();
});

test.each([
  [
    'deletion',
    (row) => {
      row.deletedAt = new Date('2000-01-01T00:00:00Z');
    },
  ],
  [
    'disablement',
    (row) => {
      row.disabled = true;
    },
  ],
  [
    'reconnect',
    (row) => {
      row.customInstanceDetails = encryptedDetails('connection-2');
      row.token = 'reconnected-token';
    },
  ],
])(
  '%s during provider authentication prevents the write',
  async (_name, edit) => {
    const f = fixture();
    let moved;
    f.provider.authenticate.mockImplementationOnce(async () => {
      edit(f.row());
      moved = { ...f.row() };
      return { id: 'account', accessToken: 'fresh-token', expiresIn: 3600 };
    });
    await expect(f.refresh()).rejects.toMatchObject({ status: 409 });
    expect(f.row()).toEqual(moved);
    expect(f.writes).toEqual([]);
  }
);

test('account mismatch marks only the unchanged active connection', async () => {
  const f = fixture(),
    before = { ...f.row() };
  f.provider.authenticate.mockResolvedValueOnce({ id: 'other-account' });
  await expect(f.refresh()).resolves.toEqual({
    success: false,
    reason: 'account_mismatch',
  });
  expect(f.row()).toEqual({ ...before, refreshNeeded: true });
});

test('a late account mismatch cannot mark a reconnected channel', async () => {
  const f = fixture();
  let moved;
  f.provider.authenticate.mockImplementationOnce(async () => {
    f.row().customInstanceDetails = encryptedDetails('connection-2');
    moved = { ...f.row() };
    return { id: 'other-account' };
  });
  await expect(f.refresh()).rejects.toMatchObject({ status: 409 });
  expect(f.row()).toEqual(moved);
});

test('provider rejection leaves all stored credentials intact', async () => {
  const f = fixture(),
    before = { ...f.row() };
  f.provider.authenticate.mockResolvedValueOnce('Invalid cookie data');
  await expect(f.refresh()).rejects.toMatchObject({ status: 400 });
  expect(f.row()).toEqual(before);
});

test('malformed cookies fail before provider authentication', async () => {
  const f = fixture();
  await expect(
    f.controller.extensionRefreshCookies({
      jwt: grant(),
      cookies: encodedCookies([]),
    })
  ).rejects.toMatchObject({ status: 400 });
  expect(f.provider.authenticate).not.toHaveBeenCalled();
});

test('cookies supplied by the client cannot choose the connection generation', async () => {
  const f = fixture();
  await f.controller.extensionRefreshCookies({
    jwt: grant(),
    cookies: encodedCookies({
      ...COOKIES,
      [GENERATION_KEY]: 'attacker-chosen',
    }),
  });
  expect(
    JSON.parse(AuthService.fixedDecryption(f.row().customInstanceDetails))[
      GENERATION_KEY
    ]
  ).toBe('connection-1');
});

test.each(['AES', 'legacy signed JWT'])(
  'Skool still reads existing %s cookies',
  (format) => {
    const { SkoolProvider } = loadWithMocks(
      'libraries/nestjs-libraries/src/integrations/social/skool.provider.ts',
      {
        '../social.abstract': { SocialAbstract: class {} },
        '@contentfactory/nestjs-libraries/integrations/tool.decorator': {
          Tool: () => () => {},
        },
      }
    );
    const stored =
      format === 'AES'
        ? AuthService.fixedEncryption(JSON.stringify(COOKIES))
        : AuthService.signJWT(COOKIES);
    expect(
      new SkoolProvider().getCookies({ customInstanceDetails: stored })
    ).toMatchObject(COOKIES);
  }
);
