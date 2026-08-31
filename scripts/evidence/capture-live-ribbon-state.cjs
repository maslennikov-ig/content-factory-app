#!/usr/bin/env node
/**
 * Path 3 of content-factory-next-vme.5: one ribbon state, photographed in the
 * post form.
 *
 * `GET /content-intelligence/voice/ribbon` computes `stale-context` and
 * `voice-moved` from real rows — a `ContentContextSnapshot` whose
 * `expiresAt` has passed, or a piece/snapshot pinned to a version that is no
 * longer the active one. The night walkthrough only ever saw `fresh` because
 * nothing on the stand was old enough or had moved. This script does not
 * create either condition; it only opens the composer and reads whichever
 * state `/voice/ribbon` reports at the time, so the same script runs once for
 * `stale-context` (after a snapshot is seeded with an expired `expiresAt`)
 * and again for `voice-moved` (after `versions/restore` moves the active
 * version away from what the existing content piece was written on).
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-live-ribbon-state.cjs <outDir> <label>
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const CHROME = process.env.CF_CHROME || '/usr/bin/google-chrome';
const FRONTEND = process.env.CF_FRONTEND_URL || 'http://localhost:4200';
const TOKEN = process.env.CF_AUTH_TOKEN;
const OUT = process.argv[2];
const LABEL = process.argv[3] || 'ribbon';

if (!TOKEN || !OUT) {
  console.error('need CF_AUTH_TOKEN and an output directory');
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });
const report = { label: LABEL, problems: [] };

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'ru-RU',
  });
  await context.addCookies([
    {
      name: 'auth',
      value: TOKEN,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    const local =
      url.startsWith(FRONTEND) ||
      url.startsWith('http://localhost:3000') ||
      url.startsWith('data:') ||
      url.startsWith('blob:');
    return local ? route.continue() : route.abort();
  });

  const page = await context.newPage();
  await page.goto(`${FRONTEND}/launches`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(5_000);

  const cell = page.locator('div:not(.cursor-not-allowed) > div > div.cursor-pointer');
  const total = await cell.count();
  let opened = false;
  for (const index of [total - 1, total - 2, 0]) {
    if (index < 0 || index >= total) continue;
    await cell.nth(index).click({ force: true }).catch(() => {});
    await page.waitForTimeout(5_000);
    if ((await page.locator('[data-voice-surface="ribbon"]').count()) > 0) {
      opened = true;
      break;
    }
  }
  report.opened = opened;

  const ribbon = page.locator('[data-voice-surface="ribbon"]').first();
  report.ribbonPresent = (await ribbon.count()) > 0;
  if (report.ribbonPresent) {
    report.state = await ribbon.getAttribute('data-voice-ribbon-state');
    report.text = (await ribbon.textContent())?.replace(/\s+/g, ' ').trim() ?? null;
    await ribbon.scrollIntoViewIfNeeded().catch(() => {});
  } else {
    report.problems.push('no [data-voice-surface="ribbon"] in the open post form');
  }

  await page.screenshot({ path: path.join(OUT, `${LABEL}.png`), fullPage: false });

  await browser.close();
  fs.writeFileSync(path.join(OUT, `${LABEL}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 1));
}

main().catch((error) => {
  report.problems.push(`crashed: ${error.message}`);
  fs.writeFileSync(path.join(OUT, `${LABEL}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
