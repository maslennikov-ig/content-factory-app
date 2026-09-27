'use strict';

/**
 * Plays the recorded agent scenarios (`content-factory-next-kcxz.11`) through
 * the real `POST /agent/chat` door and prints what happened as JSON.
 *
 * Real: `AgentController.chat`, `AgentThreadsService`, the conductor agent,
 * the capability registry and hooks, `DoorPolicyGate` over the real
 * `PermissionsService`, Mastra (`Mastra`, `InMemoryStore`, `Memory`),
 * `@mastra/ai-sdk` `handleChatStream` v7, and `AiUsageService` over an
 * in-memory ledger table. Scripted: the model. Fakes: the product services,
 * over the rows of `tests/fixtures/agent-scenarios/world.cjs`.
 *
 * The model is wired as `MastraService` wires it — through
 * `AiUsageService.prepareModelExecution(org, 'agent', …)` — so a model step
 * that ran outside the turn's admission would show up as a second `agent` row.
 *
 * A child process of `tests/agent-scenarios.test.cjs`: these packages are
 * ESM-first and the jest runner does not load them. No network, no database,
 * no paid call. `argv[2]`, when given, is a comma-separated list of scenario
 * ids to play.
 */

const { EventEmitter } = require('node:events');
const { AbstractChat } = require('ai');
const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const {
  loadCapabilityModule,
  permissionsService,
  providerConfig,
} = require('./agent-capabilities.cjs');
const { loadScenarios } = require('./agent-scenarios.cjs');
const screenContract = require('./load-tsx.cjs').loadTypeScriptModule(
  'apps/frontend/src/components/agents/agent.contract.ts'
);
// The screen's own transport (`agent.transport.ts`): the body an approval
// answer leaves the page with is built by it, not by this runner (kcxz.32, N1).
const { createAgentTransport } = require('./load-tsx.cjs').loadTypeScriptModule(
  'apps/frontend/src/components/agents/agent.transport.ts'
);
const { createWorld, ORGANIZATION_ID } = require('../fixtures/agent-scenarios/world.cjs');

const ORGANIZATION = { id: ORGANIZATION_ID, createdAt: '2026-01-01T00:00:00.000Z' };
/** `timezone`: the saved standard offset (`User.timezone`, minutes), Moscow's. */
const USER = { id: 'user-1', language: 'ru', timezone: 180 };

/** A workspace with its own key: admissions write rows without a quota read. */
const WORKSPACE_KEY = {
  usageMode: 'workspace_key',
  provider: 'openai',
  apiKey: 'workspace-key',
  textModel: 'text-model',
  imageModel: 'image-model',
  search: { enabled: false, apiKey: '' },
};

const noOp = () => () => undefined;

const usage = {
  inputTokens: { total: 1, noCache: 1 },
  outputTokens: { total: 1, text: 1 },
};

/**
 * A v3 model that plays the current request's steps, then answers «Готово.».
 * `queue` is refilled by the runner before every request.
 *
 * Each call reports its tokens to whatever usage ledger is active where it
 * runs — what the product's shared transport does per provider response
 * (`ai.text-chain.ts`). A step that ran outside the turn's admission would
 * report to no ledger, or to another one (correctness review W1 F8).
 */
const scriptedModel = (currentUsageLedger) => {
  const state = { queue: [], calls: [], turn: 0 };
  const next = (options) => {
    currentUsageLedger()?.record({
      attempt: 1,
      model: 'scripted',
      promptTokens: 1,
      completionTokens: 1,
    });
    state.calls.push({
      turn: state.turn,
      tools: (options.tools || []).map((tool) => tool.name).sort(),
      system: options.prompt
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n'),
    });
    const plan = state.queue.shift() || [['text', 'Готово.']];
    const content = plan.map(([kind, a, b], index) =>
      kind === 'tool'
        ? {
            type: 'tool-call',
            toolCallId: `call-${state.calls.length}-${index}`,
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
    };
  };
  const model = {
    specificationVersion: 'v3',
    provider: 'scripted',
    modelId: 'scripted',
    supportedUrls: {},
    doGenerate: async (options) => ({ ...next(options), usage, warnings: [] }),
    doStream: async (options) => {
      const result = next(options);
      const parts = [{ type: 'stream-start', warnings: [] }];
      for (const [index, part] of result.content.entries()) {
        if (part.type === 'tool-call') {
          // As a provider streams it: the arguments arrive in pieces before
          // the call (kcxz.29 — the walk's cut stream began inside one).
          parts.push({ type: 'tool-input-start', id: part.toolCallId, toolName: part.toolName });
          parts.push({ type: 'tool-input-delta', id: part.toolCallId, delta: part.input });
          parts.push({ type: 'tool-input-end', id: part.toolCallId });
          parts.push(part);
        } else {
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
  };
  return { model, state };
};

/** An Express response that records the SSE it was written. */
class RecordingResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.chunks = [];
    this.headersSent = false;
    this.writableEnded = false;
  }
  status(code) {
    this.statusCode = code;
    return this;
  }
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }
  flushHeaders() {
    this.headersSent = true;
  }
  write(chunk) {
    this.headersSent = true;
    this.chunks.push(chunk);
    return true;
  }
  end() {
    this.writableEnded = true;
  }
  parts() {
    return this.chunks
      .map((chunk) => chunk.replace(/^data: /, '').trim())
      .filter((line) => line && line !== '[DONE]')
      .map((line) => JSON.parse(line));
  }
}

/** The ledger table `AiUsageService` writes, in memory. */
const ledger = () => {
  const rows = [];
  return {
    rows,
    prisma: {
      aiUsageRecord: {
        create: async ({ data }) => {
          const row = { id: `row-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        },
        update: async ({ where, data }) => {
          Object.assign(rows.find((row) => row.id === where.id), data);
          return {};
        },
        deleteMany: async ({ where }) => {
          const index = rows.findIndex((row) => row.id === where.id);
          if (index !== -1) rows.splice(index, 1);
          return { count: index === -1 ? 0 : 1 };
        },
      },
    },
  };
};

/** One door, one agent, one ledger, one workspace: nothing shared between scenarios. */
const stand = (scenario) => {
  const aiConfig = { ...providerConfig(), loadAiConfig: async () => WORKSPACE_KEY };
  const table = ledger();
  // One instance of the transport's ledger store, shared by the admission and
  // the scripted model, as in the running backend.
  const textChain = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.text-chain.ts');
  const { AiUsageService } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.usage.service.ts',
    {
      '@prisma/client': {
        Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
      },
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaService: class {},
      },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': aiConfig,
      '@contentfactory/nestjs-libraries/openai/ai.text-chain': textChain,
      '@contentfactory/nestjs-libraries/user/acting.user': {
        getActingUserId: () => USER.id,
      },
    }
  );
  const aiUsage = new AiUsageService(table.prisma);

  const conductor = loadCapabilityModule('../conductor/index.ts', { aiConfig });
  const registry = loadCapabilityModule('index.ts', { aiConfig });
  const world = createWorld(scenario.world);
  const services = world.servicesFor({ usage: aiUsage });
  const { model, state } = scriptedModel(textChain.currentUsageLedger);

  const storage = new InMemoryStore();
  const serviceOf = (token) => {
    const instance = services[token?.name];
    if (!instance) throw new Error(`No scenario service for ${token?.name}`);
    return instance;
  };
  const agent = conductor.buildConductorAgent({
    services: serviceOf,
    gate: new registry.DoorPolicyGate(permissionsService()),
    memory: conductor.createConductorMemory(storage),
    model: ({ organizationId }) =>
      aiUsage.prepareModelExecution(organizationId, 'agent', async () => model),
    now: () => new Date('2026-09-27T10:00:00.000Z'),
  });
  const mastra = new Mastra({
    storage,
    agents: { [conductor.CONDUCTOR_AGENT_ID]: agent },
    logger: false,
  });
  const mastraService = {
    mastra: async () => mastra,
    conductor: async () => mastra.getAgentById(conductor.CONDUCTOR_AGENT_ID),
    // As `MastraService.describeApproval`: the registry's describer over the
    // same services the capabilities use.
    toolTitle: (identity, toolName) =>
      registry.capabilityToolTitle(registry.CAPABILITY_CATALOGUE, toolName, identity.language),
    describeApproval: (identity, toolName, args) =>
      registry.describeApprovalCall(
        registry.CAPABILITY_CATALOGUE,
        serviceOf,
        identity,
        toolName,
        args
      ),
    // As `MastraService.approvalContent` (review W2 F4).
    approvalContent: (identity, toolName, args) =>
      registry.approvalContentDigest(
        registry.CAPABILITY_CATALOGUE,
        serviceOf,
        identity,
        toolName,
        args
      ),
  };

  const doorModules = {
    '@nestjs/swagger': { ApiTags: noOp },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: noOp,
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class': {
      AuthorizationActions: { Create: 'create' },
      Sections: { AI: 'ai' },
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService },
    '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
  };
  const { AgentThreadsService } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts',
    doorModules
  );
  const { AgentController } = loadTypeScriptModule(
    'apps/backend/src/api/routes/agent.controller.ts',
    doorModules,
    {
      // The door builds its turn from the very conductor module the agent runs.
      resolve: (request) => {
        const prefix = '@contentfactory/nestjs-libraries/chat/conductor/';
        return request.startsWith(prefix) && !request.endsWith('agent-threads.service')
          ? conductor
          : undefined;
      },
    }
  );
  const controller = new AgentController(
    mastraService,
    new AgentThreadsService(mastraService),
    aiUsage
  );
  return { controller, mastra, conductor, world, table, state };
};

const summarizeParts = (parts, names = new Map()) => {
  for (const part of parts) {
    if (part.toolCallId && part.toolName) names.set(part.toolCallId, part.toolName);
  }
  return {
    types: parts.map((part) => part.type),
    toolCalls: parts
      .filter((part) => part.type === 'tool-input-available')
      .map((part) => ({ toolName: part.toolName, input: part.input })),
    titles: parts
      .filter((part) => part.type === 'tool-input-available')
      .map((part) => [part.toolName, part.title ?? null]),
    outputs: parts
      .filter((part) => part.type === 'tool-output-available')
      .map((part) => ({ toolName: names.get(part.toolCallId) ?? null, output: part.output })),
    data: parts
      .filter((part) => part.type.startsWith('data-'))
      .map((part) => ({ type: part.type, data: part.data, transient: !!part.transient })),
    approvals: parts
      .filter((part) => part.type === 'tool-approval-request')
      .map((part) => ({
        approvalId: part.approvalId,
        toolCallId: part.toolCallId,
        toolName: names.get(part.toolCallId) ?? null,
        reason: part.reason ?? null,
      })),
    suspended: parts
      .filter((part) => part.type === 'data-tool-call-suspended')
      .map((part) => ({
        runId: part.data?.runId,
        toolName: part.data?.toolName,
        payload: part.data?.suspendPayload ?? null,
      })),
    // The call each question card belongs to: the screen sends it with the
    // answer (`toolCallId`).
    suspendedCalls: parts
      .filter((part) => part.type === 'data-tool-call-suspended')
      .map((part) => part.data?.toolCallId ?? null),
    errors: parts.filter((part) => part.type === 'error').map((part) => part.errorText),
    text: parts
      .filter((part) => part.type === 'text-delta')
      .map((part) => part.delta)
      .join(''),
  };
};

/** The in-memory `ChatState` the React hook keeps in a store. */
class ReplayState {
  constructor(messages) {
    this.messages = messages;
    this.status = 'ready';
    this.error = undefined;
  }
  pushMessage(message) {
    this.messages = this.messages.concat(message);
  }
  popMessage() {
    this.messages = this.messages.slice(0, -1);
  }
  replaceMessage(index, message) {
    this.messages = [...this.messages.slice(0, index), message, ...this.messages.slice(index + 1)];
  }
  snapshot(value) {
    return structuredClone(value);
  }
}

/**
 * What the browser makes of a turn (kcxz.29, D2, D5): the AI SDK's own chat
 * core (`AbstractChat`, what `useChat` wraps) and transport read the SSE the
 * door wrote, starting from the thread as a reload shows it, and sent the
 * way the screen sends it — a message or a resume with no message (an
 * approval answer is played by `screenApproval`, which sends it itself). A
 * chunk the client cannot take ends in `status: 'error'` here, as it did in
 * the browser, where the door saw only a cut stream.
 */
const replayClient = async (before, sse, body) => {
  // The screen's own transport (kcxz.32, D2: an answer on a card further up
  // continues the call in the message that takes the stream).
  const transport = createAgentTransport({
    request: async () =>
      new Response(sse, { headers: { 'content-type': 'text/event-stream' } }),
    currentThread: () => body.threadId ?? null,
    onThread: () => undefined,
  });
  // The thread as the screen reads it back (`readThreadHistory`).
  const messages = before ? screenContract.readThreadHistory(before).messages : [];
  const chat = new AbstractChat({ transport, state: new ReplayState(messages) });
  if (body.runId) {
    await chat.sendMessage(undefined, {
      body: {
        resume: {
          runId: body.runId,
          toolCallId: body.toolCallId ?? null,
          cardId: body.cardId ?? null,
          resumeData: body.resumeData,
        },
      },
    });
  } else {
    const text = body.messages[0].parts.find((part) => part.type === 'text')?.text ?? '';
    await chat.sendMessage({ text });
  }
  return {
    status: chat.status,
    error: chat.error ? `${chat.error.name}: ${chat.error.message}` : null,
    messages: chat.messages,
  };
};

/**
 * «Да» or «Нет» on an approval card as the conversation sends it
 * (`agent.conversation.tsx` `answerApproval`, kcxz.32 N1): the thread as a
 * reload shows it, `addToolApprovalResponse` on the card, then `sendMessage()`
 * — the SDK names the message the card is in, and the screen's transport
 * builds the body from it. `door` answers each request as the backend would.
 */
const screenApproval = async ({ before, threadId, approvalId, approved, door }) => {
  const messages = before ? screenContract.readThreadHistory(before).messages : [];
  const transport = createAgentTransport({
    request: (_url, init) => door(JSON.parse(String(init.body))),
    currentThread: () => threadId ?? null,
    onThread: () => undefined,
  });
  const chat = new AbstractChat({ transport, state: new ReplayState(messages) });
  await chat.addToolApprovalResponse({ id: approvalId, approved });
  await chat.sendMessage();
  return {
    status: chat.status,
    error: chat.error ? `${chat.error.name}: ${chat.error.message}` : null,
    messages: chat.messages,
  };
};

const play = async (scenario) => {
  const { controller, mastra, conductor, world, table, state } = stand(scenario);
  const organization = { ...ORGANIZATION, users: [{ role: scenario.role ?? 'EDITOR' }] };
  // `x-agent-timezone` as the screen's transport sends it (kcxz.15); absent
  // unless the scenario names one, so the saved offset is the fallback.
  const zone = scenario.timeZoneHeader;
  let threadId;
  let last = null;
  const turns = [];
  // Tool names by call id across the conversation: an answer on a card
  // streams the call's output without its input part.
  const toolNames = new Map();

  for (const [index, turn] of scenario.turns.entries()) {
    state.turn = index;
    state.queue = (turn.model || []).map((step) => step.slice());
    let body;
    if (turn.say !== undefined) {
      body = {
        ...(threadId ? { threadId } : {}),
        messages: [
          { id: `msg-user-${index + 1}`, role: 'user', parts: [{ type: 'text', text: turn.say }] },
        ],
      };
    } else if (turn.approve !== undefined) {
      // Answered the way the screen answers (kcxz.32, N1): on the thread as a
      // reload shows it, the card's «Да»/«Нет» through the AI SDK's own chat
      // core and the screen's transport — the request is whatever they send,
      // for the message the card is in. `approveCardOfTurn` (1-based) answers
      // a card of an earlier turn, further up the conversation.
      body = null;
    } else if (turn.resume !== undefined) {
      // The card answered is the one the screen shows: the last card streamed,
      // by the id the server put on it (review W2 F3) — or, for a stale tab,
      // a card of an earlier turn (`resumeCardOfTurn`, 1-based).
      const source = turn.resumeCardOfTurn !== undefined ? turns[turn.resumeCardOfTurn - 1] : last;
      const shown = source?.suspended.at(-1);
      const call = source?.suspendedCalls.at(-1);
      body = {
        threadId,
        runId: shown?.runId,
        // As the screen sends it: the card's call and id.
        ...(call ? { toolCallId: call } : {}),
        ...(shown?.payload?.cardId ? { cardId: shown.payload.cardId } : {}),
        resumeData: turn.resume,
      };
    } else {
      throw new Error(`${scenario.id}: turn ${index + 1} is neither say, approve nor resume`);
    }

    // Something changes in the workspace between two requests: somebody
    // edits a post or switches a channel's mode (review W2 F2, F4).
    turn.before?.(world.rows);
    const rowsBefore = table.rows.length;
    // What the screen holds before this request: the thread as a reload
    // shows it. The client replay (`agent-client-replay.cjs`) starts there.
    const before = threadId
      ? await controller.getThread(organization, USER, threadId, zone).catch(() => null)
      : null;
    let res = new RecordingResponse();
    let refused = null;
    const door = async (sent) => {
      res = new RecordingResponse();
      refused = null;
      try {
        await controller.chat(organization, USER, sent, res, zone);
      } catch (error) {
        refused = {
          status: error?.status ?? error?.getStatus?.() ?? null,
          code: error?.code ?? error?.response?.code ?? null,
        };
      }
    };
    let client;
    /** Every body that left the screen for the door in this turn. */
    let sentBodies = [];
    if (body) {
      await door(body);
      sentBodies = [body];
      client = refused
        ? null
        : await replayClient(before, res.chunks.join(''), body).catch((error) => ({
            status: 'crashed',
            error: String(error?.stack || error),
            messages: [],
          }));
    } else {
      const source =
        turn.approveCardOfTurn !== undefined ? turns[turn.approveCardOfTurn - 1] : last;
      const card = source?.approvals.at(-1);
      client = await screenApproval({
        before,
        threadId,
        approvalId: card?.approvalId,
        approved: turn.approve,
        door: async (sent) => {
          sentBodies.push(sent);
          await door(sent);
          return refused
            ? new Response(JSON.stringify({ code: refused.code }), {
                status: refused.status ?? 500,
                headers: { 'content-type': 'application/json' },
              })
            : new Response(res.chunks.join(''), {
                headers: {
                  'content-type': 'text/event-stream',
                  'x-agent-thread-id': res.headers['x-agent-thread-id'] ?? threadId,
                },
              });
        },
      }).catch((error) => ({ status: 'crashed', error: String(error?.stack || error), messages: [] }));
      body = sentBodies[0] ?? null;
      if (refused) client = null;
    }
    threadId = threadId ?? res.headers['x-agent-thread-id'];
    const summary = summarizeParts(res.parts(), toolNames);
    // A refused request changed nothing: the screen still shows what it did.
    if (!refused) last = summary;
    turns.push({
      ...summary,
      refused,
      body,
      sentBodies,
      before,
      client,
      sse: res.chunks.join(''),
      thread: res.headers['x-agent-thread-id'] ?? null,
      ended: res.writableEnded,
      modelCalls: state.calls.filter((call) => call.turn === index).length,
      admissions: table.rows
        .slice(rowsBefore)
        .map((row) => [row.operation, row.role, row.userId, row.status]),
    });
  }

  const registered = mastra.getAgentById(conductor.CONDUCTOR_AGENT_ID);
  const resourceId = conductor.conductorResourceId(ORGANIZATION_ID, USER.id);
  const pending = threadId
    ? (await registered.listSuspendedRuns({ threadId, resourceId })).runs.length
    : 0;
  // What the thread keeps: the part types of every stored message.
  const stored = threadId
    ? (await (await registered.getMemory()).recall({ threadId, resourceId, perPage: false }))
        .messages
    : [];
  const storedPartTypes = stored.flatMap((message) =>
    (message.content?.parts ?? []).map((part) => part.type)
  );
  // What a reload of the thread shows: the pending cards as the door lists them.
  const history = threadId
    ? await controller.getThread(organization, USER, threadId, zone).catch(() => null)
    : null;
  return {
    threadId,
    turns,
    world: world.state(),
    writes: world.writes,
    reads: world.reads,
    requests: world.requests,
    // Every row the ledger holds at the end, in the order admitted.
    admissions: table.rows.map((row) => [row.operation, row.role, row.userId, row.status]),
    // The same rows with the token columns the admission recorded.
    ledger: table.rows.map((row) => ({
      operation: row.operation,
      status: row.status,
      promptTokens: row.promptTokens ?? null,
      completionTokens: row.completionTokens ?? null,
    })),
    pendingCards: history?.pending ?? [],
    // The whole reload, as the thread door answers it.
    history,
    firstCall: state.calls[0] ?? null,
    modelCalls: state.calls.length,
    pending,
    storedPartTypes,
  };
};

(async () => {
  const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
  const report = {};
  for (const scenario of loadScenarios()) {
    if (only && !only.has(scenario.id)) continue;
    try {
      report[scenario.id] = await play(scenario);
    } catch (error) {
      report[scenario.id] = { crashed: String(error?.stack || error) };
    }
  }
  process.stdout.write(JSON.stringify(report));
})().catch((error) => {
  process.stderr.write(String(error?.stack || error));
  process.exit(1);
});
