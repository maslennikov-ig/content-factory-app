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
const { format } = require('node:util');
const { AbstractChat } = require('ai');
const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { ConsoleLogger } = require('@mastra/core/logger');
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
/** Stands in a provider's echoed request body, so a report can tell it was kept. */
const REQUEST_ECHO = 'scripted-provider-request-body';
/** The body a provider says it sent: the prompt, file parts as base64. */
const providerBody = (options) =>
  JSON.stringify({
    model: 'scripted',
    marker: REQUEST_ECHO,
    messages: options.prompt.map((message) => ({
      ...message,
      content: Array.isArray(message.content)
        ? message.content.map((part) =>
            part.type === 'file' && typeof part.data !== 'string'
              ? { ...part, data: Buffer.from(part.data).toString('base64') }
              : part
          )
        : message.content,
    })),
  });

const scriptedModel = (currentUsageLedger) => {
  // `inputs`: everything each model call read, whole (kcxz.20, the secrets
  // guard) — kept apart from `calls` so the report stays small.
  // `ignoreToolChoice`: a provider that calls tools under `toolChoice: none`
  // (W3 walk P2-B, the door's own closing line); set per scenario.
  const state = { queue: [], calls: [], turn: 0, inputs: [], ignoreToolChoice: false };
  const next = (options) => {
    state.inputs.push(JSON.stringify({ prompt: options.prompt, tools: options.tools ?? [] }));
    currentUsageLedger()?.record({
      attempt: 1,
      model: 'scripted',
      promptTokens: 1,
      completionTokens: 1,
    });
    const toolChoice = options.toolChoice?.type ?? null;
    state.calls.push({
      turn: state.turn,
      toolChoice,
      tools: (options.tools || []).map((tool) => tool.name).sort(),
      system: options.prompt
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n'),
      // What the model read of the person's last message (kcxz.18: a samples
      // receipt, never a file body).
      user: (() => {
        const last = options.prompt.filter((message) => message.role === 'user').at(-1);
        const content = last?.content;
        return typeof content === 'string'
          ? content
          : (content ?? [])
              .map((part) => (part.type === 'text' ? part.text : `[${part.type}]`))
              .join('\n');
      })(),
    });
    const scripted = state.queue.shift() || [['text', 'Готово.']];
    // `['reject', status]`: the provider refuses the request as the AI SDK
    // reports it — an `APICallError` that quotes the whole request body,
    // pictures included (review W4-25 vision F5, F7).
    const rejected = scripted.find(([kind]) => kind === 'reject');
    if (rejected) {
      const error = new Error(`Bad Request: the provider refused this request (${rejected[1]})`);
      error.name = 'AI_APICallError';
      error.statusCode = rejected[1];
      error.url = 'https://provider.example/v1/chat/completions';
      error.isRetryable = false;
      error.requestBodyValues = JSON.parse(providerBody(options));
      error.responseBody = '{"error":{"message":"Invalid image"}}';
      throw error;
    }
    // A provider does not call tools under `toolChoice: none` (W3 walk P2-B).
    const plan =
      toolChoice === 'none' && !state.ignoreToolChoice
        ? scripted.filter(([kind]) => kind !== 'tool')
        : scripted;
    // `['finish', reason]`: the step ends with that reason whatever it holds —
    // a reasoning model cut at its budget (`length`), an empty last step
    // (`stop`) (correctness review F1).
    const finishAs = plan.find(([kind]) => kind === 'finish')?.[1];
    const content = plan.filter(([kind]) => kind !== 'finish').map(([kind, a, b], index) =>
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
      finishReason: finishAs
        ? { unified: finishAs, raw: finishAs }
        : tools
          ? { unified: 'tool-calls', raw: 'tool_calls' }
          : { unified: 'stop', raw: 'stop' },
    };
  };
  const model = {
    specificationVersion: 'v3',
    provider: 'scripted',
    modelId: 'scripted',
    supportedUrls: {},
    // As real providers do (`@ai-sdk/openai` returns `request: { body }`, the
    // whole JSON it sent — pictures included): Mastra keeps it on its step
    // records, so a scenario that suspends shows whether it reaches a
    // snapshot (review W4-25 vision F2).
    doGenerate: async (options) => ({
      ...next(options),
      usage,
      warnings: [],
      request: { body: providerBody(options) },
    }),
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
        request: { body: providerBody(options) },
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
/**
 * `included`: the scenario runs on the included allowance (`{ limit, used }`),
 * so every admission — the turn's and a paid capability's — goes through the
 * real `AiUsageService.createAdmission` count against the limit
 * (`kcxz.44` review F6). `used` rows of this month are in the ledger before
 * the first request. Without it the workspace's own key admits without a
 * count.
 */
const ledger = (included) => {
  const rows = [];
  const earlier = Array.from({ length: included?.used ?? 0 }, (_unused, index) => ({
    id: `earlier-${index + 1}`,
    organizationId: ORGANIZATION_ID,
    usageMode: 'included',
    operation: 'text_generation',
    role: 'draft',
    status: 'succeeded',
  }));
  const counted = (where) =>
    [...earlier, ...rows].filter(
      (row) =>
        row.organizationId === where.organizationId &&
        row.usageMode === where.usageMode &&
        // `includedUsageFilter`: a failed review gives its operation back.
        !(row.status === 'failed' && row.role === 'review')
    ).length;
  const prisma = {
    subscription: {
      findUnique: async () =>
        included ? { includedAiMonthlyOperations: included.limit, createdAt: new Date('2026-09-01T00:00:00.000Z') } : null,
    },
    instanceAiDefaults: { findUnique: async () => null },
    organization: { findUnique: async () => ({ createdAt: new Date(ORGANIZATION.createdAt) }) },
  };
  return {
    rows,
    prisma: Object.assign(prisma, {
      $transaction: async (callback) => callback(prisma),
      aiUsageRecord: {
        count: async ({ where }) => counted(where),
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
    }),
  };
};

/** One door, one agent, one ledger, one workspace: nothing shared between scenarios. */
const stand = (scenario) => {
  const key = scenario.included ? { ...WORKSPACE_KEY, usageMode: 'included' } : WORKSPACE_KEY;
  const aiConfig = { ...providerConfig(), loadAiConfig: async () => key };
  const table = ledger(scenario.included);
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
  // `outsideTurn`: what runs on the worker, not in the turn — the periodic
  // idea check (review W4-23 F5) — admits its own operation, as there.
  const services = world.servicesFor({ usage: aiUsage, outsideTurn: aiConfig.withoutActiveAiConfig });
  const { model, state } = scriptedModel(textChain.currentUsageLedger);

  const storage = new InMemoryStore();
  const snapshotWrites = watchSnapshotWrites(storage);
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
    // Mastra's own logger as the backend runs it (`mastra.service.ts`): what
    // it prints lands in the watched log, which is scanned (review W4-25
    // vision F7) — a provider error quotes the whole request it refused.
    logger: new ConsoleLogger({ level: 'info' }),
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
    // As `MastraService.samplesAvatarKnown` (review W3-18 F3).
    samplesAvatarKnown: (identity, avatarId) =>
      registry.avatarInWorkspace(serviceOf, identity, avatarId),
    // As `MastraService.mediaReceipt` (kcxz.25, review W4-25 F3).
    mediaReceipt: (identity, ids) => registry.mediaReceiptInWorkspace(serviceOf, identity, ids),
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
  return { controller, mastra, conductor, world, table, state, storage, snapshotWrites };
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
    const parts = body.messages[0].parts;
    // A message with more than words (a samples receipt, kcxz.18) is sent
    // the way the screen sends it: its parts.
    if (parts.some((part) => part.type !== 'text')) {
      await chat.sendMessage({ parts });
    } else {
      const text = parts.find((part) => part.type === 'text')?.text ?? '';
      await chat.sendMessage({ text });
    }
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
const screenApproval = async ({ before, threadId, approvalId, approved, reason, door }) => {
  const messages = before ? screenContract.readThreadHistory(before).messages : [];
  const transport = createAgentTransport({
    request: (_url, init) => door(JSON.parse(String(init.body))),
    currentThread: () => threadId ?? null,
    onThread: () => undefined,
  });
  const chat = new AbstractChat({ transport, state: new ReplayState(messages) });
  // `reason`: a decline reason, as a client other than the screen may send one.
  await chat.addToolApprovalResponse({ id: approvalId, approved, ...(reason ? { reason } : {}) });
  await chat.sendMessage();
  return {
    status: chat.status,
    error: chat.error ? `${chat.error.name}: ${chat.error.message}` : null,
    messages: chat.messages,
  };
};

/**
 * Everything Mastra's storage holds — threads, messages, working memory,
 * suspended runs' snapshots, traces and log records — as one text
 * (kcxz.20, the secrets guard).
 */
const storedText = (storage) => {
  const dbs = new Set(
    Object.values(storage.stores ?? {})
      .map((store) => store?.db)
      .filter(Boolean)
  );
  return JSON.stringify([...dbs], (_key, value) =>
    value instanceof Map ? [...value.entries()] : value instanceof Set ? [...value] : value
  );
};

/**
 * Every write of a run snapshot, as text (review W4-25 vision F2): a row a
 * later answer overwrites or prunes was still written — to Postgres on the
 * running backend — so the end state of the storage alone cannot say a
 * picture's bytes never landed in one.
 */
const watchSnapshotWrites = (storage) => {
  const writes = [];
  const workflows = storage.stores?.workflows;
  for (const method of ['persistWorkflowSnapshot', 'updateWorkflowResults', 'updateWorkflowState']) {
    const original = workflows?.[method];
    if (typeof original !== 'function') continue;
    workflows[method] = function (...args) {
      try {
        writes.push(
          JSON.stringify(args, (_key, value) =>
            value instanceof Map
              ? [...value.entries()]
              : ArrayBuffer.isView(value)
                ? Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')
                : value
          )
        );
      } catch (error) {
        writes.push(`[unserialisable: ${error?.message}]`);
      }
      return original.apply(this, args);
    };
  }
  return writes;
};

/**
 * What the process wrote while a scenario played: the Nest logger, Mastra's
 * and any `console` call land on stdout or stderr (kcxz.20, the secrets
 * guard). The report itself is written after, unwatched.
 */
const watchLogs = () => {
  const lines = [];
  const restore = [];
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write;
    stream.write = (chunk, ...rest) => {
      lines.push(String(chunk));
      return typeof rest.at(-1) === 'function' ? (rest.at(-1)(), true) : true;
    };
    restore.push(() => (stream.write = write));
  }
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[method];
    // As the console prints them (`util.format`, objects inspected), not as
    // `String()` — which read a logged `{ error }` as `[object Object]` and
    // could not see what it quoted (review W4-25 vision F7).
    console[method] = (...args) => lines.push(format(...args));
    restore.push(() => (console[method] = original));
  }
  return { lines, stop: () => restore.forEach((undo) => undo()) };
};

/**
 * The literal keys a scenario sent (`pastedKeys`) found in a text, by their
 * index — independent of the detector (review W3-20 F5): a key the shapes
 * miss is invisible to `secretShapesIn` by construction, never to this.
 */
const literalKeysIn = (keys, text) =>
  keys.map((key, index) => (text.includes(key) ? index : -1)).filter((index) => index >= 0);

/** The key shapes found in a text, by name (`conductor.secrets.ts`). */
const secretShapesIn = (conductor, text) =>
  conductor.SECRET_SHAPES.filter(({ pattern }) =>
    new RegExp(pattern.source, pattern.flags.replace('g', '')).test(text)
  ).map(({ name }) => name);

/** The snapshot line of a model call's instruction, unwrapped; `null` without one. */
const openingSnapshot = (call) => {
  const line = call?.system
    .split('\n')
    .find((candidate) => candidate.startsWith('{"untrustedData"'));
  if (!line) return null;
  try {
    return JSON.parse(line).untrustedData.value;
  } catch {
    return null;
  }
};

const play = async (scenario) => {
  const logs = watchLogs();
  try {
    return await playWatched(scenario, logs);
  } finally {
    logs.stop();
  }
};

const playWatched = async (scenario, logs) => {
  const { controller, mastra, conductor, world, table, state, storage, snapshotWrites } =
    stand(scenario);
  state.ignoreToolChoice = scenario.ignoreToolChoice === true;
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
          {
            id: `msg-user-${index + 1}`,
            role: 'user',
            parts: [
              ...(turn.say ? [{ type: 'text', text: turn.say }] : []),
              // The receipt of files the composer already uploaded (kcxz.18).
              ...(turn.samples ? [{ type: 'data-avatar-samples', data: turn.samples }] : []),
              // The receipt of pictures the composer already put into the
              // media library (kcxz.25).
              ...(turn.media ? [{ type: 'data-media-upload', data: turn.media }] : []),
              // Text files attached to the message, inline as the composer
              // sends them (kcxz.20, review W3-20 F5).
              // Pictures attached for the agent to look at, inline as the
              // composer sends them, with the key the browser keeps each
              // under (owner decision 28.09, «агент видит картинки»).
              ...(turn.pictures ?? []).map((picture) => ({
                type: 'file',
                mediaType: picture.type ?? 'image/png',
                filename: picture.name,
                url: `data:${picture.type ?? 'image/png'};base64,${picture.base64}`,
                ...(picture.key ? { providerMetadata: { contentFactory: { pictureKey: picture.key } } } : {}),
              })),
              ...(turn.files ?? []).map((file) => ({
                type: 'file',
                mediaType: 'text/plain',
                filename: file.name,
                url: `data:text/plain;base64,${Buffer.from(file.text, 'utf8').toString('base64')}`,
              })),
            ],
          },
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
        reason: turn.reason,
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
      // Each model step of this request (W3 walk P2-B): its tool choice and
      // whether it read the last step's note.
      steps: state.calls
        .filter((call) => call.turn === index)
        .map((call) => ({
          toolChoice: call.toolChoice,
          lastStepNote: call.system.includes(conductor.LAST_STEP_NOTE),
        })),
      // Whether a model step of this request read what «Нет» means (P3-K).
      readDecline: state.calls.some(
        (call, at) => call.turn === index && state.inputs[at].includes(conductor.DECLINED_ON_CARD)
      ),
      // The workspace snapshot this request opened with (kcxz.21): what the
      // model was told exists, the onboarding steps included.
      opening: openingSnapshot(state.calls.find((call) => call.turn === index)),
      // The `lookFor` strings the storage holds right after this request —
      // a suspended run's snapshot included, before a later answer prunes
      // it (review W4-25 vision F2).
      storedNow: (scenario.lookFor ?? []).filter((needle) => storedText(storage).includes(needle)),
      // Whether a provider's echoed request body is in the storage, or was
      // in any snapshot written so far.
      storedEcho:
        storedText(storage).includes(REQUEST_ECHO) ||
        snapshotWrites.some((write) => write.includes(REQUEST_ECHO)),
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
  // The secrets guard (kcxz.20, spec §1.5, §4.10): which key shapes each
  // record holds. `sent` is what the scenario itself sent to the door — the
  // pasted key — so a guard that finds it there and nowhere else is not blind.
  const dumped = storedText(storage);
  const secrets = {
    sent: secretShapesIn(conductor, JSON.stringify(turns.map((turn) => turn.sentBodies))),
    model: secretShapesIn(conductor, state.inputs.join('\n')),
    stored: secretShapesIn(conductor, dumped),
    stream: secretShapesIn(conductor, turns.map((turn) => turn.sse).join('\n')),
    history: secretShapesIn(conductor, JSON.stringify(history)),
    requests: secretShapesIn(conductor, JSON.stringify(world.requests)),
    logs: secretShapesIn(conductor, logs.lines.join('\n')),
  };
  const pasted = scenario.pastedKeys ?? [];
  const literal = {
    // Attached files leave as base64 `data:` URLs: read them as their text.
    sent: literalKeysIn(
      pasted,
      JSON.stringify(turns.map((turn) => turn.sentBodies)).replace(
        /data:text\/plain;base64,([A-Za-z0-9+/=]+)/g,
        (_match, payload) => Buffer.from(payload, 'base64').toString('utf8')
      )
    ),
    model: literalKeysIn(pasted, state.inputs.join('\n')),
    stored: literalKeysIn(pasted, dumped),
    stream: literalKeysIn(pasted, turns.map((turn) => turn.sse).join('\n')),
    history: literalKeysIn(pasted, JSON.stringify(history)),
    requests: literalKeysIn(pasted, JSON.stringify(world.requests)),
    logs: literalKeysIn(pasted, logs.lines.join('\n')),
    world: literalKeysIn(pasted, JSON.stringify(world.state())),
  };
  return {
    threadId,
    turns,
    secrets,
    literal,
    // The storage dump is the conversation, not an empty store; a redacted
    // key leaves its marker there.
    // Whether the log quoted a provider's request at all — the log scan of
    // `found` is not blind to one (review W4-25 vision F7).
    loggedRequest: logs.lines.join('\n').includes(REQUEST_ECHO),
    storedKeyMarker: dumped.includes('[KEY]'),
    storedMessages: dumped.includes('msg-user-'),
    // What a «Нет» leaves in the thread (correctness review F9): the fact is
    // stored with the tool result, the note of what to say is not.
    storedDecline: {
      fact: dumped.includes(conductor.DECLINED_STORED),
      note: dumped.includes(conductor.DECLINED_ON_CARD),
    },
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
    // The person's last message as each model call read it.
    prompts: state.calls.map((call) => ({ turn: call.turn, user: call.user })),
    pending,
    storedPartTypes,
    // Where each string the scenario names turns up (`lookFor`): what the
    // model read, what the storage holds, what a reload shows — e.g. the
    // bytes of a picture that must reach the model and be saved nowhere.
    found: Object.fromEntries(
      (scenario.lookFor ?? []).map((needle) => [
        needle,
        {
          model: state.inputs.join('\n').includes(needle),
          stored: dumped.includes(needle),
          history: JSON.stringify(history).includes(needle),
          world: JSON.stringify(world.state()).includes(needle),
          // What the process logged, and the usage rows (review W4-25 vision F2, F7).
          snapshots: snapshotWrites.some((write) => write.includes(needle)),
          logged: logs.lines.join('\n').includes(needle),
          usage: JSON.stringify(table.rows).includes(needle),
        },
      ])
    ),
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
