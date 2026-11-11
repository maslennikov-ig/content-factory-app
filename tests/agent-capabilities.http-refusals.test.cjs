'use strict';
const {HttpException} = require('@nestjs/common');
const {InMemoryStore} = require('@mastra/core/storage');
const {z} = require('zod');
const {loadRegistry, requestContextFor, IDENTITY, loadCapabilityModule} = require('./helpers/agent-capabilities.cjs');
const registry = loadRegistry();
const receipts = loadCapabilityModule('../conductor/agent-operation-receipts.ts');
const {createConductorMemory} = loadCapabilityModule('../conductor/conductor.memory.ts');
const {CONDUCTOR_EXECUTION_ID_KEY} = loadCapabilityModule('../conductor/conductor.context.ts');

test.each([
  ['typed-product-refusal', () => new HttpException({code: 'VIDEO_PROFILE_HUMAN_DECISION_REQUIRED', message: 'PRIVATE_HTTP_BODY',
    canReviseInput: true, spentNothing: true}, 409), 'committed', 'VIDEO_PROFILE_HUMAN_DECISION_REQUIRED'],
  ['unknown-http', () => new HttpException({message: 'PRIVATE_HTTP_BODY'}, 409), 'pending', 'CAPABILITY_OUTCOME_UNCERTAIN'],
  ['server-http', () => new HttpException({code: 'VIDEO_PROFILE_FAILED', message: 'PRIVATE_HTTP_BODY'}, 500), 'pending', 'CAPABILITY_OUTCOME_UNCERTAIN'],
  ['prisma', () => Object.assign(new Error('PRIVATE_PRISMA_DETAILS'), {code: 'P2025'}), 'pending', 'CAPABILITY_OUTCOME_UNCERTAIN'],
  ['network', () => Object.assign(new Error('PRIVATE_NETWORK_DETAILS'), {code: 'ECONNREFUSED'}), 'pending', 'CAPABILITY_OUTCOME_UNCERTAIN'],
])('%s retains a truthful native receipt without granting retry authority', async (name, error, expectedState, expectedCode) => {
  const storage = new InMemoryStore(); await storage.init();
  const memory = createConductorMemory(storage);
  const threadId = 'http-refusal-' + name, runId = 'run-' + name, toolCallId = 'call-' + name;
  const resourceId = `${IDENTITY.organizationId}:${IDENTITY.userId}`;
  await memory.createThread({threadId, resourceId, title: 'Native HTTP refusal'});
  const context = requestContextFor(registry);
  context.set(CONDUCTOR_EXECUTION_ID_KEY, 'execution-' + name);
  let calls = 0;
  const capability = {id: 'test.http_refusal', group: 'content', risk: 'write', label: {ru: 'Проверить', en: 'Check'},
    description: 'Controlled native error boundary.', input: z.object({}).strict(), door: {}, untrusted: [],
    run: async () => {calls++; throw error();}, summarize: result => result};
  const tool = registry.buildCapabilityTool(capability, {services: () => ({}), language: 'ru', entrance: 'chat',
    gate: {check: async () => ({allowed: true, policies: []})}, admitInExecute: true});
  const scope = {organizationId: IDENTITY.organizationId, threadId, runId,
    toolName: 'test_http_refusal', toolCallId, storage, memory};
  const invoke = () => tool.execute({}, {runId, requestContext: context, abortSignal: new AbortController().signal,
    memory, mastra: {getStorage: () => storage}, agent: {threadId, resourceId, toolCallId}});
  try {
    const result = await invoke();
    expect(result).toMatchObject({ok: false, code: expectedCode});
    expect(result.canReviseInput).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    const state = await (await storage.getStore('threadState')).getState({threadId, type: receipts.agentOperationStateType(scope)});
    expect(state.state).toBe(expectedState);
    if (expectedState === 'committed') {
      expect((await receipts.readCommittedToolReceipt(scope)).result).toEqual(result);
      expect(await receipts.readAgentOperationRunGuard(scope)).toBeNull();
    } else {
      expect(await receipts.readAgentOperationRunGuard(scope)).toMatchObject({state: 'uncertain'});
    }
    expect(await invoke()).toMatchObject({ok: false, code: expectedCode});
    expect(calls).toBe(1, 'Neither a retained refusal nor an uncertain action may rerun this invocation.');
  } finally {await storage.close();}
});
