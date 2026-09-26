'use strict';

/**
 * The checkbox, proven by rendering it.
 *
 * On 13.09.2026 the owner looked at the intake form and asked whether the box
 * beside «Нужен ресерч» belonged to the same product as everything around it.
 * It did not: `accent-color` paints the filled state and leaves the empty one
 * to the browser, so the unchecked box was a light-theme control with the
 * browser's own border and radius sitting on a dark-theme surface.
 *
 * The fix is the native input drawn by the theme (`appearance: none`). Until
 * 26.09.2026 it was a drawn box beside a visually hidden input, and that hidden
 * input could not be aimed at (`2q28.36`). What is checked here is that the
 * native control is still a native control: it keeps its role, its checked
 * state, its label, its disabled state, and it is the visible box itself.
 *
 * The document comes from `jsdom` directly rather than from the jsdom Jest
 * environment, for the reason `tests/design.hint.test.cjs` gives: that one
 * pulls in the optional native `canvas` binding, which is not built in this
 * workspace and has nothing to do with a checkbox.
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

const {
  cleanup,
  fireEvent,
  render,
  screen,
} = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const CHECKBOX_FIELD = 'libraries/react-shared-libraries/src/form/checkbox.field.tsx';
const CONTROL_BUTTON = 'libraries/react-shared-libraries/src/choice/control.button.tsx';

const { CheckboxField } = loadTypeScriptModule(CHECKBOX_FIELD);

const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

afterEach(cleanup);

const renderField = (props = {}) =>
  render(React.createElement(CheckboxField, { label: 'Нужен ресерч', ...props }));

describe('the box is drawn, and the control underneath is still native', () => {
  test('it is a checkbox with the label as its name', () => {
    renderField();

    const box = screen.getByRole('checkbox', { name: 'Нужен ресерч' });
    expect(box.tagName).toBe('INPUT');
    expect(box.getAttribute('type')).toBe('checkbox');
  });

  test('clicking the label toggles it, so the whole row is the target', () => {
    renderField();
    const box = screen.getByRole('checkbox');

    fireEvent.click(screen.getByText('Нужен ресерч'));
    expect(box.checked).toBe(true);

    fireEvent.click(screen.getByText('Нужен ресерч'));
    expect(box.checked).toBe(false);
  });

  test('the box a person sees is the native input itself, not a hidden one beside it', () => {
    const { container } = renderField();
    const box = container.querySelector('input');
    const classes = box.className.split(/\s+/);

    // 2q28.36: a visually hidden input is a box nobody can aim at — Playwright
    // `check()` waited for a visible control and timed out on the avatar
    // consent. The input is drawn with `appearance: none` and keeps its size.
    expect(classes).not.toContain('sr-only');
    expect(classes).not.toContain('opacity-0');
    expect(classes).toContain('appearance-none');
    expect(classes).toContain('size-[20px]');
    expect(box.getAttribute('aria-hidden')).toBeNull();
    expect(box.hasAttribute('hidden')).toBe(false);
  });

  test('clicking the box itself toggles it', () => {
    renderField();
    const box = screen.getByRole('checkbox');

    fireEvent.click(box);
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
  });

  test('the tick is decoration: it says nothing and never takes the pointer', () => {
    const { container } = renderField();
    const mark = container.querySelector('[data-checkbox-mark]');

    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.className).toContain('pointer-events-none');
    // It has to follow the input: the peer variants are a sibling selector.
    expect(mark.previousElementSibling.tagName).toBe('INPUT');
    expect(mark.textContent).toBe('');
  });

  test('indeterminate is set as the DOM property it is, and it follows the prop', () => {
    const { rerender } = renderField({ indeterminate: true, checked: false, onChange() {} });
    const box = screen.getByRole('checkbox');
    expect(box.indeterminate).toBe(true);

    rerender(
      React.createElement(CheckboxField, {
        label: 'Нужен ресерч',
        indeterminate: false,
        checked: false,
        onChange() {},
      })
    );
    expect(box.indeterminate).toBe(false);
  });

  test('disabled reads as disabled on the control and on the row', () => {
    const { container } = renderField({ disabled: true });

    expect(screen.getByRole('checkbox').disabled).toBe(true);
    expect(container.querySelector('label').className).toContain('opacity-50');
    // Hover paint is withheld: a row that lights up under the pointer promises
    // an action that is not there.
    expect(container.querySelector('input').className).not.toContain(
      'group-hover:'
    );
  });

  test('a forwarded ref still reaches the native input', () => {
    const ref = React.createRef();
    render(
      React.createElement(CheckboxField, { label: 'Нужен ресерч', ref })
    );

    expect(ref.current).toBe(screen.getByRole('checkbox'));
  });
});

describe('the appearance stays inside the system', () => {
  test('the focus ring is the shared one, moved onto the box', () => {
    // Tailwind only generates classes it can read literally, so the ring is
    // written out rather than derived. That is the moment the two can
    // drift, and this is the check that they have not.
    const shared = /CONTROL_FOCUS_RING =\s*\n?\s*'([^']+)'/.exec(
      read(CONTROL_BUTTON)
    )[1];
    const source = read(CHECKBOX_FIELD);
    const peer = /const BOX_FOCUS_RING =\s*([\s\S]*?);\n/
      .exec(source)[1]
      .replace(/'|\+|\n/g, ' ')
      .trim()
      .split(/\s+/);

    for (const token of shared.split(/\s+/)) {
      expect(peer).toContain(token);
    }
    // The offset colour has to name the surface the ring is drawn against.
    expect(peer).toContain('focus-visible:ring-offset-cf-surface');
  });

  test('no colour is written outside the cf layer', () => {
    const source = read(CHECKBOX_FIELD);

    expect(source).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    // The shortcut that started this, named as the class it was: `accent-*`
    // hands the empty box back to the browser. (The prose above says the word;
    // what must not come back is the utility.)
    expect(source).not.toMatch(/\baccent-cf-[a-z-]+/);
    // The mark takes the box's own text colour, so one token decides both.
    expect(source).toContain('text-cf-accent-ink');
  });

  test('the touch target survives the redraw', () => {
    const { container } = renderField();

    expect(container.querySelector('label').className).toContain('min-h-[44px]');
  });
});
