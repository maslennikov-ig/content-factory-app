'use strict';

/**
 * `ConfirmButton` — the one armed confirmation for irreversible actions
 * (`97dq.39`, rule «Armed confirm»). Generalised from `PieceDeleteButton`;
 * the piece page switches to it in its own stream.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const { ConfirmButton, CONFIRM_ARMED_MS } = loadTypeScriptModule(
  'apps/frontend/src/components/ui/confirm-button.tsx'
);

const draw = (props = {}) =>
  render(
    React.createElement(ConfirmButton, {
      label: 'Удалить',
      armedLabel: 'Удалить насовсем?',
      onConfirm: () => undefined,
      ...props,
    })
  );

const button = () => document.querySelector('[data-confirm-armed]');

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

test('the first press arms, the second confirms — once', () => {
  const onConfirm = jest.fn();
  const onArmedChange = jest.fn();
  draw({ onConfirm, onArmedChange });

  expect(screen.getByRole('button', { name: 'Удалить' })).toBe(button());
  expect(button().dataset.confirmArmed).toBe('false');

  fireEvent.click(button());
  expect(onConfirm).not.toHaveBeenCalled();
  expect(button().dataset.confirmArmed).toBe('true');
  expect(screen.getByRole('button', { name: 'Удалить насовсем?' })).toBe(button());
  expect(onArmedChange).toHaveBeenLastCalledWith(true);

  fireEvent.click(button());
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(button().dataset.confirmArmed).toBe('false');
  expect(onArmedChange).toHaveBeenLastCalledWith(false);
});

test('arming is announced through a live region', () => {
  draw();
  const status = screen.getByRole('status');
  expect(status.textContent).toBe('');
  fireEvent.click(button());
  expect(status.textContent).toBe('Удалить насовсем?');
});

test('both labels share one grid cell, so the width does not jump', () => {
  draw();
  const cells = button().querySelectorAll('[class*="[grid-area:1/1]"]');
  expect([...cells].map((one) => one.textContent)).toEqual([
    'Удалить',
    'Удалить насовсем?',
  ]);
  expect(cells[1].className).toContain('invisible');
  fireEvent.click(button());
  expect(cells[0].className).toContain('invisible');
  expect(cells[1].className).not.toContain('invisible');
});

test('focus loss, Escape and the quiet timeout each disarm it', () => {
  jest.useFakeTimers();
  const onConfirm = jest.fn();
  draw({ onConfirm });

  fireEvent.click(button());
  fireEvent.blur(button());
  expect(button().dataset.confirmArmed).toBe('false');

  fireEvent.click(button());
  fireEvent.keyDown(button(), { key: 'Escape' });
  expect(button().dataset.confirmArmed).toBe('false');

  fireEvent.click(button());
  act(() => {
    jest.advanceTimersByTime(CONFIRM_ARMED_MS + 1);
  });
  expect(button().dataset.confirmArmed).toBe('false');
  expect(onConfirm).not.toHaveBeenCalled();
});

test('armed paint is destructive; rest paint is the caller’s', () => {
  draw({ variant: 'secondary' });
  expect(button().className).not.toContain('bg-cf-danger');
  fireEvent.click(button());
  expect(button().className).toContain('bg-cf-danger');
});

test('becoming busy disarms, and a busy button confirms nothing', () => {
  const onConfirm = jest.fn();
  const view = draw({ onConfirm });
  fireEvent.click(button());
  view.rerender(
    React.createElement(ConfirmButton, {
      label: 'Удалить',
      armedLabel: 'Удалить насовсем?',
      onConfirm,
      loading: true,
      loadingLabel: 'Удаляем…',
    })
  );
  expect(button().dataset.confirmArmed).toBe('false');
  expect(button().getAttribute('aria-busy')).toBe('true');
  expect(button().disabled).toBe(true);
  fireEvent.click(button());
  expect(onConfirm).not.toHaveBeenCalled();
});

test('caller data attributes pass through', () => {
  draw({ 'data-adaptation-delete': 'ad-1' });
  expect(button().getAttribute('data-adaptation-delete')).toBe('ad-1');
});

/* 97dq.43 p.5: a busy or armed button keeps its width. */
test('busy: the spinner is laid over the label, which stays in the flow, so the width is the resting one', () => {
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  draw({ loading: true, loadingLabel: 'Удаляем' });
  const node = button();
  const spinner = node.querySelector('[data-button-spinner]');
  expect(spinner.className).toContain('absolute');
  expect(spinner.className).toContain('inset-0');
  // Both labels are still laid out in the one grid cell, only faded.
  const content = [...node.children].find(
    (child) => child.tagName === 'DIV' && child.className.split(' ').includes('opacity-0')
  );
  expect(content).toBeTruthy();
  expect(content.textContent).toBe('УдалитьУдалить насовсем?');
  expect(node.getAttribute('aria-busy')).toBe('true');
  expect(node.textContent).toContain('Удаляем');
  // The first paint before any measure has a real spinner size, not NaN.
  expect(spinner.firstElementChild.style.width).toMatch(/^\d+px$/);
  expect(errors.mock.calls.filter((call) => String(call[0]).includes('NaN'))).toEqual([]);
  errors.mockRestore();
});
