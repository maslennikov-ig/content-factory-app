#!/usr/bin/env node
/**
 * Path 2 of content-factory-next-vme.5: the reference path in the wizard, and
 * the redactions screen it feeds.
 *
 * `redactReference()` in `identity-barrier.ts` runs on TypeScript alone for
 * `LINK` and `FACT_NUMBER` categories — no model call, no network — so a
 * reference sample with a URL and a number in it exercises the real path
 * without needing the assist provider this stand does not have. `PERSON` and
 * `VERBATIM` need entity extraction from a model and stay untouched here; that
 * gap is reported, not hidden.
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-live-reference-redactions.cjs <outDir>
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

const REFERENCE_TEXT = [
  'Материал разбирает манеру письма редактора отраслевого блога о разработке.',
  'Источник: https://example.com/blog/2026/editorial-manner — публичный разбор.',
  'В нём приводится оценка в 12000 знаков и упоминание 2026 года как рубежа.',
  'Ритм короткий, вопрос почти в каждом абзаце, списки редки.',
].join(' ');

async function shoot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  report.shots.push(name);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
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
  await shoot(page, 'path2-01-brand-tab');

  const rebuild = page.locator('button', { hasText: 'Собрать голос заново' }).first();
  report.rebuildFound = (await rebuild.count()) > 0;
  if (!report.rebuildFound) {
    report.problems.push('no «Собрать голос заново» button');
  } else {
    await rebuild.click();
    await page.waitForTimeout(2_500);
    await shoot(page, 'path2-01b-after-rebuild-click');

    // "Собрать голос заново" opens the wizard on its empty screen; the fork
    // with the three paths is one more click in.
    const createVoice = page.locator('button', { hasText: 'Создать голос бренда' }).first();
    if (await createVoice.count()) {
      await createVoice.click();
      await page.waitForTimeout(2_000);
      await shoot(page, 'path2-01c-paths-fork');
    }

    // The card's title reads "Взять манеру у автора, который нравится"; its
    // clickable action button is labelled "Указать автора".
    const referencePath = page.locator('button', {
      hasText: 'Указать автора',
    }).first();
    report.referencePathFound = (await referencePath.count()) > 0;
    if (!report.referencePathFound) {
      report.problems.push('no reference-path card in the wizard fork');
    } else {
      await referencePath.click();
      await page.waitForTimeout(2_000);
      await shoot(page, 'path2-02-reference-chosen');

      const paste = page.locator('[data-voice-source="PASTE"] button').first();
      if (await paste.count()) {
        await paste.click();
        await page.waitForTimeout(1_000);

        const form = page.locator('form[data-voice-intake]');
        await form.getByLabel('Как назвать образец').fill('Манера редактора блога о разработке');
        await form.getByLabel('Текст образца').fill(REFERENCE_TEXT);
        // Scoped to the intake form: the samples table to its left has its
        // own row checkboxes, and an unscoped `.first()` grabs one of those.
        const rights = form.locator('input[type="checkbox"]').first();
        if (await rights.count()) await rights.check().catch(() => {});
        const retention = form.locator('input[type="date"]').first();
        if (await retention.count()) await retention.fill('2027-06-01').catch(() => {});
        await shoot(page, 'path2-03-reference-form-filled');

        const submit = page.locator('button[type="submit"]', { hasText: 'Добавить в набор' }).first();
        report.submitFound = (await submit.count()) > 0;
        if (report.submitFound) {
          await submit.click();
          await page.waitForTimeout(2_500);
          await shoot(page, 'path2-04-reference-submitted');
        } else {
          report.problems.push('no submit button in the reference intake form');
        }
      } else {
        report.problems.push('no PASTE source button on the samples screen');
      }
    }
  }

  // Back to the passport, where the redactions section lives once a
  // reference sample exists.
  await page.goto(`${FRONTEND}/content`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(3_500);
  await shoot(page, 'path2-05-passport-with-redactions');

  // The screen's own heading reads "Что осталось за рамкой", not literally
  // "вырезанное" — that word is the task's description of the surface, not
  // its copy.
  const redactionsHeading = page.locator('text=/Что осталось за рамкой/').first();
  report.redactionsSectionFound = (await redactionsHeading.count()) > 0;
  if (report.redactionsSectionFound) {
    await redactionsHeading.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await shoot(page, 'path2-06-redactions-section');
  } else {
    report.problems.push('no «Вырезанное» heading found on the passport after adding a reference');
  }

  const seen = await page.evaluate(() => {
    const host = document.querySelector('[data-production-surface="content/section"]');
    const panel = host?.querySelector('[role="tabpanel"]');
    return (panel?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 2500);
  });
  report.panelText = seen;

  report.sampleCalls = report.network.filter((one) => one.url.includes('/voice/samples') || one.url.includes('/voice/redactions'));

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'path2-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    referencePathFound: report.referencePathFound,
    submitFound: report.submitFound,
    redactionsSectionFound: report.redactionsSectionFound,
    sampleCalls: report.sampleCalls,
    problems: report.problems,
  }, null, 1));
}

main().catch((error) => {
  report.problems.push(`crashed: ${error.message}`);
  fs.writeFileSync(path.join(OUT, 'path2-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
