'use strict';

/**
 * `content-factory-next-rrs9`: the walkthrough, and the one rule that makes it
 * one.
 *
 * What it replaces was four paragraphs about the calendar, the draft, the
 * preview and the schedule — the loop any scheduler has. The owner read it on
 * 01.09.2026 and said «оно очень странно выглядит, как будто бы у нас его и
 * нет», then pressed «Начать» and skipped it. Three things made it look
 * absent, and this file holds the fixes for all three:
 *
 *  - the step promised a video the rename had removed;
 *  - it described someone else's loop, never the voice, the facts or the
 *    evidence a draft has to stand on;
 *  - and there was no way back to it once skipped.
 *
 * The rule that carries the rest: **a step closes because the thing exists,
 * not because a person pressed «дальше»**. No local flag, no «I have read
 * this» checkbox, nothing the page can decide on its own. That is what makes
 * the ticks worth reading, and it is a single `stepIsDone` away from being
 * quietly replaced by a piece of component state that congratulates everyone.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const FILES = {
  adapter: 'apps/frontend/src/components/onboarding/onboarding.adapter.ts',
  copy: 'apps/frontend/src/components/onboarding/onboarding.copy.ts',
  screen: 'apps/frontend/src/components/onboarding/onboarding.walkthrough.tsx',
  page: 'apps/frontend/src/app/(app)/(site)/onboarding/page.tsx',
  controller: 'apps/backend/src/api/routes/onboarding.controller.ts',
  repository:
    'libraries/nestjs-libraries/src/database/prisma/onboarding/onboarding.repository.ts',
  modal: 'apps/frontend/src/components/onboarding/onboarding.modal.tsx',
  layout: 'apps/frontend/src/components/layout/layout.context.tsx',
};

const read = (key) => fs.readFileSync(path.join(root, FILES[key]), 'utf8');

test('every piece of the walkthrough exists', () => {
  for (const file of Object.values(FILES)) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  }
});

if (!Object.values(FILES).every((file) => fs.existsSync(path.join(root, file))))
  return;

const adapter = require('./helpers/load-tsx.cjs').loadTypeScriptModule(
  FILES.adapter
);

describe('a step closes because the work is done', () => {
  test('nothing is done in an empty workspace', () => {
    const empty = adapter.EMPTY_PROGRESS;
    expect(adapter.doneCount(empty)).toBe(0);
    expect(adapter.currentStep(empty)).toBe('channel');
  });

  test('each count closes its own step and no other', () => {
    const only = (patch) => ({ ...adapter.EMPTY_PROGRESS, ...patch });

    expect(adapter.stepIsDone('channel', only({ channels: 1 }))).toBe(true);
    expect(adapter.stepIsDone('voice', only({ channels: 1 }))).toBe(false);

    expect(adapter.stepIsDone('voice', only({ voiceSamples: 2 }))).toBe(true);
    expect(adapter.stepIsDone('fact', only({ voiceSamples: 2 }))).toBe(false);

    expect(adapter.stepIsDone('fact', only({ facts: 1 }))).toBe(true);
    expect(adapter.stepIsDone('brief', only({ facts: 1 }))).toBe(false);

    // A draft is what a brief produces and the product keeps no separate
    // record of «a brief was filled in», so these two close together. Said
    // out loud in the adapter rather than left for someone to discover.
    expect(adapter.stepIsDone('brief', only({ drafts: 1 }))).toBe(true);
    expect(adapter.stepIsDone('preview', only({ drafts: 1 }))).toBe(true);
    expect(adapter.stepIsDone('schedule', only({ drafts: 1 }))).toBe(false);

    expect(adapter.stepIsDone('schedule', only({ scheduled: 1 }))).toBe(true);
  });

  test('a published post keeps the last step closed', () => {
    // `scheduled` counts QUEUE and PUBLISHED together in the repository. If it
    // counted only QUEUE the step would reopen the moment the post went out,
    // which is exactly backwards.
    const repository = read('repository');
    expect(repository).toMatch(/state:\s*\{\s*in:\s*\['QUEUE',\s*'PUBLISHED'\]/);
  });

  test('a retracted claim does not close the fact step', () => {
    // The three statuses the brief itself refuses. Counting them would close
    // the step and then let the brief refuse the id — the worst of both.
    const repository = read('repository');
    expect(repository).toContain("notIn: ['TOMBSTONED', 'RETRACTED', 'SUPERSEDED']");
  });

  test('a server that answered with less does not congratulate anyone', () => {
    expect(adapter.readProgress(undefined)).toEqual(adapter.EMPTY_PROGRESS);
    expect(adapter.readProgress({ channels: 'many' })).toEqual(
      adapter.EMPTY_PROGRESS
    );
    expect(adapter.readProgress({ channels: -3 }).channels).toBe(0);
  });

  test('the screen keeps no completion state of its own', () => {
    const screen = read('screen');
    // `useState` here would be a flag the page sets on itself, and a flag the
    // page sets on itself is a tick that means nothing.
    expect(screen).not.toMatch(/useState/);
    expect(screen).toContain('stepIsDone');
  });
});

describe('the walkthrough leads into the product', () => {
  test('every step names somewhere to go, and it is not this page', () => {
    for (const step of adapter.ONBOARDING_STEP_KEYS) {
      const href = adapter.ONBOARDING_STEP_HREF[step];
      expect(typeof href).toBe('string');
      expect(href.startsWith('/')).toBe(true);
      expect(href.startsWith('/onboarding')).toBe(false);
    }
  });

  test('the six steps are the product’s own loop, not the inherited one', () => {
    expect([...adapter.ONBOARDING_STEP_KEYS]).toEqual([
      'channel',
      'voice',
      'fact',
      'brief',
      'preview',
      'schedule',
    ]);
    // The two the old screen never mentioned, and the reason the owner could
    // finish it without learning what the product is for.
    const copy = read('copy');
    expect(copy).toContain('чьей манерой писать');
    expect(copy).toContain('на что будете опираться');
  });

  test('each step says what closes it', () => {
    const copy = read('copy');
    // Six in each language, plus the field on the type: the sentence that
    // tells a person what the product is waiting for. Without it a step is a
    // suggestion.
    expect((copy.match(/^\s+closes:/gm) || []).length).toBe(13);
  });
});

describe('it can be found again', () => {
  test('a fresh space lands on the page, not on a screen with a modal over it', () => {
    expect(read('layout')).toContain("window.location.href = '/onboarding'");
  });

  test('the modal hands over instead of teaching a loop of its own', () => {
    const modal = read('modal');
    expect(modal).toContain('href="/onboarding"');
    // The four paragraphs about calendar/draft/preview/schedule are gone.
    expect(modal).not.toContain('onboarding_step_plan');
    expect(modal).not.toContain('watch_tutorial_title');
    // And the step no longer promises a video.
    expect(modal).not.toMatch(/t\('watch_tutorial',/);
  });
});
