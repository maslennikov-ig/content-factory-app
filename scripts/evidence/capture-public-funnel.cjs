'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROUTES = ['/', '/product', '/security', '/docs', '/demo'];
const WIDTHS = [390, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ru', 'en'];
const CAPTURE_MATRIX = ROUTES.flatMap((route) =>
  WIDTHS.flatMap((width) =>
    THEMES.flatMap((theme) =>
      LOCALES.map((locale) => ({ route, width, theme, locale }))
    )
  )
);

const SENSITIVE_PATH =
  /(?:^|\/)(?:tenant|organizations?|posts?|ai|generate|temporal|workflows?|oauth|publish|accounts?|auth|register|stripe|billing|checkout|payments?|openai|anthropic)(?:\/|$)/i;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const GROWTH_PATH = '/public-growth-events';

function publicEntry(entry) {
  const parsed = new URL(entry.url);
  return {
    method: String(entry.method || 'GET').toUpperCase(),
    url: parsed.href,
    resourceType: entry.resourceType || 'other',
    ...(Number.isInteger(entry.status) ? { status: entry.status } : {}),
    ...(entry.failure ? { failure: String(entry.failure) } : {}),
  };
}

function inspectRequestLedger(entries, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const safe = entries.map(publicEntry);
  const external = safe.filter((entry) => new URL(entry.url).origin !== origin);
  const allowedGrowthPosts = safe.filter((entry) => {
    const url = new URL(entry.url);
    return entry.method === 'POST' && url.origin === origin && url.pathname === GROWTH_PATH;
  });
  const disallowedMutations = safe.filter((entry) => {
    const url = new URL(entry.url);
    return (
      MUTATING_METHODS.has(entry.method) &&
      !(entry.method === 'POST' && url.origin === origin && url.pathname === GROWTH_PATH)
    );
  });
  const disallowedSensitive = safe.filter((entry) =>
    SENSITIVE_PATH.test(new URL(entry.url).pathname)
  );
  return {
    external,
    disallowedMutations,
    disallowedSensitive,
    allowedGrowthPosts,
  };
}

function slugForRoute(route) {
  return route === '/' ? 'home' : route.slice(1).replaceAll('/', '-');
}

function pngDimensions(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`Not a PNG file: ${file}`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function sanitizedHar(entries) {
  return {
    log: {
      version: '1.2',
      creator: { name: 'capture-public-funnel.cjs', version: '1' },
      entries: entries.map((entry) => ({
        startedDateTime: entry.startedDateTime,
        time: entry.time || 0,
        request: {
          method: entry.method,
          url: entry.url,
          httpVersion: 'HTTP/1.1',
          headers: [],
          queryString: [],
          cookies: [],
          headersSize: -1,
          bodySize: -1,
        },
        response: {
          status: entry.status || 0,
          statusText: '',
          httpVersion: 'HTTP/1.1',
          headers: [],
          cookies: [],
          content: { size: -1, mimeType: entry.mimeType || '' },
          redirectURL: '',
          headersSize: -1,
          bodySize: -1,
        },
        cache: {},
        timings: { send: 0, wait: entry.time || 0, receive: 0 },
        _resourceType: entry.resourceType,
        ...(entry.failure ? { _failure: entry.failure } : {}),
        ...(entry.growthPayload ? { _growthPayload: entry.growthPayload } : {}),
      })),
    },
  };
}

function sanitizeGrowthPayload(raw) {
  try {
    const input = JSON.parse(raw || '');
    const allowedKeys = ['name', 'locale', 'widthRange', 'uiVersion', 'demoStep'];
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !allowedKeys.includes(key))
    ) {
      return { invalid: true };
    }
    return Object.fromEntries(
      allowedKeys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])
    );
  } catch {
    return { invalid: true };
  }
}

async function capture({
  baseUrl = process.env.PUBLIC_FUNNEL_BASE_URL || 'http://localhost:4200',
  chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome',
  evidenceDir = path.resolve(
    __dirname,
    '../../.codex/stages/content-factory-next-or3/evidence/public-funnel'
  ),
} = {}) {
  const base = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost'].includes(base.hostname)) {
    throw new Error(`PUBLIC_FUNNEL_BASE_URL must be local: ${baseUrl}`);
  }
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`);

  fs.rmSync(evidenceDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(evidenceDir, 'screenshots'), { recursive: true });

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter,Translate',
      '--no-default-browser-check',
    ],
  });
  const browserVersion = await browser.version();
  const ledger = [];
  const results = [];
  const screenshotFiles = [];
  let requestSequence = 0;

  try {
    for (const item of CAPTURE_MATRIX) {
      const context = await browser.newContext({
        viewport: { width: item.width, height: item.width === 390 ? 844 : 900 },
        colorScheme: item.theme,
        reducedMotion: 'reduce',
        locale: item.locale === 'ru' ? 'ru-RU' : 'en-US',
      });
      await context.addCookies([
        { name: 'i18next', value: item.locale, url: base.origin },
        { name: 'mode', value: item.theme, url: base.origin },
      ]);
      await context.route('**/*', async (route) => {
        const target = new URL(route.request().url());
        if (target.origin !== base.origin) return route.abort('blockedbyclient');
        return route.continue();
      });
      const page = await context.newPage();
      const pageErrors = [];
      const requestIndex = new Map();

      page.on('pageerror', (error) => pageErrors.push(String(error)));
      page.on('request', (request) => {
        const entry = {
          id: ++requestSequence,
          startedDateTime: new Date().toISOString(),
          method: request.method(),
          url: request.url(),
          resourceType: request.resourceType(),
          startedAt: Date.now(),
        };
        const parsed = new URL(entry.url);
        if (entry.method === 'POST' && parsed.origin === base.origin && parsed.pathname === GROWTH_PATH) {
          entry.growthPayload = sanitizeGrowthPayload(request.postData());
        }
        ledger.push(entry);
        requestIndex.set(request, entry);
      });
      page.on('response', (response) => {
        const entry = requestIndex.get(response.request());
        if (!entry) return;
        entry.status = response.status();
        entry.mimeType = response.headers()['content-type']?.split(';')[0] || '';
        entry.time = Date.now() - entry.startedAt;
      });
      page.on('requestfailed', (request) => {
        const entry = requestIndex.get(request);
        if (!entry) return;
        entry.failure = request.failure()?.errorText || 'request failed';
        entry.time = Date.now() - entry.startedAt;
      });

      const response = await page.goto(new URL(item.route, base).href, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      if (!response || !response.ok()) {
        throw new Error(`${item.route} returned ${response?.status() || 'no response'}`);
      }
      await page.waitForTimeout(250);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(50);
      const browserChecks = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        return {
          lang: root.lang,
          theme: body.classList.contains('dark') ? 'dark' : body.classList.contains('light') ? 'light' : 'missing',
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          overflowPixels: Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth,
          rawPublicKeys: (body.innerText.match(/public_saas_[a-z0-9_]+/gi) || []).slice(0, 10),
          activeAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
        };
      });
      if (
        browserChecks.lang !== item.locale ||
        browserChecks.theme !== item.theme ||
        !browserChecks.reducedMotion ||
        browserChecks.overflowPixels > 0 ||
        browserChecks.rawPublicKeys.length ||
        browserChecks.activeAnimations > 0 ||
        pageErrors.length
      ) {
        throw new Error(`Browser contract failed for ${JSON.stringify(item)}: ${JSON.stringify({ browserChecks, pageErrors })}`);
      }

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement)) return null;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 80) || '',
          focusVisible: element.matches(':focus-visible'),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      });
      if (!focus?.focusVisible || focus.outlineStyle === 'none' || focus.outlineWidth === '0px') {
        throw new Error(`Visible keyboard focus missing for ${JSON.stringify(item)}: ${JSON.stringify(focus)}`);
      }

      const filename = `${slugForRoute(item.route)}-${item.width}-${item.theme}-${item.locale}.png`;
      const relative = `screenshots/${filename}`;
      const absolute = path.join(evidenceDir, relative);
      await page.screenshot({ path: absolute, fullPage: true });
      const dimensions = pngDimensions(absolute);
      if (dimensions.width !== item.width) {
        throw new Error(`Screenshot width mismatch for ${relative}: ${dimensions.width}`);
      }
      screenshotFiles.push({ file: relative, ...dimensions, bytes: fs.statSync(absolute).size });
      results.push({ ...item, status: response.status(), browserChecks, focus, screenshot: relative });
      await context.close();
    }

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
      locale: 'en-US',
    });
    await context.addCookies([
      { name: 'i18next', value: 'en', url: base.origin },
      { name: 'mode', value: 'light', url: base.origin },
    ]);
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin !== base.origin) return route.abort('blockedbyclient');
      return route.continue();
    });
    const page = await context.newPage();
    const requestIndex = new Map();
    page.on('request', (request) => {
      const entry = {
        id: ++requestSequence,
        startedDateTime: new Date().toISOString(),
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        startedAt: Date.now(),
      };
      const parsed = new URL(entry.url);
      if (entry.method === 'POST' && parsed.origin === base.origin && parsed.pathname === GROWTH_PATH) {
        entry.growthPayload = sanitizeGrowthPayload(request.postData());
      }
      ledger.push(entry);
      requestIndex.set(request, entry);
    });
    page.on('response', (response) => {
      const entry = requestIndex.get(response.request());
      if (!entry) return;
      entry.status = response.status();
      entry.mimeType = response.headers()['content-type']?.split(';')[0] || '';
      entry.time = Date.now() - entry.startedAt;
    });
    page.on('requestfailed', (request) => {
      const entry = requestIndex.get(request);
      if (!entry) return;
      entry.failure = request.failure()?.errorText || 'request failed';
      entry.time = Date.now() - entry.startedAt;
    });

    await page.goto(new URL('/demo', base).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Match the matrix lane: let client hydration finish before Playwright
    // temporarily hides the caret for the first screenshot.
    await page.waitForTimeout(250);
    await page
      .getByRole('textbox', { name: 'Material' })
      .fill('Synthetic browser evidence: one material through every local demo stage.');
    const flowShots = [];
    const shot = async (stage) => {
      const relative = `screenshots/demo-flow-${stage}-1440-light-en.png`;
      const absolute = path.join(evidenceDir, relative);
      await page.screenshot({ path: absolute, fullPage: true });
      const dimensions = pngDimensions(absolute);
      screenshotFiles.push({ file: relative, ...dimensions, bytes: fs.statSync(absolute).size });
      flowShots.push({ stage, file: relative, ...dimensions });
    };
    await shot('plan');
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('heading', { name: 'Adaptation' }).waitFor();
    await shot('draft');
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('heading', { name: 'Review' }).waitFor();
    await page.getByRole('button', { name: 'Send for review' }).click();
    await page.getByRole('button', { name: 'Approve' }).click();
    await shot('review');
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('heading', { name: 'Schedule' }).waitFor();
    await page.getByRole('button', { name: '19', exact: true }).click();
    await page.getByRole('button', { name: '09:00', exact: true }).click();
    await shot('schedule');
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByText('Demo data', { exact: true }).waitFor();
    await shot('result');
    const demoState = await page.evaluate(() => ({
      overflowPixels: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      runningAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
    }));
    if (demoState.overflowPixels > 0 || !demoState.reducedMotion || demoState.runningAnimations > 0) {
      throw new Error(`Demo result browser contract failed: ${JSON.stringify(demoState)}`);
    }
    await page.waitForTimeout(250);
    await context.close();

    const inspection = inspectRequestLedger(ledger, base.origin);
    const invalidGrowthPayloads = ledger.filter((entry) => entry.growthPayload?.invalid);
    if (
      inspection.external.length ||
      inspection.disallowedMutations.length ||
      inspection.disallowedSensitive.length ||
      invalidGrowthPayloads.length
    ) {
      throw new Error(`Unsafe browser request ledger: ${JSON.stringify({ inspection, invalidGrowthPayloads })}`);
    }

    const publicLedger = ledger.map(({ startedAt: _startedAt, ...entry }) => entry);
    writeJson(path.join(evidenceDir, 'request-ledger.json'), {
      schemaVersion: 'public-funnel-request-ledger/v1',
      baseOrigin: base.origin,
      entries: publicLedger,
      inspection,
    });
    writeJson(path.join(evidenceDir, 'network.har'), sanitizedHar(publicLedger));
    writeJson(path.join(evidenceDir, 'manifest.json'), {
      schemaVersion: 'public-funnel-browser-evidence/v1',
      generatedAt: new Date().toISOString(),
      command: 'node scripts/evidence/capture-public-funnel.cjs',
      node: process.version,
      browser: { executable: chromePath, version: browserVersion },
      baseOrigin: base.origin,
      matrix: results,
      demoFlow: { version: 'public-demo-v1', stages: flowShots, checks: demoState },
      network: {
        totalRequests: ledger.length,
        allowedGrowthPosts: inspection.allowedGrowthPosts.length,
        externalRequests: inspection.external.length,
        disallowedMutations: inspection.disallowedMutations.length,
        disallowedSensitiveRequests: inspection.disallowedSensitive.length,
      },
      screenshots: screenshotFiles,
    });
    return { results, flowShots, inspection, screenshots: screenshotFiles };
  } finally {
    await browser.close();
  }
}

module.exports = { CAPTURE_MATRIX, capture, inspectRequestLedger, sanitizeGrowthPayload };

if (require.main === module) {
  capture()
    .then((result) => {
      process.stdout.write(
        `Captured ${result.results.length} matrix scenes, ${result.flowShots.length} demo stages and ${result.screenshots.length} PNG files.\n`
      );
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error}\n`);
      process.exitCode = 1;
    });
}
