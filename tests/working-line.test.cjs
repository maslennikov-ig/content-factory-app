'use strict';

/**
 * The running row, proven by rendering it.
 *
 * The owner's screenshot of 13.09.2026 is the whole reason this component
 * exists: an indeterminate bar stretched to the right edge of the window, and
 * the word for what was happening — «Собираем…» — cut off somewhere past it.
 * Three screens had each built that row by hand around `Progress`, each with
 * its own track width, and nothing was wrong with any one of them on its own.
 *
 * So the rules checked here are the ones that were being retyped and lost: the
 * width belongs to the component and not to the call site, the caption gives up
 * its own space rather than the bar's, and the row announces what is running
 * instead of showing a bar with nothing beside it.
 *
 * The document comes from `jsdom` directly rather than from the jsdom Jest
 * environment, for the reason `tests/design.hint.test.cjs` gives.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  Object.defineProperty(global, key, {
    configurable: true,
    get: () => dom.window[key],
  });
}
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const WORKING_LINE = 'apps/frontend/src/components/ui/working-line.tsx';

const { WorkingLine } = loadTypeScriptModule(WORKING_LINE);

afterEach(cleanup);

const renderLine = (props = {}) =>
  render(React.createElement(WorkingLine, { label: 'Собираем опоры…', ...props }));

describe('the row says what is running', () => {
  test('the caption is visible and the bar carries the same name', () => {
    renderLine();

    expect(screen.getByText('Собираем опоры…')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBe(
      'Собираем опоры…'
    );
  });

  test('it is an indeterminate bar, not a made-up percentage', () => {
    renderLine();
    const bar = screen.getByRole('progressbar');

    expect(bar.getAttribute('aria-valuenow')).toBeNull();
    expect(bar.getAttribute('aria-busy')).toBe('true');
  });

  test('a changed caption is heard, not only seen', () => {
    const { container } = renderLine();

    expect(container.querySelector('[data-working-line]').getAttribute('aria-live')).toBe(
      'polite'
    );
  });

  test('the screen keeps its own hook and its own place in the layout', () => {
    const { container } = renderLine({
      'data-intake-step': 'writing',
      className: 'flex-1',
    });
    const row = container.querySelector('[data-working-line]');

    expect(row.getAttribute('data-intake-step')).toBe('writing');
    expect(row.className).toContain('flex-1');
    // The row's own layout survives whatever the screen adds.
    expect(row.className).toContain('min-w-0');
  });
});

describe('the width is the component’s', () => {
  test('the track is a fixed width the call site never passes', () => {
    const { container } = renderLine({ className: 'flex-1' });
    const bar = container.querySelector('[role="progressbar"]');

    expect(bar.className).toContain('w-[96px]');
    expect(bar.className).toContain('shrink-0');
  });

  test('the caption is what gives way, so the bar cannot be squeezed out', () => {
    const { container } = renderLine();
    const caption = container.querySelector('[data-working-line] > span');

    // `truncate` without `min-w-0` does nothing inside a flex row: the item
    // refuses to shrink below its content and pushes the bar off instead.
    expect(caption.className).toContain('truncate');
    expect(caption.className).toContain('min-w-0');
    // Cut short on screen, still readable on hover.
    expect(caption.getAttribute('title')).toBe('Собираем опоры…');
  });

  test('the one width is written once', () => {
    // Comments stripped first: the prose above `TRACK` quotes the two widths
    // this replaced, and a guard that cannot tell a quotation from a class
    // teaches the next author to stop explaining themselves.
    const code = fs
      .readFileSync(path.join(repositoryRoot, WORKING_LINE), 'utf8')
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

    expect(code.match(/w-\[\d+px\]/g)).toEqual(['w-[96px]']);
  });
});
