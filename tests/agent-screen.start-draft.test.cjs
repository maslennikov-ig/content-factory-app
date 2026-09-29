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

const { act, cleanup, fireEvent, render } = require('@testing-library/react');
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
  world = {
    role: 'ADMIN',
    progress: { ...NONE },
    answered: true,
    routeId: 'new',
    available: true,
    sent: [],
    submitted: [],
    conversations: 0,
  };
};

const Conversation = (props) => {
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
  });
};

const Gate = ({ children, onUnavailable }) => {
  const unavailable = !world.available;
  React.useEffect(() => {
    onUnavailable?.(unavailable);
  }, [onUnavailable, unavailable]);
  return unavailable ? h('p', { 'data-gate': 'unavailable' }, 'ИИ не подключён') : children;
};

const screenModule = loadWithMocks('apps/frontend/src/components/agents/agent.screen.tsx', {
  react: React,
  'next/navigation': {
    useParams: () => ({ id: world.routeId }),
    useRouter: () => ({ push: () => {} }),
  },
  '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => 'ru' },
  // An existing conversation loads an empty history.
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => async () => ({ ok: true, status: 200, json: async () => ({ thread: null, messages: [], pending: [] }) }),
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
  './agent.panel': {
    ArtifactColumn: ({ empty }) => h('aside', {}, empty),
    ArtifactSheet: () => null,
    WorkspaceSteps: ({ busy, onStarter }) =>
      h('button', { type: 'button', 'data-panel-step': 'avatar', disabled: busy, onClick: () => onStarter('avatar') }, 'Сделать в чате'),
  },
  './agent.threads': {
    THREADS_KEY: '/agents/threads',
    ThreadSwitcher: () => h('div', { 'data-switcher': '' }),
    useAgentThreads: () => ({ data: [] }),
  },
  './agent.transport': { screenTimeZone: () => null },
});

// A cache of its own and no deduping timer, so nothing outlives the test.
const drawn = () =>
  h(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0 } }, h(screenModule.AgentScreen));

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

describe('the work panel with AI unavailable (review W3-21 P3-4)', () => {
  test('a press is dropped, the button stays enabled, and nothing fires when AI comes back', async () => {
    world.available = false;
    const view = await open('/agents/new');
    const button = document.querySelector('[data-panel-step]');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(document.querySelector('[data-panel-step]').disabled).toBe(false);
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

  test('with AI available a press sends the starter at once', async () => {
    await open('/agents/new');
    await act(async () => {
      fireEvent.click(document.querySelector('[data-panel-step]'));
    });
    expect(world.sent).toEqual([STARTERS.avatar]);
    expect(document.querySelector('[data-panel-step]').disabled).toBe(false);
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
