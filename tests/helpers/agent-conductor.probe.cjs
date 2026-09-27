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
const fakeServices = () => {
  const calls = { intake: 0, deleted: [], activated: [], snapshotReads: 0 };
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
      return prepare(...args);
    },
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

const agentWith = (steps, { identity = IDENTITY } = {}) => {
  const { services, calls } = fakeServices();
  const { model, seen } = scripted(steps);
  const agent = conductor.buildConductorAgent({
    services,
    gate: allowAll,
    model: async () => model,
    now: () => new Date('2026-09-27T10:00:00.000Z'),
  });
  return { agent, calls, seen, identity };
};

const paidCap = async (paidLimit) => {
  const { agent, calls } = agentWith([
    [
      ['tool', 'piece_create', { text: 'первая мысль' }],
      ['tool', 'piece_create', { text: 'вторая мысль' }],
      ['tool', 'piece_create', { text: 'третья мысль' }],
    ],
  ]);
  const result = await agent.generate('напиши три заготовки', {
    requestContext: contextFor(IDENTITY, { paidLimit }),
  });
  return { runs: calls.intake, outcomes: outcomesOf(result) };
};

const stepCap = async () => {
  const forever = Array.from({ length: 20 }, () => [
    ['tool', 'channels_list', {}],
  ]);
  const { agent, seen, calls } = agentWith(forever);
  await agent.generate('листай каналы без конца', {
    requestContext: contextFor(IDENTITY),
  });
  return { modelCalls: seen.calls.length, snapshotReads: calls.snapshotReads };
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
    [['tool', 'avatar_activate', { avatarId: 'a1', mode: 'assist' }]],
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
    if (input.mode !== 'message') {
      const { runs } = await registered.listSuspendedRuns({ threadId, resourceId });
      const verified = conductor.verifyPendingAnswer(input, runs, { threadId, resourceId });
      fingerprints = verified.fingerprints;
      messages = verified.approvalMessage ? [verified.approvalMessage] : [];
      paidLimit = 2;
      if (input.mode === 'resume') resume = { runId: input.runId, resumeData: input.resumeData };
    }
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
        maxSteps: conductor.CONDUCTOR_MAX_STEPS,
      },
    });
    return drain(stream);
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
      if (key === 'requestContext' && inner && typeof inner === 'object' && !Array.isArray(inner)) {
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
    // Ours only: `MastraMemory` is Mastra's own key (the thread row: id,
    // title, resource, dates).
    snapshotContextValueTypes: [
      ...new Set(
        contexts.flatMap((context) =>
          Object.entries(context)
            .filter(([key]) => key !== 'MastraMemory')
            .map(([, value]) => typeof value)
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

(async () => {
  const report = {
    paidCapOne: await paidCap(1),
    paidCapTwo: await paidCap(2),
    stepCap: await stepCap(),
    editorTurn: await firstTurn(IDENTITY),
    userTurn: await firstTurn({ ...IDENTITY, role: 'USER' }),
    injection: INJECTION,
    door: await doorPipeline(),
  };
  process.stdout.write(JSON.stringify(report));
})().catch((error) => {
  process.stderr.write(String(error?.stack || error));
  process.exit(1);
});
