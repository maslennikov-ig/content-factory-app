#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {chromium} = require('playwright');

async function main() {
  const api = process.env.CF_VIDEO_FIXTURE_API || 'http://localhost:43311';
  const frontend = process.env.CF_VIDEO_FIXTURE_FRONTEND || 'http://localhost:43310';
  if (![api, frontend].every(value => /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(value))) throw new Error('Only a local disposable fixture is allowed');
  const out = path.resolve(process.env.CF_VIDEO_BROWSER_EVIDENCE || '.codex/stages/content-factory-next-zlq6-implementation-20261022/evidence');
  fs.mkdirSync(out, {recursive: true});
  const browser = await chromium.launch({headless: true, executablePath: process.env.CF_VIDEO_CHROME || '/opt/google/chrome/chrome'});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  const info = await (await context.request.get(api + '/__fixture/info')).json();
  const counters = async () => (await context.request.get(api + '/__fixture/counters')).json();
  const results = [];
  try {
    await page.goto(api + '/__fixture/signin/admin');
    for (const mode of ['clip', 'presenter']) {
      await page.goto(`${frontend}/media`, {waitUntil: 'domcontentloaded'});
      const navigationWitness = await page.evaluate(() => {
        window.__cfVideoNavigationWitness = crypto.randomUUID();
        return window.__cfVideoNavigationWitness;
      });
      await page.getByRole('link', {name: 'Создать видео', exact: true}).click();
      await page.locator('[data-video-workspace]').waitFor();
      assert.equal(await page.evaluate(() => window.__cfVideoNavigationWitness), navigationWitness);
      await page.goBack();
      await page.getByRole('link', {name: 'Создать видео', exact: true}).waitFor();
      assert.equal(await page.locator('[data-video-workspace]').count(), 0);
      await page.goForward();
      await page.locator('[data-video-workspace]').waitFor();
      assert.equal(await page.evaluate(() => window.__cfVideoNavigationWitness), navigationWitness);
      await page.locator('#video-source-piece').selectOption(info.pieceId);
      await page.locator('#video-mode').selectOption(mode);
      await page.getByLabel('Язык результата (BCP 47)', {exact: true}).fill('ru');
      await page.getByLabel('Соотношение сторон', {exact: true}).selectOption('16:9');
      if (mode === 'presenter') {
        await page.locator('#video-avatar').selectOption('fixture_avatar');
        await page.locator('#video-voice').selectOption('fixture_voice_ru');
        await page.locator('#video-engine').selectOption('avatar_iii');
      }
      await page.getByRole('button', {name: 'Сохранить черновик', exact: true}).click();
      const field = page.locator(mode === 'clip' ? '#video-prompt' : '#video-script');
      await field.waitFor();
      const original = await field.inputValue();
      assert.match(original, /22\.10\.2026/); assert.match(original, /12,5/); assert.match(original, /не содержит/);
      const edited = original + (mode === 'clip' ? '\nСтатичная камера.' : '\nПроверьте данные.');
      await field.fill(edited);
      await page.getByRole('button', {name: 'Сохранить черновик', exact: true}).click();
      await page.getByRole('button', {name: 'Проверить параметры и цену', exact: true}).click();
      const launch = page.getByRole('button', {name: 'Сгенерировать видео', exact: true});
      await launch.waitFor();
      const before = await counters();
      await launch.click();
      const completed = page.locator('[data-video-job-state="completed"]');
      await completed.waitFor({timeout: 25000});
      const jobId = await completed.getAttribute('data-video-job-id');
      const player = completed.locator('video');
      await player.evaluate(async element => {element.muted = true; await element.play();});
      await page.waitForFunction(() => document.querySelector('[data-video-job-state="completed"] video')?.currentTime > 0);
      const playback = await player.evaluate(element => ({width: element.videoWidth, height: element.videoHeight, duration: element.duration, currentTime: element.currentTime, readyState: element.readyState}));
      assert.equal(playback.width, 960); assert.equal(playback.height, 540);
      await player.evaluate(element => element.pause());
      const [download] = await Promise.all([page.waitForEvent('download'), completed.getByRole('button', {name: 'Скачать видео', exact: true}).click()]);
      const file = await download.path();
      const sha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      assert.equal(sha256, '0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451');
      const after = await counters();
      assert.equal(after.submits, before.submits + 1);
      const savedUrl = page.url();
      await page.reload({waitUntil: 'domcontentloaded'});
      await page.locator(`[data-video-job-id="${jobId}"][data-video-job-state="completed"]`).waitFor();
      assert.equal((await counters()).submits, after.submits);
      assert.equal(await page.locator(mode === 'clip' ? '#video-prompt' : '#video-script').inputValue(), edited);
      await page.screenshot({path: path.join(out, `browser-${mode}.png`), fullPage: true});
      results.push({mode, jobId, mediaClientEntry: true, clientNavigationWithoutReload: true, backForwardNavigation: true, sourceFactsPreserved: true, savedEditsReopened: true, oneSubmit: true, noSubmitOnReload: true, playback, downloadSha256: sha256});
      if (mode === 'presenter') {
        await page.setViewportSize({width: 390, height: 844});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({path: path.join(out, 'browser-mobile.png'), fullPage: true});
        await page.setViewportSize({width: 1440, height: 1000});
        await page.goto(api + '/__fixture/signin/reader');
        await page.goto(savedUrl, {waitUntil: 'domcontentloaded'});
        await page.locator(`[data-video-job-id="${jobId}"] video`).waitFor();
        assert.equal(await page.locator('#video-mode').isDisabled(), true);
        const denied = await context.request.post(`${api}/media/video-jobs`, {data: {}});
        assert.equal(denied.status(), 403);
        await page.goto(api + '/__fixture/signin/foreign');
        const foreign = await context.request.get(`${api}/media/video-jobs/${jobId}`);
        assert.equal(foreign.status(), 404);
      }
    }
    assert.deepEqual(failures, []);
    const receipt = {status: 'PASS', boundary: 'actual Next /media UI + authenticated local Nest MediaController/PoliciesGuard + real Prisma/services/storage; synthetic identity and paid/Temporal transport; valid CC0 fixture is not provider quality', results, readerLaunch: 403, foreignJob: 404, mobileOverflow: false, pageErrors: failures};
    fs.writeFileSync(path.join(out, 'browser-acceptance.actual.json'), JSON.stringify(receipt, null, 2));
    process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
  } catch (error) {
    await page.screenshot({path: path.join(out, 'browser-failure.png'), fullPage: true}).catch(() => {});
    fs.writeFileSync(path.join(out, 'browser-failure.txt'), await page.locator('body').innerText().catch(() => 'unavailable'));
    throw error;
  } finally {await browser.close();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});
