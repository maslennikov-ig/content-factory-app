'use strict';

// Source controller/service/adapter + installed Mastra1.78/Memory1.38 and
// handleChatStream. The model is scripted, the service is a deferred Promise;
// no provider, network, database or paid call is made.
require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { z } = require('zod');
const { Agent } = require('@mastra/core/agent');
const { createDurableAgent } = require('@mastra/core/agent/durable');
const { Mastra } = require('@mastra/core/mastra');
const { Memory } = require('@mastra/memory');
const { InMemoryStore } = require('@mastra/core/storage');
const { handleChatStream } = require('@mastra/ai-sdk');
const { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } = require('@mastra/core/request-context');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');

const CONDUCTOR = 'libraries/nestjs-libraries/src/chat/conductor';
const lifecycle = loadTypeScriptModule(`${CONDUCTOR}/agent-turn-lifecycle.ts`);
let contextTrace = [];
const OriginalLifecycle = lifecycle.AgentTurnLifecycle;
lifecycle.AgentTurnLifecycle = class extends OriginalLifecycle {
  constructor(requestId, settle) { contextTrace.push({ registered: requestId }); super(requestId, settle); }
};
const trackWork = lifecycle.trackAgentTurnWork;
lifecycle.trackAgentTurnWork = (context, work, invocation) => {
  contextTrace.push({
    executeId: context?.get('cf.executionId'), requestId: context?.get('cf.requestId'),
    resource: context?.get(MASTRA_RESOURCE_ID_KEY), thread: context?.get(MASTRA_THREAD_ID_KEY),
  });
  return trackWork(context, work, invocation);
};
const { inProcessRunClaimStore, agentRunClaimKey } = loadTypeScriptModule(`${CONDUCTOR}/agent-run-claims.ts`);
const adapter = loadCapabilityModule('mastra.adapter.ts', { mocks: { '../conductor/agent-turn-lifecycle': lifecycle } });
const { createCapabilityHooks } = loadCapabilityModule('capability.admission.ts');
const noOp = () => () => undefined;
const ORG = { id: 'org-1', createdAt: '2026-01-01T00:00:00Z', users: [{ role: 'EDITOR' }] };
const USER = { id: 'user-1', language: 'ru' };
const identity = { organizationId: ORG.id, userId: USER.id };
const resourceId = 'org-1:user-1';
const threadId = 'native-stopped-thread';
const body = { threadId, messages: [{ id: 'user-message', role: 'user', parts: [{ type: 'text', text: 'Запиши изменение.' }] }] };
const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

class Response extends EventEmitter {
  headersSent = false;
  writableEnded = false;
  headers = {};
  chunks = [];
  status() { return this; }
  setHeader(name, value) { this.headers[name] = value; }
  flushHeaders() { this.headersSent = true; }
  write(chunk) { this.chunks.push(chunk); return true; }
  end() { this.writableEnded = true; }
}

async function scenario(outcome, resumed, repair = false) {
  contextTrace = [];
  const claims = inProcessRunClaimStore();
  const memory = new Memory({ storage: new InMemoryStore(), options: {
    generateTitle: false, semanticRecall: false,
    workingMemory: { enabled: true, scope: 'resource' },
  } });
  await memory.createThread({ threadId, resourceId, title: 'Native title', metadata: { unrelated: { keep: 12 }, workingMemory: 'Old preferences' } });
  await memory.updateWorkingMemory({ threadId, resourceId, workingMemory: 'Current preferences' });
  const began = deferred();
  const service = deferred();
  let writes = 0;
  let refusals = 0;
  const capability = {
    id: 'test.deferred', label: { ru: 'Изменить', en: 'Change' }, description: 'A deferred non-cancellable service write.',
    risk: resumed === 'approval' ? 'confirm' : resumed === 'question' ? 'input' : 'paid', input: z.object({}), untrusted: [],
    ...(resumed === 'question' ? { suspendSchema: z.object({ question: z.string() }), resumeSchema: z.object({ yes: z.boolean() }) } : {}),
    run: async (context) => {
      if (resumed === 'question' && !context.resumeData) { await context.suspend({ question: 'Write?' }); return; }
      if (repair && refusals === 0) {
        refusals += 1;
        throw Object.assign(new Error('Revise the input before the artifact write.'), { code: 'INTAKE_INPUT_INSUFFICIENT', canReviseInput: true });
      }
      began.resolve(); await service.promise; writes += 1; return { saved: true };
    },
    summarize: () => ({ saved: true }),
  };
  let step = 0;
  const model = {
    specificationVersion: 'v3', provider: 'scripted', modelId: 'scripted', supportedUrls: {},
    doGenerate: async () => { throw new Error('Streaming only.'); },
    doStream: async () => {
      const parts = [{ type: 'stream-start', warnings: [] }];
      const calling = step++ === 0 || (repair && step === 2);
      if (calling) parts.push({ type: 'tool-call', toolCallId: `deferred-call-${step}`, toolName: 'test_deferred', input: '{}' });
      else parts.push({ type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: 'Готово.' }, { type: 'text-end', id: 'done' });
      parts.push({ type: 'finish', finishReason: { unified: calling ? 'tool-calls' : 'stop', raw: calling ? 'tool_calls' : 'stop' }, usage });
      return { stream: new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } }) };
    },
  };
  const agent = new Agent({
    id: 'content-factory', name: 'content-factory', instructions: 'Call the scripted tool.', model, memory,
    tools: adapter.buildMastraCapabilityTools([capability], { language: 'ru', services: () => { throw new Error('No real service.'); } }),
    hooks: createCapabilityHooks([capability], { check: async () => ({ allowed: true, policies: [] }) }),
  });
  const mastra = new Mastra({ agents: { 'content-factory': agent }, storage: new InMemoryStore() });
  const mastraService = { mastra: async () => mastra, conductor: async () => agent };
  const mocks = {
    '@mastra/ai-sdk': { handleChatStream },
    '@mastra/memory': { Memory },
    '@mastra/core/processors': { RegexFilterProcessor: class {}, UnicodeNormalizer: class {} },
    '@nestjs/swagger': { ApiTags: noOp },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': { CheckPolicies: noOp },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class': { AuthorizationActions: { Create: 'create' }, Sections: { AI: 'ai' } },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
    '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
    './agent-turn-lifecycle': lifecycle,
  };
  const { AgentThreadsService } = loadTypeScriptModule(`${CONDUCTOR}/agent-threads.service.ts`, mocks);
  const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', mocks);
  let admissions = 0;
  const finished = [];
  const aiUsage = { beginAiOperation: async () => {
    admissions += 1;
    return { run: (work) => work(), finish: async (success) => { finished.push(success); } };
  } };
  const threads = new AgentThreadsService(mastraService, claims);
  const controller = new AgentController(mastraService, threads, aiUsage);
  const peer = new AgentController(mastraService, new AgentThreadsService(mastraService, claims), aiUsage);
  const legacy = await controller.getThread(ORG, USER, threadId);
  assert.equal(legacy.execution, undefined);
  await assert.rejects(controller.getThread(ORG, { ...USER, id: 'foreign-user' }, threadId), (error) => error.getStatus() === 403);
  await assert.rejects(controller.getThread({ ...ORG, id: 'foreign-org' }, USER, threadId), (error) => error.getStatus() === 403);

  let continueBody = body;
  if (resumed) {
    await controller.chat(ORG, USER, body, new Response());
    const [run] = await threads.pendingRuns(identity, threadId);
    assert.ok(run, 'The native first turn must suspend.');
    const [call] = run.toolCalls;
    continueBody = resumed === 'approval'
      ? { threadId, messages: [{ id: 'approval-message', role: 'assistant', parts: [{ type: 'tool-test_deferred', toolCallId: call.toolCallId, state: 'approval-responded', input: {}, approval: { id: `${run.runId}::${call.toolCallId}`, approved: true } }] }] }
      : { threadId, runId: run.runId, toolCallId: call.toolCallId, cardId: loadCapabilityModule('question-card.ts').questionCardId(call.suspendPayload), resumeData: { yes: true } };
  }
  const response = new Response();
  const running = controller.chat(ORG, USER, continueBody, response);
  await Promise.race([began.promise, running.then(() => { throw new Error(`The native ${resumed ?? 'message'} turn finished without starting its service: ${JSON.stringify(contextTrace)}`); })]);
  const during = await controller.getThread(ORG, USER, threadId);
  assert.equal(during.execution.state, 'running');
  assert.equal(writes, 0);
  let intermediate, missingReceipt;
  if (outcome !== 'completed') {
    response.emit('close');
    const read = await peer.getThread(ORG, USER, threadId);
    intermediate = read.execution.state;
    assert.equal(intermediate, 'running');
    assert.equal(writes, 0);
    assert.deepEqual(finished, resumed ? [true] : []);
    // Simulate a lost/expired lease and outcome record, without moving time.
    await claims.del(agentRunClaimKey(`thread:${resourceId}:${threadId}`));
    await assert.rejects(peer.chat(ORG, USER, body, new Response()), (error) => error.getStatus() === 409);
    await claims.del(lifecycle.agentExecutionKey(read.execution.requestId));
    missingReceipt = (await peer.getThread(ORG, USER, threadId)).execution.state;
    assert.equal(missingReceipt, 'unknown');
    await assert.rejects(peer.chat(ORG, USER, body, new Response()), (error) => error.getStatus() === 409);
    assert.equal(admissions, resumed ? 2 : 1);
  }
  if (outcome === 'failed') service.reject(new Error('Deferred service failed.'));
  else service.resolve();
  await running;
  const terminal = (await controller.getThread(ORG, USER, threadId)).execution;
  assert.equal(terminal.state, 'settled');
  assert.equal(terminal.outcome, outcome);
  assert.equal(writes, outcome === 'failed' ? 0 : 1);
  assert.deepEqual(finished, [...(resumed ? [true] : []), outcome === 'completed']);
  // Durable terminal proof survives Redis TTL; a still-running pointer above
  // never gained success from the very same missing-record condition.
  await claims.del(lifecycle.agentExecutionKey(terminal.requestId));
  assert.deepEqual((await peer.getThread(ORG, USER, threadId)).execution, terminal);
  const releaseNext = await peer.threads.claimThreadTurn(identity, threadId);
  await releaseNext();
  const stored = await memory.getThreadById({ threadId });
  assert.equal(stored.title, 'Native title');
  assert.deepEqual(stored.metadata.unrelated, { keep: 12 });
  assert.equal(stored.metadata.workingMemory, 'Old preferences');
  assert.equal(await memory.getWorkingMemory({ threadId, resourceId }), 'Current preferences');
  const registrations = contextTrace.filter((entry) => entry.registered).map((entry) => entry.registered);
  const lastExecute = contextTrace.filter((entry) => entry.executeId).at(-1);
  if (repair) assert.ok(response.chunks.some(chunk => chunk.includes('INTAKE_INPUT_INSUFFICIENT')));
  return { ...(intermediate ? { intermediate, missingReceipt } : {}), state: terminal.state, outcome: terminal.outcome, writes,
    ...(repair ? { revisedInputRefusals: refusals } : {}),
    ...(resumed ? { serializedExecutionStayedOld: lastExecute.executeId === registrations[0] && lastExecute.executeId !== registrations[1] } : {}),
  };
}

async function main() {
  const completed = await scenario('completed');
  const interrupted = await scenario('interrupted');
  const failed = await scenario('failed');
  const resumedQuestion = await scenario('interrupted', 'question');
  const resumedApproval = await scenario('completed', 'approval');
  const recoveredInput = await scenario('completed', undefined, true);
  const lateCallback = await lateOldCallback();
  process.stdout.write(JSON.stringify({ completed, interrupted, failed, resumedQuestion, resumedApproval, recoveredInput, lateCallback, privateLegacyAndMetadata: true }));
}

async function lateOldCallback() {
  const { buildConductorContext } = loadTypeScriptModule(`${CONDUCTOR}/conductor.context.ts`);
  const executionIdentity = { ...identity, role: 'EDITOR', language: 'ru', organizationCreatedAt: ORG.createdAt, timeZone: 'UTC' };
  const requestContext = (requestId) => buildConductorContext({ identity: executionIdentity, threadId, paidLimit: 1, requestId, trackExecution: true });
  let writes = 0;
  const tool = adapter.buildCapabilityTool({
    id: 'test.late', label: { ru: 'Записать', en: 'Write' }, description: 'A late callback.',
    input: z.object({}), untrusted: [], risk: 'write',
    run: async () => { writes += 1; return {}; }, summarize: () => ({}),
  }, { entrance: 'chat', language: 'ru', services: () => { throw new Error('No real service.'); } });
  const old = new lifecycle.AgentTurnLifecycle('old-invocation', async () => {});
  const gate = deferred();
  // The callback is created by the old request, then becomes runnable while
  // a successor exists. It must keep its old stopped invocation identity.
  const late = old.run(() => gate.promise.then(() => tool.execute({}, { requestContext: requestContext('old-invocation') })));
  await old.finish('interrupted');
  const next = new lifecycle.AgentTurnLifecycle('new-invocation', async () => {});
  const storage = new InMemoryStore();
  await storage.init();
  const memory = new Memory({ storage, options: { generateTitle: false, semanticRecall: false } });
  let step = 0;
  const model = {
    specificationVersion: 'v3', provider: 'scripted', modelId: 'scripted', supportedUrls: {},
    doGenerate: async () => { throw new Error('Streaming only.'); },
    doStream: async () => {
      const calling = step++ === 0;
      const parts = [{ type: 'stream-start', warnings: [] },
        ...(calling ? [{ type: 'tool-call', toolCallId: 'fresh-native-call', toolName: 'test_late', input: '{}' }] : [
          { type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: 'Done.' }, { type: 'text-end', id: 'done' },
        ]),
        { type: 'finish', finishReason: { unified: calling ? 'tool-calls' : 'stop', raw: calling ? 'tool_calls' : 'stop' }, usage },
      ];
      return { stream: new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } }) };
    },
  };
  const agent = createDurableAgent({ agent: new Agent({
    id: 'late-callback-native', name: 'Late callback native successor', instructions: 'Use the scripted tool once.',
    model, memory, tools: { test_late: tool },
  }), cleanupTimeoutMs: 0 });
  const mastra = new Mastra({ logger: false, storage, agents: { successor: agent }, recovery: { durableAgents: 'auto' } });
  try {
    await next.run(async () => {
      gate.resolve();
      await assert.rejects(late, /request has stopped/);
      assert.equal(writes, 0);
      // A trusted successor has the native invocation and persistence the
      // adapter requires before a tracked write; an isolated tool.execute does not.
      await agent.generate('Write once.', {
        runId: 'fresh-native-successor', requestContext: requestContext('new-invocation'),
        memory: { thread: threadId, resource: resourceId },
      });
    });
    await next.finish('completed');
    assert.equal(writes, 1);
    const witnesses = Object.entries((await memory.getThreadById({ threadId })).metadata ?? {})
      .filter(([key]) => key.startsWith('assistant-operation-run:'));
    assert.equal(witnesses.length, 1);
    const state = await storage.getStore('threadState');
    assert.equal((await state.getState({ threadId, type: witnesses[0][1].operationType })).state, 'committed');
    return { oldRejected: true, successorWrites: writes };
  } finally { await mastra.shutdown(); }
}
main().catch((error) => { process.stderr.write(String(error.stack ?? error)); process.exitCode = 1; });
