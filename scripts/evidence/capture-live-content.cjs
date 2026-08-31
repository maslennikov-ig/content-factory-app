#!/usr/bin/env node
/**
 * Screens of the running product, not of a review scene.
 *
 * `capture-review-scene.cjs` opens `/interface-review/...`, where the data is
 * a fixture and no request leaves the page. This one signs in with a real
 * session cookie and photographs `/content` and `/launches` as a workspace
 * sees them, so the evidence shows the wire working rather than the component
 * rendering.
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-live-content.cjs <outDir>
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

const report = { shots: [], problems: [], console: [] };

async function shoot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  report.shots.push({ name, file: path.relative(process.cwd(), file) });
  return file;
}

/** What the panel actually put on screen, in the words the screen used. */
const readPanel = () => {
  const host = document.querySelector('[data-production-surface="content/section"]');
  if (!host) return { missing: true };
  const panel = host.querySelector('[role="tabpanel"]');
  const text = (panel?.textContent || '').replace(/\s+/g, ' ').trim();
  return {
    tab: host.getAttribute('data-content-tab'),
    tabLabels: [...host.querySelectorAll('[role="tab"]')].map((one) =>
      (one.textContent || '').trim(),
    ),
    headings: [...(panel?.querySelectorAll('h1,h2,h3') || [])].map((one) =>
      (one.textContent || '').trim(),
    ),
    buttons: [...(panel?.querySelectorAll('button') || [])]
      .map((one) => (one.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 24),
    excerpt: text.slice(0, 900),
    length: text.length,
  };
};

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
    { name: 'showorg', value: '', domain: 'localhost', path: '/' },
  ]);

  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.console.push(message.text().slice(0, 300));
    }
  });

  await page.goto(`${FRONTEND}/content`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(4_000);
  report.landedOn = page.url();
  await shoot(page, '01-content-brand');
  report.brand = await page.evaluate(readPanel);

  // The materials tab, by its Russian label rather than by an index.
  const materialsTab = page.locator('[role="tab"]', { hasText: 'Материалы' }).first();
  if (await materialsTab.count()) {
    await materialsTab.click();
    await page.waitForTimeout(2_500);
    await shoot(page, '02-content-materials');
    report.materials = await page.evaluate(readPanel);
  } else {
    report.problems.push('no tab labelled «Материалы» on /content');
  }

  const provenanceTab = page.locator('[role="tab"]', { hasText: 'Происхождение' }).first();
  if (await provenanceTab.count()) {
    await provenanceTab.click();
    await page.waitForTimeout(2_000);
    await shoot(page, '03-content-provenance');
    report.provenance = await page.evaluate(readPanel);
  }

  // The composer, where the voice ribbon is supposed to sit.
  await page.goto(`${FRONTEND}/launches`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(5_000);
  await shoot(page, '04-launches');
  report.launchesUrl = page.url();

  const create = page
    .locator('button', { hasText: /Создать пост|Create a post|Добавить пост/ })
    .first();
  if (await create.count()) {
    await create.click();
    await page.waitForTimeout(6_000);
    await shoot(page, '05-composer');
    report.composer = await page.evaluate(() => {
      const ribbon = document.querySelector('[data-production-surface="content/voice-ribbon"]')
        || document.querySelector('[data-voice-ribbon]');
      const text = (document.body.textContent || '').replace(/\s+/g, ' ');
      return {
        ribbonFound: Boolean(ribbon),
        ribbonText: ribbon ? (ribbon.textContent || '').replace(/\s+/g, ' ').trim() : null,
        mentionsVoice: /Голос бренда|голос бренда/.test(text),
        voiceContext: (text.match(/.{0,120}[Гг]олос бренда.{0,160}/) || [])[0] || null,
      };
    });
    if (!report.composer.ribbonFound) {
      report.problems.push('the composer carries no voice ribbon surface');
    }
  } else {
    report.problems.push('no create-post button found on /launches');
  }

  await browser.close();
  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify({ shots: report.shots.length, problems: report.problems }));
}

main().catch((error) => {
  report.problems.push(`crashed: ${error.message}`);
  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.error(error);
  process.exit(1);
});
