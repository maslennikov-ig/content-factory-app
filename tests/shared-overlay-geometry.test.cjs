'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, fireEvent, cleanup, act } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const pending = [];
let updatePosition;
let stopped;
const floating = {
  computePosition: () => new Promise((resolve) => pending.push(resolve)),
  autoUpdate: (_anchor, _panel, update) => { updatePosition = update; update(); return () => { stopped = true; }; },
  flip: () => ({}), offset: () => ({}), shift: () => ({}), size: () => ({}),
};
const { Popover, Dialog } = loadWithMocks('apps/frontend/src/components/ui/layers.tsx', {
  '@floating-ui/dom': floating,
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
});
const h = React.createElement;
afterEach(() => { cleanup(); pending.length = 0; stopped = false; });

test('anchored panel portals, ignores inside clicks, closes outside and rejects stale positions', async () => {
  function Harness() {
    const ref = React.useRef(null);
    const [open, setOpen] = React.useState(true);
    return h('div', { style: { overflow: 'hidden' } }, h('button', { ref }, 'Anchor'), open && h(Popover, { anchorRef: ref, onClose: () => setOpen(false), role: 'dialog', ariaLabel: 'Inbox' }, h('button', null, 'Inside')));
  }
  const view = render(h(Harness));
  const panel = document.querySelector('[aria-label="Inbox"]');
  expect(panel.parentElement).toBe(document.body);
  await act(async () => { updatePosition(); pending[1]({ x: 40, y: 50 }); await Promise.resolve(); pending[0]({ x: 1, y: 2 }); await Promise.resolve(); });
  expect(panel.style.left).toBe('40px');
  expect(panel.style.top).toBe('50px');
  fireEvent.pointerDown(view.getByText('Inside'));
  expect(document.querySelector('[aria-label="Inbox"]')).not.toBeNull();
  fireEvent.pointerDown(document.body);
  expect(document.querySelector('[aria-label="Inbox"]')).toBeNull();
  expect(stopped).toBe(true);
});

test('Escape returns focus to anchor and dialog close has an accessible localized name', async () => {
  function Harness() {
    const ref = React.useRef(null);
    const [open, setOpen] = React.useState(true);
    return h(React.Fragment, null, h('button', { ref }, 'Anchor'), open && h(Popover, { anchorRef: ref, onClose: () => setOpen(false) }, 'Panel'));
  }
  const view = render(h(Harness));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.activeElement).toBe(view.getByText('Anchor'));
  expect(view.queryByText('Panel')).toBeNull();
  view.unmount();
  const close = jest.fn();
  const dialog = render(h(Dialog, { open: true, title: 'Title', onClose: close }, 'Content'));
  fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
  expect(close).toHaveBeenCalledTimes(1);
});


test('a hint portalled from the panel counts as inside', () => {
  function Harness() {
    const ref = React.useRef(null);
    const [open, setOpen] = React.useState(true);
    return h(React.Fragment, null, h('button', { ref }, 'Anchor'), open && h(Popover, { anchorRef: ref, onClose: () => setOpen(false) }, h('button', { 'data-hint-anchor': 'hint-a' }, 'Hint anchor')));
  }
  const view = render(h(Harness));
  const bubble = document.createElement('div');
  bubble.setAttribute('data-hint-portal', 'hint-a');
  document.body.appendChild(bubble);
  fireEvent.pointerDown(bubble);
  expect(view.queryByText('Hint anchor')).not.toBeNull();
  bubble.remove();
  fireEvent.pointerDown(document.body);
  expect(view.queryByText('Hint anchor')).toBeNull();
});


test('nested portalled menu remains inside its parent and Escape closes only the top layer', () => {
  function Harness() {
    const outer = React.useRef(null);
    const inner = React.useRef(null);
    const [outerOpen, setOuterOpen] = React.useState(true);
    const [innerOpen, setInnerOpen] = React.useState(true);
    return h(React.Fragment, null, h('button', { ref: outer }, 'Outer anchor'), outerOpen && h(Popover, { anchorRef: outer, onClose: () => setOuterOpen(false), ariaLabel: 'Outer', role: 'dialog' }, h('button', { ref: inner }, 'Inner anchor'), innerOpen && h(Popover, { anchorRef: inner, onClose: () => setInnerOpen(false), ariaLabel: 'Inner', role: 'dialog' }, h('button', null, 'Action'))));
  }
  const view = render(h(Harness));
  fireEvent.pointerDown(view.getByText('Action'));
  expect(view.getByRole('dialog', { name: 'Outer' })).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(view.queryByRole('dialog', { name: 'Inner' })).toBeNull();
  expect(view.getByRole('dialog', { name: 'Outer' })).toBeTruthy();
  expect(document.activeElement).toBe(view.getByText('Inner anchor'));
});


test('Escape returns focus to a button inside a non-focusable anchor without reopening', () => {
  function Harness() {
    const holder = React.useRef(null);
    const [open, setOpen] = React.useState(true);
    return h('span', { ref: holder }, h('button', { onFocus: () => setOpen(true) }, 'Trigger'), h('button', null, 'Hint'), open && h(Popover, { anchorRef: holder, onClose: () => setOpen(false), role: 'dialog', ariaLabel: 'Panel' }, 'Details'));
  }
  const view = render(h(Harness));
  view.getByText('Hint').focus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.activeElement).toBe(view.getByText('Trigger'));
  expect(view.queryByRole('dialog', { name: 'Panel' })).toBeNull();
});
