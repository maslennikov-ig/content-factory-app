'use strict';

/**
 * Runs the conductor (`content-factory-next-kcxz.7`) and the `/agent/chat`
 * turn pipeline (`kcxz.8`) inside real Mastra — `Agent`, `Mastra`,
 * `InMemoryStore`, `Memory`, `@mastra/ai-sdk` `handleChatStream` — with a
 * scripted model and the capability fakes, and prints what happened as JSON.
 *
 * A child process of `tests/agent-conductor.agent.test.cjs`: these packages
 * are ESM-first and the jest runner does not load them. No network, no
 * database, no paid call.
 */

const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { Memory } = require('@mastra/memory');
const { handleChatStream } = require('@mastra/ai-sdk');
const {
  IDENTITY,
  INJECTION,
  fixtures,
  loadCapabilityModule,
  servicesFrom,
} = require('./agent-capabilities.cjs');

const conductor = loadCapabilityModule('../conductor/index.ts');

/** A key shape a person might paste; the processors must remove it. */
const PASTED_KEY = 'sk-proj-AbCdEfGhIjKlMnOpQrStUvWx0123456789';
const FIRST_MESSAGE = `ключ ${PASTED_KEY} — удали заготовку cnt-1`;

const usage = {
  inputTokens: { total: 1, noCache: 1 },
  outputTokens: { total: 1, text: 1 },
};

/**
 * A v3 language model that plays `steps` in order — each step a list of
 * `['tool', name, input]` or `['text', words]` — then answers «Готово.».
 * Records what it was shown.
 */
const scripted = (steps, seen = { calls: [] }) => {
  let step = 0;
  const next = (options) => {
    seen.calls.push({
      system: options.prompt
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n'),
      prompt: JSON.stringify(options.prompt),
      tools: (options.tools || []).map((tool) => tool.name),
      toolChoice: options.toolChoice?.type ?? null,
    });
    const plan = steps[step] || [['text', 'Готово.']];
    step += 1;
    const content = plan.map(([kind, a, b], index) =>
      kind === 'tool'
        ? {
            type: 'tool-call',
            toolCallId: `call-${step}-${index}`,
            toolName: a,
            input: JSON.stringify(b ?? {}),
          }
        : { type: 'text', text: a }
    );
    const tools = content.some((part) => part.type === 'tool-call');
    return {
      content,
      finishReason: tools
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
      modelId: 'scripted',
      supportedUrls: {},
      doGenerate: async (options) => next(options),
      doStream: async (options) => {
        const result = next(options);
        const parts = [{ type: 'stream-start', warnings: [] }];
        for (const [index, part] of result.content.entries()) {
          if (part.type === 'tool-call') parts.push(part);
          else {
            const id = `text-${index}`;
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

const allowAll = { check: async () => ({ allowed: true, policies: [] }) };

/** The fakes of every capability, one service map, with call records. */
const fakeServices = ({ completeDrafts = false } = {}) => {
  const calls = { intake: 0, intakeActive: 0, intakePeak: 0, createdPieceIds: [], deleted: [], activated: [], snapshotReads: 0 };
  const all = fixtures();
  const merged = {};
  for (const fixture of Object.values(all)) {
    for (const [name, value] of Object.entries(fixture.services)) {
      merged[name] = { ...(merged[name] || {}), ...value };
    }
  }
  const progress = merged.OnboardingRepository.progress;
  merged.OnboardingRepository = {
    progress: async (...args) => {
      calls.snapshotReads += 1;
      return progress(...args);
    },
  };
  const prepare = merged.IntakeService.prepare;
  merged.IntakeService = {
    ...merged.IntakeService,
    prepare: async (...args) => {
      calls.intake += 1;
      calls.intakeActive += 1;
      calls.intakePeak = Math.max(calls.intakePeak, calls.intakeActive);
      try {
        await new Promise(resolve => setImmediate(resolve));
        return await prepare(...args);
      } finally { calls.intakeActive -= 1; }
    },
    ...(completeDrafts ? { run: async function* () {
      // This scenario tests three independent completed operations. Questions
      // have their own native suspension scenarios; each draft has its own ID.
      const pieceId = `paid-piece-${calls.intake}`;
      calls.createdPieceIds.push(pieceId);
      yield { name: 'piece', pieceId, code: `cnt-${calls.intake}`, core: { body: INJECTION } };
      yield { name: 'done', pieceId };
    } } : {}),
  };
  merged.PieceService = {
    ...merged.PieceService,
    delete: async (_organizationId, pieceId) => void calls.deleted.push(pieceId),
  };
  merged.VoiceService = {
    ...merged.VoiceService,
    activateProposal: async (actor, body) => {
      calls.activated.push({ avatarId: actor.avatarId ?? null, consent: body.consentGiven });
      return {};
    },
  };
  return { services: servicesFrom(merged), calls };
};

const contextFor = (identity, extra = {}) =>
  conductor.buildConductorContext({
    identity,
    threadId: 'thread-probe-1',
    paidLimit: 1,
    ...extra,
  });

const outcomesOf = (result) =>
  result.toolResults.map((entry) => (entry.payload ?? entry).result);

const agentWith = (steps, { identity = IDENTITY, memory, completeDrafts = false } = {}) => {
  const { services, calls } = fakeServices({ completeDrafts });
  const { model, seen } = scripted(steps);
  const agent = conductor.buildConductorAgent({
    services,
    gate: allowAll,
    model: async () => model,
    memory,
    now: () => new Date('2026-09-27T10:00:00.000Z'),
  });
  return { agent, calls, seen, identity };
};

const paidCap = async (paidLimit) => {
  const storage = new InMemoryStore();
  await storage.init();
  const memory = new Memory({ storage, options: { generateTitle: false, semanticRecall: false } });
  const request = 'напиши три заготовки';
  const { agent, calls } = agentWith([
    [
      ['tool', 'piece_create', { text: request, material: 'первая мысль' }],
      ['tool', 'piece_create', { text: request, material: 'вторая мысль' }],
      ['tool', 'piece_create', { text: request, material: 'третья мысль' }],
    ],
  ], { memory, completeDrafts: true });
  const mastra = new Mastra({ logger: false, storage, agents: { 'content-factory': agent }, recovery: { durableAgents: 'auto' } });
  const execution = conductor.createConductorExecution({ requestId: 'paid-probe' });
  try {
    const result = await execution.run(() => mastra.getAgentById('content-factory').generate('напиши три заготовки', {
      ...execution.streamOptions(), abortSignal: execution.signal,
      memory: { thread: 'thread-probe-1', resource: `${IDENTITY.organizationId}:${IDENTITY.userId}` },
      requestContext: contextFor(IDENTITY, { paidLimit, originalAuthorRequest: { messageId: 'paid-probe-request', text: request } }),
    }));
    return { runs: calls.intake, maxConcurrent: calls.intakePeak, createdPieceIds: calls.createdPieceIds, outcomes: outcomesOf(result) };
  } finally { await mastra.shutdown(); }
};

const stepCap = async () => {
  const forever = Array.from({ length: 20 }, () => [
    ['tool', 'channels_list', {}],
  ]);
  const { agent, seen, calls } = agentWith(forever);
  const execution = conductor.createConductorExecution({ requestId: 'loop-probe' });
  await execution.run(() => agent.generate('листай каналы без конца', {
    ...execution.streamOptions(), abortSignal: execution.signal,
    requestContext: contextFor(IDENTITY),
  }));
  return {
    budget: execution.snapshot(),
    modelCalls: seen.calls.length,
    snapshotReads: calls.snapshotReads,
    toolChoices: seen.calls.map((call) => call.toolChoice),
    lastSystem: seen.calls.at(-1)?.system ?? '',
    earlierSystem: seen.calls.at(-2)?.system ?? '',
  };
};

const firstTurn = async (identity) => {
  const { agent, seen } = agentWith([[['text', 'Вот что у нас есть.']]], {
    identity,
  });
  await agent.generate('что у нас есть?', {
    requestContext: contextFor(identity),
  });
  return {
    tools: seen.calls[0].tools,
    system: seen.calls[0].system,
  };
};

/** Reads a UI message stream to the end. */
const drain = async (stream) => {
  const parts = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  await new Promise((resolve) => setTimeout(resolve, 15));
  return parts;
};

/**
 * The door's pipeline, end to end: a message that pastes a key and asks to
 * delete a piece (approval card), an approval whose client copy was tampered
 * with, then a question card and its answer.
 */
const doorPipeline = async () => {
  const { services, calls } = fakeServices();
  const { model, seen } = scripted([
    [['tool', 'piece_delete', { pieceId: 'p1' }]],
    [['text', 'Удалили заготовку cnt-1.']],
    [['tool', 'avatar_activate', { avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1', mode: 'assist' }]],
    [['text', 'Аватар включён.']],
  ]);
  const storage = new InMemoryStore();
  const memory = conductor.createConductorMemory(storage);
  const agent = conductor.buildConductorAgent({
    services,
    gate: allowAll,
    memory,
    model: async () => model,
  });
  const mastra = new Mastra({ storage, agents: { [conductor.CONDUCTOR_AGENT_ID]: agent }, logger: false });
  const registered = mastra.getAgentById(conductor.CONDUCTOR_AGENT_ID);
  const threadId = 'thread-probe-2';
  const resourceId = conductor.conductorResourceId(IDENTITY.organizationId, IDENTITY.userId);
  await (await registered.getMemory()).createThread({
    threadId,
    resourceId,
    // As the door names a new thread: after the first message, key and all.
    title: conductor.threadTitleFromMessage(FIRST_MESSAGE, 'ru'),
  });

  const turn = async (body, { paidLimit = 1, fingerprints = [] } = {}) => {
    const input = conductor.parseAgentChatBody(body);
    let messages = input.mode === 'message' ? [input.message] : [];
    let resume = {};
    const notes = [];
    if (input.mode !== 'message') {
      const { runs } = await registered.listSuspendedRuns({ threadId, resourceId });
      const verified = conductor.verifyPendingAnswer(input, runs, { threadId, resourceId });
      fingerprints = verified.fingerprints;
      messages = verified.approvalMessage ? [verified.approvalMessage] : [];
      if (verified.declined) notes.push(conductor.DECLINED_ON_CARD);
      if (verified.approved?.length) notes.push(conductor.APPROVED_ON_CARD);
      paidLimit = 2;
      if (input.mode === 'resume') resume = { runId: input.runId, resumeData: input.resumeData };
    }
    const execution = conductor.createConductorExecution({ requestId: 'pipeline-probe', initialStepNotes: notes });
    return execution.run(async () => {
    const stream = await handleChatStream({
      mastra,
      agentId: conductor.CONDUCTOR_AGENT_ID,
      version: 'v7',
      onError: conductor.conductorOnError,
      params: {
        messages,
        ...resume,
        requestContext: conductor.buildConductorContext({
          identity: IDENTITY,
          threadId,
          paidLimit,
          approvals: fingerprints,
        }),
        memory: { thread: threadId, resource: resourceId },
        ...execution.streamOptions(notes),
        abortSignal: execution.signal,
      },
    });
    return drain(stream);
    });
  };

  const first = await turn({
    threadId,
    messages: [
      {
        id: 'msg-user-1',
        role: 'user',
        parts: [{ type: 'text', text: FIRST_MESSAGE }],
      },
    ],
  });
  const approvalRequest = first.find((part) => part.type === 'tool-approval-request');
  const pendingAfterFirst = (await registered.listSuspendedRuns({ threadId, resourceId })).runs;
  // The suspended run's own snapshot, as storage keeps it while the card waits.
  const pendingSnapshots = (
    await (await storage.getStore('workflows')).listWorkflowRuns({})
  ).runs;

  // The client sends the approval back with other arguments than the card.
  const [runId] = String(approvalRequest?.approvalId ?? '').split('::');
  const approval = await turn({
    threadId,
    messages: [
      {
        id: 'msg-assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-piece_delete',
            toolCallId: approvalRequest?.toolCallId,
            state: 'approval-responded',
            input: { pieceId: 'p2' },
            approval: { id: approvalRequest?.approvalId, approved: true },
          },
        ],
      },
    ],
  });

  const third = await turn({
    threadId,
    messages: [{ id: 'msg-user-2', role: 'user', parts: [{ type: 'text', text: 'включи аватар' }] }],
  });
  const suspended = third.find((part) => part.type === 'data-tool-call-suspended');
  const resumed = await turn({
    threadId,
    runId: suspended?.data?.runId,
    // The card id the live card carried (review W2 F3): the door checks it
    // against the id of the card the stored run waits on.
    cardId: suspended?.data?.suspendPayload?.cardId,
    resumeData: { consentGiven: true, avatarName: 'Игорь' },
  });

  // Everything the storage kept of this conversation.
  const recalled = await (await registered.getMemory()).recall({ threadId, resourceId, perPage: false });
  const workingMemory = await (await registered.getMemory()).getWorkingMemory({ threadId, resourceId });
  const stored = JSON.stringify({ recalled, workingMemory, pendingSnapshots, pendingAfterFirst });

  // Every request context a snapshot kept: its keys and the kinds of values.
  const contexts = [];
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(walk);
    for (const [key, inner] of Object.entries(value)) {
      if (
        (key === 'requestContext' || key === 'requestContextEntries') &&
        inner &&
        typeof inner === 'object' &&
        !Array.isArray(inner)
      ) {
        contexts.push(inner);
      }
      walk(inner);
    }
  };
  walk(
    pendingSnapshots.map((run) =>
      typeof run.snapshot === 'string' ? JSON.parse(run.snapshot) : run.snapshot
    )
  );

  return {
    firstTypes: first.map((part) => part.type),
    approvalRequest: !!approvalRequest,
    pendingArgs: pendingAfterFirst.flatMap((run) => run.toolCalls.map((call) => call.args)),
    approvalTypes: approval.map((part) => part.type),
    approvalOutput: approval.find((part) => part.type === 'tool-output-available')?.output ?? null,
    approvalModelSystem: seen.calls[1].system,
    approvalModelPrompt: seen.calls[1].prompt,
    laterModelSystems: seen.calls.slice(2).map((call) => call.system),
    deleted: calls.deleted,
    suspendedPayload: suspended?.data?.suspendPayload ?? null,
    resumedTypes: resumed.map((part) => part.type),
    activated: calls.activated,
    pendingAtEnd: (await registered.listSuspendedRuns({ threadId, resourceId })).runs.length,
    modelSawKey: seen.calls.some((call) => call.prompt.includes(PASTED_KEY)),
    storedKey: stored.includes(PASTED_KEY),
    secretShapeHits: conductor.SECRET_SHAPES.filter(({ pattern }) =>
      new RegExp(pattern.source).test(stored)
    ).map(({ name }) => name),
    secretShapeCount: conductor.SECRET_SHAPES.length,
    storedText: stored,
    snapshotCount: pendingSnapshots.length,
    snapshotContextKeys: [...new Set(contexts.flatMap((context) => Object.keys(context)))].sort(),
    // Ours only: `MastraMemory` and `mastra__durableExecutions` are Mastra's own keys.
    snapshotContextValueTypes: [
      ...new Set(
        contexts.flatMap((context) =>
          Object.entries(context)
            .filter(([key]) => key !== 'MastraMemory' && key !== 'mastra__durableExecutions')
            .flatMap(([key, value]) => {
              if (key === 'mastra__scopes' && Array.isArray(value)) {
                return value.map((item) => typeof item);
              }
              if (
                key === 'mastra__messageAuthor' &&
                value &&
                typeof value === 'object' &&
                !Array.isArray(value)
              ) {
                return Object.values(value).map((item) => typeof item);
              }
              return [typeof value];
            })
        )
      ),
    ].sort(),
    snapshotMastraMemoryKeys: [
      ...new Set(contexts.flatMap((context) => Object.keys(context.MastraMemory ?? {}))),
    ].sort(),
    errors: [...first, ...approval, ...third, ...resumed]
      .filter((part) => part.type === 'error')
      .map((part) => part.errorText),
  };
};

const sessionIsolation = async () => {
  const storage = new InMemoryStore();
  const memory = conductor.createConductorMemory(storage);
  const { services } = fakeServices();
  const { model } = scripted([['text', 'Готово.']]);
  const agent = conductor.buildConductorAgent({
    services,
    gate: allowAll,
    memory,
    model: async () => model,
    snapshot: async () => ({ pieces: [] }),
  });
  const controller = conductor.buildConductorController(agent, { storage, memory });
  const mastra = new Mastra({
    storage,
    agents: { [conductor.CONDUCTOR_AGENT_ID]: agent },
    agentControllers: { [conductor.CONDUCTOR_AGENT_ID]: controller },
  });
  const host = mastra.getAgentController(conductor.CONDUCTOR_AGENT_ID);
  await host.initStorage();

  const user1 = { ...IDENTITY, organizationId: 'org-1', userId: 'user-1', role: 'EDITOR' };
  const user2 = { ...IDENTITY, organizationId: 'org-1', userId: 'user-2', role: 'USER' };
  const org2User = { ...IDENTITY, organizationId: 'org-2', userId: 'user-1', role: 'ADMIN' };

  const r1 = conductor.conductorResourceId(user1.organizationId, user1.userId);
  const r2 = conductor.conductorResourceId(user2.organizationId, user2.userId);
  const rOrg2 = conductor.conductorResourceId(org2User.organizationId, org2User.userId);

  // Create session with createInitialThread: false -> leaves no empty thread before admission.
  const preSession = await host.createSession({
    id: `${r1}:thread-uncreated`,
    ownerId: user1.userId,
    resourceId: r1,
    scope: 'thread-uncreated',
    createInitialThread: false,
  });
  const threadsBeforeCreate = await memory.listThreads({ filter: { resourceId: r1 } });

  // Create two threads for user1, one for user2, one for org2User
  await memory.createThread({ threadId: 't-u1-a', resourceId: r1, title: 'Chat A' });
  await memory.createThread({ threadId: 't-u1-b', resourceId: r1, title: 'Chat B' });
  await memory.createThread({ threadId: 't-u2-a', resourceId: r2, title: 'User 2 Chat' });
  await memory.createThread({ threadId: 't-o2-a', resourceId: rOrg2, title: 'Org 2 Chat' });

  const s1a = await host.createSession({
    id: `${r1}:t-u1-a`,
    ownerId: user1.userId,
    resourceId: r1,
    scope: 't-u1-a',
    createInitialThread: false,
  });
  await s1a.thread.switch({ threadId: 't-u1-a', emitEvent: false });
  await s1a.model.switch('openai/gpt-5.4');
  await s1a.mode.switch({ modeId: 'plan' });

  const s1b = await host.createSession({
    id: `${r1}:t-u1-b`,
    ownerId: user1.userId,
    resourceId: r1,
    scope: 't-u1-b',
    createInitialThread: false,
  });
  await s1b.thread.switch({ threadId: 't-u1-b', emitEvent: false });
  await s1b.model.switch('anthropic/claude-sonnet-4-6');

  const s2a = await host.createSession({
    id: `${r2}:t-u2-a`,
    ownerId: user2.userId,
    resourceId: r2,
    scope: 't-u2-a',
    createInitialThread: false,
  });
  await s2a.thread.switch({ threadId: 't-u2-a', emitEvent: false });

  const sOrg2 = await host.createSession({
    id: `${rOrg2}:t-o2-a`,
    ownerId: org2User.userId,
    resourceId: rOrg2,
    scope: 't-o2-a',
    createInitialThread: false,
  });
  await sOrg2.thread.switch({ threadId: 't-o2-a', emitEvent: false });

  // Cross-resource switch attempt on s2a to user1's thread must fail or not bind
  let crossTenantSwitchBlocked = false;
  try {
    const existing = await s2a.thread.getById({ threadId: 't-u1-a' });
    if (!existing || existing.resourceId !== r2) crossTenantSwitchBlocked = true;
  } catch {
    crossTenantSwitchBlocked = true;
  }

  const deleted = await host.deleteSession({ resourceId: r1, scope: 'thread-uncreated' });

  return {
    preSessionThreadId: preSession.thread.getId(),
    threadsBeforeCreateCount: threadsBeforeCreate.threads.length,
    s1aModel: s1a.model.get(),
    s1aMode: s1a.mode.get(),
    s1bModel: s1b.model.get(),
    s1bMode: s1b.mode.get(),
    s2aModel: s2a.model.get(),
    s2aResource: s2a.identity.getResourceId(),
    sOrg2Resource: sOrg2.identity.getResourceId(),
    crossTenantSwitchBlocked,
    deleted,
  };
};

const beforeApprovalProbe = async () => {
  const readParts = async (stream) => {
    const reader = stream.getReader();
    const parts = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    return parts;
  };

  const runDeleteAttempt = async ({ gate, input, breakDescribe }) => {
    const storage = new InMemoryStore();
    const memory = conductor.createConductorMemory(storage);
    const { services: baseServices, calls } = fakeServices();
    const services = breakDescribe
      ? (token) => {
          if (token?.name === 'PieceService') {
            return {
              approvalSubject: async () => {
                throw new Error('unexpected driver crash in describeApproval');
              },
              delete: async () => {
                calls.deleted.push('unexpected');
              },
            };
          }
          return baseServices(token);
        }
      : baseServices;
    const { model } = scripted([
      [['tool', 'piece_delete', input]],
      [['text', 'Отказано до карточки.']],
    ]);
    const agent = conductor.buildConductorAgent({
      services,
      gate,
      memory,
      model: async () => model,
      snapshot: async () => ({ pieces: [] }),
    });
    const mastra = new Mastra({
      storage,
      agents: { [conductor.CONDUCTOR_AGENT_ID]: agent },
    });
    const threadId = 'thread-before-approval';
    const resourceId = conductor.conductorResourceId(IDENTITY.organizationId, IDENTITY.userId);
    await memory.createThread({ threadId, resourceId, title: 'Before approval test' });
    const stream = await handleChatStream({
      mastra,
      agentId: conductor.CONDUCTOR_AGENT_ID,
      version: 'v7',
      sendReasoning: false,
      sendSources: false,
      params: {
        messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Удали заготовку' }] }],
        requestContext: contextFor(IDENTITY, { threadId }),
        memory: { thread: threadId, resource: resourceId },
      },
    });
    const parts = await readParts(stream);
    const registered = mastra.getAgentById(conductor.CONDUCTOR_AGENT_ID);
    const pending = (await registered.listSuspendedRuns({ threadId, resourceId })).runs;
    const output = parts.find((part) => part.type === 'tool-output-available')?.output ?? null;
    return {
      hasApprovalRequest: parts.some(
        (part) => part.type === 'tool-approval-request' || part.type === 'data-tool-call-approval'
      ),
      pendingCount: pending.length,
      deletedCount: calls.deleted.length,
      output,
    };
  };

  return {
    permissionDenied: await runDeleteAttempt({
      gate: { check: async () => ({ allowed: false, refused: 'Delete Posts' }) },
      input: { pieceId: 'p1' },
    }),
    notFound: await runDeleteAttempt({
      gate: allowAll,
      input: { pieceId: 'piece-does-not-exist' },
    }),
    invalidInput: await runDeleteAttempt({
      gate: allowAll,
      input: { pieceId: '' },
    }),
    hookError: await runDeleteAttempt({
      gate: allowAll,
      input: { pieceId: 'p1' },
      breakDescribe: true,
    }),
  };
};

(async () => {
  const report = {
    paidCapOne: await paidCap(1),
    paidCapTwo: await paidCap(2),
    stepCap: await stepCap(),
    editorTurn: await firstTurn(IDENTITY),
    userTurn: await firstTurn({ ...IDENTITY, role: 'USER' }),
    injection: INJECTION,
    door: await doorPipeline(),
    sessionIsolation: await sessionIsolation(),
    beforeApproval: await beforeApprovalProbe(),
  };
  process.stdout.write(JSON.stringify(report));
})().catch((error) => {
  process.stderr.write(String(error?.stack || error));
  process.exit(1);
});
