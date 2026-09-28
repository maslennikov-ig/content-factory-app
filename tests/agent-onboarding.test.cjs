'use strict';

/**
 * `content-factory-next-kcxz.21` — onboarding through the chat (spec §6.1,
 * §5.6).
 *
 * One definition of the five steps and their done-rules
 * (`onboarding.steps.ts`) for «С чего начать», the chat's starters and the
 * agent's snapshot; «Сделать в чате» on «С чего начать» opens a new
 * conversation with the step's starter. That a step done in the chat is
 * ticked on the screens is proved by the recorded scenario A1
 * (`fixtures/agent-scenarios/onboarding-zero-to-plan.scenario.cjs`), which
 * counts with the real `OnboardingRepository`.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const load = require('./helpers/load-tsx.cjs').loadTypeScriptModule;

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const starters = load('apps/frontend/src/components/agents/agent.starters.ts');
const steps = load(
  'libraries/nestjs-libraries/src/database/prisma/onboarding/onboarding.steps.ts'
);
const adapter = load('apps/frontend/src/components/onboarding/onboarding.adapter.ts');
const { agentWordsFor } = load('apps/frontend/src/components/agents/agent.copy.ts');
const { onboardingCopy } = load('apps/frontend/src/components/onboarding/onboarding.copy.ts');

const NONE = {
  channels: 0,
  avatars: 0,
  facts: 0,
  pieceFacts: 0,
  pieces: 0,
  drafts: 0,
  scheduled: 0,
  adaptations: 0,
  planModes: 0,
};
const ALL = { ...NONE, avatars: 1, channels: 1, pieces: 1, adaptations: 1, planModes: 1 };

describe('one definition of the five steps', () => {
  test('the walkthrough’s adapter re-exports the shared rules instead of keeping its own', () => {
    for (const name of [
      'ONBOARDING_STEP_KEYS',
      'stepIsDone',
      'doneCount',
      'currentStep',
      'allStepsDone',
      'factIsDone',
      'stepAllowed',
      'stepOffered',
      'nextStepFor',
      'channelWaitsForAdmin',
    ]) {
      expect(adapter[name]).toBe(steps[name]);
    }
    const own = source('apps/frontend/src/components/onboarding/onboarding.adapter.ts');
    expect(own).not.toMatch(/export function stepIsDone|export const ONBOARDING_TOUR_STEPS/);
  });

  test('the chat keeps no step list of its own', () => {
    const conversation = source('apps/frontend/src/components/agents/agent.conversation.tsx');
    expect(conversation).not.toMatch(/STARTER_ORDER|'avatar',\s*'channel'/);
    expect(conversation).toContain('startersFor(');
    const snapshot = source('libraries/nestjs-libraries/src/chat/capabilities/catalogue/overview.capabilities.ts');
    expect(snapshot).toContain("database/prisma/onboarding/onboarding.steps'");
  });
});

describe('the starters of an empty thread follow the workspace', () => {
  test('a fresh workspace: the steps in menu order for an administrator, none that needs a channel yet', () => {
    // An adaptation or a reserve with no channel is a dead end (review W3-21 P3-3).
    expect(starters.startersFor(NONE, 'ADMIN')).toEqual(['avatar', 'channel', 'piece']);
    // Nor an adaptation with no piece yet (W3 walk P3-L): the piece comes first.
    expect(starters.startersFor({ ...NONE, channels: 1 }, 'ADMIN')).toEqual(['avatar', 'piece', 'plan']);
    expect(starters.startersFor({ ...NONE, channels: 1, pieces: 1 }, 'ADMIN')).toEqual(['avatar', 'adaptation', 'plan']);
  });

  test('done steps drop out; the first open one leads', () => {
    expect(starters.startersFor({ ...NONE, avatars: 1, channels: 1 }, 'ADMIN')).toEqual(['piece', 'plan']);
    // A reserve is a draft post: it closes the piece and the adaptation, not
    // the plan — the plan closes on a chosen plan mode or a scheduled post.
    expect(starters.startersFor({ ...NONE, avatars: 1, channels: 1, drafts: 1 }, 'ADMIN')).toEqual(['plan']);
    expect(starters.startersFor({ ...NONE, avatars: 1, channels: 1, drafts: 1, planModes: 1 }, 'ADMIN')).toEqual([
      'piece',
      'week',
    ]);
  });

  test('all five done: the everyday two', () => {
    expect(starters.startersFor(ALL, 'ADMIN')).toEqual(['piece', 'week']);
  });

  test('only what the role can run (kcxz.31, D14)', () => {
    expect(starters.startersFor(NONE, 'EDITOR')).toEqual(['avatar', 'piece']);
    expect(starters.startersFor({ ...NONE, channels: 1 }, 'EDITOR')).toEqual(['avatar', 'piece', 'plan']);
    // The channel is an administrator's: an editor with only it open gets the everyday two.
    expect(starters.startersFor({ ...ALL, channels: 0 }, 'EDITOR')).toEqual(['piece', 'week']);
    expect(starters.startersFor(NONE, 'USER')).toEqual(['week']);
  });

  test('the snapshot’s next step and the admin note follow the role (review W3-21 P3-2)', () => {
    expect(steps.nextStepFor({ ...NONE, avatars: 1 }, 'ADMIN')).toBe('channel');
    // An editor is never pointed to «Подключим Telegram».
    expect(steps.nextStepFor({ ...NONE, avatars: 1 }, 'EDITOR')).toBe('piece');
    expect(steps.nextStepFor({ ...NONE, avatars: 1, pieces: 1 }, 'EDITOR')).toBeNull();
    expect(steps.nextStepFor(NONE, 'USER')).toBeNull();
    expect(steps.channelWaitsForAdmin(NONE, 'EDITOR')).toBe(true);
    expect(steps.channelWaitsForAdmin(NONE, 'USER')).toBe(true);
    expect(steps.channelWaitsForAdmin(NONE, 'ADMIN')).toBe(false);
    expect(steps.channelWaitsForAdmin({ ...NONE, channels: 1 }, 'EDITOR')).toBe(false);
    const snapshot = source('libraries/nestjs-libraries/src/chat/capabilities/catalogue/overview.capabilities.ts');
    expect(snapshot).toContain('next: nextStepFor(progress, ctx.role)');
    expect(snapshot).toContain('channelByAdmin: channelWaitsForAdmin(progress, ctx.role)');
  });

  test('every starter has words in both languages; the plan step is not the week’s read', () => {
    for (const language of ['ru', 'en']) {
      const words = agentWordsFor(language).start.starters;
      for (const key of [...steps.ONBOARDING_STEP_KEYS, 'week']) expect(words[key]).toEqual(expect.any(String));
      expect(words.plan).not.toBe(words.week);
      expect(agentWordsFor(language).start.channelByAdmin).toEqual(expect.any(String));
    }
  });
});

describe('«Сделать в чате» on «С чего начать»', () => {
  test('the address opens a new conversation with the step', () => {
    expect(starters.agentStartHref('avatar')).toBe('/agents/new?start=avatar');
  });

  test('the agent screen fills the composer, never sends (rendered in agent-screen.start-draft)', () => {
    const screen = source('apps/frontend/src/components/agents/agent.screen.tsx');
    expect(screen).toContain('startDraftStep(requested');
    expect(screen).not.toMatch(/setStarter\(words\.start\.starters\[step\]\)\s*;?\s*\n\s*\/\/ Once/);
    expect(steps.isOnboardingStepKey('plan')).toBe(true);
    expect(steps.isOnboardingStepKey('week')).toBe(false);
    expect(steps.isOnboardingStepKey('../x')).toBe(false);
  });

  let role = 'ADMIN';
  let state;
  const { OnboardingWalkthrough } = loadWithMocks(
    'apps/frontend/src/components/onboarding/onboarding.walkthrough.tsx',
    {
      'next/link': ({ children, ...props }) => React.createElement('a', props, children),
      '@contentfactory/react/helpers/variable.context': { useVariables: () => ({ language: 'ru' }) },
      './use-onboarding-progress': { useOnboardingProgress: () => state },
      '../layout/user.context': { useUser: () => ({ role }) },
      './onboarding.telegram': { OnboardingTelegramGuide: () => React.createElement('div') },
    }
  );
  const draw = () =>
    new JSDOM(renderToStaticMarkup(React.createElement(OnboardingWalkthrough))).window.document;
  const chatLink = (doc) => doc.querySelector('[data-onboarding-chat]');

  beforeEach(() => {
    role = 'ADMIN';
    state = { answered: true, loading: false, error: null, progress: { ...NONE, voiceSamples: 0, latestPieceId: null } };
  });

  test('an open step offers it, with the chat’s own words', () => {
    const link = chatLink(draw());
    expect(link.getAttribute('data-onboarding-chat')).toBe('avatar');
    expect(link.getAttribute('href')).toBe('/agents/new?start=avatar');
    expect(link.textContent).toBe(onboardingCopy.ru.doInChat);
    expect(agentWordsFor('ru').panel.doInChat).toBe(onboardingCopy.ru.doInChat);
  });

  test('the step on the screen is the first open one', () => {
    state.progress = { ...state.progress, avatars: 1 };
    expect(chatLink(draw()).getAttribute('href')).toBe('/agents/new?start=channel');
  });

  test('not for a step the role cannot run', () => {
    role = 'EDITOR';
    state.progress = { ...state.progress, avatars: 1 };
    // The channel step is on the screen; connecting is an administrator's.
    expect(chatLink(draw())).toBeNull();
  });
});
