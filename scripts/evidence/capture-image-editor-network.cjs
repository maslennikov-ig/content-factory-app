'use strict';

/**
 * Records what the image editor asks the network for, and proves it keeps
 * working when the network is taken away.
 *
 * Run it against a development server: `/interface-review` is unavailable
 * outside development on purpose, so the production build has no route that
 * renders this surface without an account. That is the honest limit of this
 * proof — it covers the editor's own chunks, fonts and styles, not the
 * authenticated media library around it.
 *
 *   pnpm --filter ./apps/frontend exec next dev -p 4322
 *   IMAGE_EDITOR_CHROMIUM=/path/to/chrome node scripts/evidence/capture-image-editor-network.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

// No browser download: point at one that is already installed. Playwright's
// own cache is the usual place; any Chromium binary works.
const EXECUTABLE = process.env.IMAGE_EDITOR_CHROMIUM;
const ORIGIN = process.env.IMAGE_EDITOR_ORIGIN || 'http://127.0.0.1:4322';
const ROUTE =
  '/interface-review/image-editor/editor?state=default&theme=light&locale=ru&viewport=390';
const OUT =
  process.env.IMAGE_EDITOR_EVIDENCE_DIR ||
  path.resolve(
    __dirname,
    '../../.codex/stages/content-factory-next-0c8/evidence/image-editor-hardening'
  );

const main = async () => {
  if (!EXECUTABLE) {
    throw new Error(
      'Set IMAGE_EDITOR_CHROMIUM to an installed Chromium binary. This script never downloads one.'
    );
  }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ['--no-sandbox'],
  });

  // Pass 1 — the network ledger, recorded as a HAR the way §8.1.5 asks for.
  // Bodies are omitted on purpose: the question is who was contacted, and
  // keeping response bytes would turn a privacy record into a payload dump.
  const harPath = path.join(OUT, 'image-editor.har');
  const recorded = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordHar: { path: harPath, content: 'omit', mode: 'full' },
  });
  const page = await recorded.newPage();
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  const response = await page.goto(ORIGIN + ROUTE, { waitUntil: 'load' });
  await page.waitForSelector('[data-product-surface="image-editor"]');
  await page.getByRole('button', { name: 'Прямоугольник' }).click().catch(() => {});
  await page.waitForTimeout(500);
  const httpStatus = response.status();
  await recorded.close();

  const external = requests.filter((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return false;
    try {
      return new URL(url).origin !== ORIGIN;
    } catch {
      return true;
    }
  });

  // Pass 2 — §8.1.6. The page loads, the network is cut, and the editor has to
  // keep working. A vendor call that only happens on a later interaction would
  // surface here and nowhere else.
  const offlineContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const offlinePage = await offlineContext.newPage();
  const offlineFailures = [];
  offlinePage.on('requestfailed', (request) =>
    offlineFailures.push({
      url: request.url(),
      failure: request.failure() && request.failure().errorText,
    })
  );
  await offlinePage.goto(ORIGIN + ROUTE, { waitUntil: 'load' });
  await offlinePage.waitForSelector('[data-product-surface="image-editor"]');
  await offlineContext.setOffline(true);
  // The synthetic review scene mounts no engine, so its tool buttons are
  // disabled by design. Drive what a person can still drive — the format
  // select and a canvas field — and let the failed-request log answer the
  // question that matters: did anything reach for the network.
  await offlinePage
    .getByLabel('Формат')
    .selectOption('image/jpeg')
    .catch(() => {});
  await offlinePage.getByLabel('Ширина').fill('800').catch(() => {});
  await offlinePage.keyboard.press('Tab');
  await offlinePage.keyboard.press('Tab');
  await offlinePage.waitForTimeout(1500);
  const offlineDialog = await offlinePage
    .locator('[data-product-surface="image-editor"]')
    .count();
  const offlineExternalFailures = offlineFailures.filter((entry) => {
    try {
      return new URL(entry.url).origin !== ORIGIN;
    } catch {
      return true;
    }
  });
  await offlineContext.close();
  await browser.close();

  const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
  const harOrigins = [
    ...new Set(
      har.log.entries.map((entry) => {
        try {
          return new URL(entry.request.url).origin;
        } catch {
          return entry.request.url;
        }
      })
    ),
  ].sort();

  const summary = {
    route: ORIGIN + ROUTE,
    runtime: {
      node: process.version,
      playwright: require('playwright-core/package.json').version,
      chromium: EXECUTABLE,
      server: 'next dev (the review route is unavailable outside development)',
    },
    http_status: httpStatus,
    har_file: 'image-editor.har',
    har_entry_count: har.log.entries.length,
    har_origins: harOrigins,
    external_request_count: external.length,
    external_requests: external,
    offline: {
      surface_present: offlineDialog >= 1,
      external_request_failures: offlineExternalFailures,
    },
  };
  fs.writeFileSync(
    path.join(OUT, 'network-ledger.json'),
    JSON.stringify(summary, null, 2) + '\n'
  );
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
