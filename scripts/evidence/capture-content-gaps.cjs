#!/usr/bin/env node
/**
 * The three doors, in a browser, on the live stand.
 *
 * The route pass beside this one proves the answers; this proves a person can
 * reach them — the tab is in the frame, the five lines are typeable, and the
 * card that promised a file opens a file dialog rather than a paste box.
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-content-gaps.cjs <outDir>
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const CHROME = process.env.CF_CHROME || '/usr/bin/google-chrome';
const FRONTEND = process.env.CF_FRONTEND_URL || 'http://localhost:4200';
// The cookie has to be set for the host the pages are served from, and on a
// deployed instance that host is not localhost and the connection is https.
const SITE = new URL(FRONTEND);
const TOKEN = process.env.CF_AUTH_TOKEN;
const OUT = process.argv[2];

if (!TOKEN || !OUT) {
  console.error('need CF_AUTH_TOKEN and an output directory');
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });
const report = { steps: [], problems: [] };

const step = (name, detail) => {
  report.steps.push({ name, ...detail });
  console.log(`${name}: ${JSON.stringify(detail)}`);
};

async function shoot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
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
      domain: SITE.hostname,
      path: '/',
      httpOnly: true,
      secure: SITE.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') report.problems.push(message.text().slice(0, 300));
  });

  await page.goto(`${FRONTEND}/content`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(6_000);

  const tabs = await page.locator('[role="tab"]').allTextContents();
  step('tabs', { tabs });
  await shoot(page, '01-tabs');

  // The brief tab: a radar, a gate that says what is missing, and a form.
  await page.locator('[role="tab"]', { hasText: 'Бриф' }).first().click();
  await page.waitForTimeout(4_000);
  step('brief', {
    ready: await page
      .locator('[data-voice-surface="brief"]')
      .first()
      .getAttribute('data-voice-brief-ready'),
    questions: await page.locator('[data-voice-brief-question]').count(),
    formFields: await page.locator('[data-voice-brief-form="true"] textarea').count(),
    createDisabled: await page
      .locator('button', { hasText: 'Создать черновик' })
      .first()
      .isDisabled(),
  });
  await shoot(page, '02-brief');

  // The manual path: five writable lines where a refusal used to be.
  await page.locator('[role="tab"]', { hasText: 'Голос бренда' }).first().click();
  await page.waitForTimeout(4_000);
  const rebuild = page.locator('button', { hasText: 'Собрать голос заново' }).first();
  if (await rebuild.count()) {
    await rebuild.click();
    await page.waitForTimeout(2_500);
  }
  const create = page.locator('button', { hasText: 'Создать голос бренда' }).first();
  if (await create.count()) {
    await create.click();
    await page.waitForTimeout(2_500);
  }
  await page.locator('button', { hasText: 'Заполнить вручную' }).first().click();
  await page.waitForTimeout(4_000);

  const proposal = page.locator('[data-voice-surface="proposal"]').first();
  step('manual', {
    mode: await proposal.getAttribute('data-voice-mode'),
    boxes: await proposal.locator('textarea').count(),
    activateDisabled: await page
      .locator('button', { hasText: 'Активировать голос' })
      .first()
      .isDisabled(),
    shortfallBanner: await page.locator('[data-voice-shortfall="true"]').count(),
  });
  await shoot(page, '03-manual-empty');

  await proposal.locator('textarea').first().fill('Мастерская на Ленина, от лица бригады.');
  await page.locator('button', { hasText: 'Сохранить поле' }).first().click();
  await page.waitForTimeout(3_000);
  step('manual-saved', {
    whoSpeaks: await page
      .locator('[data-voice-field="WHO_SPEAKS"]')
      .first()
      .getAttribute('data-voice-field-status'),
  });
  await shoot(page, '04-manual-one-line-saved');

  // The corpus step, and the card that now takes a file.
  await page.locator('button', { hasText: 'Назад' }).first().click();
  await page.waitForTimeout(2_500);
  await page.locator('button', { hasText: 'Собрать из моих текстов' }).first().click();
  await page.waitForTimeout(4_000);
  const card = page.locator('[data-voice-source="FILE"]').first();
  step('file-card', {
    hint: (await card.textContent())?.replace(/\s+/g, ' ').trim().slice(0, 200),
    picker: await card.locator('input[type="file"]').count(),
  });
  await shoot(page, '05-file-card');

  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  await browser.close();
}

main().catch(async (error) => {
  report.problems.push(String(error).slice(0, 500));
  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.error(error);
  process.exit(1);
});
