'use strict';

/**
 * «Спросить агента» in the post window (`content-factory-next-kcxz.28`).
 *
 * The CopilotKit helper that rewrote the post in place went with W6. One
 * button replaces it: it says what the post is — the piece it came from, the
 * channel, and for a hand-written post its text — and opens a new agent
 * conversation with that request in the composer. It never sends: the agent
 * screen's half is in `agent-screen.start-draft.test.cjs`.
 */

const React = require('react');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/launches' });
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const load = require('./helpers/load-tsx.cjs').loadTypeScriptModule;

const h = React.createElement;
const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const handoff = load('apps/frontend/src/components/agents/agent.handoff.ts');
const { agentWordsFor } = load('apps/frontend/src/components/agents/agent.copy.ts');
const { composeCopy } = load('apps/frontend/src/components/new-launch/compose.copy.ts');

let world;
const reset = () => {
  world = {
    confirm: true,
    pushed: [],
    closed: 0,
    posts: [],
    current: 'global',
    internal: [],
    global: [],
    selected: [],
  };
  window.sessionStorage.clear();
};

const button = loadWithMocks('apps/frontend/src/components/new-launch/ask-agent.button.tsx', {
  react: React,
  'next/navigation': { useRouter: () => ({ push: (href) => world.pushed.push(href) }) },
  'zustand/react/shallow': { useShallow: (select) => select },
  '@contentfactory/react/form/button': {
    Button: ({ children, variant, ...props }) => h('button', props, children),
  },
  '@contentfactory/react/helpers/delete.dialog': { deleteDialog: async () => world.confirm },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
  '@contentfactory/frontend/components/new-launch/store': {
    useLaunchStore: (select) =>
      select({ current: world.current, internal: world.internal, global: world.global, selectedIntegrations: world.selected }),
  },
  '@contentfactory/frontend/components/launches/helpers/use.existing.data': {
    useExistingData: () => ({ posts: world.posts }),
  },
});

const press = async () => {
  render(h(button.AskAgentButton, { label: composeCopy.ru.askAgent, close: () => (world.closed += 1) }));
  await act(async () => {
    fireEvent.click(document.querySelector('button'));
  });
};

const stored = () => JSON.parse(window.sessionStorage.getItem(handoff.EDITOR_HANDOFF_KEY));

beforeEach(reset);
afterEach(cleanup);

describe('the button', () => {
  test('is labelled «Спросить агента»', async () => {
    render(h(button.AskAgentButton, { label: composeCopy.ru.askAgent, close: () => {} }));
    expect(document.querySelector('button').textContent).toBe('Спросить агента');
    expect(composeCopy.en.askAgent).toBe('Ask the agent');
  });

  test('a post from a piece: hands over the piece and the one channel, closes, opens a new conversation', async () => {
    world.posts = [{ piece: { id: 'p1', code: 'cnt-01', title: 'Весенний запуск' } }];
    world.global = [{ content: '<p>Текст</p>' }];
    world.selected = [{ integration: { name: 'Кофейня' } }];
    await press();
    expect(stored()).toEqual({ piece: 'Весенний запуск', code: 'cnt-01', channel: 'Кофейня', text: 'Текст' });
    expect(world.closed).toBe(1);
    expect(world.pushed).toEqual(['/agents/new?from=editor']);
    // The address carries the mark only, never the words.
    expect(world.pushed[0]).not.toMatch(/Весенний|Текст/);
  });

  test('a hand-written post: its parts as plain text; several channels name none', async () => {
    world.global = [{ content: '<p>Первый <strong>абзац</strong></p>' }, { content: '' }, { content: '<p>Второй</p>' }];
    world.selected = [{ integration: { name: 'A' } }, { integration: { name: 'B' } }];
    await press();
    expect(stored()).toEqual({ piece: null, code: null, channel: null, text: 'Первый абзац\n\nВторой' });
  });

  test('refusing to leave keeps the window: nothing handed over, nothing opened', async () => {
    world.confirm = false;
    world.global = [{ content: '<p>Текст</p>' }];
    await press();
    expect(window.sessionStorage.getItem(handoff.EDITOR_HANDOFF_KEY)).toBeNull();
    expect(world.closed).toBe(0);
    expect(world.pushed).toEqual([]);
  });
});

describe('the hand-over', () => {
  const FROM = agentWordsFor('ru').panel.fromEditor;

  test('is taken once', () => {
    handoff.writeEditorHandoff(window.sessionStorage, { piece: 'X', code: 'cnt-3', channel: null, text: '' });
    expect(handoff.takeEditorHandoff(window.sessionStorage)).toEqual({ piece: 'X', code: 'cnt-3', channel: null, text: '' });
    expect(handoff.takeEditorHandoff(window.sessionStorage)).toBeNull();
  });

  test('a malformed value is spent and ignored', () => {
    window.sessionStorage.setItem(handoff.EDITOR_HANDOFF_KEY, '{not json');
    expect(handoff.takeEditorHandoff(window.sessionStorage)).toBeNull();
    expect(window.sessionStorage.getItem(handoff.EDITOR_HANDOFF_KEY)).toBeNull();
    window.sessionStorage.setItem(handoff.EDITOR_HANDOFF_KEY, JSON.stringify({ piece: 7, code: 'x; drop', text: ['x'] }));
    expect(handoff.takeEditorHandoff(window.sessionStorage)).toEqual({ piece: null, code: null, channel: null, text: '' });
  });

  test('a long text is cut to what a message holds', () => {
    const made = handoff.editorHandoffFrom({ piece: null, channels: [], texts: ['я'.repeat(handoff.EDITOR_TEXT_IN_DRAFT + 50)] });
    expect(made.text).toHaveLength(handoff.EDITOR_TEXT_IN_DRAFT);
  });

  test('the words: piece first, then text, then the «one thought» request — in both languages', () => {
    expect(handoff.editorDraft(FROM, { piece: 'X', code: 'cnt-2', channel: 'K', text: 't' })).toBe(FROM.piece('X', 'cnt-2', 'K'));
    expect(handoff.editorDraft(FROM, { piece: 'X', code: null, channel: null, text: '' })).toBe('Про пост из заготовки «X»: ');
    expect(handoff.editorDraft(FROM, { piece: null, code: null, channel: null, text: 't' })).toBe(FROM.text('t', null));
    expect(handoff.editorDraft(FROM, { piece: null, code: null, channel: null, text: '' })).toBe('Напишем пост из одной мысли: ');
    const en = agentWordsFor('en').panel.fromEditor;
    expect(en.piece('X', 'cnt-2', 'K')).toBe('About the post from the piece “X” (cnt-2) for the channel “K”: ');
  });
});

describe('the post window', () => {
  const MODAL = read('apps/frontend/src/components/new-launch/manage.modal.tsx');
  const EDITOR = read('apps/frontend/src/components/new-launch/editor.tsx');

  test('shows the button only where the agent can answer, to a writer, outside sets, preview and the extension', () => {
    expect(MODAL).toMatch(
      /\{agentAvailable && canWritePosts && !addEditSets && !dummy && !extension && \(\s*<AskAgentButton\s+label=\{composeCopy\[voiceLocale\]\.askAgent\}/
    );
    expect(MODAL).toMatch(/const \{ addEditSets, mutate, customClose, dummy, extension \} = props;/);
  });

  test('review W6-28 F2: the extension frame opens the window with `extension`, so the button is not offered', () => {
    const standalone = read('apps/frontend/src/components/standalone-modal/standalone.modal.tsx');
    expect(standalone).toMatch(/<AddEditModal[\s\S]*?\n\s+extension\n[\s\S]*?\/>/);
    expect(read('apps/frontend/src/components/new-launch/add.edit.modal.tsx')).toMatch(/extension\?: boolean;/);
    expect(read('apps/frontend/src/components/new-launch/add.edit.modal.tsx')).toMatch(/<ManageModal \{\.\.\.props\} \/>/);
    expect(MODAL).toMatch(/const agentAvailable = useAssistantAvailable\(true\);/);
  });

  test('the helper, its provider and its in-place text action are gone', () => {
    for (const source of [MODAL, EDITOR]) {
      expect(source).not.toMatch(/AssistantPopup|CopilotProvider|useCopilot|setPosts|EditorCopilotBridge/);
    }
  });
});

/**
 * Review W6-28 F1: the window keeps an existing post's parts in `internal`
 * for its channel, and `global` is the empty placeholder. The hand-over must
 * carry the text the window shows. Real store, filled the way
 * `add.edit.modal.tsx` fills it for an existing post.
 */
describe('the text handed over is the text the window shows (real store)', () => {
  const { useLaunchStore } = load('apps/frontend/src/components/new-launch/store.ts');
  const real = loadWithMocks('apps/frontend/src/components/new-launch/ask-agent.button.tsx', {
    react: React,
    'next/navigation': { useRouter: () => ({ push: (href) => world.pushed.push(href) }) },
    '@contentfactory/react/form/button': {
      Button: ({ children, variant, ...props }) => h('button', props, children),
    },
    '@contentfactory/react/helpers/delete.dialog': { deleteDialog: async () => true },
    '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
    '@contentfactory/frontend/components/new-launch/store': { useLaunchStore },
    '@contentfactory/frontend/components/launches/helpers/use.existing.data': {
      useExistingData: () => ({ posts: world.posts }),
    },
  });
  const channel = { id: 'ch-1', name: 'Кофейня', identifier: 'telegram', picture: '', disabled: false };

  const openExisting = (parts) => {
    const store = useLaunchStore.getState();
    store.reset();
    store.addOrRemoveSelectedIntegration(channel, {});
    store.addInternalValue(0, channel.id, parts.map((content, i) => ({ id: `p${i}`, content, media: [], delay: 0, usedCitationIds: [] })));
    store.setCurrent(channel.id);
    store.addGlobalValue(0, [{ id: 'g', content: '', media: [], usedCitationIds: [] }]);
  };

  const pressReal = async () => {
    render(h(real.AskAgentButton, { label: 'Спросить агента', close: () => (world.closed += 1) }));
    await act(async () => {
      fireEvent.click(document.querySelector('button'));
    });
  };

  afterEach(() => useLaunchStore.getState().reset());

  test('an existing hand-written post: its channel’s parts, not the empty global', async () => {
    openExisting(['<p>Пост из календаря</p>', '<p>Второй комментарий</p>']);
    expect(useLaunchStore.getState().global.map((v) => v.content)).toEqual(['']);
    await pressReal();
    expect(stored()).toEqual({
      piece: null,
      code: null,
      channel: 'Кофейня',
      text: 'Пост из календаря\n\nВторой комментарий',
    });
  });

  test('the shared text, when the window shows the shared text', async () => {
    const store = useLaunchStore.getState();
    store.reset();
    store.addGlobalValue(0, [{ id: 'g', content: '<p>Общий текст</p>', media: [], usedCitationIds: [] }]);
    await pressReal();
    expect(stored().text).toBe('Общий текст');
  });

  test('an existing post shown under «global» still hands over its one channel’s text', async () => {
    openExisting(['<p>Свой текст канала</p>']);
    useLaunchStore.getState().setCurrent('global');
    await pressReal();
    expect(stored().text).toBe('Свой текст канала');
  });
});
