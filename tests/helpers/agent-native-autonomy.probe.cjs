'use strict';

/**
 * Probe for `content-factory-next-on0i.4` (`A5`, `A8`, `A18`, `A19`, `A20`):
 * Runs inside Node with real `@mastra/core` (`Agent`, `AgentController`,
 * `Mastra`, `InMemoryStore`, `TaskStateProcessor`, `ToolSearchProcessor`,
 * `defineSchedule`, `goal` judge loop, `subagent`, `ask_user`, `submit_plan`,
 * `task_*`, `set_objective`, and `schedule_followup_*`).
 */

const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { handleChatStream } = require('@mastra/ai-sdk');
const {
  IDENTITY,
  fixtures,
  loadCapabilityModule,
  servicesFrom,
} = require('./agent-capabilities.cjs');

const conductor = loadCapabilityModule('../conductor/index.ts');
const questionCard = loadCapabilityModule('question-card.ts');

const usage = {
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 5, text: 5 },
};

const scriptedModel = (steps, modelId = 'scripted-main') => {
  const seen = { calls: [] };
  let step = 0;
  const next = (options) => {
    const systemText = (options.prompt || [])
      .filter((m) => m.role === 'system')
      .map((m) =>
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
          ? m.content.map((p) => p.text ?? '').join('\n')
          : ''
      )
      .join('\n');
    seen.calls.push({
      modelId,
      system: systemText,
      prompt: JSON.stringify(options.prompt),
      tools: (options.tools || []).map((t) => t.name),
    });
    const plan = steps[step] || [['text', 'Готово.']];
    step += 1;
    const content = plan.map(([kind, a, b], index) =>
      kind === 'tool'
        ? {
            type: 'tool-call',
            toolCallId: `${modelId}-call-${step}-${index}`,
            toolName: a,
            input: JSON.stringify(b ?? {}),
          }
        : { type: 'text', text: a }
    );
    const hasTools = content.some((p) => p.type === 'tool-call');
    return {
      content,
      finishReason: hasTools
        ? { unified: 'tool-calls', raw: 'tool_calls' }
        : { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    };
  };

  return {
    seen,
    model: {
      specificationVersion: 'v3',
      provider: 'scripted',
      modelId,
      supportedUrls: {},
      doGenerate: async (options) => next(options),
      doStream: async (options) => {
        const result = next(options);
        const parts = [{ type: 'stream-start', warnings: [] }];
        for (const [index, part] of result.content.entries()) {
          if (part.type === 'tool-call') {
            parts.push(part);
          } else {
            const id = `text-${step}-${index}`;
            parts.push({ type: 'text-start', id });
            parts.push({ type: 'text-delta', id, delta: part.text });
            parts.push({ type: 'text-end', id });
          }
        }
        parts.push({ type: 'finish', finishReason: result.finishReason, usage });
        return {
          stream: new ReadableStream({
            start(controller) {
              for (const part of parts) controller.enqueue(part);
              controller.close();
            },
          }),
        };
      },
    },
  };
};

const drain = async (stream) => {
  const parts = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  return parts;
};

const allowAll = { check: async () => ({ allowed: true, policies: [] }) };

const buildFakeServices = () => {
  const all = fixtures();
  const merged = {};
  for (const fixture of Object.values(all)) {
    for (const [name, value] of Object.entries(fixture.services)) {
      merged[name] = { ...(merged[name] || {}), ...value };
    }
  }
  const createdPieces = [];
  const basePrepare = merged.IntakeService.prepare;
  merged.IntakeService = {
    ...merged.IntakeService,
    prepare: async (...args) => {
      createdPieces.push(args);
      return basePrepare(...args);
    },
  };
  return { services: servicesFrom(merged), createdPieces };
};

/**
 * 1. Tests native `ask_user` and `submit_plan` suspend/resume + questionCardView + normalizeResumeDataForPendingCall.
 */
const probeAskUserAndSubmitPlan = async () => {
  const { services } = buildFakeServices();
  const storage = new InMemoryStore();
  const memory = conductor.createConductorMemory(storage);
  const { model, seen } = scriptedModel([
    // Turn 1: call ask_user -> suspends
    [
      [
        'tool',
        'ask_user',
        {
          question: 'Для какой аудитории пишем этот разбор?',
          options: [
            { label: 'Разработчики', description: 'Технический уклон' },
            { label: 'Руководители', description: 'Бизнес-выводы' },
          ],
        },
      ],
    ],
    // Turn 1 resume: receives answer, then calls submit_plan -> suspends
    [
      [
        'tool',
        'submit_plan',
        {
          title: 'План подготовки материала',
          plan: '1. Собрать фактуру\n2. Написать черновик\n3. Проверить клише',
        },
      ],
    ],
    // Turn 1 plan resume: receives approval -> finishes
    [['text', 'План согласован, приступаем к работе.']],
  ]);

  const agent = conductor.buildConductorAgent({
    services,
    gate: allowAll,
    memory,
    model: async () => model,
    durable: false,
  });
  const mastra = new Mastra({
    storage,
    agents: { [conductor.CONDUCTOR_AGENT_ID]: agent },
    logger: false,
  });
  const registered = mastra.getAgentById(conductor.CONDUCTOR_AGENT_ID);
  const threadId = 'thread-autonomy-ask-plan';
  const resourceId = conductor.conductorResourceId(
    IDENTITY.organizationId,
    IDENTITY.userId
  );
  await memory.createThread({
    threadId,
    resourceId,
    title: 'Проверка вопросов и плана',
  });

  // Step 1: start turn that suspends on ask_user
  const firstParts = await drain(
    await handleChatStream({
      mastra,
      agentId: conductor.CONDUCTOR_AGENT_ID,
      version: 'v7',
      params: {
        messages: [
          {
            id: 'm-ask-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Спланируй статью' }],
          },
        ],
        requestContext: conductor.buildConductorContext({
          identity: IDENTITY,
          threadId,
          paidLimit: 2,
        }),
        memory: { thread: threadId, resource: resourceId },
      },
    })
  );

  const suspendedAfterAsk = (
    await registered.listSuspendedRuns({ threadId, resourceId })
  ).runs;
  const askCall = suspendedAfterAsk[0]?.toolCalls?.[0];
  const askCardView = questionCard.questionCardView(askCall?.suspendPayload);

  // Verify question-card compatibility with { answer, decideForPerson }
  const askInput = conductor.parseAgentChatBody({
    threadId,
    runId: suspendedAfterAsk[0].runId,
    toolCallId: askCall.toolCallId,
    cardId: askCardView.cardId,
    resumeData: { answer: 'Разработчики', decideForPerson: false },
  });
  const askVerified = conductor.verifyPendingAnswer(
    askInput,
    suspendedAfterAsk,
    { threadId, resourceId }
  );
  const normalizedAskResumeData = conductor.normalizeResumeDataForPendingCall(
    suspendedAfterAsk,
    askInput.runId,
    askVerified.toolCallId,
    askInput.resumeData
  );

  // Step 2: resume ask_user -> suspends on submit_plan
  const secondParts = await drain(
    await handleChatStream({
      mastra,
      agentId: conductor.CONDUCTOR_AGENT_ID,
      version: 'v7',
      params: {
        messages: [],
        runId: askInput.runId,
        toolCallId: askVerified.toolCallId,
        resumeData: normalizedAskResumeData,
        requestContext: conductor.buildConductorContext({
          identity: IDENTITY,
          threadId,
          paidLimit: 2,
        }),
        memory: { thread: threadId, resource: resourceId },
      },
    })
  );

  const suspendedAfterPlan = (
    await registered.listSuspendedRuns({ threadId, resourceId })
  ).runs;
  const planCall = suspendedAfterPlan[0]?.toolCalls?.[0];
  const planCardView = questionCard.questionCardView(planCall?.suspendPayload);

  const planInput = conductor.parseAgentChatBody({
    threadId,
    runId: suspendedAfterPlan[0].runId,
    toolCallId: planCall.toolCallId,
    cardId: planCardView.cardId,
    resumeData: { action: 'approved', feedback: 'Отличный план' },
  });
  const planVerified = conductor.verifyPendingAnswer(
    planInput,
    suspendedAfterPlan,
    { threadId, resourceId }
  );
  const normalizedPlanResumeData = conductor.normalizeResumeDataForPendingCall(
    suspendedAfterPlan,
    planInput.runId,
    planVerified.toolCallId,
    planInput.resumeData
  );

  // Step 3: resume submit_plan -> completes
  const thirdParts = await drain(
    await handleChatStream({
      mastra,
      agentId: conductor.CONDUCTOR_AGENT_ID,
      version: 'v7',
      params: {
        messages: [],
        runId: planInput.runId,
        toolCallId: planVerified.toolCallId,
        resumeData: normalizedPlanResumeData,
        requestContext: conductor.buildConductorContext({
          identity: IDENTITY,
          threadId,
          paidLimit: 2,
        }),
        memory: { thread: threadId, resource: resourceId },
      },
    })
  );

  return {
    firstPartsCount: firstParts.length,
    askToolName: askCall?.toolName,
    askCardView,
    normalizedAskResumeData,
    secondPartsCount: secondParts.length,
    planToolName: planCall?.toolName,
    planCardView,
    normalizedPlanResumeData,
    thirdText: thirdParts
      .filter((p) => p.type === 'text-delta')
      .map((p) => p.delta)
      .join(''),
    modelCalls: seen.calls.length,
  };
};

/**
 * 2. Tests `task_write`, `task_update`, `task_complete`, `task_check` and single `TaskStateProcessor` injection.
 */
const probeTasksAndTaskStateProcessor = async () => {
  const { services } = buildFakeServices();
  const storage = new InMemoryStore();
  const memory = conductor.createConductorMemory(storage);
  const { model, seen } = scriptedModel([
    [
      [
        'tool',
        'task_write',
        {
          tasks: [
            {
              id: 't-1',
              content: 'Собрать источники по теме',
              status: 'in_progress',
              activeForm: 'Собираем источники',
            },
            {
              id: 't-2',
              content: 'Подготовить заготовку',
              status: 'pending',
              activeForm: 'Готовим заготовку',
            },
          ],
        },
      ],
    ],
    [
      [
        'tool',
        'task_update',
        { id: 't-1', status: 'completed' },
      ],
      [
        'tool',
        'task_update',
        { id: 't-2', status: 'in_progress' },
      ],
    ],
    [['tool', 'task_check', {}]],
    [['tool', 'task_complete', { id: 't-2' }]],
    [['text', 'Все задачи выполнены.']],
  ]);

  const agent = conductor.buildConductorAgent({
    services,
    gate: allowAll,
    memory,
    storage,
    model: async () => model,
    durable: false,
  });
  const mastra = new Mastra({
    storage,
    agents: { [conductor.CONDUCTOR_AGENT_ID]: agent },
    logger: false,
  });
  const registered = mastra.getAgent(conductor.CONDUCTOR_AGENT_ID);
  const threadId = 'thread-autonomy-tasks';
  const resourceId = conductor.conductorResourceId(
    IDENTITY.organizationId,
    IDENTITY.userId
  );
  await memory.createThread({
    threadId,
    resourceId,
    title: 'Задачи в диалоге',
  });

  const result = await registered.generate('Выполни задачи по шагам', {
    requestContext: conductor.buildConductorContext({
      identity: IDENTITY,
      threadId,
      paidLimit: 3,
    }),
    memory: { thread: threadId, resource: resourceId },
  });

  // Count how many times TaskStateProcessor's <current-task-list tag appears in step 2's prompt
  const secondStepPrompt = seen.calls[1]?.prompt ?? '';
  const taskReminderOccurrences = (
    secondStepPrompt.match(/<current-task-list\b/g) || []
  ).length;

  return {
    text: result.text,
    toolResults: (result.steps || [])
      .flatMap((s) => s.toolResults || [])
      .map((r) => (r.payload ?? r).result),
    secondStepHasTaskState: secondStepPrompt.includes('Собрать источники по теме'),
    taskReminderOccurrences,
  };
};

/**
 * 3. Tests `set_objective` and the native `goal` judge:
 *    - Judge refuses prose-only completion when workspace inspection shows piece is not created yet;
 *    - Agent runs continuation turn, creates the piece, and judge then verifies and marks achieved;
 *    - Internal `goalJudge: true` and `forkedSubagent: true` threads are hidden from thread listing.
 */
const probeObjectiveAndGoalJudge = async () => {
  const authorRequest = 'Поставь цель создать заготовку «Итоги релиза» и выполни её';
  const { services, createdPieces } = buildFakeServices();
  const storage = new InMemoryStore();
  const memory = conductor.createConductorMemory(storage);

  // Main agent model:
  // Run 1 (step 1): sets objective, then claims in prose "Уже всё написано" WITHOUT calling piece_create
  // Run 2 (continuation triggered by judge): calls piece_create, then reports completion
  const { model: mainModel, seen: mainSeen } = scriptedModel(
    [
      [
        [
          'tool',
          'set_objective',
          {
            action: 'set',
            text: 'Создать заготовку с темой «Итоги релиза»',
            maxRuns: 3,
          },
        ],
      ],
      [['text', 'Готово, мы уже создали заготовку с темой «Итоги релиза».']],
      [
        [
          'tool',
          'piece_create',
          { material: 'Итоги релиза: ключевые результаты недели.' },
        ],
      ],
      [['text', 'Заготовка «Итоги релиза» создана и сохранена в пространстве.']],
    ],
    'main-agent'
  );

  // Judge model:
  // Evaluation 1: calls workspace_snapshot to verify, sees createdPieces is still 0, returns decision: "continue"
  // Evaluation 2: calls workspace_snapshot to verify, sees createdPieces > 0, returns decision: "done"
  let judgeEvalCount = 0;
  const { model: judgeModel, seen: judgeSeen } = scriptedModel(
    [
      [['tool', 'workspace_snapshot', {}]],
      [
        [
          'text',
          JSON.stringify({
            decision: 'continue',
            reason:
              'В пространстве ещё не создана новая заготовка (piece_create не вызывался). Создай заготовку через инструмент piece_create перед завершением.',
          }),
        ],
      ],
      [['tool', 'workspace_snapshot', {}]],
      [
        [
          'text',
          JSON.stringify({
            decision: 'done',
            reason:
              'Заготовка создана через piece_create и подтверждена в пространстве.',
          }),
        ],
      ],
    ],
    'goal-judge'
  );

  const agent = conductor.buildConductorAgent({
    services,
    gate: allowAll,
    memory,
    storage,
    model: async () => mainModel,
    goalJudge: async () => {
      judgeEvalCount += 1;
      return judgeModel;
    },
    durable: false,
  });
  const mastra = new Mastra({
    storage,
    agents: { [conductor.CONDUCTOR_AGENT_ID]: agent },
    logger: false,
  });
  const registered = mastra.getAgent(conductor.CONDUCTOR_AGENT_ID);

  const threadId = 'thread-autonomy-goal';
  const resourceId = conductor.conductorResourceId(
    IDENTITY.organizationId,
    IDENTITY.userId
  );
  await memory.createThread({
    threadId,
    resourceId,
    title: 'Цель с проверкой артефакта',
  });

  // Also create a synthetic forkedSubagent thread to prove list() filters both goalJudge and forkedSubagent
  await memory.createThread({
    threadId: 'thread-forked-subagent-internal',
    resourceId,
    title: '[subagent:research] internal',
    metadata: { forkedSubagent: true },
  });

  const initial = await registered.generate(
    authorRequest,
    {
      requestContext: conductor.buildConductorContext({
        identity: IDENTITY,
        threadId,
        paidLimit: 3,
        originalAuthorRequest: { messageId: 'goal-author-message', text: authorRequest },
      }),
      memory: { thread: threadId, resource: resourceId },
    }
  );

  // Objective mutation has a native approval boundary before the goal exists.
  const beforeObjectiveApproval = {
    finishReason: initial.finishReason,
    createdPiecesCount: createdPieces.length,
    mainModelCalls: mainSeen.calls.length,
    judgeEvalCount,
  };
  const suspended = (
    await registered.listSuspendedRuns({ threadId, resourceId })
  ).runs.find((run) => run.runId === initial.runId);
  const objectiveCall = suspended?.toolCalls?.find(
    (call) => call.toolName === 'set_objective' &&
      call.toolCallId === initial.suspendPayload?.toolCallId
  );
  if (initial.finishReason !== 'suspended' || !suspended || !objectiveCall) {
    throw new Error('Expected the owned native set_objective approval before goal execution.');
  }
  const result = await registered.resumeGenerate({ approved: true }, {
    runId: suspended.runId,
    toolCallId: objectiveCall.toolCallId,
    requestContext: conductor.buildConductorContext({
      identity: IDENTITY,
      threadId,
      paidLimit: 3,
      originalAuthorRequest: { messageId: 'goal-author-message', text: authorRequest },
    }),
    memory: { thread: threadId, resource: resourceId },
  });

  const goalStore = await conductor.resolveConductorGoalStore({
    mastra,
    storage,
    memory,
  });
  const { readObjective } = require('@mastra/core/tools');
  const storedObjective = conductor.normalizeObjectiveRecord(
    await readObjective(goalStore, threadId)
  );

  const allRawThreads = await memory.listThreads({
    filter: { resourceId },
    page: 0,
    perPage: 50,
  });
  const visibleThreads = allRawThreads.threads.filter(
    (row) =>
      row.metadata?.forkedSubagent !== true &&
      row.metadata?.goalJudge !== true
  );

  return {
    finalText: result.text,
    beforeObjectiveApproval,
    createdPiecesCount: createdPieces.length,
    authorRequestPreserved: createdPieces[0]?.[1]?.input === authorRequest,
    mainModelCalls: mainSeen.calls.length,
    judgeModelCalls: judgeSeen.calls.length,
    judgeEvalCount,
    judgeToolsOffered: judgeSeen.calls[0]?.tools ?? [],
    storedObjective,
    rawThreadCount: allRawThreads.threads.length,
    rawThreads: allRawThreads.threads.map((t) => ({ id: t.id, metadata: t.metadata })),
    visibleThreadIds: visibleThreads.map((t) => t.id),
  };
};

/**
 * 4. Tests bounded `subagent` delegation (`research`, `writing`, `review`), role metering,
 *    `forked: true` refusal, and `USER` role restriction.
 */
const probeSubagentDelegation = async () => {
  const authorRequest = 'Запусти исследование, написание и ревью';
  const { services, createdPieces } = buildFakeServices();
  const storage = new InMemoryStore();
  const memory = conductor.createConductorMemory(storage);

  const subagentRolesCalled = [];
  const { model: mainModel } = scriptedModel(
    [
      [
        [
          'tool',
          'subagent',
          {
            task: 'Проверь заготовку p1 в пространстве',
            agentType: 'research',
          },
        ],
      ],
      [
        [
          'tool',
          'subagent',
          {
            task: 'Создай черновик заготовки по итогам исследования',
            agentType: 'writing',
          },
        ],
      ],
      [
        [
          'tool',
          'subagent',
          {
            task: 'Проверь текст на штампы',
            agentType: 'review',
          },
        ],
      ],
      [
        [
          'tool',
          'subagent',
          {
            task: 'Попытка форка',
            agentType: 'research',
            forked: true,
          },
        ],
      ],
      [['text', 'Субагенты завершили работу.']],
    ],
    'main'
  );

  const researchModel = scriptedModel(
    [
      [['tool', 'piece_open', { pieceId: 'p1' }]],
      [['text', 'Исследование завершено: заготовка cnt-1 найдена.']],
    ],
    'sub-research'
  );
  const writingModel = scriptedModel(
    [
      [['tool', 'piece_create', { material: 'Черновик от субагента writing.' }]],
      [['text', 'Черновик создан: cnt-2.']],
    ],
    'sub-writing'
  );
  const reviewModel = scriptedModel(
    [
      [['tool', 'text_slop_check', { text: 'Чистый текст без штампов.' }]],
      [['text', 'Проверка завершена: штампов нет.']],
    ],
    'sub-review'
  );

  const agent = conductor.buildConductorAgent({
    services,
    gate: allowAll,
    memory,
    storage,
    model: async () => mainModel,
    subagentModel: async (_identity, agentType) => {
      subagentRolesCalled.push({
        agentType,
        billingRole: conductor.CONDUCTOR_SUBAGENT_ROLE_MAP[agentType],
      });
      if (agentType === 'research') return researchModel.model;
      if (agentType === 'writing') return writingModel.model;
      return reviewModel.model;
    },
    durable: false,
  });
  const mastra = new Mastra({
    storage,
    agents: { [conductor.CONDUCTOR_AGENT_ID]: agent },
    logger: false,
  });
  const registered = mastra.getAgent(conductor.CONDUCTOR_AGENT_ID);

  const threadId = 'thread-autonomy-subagents';
  const resourceId = conductor.conductorResourceId(
    IDENTITY.organizationId,
    IDENTITY.userId
  );
  await memory.createThread({
    threadId,
    resourceId,
    title: 'Делегирование субагентам',
  });

  const execution = conductor.createConductorExecution({
    requestId: 'subagent-probe',
  });
  const result = await execution.run(() =>
    registered.generate(authorRequest, {
      ...execution.streamOptions(),
      abortSignal: execution.signal,
      requestContext: conductor.buildConductorContext({
        identity: IDENTITY,
        threadId,
        paidLimit: 4,
        originalAuthorRequest: { messageId: 'subagent-author-message', text: authorRequest },
      }),
      memory: { thread: threadId, resource: resourceId },
    })
  );

  return {
    subagentRolesCalled,
    createdPiecesByWritingSubagent: createdPieces.length,
    authorRequestPreserved: createdPieces[0]?.[1]?.input === authorRequest,
    stepSummaries: (result.steps || []).map((s) => ({
      toolCalls: s.toolCalls,
      toolResults: s.toolResults,
    })),
    toolResults: (result.steps || [])
      .flatMap((s) => s.toolResults || [])
      .map((r) => (r.payload ?? r).result),
    researchToolsOffered: researchModel.seen.calls[0]?.tools ?? [],
    writingToolsOffered: writingModel.seen.calls[0]?.tools ?? [],
    reviewToolsOffered: reviewModel.seen.calls[0]?.tools ?? [],
  };
};

/**
 * 5. Tests `ToolSearchProcessor` role-aware tool discovery (`A8`).
 */
const probeToolSearchProcessor = async () => {
  const { services } = buildFakeServices();
  const processor = conductor.createConductorToolSearchProcessor({
    services,
    gate: allowAll,
    topK: 5,
    minScore: 0,
  });

  const editorCtx = conductor.buildConductorContext({
    identity: IDENTITY,
    threadId: 'thread-search-editor',
  });
  const userCtx = conductor.buildConductorContext({
    identity: { ...IDENTITY, role: 'USER' },
    threadId: 'thread-search-user',
  });

  const editorPrepared = await processor.processInputStep({
    stepNumber: 0,
    requestContext: editorCtx,
    tools: {},
    messages: [],
    messageList: { addSystem: () => undefined },
  });
  const userPrepared = await processor.processInputStep({
    stepNumber: 0,
    requestContext: userCtx,
    tools: {},
    messages: [],
    messageList: { addSystem: () => undefined },
  });

  const editorSearchResult = await editorPrepared.tools.search_tools.execute(
    { query: 'create piece draft' },
    { requestContext: editorCtx }
  );
  const userSearchResult = await userPrepared.tools.search_tools.execute(
    { query: 'create piece draft' },
    { requestContext: userCtx }
  );

  return {
    editorHasSearchTools: Boolean(editorPrepared.tools?.search_tools),
    editorHasLoadTool: Boolean(editorPrepared.tools?.load_tool),
    editorSearchNames: (editorSearchResult?.results ?? []).map((r) => r.name),
    userSearchNames: (userSearchResult?.results ?? []).map((r) => r.name),
  };
};

/**
 * 6. Tests recurring agent follow-up schedules (`schedule_followup_create`, `list`, `cancel`,
 *    `Europe/Moscow` default timezone assumption, and deleted-thread cleanup/skip, `A19`, `A20`).
 */
const probeFollowUpSchedules = async () => {
  const { services } = buildFakeServices();
  const storage = new InMemoryStore();
  const memory = conductor.createConductorMemory(storage);
  let createdScheduleId = null;
  const { model } = scriptedModel([
    [
      [
        'tool',
        'schedule_followup_create',
        {
          title: 'Еженедельный дайджест идей',
          prompt: 'Подбери 3 свежие идеи по ключевым темам недели',
          cron: '0 9 * * 1',
        },
      ],
    ],
    [['tool', 'schedule_followup_list', {}]],
    [['text', 'Регулярное поручение создано.']],
  ]);

  let mastraRef = null;
  const agent = conductor.buildConductorAgent({
    services,
    gate: allowAll,
    memory,
    storage,
    model: async () => model,
    schedules: () => mastraRef?.schedules,
    durable: false,
  });

  mastraRef = new Mastra({
    storage,
    agents: { [conductor.CONDUCTOR_AGENT_ID]: agent },
    schedules: {
      prepare: async ({ schedule }) => {
        const s = schedule;
        const threadId = s.threadId ?? s.target?.threadId;
        const resourceId = s.resourceId ?? s.target?.resourceId;
        if (!threadId || !resourceId) return null;
        const thread = await memory.getThreadById({
          threadId,
        });
        if (!thread || thread.resourceId !== resourceId) {
          return null;
        }
        return {
          requestContext: conductor.buildConductorContext({
            identity: {
              ...IDENTITY,
              timeZone: s.timezone ?? s.metadata?.timeZone ?? 'Europe/Moscow',
            },
            threadId,
            paidLimit: 2,
          }),
        };
      },
    },
    logger: false,
  });

  const threadId = 'thread-autonomy-schedules';
  const resourceId = conductor.conductorResourceId(
    IDENTITY.organizationId,
    IDENTITY.userId
  );
  await memory.createThread({
    threadId,
    resourceId,
    title: 'Регулярные поручения',
  });

  // Identity with unset/UTC timezone so Europe/Moscow assumption triggers
  const utcIdentity = { ...IDENTITY, timeZone: 'UTC' };
  const registered = mastraRef.getAgent(conductor.CONDUCTOR_AGENT_ID);
  const result = await registered.generate(
    'Каждый понедельник в 9 утра подбирай идеи',
    {
      requestContext: conductor.buildConductorContext({
        identity: utcIdentity,
        threadId,
        paidLimit: 1,
      }),
      memory: { thread: threadId, resource: resourceId },
    }
  );

  const toolOutputs = (result.steps || [])
    .flatMap((s) => s.toolResults || [])
    .map((r) => (r.payload ?? r).result);
  const createdSchedule = toolOutputs[0]?.schedule;
  createdScheduleId = createdSchedule?.id;
  const listedBeforeCancel = toolOutputs[1]?.schedules ?? [];

  // Test cancelling via schedule_followup_cancel tool directly
  const followUpTools = conductor.buildConductorAutonomyTools({
    subagents: [],
    getMemory: () => memory,
    getStorage: () => storage,
    getSchedulesManager: () => mastraRef.schedules,
    resolveSubagentModel: async () => model,
    createSubagentRunner: () => null,
  })({ identity: utcIdentity, hasControllerToolset: true });

  const cancelCtx = {
    agent: { threadId, resourceId },
    requestContext: conductor.buildConductorContext({
      identity: utcIdentity,
      threadId,
      paidLimit: 1,
    }),
  };
  const cancelOutput = await followUpTools.schedule_followup_cancel.execute(
    { scheduleId: createdScheduleId },
    cancelCtx
  );
  const listedAfterCancel = await followUpTools.schedule_followup_list.execute(
    {},
    cancelCtx
  );

  // Create a second schedule and then delete the thread to verify deleted-thread safety (A20)
  const secondCreated = await followUpTools.schedule_followup_create.execute(
    {
      title: 'Пятничный обзор',
      prompt: 'Подведи итоги недели',
      cron: '0 18 * * 5',
      timeZone: 'Europe/Kaliningrad',
    },
    cancelCtx
  );
  const rawSecondSchedule = await mastraRef.schedules.get(
    secondCreated.schedule.id
  );
  const prepareFn = async (scheduleRecord) => {
    const s = scheduleRecord;
    const tid = s.threadId ?? s.target?.threadId;
    const rid = s.resourceId ?? s.target?.resourceId;
    if (!tid || !rid) return null;
    const thread = await memory.getThreadById({ threadId: tid });
    if (!thread || thread.resourceId !== rid) return null;
    return {
      requestContext: conductor.buildConductorContext({
        identity: {
          ...IDENTITY,
          timeZone: s.timezone ?? s.metadata?.timeZone ?? 'Europe/Moscow',
        },
        threadId: tid,
        paidLimit: 2,
      }),
    };
  };
  const preparedWhileThreadAlive = await prepareFn(rawSecondSchedule);
  await memory.deleteThread(threadId);
  const preparedAfterThreadDeleted = await prepareFn(rawSecondSchedule);

  return {
    createdSchedule,
    listedBeforeCancelCount: listedBeforeCancel.length,
    cancelResult: cancelOutput,
    listedAfterCancelCount: (listedAfterCancel?.schedules ?? []).length,
    secondSchedule: secondCreated.schedule,
    preparedWhileThreadAlive: Boolean(preparedWhileThreadAlive?.requestContext),
    preparedAfterThreadDeleted,
  };
};

/**
 * 7. Tests `AgentThreadsService` internal thread filtering, objective CRUD,
 *    schedule CRUD, and deleted-thread schedule cleanup (`forgetThreadSchedules`).
 */
const probeThreadsService = async () => {
  const { AgentThreadsService } = loadCapabilityModule(
    '../conductor/agent-threads.service.ts',
    {
      mocks: {
        '@contentfactory/nestjs-libraries/chat/mastra.service': {
          MastraService: class {},
        },
      },
    }
  );
  const resourceId = conductor.conductorResourceId(
    IDENTITY.organizationId,
    IDENTITY.userId
  );
  const threads = new Map([
    [
      't-user',
      {
        id: 't-user',
        resourceId,
        title: 'Обычный диалог',
        createdAt: new Date('2026-10-19T10:00:00Z'),
        updatedAt: new Date('2026-10-19T10:05:00Z'),
        metadata: {},
      },
    ],
    [
      't-judge',
      {
        id: 't-judge',
        resourceId,
        title: 'Goal judge internal',
        createdAt: new Date('2026-10-19T10:01:00Z'),
        updatedAt: new Date('2026-10-19T10:02:00Z'),
        metadata: { goalJudge: true, forkedSubagent: true },
      },
    ],
    [
      't-fork',
      {
        id: 't-fork',
        resourceId,
        title: 'Forked subagent internal',
        createdAt: new Date('2026-10-19T10:01:00Z'),
        updatedAt: new Date('2026-10-19T10:02:00Z'),
        metadata: { forkedSubagent: true },
      },
    ],
  ]);

  const threadStates = new Map();
  const storedSchedules = new Map();
  let schedSeq = 0;

  const fakeThreadStateStore = {
    getState: async ({ threadId, type }) =>
      threadStates.get(`${threadId}:${type}`),
    setState: async ({ threadId, type, value }) => {
      threadStates.set(`${threadId}:${type}`, value);
    },
    deleteState: async ({ threadId, type }) => {
      threadStates.delete(`${threadId}:${type}`);
    },
  };

  const fakeMemory = {
    listThreads: async () => ({
      threads: Array.from(threads.values()),
      total: threads.size,
      page: 0,
      perPage: 50,
      hasMore: false,
    }),
    getThreadById: async ({ threadId }) => threads.get(threadId) ?? null,
    deleteThread: async (arg) => {
      const id = typeof arg === 'string' ? arg : arg?.threadId;
      threads.delete(id);
    },
    storage: {
      getStore: async (domain) =>
        domain === 'threadState' ? fakeThreadStateStore : null,
    },
  };

  const fakeSchedules = {
    create: async (def) => {
      schedSeq += 1;
      const row = {
        id: `sched-${schedSeq}`,
        ...def,
        nextFireAt: Date.now() + 3600_000,
      };
      storedSchedules.set(row.id, row);
      return row;
    },
    list: async ({ agentId, resourceId: rid, threadId }) => ({
      schedules: Array.from(storedSchedules.values()).filter(
        (item) =>
          item.agentId === agentId &&
          item.resourceId === rid &&
          (!threadId || item.threadId === threadId)
      ),
    }),
    get: async (id) => storedSchedules.get(id) ?? null,
    delete: async (id) => {
      storedSchedules.delete(id);
    },
  };

  const service = new AgentThreadsService({
    conductor: async () => ({
      getMemory: async () => fakeMemory,
      listSuspendedRuns: async () => ({ runs: [] }),
      listActiveRuns: async () => ({ runs: [] }),
    }),
    controller: async () => null,
    mastra: async () => ({
      getStorage: () => fakeMemory.storage,
      schedules: fakeSchedules,
    }),
  });

  const listed = await service.list(IDENTITY, 0, 20);
  let judgeHistoryRejected = false;
  let forkHistoryRejected = false;
  try {
    await service.history(IDENTITY, 't-judge');
  } catch {
    judgeHistoryRejected = true;
  }
  try {
    await service.history(IDENTITY, 't-fork');
  } catch {
    forkHistoryRejected = true;
  }

  const setRes = await service.setObjective(IDENTITY, 't-user', {
    text: 'Подготовить серию из 3 постов',
    maxRuns: 4,
  });
  const getRes = await service.getObjective(IDENTITY, 't-user');
  const clearRes = await service.clearObjective(IDENTITY, 't-user');
  const getAfterClearRes = await service.getObjective(IDENTITY, 't-user');

  const createdSched = await service.createFollowUpSchedule(
    { ...IDENTITY, timeZone: 'UTC' },
    't-user',
    {
      title: 'Утренний обзор',
      prompt: 'Покажи свежие идеи',
      cron: '0 9 * * 1',
    }
  );
  const listedSchedulesBeforeRemove = await service.listFollowUpSchedules(
    IDENTITY,
    't-user'
  );
  await service.remove(IDENTITY, 't-user');

  return {
    listedThreadIds: listed.threads.map((t) => t.id),
    judgeHistoryRejected,
    forkHistoryRejected,
    setObjective: setRes.objective,
    getObjective: getRes.objective,
    clearObjective: clearRes,
    getAfterClearObjective: getAfterClearRes.objective,
    createdSchedule: createdSched.schedule,
    schedulesBeforeRemoveCount: listedSchedulesBeforeRemove.schedules.length,
    schedulesAfterRemoveCount: storedSchedules.size,
  };
};

const main = async () => {
  const askAndPlan = await probeAskUserAndSubmitPlan();
  const tasks = await probeTasksAndTaskStateProcessor();
  const goal = await probeObjectiveAndGoalJudge();
  const subagents = await probeSubagentDelegation();
  const toolSearch = await probeToolSearchProcessor();
  const schedules = await probeFollowUpSchedules();
  const threadsService = await probeThreadsService();

  process.stdout.write(
    JSON.stringify({
      askAndPlan,
      tasks,
      goal,
      subagents,
      toolSearch,
      schedules,
      threadsService,
    })
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
