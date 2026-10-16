const React = require('react');
const { JSDOM } = require('jsdom');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/content/pieces/p1', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = (callback) => callback();
global.HTMLElement = dom.window.HTMLElement;
global.localStorage = dom.window.localStorage;
const { act, cleanup, fireEvent, render } = require('@testing-library/react');
const route = loadTypeScriptModule('apps/frontend/src/components/agents/assistant.route-context.ts');
let pathname, actor, mounts;
const h = React.createElement;
function Screen() {
  const [draft, setDraft] = React.useState('');
  React.useEffect(() => { mounts += 1; }, []);
  return h('input', { 'aria-label': 'Chat draft', value: draft, onChange: (event) => setDraft(event.target.value) });
}
const { AssistantWorkspaceHost, AssistantContextAction } = loadWithMocks('apps/frontend/src/components/agents/assistant.workspace-context.tsx', {
  react: React,
  'next/dynamic': () => Screen,
  'next/navigation': { usePathname: () => pathname, useSearchParams: () => new URLSearchParams('') },
  '@contentfactory/react/form/button': { Button: ({ children, variant, density, ...props }) => h('button', props, children) },
  '@contentfactory/frontend/components/layout/user.context': { useUser: () => actor },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
});
const app = () => h(AssistantWorkspaceHost, null, h(AssistantContextAction, {context: {version: 'assistant-work-context/v1',kind:'piece',id:'p1'}}), h('input', { 'aria-label': 'Manual draft', defaultValue: '' }));
beforeEach(() => { pathname = '/content/pieces/p1'; actor = { id: 'u1', orgId: 'o1' }; mounts = 0; localStorage.clear(); });
afterEach(cleanup);

test('manual context is identity only; malformed routes and unrelated settings do not become entity context', () => {
  expect(route.assistantRouteContext('/content/pieces/p1', '')).toEqual({ version: 'assistant-work-context/v1', kind: 'piece', id: 'p1' });
  expect(route.assistantRouteContext('/content/pieces/%ZZ', '')).toBeNull();
  expect(route.assistantRouteContext('/settings', '')).toBeNull();
  expect(route.assistantRouteContext('/content', 'tab=leads').kind).toBe('ideas');
  expect(route.assistantRouteContext('/content', 'tab=provenance').kind).toBe('facts');
});
test('ambiguous object linkage never picks a random conversation', () => {
  expect(route.linkedAssistantThread({ target: ['one'] }, 'target')).toBe('one');
  expect(route.linkedAssistantThread({ target: ['one', 'two'] }, 'target')).toBeNull();
  expect(route.linkedAssistantThread({ target: 'one' }, 'target')).toBeNull();
});
test('logical context identity survives canonical server property order and revision refresh', () => {
  const manual = { version: 'assistant-work-context/v1', kind: 'adaptation', id: 'a1', adaptationId: 'a1', pieceId: 'p1', channelId: 'c1' };
  const server = { version: manual.version, kind: manual.kind, id: 'a1', pieceId: 'p1', channelId: 'c1', adaptationId: 'a1', revision: 'new-server-revision' };
  expect(route.assistantContextKey(manual)).toBe(route.assistantContextKey(server));
});
test('opening, hiding and route navigation preserve both draft DOMs and one mounted chat', async () => {
  const view = render(app());
  const manual = view.getByLabelText('Manual draft');
  fireEvent.change(manual, { target: { value: 'Unsent manual changes' } });
  expect(mounts).toBe(0);
  fireEvent.click(view.getByText('Discuss with assistant'));
  const chat = view.getByLabelText('Chat draft');
  fireEvent.change(chat, { target: { value: 'Unsent chat instruction' } });
  fireEvent.click(view.getByText('Hide'));
  expect(view.getByLabelText('Manual draft')).toBe(manual);
  expect(manual.value).toBe('Unsent manual changes');
  pathname = '/agents';
  view.rerender(app());
  expect(view.getByLabelText('Chat draft')).toBe(chat);
  expect(chat.value).toBe('Unsent chat instruction');
  expect(mounts).toBe(1);
});
test('changing user or workspace remounts the private chat and drops unsent contents', () => {
  const view = render(app());
  fireEvent.click(view.getByText('Discuss with assistant'));
  const previous = view.getByLabelText('Chat draft');
  fireEvent.change(previous, { target: { value: 'Private u1 text' } });
  actor = { id: 'u2', orgId: 'o1' };
  pathname = '/agents';
  view.rerender(app());
  expect(view.getByLabelText('Chat draft')).not.toBe(previous);
  expect(view.getByLabelText('Chat draft').value).toBe('');
});
