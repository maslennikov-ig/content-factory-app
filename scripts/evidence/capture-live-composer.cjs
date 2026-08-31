#!/usr/bin/env node
/**
 * The post form, and whether the voice ribbon in it is answered by the server.
 *
 * The calendar has no "create post" button until a channel exists; the form is
 * opened by clicking an hour in the week grid. This script does that, types
 * enough text for the corridor check to fire, and records every request the
 * form made — the ribbon's whole claim is that its state comes from
 * `GET /voice/ribbon` rather than from a constant in the client, and only the
 * network log can show that.
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-live-composer.cjs <outDir>
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

const DRAFT = [
  'Мы отделили паспорт голоса от корпуса образцов, и это оказалось важнее, чем выглядело на бумаге.',
  'Корпус живёт по своим правилам, а паспорт по другим: активная версия обязана держаться, пока её не сменили явно.',
  'Разбор теперь помечается устаревшим, а не пересчитывается на лету, потому что пересчёт двигает коридоры шкал.',
].join(' ');

const report = { shots: [], problems: [], console: [], network: [] };

async function shoot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.shots.push(name);
  return file;
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
  page.on('console', (message) => {
    if (message.type() === 'error') report.console.push(message.text().slice(0, 300));
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('localhost:3000')) return;
    report.network.push({ status: response.status(), url: url.replace('http://localhost:3000', '') });
  });

  // Nothing here may leave the stand. A stray click on "Добавить канал"
  // starts a provider's OAuth flow, and this walkthrough connects no accounts.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    const local =
      url.startsWith(FRONTEND) ||
      url.startsWith('http://localhost:3000') ||
      url.startsWith('data:') ||
      url.startsWith('blob:');
    if (local) return route.continue();
    report.network.push({ status: 'blocked', url });
    return route.abort();
  });

  await page.goto(`${FRONTEND}/launches`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(5_000);

  // A future hour in the week grid opens the form. The cell is the div that
  // carries `cursor-pointer` inside a column that is not `cursor-not-allowed`,
  // which is how `CalendarColumn` marks an hour still ahead of now.
  const cell = page.locator(
    'div:not(.cursor-not-allowed) > div > div.cursor-pointer',
  );
  let opened = false;
  const total = await cell.count();
  report.futureCells = total;
  for (const index of [total - 1, total - 2, 0]) {
    if (index < 0 || index >= total) continue;
    await cell.nth(index).click({ force: true }).catch(() => {});
    await page.waitForTimeout(5_000);
    if ((await page.locator('[data-voice-surface="ribbon"]').count()) > 0) {
      opened = true;
      break;
    }
    if ((await page.locator('[contenteditable="true"]').count()) > 0) {
      opened = true;
      break;
    }
  }

  report.formOpened = opened;
  await shoot(page, '06-composer-open');

  const ribbon = page.locator('[data-voice-surface="ribbon"]').first();
  report.ribbonPresent = (await ribbon.count()) > 0;
  if (report.ribbonPresent) {
    report.ribbonState = await ribbon.getAttribute('data-voice-ribbon-state');
    report.ribbonText = (await ribbon.textContent())?.replace(/\s+/g, ' ').trim() ?? null;
  } else {
    report.problems.push('no [data-voice-surface="ribbon"] in the open post form');
  }

  const editor = page.locator('[contenteditable="true"], textarea').first();
  if (await editor.count()) {
    await editor.click().catch(() => {});
    await editor.type(DRAFT, { delay: 4 }).catch(async () => {
      await editor.fill(DRAFT).catch(() => {});
    });
    await page.waitForTimeout(4_000);
    await shoot(page, '07-composer-typed');
    if (report.ribbonPresent) {
      report.ribbonStateAfterTyping = await ribbon.getAttribute('data-voice-ribbon-state');
      report.ribbonTextAfterTyping = (await ribbon.textContent())
        ?.replace(/\s+/g, ' ')
        .trim() ?? null;
    }
  } else {
    report.problems.push('no editor found in the post form');
  }

  report.voiceCalls = report.network.filter((one) => one.url.includes('/voice/'));

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'composer-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      formOpened: report.formOpened,
      ribbon: report.ribbonState,
      after: report.ribbonStateAfterTyping,
      voiceCalls: report.voiceCalls.length,
      problems: report.problems,
    }),
  );
}

main().catch((error) => {
  report.problems.push(`crashed: ${error.message}`);
  fs.writeFileSync(path.join(OUT, 'composer-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
