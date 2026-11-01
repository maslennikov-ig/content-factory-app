'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, fireEvent, cleanup } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const setCurrent = jest.fn();
const show = jest.fn();
const { SelectCustomer } = loadWithMocks('apps/frontend/src/components/launches/select.customer.tsx', {
  '@floating-ui/dom': { computePosition: () => new Promise(() => {}), autoUpdate: (_anchor, _panel, update) => { update(); return () => {}; }, offset: () => ({}), flip: () => ({}), shift: () => ({}), size: () => ({}) },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
  '@contentfactory/react/toaster/toaster': { useToaster: () => ({ show }) },
  '@contentfactory/frontend/components/new-launch/store': { useLaunchStore: (selector) => selector({ setCurrent }) },
  'zustand/react/shallow': { useShallow: (selector) => selector },
});
afterEach(() => { cleanup(); jest.clearAllMocks(); });

test('customer selector opens by keyboard, selects an item and closes on Escape', () => {
  const changed = jest.fn();
  const view = render(React.createElement(SelectCustomer, { onChange: changed, integrations: [{ customer: { id: 'a', name: 'First' } }, { customer: { id: 'b', name: 'Second customer with a long name' } }] }));
  const trigger = view.getByRole('button', { name: 'Select Customer' });
  trigger.focus();
  fireEvent.click(trigger, { detail: 0 });
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  const item = view.getByRole('menuitem', { name: 'Second customer with a long name' });
  expect(item.closest('[role="menu"]').parentElement).toBe(document.body);
  expect(item.className).toContain('min-h-[32px]');
  fireEvent.click(item);
  expect(changed).toHaveBeenCalledWith('b');
  expect(setCurrent).toHaveBeenCalledWith('global');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(trigger, { detail: 0 });
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
