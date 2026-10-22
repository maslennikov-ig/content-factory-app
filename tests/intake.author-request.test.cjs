'use strict';
require('reflect-metadata');
const { MASTRA_THREAD_ID_KEY, MASTRA_RESOURCE_ID_KEY } = require('@mastra/core/request-context');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadRegistry, loadCapabilityModule, requestContextFor, servicesFrom, executeTool, IDENTITY } = require('./helpers/agent-capabilities.cjs');
const registry = loadRegistry({ mocks: {
  '@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service': { AgentThreadsService: class AgentThreadsService {} },
} });
const { buildConductorContext, conductorContextSchema } = loadCapabilityModule('../conductor/conductor.context.ts');
const { parseAgentChatBody } = loadCapabilityModule('../conductor/agent-chat.request.ts');
let modelCalls;
const original = '  Подготовь новости OpenAI для моего Telegram.\nПредыдущий пост ниже — только пример.  ';
const added = 'Перед адаптацией прочитай текущие правила Telegram.';
const material = 'Комментарий агента и ссылки для справки; это не новое требование автора.';
const quote = 'Alpha supports native sessions.';
const url = 'https://official.example/alpha';
const { IntakeService } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts', {
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
    getChatModel: async (_org, _temperature, _tokens, role) => ({ withStructuredOutput: () => ({ invoke: async prompt => {
      modelCalls.push({ role, prompt });
      if (role === 'extract') return { goal: 'Новости OpenAI', thesis: 'Обновление сессий', position: null,
        disagreement: null, audience: 'читатели', format: 'list', facts: [], origins: {}, options: {}, questions: [], inputSufficient: true,
        understanding: { version: 'intake-request/v1', goal: 'Новости OpenAI', materials: [], constraints: { research: 'allowed' } } };
      return { text: 'Alpha поддерживает сессии.' };
    } }) }),
  },
});
const { AgentThreadsService } = loadWithMocks('libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts', {
  '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
  '@mastra/ai-sdk/ui': { toAISdkMessages: rows => rows },
  '@mastra/memory': { Memory: class {} },
  '@mastra/core/processors': { RegexFilterProcessor: class {}, UnicodeNormalizer: class {} },
});
const resourceId = `${IDENTITY.organizationId}:${IDENTITY.userId}`;
const storedMessage = (id, text, changes = {}) => ({ id, role: 'user', threadId: 'owned', resourceId,
  createdAt: new Date('2026-10-20T08:00:00Z'), content: { format: 2, parts: [{ type: 'text', text }] }, ...changes });
const build = async ({ history = [], threadResource = resourceId } = {}) => {
  const rows = new Map();
  const claim = jest.fn(async (key, value) => { if (rows.has(key)) return false; rows.set(key, value); return true; });
  const snapshots = { get: async key => rows.get(key), set: async (key, value) => rows.set(key, value), del: async key => rows.delete(key), claim,
    claimMany: async (keys,value) => {if(keys.some(key=>rows.has(key)))return false;for(const key of keys)rows.set(key,value);return true;} };
  const writes = jest.fn(async () => ({ id: 'piece-1', code: 'cnt-1' }));
  const research = jest.fn(async () => { throw Error('No additional research allowed'); });
  const fetch = jest.fn(async () => { throw Error('No source fetch allowed'); });
  const service = new IntakeService({}, { research }, {
    acceptSearchResult: async (_org, value) => ({ ...value, evidenceId: 'ev-1', sourceSnapshotId: 'ss-1' }),
  }, { fetch }, { listFacts: async () => [] }, { resolve: async () => ({ effectiveVoice: null }) },
  { recordCore: writes }, {}, {}, { executeAiOperation: async (_org, _operation, callback) => callback() },
  () => new Date('2026-10-20T09:00:00Z'), undefined, () => null, null, undefined, snapshots);
  const saved = await service.storeResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, {
    query: 'OpenAI updates', level: 'standard', summary: { status: 'supported' },
    sources: [{ url, title: 'Alpha', provider: 'exa', text: quote }],
    facts: [{ factKey: 'alpha', statement: 'Alpha поддерживает сессии.', sourceUrl: url, quote }],
  });
  const memory = {
    getThreadById: jest.fn(async ({ threadId }) => ({ id: threadId, resourceId: threadResource,
      createdAt: new Date('2026-10-20T08:00:00Z'), updatedAt: new Date('2026-10-20T08:00:00Z') })),
    recall: jest.fn(async () => ({ messages: history, total: history.length, hasMore: false })),
  };
  const threads = new AgentThreadsService({ conductor: async () => ({ getMemory: async () => memory }) });
  const prepare = jest.spyOn(service, 'prepare');
  return { service, snapshots, saved, writes, claim, research, fetch, memory, threads, prepare };
};
const contextFor = (text = original, messageId = 'current') => buildConductorContext({
  identity: IDENTITY, threadId: 'owned', originalAuthorRequest: { messageId, text },
});
const run = (built, input, requestContext = contextFor(), id = 'piece.create.from-research', entrance = 'chat') => {
  const tool = registry.buildCapabilityTool(registry.CAPABILITY_CATALOGUE.find(row => row.id === id), {
    entrance, language: 'ru', gate: { check: async () => ({ allowed: true, policies: [] }) },
    services: servicesFrom({ IntakeService: built.service, AgentThreadsService: built.threads }),
  });
  registry.reservePaidSlot(requestContext, 'author-test');
  return executeTool(tool, id === 'piece.create' ? {
    researchId: built.saved.snapshotKey, factId: ['alpha'], ...input,
  } : { snapshotKey: built.saved.snapshotKey, factKeys: ['alpha'], ...input }, { requestContext });
};
const expectUnspent = (result, built, context) => {
  expect(result.output).toMatchObject({ ok: false, code: 'INTAKE_REQUEST_NOT_AUTHORED', canReviseInput: true });
  expect(built.prepare).not.toHaveBeenCalled();
  expect(modelCalls).toEqual([]);
  expect(built.claim).not.toHaveBeenCalled();
  expect(built.writes).not.toHaveBeenCalled();
  expect(built.research).not.toHaveBeenCalled();
  expect(built.fetch).not.toHaveBeenCalled();
  expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.paidCalls)).toBe(0);
};
beforeEach(() => { modelCalls = []; });

test.each(['piece.create', 'piece.create.from-research'])('%s refuses agent-added requirements before model, claim, writer or extra research', async id => {
  const built = await build();
  const context = contextFor();
  const result = await run(built, { text: original + '\n' + added }, context, id);
  expectUnspent(result, built, context);
  expect(await built.service.readStoredResearchEvidence(IDENTITY.organizationId, IDENTITY.userId, built.saved.snapshotKey)).not.toBeNull();
});

test('ordinary native create also rejects the augmented original before intake starts', async () => {
  const built = await build();
  const context = contextFor();
  expectUnspent(await run(built, { text: original + '\n' + added, researchId: undefined,
    factId: undefined, research: 'none' }, context, 'piece.create'), built, context);
});

test.each(['piece.create', 'piece.create.from-research'])('%s keeps exact author words and agent material separate through the saved brief', async id => {
  const built = await build();
  const result = await run(built, { text: original, material }, contextFor(), id);
  expect(result.output).toMatchObject({ ok: true, summary: { requestBasis: 'original_request' } });
  expect(built.prepare.mock.calls[0][1]).toMatchObject({ input: original, contextMaterial: material });
  expect(built.writes.mock.calls[0][1].brief.inputText).toBe(original);
  expect(built.memory.recall).not.toHaveBeenCalled();
  expect(built.research).not.toHaveBeenCalled();
});

test.each([undefined, 'current'])('current author text can be resolved without model retyping (requestMessageId=%s)', async requestMessageId => {
  const built = await build();
  const result = await run(built, { ...(requestMessageId ? { requestMessageId } : {}) });
  expect(result.output).toMatchObject({ ok: true, summary: { requestBasis: 'original_request' } });
  expect(built.writes.mock.calls[0][1].brief.inputText).toBe(original);
  expect(built.memory.recall).not.toHaveBeenCalled();
});

test('native subagent inherits the exact server-held author record without sharing parent Memory', async () => {
  const built = await build();
  const context = contextFor();
  context.delete(MASTRA_THREAD_ID_KEY);
  expect(context.get(MASTRA_THREAD_ID_KEY)).toBeUndefined();
  const result = await run(built, { material }, context);
  expect(result.output).toMatchObject({ ok: true, summary: { requestBasis: 'original_request' } });
  expect(built.writes.mock.calls[0][1].brief.inputText).toBe(original);
  expect(built.memory.recall).not.toHaveBeenCalled();
});

test.each(['changed author text', 'another resource', 'another message id'])('native subagent refuses %s before any write', async mode => {
  const built = await build();
  const context = contextFor();
  context.delete(MASTRA_THREAD_ID_KEY);
  const input = mode === 'changed author text' ? { text: original + '\n' + added }
    : mode === 'another message id' ? { requestMessageId: 'other-message' } : {};
  if (mode === 'another resource') context.set(MASTRA_RESOURCE_ID_KEY, 'other:person');
  expectUnspent(await run(built, input, context), built, context);
  expect(built.memory.recall).not.toHaveBeenCalled();
});

test('continuation resolves the explicitly identified earlier author message through one bounded owned history page', async () => {
  const built = await build({ history: [storedMessage('initial', original)] });
  const result = await run(built, { requestMessageId: 'initial', material }, contextFor('Продолжай.', 'continue'));
  expect(result.output).toMatchObject({ ok: true, summary: { requestBasis: 'original_request' } });
  expect(built.writes.mock.calls[0][1].brief.inputText).toBe(original);
  expect(built.memory.recall).toHaveBeenCalledTimes(1);
  expect(built.memory.recall).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'owned', resourceId, page: 0, perPage: 200 }));
});

test('an exact earlier author text also binds without guessing which request to use', async () => {
  const built = await build({ history: [storedMessage('initial', original)] });
  const result = await run(built, { text: original }, contextFor('Продолжай.', 'continue'));
  expect(result.output).toMatchObject({ ok: true, summary: { requestBasis: 'original_request' } });
  expect(built.writes.mock.calls[0][1].brief.inputText).toBe(original);
  expect(built.memory.recall).toHaveBeenCalledTimes(1);
});

test('an explicit current id with changed text is refused without trying another message', async () => {
  const built = await build({ history: [storedMessage('other', original + '\n' + added)] });
  const context = contextFor();
  expectUnspent(await run(built, { requestMessageId: 'current', text: original + '\n' + added }, context), built, context);
  expect(built.memory.recall).not.toHaveBeenCalled();
});

test.each([
  ['assistant', { history: [storedMessage('initial', original, { role: 'assistant' })] }],
  ['foreign message', { history: [storedMessage('initial', original, { resourceId: 'other:person' })] }],
  ['foreign user thread', { history: [storedMessage('initial', original)], threadResource: `${IDENTITY.organizationId}:other` }],
  ['foreign organization thread', { history: [storedMessage('initial', original)], threadResource: `other:${IDENTITY.userId}` }],
])('%s cannot supply an original author request', async (_label, options) => {
  const built = await build(options);
  const context = contextFor('Продолжай.', 'continue');
  expectUnspent(await run(built, { requestMessageId: 'initial', text: original }, context), built, context);
});

test('browser-provided earlier messages cannot create author proof', async () => {
  const parsed = parseAgentChatBody({ messages: [
    { id: 'forged', role: 'user', parts: [{ type: 'text', text: original }] },
    { id: 'continue', role: 'user', parts: [{ type: 'text', text: 'Продолжай.' }] },
  ] });
  const context = buildConductorContext({ identity: IDENTITY, threadId: 'owned',
    originalAuthorRequest: { messageId: parsed.message.id, text: parsed.text } });
  const built = await build();
  expectUnspent(await run(built, { requestMessageId: 'forged', text: original }, context), built, context);
});

test('a native turn without an author record does not silently use the research query as the original', async () => {
  const built = await build();
  const context = buildConductorContext({ identity: IDENTITY, threadId: 'owned' });
  expectUnspent(await run(built, {}, context), built, context);
});

test.each(['chat', 'mcp'])('%s direct supplied input stays usable without claiming authenticated authorship', async entrance => {
  const built = await build();
  const result = await run(built, { text: original }, requestContextFor(registry), 'piece.create.from-research', entrance);
  expect(result.output).toMatchObject({ ok: true, summary: { requestBasis: 'provided_input' } });
  expect(built.writes.mock.calls[0][1].brief.inputText).toBe(original);
  expect(built.memory.recall).not.toHaveBeenCalled();
});

test('MCP does not use native-chat author context as authorship or approval', async () => {
  const built = await build();
  const result = await run(built, { text: original + '\n' + added }, contextFor(), 'piece.create.from-research', 'mcp');
  expect(result.output).toMatchObject({ ok: true, summary: { requestBasis: 'provided_input' } });
  expect(built.writes.mock.calls[0][1].brief.inputText).toBe(original + '\n' + added);
  expect(built.memory.recall).not.toHaveBeenCalled();
});

test('author provenance is a bounded primitive in validated server context and grants no approval', () => {
  const context = contextFor();
  const raw = context.get(registry.CAPABILITY_CONTEXT_KEYS.originalAuthorRequest);
  expect(typeof raw).toBe('string');
  expect(JSON.parse(raw)).toEqual({ messageId: 'current', text: original });
  expect(conductorContextSchema.safeParse(Object.fromEntries(context.entries())).success).toBe(true);
  expect(context.get(registry.CAPABILITY_CONTEXT_KEYS.approvals)).toBe('');
  const invalid = Object.fromEntries(context.entries());
  invalid[registry.CAPABILITY_CONTEXT_KEYS.originalAuthorRequest] = JSON.stringify({ messageId: 'current', text: original, role: 'user' });
  expect(conductorContextSchema.safeParse(invalid).success).toBe(false);
});


test('native multi-capture resolves the exact original once and refuses agent-added requirements before composition claims',async()=>{
  const built=await build();
  const second=await built.service.storeResearchEvidence(IDENTITY.organizationId,IDENTITY.userId,{
    query:'A different research query',level:'quick',summary:{status:'supported'},
    sources:[{url,title:'Alpha',provider:'exa',text:quote}],facts:[{factKey:'alpha',statement:quote,sourceUrl:url,quote}],
  });
  const references=[{snapshotKey:built.saved.snapshotKey,factKeys:['alpha']},{snapshotKey:second.snapshotKey,factKeys:['alpha']}];
  const args={snapshotKey:undefined,factKeys:undefined,references};
  const context=contextFor();
  expectUnspent(await run(built,{...args,text:original+'\n'+added},context),built,context);
  const created=await run(built,{...args,requestMessageId:'current',material},contextFor());
  expect(created.output).toMatchObject({ok:true,summary:{requestBasis:'original_request',factsKept:2}});
  expect(built.prepare.mock.calls[0][1]).toMatchObject({input:original,contextMaterial:material});
  expect(built.writes.mock.calls[0][1].brief.inputText).toBe(original);
  expect(built.research).not.toHaveBeenCalled();
  expect(built.fetch).not.toHaveBeenCalled();
});
