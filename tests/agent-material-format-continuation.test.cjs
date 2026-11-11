'use strict';
const { loadTypeScriptModule: load } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/chat/conductor/';
const context = load(base + 'conductor.context.ts');
const { AGENT_MATERIAL_FORMAT_CONTEXT_KEY: key } = load(base + 'chat-mode.ts');
const { parseAgentChatBody } = load(base + 'agent-chat.request.ts');
const { AgentThreadsService } = load(base + 'agent-threads.service.ts', {
  '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
});
const identity = { organizationId: 'org', userId: 'owner', role: 'EDITOR', language: 'ru' };
const author = { messageId: 'author-original', text: 'Подготовь исследовательский черновик. После согласования сделай пост-приглашение для Telegram.' };
const initial = () => context.buildConductorContext({ identity, threadId: 'thread-one', requestId: 'failed-request', originalAuthorRequest: author });
function harness({ legacy = false } = {}) {
  const material = context.materialRequestContextOf(initial());
  const row = { id: 'thread-one', resourceId: 'org:owner', metadata: {
    assistantNativeRun: { runId: 'native-run', logicalRequestId: 'failed-request', state: 'settled',
      ...(!legacy ? { continuationMaterialContext: material } : {}) },
    assistantExecution: { requestId: 'failed-request', state: 'settled', outcome: 'failed' },
  } };
  const memory = { getThreadById: async ({threadId}) => threadId === row.id ? row : null,
    updateThread: async ({metadata}) => { row.metadata = {...row.metadata, ...metadata}; return row; } };
  const workflows = { getWorkflowRunById: jest.fn(async () => ({ resourceId: row.resourceId,
    snapshot: { requestContext: Object.fromEntries(initial().entries()) } })) };
  const mastra = { conductor: async () => ({ getMemory: async () => memory }),
    mastra: async () => ({ getStorage: () => ({ getStore: async () => workflows }) }) };
  return { row, workflows, service: new AgentThreadsService(mastra), material };
}

test.each([false, true])('same failed task retains the exact authored post choice through Continue and a factual answer (legacy=%s)', async legacy => {
  const h = harness({ legacy });
  const retained = await h.service.materialContextForTurn(identity, 'thread-one', { continueFromRequestId: 'failed-request' });
  // Legacy native snapshot must carry its actual logical request binding.
  const continued = context.buildConductorContext({ identity, threadId: 'thread-one', materialContext: retained,
    originalAuthorRequest: { messageId: 'control-continue', text: 'Продолжи после остановки.' } });
  expect(JSON.parse(continued.get(key))).toEqual(['post']);
  expect(context.materialRequestContextOf(continued).originalAuthorRequest).toEqual(author);
  const answered = context.materialContextAfterAnswer(retained, { question: 'Кто читатель?', questionPurpose: 'fact' }, { answer: 'Руководители.' });
  expect(JSON.parse(context.buildConductorContext({ identity, threadId: 'thread-one', materialContext: answered }).get(key))).toEqual(['post']);
  expect(continued.get('cf.approvals')).toBe('');
});

test('a later explicit user format or actual format answer wins; an independent new request inherits nothing', () => {
  const materialContext = context.materialRequestContextOf(initial());
  const changed = context.buildConductorContext({ identity, threadId: 'thread-one', materialContext,
    originalAuthorRequest: { messageId: 'new-format', text: 'Теперь сделай Reels.' } });
  expect(JSON.parse(changed.get(key))).toEqual(['reel']);
  const answer = context.materialContextAfterAnswer(materialContext, { questionPurpose: 'format' }, { answer: 'Карусель' });
  expect(JSON.parse(context.buildConductorContext({ identity, threadId: 'thread-one', materialContext: answer }).get(key))).toEqual(['carousel']);
  const other = context.buildConductorContext({ identity, threadId: 'thread-one', originalAuthorRequest: {
    messageId: 'independent-material', text: 'Подготовь новый материал по другой теме.' } });
  expect(JSON.parse(other.get(key))).toEqual([]);
});

test.each(['stale', 'completed', 'foreign'])('continuation rejects %s task authority', async kind => {
  const h = harness();
  if (kind === 'completed') h.row.metadata.assistantExecution.outcome = 'completed';
  const caller = kind === 'foreign' ? {...identity, userId: 'another'} : identity;
  await expect(h.service.materialContextForTurn(caller, 'thread-one', {
    continueFromRequestId: kind === 'stale' ? 'older-request' : 'failed-request' })).rejects.toThrow();
  expect(h.workflows.getWorkflowRunById).not.toHaveBeenCalled();
});

test('continuation transport requires a scoped reference and never accepts it on an answer', () => {
  const body = { threadId: 'thread-one', continueFromRequestId: 'failed-request', messages: [
    { id: 'user-continue', role: 'user', parts: [{type: 'text', text: 'Продолжи.'}] }] };
  expect(parseAgentChatBody(body).continueFromRequestId).toBe('failed-request');
  for (const invalid of [{...body, threadId: undefined}, {...body, continueFromRequestId: 'bad/path'},
    {...body, runId: 'native-run', resumeData: {answer: 'Да'}, cardId: 'a'.repeat(32)}])
    expect(() => parseAgentChatBody(invalid)).toThrow();
});

test('native HTTP preserves a post after a factual resume and rejects stale continuation before admission', () => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const output = execFileSync(process.execPath, ['tests/helpers/material-format-continuation.probe.cjs'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(JSON.parse(output.split('\n').find(line => line.startsWith('{"postCreates":')))).toEqual({ postCreates: 1, modelCalls: 3,
    factualAnswerPreserved: true, staleBeforeAdmission: true, externalRequests: 0 });
}, 35_000);
