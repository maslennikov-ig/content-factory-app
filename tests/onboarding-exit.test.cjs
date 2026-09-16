'use strict';

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
  }
);

beforeEach(() => {
  language = 'ru';
  state = {
    answered: true,
    loading: false,
    error: null,
    progress: { channels: 1, voiceSamples: 1, facts: 1, pieces: 0, drafts: 0, scheduled: 0 },
  };
});

function draw(props = {}) {
  return new JSDOM(renderToStaticMarkup(React.createElement(OnboardingWalkthrough, props))).window.document;
}

function exit(props = {}) {
  return draw(props).querySelector('footer a');
}

test('a workspace with pieces leaves for its existing work', () => {
  state.progress.pieces = 4;
  const link = exit();
  expect(link.textContent).toBe('К заготовкам');
  expect(link.getAttribute('href')).toBe('/content?tab=materials');
});

test('a workspace without pieces leaves for the avatar', () => {
  const link = exit();
  expect(link.textContent).toBe('К аватару');
  expect(link.getAttribute('href')).toBe('/content?tab=avatars');
});

test('the English exit names the same destination', () => {
  language = 'en';
  state.progress.pieces = 2;
  expect(exit().textContent).toBe('Go to pieces');
  state.progress.pieces = 0;
  expect(exit().textContent).toBe('Go to avatar');
});

test('unknown progress does not offer a guessed destination', () => {
  state.answered = false;
  state.loading = true;
  expect(exit()).toBeNull();
  state.answered = true;
  state.loading = false;
  state.error = new Error('unavailable');
  expect(exit()).toBeNull();
});

test('embedded settings walkthrough has no exit action', () => {
  expect(exit({ embedded: true })).toBeNull();
});

test('standalone page relies on the upper title; embedded settings keeps its own section heading', () => {
  const standalone = draw();
  expect(standalone.querySelector('h1')).toBeNull();
  expect(standalone.querySelector('section').getAttribute('aria-label')).toBe('С чего начать');
  const embedded = draw({ embedded: true });
  expect(embedded.querySelector('#onboarding-title').tagName).toBe('H2');
  expect(embedded.querySelector('#onboarding-title').textContent).toBe('С чего начать');
});
