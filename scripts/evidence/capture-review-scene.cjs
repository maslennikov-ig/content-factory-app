#!/usr/bin/env node
/**
 * Browser evidence for one interface-review scene.
 *
 * Every scene needs the same things measured — nine states, four widths, two
 * themes, two languages, 200% zoom, no horizontal overflow, no untranslated
 * key, touch targets at 44px — and differs only in which element it is looking
 * at and what else that element has to be true about. This holds the first
 * part; a caller supplies the second.
 *
 * The review route has no network of its own: every value on the page is a
 * literal. Chrome comes from `CHROME_PATH`; no browser is downloaded.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const REVIEW_STATES = [
  'loading',
  'empty',
  'default',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
];
const WIDTHS = [390, 768, 1024, 1440];
const THEMES = ['dark', 'light'];
const LOCALES = ['ru', 'en'];

/**
 * Touch targets are 44px, and only where a finger is the pointer. Above the
 * `sm` breakpoint the system's control height is 40px and the production
 * surfaces already say so — `content-intelligence.view.tsx` sets 44px and then
 * `sm:` clears it. Demanding 44 everywhere would fail the house rule rather
 * than the screen.
 */
const MIN_TARGET = 44;
/**
 * The floor for a pointer, which is the design system's dense control.
 *
 * 40px is the system's rhythm and not an accessibility figure; enforcing it as
 * one failed `density="dense"` — a variant `DESIGN.md` states outright for
 * tables and filter strips — every time the harness looked at one. 32px is the
 * smallest height the system sanctions, so a control shorter than that is a
 * real finding and a legitimately dense one is not. Whether a given control
 * *should* have been dense is a question for `tests/design.guard.test.cjs`,
 * which reads the source; this measures the rendered box.
 */
const POINTER_TARGET = 32;
/**
 * Width is a separate question from height and has a different answer. The
 * system states a control *height* and lets width follow the label — a button
 * reading "3%" is legitimately narrow. WCAG 2.5.8 puts the floor for a pointer
 * target at 24px, which is the rule that actually applies there.
 */
const POINTER_MIN_WIDTH = 24;
const TOUCH_BELOW = 640;
const targetFor = (width) => (width < TOUCH_BELOW ? MIN_TARGET : POINTER_TARGET);
const widthTargetFor = (width) =>
  width < TOUCH_BELOW ? MIN_TARGET : POINTER_MIN_WIDTH;
/**
 * WCAG 1.4.10 asks for no horizontal scrolling down to a 320px-wide viewport.
 * Halving 390 gives 195, which is below any published floor, so the zoom pass
 * clamps there rather than inventing a stricter rule than the one it cites.
 */
const REFLOW_FLOOR = 320;

const routeFor = (scene) => `/interface-review/content-intelligence/${scene}`;

async function open(browser, base, scene, { width, theme, locale, state }) {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    colorScheme: theme,
    reducedMotion: 'reduce',
    locale: locale === 'ru' ? 'ru-RU' : 'en-US',
  });
  await context.addCookies([
    { name: 'i18next', value: locale, url: new URL(base).origin },
  ]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  const query = new URLSearchParams({
    state,
    theme,
    locale,
    viewport: String(width),
  });
  const response = await page.goto(
    `${new URL(routeFor(scene), base).href}?${query}`,
    { waitUntil: 'load', timeout: 30_000 }
  );
  if (!response || !response.ok()) {
    throw new Error(
      `${routeFor(scene)} returned ${response?.status() || 'nothing'}`
    );
  }
  return { context, page, pageErrors };
}

/**
 * @param scene         route segment under `interface-review/content-intelligence`
 * @param evidenceName  directory under the stage's evidence folder
 * @param hostSelector  the element this scene is about
 * @param matrixState   the state opened across the width/theme/locale matrix
 * @param probe         optional in-page function returning extra fields
 * @param problems      optional (result) => string[] of scene-specific failures
 * @param interactions  optional steps that press the screen and record what
 *                      appeared. A state reachable only by a click — a handle
 *                      on a bar, an open hint, an unfolded editor — is part of
 *                      the screen, and a review that stops at the first paint
 *                      reviews half of it.
 */
async function captureReviewScene({
  scene,
  evidenceName,
  hostSelector,
  matrixState = 'long-content',
  probe,
  problems = () => [],
  interactions = [],
  baseUrl = process.env.REVIEW_BASE_URL || 'http://localhost:4200',
  chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome',
  stage = 'content-factory-next-36r',
}) {
  const base = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost'].includes(base.hostname)) {
    throw new Error(`REVIEW_BASE_URL must be local: ${baseUrl}`);
  }
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome not found: ${chromePath}`);
  }

  const evidenceDir = path.resolve(
    __dirname,
    `../../.codex/stages/${stage}/evidence/${evidenceName}`
  );
  // Only what this script produces. The README beside it is written by hand
  // and explains what the numbers mean; wiping the directory wholesale threw
  // it away on every rerun.
  fs.rmSync(path.join(evidenceDir, 'screenshots'), {
    recursive: true,
    force: true,
  });
  fs.rmSync(path.join(evidenceDir, 'report.json'), { force: true });
  fs.mkdirSync(path.join(evidenceDir, 'screenshots'), { recursive: true });

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--no-default-browser-check',
    ],
  });
  const results = [];

  const inspect = async (page, width) => {
    const shared = await page.evaluate(
      ([selector, min, minWidth]) => {
        const host = document.querySelector(selector);
        if (!host) throw new Error(`no element matched ${selector}`);
        const frame = host.closest('[data-interface-review-theme]');
        const root = document.documentElement;
        return {
          /**
           * Whether React took the markup over, asked of the DOM.
           *
           * The route rendered dead HTML for as long as its CSP said
           * `connect-src 'none'`: Next opens a hot-reload socket before it
           * hydrates, and blocking that took hydration down with it. Nothing
           * failed loudly — the screens looked right and no button did
           * anything, so every state that only exists after an interaction was
           * unreviewable. A fiber key on a real node is the cheapest honest
           * answer to "is this page alive", and it is measured on every
           * capture so the route cannot go quiet again.
           */
          hydrated: [host, ...host.querySelectorAll('*')]
            .slice(0, 40)
            .some((element) =>
              Object.keys(element).some((key) => key.startsWith('__react'))
            ),
          renderedTheme: frame?.dataset.interfaceReviewTheme || 'missing',
          renderedLocale: frame?.dataset.interfaceReviewLocale || 'missing',
          renderedState: frame?.dataset.interfaceReviewState || 'missing',
          lang: root.lang,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)')
            .matches,
          text: host.innerText.replace(/\s+/g, ' ').trim(),
          documentOverflow:
            Math.max(root.scrollWidth, document.body.scrollWidth) -
            root.clientWidth,
          hostOverflow:
            Math.round(host.scrollWidth) - Math.round(host.clientWidth),
          rawKeys: host.innerText.match(/\b[a-z]+_[a-z_]{6,}\b/g) || [],
          interactive: [
            ...host.querySelectorAll(
              'a,button,input,select,[tabindex]:not([tabindex="-1"])'
            ),
          ]
            // A visually hidden control is not the target — its label is, and
            // the label is measured on its own. The 1×1 `sr-only` file input
            // behind «Загрузить файлы» is the pattern this skips; measuring it
            // would report the accessible plumbing as an unreachable button.
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 1 && box.height > 1;
            })
            .map((element) => {
            // The hit area, not the painted box. A checkbox inside a label is
            // tapped anywhere on that label — `CheckboxField` builds it that
            // way on purpose — so measuring the 20px square would fail a
            // control that is in fact 44px wherever a finger lands.
            const label = element.closest('label');
            const target =
              label && label.contains(element) ? label : element;
            const box = target.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              measured: target === element ? 'self' : 'label',
              label: (target.textContent || '').trim().slice(0, 40),
              width: Math.round(box.width),
              height: Math.round(box.height),
              target: min,
              widthTarget: minWidth,
              meetsTarget: box.width >= minWidth && box.height >= min,
            };
          }),
        };
      },
      [hostSelector, targetFor(width), widthTargetFor(width)]
    );
    const extra = probe ? await page.evaluate(probe, hostSelector) : {};
    return { ...shared, ...extra };
  };

  const shoot = (page, name) =>
    page
      .locator(hostSelector)
      .screenshot({
        path: path.join(evidenceDir, 'screenshots', `${name}.png`),
      });

  try {
    for (const state of REVIEW_STATES) {
      const item = { width: 1440, theme: 'dark', locale: 'ru', state };
      const { context, page, pageErrors } = await open(
        browser,
        baseUrl,
        scene,
        item
      );
      await page.waitForSelector(hostSelector);
      const measured = await inspect(page, item.width);
      await shoot(page, `state-${state}`);
      results.push({ pass: 'state', ...item, ...measured, pageErrors });
      await context.close();
    }

    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        for (const locale of LOCALES) {
          const item = { width, theme, locale, state: matrixState };
          const { context, page, pageErrors } = await open(
            browser,
            baseUrl,
            scene,
            item
          );
          await page.waitForSelector(hostSelector);
          const measured = await inspect(page, width);
          const name = `matrix-${width}-${theme}-${locale}`;
          await shoot(page, name);

          await page.keyboard.press('Tab');
          const focusReached = await page.evaluate(() => {
            const active = document.activeElement;
            return active
              ? `${active.tagName.toLowerCase()}:${(active.textContent || '')
                  .trim()
                  .slice(0, 24)}`
              : 'none';
          });

          const zoomWidth = Math.max(Math.round(width / 2), REFLOW_FLOOR);
          await page.setViewportSize({
            width: zoomWidth,
            height: width === 390 ? 844 : 900,
          });
          await page.waitForTimeout(100);
          // Zoom narrows the layout viewport, so the touch rule applies again.
          const zoomed = await inspect(page, zoomWidth);
          await shoot(page, `${name}-zoom200`);

          results.push({
            pass: 'matrix',
            ...item,
            ...measured,
            focusReached,
            zoom: {
              width: zoomWidth,
              documentOverflow: zoomed.documentOverflow,
              hostOverflow: zoomed.hostOverflow,
            },
            pageErrors,
          });
          await context.close();
        }
      }
    }
    for (const step of interactions) {
      const item = {
        width: step.width ?? 1440,
        theme: step.theme ?? 'dark',
        locale: step.locale ?? 'ru',
        state: step.state ?? 'default',
      };
      const { context, page, pageErrors } = await open(
        browser,
        baseUrl,
        scene,
        item
      );
      await page.waitForSelector(hostSelector);
      // Hydration is what an interaction step depends on, so it is checked
      // before the step rather than reported after it fails for a reason the
      // caller would have to guess.
      const alive = await page.evaluate((selector) => {
        const host = document.querySelector(selector);
        if (!host) return false;
        // Any node React rendered carries a fiber key. Sampling controls alone
        // called an empty state dead, which is a screen with nothing to press
        // rather than a screen nobody can press.
        return [host, ...host.querySelectorAll('*')]
          .slice(0, 40)
          .some((element) =>
            Object.keys(element).some((key) => key.startsWith('__react'))
          );
      }, hostSelector);
      const found = [];
      if (!alive) {
        found.push(`interaction ${step.name}: the scene never hydrated`);
      } else {
        try {
          await step.run(page);
        } catch (error) {
          found.push(`interaction ${step.name}: ${error.message}`);
        }
      }
      const measured = alive ? await inspect(page, item.width) : {};
      await shoot(page, `interaction-${step.name}`);
      results.push({
        pass: 'interaction',
        name: step.name,
        ...item,
        ...measured,
        hydrated: alive,
        interactionProblems: found,
        pageErrors,
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const failures = results.flatMap((result) => {
    const where = `${result.pass} ${result.state} ${result.width}/${result.theme}/${result.locale}`;
    const found = [];
    if (result.pageErrors.length) {
      found.push(`${where}: page error ${result.pageErrors[0]}`);
    }
    for (const [field, asked] of [
      ['renderedState', result.state],
      ['renderedTheme', result.theme],
      ['renderedLocale', result.locale],
    ]) {
      if (result[field] !== asked) {
        found.push(`${where}: ${field} is ${result[field]}, asked ${asked}`);
      }
    }
    if (result.hydrated === false) {
      found.push(
        `${where}: the scene rendered but never hydrated — nothing on it can be pressed`
      );
    }
    for (const problem of result.interactionProblems || []) found.push(problem);
    if (!result.text) found.push(`${where}: the surface rendered no text`);
    if (result.rawKeys.length) {
      found.push(`${where}: untranslated key ${result.rawKeys[0]}`);
    }
    if (result.hostOverflow > 0) {
      found.push(`${where}: ${result.hostOverflow}px overflow inside`);
    }
    if (result.documentOverflow > 0) {
      found.push(`${where}: ${result.documentOverflow}px page overflow`);
    }
    if (result.zoom && result.zoom.documentOverflow > 0) {
      found.push(
        `${where}: ${result.zoom.documentOverflow}px overflow at ${result.zoom.width}px CSS`
      );
    }
    for (const element of result.interactive || []) {
      if (!element.meetsTarget) {
        found.push(
          `${where}: ${element.tag} "${element.label}" (${element.measured}) is ${element.width}×${element.height}, below ${element.widthTarget}×${element.target}px`
        );
      }
    }
    return [...found, ...problems(result)];
  });

  fs.writeFileSync(
    path.join(evidenceDir, 'report.json'),
    `${JSON.stringify(
      {
        route: routeFor(scene),
        touchTarget: MIN_TARGET,
        pointerTarget: POINTER_TARGET,
        pointerMinWidth: POINTER_MIN_WIDTH,
        touchBelow: TOUCH_BELOW,
        reflowFloor: REFLOW_FLOOR,
        results,
        failures,
      },
      null,
      2
    )}\n`
  );

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
    return { evidenceDir, results, failures };
  }
  console.log(
    `${evidenceName} evidence OK: ${results.length} captures in ${evidenceDir}`
  );
  return { evidenceDir, results, failures };
}

module.exports = {
  captureReviewScene,
  REVIEW_STATES,
  WIDTHS,
  THEMES,
  LOCALES,
  MIN_TARGET,
  POINTER_TARGET,
  TOUCH_BELOW,
  REFLOW_FLOOR,
};
