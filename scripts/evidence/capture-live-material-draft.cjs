#!/usr/bin/env node
/**
 * Path 1 of content-factory-next-vme.5: a material's recut becomes a draft in
 * the real editor, by clicking through the Materials tab rather than calling
 * the route directly.
 *
 * `POST /content-intelligence/materials/:id/draft` needs a connected channel;
 * `content-factory-next-07h`'s live walkthrough never had one on the stand.
 * `itg-07h-telegram` is a row written straight into `cf-dev-postgres` — a
 * placeholder token, never a real credential, exactly as the night walkthrough
 * described it would need to be. Nothing here reaches Telegram: `createDraft`
 * never imports a provider, and this script never clicks anything that would.
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-live-material-draft.cjs <outDir>
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

  const page = await context.newPage();
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('localhost:3000')) return;
    report.network.push({ status: response.status(), url: url.replace('http://localhost:3000', '') });
  });

  await page.goto(`${FRONTEND}/content`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(3_500);

  const materialsTab = page.locator('[role="tab"]', { hasText: 'Материалы' }).first();
  await materialsTab.click();
  await page.waitForTimeout(2_500);
  await shoot(page, 'path1-01-materials-list');

  const reuse = page.locator('button', { hasText: 'Переиспользовать' }).first();
  report.reuseFound = (await reuse.count()) > 0;
  if (!report.reuseFound) {
    report.problems.push('no «Переиспользовать» button in the materials row');
  } else {
    await reuse.click();
    await page.waitForTimeout(2_500);
    await shoot(page, 'path1-02-recut-panel');

    const telegram = page.locator('[data-voice-recut] button', { hasText: 'Telegram' }).first();
    if (await telegram.count()) {
      await telegram.click();
      await page.waitForTimeout(2_000);
      await shoot(page, 'path1-03-recut-telegram');
    } else {
      report.problems.push('no Telegram platform button in the recut panel');
    }

    const openEditor = page.locator('button', { hasText: 'Открыть в редакторе' }).first();
    report.openEditorFound = (await openEditor.count()) > 0;
    report.openEditorDisabled = report.openEditorFound
      ? await openEditor.isDisabled().catch(() => false)
      : null;
    if (report.openEditorFound && !report.openEditorDisabled) {
      await openEditor.click();
      await page.waitForTimeout(4_500);
      await shoot(page, 'path1-04-editor-opened');

      const editor = page.locator('[contenteditable="true"], textarea').first();
      report.editorPresent = (await editor.count()) > 0;
      report.editorText = report.editorPresent
        ? (await editor.first().textContent().catch(() => null))?.slice(0, 200)
        : null;
    } else {
      report.problems.push(
        `«Открыть в редакторе» not clickable (found=${report.openEditorFound}, disabled=${report.openEditorDisabled})`
      );
    }
  }

  report.draftCalls = report.network.filter((one) => one.url.includes('/draft'));

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'path1-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    reuseFound: report.reuseFound,
    openEditorFound: report.openEditorFound,
    editorPresent: report.editorPresent,
    draftCalls: report.draftCalls,
    problems: report.problems,
  }, null, 1));
}

main().catch((error) => {
  report.problems.push(`crashed: ${error.message}`);
  fs.writeFileSync(path.join(OUT, 'path1-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
