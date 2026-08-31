#!/usr/bin/env node
/**
 * The wizard as a workspace that already has a voice sees it.
 *
 * "Собрать голос заново" is the only way back into the wizard once a passport
 * exists, and the wizard's four steps are the part of `36r` that the routes of
 * `07h` were built for. The screens are taken in order so the evidence shows
 * the corpus and the proposal with the workspace's own numbers rather than a
 * fixture's.
 *
 * Usage: CF_AUTH_TOKEN=... node scripts/evidence/capture-live-voice-wizard.cjs <outDir>
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
const report = { steps: [], problems: [] };

const panelText = () => {
  const panel = document.querySelector(
    '[data-production-surface="content/section"] [role="tabpanel"]',
  );
  return (panel?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 700);
};

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
  await page.goto(`${FRONTEND}/content`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(4_000);

  const rebuild = page.locator('button', { hasText: 'Собрать голос заново' }).first();
  if (!(await rebuild.count())) {
    report.problems.push('no «Собрать голос заново» button beside the passport');
  } else {
    await rebuild.click();
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: path.join(OUT, 'wizard-01-entry.png'), fullPage: true });
    report.steps.push({ step: 'entry', text: await page.evaluate(panelText) });
  }

  // Walk whatever "next" the wizard offers, photographing each step.
  const labels = [
    'Создать голос бренда',
    'Собрать из моих текстов',
    'Продолжить',
    'Дальше',
  ];
  for (let index = 0; index < 4; index += 1) {
    let moved = false;
    for (const label of labels) {
      const button = page.locator('button', { hasText: label }).first();
      if (await button.count()) {
        const disabled = await button.isDisabled().catch(() => false);
        if (disabled) continue;
        await button.click().catch(() => {});
        await page.waitForTimeout(3_000);
        moved = true;
        break;
      }
    }
    await page.screenshot({
      path: path.join(OUT, `wizard-0${index + 2}-step.png`),
      fullPage: true,
    });
    report.steps.push({ step: `step-${index + 1}`, moved, text: await page.evaluate(panelText) });
    if (!moved) break;
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'wizard.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.steps.map((one) => ({ step: one.step, head: one.text.slice(0, 110) })), null, 1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
