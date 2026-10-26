'use strict';
require('reflect-metadata');
const { z } = require('zod');
const { OutputParserException } = require('@langchain/core/output_parsers');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadCapabilityModule, loadRegistry, requestContextFor, IDENTITY } = require('./helpers/agent-capabilities.cjs');
let invoke;
const { IntakeService } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts', {
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
    getChatModel: async () => ({ withStructuredOutput: schema => ({ invoke: async prompt => invoke(schema, prompt) }) }),
  },
});
const request = 'Подготовь заметку про недавние изменения OpenAI.';
const brief = { goal: 'Заметка', thesis: 'Изменения', position: null, disagreement: null, audience: 'читатели',
  format: 'auto', facts: [], origins: {}, options: {}, questions: [], inputSufficient: true,
  understanding: { version: 'intake-request/v1', goal: request,
    constraints: { temporal: { mode: 'recent', priorCoverageEnd: 'null' } } } };
const build = (usage = async (_org, _op, callback) => callback()) => {
  const writes = jest.fn(async () => ({ id: 'piece-1', code: 'cnt-1' }));
  const usageCall = jest.fn(usage);
  const service = new IntakeService({}, {}, {}, {}, { listFacts: async () => [] },
    { resolve: async () => ({ effectiveVoice: null }) }, { recordCore: writes }, {}, {},
    { executeAiOperation: usageCall }, () => new Date('2026-10-25T12:00:00Z'), undefined, () => null);
  const run = async () => {
    const plan = await service.prepare(IDENTITY.organizationId, { input: request, inputKind: 'instruction', language: 'ru' });
    const events = [];
    for await (const event of service.run(IDENTITY.organizationId, plan, IDENTITY.userId)) events.push(event);
    return events;
  };
  return { service, writes, usageCall, run };
};
beforeEach(() => { invoke = jest.fn(async () => { throw new Error('No model response set'); }); });

test.each(['schema', 'parser'])('actual intake fillBrief classifies %s failure without raw output, replay or unspent claims', async kind => {
  let cause;
  invoke = jest.fn(async schema => {
    if (kind === 'parser') {
      cause = new OutputParserException('private model output / secret', 'private model output / secret');
    } else {
      const valid = structuredClone(brief);
      valid.understanding.constraints.temporal.priorCoverageEnd = null;
      expect(schema.safeParse(valid).success).toBe(true);
      const parsed = schema.safeParse(brief);
      expect(parsed.success).toBe(false);
      expect(parsed.error.issues.some(issue => issue.path.join('.') === 'understanding.constraints.temporal.priorCoverageEnd')).toBe(true);
      cause = parsed.error;
    }
    throw cause;
  });
  const built = build();
  let failure;
  try { await built.run(); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: 'INTAKE_BRIEF_INVALID', status: 422 });
  expect(failure.cause).toBe(cause);
  expect(Object.keys(failure)).not.toContain('cause');
  expect(failure.canReviseInput).toBeUndefined();
  expect(failure.unspentFailure).toBeUndefined();
  expect(JSON.stringify(failure)).not.toContain('private model output');
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(built.usageCall).toHaveBeenCalledTimes(1);
  expect(built.writes).not.toHaveBeenCalled();
});

test('provider errors and usage-storage validation failures retain their original identity', async () => {
  const provider = Object.assign(new Error('provider connection lost'), { name: 'APIConnectionError' });
  invoke = jest.fn(async () => { throw provider; });
  const first = build();
  await expect(first.run()).rejects.toBe(provider);
  expect(first.writes).not.toHaveBeenCalled();
  const storage = z.object({ stored: z.string() }).safeParse({ stored: 5 }).error;
  const second = build(async () => { throw storage; });
  await expect(second.run()).rejects.toBe(storage);
  expect(second.writes).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledTimes(1);
});

test('native paid adapter records this coded failure once and replays its safe receipt without a second inference', async () => {
  const { InMemoryStore } = require('@mastra/core/storage');
  const storage = new InMemoryStore();
  await storage.init();
  const adapter = loadCapabilityModule('mastra.adapter.ts');
  const receipts = loadCapabilityModule('../conductor/agent-operation-receipts.ts');
  const built = build();
  invoke = jest.fn(async () => { throw new OutputParserException('private model output / secret', 'private model output / secret'); });
  const registry = loadRegistry();
  const context = requestContextFor(registry);
  context.set('mastra__durableExecutions', { 'parse-failure-run': {} });
  registry.reservePaidSlot(context, 'parse-failure-test');
  const tool = adapter.buildMastraCapabilityTools([{
    id: 'piece.create', group: 'content', risk: 'paid', label: { ru: 'Создать', en: 'Create' },
    description: 'Create a piece through real intake', door: {}, input: z.object({}), untrusted: [],
    run: () => built.run(), summarize: () => ({}),
  }], { services: () => ({}), language: 'ru', entrance: 'chat' }).piece_create;
  const thread = { metadata: {} };
  const memory = { storage, getThreadById: async () => thread,
    updateThread: async ({ metadata }) => Object.assign(thread.metadata, metadata) };
  const options = { runId: 'parse-failure-run', requestContext: context, memory,
    agent: { threadId: 'parse-failure-thread', toolCallId: 'parse-failure-call' } };
  const first = await tool.execute({}, options);
  expect(first).toMatchObject({ ok: false, code: 'INTAKE_BRIEF_INVALID' });
  expect(first.canReviseInput).toBeUndefined();
  expect(JSON.stringify(first)).not.toContain('private model output');
  // A spent model slot remains spent even though the artifact was not written.
  expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.paidCalls)).toBe(1);
  const scope = { organizationId: IDENTITY.organizationId, runId: options.runId,
    threadId: options.agent.threadId, toolName: 'piece_create', toolCallId: options.agent.toolCallId };
  const state = await storage.getStore('threadState');
  const saved = await state.getState({ threadId: scope.threadId, type: receipts.agentOperationStateType(scope) });
  expect(saved).toMatchObject({ state: 'committed', receipt: { result: { ok: false, code: 'INTAKE_BRIEF_INVALID' } } });
  const second = await tool.execute({}, options);
  expect(second).toMatchObject({ ok: false, code: 'INTAKE_BRIEF_INVALID' });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(built.writes).not.toHaveBeenCalled();
  expect(context.get(receipts.AGENT_UNCERTAIN_OPERATION_CONTEXT_KEY)).toBeUndefined();
});
