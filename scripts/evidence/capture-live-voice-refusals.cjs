#!/usr/bin/env node
/**
 * Whether a coded refusal from the backend reaches the screen as that code.
 *
 * The contract's claim is narrow and testable: a screen branches on
 * `VOICE_ERROR_CODES`, and "что-то пошло не так" over a server that named the
 * reason is a lost reason. Rather than break the stand, each run replaces one
 * route's answer with the refusal the contract defines for it and photographs
 * what the screen does — `restricted` for a forbidden voice, `error` for a
 * failed analysis.
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-live-voice-refusals.cjs <outDir>
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

const CASES = [
  {
    name: 'voice-forbidden',
    match: '**/content-intelligence/voice/**',
    status: 403,
    body: {
      code: 'VOICE_FORBIDDEN',
      message: 'Голос бренда доступен только администратору рабочего пространства.',
    },
    expect: 'restricted',
  },
  {
    name: 'voice-analysis-failed',
    match: '**/content-intelligence/voice/**',
    status: 500,
    body: {
      code: 'VOICE_ANALYSIS_FAILED',
      message: 'Разбор не удалось завершить.',
    },
    expect: 'error',
  },
  {
    name: 'material-not-found',
    match: '**/content-intelligence/materials**',
    status: 404,
    body: {
      code: 'MATERIAL_NOT_FOUND',
      message: 'Материал не найден',
      subject: 'cnt-01',
    },
    expect: 'error',
    tab: 'Материалы',
  },
];

const report = { cases: [], problems: [] };

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const one of CASES) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
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
    await context.route(one.match, (route) =>
      route.fulfill({
        status: one.status,
        contentType: 'application/json',
        body: JSON.stringify(one.body),
      }),
    );

    const page = await context.newPage();
    await page.goto(`${FRONTEND}/content`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(3_500);

    if (one.tab) {
      const tab = page.locator('[role="tab"]', { hasText: one.tab }).first();
      if (await tab.count()) {
        await tab.click();
        await page.waitForTimeout(2_500);
      }
    }

    await page.screenshot({
      path: path.join(OUT, `refusal-${one.name}.png`),
      fullPage: true,
    });

    const seen = await page.evaluate(() => {
      const host = document.querySelector('[data-production-surface="content/section"]');
      const panel = host?.querySelector('[role="tabpanel"]');
      const text = (panel?.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        excerpt: text.slice(0, 500),
        // Every element that reports a screen state, whatever its name.
        states: [...document.querySelectorAll('[data-state],[data-voice-state],[data-screen-state]')]
          .map((node) =>
            node.getAttribute('data-voice-state') ||
            node.getAttribute('data-screen-state') ||
            node.getAttribute('data-state'),
          )
          .filter(Boolean)
          .slice(0, 20),
      };
    });

    report.cases.push({ ...one, seen });
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'refusals.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.cases.map((one) => ({
    name: one.name,
    excerpt: one.seen.excerpt.slice(0, 160),
  })), null, 1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
