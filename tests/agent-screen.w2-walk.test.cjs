'use strict';

/**
 * The agent screen after the live stand walk of W2 (27.09.2026,
 * `content-factory-next-kcxz.31`; evidence
 * `.codex/stages/content-factory-next-kcxz/evidence/live-stand-w2-2026-09-27/`).
 *
 * The screen-side defects, each held where it lived: a card further up that
 * went dead while the server still waited for it (D2), the panel that kept
 * answered questions and an old text (D6), the adaptation opened on «Суть»
 * and named «Адаптация Адаптация» (D8), the piece header that wrapped at 1440
 * (D9), a count of open questions from the creation moment (D12), the empty
 * box that looked ticked on hover (D13) and write starters offered to a USER
 * (D14).
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/agents/t1',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render, fireEvent } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const h = React.createElement;

const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const ru = copy.agentCopy.ru;

afterEach(cleanup);

/* ---- A conversation, rendered with its network and chat replaced ---------- */

const SELECTION_PAYLOAD = {
  kind: 'selection',
  question: 'Отметьте факты, на которые опираемся',
  answerKey: 'factKeys',
  canDecideForPerson: true,
  cardId: 'card-1',
  options: [
    { id: 'f1', label: 'Первый факт', selected: true, status: 'confirmed', source: 'a.org' },
    { id: 'f2', label: 'Второй факт', selected: false, status: 'confirmed', source: 'b.org' },
  ],
};

const olderCard = {
  id: 'm1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-piece_create',
      toolCallId: 'call-1',
      state: 'input-available',
      title: 'Новая заготовка',
      input: {},
    },
    {
      type: 'data-tool-call-suspended',
      data: {
        toolCallId: 'call-1',
        runId: 'run-1',
        toolName: 'piece_create',
        suspendPayload: SELECTION_PAYLOAD,
      },
    },
  ],
};
const person = { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Сначала другое' }] };
const laterReply = { id: 'm3', role: 'assistant', parts: [{ type: 'text', text: 'Хорошо.' }] };

const PENDING = [
  {
    runId: 'run-1',
    toolCallId: 'call-1',
    toolName: 'piece_create',
    kind: 'question',
    suspendPayload: SELECTION_PAYLOAD,
    summary: null,
  },
];

const loadConversation = ({ chat, request, mutate, role = 'EDITOR' }) =>
  loadWithMocks('apps/frontend/src/components/agents/agent.conversation.tsx', {
    react: React,
    '@ai-sdk/react': {
      useChat: (options) => {
        chat.options = options;
        return {
          messages: chat.messages ?? options.messages,
          status: chat.status ?? 'ready',
          sendMessage: (...args) => chat.sent.push(args),
          stop: () => {},
          error: undefined,
          clearError: () => {},
          regenerate: () => {},
          addToolApprovalResponse: () => {},
        };
      },
    },
    ai: { lastAssistantMessageIsCompleteWithApprovalResponses: () => false },
    swr: {
      __esModule: true,
      default: () => ({ data: undefined }),
      useSWRConfig: () => ({ mutate }),
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
    '@contentfactory/frontend/components/onboarding/use-onboarding-progress': {
      useOnboardingProgress: () => ({ progress: {}, answered: true, error: false }),
    },
    '@contentfactory/frontend/components/onboarding/onboarding.adapter': {
      ONBOARDING_STEP_KEYS: ['avatar', 'channel', 'piece', 'adaptation', 'plan'],
      stepIsDone: () => false,
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role }),
    },
    '@contentfactory/frontend/components/ui/allowance-hint': { ALLOWANCE_API: '/allowance' },
    './agent.threads': { THREADS_KEY: '/agent/threads' },
    './agent.transport': {
      createAgentTransport: () => ({}),
      screenTimeZone: () => 'Europe/Moscow',
    },
    './agent.composer': { AgentComposer: () => null },
    './agent.markdown': { AgentMarkdown: ({ text }) => h('p', null, text) },
  });

const drawConversation = async ({ messages, pending, role, request, mutate = () => {} }) => {
  const chat = { sent: [], messages: null, status: 'ready' };
  const { AgentConversation } = loadConversation({ chat, request, mutate, role });
  const props = {
    threadId: 't1',
    initialMessages: messages,
    pending,
    onThreadId: () => {},
    onTitle: () => {},
    onArtifact: () => {},
    openArtifact: null,
    onArtifactRemoved: () => {},
    starter: null,
    onStarterUsed: () => {},
    words: ru,
  };
  let view;
  await act(async () => {
    view = render(h(AgentConversation, props));
  });
  return { chat, view, props, AgentConversation };
};

const keepButton = () => document.querySelector('[data-agent-selection-keep]');

describe('D2 — a card further up answers while the server waits for it', () => {
  test('pending on the server: the older selection card is live and sends its answer', async () => {
    const { chat } = await drawConversation({
      messages: [olderCard, person, laterReply],
      pending: PENDING,
      request: async () => ({ ok: false }),
    });
    expect(keepButton()).not.toBeNull();
    expect(keepButton().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(keepButton());
    });
    expect(chat.sent[0][1].body.resume).toMatchObject({
      runId: 'run-1',
      toolCallId: 'call-1',
      cardId: 'card-1',
      resumeData: { factKeys: ['f1'] },
    });
  });

  test('no longer pending (after a reload): the card says so instead of going dead', async () => {
    await drawConversation({
      messages: [olderCard, person, laterReply],
      pending: [],
      request: async () => ({ ok: false }),
    });
    expect(keepButton()).toBeNull();
    const line = document.querySelector('[data-agent-question="closed"]');
    expect(line.textContent).toBe(
      `${ru.selection.kind}: ${SELECTION_PAYLOAD.question} — больше не ждёт ответа`
    );
  });

  test('a pending entry for another card of the same call does not keep this one', () => {
    const block = { runId: 'run-1', toolCallId: 'call-1', cardId: 'card-old' };
    expect(contract.questionWaits(PENDING, block)).toBe(false);
    expect(contract.questionWaits(PENDING, { ...block, cardId: 'card-1' })).toBe(true);
    expect(contract.questionWaits(PENDING, { ...block, runId: null })).toBe(false);
  });

  test('live: after a turn the server’s list is read again and decides', async () => {
    const calls = [];
    const request = async (url, init) => {
      calls.push([url, init]);
      return { ok: true, json: async () => ({ thread: { id: 't1' }, messages: [], pending: [] }) };
    };
    const { chat } = await drawConversation({
      messages: [olderCard, person, laterReply],
      pending: PENDING,
      request,
    });
    expect(keepButton()).not.toBeNull();
    await act(async () => {
      chat.options.onFinish({});
    });
    expect(calls[0][0]).toBe('/agent/threads/t1');
    expect(calls[0][1].headers['x-agent-timezone']).toBe('Europe/Moscow');
    expect(keepButton()).toBeNull();
    expect(document.querySelector('[data-agent-question="closed"]')).not.toBeNull();
  });

  test('the last message’s card stays answerable before its turn’s list is read', async () => {
    await drawConversation({
      messages: [person, olderCard],
      pending: [],
      request: async () => ({ ok: false }),
    });
    // Loaded with the thread: the list is the server's word, so it closes.
    expect(keepButton()).toBeNull();
    expect(source('apps/frontend/src/components/agents/agent.conversation.tsx')).toContain(
      '(last && !pendingKnown)'
    );
    expect(source('apps/frontend/src/components/agents/agent.conversation.tsx')).not.toContain(
      'busy || !last'
    );
  });
});

describe('D6 — a tool output about a piece makes its screen read it again', () => {
  const answered = (id) => ({
    id,
    role: 'assistant',
    parts: [
      {
        type: 'tool-piece_answer',
        toolCallId: `call-${id}`,
        state: 'output-available',
        title: 'Ответить на вопросы заготовки',
        input: {},
        output: { ok: true, card: { kind: 'piece', id: 'p1', code: 'cnt-04', questions: 0 } },
      },
    ],
  });
  const reviewed = {
    id: 'm5',
    role: 'assistant',
    parts: [
      {
        type: 'tool-adaptation_review',
        toolCallId: 'call-r',
        state: 'output-available',
        title: 'Убрать следы ИИ',
        input: {},
        output: { ok: true, card: { kind: 'adaptation', id: 'a1', pieceId: 'p2' } },
      },
    ],
  };

  test('the contract names the touched piece once per call; a refusal touches nothing', () => {
    const refused = {
      id: 'm6',
      role: 'assistant',
      parts: [{ ...reviewed.parts[0], toolCallId: 'call-x', output: { ok: false, code: 'X' } }],
    };
    expect(contract.pieceTouchesOf([answered('m4'), reviewed, refused])).toEqual([
      { key: 'm4:call-m4', pieceId: 'p1' },
      { key: 'm5:call-r', pieceId: 'p2' },
    ]);
  });

  test('what the thread loaded with is not re-read; what arrives is, by the piece’s key', async () => {
    const keys = [];
    const { chat, view, props, AgentConversation } = await drawConversation({
      messages: [answered('m4')],
      pending: [],
      request: async () => ({ ok: false }),
      mutate: (key) => keys.push(key),
    });
    expect(keys.filter((key) => key.startsWith('/content-intelligence'))).toEqual([]);
    chat.messages = [answered('m4'), person, reviewed];
    await act(async () => {
      view.rerender(h(AgentConversation, { ...props }));
    });
    expect(keys).toContain('/content-intelligence/pieces/p2');
    expect(keys).not.toContain('/content-intelligence/pieces/p1');
  });
});

describe('D12 — no count of open questions from the creation moment', () => {
  const created = {
    id: 'm1',
    role: 'assistant',
    parts: [
      {
        type: 'tool-piece_create',
        toolCallId: 'c1',
        state: 'output-available',
        title: 'Новая заготовка',
        input: {},
        output: { ok: true, card: { kind: 'piece', id: 'p1', code: 'cnt-04', questions: 2 } },
      },
    ],
  };
  const answeredLater = {
    id: 'm3',
    role: 'assistant',
    parts: [
      {
        type: 'tool-piece_answer',
        toolCallId: 'c2',
        state: 'output-available',
        title: 'Ответить на вопросы заготовки',
        input: {},
        output: { ok: true, card: { kind: 'piece', id: 'p1', code: 'cnt-04', questions: 0 } },
      },
    ],
  };

  test('a later answer in the thread silences the earlier line', async () => {
    await drawConversation({
      messages: [created, person, answeredLater],
      pending: [],
      request: async () => ({ ok: false }),
    });
    expect(document.body.textContent).not.toContain('ждут ответа');
  });

  test('alone, the creation line still says how many wait', async () => {
    await drawConversation({ messages: [created], pending: [], request: async () => ({ ok: false }) });
    expect(document.body.textContent).toContain('2 вопроса ждут ответа');
  });

  test('in one turn the later count wins the merged line', () => {
    const blocks = contract.readMessageBlocks({
      id: 'm1',
      role: 'assistant',
      parts: [...created.parts, ...answeredLater.parts],
    });
    const piece = blocks.filter((block) => block.type === 'artifact');
    expect(piece).toHaveLength(1);
    expect(piece[0].artifact.data.questions).toBe(0);
  });
});

describe('D14 — only the starters the role can run', () => {
  const starters = () =>
    [...document.querySelectorAll('button')].map((button) => button.textContent);

  test('a USER is offered the plan, not the write starters', async () => {
    await drawConversation({ messages: [], pending: [], role: 'USER', request: async () => ({ ok: false }) });
    expect(starters()).toEqual([ru.start.starters.plan]);
  });

  test('an EDITOR writes but does not connect a channel; an ADMIN does both', async () => {
    await drawConversation({ messages: [], pending: [], role: 'EDITOR', request: async () => ({ ok: false }) });
    expect(starters()).toEqual([ru.start.starters.avatar, ru.start.starters.piece, ru.start.starters.plan]);
    cleanup();
    await drawConversation({ messages: [], pending: [], role: 'ADMIN', request: async () => ({ ok: false }) });
    expect(starters()).toHaveLength(4);
  });

  test('the work panel’s steps follow the same rule', () => {
    const panel = source('apps/frontend/src/components/agents/agent.panel.tsx');
    expect(panel).toContain('isDone || !starterAllowed(step, role) ? null');
  });
});

/* ---- D8: the adaptation beside the chat ------------------------------------- */

describe('D8 — an adaptation card with only {id, pieceId}', () => {
  const pieceData = loadTypeScriptModule('apps/frontend/src/components/agents/agent.piece-data.ts');
  const cards = loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');
  const bare = { kind: 'adaptation', id: 'a2', title: null, code: null, data: { id: 'a2', pieceId: 'p1' } };
  const adaptation = (id, integrationId, createdAt) => ({
    id,
    integrationId,
    platform: 'telegram',
    createdAt,
    state: 'draft',
  });
  const piece = {
    targets: [
      {
        platform: 'telegram',
        name: 'Telegram',
        available: true,
        kinds: ['post'],
        channels: [{ id: 'c1', name: 'Кухня продукта', providerIdentifier: 'telegram' }],
      },
    ],
    adaptations: [
      adaptation('a1', 'c1', '2026-09-27T10:00:00Z'),
      adaptation('a2', 'c1', '2026-09-27T11:00:00Z'),
    ],
    core: { questions: { round: 1, items: [{ key: 'q' }], answered: [] } },
  };

  test('the loaded piece gives it its channel and «вариант N»', () => {
    const named = pieceData.withPieceData(bare, piece);
    expect(named.data.channel).toEqual({ id: 'c1', name: 'Кухня продукта' });
    expect(named.data.variant).toBe(2);
    expect(cards.artifactName(named, ru)).toBe('Кухня продукта · вариант 2');
    expect(pieceData.withPieceData({ ...bare, id: 'a1', data: { pieceId: 'p1' } }, piece).data.variant).toBe(1);
  });

  test('without it, the kind is said once, never twice', async () => {
    expect(cards.artifactOwnName(bare, ru)).toBeNull();
    expect(cards.artifactOwnName({ ...bare, title: ru.card.kinds.adaptation }, ru)).toBeNull();
    await act(async () => {
      render(h(cards.ArtifactLine, { artifact: bare, open: false, onOpen: () => {}, words: ru }));
    });
    const line = document.querySelector('[data-agent-artifact="adaptation"]');
    expect(line.textContent.split(ru.card.kinds.adaptation).length - 1).toBe(1);
    expect(line.querySelector('button').getAttribute('aria-label')).toBe(
      `${ru.card.openBeside}: ${ru.card.kinds.adaptation}`
    );
  });

  test('a piece line reads the live count from the loaded piece', () => {
    const line = { kind: 'piece', id: 'p1', title: null, code: 'cnt-04', data: { questions: 2 } };
    expect(pieceData.withPieceData(line, piece).data.questions).toBe(1);
  });

  test('the panel opens the piece on that adaptation, and the piece finds its tab', () => {
    const panel = source('apps/frontend/src/components/agents/agent.panel.tsx');
    expect(panel).toContain('initialAdaptation: adaptationId');
    const container = source(
      'apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx'
    );
    expect(container).toMatch(
      /adaptationPlace\(channels, initialAdaptation\)[\s\S]{0,300}if \(tab === PIECE_TAB_CORE\) changeTab\(place\.channel\.id\)/
    );
  });

  test('the chat reads the piece with the page’s own reader, never first', () => {
    const data = source('apps/frontend/src/components/agents/agent.piece-data.ts');
    expect(data).toContain('fetchPieceDetail(request, pieceId as string)');
    expect(data).toContain('revalidateOnMount: false');
    const container = source(
      'apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx'
    );
    expect(container).toContain('() => fetchPieceDetail(request, pieceId)');
  });
});

/* ---- D9, D13: compiled CSS ------------------------------------------------- */

describe('D9, D13 — the piece header by its container, the empty box stays neutral', () => {
  let rules = [];
  beforeAll(async () => {
    const postcss = require('postcss');
    const tailwind = require('tailwindcss');
    const config = require(path.join(root, 'apps/frontend/tailwind.config.cjs'));
    const raw = [
      'apps/frontend/src/components/content-intelligence/pieces/piece.screen.tsx',
      'apps/frontend/src/components/content-intelligence/intake/selection-rows.tsx',
    ]
      .map(source)
      .join('\n');
    const result = await postcss([tailwind({ ...config, content: [{ raw }] })]).process(
      '@tailwind utilities;',
      { from: undefined }
    );
    result.root.walkRules((rule) => {
      const at = [];
      for (let parent = rule.parent; parent && parent.type === 'atrule'; parent = parent.parent)
        at.unshift(`@${parent.name} ${parent.params}`.trim());
      rules.push({ at, selector: rule.selector, css: rule.nodes.map(String).join('; ') });
    });
  }, 60_000);

  const inSplit = (rule) => rule.at.includes('@container split (min-width: 640px)');

  test('below 640px of the piece section the title has its own row and the actions fit one', () => {
    const screen = source('apps/frontend/src/components/content-intelligence/pieces/piece.screen.tsx');
    expect(screen).toMatch(/<h1 className="[^"]*\bbasis-full\b[^"]*\bsplit:basis-0\b/);
    expect(screen).toMatch(/data-piece-back="true"[\s\S]{0,200}'hidden split:inline-flex'/);
    const split = rules.filter(inSplit).map((rule) => rule.css);
    expect(split).toEqual(expect.arrayContaining(['flex-basis: 0px', 'display: inline-flex']));
  });

  test('the breadcrumb still leads to the list the hidden link led to', () => {
    const screen = source('apps/frontend/src/components/content-intelligence/pieces/piece.screen.tsx');
    const crumbs = screen.slice(screen.indexOf('<nav'), screen.indexOf('</nav>'));
    expect(crumbs).toContain('href="/content?tab=materials"');
  });

  test('a hovered empty box takes the neutral ink, not the green of «kept»', () => {
    const hover = rules.find((rule) =>
      rule.selector.includes(':hover input:not(:checked):not(:disabled)')
    );
    expect(hover?.css).toBe('border-color: var(--cf-ink-muted)');
  });
});

/* ---- The backend's wording, relayed (D1, D7, D11) --------------------------- */

describe('D7 — the approval footnote matches what the action does', () => {
  const cards = loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');
  const draw = async (toolName, irreversible = false) => {
    await act(async () => {
      render(
        h(cards.ApprovalCard, {
          title: 'Опубликовать сейчас',
          reason: 'Пост уйдёт в канал сразу',
          irreversible,
          toolName,
          state: 'asked',
          busy: false,
          onAnswer: () => {},
          words: ru,
        })
      );
    });
    return document.body.textContent;
  };

  test('publish now: straight to the channel, never «отменить потом»', async () => {
    const text = await draw('plan_publish_now');
    expect(text).toContain('Сразу в канал:');
    expect(text).toContain(ru.approval.publishNote);
    expect(text).not.toContain(ru.approval.reversibleNote);
  });

  test('schedule, move and apply: off the schedule until it goes out', async () => {
    for (const tool of ['plan_schedule', 'plan_move', 'plan_apply']) {
      expect(cards.approvalNoteOf(tool, false)).toBe('schedule');
    }
    expect(await draw('plan_move')).toContain(
      'До выхода пост можно снять с расписания — в чате или в календаре.'
    );
    expect(cards.approvalNoteOf('piece_delete', true)).toBe('delete');
    expect(cards.approvalNoteOf('avatar_activate', false)).toBe('undo');
  });

  test('the conversation tells the card which tool asks', () => {
    expect(source('apps/frontend/src/components/agents/agent.conversation.tsx')).toContain(
      'toolName={block.toolName}'
    );
  });
});

describe('D1, D11 — the refusal words', () => {
  test('INPUT_NEEDS_PERSON is a neutral note, not «Не получилось»', async () => {
    const refused = {
      id: 'm9',
      role: 'assistant',
      parts: [
        {
          type: 'tool-piece_answer',
          toolCallId: 'c9',
          state: 'output-available',
          title: 'Ответить на вопросы заготовки',
          input: {},
          output: { ok: false, code: 'INPUT_NEEDS_PERSON' },
        },
      ],
    };
    await drawConversation({ messages: [refused], pending: [], request: async () => ({ ok: false }) });
    expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
    expect(document.body.textContent).toContain(
      'Вопросы заготовки — ваши: ответьте в чате или на карточке, или скажите «Решите за меня».'
    );
  });

  test('the paid cap says one step per message, two after a «Да»', () => {
    expect(ru.error.codes.PAID_CAP_REACHED).toEqual({
      what: 'За одно сообщение — один платный шаг; сразу после вашего «Да» на карточке — до двух.',
      next: 'Напишите «дальше» — продолжим.',
    });
    expect(copy.agentCopy.en.error.codes.PAID_CAP_REACHED.what).toMatch(/^One paid step per message/);
  });
});
