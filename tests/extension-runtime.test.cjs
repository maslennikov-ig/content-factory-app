const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const manifest = require('../apps/extension/manifest.json');

let originalChrome;
let originalFetch;

function fixture(entries = {}) {
  const storage = {
    refreshEntries: structuredClone(entries),
    refreshStatuses: {},
  };
  let onMessage;
  let onAlarm;
  const chrome = {
    runtime: {
      getManifest: () => manifest,
      onMessageExternal: { addListener: (fn) => (onMessage = fn) },
    },
    storage: {
      local: {
        get: jest.fn(async (key) => ({ [key]: structuredClone(storage[key]) })),
        set: jest.fn(async (value) =>
          Object.assign(storage, structuredClone(value))
        ),
      },
    },
    cookies: {
      getAll: jest.fn(async () => [
        { name: 'client_id', value: 'synthetic-client' },
        { name: 'auth_token', value: 'synthetic-cookie' },
      ]),
    },
    permissions: { contains: jest.fn(async () => true) },
    alarms: {
      get: jest.fn(async () => undefined),
      create: jest.fn(async () => undefined),
      clear: jest.fn(async () => true),
      onAlarm: { addListener: (fn) => (onAlarm = fn) },
    },
    action: {
      setBadgeText: jest.fn(async () => undefined),
      setTitle: jest.fn(async () => undefined),
    },
  };
  global.chrome = chrome;
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true }),
  }));
  loadTypeScriptModule('apps/extension/src/background.ts');
  const settle = async () => {
    for (let i = 0; i < 8; i++) await new Promise(setImmediate);
  };
  return {
    storage,
    chrome,
    settle,
    fetch: global.fetch,
    message: (message, origin = 'https://factory.aidevteam.ru') =>
      new Promise((resolve) => onMessage(message, { origin }, resolve)),
    alarm: async () => {
      onAlarm({ name: 'cookie-refresh' });
      await settle();
    },
  };
}

const entry = {
  jwt: 'synthetic-refresh-grant',
  provider: 'skool',
  backendUrl: 'https://factory.aidevteam.ru/api',
};
const store = (overrides = {}) => ({
  type: 'STORE_REFRESH_TOKEN',
  integrationId: 'synthetic-channel',
  ...entry,
  ...overrides,
});

beforeEach(() => {
  originalChrome = global.chrome;
  originalFetch = global.fetch;
});

afterEach(() => {
  global.chrome = originalChrome;
  global.fetch = originalFetch;
});

test('refuses a foreign backend instead of storing a cookie exfiltration destination', async () => {
  const f = fixture();
  await f.settle();
  expect(
    await f.message(store({ backendUrl: 'https://foreign.invalid/api' }))
  ).toMatchObject({ success: false });
  expect(f.storage.refreshEntries).toEqual({});
});

test('401 renewal preserves the grant and shows an actionable reconnect error', async () => {
  const f = fixture({ 'synthetic-channel': entry });
  await f.settle();
  f.fetch.mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ message: 'private-server-detail' }),
  });
  await f.alarm();
  expect(f.storage.refreshEntries['synthetic-channel']).toEqual(entry);
  expect(f.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '!' });
  expect(f.chrome.action.setTitle.mock.calls.at(-1)[0].title).toMatch(
    /Переподключите/
  );
  expect(JSON.stringify(f.storage.refreshStatuses)).not.toContain(
    'private-server-detail'
  );
});

test('account mismatch in a 200 reply is a failure, rather than a silent success', async () => {
  const f = fixture({ 'synthetic-channel': entry });
  await f.settle();
  f.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: false, reason: 'account_mismatch' }),
  });
  await f.alarm();
  expect(f.storage.refreshStatuses['synthetic-channel']).toMatchObject({
    success: false,
  });
  expect(f.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '!' });
});

test.each([
  'https://factory.aidevteam.ru.foreign.invalid/api',
  'http://factory.aidevteam.ru/api',
  'https://sub.factory.aidevteam.ru/api',
  'https://name:password@factory.aidevteam.ru/api',
  'https://factory.aidevteam.ru/api?destination=foreign',
  'https://factory.aidevteam.ru/api#fragment',
  'file:///tmp/backend',
  'data:text/plain,backend',
  'not a URL',
  'http://localhost:7777/api',
])(
  'refuses invalid URL %s without changing an existing connection',
  async (backendUrl) => {
    const f = fixture({ 'synthetic-channel': entry });
    await f.settle();
    expect(await f.message(store({ backendUrl }))).toMatchObject({
      success: false,
    });
    expect(f.storage.refreshEntries['synthetic-channel']).toEqual(entry);
    expect(f.chrome.cookies.getAll).not.toHaveBeenCalled();
    expect(f.fetch).not.toHaveBeenCalled();
  }
);

test('allows local frontend/backend ports and preserves /api plus trailing slash', async () => {
  const f = fixture();
  await f.settle();
  expect(
    await f.message(
      store({ backendUrl: 'http://localhost:7777/api/' }),
      'http://localhost:4200'
    )
  ).toEqual({ success: true });
  await f.alarm();
  const [url, options] = f.fetch.mock.calls[0];
  expect(url).toBe('http://localhost:7777/api/integrations/extension-refresh');
  expect(options).toMatchObject({
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
  });
  expect(JSON.parse(options.body)).toEqual({
    jwt: entry.jwt,
    cookies: btoa(
      JSON.stringify({
        client_id: 'synthetic-client',
        auth_token: 'synthetic-cookie',
      })
    ),
  });
  expect(f.storage.refreshStatuses['synthetic-channel']).toEqual({
    success: true,
  });
  expect(f.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
});

test('withheld backend permission refuses storage and prevents an existing entry reading cookies', async () => {
  const f = fixture({ 'synthetic-channel': entry });
  await f.settle();
  f.chrome.permissions.contains.mockResolvedValue(false);
  expect(await f.message(store({ jwt: 'replacement' }))).toMatchObject({
    success: false,
    error: expect.any(String),
  });
  await f.alarm();
  expect(f.chrome.cookies.getAll).not.toHaveBeenCalled();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.storage.refreshEntries['synthetic-channel']).toEqual(entry);
  expect(f.chrome.action.setTitle.mock.calls.at(-1)[0].title).toMatch(
    /Разрешите/
  );
});

test('revalidates a legacy foreign stored backend before accessing cookies or sending', async () => {
  const unsafe = { ...entry, backendUrl: 'https://foreign.invalid/api' };
  const f = fixture({ 'synthetic-channel': unsafe });
  await f.settle();
  await f.alarm();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.chrome.cookies.getAll).not.toHaveBeenCalled();
  expect(f.storage.refreshEntries['synthetic-channel']).toEqual(unsafe);
  expect(f.storage.refreshStatuses['synthetic-channel']).toMatchObject({
    success: false,
  });
});

test.each([403, 404])(
  'HTTP %i asks for reconnect without reading server body',
  async (status) => {
    const f = fixture({ 'synthetic-channel': entry });
    await f.settle();
    const json = jest.fn();
    f.fetch.mockResolvedValue({ ok: false, status, json });
    await f.alarm();
    expect(json).not.toHaveBeenCalled();
    expect(f.chrome.action.setTitle.mock.calls.at(-1)[0].title).toMatch(
      /Переподключите/
    );
  }
);

test.each([409, 429, 500, 503])(
  'HTTP %i remains visible and retries on the next ordinary alarm',
  async (status) => {
    const f = fixture({ 'synthetic-channel': entry });
    await f.settle();
    f.fetch.mockResolvedValueOnce({ ok: false, status });
    await f.alarm();
    expect(f.storage.refreshStatuses['synthetic-channel']).toMatchObject({
      success: false,
    });
    expect(f.chrome.action.setTitle.mock.calls.at(-1)[0].title).toMatch(
      /Повторим автоматически/
    );
    expect(f.storage.refreshEntries['synthetic-channel']).toEqual(entry);
    await f.alarm();
    expect(f.storage.refreshStatuses['synthetic-channel']).toEqual({
      success: true,
    });
    expect(f.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
  }
);

test.each([
  [
    'network or rejected redirect',
    () => Promise.reject(new Error('private-network-detail')),
  ],
  [
    'invalid JSON',
    async () => ({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('private-cookie-detail')),
    }),
  ],
  [
    'missing success flag',
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cookie: 'private-cookie-detail' }),
    }),
  ],
])(
  '%s reports a safe failure with no credential deletion',
  async (_name, response) => {
    const f = fixture({ 'synthetic-channel': entry });
    await f.settle();
    f.fetch.mockImplementation(response);
    await f.alarm();
    expect(f.storage.refreshStatuses['synthetic-channel']).toMatchObject({
      success: false,
    });
    expect(f.storage.refreshEntries['synthetic-channel']).toEqual(entry);
    expect(JSON.stringify(f.storage.refreshStatuses)).not.toMatch(
      /private|synthetic-refresh-grant|synthetic-cookie/
    );
  }
);

test('missing provider cookies asks for login without a backend request', async () => {
  const f = fixture({ 'synthetic-channel': entry });
  await f.settle();
  f.chrome.cookies.getAll.mockResolvedValue([]);
  await f.alarm();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.chrome.action.setTitle.mock.calls.at(-1)[0].title).toMatch(
    /Войдите в Skool/
  );
});

test.each(['reconnect', 'remove'])(
  'late failure cannot change a channel after %s',
  async (change) => {
    const f = fixture({ 'synthetic-channel': entry });
    await f.settle();
    let resolveResponse;
    f.fetch.mockReturnValue(
      new Promise((resolve) => (resolveResponse = resolve))
    );
    f.alarm();
    await f.settle();
    expect(f.fetch).toHaveBeenCalledTimes(1);
    if (change === 'reconnect') {
      expect(await f.message(store({ jwt: 'new-synthetic-grant' }))).toEqual({
        success: true,
      });
    } else {
      expect(
        await f.message({
          type: 'REMOVE_REFRESH_TOKEN',
          integrationId: 'synthetic-channel',
        })
      ).toEqual({ success: true });
    }
    resolveResponse({ ok: false, status: 401 });
    await f.settle();
    expect(f.storage.refreshStatuses['synthetic-channel']).toBeUndefined();
    expect(f.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    expect(f.storage.refreshEntries['synthetic-channel']?.jwt).toBe(
      change === 'reconnect' ? 'new-synthetic-grant' : undefined
    );
  }
);

test('concurrent stores keep both channels and removal clears only its own error', async () => {
  const f = fixture();
  await f.settle();
  expect(
    await Promise.all([
      f.message(store()),
      f.message(
        store({ integrationId: 'second-channel', jwt: 'second-grant' })
      ),
    ])
  ).toEqual([{ success: true }, { success: true }]);
  f.fetch.mockResolvedValue({ ok: false, status: 401 });
  await f.alarm();
  expect(Object.keys(f.storage.refreshEntries)).toHaveLength(2);
  await f.message({
    type: 'REMOVE_REFRESH_TOKEN',
    integrationId: 'synthetic-channel',
  });
  expect(Object.keys(f.storage.refreshStatuses)).toEqual(['second-channel']);
  expect(f.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '!' });
  await f.message({
    type: 'REMOVE_REFRESH_TOKEN',
    integrationId: 'second-channel',
  });
  expect(f.chrome.alarms.clear).toHaveBeenLastCalledWith('cookie-refresh');
  expect(f.chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
});

test('Chrome startup recreates the existing daily alarm without changing its cadence', async () => {
  const f = fixture({ 'synthetic-channel': entry });
  await f.settle();
  expect(f.chrome.alarms.create).toHaveBeenCalledWith('cookie-refresh', {
    periodInMinutes: 1440,
  });
  expect(await f.message({ type: 'PING' })).toEqual({
    status: 'ok',
    version: manifest.version,
  });
});

test('production and development manifests have exact bounded backend hosts and consistent versions', () => {
  const development = require('../apps/extension/manifest.dev.json');
  const pkg = require('../apps/extension/package.json');
  expect(manifest.host_permissions).toEqual([
    '*://*.skool.com/*',
    'https://factory.aidevteam.ru/*',
    'http://localhost/*',
    'https://localhost/*',
  ]);
  expect(development.host_permissions).toEqual([
    '*://*.skool.com/*',
    'http://localhost/*',
    'https://localhost/*',
  ]);
  expect(manifest.version).toBe(pkg.version);
  expect(development.version).toBe(pkg.version);
});

test('localization build plugin still emits nested JSON with the pinned Node runtime', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cf-extension-locales-')
  );
  try {
    fs.mkdirSync(path.join(directory, 'ru'));
    fs.writeFileSync(
      path.join(directory, 'ru/messages.json'),
      '{"hello":"synthetic"}'
    );
    fs.writeFileSync(path.join(directory, 'ru/ignored.txt'), 'not a locale');
    const { crxI18n } = loadTypeScriptModule(
      'apps/extension/custom-vite-plugins.ts'
    );
    const plugin = crxI18n({ localize: true, src: directory });
    const emitFile = jest.fn(() => 'synthetic-reference');
    plugin.buildStart.handler.call({ emitFile });
    expect(emitFile).toHaveBeenCalledTimes(1);
    expect(emitFile).toHaveBeenCalledWith({
      type: 'asset',
      fileName: '_locales/ru/messages.json',
      source: Buffer.from('{"hello":"synthetic"}'),
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
