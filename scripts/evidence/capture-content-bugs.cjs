#!/usr/bin/env node
/**
 * What the four defect fixes of `content-factory-next-vme` look like on the
 * screen, photographed rather than described.
 *
 * Three of the four are only visible as a picture: the passport that used to
 * print another analysis's numbers beside a hand-written voice (`vme.11`),
 * the paste card that now states its own ceiling (`vme.10`), and the fact
 * form that working memory never had (`vme.13`). The fourth (`vme.12`) is a
 * refusal with no screen of its own and is proved over HTTP instead.
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-content-bugs.cjs <outDir>
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
const report = { shots: [], problems: [] };

async function shoot(page, name) {
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  report.shots.push(name);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
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
    if (message.type() === 'error') report.problems.push(message.text());
  });

  // vme.11 — the passport of a hand-written voice. No measurement explains
  // this version, and the card has to say that rather than print a zero.
  await page.goto(`${FRONTEND}/content`, { waitUntil: 'load', timeout: 90_000 });
  await shoot(page, '01-passport-no-analysis');

  // vme.13 — the fact door, in the tab that already read the catalogue.
  const provenance = page.getByRole('tab', { name: /Происхождение|Provenance/i });
  if (await provenance.count()) {
    await provenance.first().click();
    await shoot(page, '02-facts-door');
  } else {
    report.problems.push('provenance tab not found');
  }

  // vme.14 — the brief's fact row, with the third way to ground it: an id
  // from the catalogue the tab above now writes to.
  const brief = page.getByRole('tab', { name: /Бриф|Brief/i });
  if (await brief.count()) {
    await brief.first().click();
    await shoot(page, '03-brief-fact-id');
  } else {
    report.problems.push('brief tab not found');
  }

  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  await browser.close();
}

main().catch((error) => {
  report.problems.push(String(error));
  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  process.exit(1);
});
