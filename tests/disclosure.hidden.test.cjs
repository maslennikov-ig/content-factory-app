'use strict';
/**
 * `Disclosure` really hides its region when closed (`97dq.74`, walk F2).
 *
 * «Отдельный ИИ на задачу» looked collapsible and never collapsed: the region
 * got `hidden` and the caller's `flex` on one element. Tailwind 3.4.17 hides
 * with `[hidden]:where(:not([hidden="until-found"])) { display: none }`
 * (specificity 0,1,0; `node_modules/tailwindcss/src/css/preflight.css`), and
 * `.flex` has the same weight and comes later, so the region stayed open.
 * jsdom does not compute Tailwind, so the test holds the class that wins:
 * a closed region carries `!hidden`, an open one does not.
 */
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const { Disclosure } = loadWithMocks('apps/frontend/src/components/ui/disclosure.tsx');
const h = React.createElement;

afterEach(cleanup);

test('a closed region with a display utility still hides; opening removes the override', () => {
  render(
    h(
      Disclosure,
      { summary: 'Отдельный ИИ на задачу', contentClassName: 'flex flex-col gap-[8px]' },
      h('p', null, 'role rows')
    )
  );
  const trigger = screen.getByRole('button', { name: /Отдельный ИИ на задачу/ });
  const region = document.getElementById(trigger.getAttribute('aria-controls'));

  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(region.hidden).toBe(true);
  expect(region.className.split(/\s+/)).toEqual(
    expect.arrayContaining(['flex', 'flex-col', '!hidden'])
  );

  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(region.hidden).toBe(false);
  expect(region.className.split(/\s+/)).not.toContain('!hidden');
  expect(region.className.split(/\s+/)).toContain('flex');

  fireEvent.click(trigger);
  expect(region.hidden).toBe(true);
  expect(region.className.split(/\s+/)).toContain('!hidden');
});

test('defaultOpen starts visible without the override', () => {
  render(h(Disclosure, { summary: 'x', defaultOpen: true, contentClassName: 'grid' }, 'body'));
  const region = screen.getByRole('region');
  expect(region.hidden).toBe(false);
  expect(region.className).toBe('grid');
});
