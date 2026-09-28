'use strict';

/**
 * The agent screen after the live recheck of W2 (27.09.2026,
 * `content-factory-next-kcxz.32`; evidence
 * `.codex/stages/content-factory-next-kcxz/evidence/live-stand-w2-2026-09-27/recheck-2026-09-27/`).
 *
 * N1: an approval card further up the conversation took «Нет», said «ответ
 * отправлен» and sent nothing — the automatic send looked at the last message
 * only. Now the answer is sent once, for the message the card is in, and the
 * card says «ответ отправлен» only once the door took it. D2: a card the
 * server no longer holds says «больше не ждёт ответа». N2: a proposal applied
 * after its text changed says so. N5: publish-now says «не снять» once.
 */

const React = require('react');
const STEPS = require('./helpers/load-tsx.cjs').loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/onboarding/onboarding.steps.ts'
);
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

const { act, cleanup, render, fireEvent, within } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const h = React.createElement;
const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const cards = loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');
const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const ru = copy.agentCopy.ru;

afterEach(cleanup);

/* ---- A conversation whose chat core is a recording stand-in --------------- */

const APPROVAL_ID = 'run-a::call-1';

const approvalCard = (state = 'approval-requested', approval = {}) => ({
  id: 'm1',
  role: 'assistant',
  parts: [
    { type: 'step-start' },
    {
      type: 'tool-plan_publish_now',
      toolCallId: 'call-1',
      state,
      title: 'Опубликовать сейчас',
      input: { pieceId: 'p1', adaptationId: 'a1' },
      approval: { id: APPROVAL_ID, requestReason: 'Опубликовать сейчас пост cnt-1', ...approval },
    },
  ],
});
const person = { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Подожди, что в плане?' }] };
const laterReply = { id: 'm3', role: 'assistant', parts: [{ type: 'text', text: 'В плане одна бронь.' }] };

const PENDING_APPROVAL = [
  {
    runId: 'run-a',
    toolCallId: 'call-1',
    toolName: 'plan_publish_now',
    kind: 'approval',
    suspendPayload: null,
    summary: 'Опубликовать сейчас пост cnt-1',
  },
];

/**
 * `useChat` replaced by a store the test drives the way the AI SDK does:
 * `addToolApprovalResponse` turns the part `approval-responded`, `sendMessage`
 * is recorded, and `status` / `error` are set by the test.
 */
const chatStand = (messages) => {
  const chat = {
    messages,
    status: 'ready',
    error: undefined,
    answers: [],
    sent: [],
    cleared: 0,
    options: null,
  };
  chat.addToolApprovalResponse = async ({ id, approved }) => {
    chat.answers.push({ id, approved });
    chat.messages = chat.messages.map((message) => ({
      ...message,
      parts: message.parts.map((part) =>
        part.state === 'approval-requested' && part.approval?.id === id
          ? { ...part, state: 'approval-responded', approval: { ...part.approval, approved } }
          : part
      ),
    }));
  };
  return chat;
};

const loadConversation = (chat, request) =>
  loadWithMocks('apps/frontend/src/components/agents/agent.conversation.tsx', {
    react: React,
    '@ai-sdk/react': {
      useChat: (options) => {
        chat.options = options;
        return {
          messages: chat.messages,
          status: chat.status,
          error: chat.error,
          sendMessage: (...args) => {
            chat.sent.push(args);
            // The SDK marks the request submitted before it returns.
            chat.status = 'submitted';
          },
          stop: () => {},
          clearError: () => {
            chat.cleared += 1;
            if (chat.status === 'error') {
              chat.status = 'ready';
              chat.error = undefined;
            }
          },
          regenerate: () => {},
          addToolApprovalResponse: (answer) => chat.addToolApprovalResponse(answer),
          setMessages: (next) => {
            chat.messages = typeof next === 'function' ? next(chat.messages) : next;
          },
        };
      },
    },
    swr: {
      __esModule: true,
      default: () => ({ data: undefined }),
      useSWRConfig: () => ({ mutate: () => {} }),
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
    '@contentfactory/frontend/components/onboarding/use-onboarding-progress': {
      useOnboardingProgress: () => ({ progress: {}, answered: true, error: false }),
    },
    '@contentfactory/frontend/components/onboarding/onboarding.adapter': {
      ONBOARDING_STEP_KEYS: ['avatar', 'channel', 'piece', 'adaptation', 'plan'],
      stepIsDone: () => false,
      // Every step open, and a channel assumed: only the role decides here.
      stepAllowed: STEPS.stepAllowed,
      stepOffered: (step, _progress, role) => STEPS.stepAllowed(step, role),
      channelWaitsForAdmin: () => false,
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role: 'EDITOR' }),
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

const drawConversation = async ({ messages, pending, request = async () => ({ ok: false }) }) => {
  const chat = chatStand(messages);
  const { AgentConversation } = loadConversation(chat, request);
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
  const redraw = async () => {
    await act(async () => {
      view.rerender(h(AgentConversation, { ...props }));
    });
  };
  return { chat, view, redraw };
};

const approvalOnScreen = () => document.querySelector('[data-agent-card="approval"]');
const button = (name) => within(approvalOnScreen()).queryByRole('button', { name });

describe('N1 — an approval card further up sends its answer, once', () => {
  test('«Нет» on the earlier card: answered natively, then one request for that card’s message', async () => {
    const { chat, redraw } = await drawConversation({
      messages: [approvalCard(), person, laterReply],
      pending: PENDING_APPROVAL,
    });
    expect(chat.options.sendAutomaticallyWhen).toBeUndefined();
    await act(async () => {
      fireEvent.click(button(ru.approval.no));
    });
    expect(chat.answers).toEqual([{ id: APPROVAL_ID, approved: false }]);
    // `sendMessage()` with no message: the SDK sends it for the message the
    // card is in (`pendingApprovalMessageId`).
    expect(chat.sent).toEqual([[]]);

    // Submitted, not yet taken: never «ответ отправлен».
    await redraw();
    expect(document.body.textContent).not.toContain(ru.approval.sent);
    expect(approvalOnScreen().getAttribute('data-agent-approval')).toBeNull();
    expect(approvalOnScreen().textContent).toContain(ru.approval.sending);

    // The stream began: the door took it.
    chat.status = 'streaming';
    await redraw();
    expect(approvalOnScreen().getAttribute('data-agent-approval')).toBe('sent');
    expect(approvalOnScreen().textContent).toContain(ru.approval.sent);
    expect(chat.sent).toHaveLength(1);
  });

  test('the door says it no longer waits (409): the card says so, sends nothing more, no error card', async () => {
    const { chat, redraw } = await drawConversation({
      messages: [approvalCard(), person, laterReply],
      pending: PENDING_APPROVAL,
    });
    await act(async () => {
      fireEvent.click(button(ru.approval.yes));
    });
    chat.status = 'error';
    chat.error = new Error(JSON.stringify({ code: 'AGENT_RUN_NOT_PENDING' }));
    await redraw();
    await redraw();
    expect(approvalOnScreen().getAttribute('data-agent-approval')).toBe('closed');
    expect(approvalOnScreen().textContent).toContain('больше не ждёт ответа');
    expect(document.body.textContent).not.toContain(ru.approval.sent);
    expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
    expect(chat.sent).toHaveLength(1);
  });

  test('a request that failed on the way: the card asks again, and «Попробовать снова» does not re-run the turn', async () => {
    const { chat, redraw } = await drawConversation({
      messages: [approvalCard(), person, laterReply],
      pending: PENDING_APPROVAL,
    });
    await act(async () => {
      fireEvent.click(button(ru.approval.yes));
    });
    chat.status = 'error';
    chat.error = new TypeError('Failed to fetch');
    await redraw();
    await redraw();
    expect(approvalOnScreen().getAttribute('data-agent-approval')).toBeNull();
    expect(button(ru.approval.yes).disabled).toBe(false);
    expect(chat.messages[0].parts[1].state).toBe('approval-requested');
    const error = document.querySelector('[data-agent-card="error"]');
    expect(error).not.toBeNull();
    expect(within(error).queryByRole('button')).toBeNull();
  });
});

describe('D2 — «больше не ждёт ответа» is drawn for a card that no longer waits', () => {
  test('an approval card the server no longer holds: no buttons, the words, and nothing sent', async () => {
    const { chat } = await drawConversation({
      messages: [approvalCard(), person, laterReply],
      pending: [],
    });
    expect(approvalOnScreen().getAttribute('data-agent-approval')).toBe('closed');
    expect(approvalOnScreen().textContent).toBe('Опубликовать сейчас — больше не ждёт ответа');
    expect(button(ru.approval.yes)).toBeNull();
    expect(chat.sent).toEqual([]);
  });

  test('the last message’s approval card also closes once the server’s list no longer holds it', async () => {
    await drawConversation({ messages: [person, approvalCard()], pending: [] });
    expect(approvalOnScreen().getAttribute('data-agent-approval')).toBe('closed');
  });

  test('pending on the server, the earlier card is live', async () => {
    await drawConversation({ messages: [approvalCard(), person, laterReply], pending: PENDING_APPROVAL });
    expect(button(ru.approval.yes).disabled).toBe(false);
    expect(button(ru.approval.no).disabled).toBe(false);
  });

  test('the contract’s rule: the approval id is `<runId>::<toolCallId>` of a pending approval', () => {
    expect(contract.approvalWaits(PENDING_APPROVAL, APPROVAL_ID)).toBe(true);
    expect(contract.approvalWaits(PENDING_APPROVAL, 'run-b::call-1')).toBe(false);
    expect(contract.approvalWaits(PENDING_APPROVAL, 'call-1')).toBe(false);
    expect(
      contract.approvalWaits([{ ...PENDING_APPROVAL[0], kind: 'question' }], APPROVAL_ID)
    ).toBe(false);
  });

  test('a question card answered from further up reads «отвечено», not «больше не ждёт ответа»', async () => {
    const payload = {
      kind: 'selection',
      question: 'Вот что предлагаем поправить.',
      answerKey: 'changeIds',
      canDecideForPerson: true,
      cardId: 'card-1',
      options: [{ id: 'w1', label: '«a» → «b»', selected: true }],
    };
    const older = {
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'tool-adaptation_rewrite', toolCallId: 'call-1', state: 'input-available', title: 'Переписать адаптацию', input: {} },
        {
          type: 'data-tool-call-suspended',
          data: { toolCallId: 'call-1', runId: 'run-1', toolName: 'adaptation_rewrite', suspendPayload: payload },
        },
      ],
    };
    const pending = [
      { runId: 'run-1', toolCallId: 'call-1', toolName: 'adaptation_rewrite', kind: 'question', suspendPayload: payload, summary: null },
    ];
    const { chat, redraw } = await drawConversation({ messages: [older, person, laterReply], pending });
    await act(async () => {
      fireEvent.click(document.querySelector('[data-agent-selection-keep]'));
    });
    chat.status = 'streaming';
    await redraw();
    const line = document.querySelector('[data-agent-card="question"]');
    expect(line.getAttribute('data-agent-question')).toBe('answered');
    expect(line.textContent).toContain(ru.question.answered);
  });
});

describe('kcxz.34 — a question card after a stale tab and after a reload', () => {
  const payload = {
    kind: 'selection',
    question: 'Вот что предлагаем поправить.',
    answerKey: 'changeIds',
    canDecideForPerson: true,
    cardId: 'card-1',
    options: [{ id: 'c1', label: '«a» → «b»', selected: true }],
  };
  const asked = {
    id: 'm1',
    role: 'assistant',
    parts: [
      { type: 'tool-adaptation_review', toolCallId: 'call-1', state: 'input-available', title: 'Проверить адаптацию', input: {} },
      {
        type: 'data-tool-call-suspended',
        data: { toolCallId: 'call-1', runId: 'run-1', toolName: 'adaptation_review', suspendPayload: payload },
      },
    ],
  };
  const pendingQuestion = [
    { runId: 'run-1', toolCallId: 'call-1', toolName: 'adaptation_review', kind: 'question', suspendPayload: payload, summary: null },
  ];

  test('F3: answered from a stale tab (409 not pending) — «больше не ждёт ответа», no error card, nothing to retry', async () => {
    // The stale tab's card is further up: the main tab went on after it.
    const { chat, redraw } = await drawConversation({
      messages: [asked, person, laterReply],
      pending: pendingQuestion,
    });
    await act(async () => {
      fireEvent.click(document.querySelector('[data-agent-selection-keep]'));
    });
    chat.status = 'error';
    chat.error = new Error(JSON.stringify({ code: 'AGENT_RUN_NOT_PENDING' }));
    await redraw();
    await redraw();
    const line = document.querySelector('[data-agent-card="question"]');
    expect(line.getAttribute('data-agent-question')).toBe('closed');
    expect(line.textContent).toContain('больше не ждёт ответа');
    expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
    expect(document.body.textContent).not.toContain(ru.error.retry);
    expect(chat.cleared).toBeGreaterThan(0);
    expect(chat.sent).toHaveLength(1);
  });

  // The thread door's history keeps the tool part with its output, and no
  // `data-tool-call-suspended` part: Mastra drops it once the run resumed
  // (final check 27.09, `s3c-stale-02`, `s1g-02`).
  const stored = (type, title, summary, card) => ({
    id: 'm1',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type,
        toolCallId: 'call-1',
        state: 'output-available',
        title,
        input: {},
        output: { ok: true, summary, ...(card ? { card } : {}) },
      },
    ],
  });

  test('F4: an answered changes card still reads «Выбор: … — отвечено» after a reload', async () => {
    const message = stored(
      'tool-adaptation_review',
      'Проверить адаптацию',
      { pieceId: 'p1', adaptationId: 'a1', outcome: 'applied', offered: 1, applied: 1, declined: 0, waitingOnCard: 0 },
      { kind: 'adaptation', id: 'a1' }
    );
    await drawConversation({ messages: [message], pending: [] });
    const line = document.querySelector('[data-agent-card="question"]');
    expect(line.getAttribute('data-agent-question')).toBe('answered');
    expect(line.textContent).toBe(`${ru.selection.kind}: Проверить адаптацию — ${ru.question.answered}`);
    // The adaptation's own line is still there, after the fold, as live.
    const blocks = contract.readMessageBlocks(message);
    expect(blocks.map((block) => block.type)).toEqual(['question', 'artifact']);
  });

  test('F4: which stored outputs were an answered card', () => {
    const fold = (summary) => contract.answeredSelectionOf({ ok: true, summary });
    // The facts card of a new piece.
    expect(fold({ pieceId: 'p1', code: 'cnt-8', questions: 3, research: 'standard', factsKept: 3 })).toBe(true);
    // Nothing to choose from: the product kept the defaults, no card.
    expect(fold({ pieceId: 'p1', code: 'cnt-8', questions: 3, research: 'standard', factsKept: 0 })).toBe(false);
    expect(fold({ pieceId: 'p1', code: 'cnt-8', questions: 3 })).toBe(false);
    // The core's research card.
    expect(fold({ pieceId: 'p1', level: 'standard', offered: 4, kept: 2, applied: true })).toBe(true);
    expect(fold({ pieceId: 'p1', level: 'standard', offered: 0, kept: 0, applied: false })).toBe(false);
    // A changes card: accepted, or kept as is.
    expect(fold({ pieceId: 'p1', outcome: 'kept-as-is', offered: 2, applied: 0 })).toBe(true);
    expect(fold({ pieceId: 'p1', outcome: 'nothing-to-change', offered: 0, applied: 0 })).toBe(false);
    // Stale keeps its own «правка устарела» line (kcxz.32, N2).
    expect(fold({ pieceId: 'p1', outcome: 'stale', offered: 1, applied: 0 })).toBe(false);
    expect(contract.answeredSelectionOf('text output')).toBe(false);
  });
});

describe('N1, D2 — the body for a card further up, and the stream that answers it', () => {
  test('`buildChatBody` sends the message the SDK names when it answers an approval', () => {
    const answered = approvalCard('approval-responded', { approved: false });
    const body = contract.buildChatBody({
      threadId: 't1',
      messages: [answered, person, laterReply],
      messageId: 'm1',
    });
    expect(body).toEqual({ threadId: 't1', messages: [answered] });
    // A message it names that answers nothing, or none: the last one, as ever.
    expect(
      contract.buildChatBody({ threadId: 't1', messages: [approvalCard(), person], messageId: 'm1' })
    ).toEqual({ threadId: 't1', messages: [person] });
    expect(contract.buildChatBody({ threadId: null, messages: [person] })).toEqual({ messages: [person] });
  });

  test('a step with two cards goes when both are answered', () => {
    const two = {
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        { type: 'tool-plan_move', toolCallId: 'c1', state: 'approval-requested', approval: { id: 'r::c1' } },
        { type: 'tool-plan_move', toolCallId: 'c2', state: 'approval-responded', approval: { id: 'r::c2', approved: true } },
        { type: 'tool-plan_move', toolCallId: 'c3', state: 'approval-requested', approval: { id: 'r::c3', closed: true } },
      ],
    };
    expect(contract.waitingApprovalIds(two)).toEqual(['r::c1']);
  });

  test('a refused answer puts the card back — asked, or closed', () => {
    const answered = approvalCard('approval-responded', { approved: true });
    const [again] = contract.reopenApprovalAnswer([answered], APPROVAL_ID, false);
    expect(again.parts[1]).toMatchObject({
      state: 'approval-requested',
      approval: { id: APPROVAL_ID, requestReason: 'Опубликовать сейчас пост cnt-1' },
    });
    expect(again.parts[1].approval).not.toHaveProperty('approved');
    const [closed] = contract.reopenApprovalAnswer([answered], APPROVAL_ID, true);
    expect(closed.parts[1].approval.closed).toBe(true);
  });

  test('a question answered further up names its call first in the message that takes the stream', () => {
    const older = {
      id: 'm1',
      role: 'assistant',
      parts: [{ type: 'tool-adaptation_rewrite', toolCallId: 'call-1', state: 'input-available', title: 'Переписать адаптацию', input: { adaptationId: 'a1' } }],
    };
    const resume = { runId: 'run-1', toolCallId: 'call-1', cardId: 'card-1', resumeData: {} };
    expect(contract.continuedCallChunk([older, person, laterReply], resume)).toEqual({
      type: 'tool-input-available',
      toolCallId: 'call-1',
      toolName: 'adaptation_rewrite',
      input: { adaptationId: 'a1' },
      title: 'Переписать адаптацию',
    });
    // The card in the last message: the stream continues it as it is.
    expect(contract.continuedCallChunk([person, older], resume)).toBeNull();
    expect(contract.continuedCallChunk([older, person], { ...resume, toolCallId: null })).toBeNull();
  });
});

describe('N2 — a proposal applied after its text changed', () => {
  test('the stream’s `outcome: stale` reads as «правка устарела», not «Готово»', async () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-piece_rewrite',
          toolCallId: 'call-1',
          state: 'output-available',
          title: 'Переписать суть',
          input: {},
          output: { ok: true, capability: 'piece.rewrite', summary: { pieceId: 'p1', outcome: 'stale', offered: 1, applied: 0 } },
        },
      ],
    };
    const blocks = contract.readMessageBlocks(message);
    expect(blocks).toEqual([expect.objectContaining({ type: 'done', stale: true })]);
    await act(async () => {
      render(h(cards.DoneLine, { title: 'Переписать суть', stale: true, words: ru }));
    });
    const line = document.querySelector('[data-agent-done="stale"]');
    expect(line.textContent).toBe('Переписать суть — правка устарела, текст уже изменился — ничего не применили');
    expect(copy.agentCopy.en.question.stale).toMatch(/nothing was applied/);
  });

  test('a second proposal refused while the card is open is a neutral note, not «Не получилось»', async () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-adaptation_rewrite',
          toolCallId: 'call-2',
          state: 'output-available',
          title: 'Переписать адаптацию',
          input: {},
          output: { ok: false, code: 'PROPOSAL_CARD_OPEN', reason: 'x' },
        },
      ],
    };
    await drawConversation({ messages: [person, message], pending: [] });
    expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
    expect(document.body.textContent).toContain(ru.error.codes.PROPOSAL_CARD_OPEN.what);
  });
});

describe('W3 recheck R-5 — the paid limit is a stop, not a failure', () => {
  test('`PAID_CAP_REACHED` is a neutral line under its step, not the red «Не получилось» card', async () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-piece_adapt',
          toolCallId: 'call-2',
          state: 'output-available',
          title: 'Адаптировать под канал',
          input: {},
          output: { ok: false, code: 'PAID_CAP_REACHED', reason: 'x' },
        },
        { type: 'text', text: 'Заготовка готова; адаптация осталась. Напишите «дальше» — продолжим.' },
      ],
    };
    await drawConversation({ messages: [person, message], pending: [] });
    expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
    expect(document.body.textContent).not.toContain(ru.error.kind);
    expect(document.body.textContent).toContain(ru.error.paidCapNote('Адаптировать под канал'));
    expect(ru.error.paidCapNote('Адаптировать под канал')).toBe(
      'Адаптировать под канал — следующим сообщением: за одно сообщение один платный шаг.'
    );
    expect(copy.agentCopy.en.error.codes.PAID_CAP_REACHED.next).toBe('Write “next” — we\'ll continue.');
  });
});

describe('N5 — «Сразу в канал» says «не снять» once', () => {
  test('the publish-now card: the server’s line says what happens, the footnote the limit', async () => {
    // The server's line for this card (`tests/agent-capabilities.w2-fixes.test.cjs`).
    const reason = 'Опубликовать сейчас пост заготовки cnt-1 в канале «Канал про работу»: он уйдёт в канал сразу. «Текст поста.»';
    await act(async () => {
      render(
        h(cards.ApprovalCard, {
          title: 'Опубликовать сейчас',
          reason,
          irreversible: false,
          toolName: 'plan_publish_now',
          state: 'asked',
          busy: false,
          onAnswer: () => {},
          words: ru,
        })
      );
    });
    const text = document.body.textContent;
    expect(text.match(/не снять/g)).toHaveLength(1);
    expect(text).toContain(ru.approval.publishNote);
  });
});

describe('kcxz.38 — a stale tab keeps its card and reads the other tab’s outcome (R2, P3-10)', () => {
  const payload = {
    kind: 'selection',
    question: 'Вот что предлагаем поправить.',
    answerKey: 'changeIds',
    canDecideForPerson: true,
    cardId: 'card-1',
    options: [{ id: 'c1', label: '«a» → «b»', selected: true }],
  };
  // The thread door's history, read while the card waited: the tool part has
  // no output and no `data-tool-call-suspended` part; the card comes from the
  // `pending` list only (final recheck 27.09, s2b).
  const waiting = {
    id: 'm1',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      { type: 'tool-adaptation_review', toolCallId: 'call-1', state: 'input-available', title: 'Проверить адаптацию', input: {} },
    ],
  };
  const pendingQuestion = [
    { runId: 'run-1', toolCallId: 'call-1', toolName: 'adaptation_review', kind: 'question', suspendPayload: payload, summary: null },
  ];
  // What the main tab left in the thread: the call answered and applied, and
  // the agent's line after it.
  const answeredElsewhere = {
    id: 'm1',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type: 'tool-adaptation_review',
        toolCallId: 'call-1',
        state: 'output-available',
        title: 'Проверить адаптацию',
        input: {},
        output: {
          ok: true,
          summary: { pieceId: 'p1', adaptationId: 'a1', outcome: 'applied', offered: 1, applied: 1, declined: 0, waitingOnCard: 0 },
        },
      },
      { type: 'text', text: 'Правку применили в основной вкладке.' },
    ],
  };

  const answerFromStaleTab = async (request) => {
    const { chat, redraw } = await drawConversation({ messages: [waiting], pending: pendingQuestion, request });
    expect(document.querySelector('[data-agent-selection-keep]')).not.toBeNull();
    await act(async () => {
      fireEvent.click(document.querySelector('[data-agent-selection-keep]'));
    });
    chat.status = 'error';
    chat.error = new Error(JSON.stringify({ code: 'AGENT_RUN_NOT_PENDING' }));
    await redraw();
    await redraw();
    await redraw();
    return chat;
  };

  test('the card stays, folded into «больше не ждёт ответа», and the thread is read again with the other tab’s outcome', async () => {
    const reads = [];
    const chat = await answerFromStaleTab(async (url) => {
      reads.push(url);
      return { ok: true, json: async () => ({ thread: { id: 't1' }, messages: [answeredElsewhere], pending: [] }) };
    });
    expect(reads).toContain(contract.AGENT_DOORS.thread('t1'));
    // The thread now holds what the main tab did.
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0].parts[1].state).toBe('output-available');
    const line = document.querySelector('[data-agent-card="question"]');
    expect(line).not.toBeNull();
    expect(line.getAttribute('data-agent-question')).toBe('closed');
    expect(line.textContent).toBe(`${ru.selection.kind}: Проверить адаптацию — больше не ждёт ответа`);
    expect(document.body.textContent).toContain('Правку применили в основной вкладке.');
    expect(document.querySelector('[data-agent-selection-keep]')).toBeNull();
    expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
    expect(chat.sent).toHaveLength(1);
  });

  test('the thread cannot be read again: the card still stays as its line, not a vanished block', async () => {
    await answerFromStaleTab(async () => ({ ok: false, json: async () => ({}) }));
    const line = document.querySelector('[data-agent-card="question"]');
    expect(line).not.toBeNull();
    expect(line.getAttribute('data-agent-question')).toBe('closed');
    expect(line.textContent).toContain('больше не ждёт ответа');
    expect(document.querySelector('[data-agent-selection-keep]')).toBeNull();
    expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
  });

  test('a card the server listed earlier and dropped keeps its question with the call that has no output', () => {
    const blocks = contract.readMessageBlocks(waiting, [], new Set(), pendingQuestion);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'question', runId: 'run-1', toolCallId: 'call-1' });
    // Without it the call is a working block the screen draws only while live.
    expect(contract.readMessageBlocks(waiting, [], new Set()).map((block) => block.type)).toEqual(['working']);
    // A call with an output never takes the old card: it folds from its counts.
    const folded = contract.readMessageBlocks(answeredElsewhere, [], new Set(), pendingQuestion);
    expect(folded[0]).toMatchObject({ type: 'question', runId: null, toolCallId: 'call-1' });
    expect(folded[0].question.text).toBe('');
  });

  test('P3-10: a new piece’s facts card folds by `factsCard`, older histories by `factsKept`', () => {
    const fold = (summary) => contract.answeredSelectionOf({ ok: true, summary });
    const base = { pieceId: 'p1', code: 'cnt-8', questions: 3, research: 'standard' };
    expect(fold({ ...base, factsKept: 3, factsCard: 'answered' })).toBe(true);
    // Answered with nothing kept («Решите за меня» or none ticked) is still answered.
    expect(fold({ ...base, factsKept: 0, factsCard: 'answered' })).toBe(true);
    // The product kept its defaults (MCP, no suspend): no card was shown.
    expect(fold({ ...base, factsKept: 3, factsCard: 'not_shown' })).toBe(false);
    // Before the field: the kept count is all there is.
    expect(fold({ ...base, factsKept: 3 })).toBe(true);
    expect(fold({ ...base, factsKept: 0 })).toBe(false);
  });
});

describe('kcxz.38 release check P3-a — one folded line per card right after «Решите за меня»', () => {
  const payload = {
    kind: 'selection',
    question: 'Вот что предлагаем поправить. Отметьте, что принять.',
    answerKey: 'changeIds',
    canDecideForPerson: true,
    cardId: 'card-1',
    options: [{ id: 'c1', label: 'Убрать: «В современном мире…»', selected: true }],
  };
  const asked = {
    id: 'm1',
    role: 'assistant',
    parts: [
      { type: 'tool-adaptation_review', toolCallId: 'call-1', state: 'input-available', title: 'Проверить адаптацию', input: {} },
      {
        type: 'data-tool-call-suspended',
        data: { toolCallId: 'call-1', runId: 'run-1', toolName: 'adaptation_review', suspendPayload: payload },
      },
    ],
  };
  const pendingQuestion = [
    { runId: 'run-1', toolCallId: 'call-1', toolName: 'adaptation_review', kind: 'question', suspendPayload: payload, summary: null },
  ];
  const summary = { pieceId: 'p1', adaptationId: 'a1', outcome: 'applied', offered: 1, applied: 1, declined: 0, waitingOnCard: 0 };
  // The answer's stream lands in the last assistant message, the call named
  // first by `continuedCallChunk` (`http/s4a-sse-01.ndjson`).
  const continued = {
    ...laterReply,
    parts: [
      ...laterReply.parts,
      {
        type: 'tool-adaptation_review',
        toolCallId: 'call-1',
        state: 'output-available',
        title: 'Проверить адаптацию',
        input: {},
        output: { ok: true, summary, card: { kind: 'adaptation', id: 'a1' } },
      },
      { type: 'text', text: 'Убрали следы ИИ: применили 1 правку из 1.' },
    ],
  };

  test('the card further up folds into «отвечено», the continued message keeps its result, not a second line', async () => {
    const { chat, redraw } = await drawConversation({
      messages: [asked, person, laterReply],
      pending: pendingQuestion,
    });
    await act(async () => {
      fireEvent.click(within(document.body).getByText(ru.question.decide));
    });
    expect(chat.sent).toHaveLength(1);
    expect(chat.sent[0][1].body.resume).toMatchObject({ runId: 'run-1', toolCallId: 'call-1', cardId: 'card-1', resumeData: { decideForPerson: true } });
    chat.messages = [asked, person, continued];
    chat.status = 'ready';
    await redraw();
    await redraw();
    const lines = [...document.querySelectorAll('[data-agent-card="question"]')];
    expect(lines).toHaveLength(1);
    expect(lines[0].getAttribute('data-agent-question')).toBe('answered');
    expect(lines[0].textContent).toContain(ru.question.answered);
    // The result is still drawn where the person is.
    expect(document.querySelector('[data-agent-artifact="adaptation"]')).not.toBeNull();
    expect(document.body.textContent).toContain('применили 1 правку из 1');
  });

  test('the rule: a later answered line of the same call or card goes; a live card never does', () => {
    const first = contract.readMessageBlocks(asked, pendingQuestion);
    const later = contract.readMessageBlocks(continued);
    expect(later.filter((block) => block.type === 'question')).toHaveLength(1);
    const [a, b] = contract.withoutRepeatedQuestionLines([first, later]);
    expect(a.filter((block) => block.type === 'question')).toHaveLength(1);
    expect(b.filter((block) => block.type === 'question')).toHaveLength(0);
    expect(b.some((block) => block.type === 'artifact')).toBe(true);
    // After a reload the history holds one call: its line stays.
    const [alone] = contract.withoutRepeatedQuestionLines([later]);
    expect(alone.filter((block) => block.type === 'question')).toHaveLength(1);
    // Same card id, a different call, still waiting: kept.
    const live = { type: 'question', key: 'k', toolName: 't', title: null, runId: 'run-2', toolCallId: 'call-2', question: { ...payload, cardId: 'card-1' } };
    const [, kept] = contract.withoutRepeatedQuestionLines([first, [live]]);
    expect(kept).toHaveLength(1);
  });
});
