'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/current' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, fireEvent, cleanup } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { AgentContextChip } = loadWithMocks('apps/frontend/src/components/agents/agent.context-chip.tsx', {
  './get.transation.service.client': { useT: () => (_, fallback) => fallback },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_, fallback) => fallback },
  '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => 'en' },
  './agent.artifact-metadata': { useArtifactMetadata: () => ({ known: () => false, get: () => undefined }) },
  './agent.piece-data': { pieceIdOf: () => null, useLoadedPiece: () => null },
});
const choices = { channels: [{ id: 'channel-1', name: 'Long channel title', writingProfile: { brandProfileId: 'avatar-1' } }], avatars: [{ id: 'avatar-1', name: 'Channel voice', analysed: true }, { id: 'avatar-2', name: 'My other voice', analysed: true }], defaultAvatarId: 'avatar-2', loading: false, error: false, retry: jest.fn() };
const h = (component, props) => React.createElement(component, { choices, onWritingSelection: () => {}, ...props });
const context = { version: 'assistant-work-context/v1', kind: 'piece', id: 'piece-1', from: '2026-10-09T00:00:00Z', to: '2026-10-27T00:00:00Z' };
const artifact = { kind: 'piece', id: 'piece-1', title: 'Full selected material title', code: null, data: {} };
afterEach(cleanup);

test('context details and detach are on demand, rather than a permanent attachment strip', () => {
  const onRemove = jest.fn(), view = render(h(AgentContextChip, { context, artifact, onRemove }));
  const trigger = view.getByRole('button', { name: 'Context' });
  expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  expect(view.queryByRole('button', { name: 'Detach object' })).toBeNull();
  expect(view.queryByText(artifact.title)).toBeNull();
  trigger.focus();fireEvent.click(trigger);
  expect(view.getByRole('dialog', { name: 'Context' })).toBeTruthy();
  expect(view.getByText(artifact.title)).toBeTruthy();
  expect(view.getByText(/Oct 9, 2026/)).toBeTruthy();
  expect(view.getByText(/included with your next message/)).toBeTruthy();
  expect(onRemove).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(view.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);fireEvent.click(view.getByRole('button', { name: 'Detach object' }));
  expect(onRemove).toHaveBeenCalledTimes(1);
  expect(view.queryByRole('dialog')).toBeNull();
});

test('context is available before attaching an object, and choices never auto-submit on mount', () => {
  const change = jest.fn();
  const view = render(h(AgentContextChip, { context: null, onRemove: () => {}, onWritingSelection: change }));
  fireEvent.click(view.getByRole('button', { name: 'Context' }));
  expect(view.getByText('Long channel title', { selector: 'p' })).toBeTruthy();
  expect(view.getByText('Channel voice', { selector: 'p' })).toBeTruthy();
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(view.getByRole('combobox', { name: 'Writing avatar' }), { target: { value: 'avatar-2' } });
  expect(change).toHaveBeenLastCalledWith({ avatarId: 'avatar-2' });
  fireEvent.click(view.getByRole('button', { name: 'Close' }));
  expect(view.queryByRole('dialog')).toBeNull();
});

test('multiple channels stay unselected, and a failed list does not clear a saved choice', () => {
  const change = jest.fn();
  const view = render(h(AgentContextChip, { context: null, onRemove: () => {}, choices: { ...choices, channels: [...choices.channels, { id: 'channel-2', name: 'Another channel' }] }, onWritingSelection: change }));
  fireEvent.click(view.getByRole('button', { name: 'Context' }));
  expect(view.getByText(/No channel selected/)).toBeTruthy();
  view.rerender(h(AgentContextChip, { context: null, onRemove: () => {}, choices: { ...choices, error: true }, writingSelection: { avatarId: 'avatar-1' }, onWritingSelection: change }));
  expect(view.getByText(/Your saved choices are kept/)).toBeTruthy();
  expect(change).not.toHaveBeenCalled();
});

test('changing the selected object closes stale details and updates its accessible name', () => {
  const view = render(h(AgentContextChip, { context, artifact, onRemove: () => {} }));
  fireEvent.click(view.getByRole('button', { name: 'Context' }));
  view.rerender(h(AgentContextChip, { context: { ...context, id: 'piece-2' }, artifact: { ...artifact, id: 'piece-2', title: 'Second material' }, onRemove: () => {} }));
  expect(view.queryByRole('dialog')).toBeNull();
  expect(view.getByRole('button', { name: 'Context' })).toBeTruthy();
});
