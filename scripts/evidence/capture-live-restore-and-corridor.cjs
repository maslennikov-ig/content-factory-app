#!/usr/bin/env node
/**
 * Path 5 of content-factory-next-vme.5: `POST /voice/versions/restore` and
 * `POST /voice/scales/corridor`, by clicking, not by curl.
 *
 * The night walkthrough only ever had one version, so the versions screen
 * never showed a restore target — `VoiceVersionsScreen` only renders the
 * button when a second, non-active, non-draft version exists. That second
 * version (`a7b13052-...`, lifecycle `ARCHIVED`) was written straight into
 * `ProjectBrandProfileVersion` as a clone of the one real version, the same
 * way `seed-content-piece.cjs` wrote a piece the product has no route to
 * create standalone. The click that follows is the real thing: it is what
 * moves the active version away from what the existing content piece was
 * written on, which is also `content-factory-next-vme.5`'s path 3
 * (`voice-moved`).
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-live-restore-and-corridor.cjs <outDir>
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const CHROME = process.env.CF_CHROME || '/usr/bin/google-chrome';
const FRONTEND = process.env.CF_FRONTEND_URL || 'http://localhost:4200';
const TOKEN = process.env.CF_AUTH_TOKEN;
const OUT = process.argv[2];

if (!TOKEN || !OUT) {
  console.error('need CF_AUTH_TOKEN and an output directory');
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });
const report = { shots: [], problems: [], network: [] };

async function shoot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  report.shots.push(name);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1200 },
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

  const page = await context.newPage();
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('localhost:3000')) return;
    report.network.push({
      method: response.request().method(),
      status: response.status(),
      url: url.replace('http://localhost:3000', ''),
    });
  });

  await page.goto(`${FRONTEND}/content`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(3_500);

  // --- POST /voice/scales/corridor -----------------------------------
  const editCorridors = page.locator('button', { hasText: 'Править коридоры' }).first();
  report.editCorridorsFound = (await editCorridors.count()) > 0;
  if (report.editCorridorsFound) {
    await editCorridors.click();
    await page.waitForTimeout(1_000);
    await shoot(page, 'path5-01-corridor-editor-open');

    const form = page.locator('form[data-voice-corridor-editor="open"]');
    report.corridorFormFound = (await form.count()) > 0;
    if (report.corridorFormFound) {
      await form.getByLabel('Нижняя граница').fill('62');
      await form.getByLabel('Верхняя граница').fill('88');
      await shoot(page, 'path5-02-corridor-values-set');
      await form.locator('button[type="submit"]').click();
      await page.waitForTimeout(2_000);
      await shoot(page, 'path5-03-corridor-saved');
    } else {
      report.problems.push('«Править коридоры» opened no form[data-voice-corridor-editor]');
    }
  } else {
    report.problems.push('no «Править коридоры» button — no editable scale to set a corridor on');
  }

  // --- POST /voice/versions/restore -----------------------------------
  const restore = page.locator('button', { hasText: 'Вернуть' }).first();
  report.restoreFound = (await restore.count()) > 0;
  report.restoreLabel = report.restoreFound ? await restore.textContent() : null;
  if (report.restoreFound) {
    await restore.scrollIntoViewIfNeeded().catch(() => {});
    await shoot(page, 'path5-04-restore-button');
    await restore.click();
    await page.waitForTimeout(2_500);
    await shoot(page, 'path5-05-restored');
  } else {
    report.problems.push('no «Вернуть …» button on the versions screen');
  }

  report.corridorCalls = report.network.filter((one) => one.url.includes('/scales/corridor'));
  report.restoreCalls = report.network.filter((one) => one.url.includes('/versions/restore'));

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'path5-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    corridorCalls: report.corridorCalls,
    restoreCalls: report.restoreCalls,
    restoreLabel: report.restoreLabel,
    problems: report.problems,
  }, null, 1));
}

main().catch((error) => {
  report.problems.push(`crashed: ${error.message}`);
  fs.writeFileSync(path.join(OUT, 'path5-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
