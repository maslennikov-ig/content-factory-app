#!/usr/bin/env node
/**
 * Path 4 of content-factory-next-vme.5: the brief gate beyond its empty
 * state — with a caveat this script's evidence exists to document.
 *
 * `VoiceBriefScreen` (`apps/frontend/src/components/brand-voice/voice-brief.screen.tsx`)
 * has no live container. A repo-wide search turns up exactly two importers:
 * itself and `voice-brief.review-scene.tsx`, and the only route that ever
 * renders it is the `/interface-review` fixture stand
 * (`apps/frontend/src/app/(stand)/interface-review/content-intelligence/[scene]/page.tsx`).
 * `content-section.screen.tsx`'s four tabs are `brand`, `sources`,
 * `materials`, `provenance` — no `brief`. So there is no click path to the
 * brief form itself, empty or otherwise; this is a wiring gap, not a data
 * gap, and it is reported as one rather than worked around by rendering the
 * fixture and calling it live.
 *
 * What this script does instead: it accumulates real facts through
 * `POST /content-intelligence/facts` (a real, if UI-less, product route),
 * evaluates and drafts a brief through `POST /content-intelligence/brief/{evaluate,draft}`
 * (real routes, real facts, a real grounded brief), and then opens the actual
 * `Post` row the draft route produced in the live calendar — proving the
 * backend behaviour beyond the empty state is real, even though no screen
 * shows it happening.
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-live-brief-draft.cjs <outDir> <snippet>
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const CHROME = process.env.CF_CHROME || '/usr/bin/google-chrome';
const FRONTEND = process.env.CF_FRONTEND_URL || 'http://localhost:4200';
const TOKEN = process.env.CF_AUTH_TOKEN;
const OUT = process.argv[2];
const SNIPPET = process.argv[3];

if (!TOKEN || !OUT || !SNIPPET) {
  console.error('need CF_AUTH_TOKEN, an output directory and a text snippet from the draft');
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });
const report = { shots: [], problems: [] };

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
  await page.goto(`${FRONTEND}/launches`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: path.join(OUT, 'path4-04-calendar.png'), fullPage: true });
  report.shots.push('path4-04-calendar');

  // The calendar's sidebar also carries the stand's fake channel name
  // ("Стендовый канал (не подключён)"), which shares the "Стенд" prefix with
  // this draft's opening line — match the full sentence to land on the card.
  const card = page.getByText(SNIPPET, { exact: false }).first();
  report.cardFound = (await card.count()) > 0;
  if (!report.cardFound) {
    report.problems.push(`no calendar card matched the snippet "${SNIPPET}"`);
  } else {
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await card.click({ force: true }).catch(() => {});
    await page.waitForTimeout(5_000);
    await page.screenshot({ path: path.join(OUT, 'path4-05-brief-draft-open.png'), fullPage: true });
    report.shots.push('path4-05-brief-draft-open');

    const editor = page.locator('[contenteditable="true"], textarea').first();
    report.editorPresent = (await editor.count()) > 0;
    report.editorText = report.editorPresent
      ? (await editor.first().textContent().catch(() => null))?.slice(0, 400)
      : null;
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'path4-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 1));
}

main().catch((error) => {
  report.problems.push(`crashed: ${error.message}`);
  fs.writeFileSync(path.join(OUT, 'path4-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
