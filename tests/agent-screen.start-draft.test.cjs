'use strict';

/**
 * «Сделать в чате» → `/agents/new?start=<step>` (review W3-21 P2-2, owner
 * decision taken by the root session): the screen writes the step's starter
 * into the composer of a new conversation and sends nothing — the person
 * presses send. The screen itself checks the step, the role and that the step
 * is still offered; anything else leaves an empty composer. The parameter is
 * dropped from the address either way.
 *
 * Also P3-4: with AI unavailable a press on the work panel's «Сделать в чате»
 * is not kept for later, so the buttons do not stay disabled and nothing is
 * sent on its own when availability changes.
 *
 * Rendered: the real `AgentScreen` and the real `AgentComposer`; the
 * conversation around the composer is a stand-in that sends a `starter` the
 * way the real one does (on mount, once) and records it.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/agents/new',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
dom.window.matchMedia = (query) => ({
  matches: true,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
});
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const load = require('./helpers/load-tsx.cjs').loadTypeScriptModule;

const h = React.createElement;
const { agentWordsFor } = load('apps/frontend/src/components/agents/agent.copy.ts');
const starters = load('apps/frontend/src/components/agents/agent.starters.ts');
const STARTERS = agentWordsFor('ru').start.starters;

const NONE = {
  channels: 0,
  avatars: 0,
  facts: 0,
  pieceFacts: 0,
  pieces: 0,
  drafts: 0,
  scheduled: 0,
  adaptations: 0,
  planModes: 0,
  voiceSamples: 0,
  latestPieceId: null,
};

const composer = loadWithMocks('apps/frontend/src/components/agents/agent.composer.tsx', {
  react: React,
  '@contentfactory/frontend/components/ui/allowance-hint': { AllowanceHint: () => null },
});

let world;

const reset = () => {
  window.sessionStorage.clear();
  world = {
    sessions: new Map(),
    switcher: null,
    role: 'ADMIN',
    progress: { ...NONE },
    answered: true,
    routeId: 'new',
    available: true,
    sent: [],
    submitted: [],
    conversations: 0,
    calls: [],
    conversationProps: null,
    assistant: null,
    history: null,
  };
};

const Conversation = (props) => {
  world.conversationProps = props;
  world.sessions.set(props.threadId ?? "new", props);
  React.useEffect(() => {
    world.conversations += 1;
  }, []);
  React.useEffect(() => {
    if (props.starter) {
      world.sent.push(props.starter);
      props.onStarterUsed();
    }
  }, [props.starter]);
  return h(composer.AgentComposer, {
    busy: false,
    queued: false,
    onSubmit: (message) => world.submitted.push(message.text),
    onStop: () => {},
    words: props.words,
    draft: props.draft,
    onDraftUsed: props.onDraftUsed,
    draftStorageKey: props.draftStorageKey,
  });
};

const Gate = ({ children, onUnavailable }) => {
  const unavailable = !world.available;
  React.useEffect(() => {
    onUnavailable?.(unavailable);
  }, [onUnavailable, unavailable]);
  return unavailable ? h('p', { 'data-gate': 'unavailable' }, 'ИИ не подключён') : children;
};
const request = async (url, init = {}) => {
  world.calls.push({ url, ...init });
  if (!init.method && world.history && url.startsWith('/agent/threads/')) return world.history;
  return { ok: true, status: 200, json: async () => init.method === 'PATCH' ? { workspace: { version: 'assistant-workspace/v1', ...JSON.parse(init.body) } } : { thread: null, messages: [], pending: [] } };
};
const translate = (_, fallback) => fallback;

const screenModule = loadWithMocks('apps/frontend/src/components/agents/agent.screen.tsx', {
  react: React,
  'next/navigation': {
    useParams: () => ({ id: world.routeId }),
    usePathname: () => window.location.pathname,
    useRouter: () => ({ push: () => {} }),
  },
  '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => 'ru' },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => translate },
  // An existing conversation loads an empty history.
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => request,
  },
  '@contentfactory/react/form/button': {
    Button: ({ children, density, variant, ...props }) => h('button', props, children),
  },
  '@contentfactory/frontend/components/ui/surface': {
    ErrorState: () => h('div', { 'data-error': '' }),
    SkeletonRows: () => h('div', { 'data-skeleton': '' }),
  },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => ({ role: world.role }),
  },
  '@contentfactory/frontend/components/onboarding/use-onboarding-progress': {
    useOnboardingProgress: () => ({
      progress: world.progress,
      answered: world.answered,
      loading: !world.answered,
      error: null,
    }),
  },
  './agent.availability': { AgentAvailabilityGate: Gate },
  './agent.conversation': { AgentConversation: Conversation },
  './assistant.workspace-context': { useAssistantWorkspace: () => world.assistant },
  './agent.workspace-shell': { AgentWorkspaceShell: ({ children }) => h('div', { 'data-shared-shell': '' }, children) },
  './agent.artifact-host': { AgentArtifactHost: () => null },
  './agent.artifact-picker': { AgentArtifactPicker: () => null },
  './agent.workspace-browser': { AgentWorkspaceBrowser: ({ onSelect }) => h('button', { type: 'button', 'data-workspace-browser': '', onClick: () => onSelect({ kind: 'avatar', id: 'avatar1', title: 'Avatar', code: null, data: {} }) }, 'Workspace') },
  './agent.piece-data': { useLoadedPiece: () => null, withPieceData: (artifact) => artifact, pieceIdOf: (artifact) => artifact.kind === 'piece' ? artifact.id : null },
  './agent.artifact-metadata': { useArtifactMetadata: () => ({ get: () => undefined }), AgentArtifactLiveStatus: () => null },
  './agent.threads': {
    THREADS_KEY: '/agents/threads',
    ThreadSwitcher: (props) => { world.switcher = props; return h('div', { 'data-switcher': '' }, props.actions); },
    useAgentThreads: () => ({ data: [] }),
  },
  './agent.transport': { screenTimeZone: () => null },
});

// A cache of its own and no deduping timer, so nothing outlives the test.
const drawn = (contextual = false) =>
  h(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0 } }, h(screenModule.AgentScreen, { contextual }));

const open = async (address) => {
  window.history.replaceState(null, '', address);
  let view;
  await act(async () => {
    view = render(drawn());
  });
  await act(async () => {});
  return view;
};

const field = () => document.querySelector('textarea');

beforeEach(reset);
afterEach(cleanup);

test('persistent route and contextual show signal reach the same conversation without remounting or losing composer input', async () => {
  world.routeId = 't1';
  const view = await open('/agents/t1');
  const original = field();
  fireEvent.change(original, { target: { value: 'My pending question' } });
  expect(world.conversationProps.visible).toBe(true);
  const route = async (path, contextual = false) => {
    window.history.replaceState(null, '', path);
    await act(async () => view.rerender(drawn(contextual)));
  };
  await route('/content/pieces/p1');
  expect(world.conversationProps.visible).toBe(false);
  await route('/agents/t1');
  expect(world.conversationProps.visible).toBe(true);
  await route('/content/pieces/p1');
  await route('/agents');
  expect(world.conversationProps.visible).toBe(true);
  await route('/content/pieces/p1', true);
  expect(world.conversationProps.visible).toBe(true);
  await route('/content/pieces/p1', false);
  expect(world.conversationProps.visible).toBe(false);
  await route('/content/pieces/p1', true);
  expect(world.conversationProps.visible).toBe(true);
  expect(field()).toBe(original);
  expect(field().value).toBe('My pending question');
  expect(world.conversations).toBe(1);
  expect(world.sent).toEqual([]);
});

describe('«Сделать в чате» fills the composer and sends nothing', () => {
  test('an open step the role can run: its starter is in the field, nothing sent, the parameter gone', async () => {
    await open('/agents/new?start=avatar');
    expect(field().value).toBe(STARTERS.avatar);
    expect(world.sent).toEqual([]);
    expect(world.submitted).toEqual([]);
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/agents/new');
  });

  test('the person sends it with the composer’s own button', async () => {
    await open('/agents/new?start=avatar');
    await act(async () => {
      fireEvent.submit(document.querySelector('form'));
    });
    expect(world.submitted).toEqual([STARTERS.avatar]);
    expect(world.sent).toEqual([]);
  });

  test('other parameters of the address stay', async () => {
    await open('/agents/new?start=avatar&from=menu');
    expect(window.location.search).toBe('?from=menu');
    expect(field().value).toBe(STARTERS.avatar);
  });

  test.each([
    ['an unknown value', '/agents/new?start=week', () => {}],
    ['a path-like value', '/agents/new?start=..%2Fx', () => {}],
    ['a step the role cannot run (EDITOR, channel)', '/agents/new?start=channel', () => {
      world.role = 'EDITOR';
    }],
    ['any step for a USER', '/agents/new?start=avatar', () => {
      world.role = 'USER';
    }],
    ['a step already done', '/agents/new?start=avatar', () => {
      world.progress = { ...NONE, avatars: 1 };
    }],
    ['an adaptation before any channel', '/agents/new?start=adaptation', () => {}],
  ])('ignored: %s — empty field, nothing sent, parameter dropped', async (_name, address, arrange) => {
    arrange();
    await open(address);
    expect(field().value).toBe('');
    expect(world.sent).toEqual([]);
    expect(window.location.search).toBe('');
  });

  test('ignored on an existing conversation', async () => {
    world.routeId = 't1';
    await open('/agents/t1?start=avatar');
    await act(async () => {});
    expect(field().value).toBe('');
    expect(world.sent).toEqual([]);
    expect(window.location.search).toBe('');
  });

  test('waits for the workspace to answer before deciding, then fills once', async () => {
    world.answered = false;
    const view = await open('/agents/new?start=piece');
    expect(field().value).toBe('');
    expect(window.location.search).toBe('');
    world.answered = true;
    await act(async () => {
      view.rerender(drawn());
    });
    expect(field().value).toBe(STARTERS.piece);
    expect(world.sent).toEqual([]);
  });

  test('AI unavailable: nothing mounts, nothing sent, and nothing is sent later', async () => {
    world.available = false;
    await open('/agents/new?start=avatar');
    expect(document.querySelector('[data-gate="unavailable"]')).not.toBeNull();
    expect(world.conversations).toBe(0);
    expect(world.sent).toEqual([]);
  });
});

describe('explicit workspace browsing with AI unavailable', () => {
  test('opening an existing object stays available, and nothing fires when AI comes back', async () => {
    world.available = false;
    const view = await open('/agents/new');
    const button = document.querySelector('[data-workspace-browser]');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.disabled).toBe(false);
    expect(world.sent).toEqual([]);
    // Availability turns positive later in the visit (a revalidation).
    world.available = true;
    await act(async () => {
      view.rerender(drawn());
    });
    await act(async () => {});
    expect(world.conversations).toBe(1);
    expect(world.sent).toEqual([]);
  });

  test('with AI available an existing object establishes context without sending', async () => {
    await open('/agents/new');
    await act(async () => {
      fireEvent.click(document.querySelector('[data-workspace-browser]'));
    });
    expect(world.sent).toEqual([]);
    expect(world.conversationProps.openArtifact.id).toBe('avatar1');
    expect(document.querySelector('[data-workspace-browser]').disabled).toBe(false);
  });
});

describe('shared assistant session routing and first-turn persistence', () => {
  test('a late history read cannot override an explicit object selected while loading', async () => {
    world.routeId = 'thread1';
    world.assistant = { workContext: null, requestedThreadId: null, requestVersion: 0, contextVersion: 0, rememberThread: () => {}, setWorkContext: (context, artifact) => { world.assistant = { ...world.assistant, workContext: context, contextArtifact: artifact }; } };
    let resolve;
    world.history = new Promise((done) => { resolve = done; });
    await open('/agents/thread1');
    await act(async () => fireEvent.click(document.querySelector('[data-workspace-browser]')));
    expect(world.assistant.workContext).toMatchObject({ kind: 'avatar', id: 'avatar1' });
    await act(async () => resolve({ ok: true, status: 200, json: async () => ({ thread: null, messages: [], pending: [], workspace: { version: 'assistant-workspace/v1', workContext: { version: 'assistant-work-context/v1', kind: 'piece', id: 'oldPiece' }, artifacts: [{ kind: 'piece', id: 'oldPiece' }], activeArtifact: { kind: 'piece', id: 'oldPiece' } } }) }));
    expect(world.conversationProps.openArtifact.id).toBe('avatar1');
    expect(world.assistant.workContext).toMatchObject({ kind: 'avatar', id: 'avatar1' });
  });

  test('a late context refresh from a previous conversation cannot replace the new context revision', async () => {
    const context = { version: 'assistant-work-context/v1', kind: 'piece', id: 'piece1', revision: 'r1' };
    world.assistant = { workContext: context, requestedThreadId: null, requestVersion: 0, contextVersion: 0, rememberThread: () => {}, setWorkContext: (next) => { world.assistant = { ...world.assistant, workContext: next }; } };
    const view = await open('/agents/new');
    const oldRefresh = world.conversationProps.onWorkContext;
    await act(async () => world.conversationProps.onNewConversation());
    world.assistant = { ...world.assistant, workContext: { ...context, revision: 'r2' } };
    await act(async () => view.rerender(drawn()));
    await act(async () => oldRefresh({ ...context, revision: 'r1' }));
    expect(world.assistant.workContext.revision).toBe('r2');
    await act(async () => world.conversationProps.onWorkContext({ ...context, revision: 'r3' }));
    expect(world.assistant.workContext.revision).toBe('r3');
  });

  test('an automatically accepted produced object becomes the next turn current context', async () => {
    world.assistant = { workContext: null, requestedThreadId: null, requestVersion: 0, contextVersion: 0, rememberThread: () => {}, setWorkContext: (context, artifact) => { world.assistant = { ...world.assistant, workContext: context, contextArtifact: artifact }; } };
    const view = await open('/agents/new');
    await act(async () => world.conversationProps.onArtifacts([{ kind: 'piece', id: 'piece1', title: 'Piece one', code: null, data: {} }]));
    await act(async () => view.rerender(drawn()));
    expect(world.conversationProps.openArtifact.id).toBe('piece1');
    expect(world.conversationProps.workContext).toMatchObject({ version: 'assistant-work-context/v1', kind: 'piece', id: 'piece1' });
  });

  test('reopening the same manual context before the first send retains the unsent composer', async () => {
    world.routeId = 'piece1';
    world.assistant = { workContext: { version: 'assistant-work-context/v1', kind: 'piece', id: 'piece1' }, requestedThreadId: null, requestVersion: 1, contextVersion: 1, rememberThread: () => {}, setWorkContext: () => {} };
    const view = await open('/content/pieces/piece1');
    await act(async () => fireEvent.change(field(), { target: { value: 'keep this unsent instruction' } }));
    world.assistant = { ...world.assistant, requestVersion: 2 };
    await act(async () => view.rerender(drawn()));
    expect(field().value).toBe('keep this unsent instruction');
    expect(world.conversations).toBe(1);
    expect(world.submitted).toEqual([]);
  });

  test('a manual piece id is not loaded as a conversation and the first response keeps its route', async () => {
    world.routeId = 'piece1';
    await open('/content/pieces/piece1');
    expect(world.conversationProps.threadId).toBeNull();
    expect(world.calls.some((call) => call.url.includes('/agent/threads/piece1'))).toBe(false);
    await act(async () => world.conversationProps.onThreadId('thread1'));
    expect(window.location.pathname).toBe('/content/pieces/piece1');
  });

  test('all results from turn one are persisted after a new thread receives its id', async () => {
    await open('/agents/new');
    const objects = ['one', 'two'].map((id) => ({ kind: 'piece', id, title: id, code: null, data: { id } }));
    await act(async () => {
      world.conversationProps.onArtifacts(objects);
      world.conversationProps.onThreadId('thread1');
    });
    await waitFor(() => expect(world.calls.some((call) => call.url === '/agent/threads/thread1/workspace' && call.method === 'PATCH')).toBe(true));
    const saved = world.calls.filter((call) => call.method === 'PATCH').at(-1);
    expect(JSON.parse(saved.body).artifacts.map((item) => item.id)).toEqual(['one', 'two']);
    expect(JSON.parse(saved.body).activeArtifact.id).toBe('two');
    expect(window.location.pathname).toBe('/agents/thread1');
  });
});

describe('startDraftStep — the screen’s decision', () => {
  const decide = (value, over = {}) =>
    starters.startDraftStep(value, { newThread: true, role: 'ADMIN', progress: NONE, ...over });

  test('an offered step on a new conversation', () => {
    expect(decide('avatar')).toBe('avatar');
    expect(decide('channel')).toBe('channel');
    expect(decide('plan', { progress: { ...NONE, channels: 1 } })).toBe('plan');
  });

  test('refused: not a step, not new, not the role’s, done, or no channel yet', () => {
    expect(decide('week')).toBeNull();
    expect(decide(null)).toBeNull();
    expect(decide('avatar', { newThread: false })).toBeNull();
    expect(decide('channel', { role: 'EDITOR' })).toBeNull();
    expect(decide('avatar', { role: 'USER' })).toBeNull();
    expect(decide('avatar', { progress: { ...NONE, avatars: 1 } })).toBeNull();
    expect(decide('adaptation')).toBeNull();
    expect(decide('plan')).toBeNull();
  });
});

/**
 * «Спросить агента» from the post window (`content-factory-next-kcxz.28`):
 * `/agents/new?from=editor` takes the hand-over the window left in
 * `sessionStorage`, writes the request into the composer of a new
 * conversation and sends nothing. The words never travel in the address.
 */
describe('«Спросить агента» fills the composer from the post window and sends nothing', () => {
  const handoff = load('apps/frontend/src/components/agents/agent.handoff.ts');
  const FROM = agentWordsFor('ru').panel.fromEditor;
  const leave = (value) => handoff.writeEditorHandoff(window.sessionStorage, value);

  beforeEach(() => window.sessionStorage.clear());

  test('a post from a piece: named by the piece and the channel; parameter and hand-over gone', async () => {
    leave({ piece: 'Весенний запуск', code: 'cnt-07', channel: 'Кофейня', text: 'текст поста' });
    await open(handoff.AGENT_FROM_EDITOR_HREF);
    expect(field().value).toBe(FROM.piece('Весенний запуск', 'cnt-07', 'Кофейня'));
    // The code names the piece where two share a title (review W6-28 F3).
    expect(field().value).toBe('Про пост из заготовки «Весенний запуск» (cnt-07) для канала «Кофейня»: ');
    expect(world.sent).toEqual([]);
    expect(world.submitted).toEqual([]);
    expect(window.location.search).toBe('');
    expect(window.sessionStorage.getItem(handoff.EDITOR_HANDOFF_KEY)).toBeNull();
  });

  test('a post written by hand: its text, with the offer to make a piece of it', async () => {
    leave({ piece: null, channel: null, text: 'Первый абзац\n\nВторой абзац' });
    await open(handoff.AGENT_FROM_EDITOR_HREF);
    expect(field().value).toBe('Сделай из этого текста заготовку и пост:\n\nПервый абзац\n\nВторой абзац');
    expect(world.sent).toEqual([]);
  });

  test('an empty window: the «one thought» request', async () => {
    leave({ piece: null, channel: 'Кофейня', text: '' });
    await open(handoff.AGENT_FROM_EDITOR_HREF);
    expect(field().value).toBe(FROM.empty('Кофейня'));
  });

  test('the person sends it with the composer’s own button', async () => {
    leave({ piece: 'Весенний запуск', channel: null, text: '' });
    await open(handoff.AGENT_FROM_EDITOR_HREF);
    await act(async () => {
      fireEvent.change(field(), { target: { value: `${field().value}сделай короче` } });
    });
    await act(async () => {
      fireEvent.submit(document.querySelector('form'));
    });
    expect(world.submitted).toEqual(['Про пост из заготовки «Весенний запуск»: сделай короче']);
    expect(world.sent).toEqual([]);
  });

  test('without a hand-over, and with words in the address, the field stays empty', async () => {
    await open('/agents/new?from=editor&text=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82');
    expect(field().value).toBe('');
    expect(world.sent).toEqual([]);
  });

  test('a hand-over is not read without the mark in the address', async () => {
    leave({ piece: 'Весенний запуск', channel: null, text: '' });
    await open('/agents/new');
    expect(field().value).toBe('');
    expect(window.sessionStorage.getItem(handoff.EDITOR_HANDOFF_KEY)).not.toBeNull();
  });

  test('ignored on an existing conversation, and the hand-over is spent', async () => {
    world.routeId = 't1';
    leave({ piece: 'Весенний запуск', channel: null, text: '' });
    await open('/agents/t1?from=editor');
    expect(field().value).toBe('');
    expect(window.location.search).toBe('');
    expect(window.sessionStorage.getItem(handoff.EDITOR_HANDOFF_KEY)).toBeNull();
  });
});


test('switching threads preserves each SDK/composer session and isolates late first-thread events', async () => {
  world.routeId = 't1';
  const view = await open('/agents/t1');
  const first = view.getByRole('textbox');
  fireEvent.change(first, { target: { value: 'Draft for first thread' } });
  const previous = world.sessions.get('t1');
  await act(async () => world.switcher.onOpen('t2'));
  await waitFor(() => expect(world.switcher.threadId).toBe('t2'));
  const second = view.getByRole('textbox');
  expect(second).not.toBe(first);
  fireEvent.change(second, { target: { value: 'Draft for second thread' } });
  await act(async () => {
    previous.onThreadId('t1');
    previous.onArtifacts([{ kind: 'piece', id: 'late-first', title: 'Late first-thread material', code: null, data: {} }]);
  });
  expect(world.switcher.threadId).toBe('t2');
  expect(view.getByRole('textbox')).toBe(second);
  expect(second.value).toBe('Draft for second thread');
  await act(async () => world.switcher.onOpen('t1'));
  expect(view.getByRole('textbox')).toBe(first);
  expect(first.value).toBe('Draft for first thread');
  expect(world.conversations).toBe(2);
  expect(world.submitted).toEqual([]);
  expect(world.calls.filter((call) => call.method === 'POST')).toEqual([]);
});

test('new unsent chat remains local and its draft is recovered by the visible New chat action', async () => {
  const view = await open('/agents/new');
  const first = view.getByRole('textbox');
  fireEvent.change(first, { target: { value: 'Unsent separate chat' } });
  await act(async () => world.switcher.onOpen('t1'));
  await waitFor(() => expect(world.switcher.threadId).toBe('t1'));
  await act(async () => world.switcher.onNew());
  expect(world.switcher.threadId).toBe(null);
  expect(view.getByRole('textbox')).toBe(first);
  expect(first.value).toBe('Unsent separate chat');
  expect(world.calls.filter((call) => call.method === 'POST')).toEqual([]);
});

test('actor and thread scoped unsent text survives reload without storing transcript or replaying send', async () => {
  world.routeId = 't1';
  let view = await open('/agents/t1');
  fireEvent.change(view.getByRole('textbox'), { target: { value: 'Reload this unsent text' } });
  expect(window.sessionStorage.getItem('cf-assistant-draft/v1:::t1')).toBe('Reload this unsent text');
  view.unmount();
  view = await open('/agents/t1');
  expect(view.getByRole('textbox').value).toBe('Reload this unsent text');
  expect(world.submitted).toEqual([]);
});

test('direct thread routes and back/forward select the same native sessions without clearing drafts', async () => {
  world.routeId = 'deep-a';
  const view = await open('/agents/deep-a');
  const first = view.getByRole('textbox');
  fireEvent.change(first, { target: { value: 'Route A draft' } });
  const route = async (id) => {
    world.routeId = id;
    window.history.replaceState(null, '', `/agents/${id}`);
    await act(async () => view.rerender(drawn()));
    await waitFor(() => expect(world.switcher.threadId).toBe(id));
  };
  await route('deep-b');
  const second = view.getByRole('textbox');
  fireEvent.change(second, { target: { value: 'Route B draft' } });
  await route('deep-a');
  expect(view.getByRole('textbox')).toBe(first);
  expect(first.value).toBe('Route A draft');
  await route('deep-b');
  expect(view.getByRole('textbox')).toBe(second);
  expect(second.value).toBe('Route B draft');
  expect(world.conversations).toBe(2);
  expect(world.calls.filter((call) => call.method === 'POST')).toEqual([]);
});
