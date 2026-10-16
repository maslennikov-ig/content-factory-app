const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/new' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.getComputedStyle = dom.window.getComputedStyle;
let width = 1200;
dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width, height: 800, left: 0, right: width, top: 0, bottom: 800 });
const { act, cleanup, fireEvent, render } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const translate = (_, fallback) => fallback;
const { AgentWorkspaceShell } = loadWithMocks('apps/frontend/src/components/agents/agent.workspace-shell.tsx', {
  react: React,
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => translate },
});
const h = React.createElement;
afterEach(cleanup);
const props = {
  hasMaterial: true, hidden: false, materialName: 'Piece one', selectionVersion: 0, onHide: () => {},
  children: h('textarea', { 'aria-label': 'Message', defaultValue: 'unsent question' }),
  material: h('input', { 'aria-label': 'Draft', defaultValue: 'local draft' }),
};

describe('assistant workspace split and compact views', () => {
  test('divider supports keyboard limits and RTL direction', async () => {
    width = 1200;
    await act(async () => render(h(AgentWorkspaceShell, props)));
    const divider = document.querySelector('[role="separator"]');
    expect(divider).not.toBeNull();
    const initial = Number(divider.getAttribute('aria-valuenow'));
    await act(async () => fireEvent.keyDown(divider, { key: 'ArrowRight' }));
    expect(Number(divider.getAttribute('aria-valuenow'))).toBeGreaterThan(initial);
    divider.style.direction = 'rtl';
    await act(async () => fireEvent.keyDown(divider, { key: 'ArrowRight' }));
    expect(Number(divider.getAttribute('aria-valuenow'))).toBe(initial);
    await act(async () => fireEvent.keyDown(divider, { key: 'Home' }));
    expect(divider.getAttribute('aria-valuenow')).toBe(divider.getAttribute('aria-valuemin'));
    await act(async () => fireEvent.keyDown(divider, { key: 'End' }));
    expect(divider.getAttribute('aria-valuenow')).toBe(divider.getAttribute('aria-valuemax'));
  });
  test('compact switching and hiding retain both local editor and unsent chat values', async () => {
    width = 390;
    let mounted;
    await act(async () => { mounted = render(h(AgentWorkspaceShell, props)); });
    expect(document.querySelector('[role="separator"]')).toBeNull();
    const draft = document.querySelector('input[aria-label="Draft"]');
    const message = document.querySelector('textarea');
    draft.value = 'edited but not saved';
    message.value = 'not sent';
    await act(async () => fireEvent.click([...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent.includes('Material'))));
    expect(draft.closest('[role="tabpanel"]').style.display).not.toBe('none');
    await act(async () => mounted.rerender(h(AgentWorkspaceShell, { ...props, hidden: true })));
    expect(document.querySelector('input[aria-label="Draft"]')).toBe(draft);
    expect(draft.value).toBe('edited but not saved');
    expect(message.value).toBe('not sent');
    await act(async () => mounted.rerender(h(AgentWorkspaceShell, { ...props, hidden: false, selectionVersion: 1 })));
    expect(draft.closest('[role="tabpanel"]').style.display).not.toBe('none');
  });
  test('manual context suppresses the nested artifact pane while retaining its editor', async () => {
    width = 1200;
    await act(async () => render(h(AgentWorkspaceShell, { ...props, contextual: true })));
    const draft = document.querySelector('input[aria-label="Draft"]');
    expect(draft).not.toBeNull();
    expect(draft.closest('[role="tabpanel"]').style.display).toBe('none');
    expect(document.querySelector('[role="separator"]')).toBeNull();
  });
});
