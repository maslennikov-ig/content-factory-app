#!/usr/bin/env node
'use strict';

// Standalone native Chromium acceptance, deliberately outside Jest/node:test.
// Build first: pnpm run build:extension
// Run: node tests/extension-runtime.browser.cjs [--receipt /owned/path/result.json]
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { chromium } = require('playwright');

const runFile = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'apps/extension/dist');
const ARCHIVE = path.join(ROOT, 'apps/extension/extension.zip');
const HOSTS = [
  '*://*.skool.com/*',
  'https://factory.aidevteam.ru/*',
  'http://localhost/*',
  'https://localhost/*',
];
const ID = 'native-fixture-integration';
const JWT = 'synthetic-opaque-extension-grant';
const COOKIES = {
  client_id: 'synthetic-client-fixture',
  auth_token: 'synthetic-auth-fixture',
};
const ERRORS = {
  reconnect: 'Переподключите канал Skool в Content Factory.',
  retry:
    'Не удалось обновить подключение. Повторим автоматически; если ошибка сохраняется, переподключите канал.',
  login: 'Войдите в Skool в этом браузере, чтобы обновить подключение.',
};
const receipt = {
  schema: 'content-factory-extension-runtime/v1',
  status: 'failed',
  runtime: {
    node: process.version,
    playwright: require('playwright/package.json').version,
  },
  package: {},
  cases: [],
  network: { controlledLoopbackOnly: true, corsHeaders: false },
  cleanup: {
    alarmsCleared: false,
    browserClosed: false,
    serversClosed: false,
    tempRemoved: false,
  },
};
let context, worker, page, temp, backend, frontend, backendUrl;
let mode = { status: 200, body: { success: true } };
const posts = [];
const requests = [];
const heldResponses = [];
let blockedProxyRequests = 0;
let followedRedirects = 0;

function check(value, message) {
  assert.ok(value, message);
}
function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function safeError(error) {
  let message = String(error?.message || error).slice(0, 1500);
  for (const value of [JWT, ...Object.values(COOKIES)])
    message = message.split(value).join('[synthetic]');
  return message;
}
async function caseOf(name, action) {
  const item = { name, status: 'failed' };
  receipt.cases.push(item);
  try {
    await action();
    item.status = 'passed';
  } catch (error) {
    item.error = safeError(error);
    throw error;
  }
}
async function poll(action, description, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await action();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${description}`);
}
async function filesAt(directory, relative = '') {
  const files = {};
  for (const entry of await fs.readdir(path.join(directory, relative), {
    withFileTypes: true,
  })) {
    const name = path.posix.join(relative, entry.name);
    check(!entry.isSymbolicLink(), 'Package must not contain symbolic links');
    if (entry.isDirectory())
      Object.assign(files, await filesAt(directory, name));
    else {
      check(entry.isFile(), 'Package must contain ordinary files');
      files[name] = digest(await fs.readFile(path.join(directory, name)));
    }
  }
  return Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
  );
}
async function extractPackage(directory) {
  // Python is already available; extraction validates CRC, names and duplicates.
  await runFile(
    'python3',
    [
      '-c',
      String.raw`
import pathlib, stat, sys, zipfile
archive, output = sys.argv[1:]
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None, 'ZIP CRC failed'
    seen = set()
    for member in z.infolist():
        name = pathlib.PurePosixPath(member.filename)
        assert member.filename not in seen, 'Duplicate ZIP member'
        seen.add(member.filename)
        assert not name.is_absolute() and '..' not in name.parts and chr(92) not in member.filename, 'Unsafe ZIP member'
        assert not stat.S_ISLNK(member.external_attr >> 16), 'ZIP symbolic link'
        z.extract(member, output)
`,
      ARCHIVE,
      directory,
    ],
    { timeout: 15000 }
  );
}
async function chromiumExecutable() {
  if (process.env.CF_EXTENSION_CHROMIUM_EXECUTABLE) {
    const executable = path.resolve(
      process.env.CF_EXTENSION_CHROMIUM_EXECUTABLE
    );
    await fs.access(executable);
    return executable;
  }
  const expected = chromium.executablePath();
  try {
    await fs.access(expected);
    return expected;
  } catch {
    /* Prefer an existing owned Playwright cache, with no download. */
  }
  const cache =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    path.join(os.homedir(), '.cache/ms-playwright');
  const entries = (await fs.readdir(cache))
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  for (const entry of entries)
    for (const suffix of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const executable = path.join(cache, entry, suffix);
      try {
        await fs.access(executable);
        return executable;
      } catch {
        /* Try only existing cached Chromium distributions. */
      }
    }
  throw new Error(
    'No cached Chromium executable; set CF_EXTENSION_CHROMIUM_EXECUTABLE to an installed Chromium binary'
  );
}
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}
async function external(message) {
  return page.evaluate(
    ({ extensionId, message }) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(extensionId, message, (response) => {
          if (chrome.runtime.lastError)
            reject(new Error(chrome.runtime.lastError.message));
          else resolve(response);
        });
      }),
    { extensionId: receipt.runtime.extensionId, message }
  );
}
async function store(jwt = JWT, url = backendUrl, integrationId = ID) {
  return external({
    type: 'STORE_REFRESH_TOKEN',
    provider: 'skool',
    integrationId,
    jwt,
    backendUrl: url,
  });
}
async function state() {
  return worker.evaluate(async () => {
    const stored = await chrome.storage.local.get([
      'refreshEntries',
      'refreshStatuses',
    ]);
    return {
      ...stored,
      badge: await chrome.action.getBadgeText({}),
      title: await chrome.action.getTitle({}),
    };
  });
}
async function alarm() {
  // A real native alarm event triggers shipped code; no handler is invoked directly.
  await worker.evaluate(async () => {
    await chrome.alarms.clear('cookie-refresh');
    await chrome.alarms.create('cookie-refresh', { when: Date.now() + 150 });
  });
}
async function setCookies() {
  await worker.evaluate(async (values) => {
    for (const [name, value] of Object.entries(values)) {
      await chrome.cookies.set({
        url: 'https://www.skool.com/',
        name,
        value,
        secure: true,
        path: '/',
      });
    }
  }, COOKIES);
}
function verifyPost(post) {
  check(post.method === 'POST', 'Refresh must use POST');
  check(
    post.path === '/api/integrations/extension-refresh',
    'Refresh must preserve /api path'
  );
  check(
    post.headers['content-type']?.includes('application/json'),
    'Refresh must send JSON'
  );
  check(
    !post.headers.cookie,
    'Backend must receive no ambient browser cookies'
  );
  check(post.body.jwt === JWT, 'Refresh must send the synthetic opaque grant');
  const cookies = JSON.parse(
    Buffer.from(post.body.cookies, 'base64').toString('utf8')
  );
  check(
    Object.keys(cookies).sort().join(',') ===
      Object.keys(COOKIES).sort().join(','),
    'Only expected synthetic cookies must be sent'
  );
  for (const name of Object.keys(COOKIES))
    check(
      cookies[name] === COOKIES[name],
      'Refresh must send native stored synthetic cookies'
    );
}
function verifyRetained(current, jwt = JWT) {
  check(
    current.refreshEntries?.[ID]?.jwt === jwt,
    'Refresh failure must preserve stored grant'
  );
  check(
    current.refreshEntries[ID].backendUrl === backendUrl,
    'Refresh must preserve stored backend URL'
  );
}
function verifySafeTitle(current) {
  check(
    /[А-Яа-яЁё]/.test(current.title),
    'Action failure title must explain the failure in Russian'
  );
  check(
    current.title.length > 10 && current.title.length < 300,
    'Action failure title must be useful and bounded'
  );
  for (const value of [
    JWT,
    ...Object.values(COOKIES),
    'fixture-private-server-error',
  ]) {
    check(
      !current.title.includes(value),
      'Action failure title must not contain credentials or server response bodies'
    );
  }
}
async function refreshCase(name, response, expectedError) {
  await caseOf(name, async () => {
    check(
      (await store()).success === true,
      'Connection message must be accepted'
    );
    mode = response;
    const count = posts.length;
    await alarm();
    await poll(() => posts.length > count, 'native alarm POST');
    verifyPost(posts[count]);
    const current = await poll(async () => {
      const value = await state();
      const status = value.refreshStatuses?.[ID];
      return status &&
        status.success === !expectedError &&
        value.badge === (expectedError ? '!' : '') &&
        (!expectedError ||
          (status.error === ERRORS[expectedError] &&
            value.title === `Content Factory: ${ERRORS[expectedError]}`))
        ? value
        : null;
    }, `native status: ${name}`);
    verifyRetained(current);
    if (expectedError) {
      check(current.badge === '!', 'Failure must set native action badge');
      verifySafeTitle(current);
    } else
      check(current.badge === '', 'Success must clear native action badge');
    if (response.location)
      check(
        followedRedirects === 0,
        'Refresh must not follow a redirect to another owned origin'
      );
  });
}
async function main() {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-extension-runtime-'));
  const extracted = path.join(temp, 'package');
  await fs.mkdir(extracted);
  await caseOf('production_zip_crc_and_exact_dist_bytes', async () => {
    await extractPackage(extracted);
    const built = await filesAt(DIST);
    const shipped = await filesAt(extracted);
    check(
      JSON.stringify(built) === JSON.stringify(shipped),
      'Production ZIP files must equal canonical dist bytes'
    );
    const sourceManifest = await fs.readFile(
      path.join(ROOT, 'apps/extension/manifest.json')
    );
    check(
      digest(sourceManifest) === shipped['manifest.json'],
      'Production manifest must be copied unchanged'
    );
    const manifest = JSON.parse(sourceManifest);
    check(manifest.version === '2.0.1', 'Package version must be 2.0.1');
    check(
      JSON.stringify([...manifest.host_permissions].sort()) ===
        JSON.stringify([...HOSTS].sort()),
      'Production host permissions must be narrowly scoped'
    );
    check(
      manifest.manifest_version === 3 && manifest.background?.service_worker,
      'Production package must be MV3'
    );
    receipt.package = {
      archiveSha256: digest(await fs.readFile(ARCHIVE)),
      filesSha256: shipped,
      version: manifest.version,
    };
  });

  backend = http.createServer((req, res) => {
    if (/^https?:\/\//.test(req.url)) {
      blockedProxyRequests++;
      res.writeHead(403).end();
      return;
    }
    requests.push({ method: req.method, path: req.url });
    if (
      req.method !== 'POST' ||
      req.url !== '/api/integrations/extension-refresh'
    ) {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16384) req.destroy();
    });
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400).end();
        return;
      }
      posts.push({
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: parsed,
      });
      const selected = mode;
      if (selected.hold) {
        heldResponses.push(res);
        return;
      }
      if (selected.disconnect) {
        req.socket.destroy();
        return;
      }
      res.writeHead(selected.status, {
        'Content-Type': 'application/json',
        ...(selected.location ? { Location: selected.location } : {}),
      });
      res.end(selected.raw ?? JSON.stringify(selected.body));
    });
  });
  frontend = http.createServer((req, res) => {
    if (req.url === '/forbidden-redirect') followedRedirects++;
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store',
    });
    res.end(
      '<!doctype html><html lang="ru"><title>Owned extension fixture</title><body>Локальная проверка расширения</body></html>'
    );
  });
  const backendPort = await listen(backend);
  const frontendPort = await listen(frontend);
  backendUrl = `http://localhost:${backendPort}/api`;
  await caseOf('owned_chromium_loads_exact_shipped_mv3', async () => {
    const executablePath = await chromiumExecutable();
    receipt.runtime.executablePath = executablePath;
    context = await chromium.launchPersistentContext(
      path.join(temp, 'profile'),
      {
        channel: 'chromium',
        executablePath,
        headless: true,
        timeout: 20000,
        args: [
          `--disable-extensions-except=${extracted}`,
          `--load-extension=${extracted}`,
          '--disable-background-networking',
          '--disable-component-update',
          '--disable-sync',
          '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
          `--proxy-server=http://127.0.0.1:${backendPort}`,
        ],
      }
    );
    worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker', { timeout: 15000 }));
    check(
      worker.url().startsWith('chrome-extension://'),
      'Native extension service worker must be present'
    );
    receipt.runtime.extensionId = new URL(worker.url()).host;
    receipt.runtime.browser = context.browser().version();
    check(
      (await worker.evaluate(() => chrome.runtime.getManifest().version)) ===
        '2.0.1',
      'Installed package must be 2.0.1'
    );
    page = await context.newPage();
    await page.goto(`http://localhost:${frontendPort}`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
  });
  await caseOf('native_host_permissions_are_granted_and_narrow', async () => {
    const native = await worker.evaluate(
      async (origins) => ({
        all: await chrome.permissions.getAll(),
        contains: await chrome.permissions.contains({ origins }),
        foreign: await chrome.permissions.contains({
          origins: ['https://foreign.fixture.invalid/*'],
        }),
      }),
      HOSTS
    );
    check(
      native.contains && !native.foreign,
      'Chrome must grant exact required backend/provider permissions only'
    );
    check(
      JSON.stringify([...native.all.origins].sort()) ===
        JSON.stringify([...HOSTS].sort()),
      'Installed origins must match shipped host permissions'
    );
    receipt.runtime.grantedOrigins = [...native.all.origins].sort();
  });
  await caseOf(
    'real_external_message_accepts_local_backend_different_port',
    async () => {
      const ping = await external({ type: 'PING' });
      check(
        ping.status === 'ok' && ping.version === '2.0.1',
        'Real local page must reach native external message listener'
      );
      check(
        (await store()).success === true,
        'Trusted local page must connect a different local backend port'
      );
      verifyRetained(await state());
      const scheduled = await worker.evaluate(() =>
        chrome.alarms.get('cookie-refresh')
      );
      check(
        scheduled?.periodInMinutes === 1440,
        'Connection must create the existing daily native alarm'
      );
    }
  );
  await caseOf('external_message_rejects_unsafe_backend_urls', async () => {
    const invalid = [
      'https://foreign.fixture.invalid/api',
      `http://localhost:${backendPort}/api?target=foreign`,
      `http://localhost:${backendPort}/api#fragment`,
      `http://fixture:fixture@localhost:${backendPort}/api`,
      `ftp://localhost:${backendPort}/api`,
      `https://localhost:${backendPort}/api`,
      'https://factory.aidevteam.ru/api',
      `http://127.0.0.1:${backendPort}/api`,
    ];
    const count = posts.length;
    for (let index = 0; index < invalid.length; index++) {
      const response = await store(JWT, invalid[index], `rejected-${index}`);
      check(
        response.success === false,
        'External connection must reject untrusted URL or sender mismatch'
      );
    }
    const current = await state();
    check(
      Object.keys(current.refreshEntries).length === 1 &&
        current.refreshEntries[ID],
      'Rejected connections must not be stored'
    );
    check(posts.length === count, 'Rejected connections must not send cookies');
  });
  await setCookies();
  await worker.evaluate(async (url) => {
    await chrome.cookies.set({
      url,
      name: 'ambient_fixture',
      value: 'owned-ambient-cookie',
      path: '/',
    });
  }, backendUrl);
  await refreshCase('actual_native_alarm_post_success_without_cors', {
    status: 200,
    body: { success: true },
  });
  for (const status of [401, 403, 404]) {
    await refreshCase(
      `http_${status}_requires_reconnect`,
      { status, body: { error: 'fixture-private-server-error' } },
      'reconnect'
    );
  }
  await refreshCase(
    'account_mismatch_requires_reconnect',
    { status: 200, body: { success: false, reason: 'account_mismatch' } },
    'reconnect'
  );
  await refreshCase(
    'http_409_reports_retry',
    { status: 409, body: { success: false } },
    'retry'
  );
  await refreshCase(
    'http_500_reports_retry',
    { status: 500, body: { error: 'fixture-private-server-error' } },
    'retry'
  );
  await refreshCase(
    'redirect_is_rejected_without_forwarding_cookies',
    {
      status: 302,
      location: `http://localhost:${frontendPort}/forbidden-redirect`,
      body: { success: true },
    },
    'retry'
  );
  await refreshCase(
    'invalid_json_reports_retry',
    { status: 200, raw: '{invalid' },
    'retry'
  );
  await refreshCase(
    'network_disconnect_reports_retry',
    { disconnect: true },
    'retry'
  );
  await refreshCase('failure_recovery_clears_native_badge', {
    status: 200,
    body: { success: true },
  });
  await caseOf('missing_cookies_reports_login_without_http', async () => {
    check((await store()).success === true, 'Reconnect must succeed');
    await worker.evaluate(() =>
      chrome.cookies.remove({
        url: 'https://www.skool.com/',
        name: 'auth_token',
      })
    );
    const count = posts.length;
    await alarm();
    const current = await poll(async () => {
      const value = await state();
      return value.refreshStatuses?.[ID]?.success === false &&
        value.refreshStatuses[ID].error === ERRORS.login &&
        value.badge === '!'
        ? value
        : null;
    }, 'missing-cookie login status');
    check(posts.length === count, 'Missing cookies must prevent backend POST');
    check(current.badge === '!', 'Missing cookies must set action badge');
    verifyRetained(current);
    verifySafeTitle(current);
    await setCookies();
  });
  await caseOf(
    'legacy_foreign_backend_is_revalidated_before_cookie_send',
    async () => {
      check(
        (await external({ type: 'REMOVE_REFRESH_TOKEN', integrationId: ID }))
          .success === true,
        'Fixture connection must be removable'
      );
      await worker.evaluate(async (jwt) => {
        await chrome.storage.local.set({
          refreshEntries: {
            legacy: {
              provider: 'skool',
              jwt,
              backendUrl: 'https://foreign.fixture.invalid/api',
            },
          },
          refreshStatuses: {},
        });
      }, JWT);
      const count = posts.length;
      await alarm();
      const current = await poll(async () => {
        const value = await state();
        return value.refreshStatuses?.legacy?.success === false &&
          value.badge === '!'
          ? value
          : null;
      }, 'legacy URL validation');
      check(
        posts.length === count,
        'Untrusted legacy backend must not receive a POST'
      );
      check(
        current.refreshEntries.legacy.jwt === JWT,
        'Rejected legacy backend must retain opaque grant'
      );
      check(current.badge === '!', 'Legacy backend rejection must be visible');
      verifySafeTitle(current);
      await worker.evaluate(() =>
        chrome.storage.local.set({ refreshEntries: {}, refreshStatuses: {} })
      );
    }
  );
  for (const action of ['reconnect', 'remove']) {
    await caseOf(`stale_failure_does_not_remark_${action}`, async () => {
      check(
        (await store()).success === true,
        'Initial connection must succeed'
      );
      mode = { hold: true };
      const count = posts.length;
      await alarm();
      await poll(
        () => posts.length > count && heldResponses.length,
        'deferred native refresh'
      );
      if (action === 'reconnect')
        check(
          (await store('synthetic-replacement-grant')).success === true,
          'Reconnect must succeed while request is pending'
        );
      else
        check(
          (await external({ type: 'REMOVE_REFRESH_TOKEN', integrationId: ID }))
            .success === true,
          'Remove must succeed while request is pending'
        );
      const res = heldResponses.shift();
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'fixture-private-server-error' }));
      // Wait for completion through storage queue and a bounded native event-loop settle.
      await new Promise((resolve) => setTimeout(resolve, 400));
      const current = await state();
      check(
        !current.refreshStatuses?.[ID] ||
          current.refreshStatuses[ID].success === true,
        'Stale result must not mark current connection as failed'
      );
      check(
        current.badge === '',
        'Stale result must not restore failure badge'
      );
      if (action === 'reconnect')
        verifyRetained(current, 'synthetic-replacement-grant');
      else
        check(
          !current.refreshEntries?.[ID],
          'Removed connection must remain absent'
        );
    });
  }
  await caseOf('package_unchanged_through_native_acceptance', async () => {
    check(
      JSON.stringify(await filesAt(DIST)) ===
        JSON.stringify(receipt.package.filesSha256),
      'Canonical dist must remain unchanged during acceptance'
    );
    check(
      digest(await fs.readFile(ARCHIVE)) === receipt.package.archiveSha256,
      'Production archive must remain unchanged during acceptance'
    );
    check(
      requests.every(
        (req) =>
          req.method === 'POST' &&
          req.path === '/api/integrations/extension-refresh'
      ),
      'Backend must receive only owned refresh requests, no redirects/OPTIONS'
    );
    receipt.network.refreshPosts = posts.length;
    receipt.network.blockedProxyRequests = blockedProxyRequests;
    receipt.network.followedRedirects = followedRedirects;
  });
  receipt.status = 'passed';
}
async function cleanup() {
  const failures = [];
  try {
    if (worker) {
      await worker.evaluate(() => chrome.alarms.clearAll());
      receipt.cleanup.alarmsCleared = true;
    }
  } catch (error) {
    failures.push(`alarm cleanup: ${safeError(error)}`);
  }
  try {
    if (context) await context.close();
    receipt.cleanup.browserClosed = true;
  } catch (error) {
    failures.push(`browser cleanup: ${safeError(error)}`);
  }
  try {
    for (const response of heldResponses) response.destroy();
    for (const server of [frontend, backend])
      if (server?.listening) {
        server.closeAllConnections();
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    receipt.cleanup.serversClosed = true;
  } catch (error) {
    failures.push(`server cleanup: ${safeError(error)}`);
  }
  try {
    if (temp) await fs.rm(temp, { recursive: true, force: true });
    receipt.cleanup.tempRemoved = true;
  } catch (error) {
    failures.push(`temp cleanup: ${safeError(error)}`);
  }
  if (failures.length) {
    receipt.status = 'failed';
    receipt.cleanup.errors = failures;
  }
}
(async () => {
  try {
    await main();
  } catch (error) {
    receipt.error = safeError(error);
  } finally {
    await cleanup();
  }
  const output = JSON.stringify(receipt, null, 2) + '\n';
  const args = process.argv.slice(2);
  if (args.length) {
    check(
      args.length === 2 && args[0] === '--receipt',
      'Usage: node tests/extension-runtime.browser.cjs [--receipt /owned/path/result.json]'
    );
    const destination = path.resolve(args[1]);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, output, { flag: 'wx' });
  }
  process.stdout.write(output);
  process.exitCode = receipt.status === 'passed' ? 0 : 1;
})().catch((error) => {
  process.stderr.write(safeError(error) + '\n');
  process.exitCode = 1;
});
