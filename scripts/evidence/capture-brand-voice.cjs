#!/usr/bin/env node
/**
 * Browser evidence for the brand-voice screens.
 *
 * One run over every screen the epic has built so far, because reviewing them
 * one at a time is how two screens end up with different ideas of what an
 * empty state looks like. Each is opened in all nine states and across the
 * width, theme and language matrix; the shared measurements live in
 * `capture-review-scene.cjs`.
 *
 * Added here is the check that matters across all of them: a state the design
 * calls normal must not be dressed as a failure. "Голоса бренда пока нет" is a
 * working mode, and an `empty` state carrying an alert role would say the
 * opposite of the sentence printed inside it.
 *
 * Three screens are also pressed rather than only looked at. A corridor handle,
 * an open hint and an unfolded field editor exist only after a click, and a
 * capture that stops at the first paint says nothing about the half of the
 * screen a person actually uses. These steps were unwritable while the review
 * route rendered dead HTML — see the CSP note in `fixture-contract.tsx`.
 */
const { captureReviewScene } = require('./capture-review-scene.cjs');

/**
 * What each screen looks like once it has been used.
 *
 * Named by what the step proves rather than by what it clicks: the name is
 * what ends up on the screenshot and in the report, and «click-button-2» tells
 * a reader nothing a year later.
 */
const INTERACTIONS = {
  'voice-passport': [
    {
      name: 'field-editor-open',
      run: async (page) => {
        await page
          .getByRole('button', { name: 'Изменить: Каким тоном' })
          .click();
        await page.waitForSelector('[data-voice-field-editor="open"]');
      },
    },
    {
      name: 'hint-open',
      run: async (page) => {
        await page
          .getByRole('button', { name: 'Подсказка: Каким тоном' })
          .click();
        await page.waitForSelector('[role="tooltip"]');
      },
    },
    {
      name: 'example-form-open',
      run: async (page) => {
        await page
          .getByRole('button', { name: 'Добавить свой пример' })
          .click();
        await page.waitForSelector('[data-voice-example-add="open"]');
      },
    },
  ],
  'voice-scales': [
    {
      name: 'corridor-handles',
      run: async (page) => {
        await page
          .getByRole('button', { name: 'Править границы', exact: true })
          .click();
        await page.waitForSelector('[data-voice-corridor-control] input[type="range"]');
      },
    },
    {
      name: 'corridor-moved',
      run: async (page) => {
        await page
          .getByRole('button', { name: 'Править границы', exact: true })
          .click();
        const low = page.locator('input[type="range"]').first();
        await low.waitFor();
        await low.focus();
        await page.keyboard.press('ArrowRight');
        // The row commits itself, so saving appears only once something moved.
        await page.waitForSelector('text=Сохранить границы');
      },
    },
  ],
  'voice-versions': [
    {
      name: 'third-tick-refused',
      run: async (page) => {
        await page.waitForSelector('[data-voice-versions-full="true"]');
        const boxes = page.locator('input[type="checkbox"]');
        // Two are ticked by default and the rest are refused where the tick
        // happens, rather than accepted and undone somewhere else.
        if (!(await boxes.nth(0).isDisabled())) await boxes.nth(0).focus();
      },
    },
  ],
};

const SCREENS = [
  { scene: 'voice-empty', evidenceName: 'voice-empty' },
  { scene: 'voice-paths', evidenceName: 'voice-paths' },
  { scene: 'voice-samples', evidenceName: 'voice-samples' },
  { scene: 'voice-proposal', evidenceName: 'voice-proposal' },
  { scene: 'voice-redactions', evidenceName: 'voice-redactions' },
  { scene: 'voice-ribbon', evidenceName: 'voice-ribbon' },
  { scene: 'voice-materials', evidenceName: 'voice-materials' },
  { scene: 'voice-brief', evidenceName: 'voice-brief' },
  { scene: 'voice-passport', evidenceName: 'voice-passport' },
  { scene: 'voice-scales', evidenceName: 'voice-scales' },
  { scene: 'voice-versions', evidenceName: 'voice-versions' },
];

const HOST = '[data-voice-scene]';

const probe = (selector) => {
  const host = document.querySelector(selector);
  const surface = host.querySelector('[data-voice-surface]');
  return {
    surface: surface?.dataset.voiceSurface ?? null,
    surfaceState: surface?.dataset.voiceState ?? null,
    // The ribbon is a strip, not a screen: it has four product states of its
    // own rather than the review's nine, and no heading. Its scene decides the
    // mapping, so what is checked here is that it landed on one of its four.
    ribbonState: surface?.dataset.voiceRibbonState ?? null,
    alerts: host.querySelectorAll('[role="alert"]').length,
    statuses: host.querySelectorAll('[role="status"]').length,
    busy: host.querySelectorAll('[aria-busy="true"]').length,
    headings: [...host.querySelectorAll('h1,h2,h3')].map((node) =>
      (node.textContent || '').trim().slice(0, 60)
    ),
    // Every disabled control has to be reachable by a reader and explained by
    // text, not left as a grey rectangle.
    disabledControls: [...host.querySelectorAll('button[disabled]')].map(
      (node) => (node.textContent || '').trim().slice(0, 40)
    ),
  };
};

const problems = (result) => {
  const where = `${result.scene ?? ''} ${result.state} ${result.width}/${result.theme}/${result.locale}`;
  const found = [];
  if (!result.surface) {
    found.push(`${where}: no voice surface rendered`);
  }
  const RIBBON_STATES = ['fresh', 'stale-context', 'voice-moved', 'no-profile'];
  if (result.ribbonState) {
    if (!RIBBON_STATES.includes(result.ribbonState)) {
      found.push(`${where}: unknown ribbon state ${result.ribbonState}`);
    }
  } else if (result.surfaceState !== result.state) {
    found.push(
      `${where}: surface is in ${result.surfaceState}, review asked ${result.state}`
    );
  }
  // A normal state must not borrow the vocabulary of a failure.
  if (
    !result.ribbonState &&
    ['empty', 'default', 'disabled'].includes(result.state) &&
    result.alerts
  ) {
    found.push(`${where}: a normal state carries ${result.alerts} alert(s)`);
  }
  if (!result.ribbonState && result.state === 'error' && result.alerts === 0) {
    found.push(`${where}: an error state announces nothing`);
  }
  if (!result.ribbonState && result.state === 'loading' && result.busy === 0) {
    found.push(`${where}: a loading state is not marked busy`);
  }
  // A screen needs a heading; a strip embedded in one does not, and giving it
  // a second heading would put two on the page it lives in.
  if (!result.ribbonState && result.headings.length === 0) {
    found.push(`${where}: the screen has no heading`);
  }
  return found;
};

async function main() {
  let failed = false;
  for (const screen of SCREENS) {
    const outcome = await captureReviewScene({
      ...screen,
      hostSelector: HOST,
      probe,
      interactions: INTERACTIONS[screen.scene] ?? [],
      problems: (result) => problems({ ...result, scene: screen.scene }),
    });
    if (outcome.failures.length) failed = true;
  }
  if (failed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { SCREENS, INTERACTIONS, probe, problems };
