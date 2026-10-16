const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/new' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { flushSync } = require('react-dom');
const { act, cleanup, fireEvent, render } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const h = React.createElement;
const { artifactWorkspaceReducer: reduce, emptyArtifactWorkspace } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.workspace-state.ts');
const { CoreTextEdit } = loadWithMocks('apps/frontend/src/components/content-intelligence/pieces/core-edit.tsx', {
  react: React,
  '../../layout/user.context': { useUser: () => ({ id: 'host-editor-person', orgId: 'host-editor-workspace' }) },
  '@contentfactory/react/layout/hint': { Hint: () => null },
});
const artifact = { kind: 'piece', id: 'host-editor-piece', title: 'Piece', code: null, data: {} };
const serverText = 'Saved text before the edit';
let save;
const { AgentArtifactHost } = loadWithMocks('apps/frontend/src/components/agents/agent.artifact-host.tsx', {
  react: React,
  './assistant.workspace-context': { AssistantArtifactBoundary: ({ children }) => h(React.Fragment, null, children) },
  './agent.panel': { ArtifactEditor: () => h(CoreTextEdit, { pieceId: artifact.id, locale: 'en', text: serverText, editedByYou: false, disabled: false, onSave: save }, h('p', null, serverText)) },
});

function Workspace() {
  const [state, dispatch] = React.useReducer(reduce, undefined, () => reduce(emptyArtifactWorkspace(), { type: 'select', artifact }));
  const [hidden, setHidden] = React.useState(false);
  return h('div', { 'data-dirty-objects': state.dirty.join(',') },
    h('button', { onClick: () => setHidden(!hidden) }, hidden ? 'Restore material' : 'Hide material'),
    h('div', { style: { display: hidden ? 'none' : undefined } }, h(AgentArtifactHost, {
      artifact, available: state.artifacts, words: {}, onSelectArtifact: () => {},
      // A capture listener must also be safe when an ancestor applies its state immediately.
      // This makes the browser-observed update ordering deterministic without mocking CoreTextEdit.
      onDirty: (key) => flushSync(() => dispatch({ type: 'dirty', key })),
    })),
  );
}

afterEach(() => { cleanup(); window.sessionStorage.clear(); });
afterAll(() => dom.window.close());

test.each(['input', 'native input'])('artifact host preserves controlled core text through %s, parent dirty update, hide and restore', async (eventKind) => {
  save = jest.fn(async () => false);
  await act(async () => render(h(Workspace)));
  await act(async () => fireEvent.click(document.querySelector('[data-piece-core-edit-toggle="edit"]')));
  const field = document.querySelector('textarea[name="piece-core-text"]');
  const edited = 'The current unsaved core text';
  await act(async () => {
    if (eventKind === 'native input') {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(field, edited);
      field.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: edited }));
    } else {
      fireEvent.input(field, { target: { value: edited }, inputType: 'insertText', data: edited });
    }
  });
  expect(field.value).toBe(edited);
  expect(document.querySelector('[data-dirty-objects]').dataset.dirtyObjects).toBe('piece:host-editor-piece');
  await act(async () => fireEvent.change(field, { target: { value: edited } }));
  expect(field.value).toBe(edited);
  await act(async () => fireEvent.click([...document.querySelectorAll('button')].find((button) => button.textContent === 'Hide material')));
  expect(document.querySelector('textarea[name="piece-core-text"]')).toBe(field);
  expect(field.value).toBe(edited);
  await act(async () => fireEvent.click([...document.querySelectorAll('button')].find((button) => button.textContent === 'Restore material')));
  expect(document.querySelector('textarea[name="piece-core-text"]')).toBe(field);
  expect(field.value).toBe(edited);
  await act(async () => fireEvent.blur(field));
  expect(save).toHaveBeenCalledWith(edited, serverText);
});
