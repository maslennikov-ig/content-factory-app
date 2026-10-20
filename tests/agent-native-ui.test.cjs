'use strict';

/**
 * Product UI consumption of native Mastra 1.78 harness chat/run controls
 * (`content-factory-next-on0i.6`, `A9`–`A20`, `A28`–`A31`).
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
if (!global.window.requestAnimationFrame) {
  global.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const h = React.createElement;
const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const cards = loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');

const ru = copy.agentCopy.ru;
const en = copy.agentCopy.en;

afterEach(cleanup);

describe('native harness UI contract and cards (on0i.6)', () => {
  test('exposes native thread control doors for stop, observe, model, mode, objective, and schedules', () => {
    expect(contract.AGENT_DOORS.stopThread('thread-1')).toBe('/agent/threads/thread-1/stop');
    expect(contract.AGENT_DOORS.observeThread('thread-1')).toBe('/agent/threads/thread-1/observe');
    expect(contract.AGENT_DOORS.threadModel('thread-1')).toBe('/agent/threads/thread-1/model');
    expect(contract.AGENT_DOORS.threadMode('thread-1')).toBe('/agent/threads/thread-1/mode');
    expect(contract.AGENT_DOORS.threadObjective('thread-1')).toBe('/agent/threads/thread-1/objective');
    expect(contract.AGENT_DOORS.threadSchedules('thread-1')).toBe('/agent/threads/thread-1/schedules');
    expect(contract.AGENT_DOORS.threadSchedule('thread-1', 'sched-1')).toBe(
      '/agent/threads/thread-1/schedules/sched-1'
    );
  });

  test('reads and answers native ask_user questions with option descriptions and submit_plan cards', async () => {
    const ASK_CARD_ID = 'a'.repeat(32);
    const PLAN_CARD_ID = 'b'.repeat(32);
    const askQuestion = contract.readQuestion(
      'ask_user',
      {
        question: 'На какую аудиторию пишем разбор?',
        options: [
          { label: 'Руководители', description: 'Фокус на ROI и процессе' },
          { label: 'Инженеры', description: 'Фокус на архитектуре' },
        ],
        cardId: ASK_CARD_ID,
      },
      null
    );
    expect(askQuestion).toEqual({
      kind: 'choice',
      text: 'На какую аудиторию пишем разбор?',
      options: [
        { id: 'Руководители', label: 'Руководители', description: 'Фокус на ROI и процессе' },
        { id: 'Инженеры', label: 'Инженеры', description: 'Фокус на архитектуре' },
      ],
      answerKey: 'answer',
      canDecideForPerson: true,
      cardId: ASK_CARD_ID,
    });

    const askAnswers = [];
    await act(async () => {
      render(
        h(cards.QuestionCard, {
          title: 'Спросить человека',
          question: askQuestion,
          answered: false,
          busy: false,
          onAnswer: (data) => askAnswers.push(data),
          words: ru,
        })
      );
    });
    await waitFor(() =>
      expect(document.querySelector('[data-agent-card="question"]')).not.toBeNull()
    );
    const askCard = document.querySelector('[data-agent-card="question"]');
    expect(askCard.textContent).toContain('Фокус на ROI и процессе');
    expect(askCard.textContent).toContain('Фокус на архитектуре');
    await act(async () => {
      fireEvent.click(within(askCard).getByRole('button', { name: 'Руководители' }));
    });
    expect(askAnswers).toEqual([{ answer: 'Руководители' }]);

    cleanup();

    const planQuestion = contract.readQuestion(
      'submit_plan',
      {
        title: 'План серии из 3 постов',
        plan: '1. Собрать фактуру\n2. Написать суть\n3. Адаптировать под Telegram',
        cardId: PLAN_CARD_ID,
      },
      null
    );
    expect(planQuestion).toEqual({
      kind: 'plan',
      title: 'План серии из 3 постов',
      plan: '1. Собрать фактуру\n2. Написать суть\n3. Адаптировать под Telegram',
      text: 'План серии из 3 постов',
      cardId: PLAN_CARD_ID,
    });

    const planAnswers = [];
    await act(async () => {
      render(
        h(cards.QuestionCard, {
          title: 'Предложить план работы',
          question: planQuestion,
          answered: false,
          busy: false,
          onAnswer: (data) => planAnswers.push(data),
          words: ru,
        })
      );
    });
    const planCard = document.querySelector('[data-agent-card="question"]');
    expect(planCard.textContent).toContain('План серии из 3 постов');
    expect(planCard.textContent).toContain('Собрать фактуру');
    await act(async () => {
      fireEvent.change(within(planCard).getByLabelText(ru.question.planFeedbackLabel), {
        target: { value: 'Добавьте примеры из практики' },
      });
    });
    await act(async () => {
      fireEvent.click(within(planCard).getByRole('button', { name: ru.question.planApprove }));
    });
    expect(planAnswers).toEqual([
      {
        action: 'approved',
        approved: true,
        feedback: 'Добавьте примеры из практики',
      },
    ]);
  });

  test('reads and renders native TaskChecklistCard, ObjectiveCard, and SubagentCard from message parts', async () => {
    const message = {
      id: 'm-native-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-task_write',
          toolCallId: 'call-tasks-1',
          state: 'output-available',
          input: {
            tasks: [
              { content: 'Проверить свежие поводы', status: 'completed' },
              {
                content: 'Собрать черновик сути',
                activeForm: 'Собираем черновик сути',
                status: 'in_progress',
              },
              { content: 'Адаптировать под Telegram', status: 'pending' },
            ],
          },
          output: { ok: true },
        },
        {
          type: 'tool-set_objective',
          toolCallId: 'call-obj-1',
          state: 'output-available',
          input: {
            objective: 'Подготовить анонс релиза в два канала',
            feedback: 'Суть проверена по фактам',
          },
          output: { ok: true, status: 'active' },
        },
        {
          type: 'tool-subagent',
          toolCallId: 'call-sub-1',
          state: 'output-available',
          input: {
            agentType: 'research',
            task: 'Найти три свежих источника по теме релиза',
          },
          output: {
            status: 'completed',
            result: 'Найдены 3 подтверждённых источника с цифрами.',
          },
        },
      ],
    };

    const blocks = contract.readMessageBlocks(message);
    expect(blocks.map((block) => block.type)).toEqual(['tasks', 'objective', 'subagent']);

    await act(async () => {
      render(
        h(
          'div',
          null,
          h(cards.TaskChecklistCard, { tasks: blocks[0].tasks, words: ru }),
          h(cards.ObjectiveCard, { objective: blocks[1].objective, words: ru }),
          h(cards.SubagentCard, { subagent: blocks[2].subagent, words: ru })
        )
      );
    });

    const taskCard = document.querySelector('[data-agent-card="tasks"]');
    expect(taskCard).not.toBeNull();
    expect(taskCard.textContent).toContain(ru.tasks.completed(1, 3));
    expect(taskCard.textContent).toContain('Собираем черновик сути');

    const objectiveCard = document.querySelector('[data-agent-card="objective"]');
    expect(objectiveCard).not.toBeNull();
    expect(objectiveCard.textContent).toContain('Подготовить анонс релиза в два канала');
    expect(objectiveCard.textContent).toContain('Суть проверена по фактам');

    const subagentCard = document.querySelector('[data-agent-card="subagent"]');
    expect(subagentCard).not.toBeNull();
    expect(subagentCard.textContent).toContain(`${ru.subagent.agents.research} · ${ru.subagent.statuses.done}`);
    expect(subagentCard.textContent).toContain('Найдены 3 подтверждённых источника с цифрами.');
  });

  test('maps transient stream_retry and model_fallback data parts to human stage words without "модель"', () => {
    const retryPart = contract.readProgressPart({
      type: 'data-stream_retry',
      data: { attempt: 1, maxRetries: 2 },
    });
    expect(retryPart).toEqual({
      capability: 'agent',
      stage: 'stream-retry',
    });
    const fallbackPart = contract.readProgressPart({
      type: 'data-model_fallback',
      data: { fromModel: 'openai/gpt-5.4', toModel: 'anthropic/claude-sonnet-4-6' },
    });
    expect(fallbackPart).toEqual({
      capability: 'agent',
      stage: 'model-fallback',
    });

    const ruRetry = copy.stageWordFor(ru, 'stream-retry');
    const ruFallback = copy.stageWordFor(ru, 'model-fallback');
    expect(ruRetry).toBe('Связь мигнула — повторяем шаг…');
    expect(ruFallback).toBe('Переключаемся на резервный ИИ…');
    expect(ruFallback).not.toMatch(/модел/i);
    expect(copy.stageWordFor(en, 'stream-retry')).toBe('Connection hiccup — retrying the step…');
    expect(copy.stageWordFor(en, 'model-fallback')).toBe('Switching to the backup AI…');
  });

  test('folds ask_user / submit_plan cards when data-tool-call-resumed arrives in stored history', () => {
    const message = {
      id: 'm-resumed-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-ask_user',
          toolCallId: 'call-ask-1',
          state: 'output-available',
          input: { question: 'Какой тон выбрать?' },
          output: { answer: 'Спокойный деловой' },
        },
        {
          type: 'data-tool-call-suspended',
          id: 'call-ask-1',
          data: {
            runId: 'run-ask-1',
            toolCallId: 'call-ask-1',
            toolName: 'ask_user',
            suspendPayload: {
              kind: 'choice',
              question: 'Какой тон выбрать?',
              options: ['Спокойный деловой'],
            },
          },
        },
        {
          type: 'data-tool-call-resumed',
          id: 'call-ask-1',
          data: {
            runId: 'run-ask-1',
            toolCallId: 'call-ask-1',
            toolName: 'ask_user',
          },
        },
      ],
    };

    const blocks = contract.readMessageBlocks(message);
    const questionBlock = blocks.find((block) => block.type === 'question');
    expect(questionBlock).toBeDefined();
    expect(questionBlock.runId).toBeNull();
  });

  test('reattaches to a running background turn on reload and stops it via POST /agent/threads/:id/stop (A11, A13)', async () => {
    const calls = [];
    const fetchMock = async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? 'GET' });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            {
              id: 'u1',
              role: 'user',
              parts: [{ type: 'text', text: 'Собери заготовку' }],
            },
          ],
          pending: [],
          execution: { requestId: 'req-bg-1', state: 'settled', outcome: 'interrupted' },
        }),
      };
    };

    const conversationMod = loadWithMocks(
      'apps/frontend/src/components/agents/agent.conversation.tsx',
      {
        react: React,
        '@ai-sdk/react': {
          useChat: ({ messages }) => ({
            messages,
            sendMessage: () => Promise.resolve(),
            status: 'ready',
            stop: () => Promise.resolve(),
            error: null,
            clearError: () => undefined,
            regenerate: () => Promise.resolve(),
            addToolApprovalResponse: () => Promise.resolve(),
            setMessages: () => undefined,
          }),
        },
        swr: {
          __esModule: true,
          default: () => ({ data: undefined }),
          useSWRConfig: () => ({ mutate: () => Promise.resolve() }),
        },
        '@contentfactory/helpers/utils/custom.fetch': {
          useFetch: () => fetchMock,
        },
        '@contentfactory/frontend/components/onboarding/use-onboarding-progress': {
          useOnboardingProgress: () => ({ answered: false, progress: null }),
        },
        '@contentfactory/frontend/components/layout/user.context': {
          useUser: () => ({ role: 'ADMIN' }),
        },
        '@contentfactory/frontend/components/ui/allowance-hint': {
          ALLOWANCE_API: '/billing/allowance',
          AllowanceHint: () => null,
        },
        '@contentfactory/react/translation/get.transation.service.client': {
          useT: () => (_key, fallback) => fallback,
        },
        './agent.threads': { THREADS_KEY: '/agent/threads' },
        './agent.transport': {
          isAgentRequestNotStarted: () => false,
          createAgentTransport: () => ({}),
          screenTimeZone: () => 'Europe/Moscow',
        },
        './agent.composer': {
          AgentComposer: () => null,
        },
        './agent.markdown': {
          AgentMarkdown: ({ text }) => h('p', null, text),
        },
      }
    );

    await act(async () => {
      render(
        h(conversationMod.AgentConversation, {
          threadId: 'thread-bg-1',
          initialMessages: [
            {
              id: 'u1',
              role: 'user',
              parts: [{ type: 'text', text: 'Собери заготовку' }],
            },
          ],
          initialExecution: { requestId: 'req-bg-1', state: 'running' },
          pending: [],
          onThreadId: () => undefined,
          onTitle: () => undefined,
          onArtifact: () => undefined,
          openArtifact: null,
          onArtifactRemoved: () => undefined,
          starter: null,
          onStarterUsed: () => undefined,
          words: ru,
        })
      );
    });

    const progressCard = document.querySelector('[data-agent-card="progress"]');
    expect(progressCard).not.toBeNull();
    expect(progressCard.textContent).toContain(ru.progress.working);

    await act(async () => {
      fireEvent.click(within(progressCard).getByRole('button', { name: ru.progress.stop }));
    });

    expect(calls).toContainEqual({
      url: '/agent/threads/thread-bg-1/stop',
      method: 'POST',
    });
  });
});
