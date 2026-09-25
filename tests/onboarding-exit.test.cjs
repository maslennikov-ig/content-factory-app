'use strict';

/**
 * 2q28.6 — «С чего начать», variant B «Один шаг на экране», rendered.
 *
 * The strip of five pressable segments, one step in the middle with its own
 * action and «Показать на экране», and a footer with «Назад», «Сделаю позже»
 * and «Дальше: …» that opens only once the step is done.
 */

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

let language = 'ru';
let state;
const { OnboardingWalkthrough } = loadWithMocks(
  'apps/frontend/src/components/onboarding/onboarding.walkthrough.tsx',
  {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language }),
    },
    './use-onboarding-progress': { useOnboardingProgress: () => state },
    './onboarding.telegram': {
      OnboardingTelegramGuide: ({ actionLabel }) =>
        React.createElement('div', { 'data-telegram-guide': actionLabel }),
    },
  }
);

const EMPTY = {
  channels: 0,
  voiceSamples: 0,
  avatars: 0,
  facts: 0,
  pieceFacts: 0,
  pieces: 0,
  drafts: 0,
  scheduled: 0,
  adaptations: 0,
  planModes: 0,
  latestPieceId: null,
};

beforeEach(() => {
  language = 'ru';
  state = { answered: true, loading: false, error: null, progress: { ...EMPTY } };
});

function draw(props = {}) {
  return new JSDOM(
    renderToStaticMarkup(React.createElement(OnboardingWalkthrough, props))
  ).window.document;
}

const nav = (doc, name) => doc.querySelector(`[data-onboarding-nav="${name}"]`);

test('the strip has five pressable segments in menu order', () => {
  const doc = draw();
  const segments = [...doc.querySelectorAll('nav [data-onboarding-step]')];
  expect(segments.map((s) => s.getAttribute('data-onboarding-step'))).toEqual([
    'avatar',
    'channel',
    'piece',
    'adaptation',
    'plan',
  ]);
  for (const segment of segments) {
    expect(segment.tagName).toBe('BUTTON');
    expect(segment.hasAttribute('disabled')).toBe(false);
  }
  expect(doc.querySelector('[aria-current="step"]').getAttribute('data-onboarding-step')).toBe('avatar');
});

test('an open step: its own action, «Показать на экране», «Сделаю позже» and a closed «Дальше»', () => {
  const doc = draw();
  expect(doc.body.textContent).toContain('Шаг 1 из 5');
  const action = doc.querySelector('[data-onboarding-action="avatar"]');
  expect(action.getAttribute('href')).toBe('/content?tab=avatars');
  expect(doc.querySelector('[data-onboarding-tour="avatar"]').getAttribute('href')).toBe(
    '/content?tab=avatars&tour=avatar'
  );
  expect(doc.querySelector('[data-onboarding-tour="avatar"]').textContent).toBe('Показать на экране');
  expect(nav(doc, 'later').textContent).toContain('Сделаю позже');
  const next = nav(doc, 'next');
  expect(next.textContent).toContain('Дальше: Канал');
  expect(next.hasAttribute('disabled')).toBe(true);
  // The first step has nowhere to go back to.
  expect(nav(doc, 'back')).toBeNull();
});

test('a done step opens «Дальше» and drops «Сделаю позже»', () => {
  state.progress.avatars = 1;
  state.progress.channels = 1;
  // The workspace answered with avatar and channel done: the page lands on
  // the first open step, the piece.
  const doc = draw();
  expect(doc.querySelector('[aria-current="step"]').getAttribute('data-onboarding-step')).toBe('piece');
  const doneSegments = [...doc.querySelectorAll('[data-onboarding-step-state="done"]')].map((s) =>
    s.getAttribute('data-onboarding-step')
  );
  expect(doneSegments).toEqual(['avatar', 'channel']);
  expect(nav(doc, 'back').textContent).toContain('Назад');
});

test('the channel step draws the Telegram guide in place', () => {
  state.progress.avatars = 1;
  const doc = draw();
  expect(doc.querySelector('[data-telegram-guide]').getAttribute('data-telegram-guide')).toBe(
    'Подключить Telegram'
  );
  expect(doc.querySelector('[data-onboarding-tour="channel"]').getAttribute('href')).toBe(
    '/channels?tour=channel'
  );
});

test('the piece step offers the claim as an optional extra', () => {
  state.progress.avatars = 1;
  state.progress.channels = 1;
  const doc = draw();
  const optional = doc.querySelector('[data-onboarding-optional="fact"]');
  expect(optional.textContent).toContain('Необязательно');
  expect(optional.getAttribute('data-onboarding-optional-state')).toBe('todo');
});

test('the adaptation step opens the latest piece and its tour', () => {
  Object.assign(state.progress, { avatars: 1, channels: 1, pieces: 1, latestPieceId: 'p-9' });
  const doc = draw();
  expect(doc.querySelector('[aria-current="step"]').getAttribute('data-onboarding-step')).toBe('adaptation');
  const action = doc.querySelector('[data-onboarding-action="adaptation"]');
  expect(action.getAttribute('href')).toBe('/content/pieces/p-9');
  expect(action.textContent).toBe('Открыть последнюю заготовку');
  expect(doc.querySelector('[data-onboarding-tour="adaptation"]').getAttribute('href')).toBe(
    '/content/pieces/p-9?tour=adaptation'
  );
});

test('all five done without the claim is «Всё пройдено»', () => {
  Object.assign(state.progress, {
    avatars: 1,
    channels: 1,
    pieces: 1,
    adaptations: 1,
    planModes: 1,
  });
  const doc = draw();
  expect(doc.body.textContent).toContain('Всё пройдено');
  expect(doc.querySelector('[data-onboarding-progress]').getAttribute('data-onboarding-progress')).toBe('5/5');
  expect(doc.querySelector('[data-onboarding-optional="fact"]')).not.toBeNull();
});

test('unknown progress does not pretend to know the step', () => {
  state = { answered: false, loading: true, error: null, progress: { ...EMPTY } };
  const doc = draw();
  expect(doc.querySelector('[data-onboarding-progress]').getAttribute('data-onboarding-progress')).toBe('pending');
  expect(nav(doc, 'next')).toBeNull();
  expect(doc.querySelector('[aria-current="step"]')).toBeNull();
});

test('English names the same steps', () => {
  language = 'en';
  const doc = draw();
  expect(doc.body.textContent).toContain('Step 1 of 5');
  expect(nav(doc, 'next').textContent).toContain('Next: Channel');
  expect(nav(doc, 'later').textContent).toContain('Later');
});

test('standalone page relies on the upper title; embedded settings keeps its own section heading', () => {
  const standalone = draw();
  expect(standalone.querySelector('h1')).toBeNull();
  expect(standalone.querySelector('section').getAttribute('aria-label')).toBe('С чего начать');
  const embedded = draw({ embedded: true });
  expect(embedded.querySelector('#onboarding-title').tagName).toBe('H2');
  expect(embedded.querySelector('#onboarding-title').textContent).toBe('С чего начать');
  // The step heading steps down under the section's own h2.
  expect(embedded.querySelector('h3')).not.toBeNull();
});
