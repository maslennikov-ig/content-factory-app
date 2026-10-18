const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, cleanup, fireEvent, render, waitFor } = require('@testing-library/react');
const useSWR = require('swr').default;
const { SWRConfig } = require('swr');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { artifactWorkspaceReducer: reduce, emptyArtifactWorkspace } = loadWithMocks('apps/frontend/src/components/agents/agent.workspace-state.ts', {});
const h = React.createElement;
const VOICE = '/content-intelligence/voice';
const PIECE = '/content-intelligence/pieces/p1';
const PROFILE = '/integrations/c1/writing-profile';
const PLAN = '/integrations/c1/plan-mode';
let server, reads, writes, mounts, saved, planWrite;
const read = async (key) => {
  reads.push(key);
  if (!server.has(key)) throw new Error(`Unexpected read: ${key}`);
  const value = server.get(key);
  return typeof value === 'function' ? value() : value;
};
const request = async (key, init = {}) => {
  const method = init.method ?? 'GET';
  if (method === 'GET') return new Response(JSON.stringify(await read(key)));
  writes.push({ key, method, body: JSON.parse(init.body ?? '{}') });
  if (key === PLAN && method === 'PUT') {
    if (planWrite) await planWrite;
    server.set(PLAN, { integrationId: 'c1', planMode: JSON.parse(init.body).planMode });
    return new Response(JSON.stringify(server.get(PLAN)));
  }
  if (key === PROFILE && method === 'PUT') {
    const body = JSON.parse(init.body);
    const next = profile(body.notes);
    next.profile.formatPreference = body.formatPreference;
    server.set(PROFILE, next);
    return new Response(JSON.stringify(server.get(PROFILE)));
  }
  throw new Error(`Unexpected write: ${method} ${key}`);
};
const mocks = {
  react: React,
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
  '@contentfactory/react/layout/hint': { Hint: () => null },
  '../../layout/user.context': { useUser: () => ({ id: 'u1', orgId: 'o1' }) },
};
const { CoreTextEdit } = loadWithMocks('apps/frontend/src/components/content-intelligence/pieces/core-edit.tsx', mocks);
const { VoicePassportScreen } = loadWithMocks('apps/frontend/src/components/brand-voice/voice-passport.screen.tsx', mocks);
const { ChannelWritingProfile } = loadWithMocks('apps/frontend/src/components/channels/channel-writing-profile.tsx', mocks);
const { useChannelPlanField } = loadWithMocks('apps/frontend/src/components/content-intelligence/intake/channel-plan.field.tsx', mocks);
const profile = (notes) => ({
  integrationId: 'c1', providerIdentifier: 'telegram', stored: true,
  provider: { name: 'Telegram', maxLength: 4096, maxCaptionLength: 1024, editor: 'html' },
  profile: { version: 'channel-writing-profile/v1', lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 }, emojiLevel: 'few', linkPolicy: 'end', hashtagPolicy: 'none', ctaKind: 'question', formatPreference: 'auto', notes },
});
const voice = (tone, versionLabel = 'v1') => ({ whoSpeaks: 'Автор', tone, audience: 'Читатели', neverSay: [], versionLabel, activeSince: '2026-10-17' });
const avatar = { kind: 'avatar', id: 'a1', title: null, code: null, data: {} };
const piece = { kind: 'piece', id: 'p1', title: null, code: null, data: {} };
const channel = { kind: 'channel', id: 'c1', title: null, code: null, data: {} };
function ReadProbe({ route }) {
  const { data } = useSWR(route, read, { revalidateOnFocus: false });
  return h('output', { 'data-read': route }, typeof data === 'string' ? data : '');
}
function Editor({ artifact }) {
  React.useEffect(() => { mounts.push(`${artifact.kind}:${artifact.id}`); }, []);
  const route = artifact.kind === 'avatar' ? `${VOICE}/passport?avatar=${artifact.id}` : artifact.kind === 'piece' ? `/content-intelligence/pieces/${artifact.id}` : null;
  const { data } = useSWR(route, read, { revalidateOnFocus: false });
  if (artifact.kind === 'channel') return h(ChannelWritingProfile, { integrationId: artifact.id, integrationName: 'Канал', locale: 'ru', canWrite: true });
  if (!data) return h('p', null, 'Loading');
  if (artifact.kind === 'piece') return h(CoreTextEdit, { pieceId: artifact.id, locale: 'en', text: data, editedByYou: false, disabled: false, onSave: saved }, h('p', { 'data-core': artifact.id }, data));
  return h(React.Fragment, null,
    h(ReadProbe, { route: `${VOICE}/avatars` }),
    h(ReadProbe, { route: `${VOICE}/versions?avatar=${artifact.id}&compare=v1` }),
    h(VoicePassportScreen, { locale: 'ru', voice: data, onEditField: saved }));
}
const { AgentArtifactHost } = loadWithMocks('apps/frontend/src/components/agents/agent.artifact-host.tsx', {
  react: React,
  './assistant.workspace-context': { AssistantArtifactBoundary: ({ children }) => h(React.Fragment, null, children) },
  './agent.panel': { ArtifactEditor: Editor },
});
const { useRefreshOnReturn, useRevalidateArtifact } = loadWithMocks('apps/frontend/src/components/agents/agent.revalidate.ts', { react: React });
function Foreground({ artifact, visible }) {
  const revalidate = useRevalidateArtifact();
  useRefreshOnReturn(() => revalidate(artifact), visible, false);
  return null;
}
function draw(initial, probes = [], strict = false, foreground = false) {
  const value = { provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false };
  let current = initial;
  let hidden = false;
  let selectionVersion = 0;
  const app = () => h(SWRConfig, { value },
    foreground ? h(Foreground, { artifact: current, visible: !hidden }) : null,
    ...probes.map((route) => h(ReadProbe, { key: route, route })),
    h('div', { hidden }, h(AgentArtifactHost, { artifact: current, selectionVersion, available: [piece, avatar, channel], words: {}, onDirty: () => {}, onSelectArtifact: () => {} })));
  const tree = () => strict ? h(React.StrictMode, null, app()) : app();
  const view = render(tree());
  return {
    ...view,
    select: async (next) => { current = { ...next }; selectionVersion += 1; await act(async () => view.rerender(tree())); },
    rerenderSame: async () => act(async () => view.rerender(tree())),
    hide: async () => { hidden = !hidden; await act(async () => view.rerender(tree())); },
  };
}
beforeEach(() => {
  server = new Map([
    [PIECE, 'Old saved core'],
    [`${VOICE}/passport?avatar=a1`, voice('Old saved tone')],
    [`${VOICE}/versions?avatar=a1&compare=v1`, 'Old versions'],
    [`${VOICE}/avatars`, { state: 'default', avatars: [], canManage: true, limit: 8 }],
    [PROFILE, profile('Old saved notes')],
    [PLAN, { integrationId: 'c1', planMode: 'reserve' }],
    ['/content-intelligence/pieces/channels/c1/plan-impact?language=ru', { count: 0 }],
  ]);
  reads = []; writes = []; mounts = []; saved = jest.fn(async () => false); planWrite = null;
});
afterEach(() => { cleanup(); window.sessionStorage.clear(); });
afterAll(() => dom.window.close());

test('foreground and same-tab pane return refresh the real retained editor, preserving its dirty CAS base', async () => {
  const view = draw(piece, [], false, true);
  await view.findByText('Old saved core');
  const node = document.querySelector('[data-assistant-editor="piece:p1"]');
  server.set(PIECE, 'External manual save');
  await act(async () => {
    fireEvent(window, new window.Event('focus'));
    fireEvent(document, new window.Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await view.findByText('External manual save');
  expect(document.querySelector('[data-assistant-editor="piece:p1"]')).toBe(node);
  fireEvent.click(document.querySelector('[data-piece-core-edit-toggle="edit"]'));
  const field = view.getByRole('textbox');
  fireEvent.change(field, { target: { value: 'My unsaved draft' } });
  await view.hide();
  server.set(PIECE, 'Another external manual save');
  const before = reads.length;
  await view.hide();
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  expect(reads.slice(before)).toEqual([PIECE]);
  expect(view.getByRole('textbox')).toBe(field);
  expect(field.value).toBe('My unsaved draft');
  await act(async () => fireEvent.blur(field));
  expect(saved).toHaveBeenLastCalledWith('My unsaved draft', 'External manual save');
  expect(mounts).toEqual(['piece:p1']);
  expect(writes).toEqual([]);
});

test('a deliberate same-object return reads current core once without clearing or remounting; hide and ordinary rerenders do not fetch', async () => {
  const view = draw(piece);
  await view.findByText('Old saved core');
  const node = document.querySelector('[data-assistant-editor="piece:p1"]');
  server.set(PIECE, 'Manually saved core');
  const before = reads.length;
  await view.hide();
  await view.hide();
  await view.rerenderSame();
  expect(reads.length).toBe(before);
  await view.select(piece);
  await view.findByText('Manually saved core');
  expect(document.querySelector('[data-assistant-editor="piece:p1"]')).toBe(node);
  expect(mounts).toEqual(['piece:p1']);
  expect(reads.slice(before)).toEqual([PIECE]);
  await view.rerenderSame();
  expect(reads.slice(before)).toEqual([PIECE]);
  expect(writes).toEqual([]);
});

test('real produced/message reducer updates do not refetch retained editors; explicit repeat selection and logical key changes do', async () => {
  let state = reduce(emptyArtifactWorkspace(), { type: 'select', artifact: avatar });
  state = reduce(state, { type: 'select', artifact: piece });
  let selectionVersion = 0;
  const value = { provider: () => new Map(), dedupingInterval: 0 };
  const current = () => state.artifacts.find((one) => `${one.kind}:${one.id}` === state.active);
  const app = () => h(SWRConfig, { value }, h(AgentArtifactHost, {
    artifact: current(), selectionVersion, available: state.artifacts,
    words: {}, onDirty: () => {}, onSelectArtifact: () => {},
  }));
  const view = render(app());
  await view.findByText('Old saved core');
  // Visit both actual editors first. They remain mounted across every update.
  state = reduce(state, { type: 'select', artifact: avatar });
  await act(async () => view.rerender(app()));
  await view.findByText('Old saved tone');
  state = reduce(state, { type: 'select', artifact: piece });
  await act(async () => view.rerender(app()));
  const beforeMessages = reads.length;
  for (let delta = 0; delta < 4; delta += 1) {
    const previous = current();
    state = reduce(state, { type: 'produced', artifacts: [piece, avatar] });
    expect(current()).not.toBe(previous);
    expect(state.active).toBe('piece:p1');
    await act(async () => view.rerender(app()));
  }
  expect(reads.length).toBe(beforeMessages);
  server.set(PIECE, 'Current core after messages');
  state = reduce(state, { type: 'select', artifact: piece });
  selectionVersion += 1;
  await act(async () => view.rerender(app()));
  await view.findByText('Current core after messages');
  expect(reads.slice(beforeMessages)).toEqual([PIECE]);
  const beforeSwitch = reads.length;
  // A changed logical object also refreshes without an explicit event token.
  state = reduce(state, { type: 'select', artifact: avatar });
  await act(async () => view.rerender(app()));
  expect(new Set(reads.slice(beforeSwitch))).toEqual(new Set([`${VOICE}/passport?avatar=a1`, `${VOICE}/avatars`, `${VOICE}/versions?avatar=a1&compare=v1`]));
  expect(mounts).toEqual(['piece:p1', 'avatar:a1']);
  expect(writes).toEqual([]);
});

test('a retained core draft survives selecting another object and return while the authoritative read updates', async () => {
  const view = draw(piece);
  await view.findByText('Old saved core');
  fireEvent.click(document.querySelector('[data-piece-core-edit-toggle="edit"]'));
  const field = view.getByRole('textbox');
  fireEvent.change(field, { target: { value: 'Unsent core draft' } });
  server.set(PIECE, 'New external core');
  await view.select(avatar);
  await view.findByText('Old saved tone');
  await view.select(piece);
  expect(view.getByRole('textbox')).toBe(field);
  expect(field.value).toBe('Unsent core draft');
  expect(mounts.filter((key) => key === 'piece:p1')).toHaveLength(1);
  expect(reads.filter((key) => key === PIECE)).toHaveLength(2);
  expect(writes).toEqual([]);
  // The author's pending edit must still compare against its original base,
  // rather than silently overwriting the externally saved revision.
  await act(async () => fireEvent.blur(field));
  expect(saved).toHaveBeenLastCalledWith('Unsent core draft', 'Old saved core');
});

test.each([false, true])('a clean open core follows return refresh and native autosave uses the new expected text (StrictMode=%s)', async (strict) => {
  saved = jest.fn(async (next, expected) => {
    if (expected !== server.get(PIECE)) return false;
    server.set(PIECE, next);
    return true;
  });
  const view = draw(piece, [], strict);
  await view.findByText('Old saved core');
  fireEvent.click(document.querySelector('[data-piece-core-edit-toggle="edit"]'));
  const field = view.getByRole('textbox');
  server.set(PIECE, 'New manually saved core');
  await view.select(piece);
  await waitFor(() => expect(field.value).toBe('New manually saved core'));
  expect(view.getByRole('textbox')).toBe(field);
  expect(saved).not.toHaveBeenCalled();
  expect(writes).toEqual([]);
  fireEvent.change(field, { target: { value: 'My next core edit' } });
  // Use the real editor and its real debounce/flush hook, including its CAS
  // argument; a changed mirror or a fresh remount cannot satisfy this check.
  await waitFor(() => expect(saved).toHaveBeenCalledWith('My next core edit', 'New manually saved core'), { timeout: 2000 });
  await waitFor(() => expect(document.querySelector('[data-piece-core-saved]').dataset.pieceCoreSaved).toBe('saved'));
  expect(saved).toHaveBeenCalledTimes(1);
  expect(field.value).toBe('My next core edit');
});

test('return to an avatar re-reads its current passport and versions, keeps a pending field, and Cancel reopens the current value', async () => {
  const view = draw(avatar);
  await view.findByText('Old saved tone');
  const edit = () => view.getByRole('button', { name: /Изменить: Каким тоном/ });
  fireEvent.click(edit());
  const field = view.getByRole('textbox', { name: 'Каким тоном' });
  fireEvent.change(field, { target: { value: 'Unsent avatar tone' } });
  server.set(`${VOICE}/passport?avatar=a1`, voice('Manually saved tone', 'v2'));
  server.set(`${VOICE}/versions?avatar=a1&compare=v1`, 'Current versions');
  const before = reads.length;
  await view.select(avatar);
  await view.findByText(/v2/);
  expect(view.getByRole('textbox', { name: 'Каким тоном' })).toBe(field);
  expect(field.value).toBe('Unsent avatar tone');
  expect(new Set(reads.slice(before))).toEqual(new Set([`${VOICE}/passport?avatar=a1`, `${VOICE}/avatars`, `${VOICE}/versions?avatar=a1&compare=v1`]));
  fireEvent.click(view.getByRole('button', { name: 'Отмена' }));
  await view.findByText('Manually saved tone');
  fireEvent.click(edit());
  expect(view.getByRole('textbox', { name: 'Каким тоном' }).value).toBe('Manually saved tone');
  fireEvent.change(view.getByRole('textbox', { name: 'Каким тоном' }), { target: { value: 'My saved tone' } });
  fireEvent.click(view.getByRole('button', { name: 'Сохранить' }));
  expect(saved).toHaveBeenCalledWith('TONE', 'My saved tone');
  server.set(`${VOICE}/passport?avatar=a1`, voice('Newest saved tone', 'v3'));
  await view.select(avatar);
  await view.findByText('Newest saved tone');
  expect(mounts).toEqual(['avatar:a1']);
  expect(writes).toEqual([]);
});

test('a clean open avatar field follows a changed server value without replacing its DOM', async () => {
  const view = draw(avatar);
  await view.findByText('Old saved tone');
  fireEvent.click(view.getByRole('button', { name: /Изменить: Каким тоном/ }));
  const field = view.getByRole('textbox', { name: 'Каким тоном' });
  server.set(`${VOICE}/passport?avatar=a1`, voice('Current tone', 'v2'));
  await view.select(avatar);
  await waitFor(() => expect(field.value).toBe('Current tone'));
  expect(view.getByRole('textbox', { name: 'Каким тоном' })).toBe(field);
});

test('channel clean fields follow manual changes and pending notes survive return without remounting', async () => {
  const view = draw(channel);
  const notes = await view.findByRole('textbox', { name: 'Что ещё важно про этот канал' });
  await waitFor(() => expect(notes.value).toBe('Old saved notes'));
  server.set(PROFILE, profile('Manually saved notes'));
  server.set(PLAN, { integrationId: 'c1', planMode: 'autopilot' });
  await view.select(channel);
  await waitFor(() => expect(notes.value).toBe('Manually saved notes'));
  expect(view.getByLabelText('План').value).toBe('autopilot');
  expect(view.getByRole('textbox', { name: 'Что ещё важно про этот канал' })).toBe(notes);
  fireEvent.change(notes, { target: { value: 'Unsent channel notes' } });
  server.set(PROFILE, profile('Newest saved notes'));
  await view.select(channel);
  expect(notes.value).toBe('Unsent channel notes');
  expect(mounts).toEqual(['channel:c1']);
  expect(writes).toEqual([]);
});

test('a channel Save clears the committed draft so later returns follow current server values', async () => {
  const view = draw(channel);
  const notes = await view.findByRole('textbox', { name: 'Что ещё важно про этот канал' });
  fireEvent.change(notes, { target: { value: 'Saved in the chat editor' } });
  await act(async () => fireEvent.click(view.getByRole('button', { name: 'Сохранить' })));
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ key: PROFILE, method: 'PUT', body: { notes: 'Saved in the chat editor' } });
  server.set(PROFILE, profile('Saved later in the manual editor'));
  await view.select(channel);
  await waitFor(() => expect(notes.value).toBe('Saved later in the manual editor'));
  expect(view.getByRole('textbox', { name: 'Что ещё важно про этот канал' })).toBe(notes);
  expect(writes).toHaveLength(1);
});

test('pending channel notes merge over current untouched fields and Save preserves an externally changed format', async () => {
  const view = draw(channel);
  const notes = await view.findByRole('textbox', { name: 'Что ещё важно про этот канал' });
  fireEvent.change(notes, { target: { value: 'My pending notes' } });
  const external = profile('Notes saved elsewhere');
  external.profile.formatPreference = 'expert';
  server.set(PROFILE, external);
  await view.select(channel);
  expect(notes.value).toBe('My pending notes');
  expect(view.getByLabelText('Формат по умолчанию').value).toBe('expert');
  expect(writes).toEqual([]);
  await act(async () => fireEvent.click(view.getByRole('button', { name: 'Сохранить' })));
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ key: PROFILE, method: 'PUT', body: { notes: 'My pending notes', formatPreference: 'expert' } });
  expect(view.getByLabelText('Формат по умолчанию').value).toBe('expert');
});

test('only matching piece, avatar or channel keys revalidate; string boundaries and avatar query identity exclude siblings', async () => {
  const unrelated = ['/content-intelligence/pieces/p10', `${VOICE}/passport?avatar=a10`, `${VOICE}/passport?avatar=a2`, '/integrations/c10/writing-profile', '/integrations/c2/writing-profile', '/unrelated'];
  unrelated.forEach((key) => server.set(key, 'Unrelated'));
  const view = draw(piece, unrelated);
  await view.findByText('Old saved core');
  const before = reads.length;
  await view.select(piece);
  expect(reads.slice(before)).toEqual([PIECE]);
  await view.select(avatar);
  await view.findByText('Old saved tone');
  const beforeAvatar = reads.length;
  await view.select(avatar);
  expect(reads.slice(beforeAvatar).some((key) => unrelated.includes(key))).toBe(false);
  await view.select(channel);
  await view.findByRole('textbox', { name: 'Что ещё важно про этот канал' });
  const beforeChannel = reads.length;
  await view.select(channel);
  expect(new Set(reads.slice(beforeChannel))).toEqual(new Set([PROFILE, PLAN]));
  expect(writes).toEqual([]);
});

test('an in-flight return keeps the last core visible until the new answer arrives', async () => {
  const view = draw(piece);
  await view.findByText('Old saved core');
  const node = document.querySelector('[data-core]');
  let release;
  server.set(PIECE, () => new Promise((resolve) => { release = resolve; }));
  await view.select(piece);
  expect(node.textContent).toBe('Old saved core');
  expect(document.querySelector('[data-core]')).toBe(node);
  await act(async () => release('Current saved core'));
  await view.findByText('Current saved core');
});

test('a committed channel plan follows later server changes while a newer pending selection is retained', async () => {
  let plan;
  const value = { provider: () => new Map(), dedupingInterval: 0 };
  let refresh;
  function Field() {
    plan = useChannelPlanField({ integrationId: 'c1', locale: 'ru', canWrite: true });
    refresh = require('swr').useSWRConfig().mutate;
    return h('output', null, plan.value);
  }
  render(h(SWRConfig, { value }, h(Field)));
  await waitFor(() => expect(reads).toContain(PLAN));
  await act(async () => plan.onChange('autopilot'));
  await act(async () => expect(await plan.commit()).toBe(true));
  server.set(PLAN, { integrationId: 'c1', planMode: 'reserve' });
  await act(async () => refresh(PLAN));
  expect(plan.value).toBe('reserve');
  await act(async () => plan.onChange('autopilot'));
  server.set(PLAN, { integrationId: 'c1', planMode: 'reserve' });
  await act(async () => refresh(PLAN));
  expect(plan.value).toBe('autopilot');
  expect(plan.dirty).toBe(true);
  await act(async () => plan.onChange('reserve'));
  expect(plan.dirty).toBe(false);
  server.set(PLAN, { integrationId: 'c1', planMode: 'draft' });
  await act(async () => refresh(PLAN));
  expect(plan.value).toBe('draft');
});

test('a plan save response cannot clear a selection made while that save was pending', async () => {
  let plan;
  const value = { provider: () => new Map(), dedupingInterval: 0 };
  function Field() {
    plan = useChannelPlanField({ integrationId: 'c1', locale: 'ru', canWrite: true });
    return h('output', null, plan.value);
  }
  render(h(SWRConfig, { value }, h(Field)));
  await waitFor(() => expect(reads).toContain(PLAN));
  await act(async () => plan.onChange('autopilot'));
  let release;
  planWrite = new Promise((resolve) => { release = resolve; });
  let commit;
  await act(async () => { commit = plan.commit(); });
  await act(async () => plan.onChange('draft'));
  await act(async () => { release(); expect(await commit).toBe(true); });
  expect(plan.value).toBe('draft');
  expect(plan.dirty).toBe(true);
});
