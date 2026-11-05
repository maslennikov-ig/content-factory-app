'use strict';

// Actual registry/adapter, source authorization, CAS repository and AI admissions;
// only provider transport and Prisma persistence are synthetic. No paid calls.
const { AsyncLocalStorage } = require('node:async_hooks');
const { fixture, loadTypeScriptModule, base, copy } = require('./helpers/source-artifact.fixture.cjs');
const { IDENTITY, loadRegistry, servicesFrom, requestContextFor, executeTool } = require('./helpers/agent-capabilities.cjs');
const chain = require('./helpers/ai-text-chain.cjs');
const acting = loadTypeScriptModule(base + 'user/acting.user.ts');
const { digest, identity } = loadTypeScriptModule(base + 'content-intelligence/social-factory/campaign/domain.ts', {
  '../social-factory.repository': { SocialFactoryError: class extends Error { constructor(code) { super(code); this.code = code; } } },
});
const registry = loadRegistry();
const token = class {};
const repoMocks = { '../../database/prisma/prisma.service': { PrismaRepository: token, PrismaTransaction: token } };
const { SocialFactoryRepository } = loadTypeScriptModule(base + 'content-intelligence/social-factory/social-factory.repository.ts', repoMocks);
const request = { messageId: 'original-request', text: 'Сделать рилс про MegaCampus Summit в Дубае. Не менять название.' };
const thread = 'owned-original-chat';
const scenario = () => ({
  directionsLanguage: 'en', outputLocale: 'ru', targetSeconds: 5, aspectRatio: '9:16',
  firstFrameDirections: 'Portrait wide shot, sunrise, one smooth push-in.',
  lastFrameDirections: 'Same camera axis and lighting, end closer to the stage.',
  motionDirections: 'One continuous slow push-in over five seconds. No cuts.',
  screenText: 'MegaCampus Summit — Дубай', spokenText: '', captions: ['MegaCampus Summit'],
  claims: [{ text: 'MegaCampus Summit в Дубае', sourceQuote: 'MegaCampus Summit в Дубае' }], unknownFacts: [], rightsConflicts: [],
});
const errorCode = error => error?.code ?? error?.response?.code;
const rejectsCode = async (promise, code) => { try { await promise; throw new Error('Expected refusal: ' + code); } catch (error) { expect(errorCode(error)).toBe(code); } };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function setup(options = {}) {
  const f = fixture(), active = new AsyncLocalStorage();
  const outputLocale = options.outputLocale ?? 'ru';
  f.editPost('<p>MegaCampus Summit в Дубае. Дата и число участников не указаны.</p>');
  // Serialize the synthetic DB, matching the real repository's serializable seam.
  const transact = f.db.$transaction; let tail = Promise.resolve();
  f.db.$transaction = run => { const pending = tail.then(() => transact(run)); tail = pending.catch(() => {}); return pending; };
  const createRecord = f.db.socialFactoryRecord.create;
  f.db.socialFactoryRecord.create = ({ data }) => createRecord({ data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) });
  const config = { usageMode: 'workspace_key', provider: 'openrouter', apiKey: 'synthetic-never-sent', textModel: 'openai/gpt-6.1-terra', imageModel: 'none',
    textChain: { flex: true, fallbackModel: 'openai/gpt-6.1-sol', maxRetries: 0 }, modelRouting: { advancedModel: 'openai/gpt-6.1-terra', advancedFlex: true }, ...options.config };
  const configModule = {
    loadAiConfig: async () => config, requireActiveAiConfig: async () => { if (!active.getStore()) throw new Error('No admission'); return config; },
    getActiveAiConfig: org => active.getStore()?.org === org ? config : undefined, getActiveAiOrganizationId: () => active.getStore()?.org,
    withActiveAiConfig: (org, next, run) => active.run({ org, config: next }, run), setAiProviderSettingReader() {}, setInstanceAiDefaultsReader() {}, INSTANCE_AI_DEFAULTS_ID: 'instance',
    AiProviderNotConfigured: class extends Error {},
  };
  const usageRows = [], calls = [], selections = [];
  const { AiUsageService } = loadTypeScriptModule(base + 'openai/ai.usage.service.ts', {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaService: token },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': configModule,
    '@contentfactory/nestjs-libraries/openai/ai.text-chain': chain,
    '@contentfactory/nestjs-libraries/user/acting.user': acting,
  });
  const usage = new AiUsageService({ aiUsageRecord: {
    create: async ({ data }) => { const row = { id: 'usage-' + (usageRows.length + 1), ...copy(data) }; usageRows.push(row); return row; },
    update: async ({ where, data }) => Object.assign(usageRows.find(row => row.id === where.id), copy(data)),
    deleteMany: async () => ({ count: 0 }),
  } });
  const repository = new SocialFactoryRepository({ model: f.db }, { model: f.db });
  const { NativeClipPreproductionServiceV1 } = loadTypeScriptModule(base + 'content-intelligence/social-factory/native-clip-preproduction.service.v1.ts', {
    '../../openai/ai.usage.service': { AiUsageService }, '../../openai/ai.provider.config': configModule,
    '../../openai/ai.text-chain': chain, '../../user/acting.user': acting, './social-factory.repository': { SocialFactoryRepository },
    '../../openai/ai.clients': { getMastraAgentModelEntries: async (org, role, selected) => { selections.push({ org, role, ...selected }); return { provider: config.provider, primaryModel: selected.modelId, entries: [{ enabled: true, model: { modelId: selected.modelId } }] }; } },
    '@mastra/core/agent': { Agent: class {
      constructor(settings) { this.settings = settings; }
      async generate(raw, settings) {
        const input = JSON.parse(raw), index = calls.length, role = this.settings.name === 'Clip author' ? 'author' : 'critic';
        expect(settings.maxSteps).toBe(1); expect(settings.modelSettings.maxRetries).toBe(0); expect(settings.structuredOutput).toBeUndefined();
        const persisted = [...f.tables.socialFactoryRecord.values()].find(row => row.payload.request.text === input.originalRequest).payload;
        const stageIndex = persisted.stages.length - 1;
        expect(persisted.stages.at(-1)).toMatchObject({ state: 'started', kind: role, inputDigest: digest(input) });
        const selected = this.settings.model[0].model.modelId;
        calls.push({ input, role, selected });
        if (options.onCall) await options.onCall({ index, input, role, f });
        if (options.throwAt === index) throw new Error('Synthetic lost response');
        chain.currentUsageLedger().record(chain.readUsage({ ...(options.actual === null ? {} : { model: options.actual ?? selected }), usage: { cost: 0.01, input_tokens: 20, output_tokens: 20 } }, { number: 1, model: selected, flex: true, timeoutMs: 1000 }));
        const object = role === 'author' ? { ...scenario(), outputLocale, ...(outputLocale === 'en' ? {screenText: 'MegaCampus Summit — Dubai'} : {}), ...(typeof options.scenario === 'function' ? options.scenario({ index, input }) : options.scenario), ...(stageIndex === 2 ? { motionDirections: 'Targeted slower push-in; preserve names and copy.' } : {}) }
          : { sourceDigest: input.sourceDigest, scenarioDigest: input.scenarioDigest, verdict: options.revise ? 'revise' : 'accept', findings: options.revise ? [{ category: 'creative', detail: 'Slow the push-in.' }] : [], ...(typeof options.review === 'function' ? options.review({ index, input }) : options.review) };
        return { text: options.raw === undefined ? JSON.stringify(object) : options.raw };
      }
    } },
  });
  const service = new NativeClipPreproductionServiceV1(repository, f.service, usage, options.production);
  const source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  const input = { requestMessageId: request.messageId, sourceArtifact: source.ref, outputLocale };
  const prepare = extra => service.prepare(f.ids.org, f.ids.actor, thread, request, { ...input, ...extra });
  const native = (id, value, overrides = {}) => {
    const context = requestContextFor(registry, { ...IDENTITY, organizationId: f.ids.org, userId: f.ids.actor, ...overrides.identity });
    const { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } = require('@mastra/core/request-context');
    context.set(MASTRA_THREAD_ID_KEY, overrides.thread ?? thread);
    context.set(MASTRA_RESOURCE_ID_KEY, `${f.ids.org}:${f.ids.actor}`);
    if (overrides.request !== false) context.set('cf.originalAuthorRequest', JSON.stringify(overrides.authorRequest ?? request));
    if (overrides.workContext) context.set('cf.workContext', JSON.stringify(overrides.workContext));
    const capability = registry.CAPABILITY_CATALOGUE.find(entry => entry.id === id);
    const tool = registry.buildCapabilityTool(capability, { entrance: 'chat', language: 'ru', services: servicesFrom({ NativeClipPreproductionServiceV1: service }) });
    return executeTool(tool, value, { requestContext: context });
  };
  const parent = () => [...f.tables.socialFactoryRecord.values()][0];
  return { ...f, sourceService: f.service, source, input, service, prepare, native, parent, calls, usageRows, selections, config, repository };
}
const summary = result => { expect(result.output.ok).toBe(true); return result.output.summary.untrustedData.value; };

test.each([false, true])('native read projects production once without contradictory legacy media unavailability (stale=%s)', async stale => {
  const production = {version: 1, outputLocale: 'ru', stages: [], visionReview: null,
    authorization: {state: stale ? 'stale' : 'authorized', unit: 'higgsfield_credit', pilotLimit: '10', includedStages: ['first_frame', 'last_frame', 'clip'], executionApproved: !stale},
    executionApproval: {scope: 'one_pilot', current: !stale, canApprove: false, approved: !stale, preflightId: 'saved-first-preflight', approvalHash: 'a'.repeat(64), bindingHash: 'b'.repeat(64), includedStages: ['first_frame', 'last_frame', 'clip'], laterPricesUnknown: true, providerBillingCap: false}, blockers: []};
  const projection = jest.fn(async () => production), f = await setup({production: {projection}}), prepared = await f.prepare();
  const source = copy(f.parent().payload.source), stages = copy(f.parent().payload.stages);
  if (stale) f.editPost('Source changed after media preparation.');
  projection.mockClear();
  const out = summary(await f.native('video.preproduction_open', {pilotId: prepared.pilotId}));
  expect(out.production).toEqual(production); expect(out).not.toHaveProperty('frames'); expect(out).not.toHaveProperty('video');
  expect(out.sourceCurrent).toBe(!stale); expect(projection).toHaveBeenCalledTimes(1);
  expect(projection.mock.calls[0]).toEqual([f.ids.org, f.ids.actor, prepared.pilotId, f.parent().payload, !stale]);
  expect(f.parent().payload.source).toEqual(source); expect(f.parent().payload.stages).toEqual(stages);
  expect(f.calls).toHaveLength(2); expect(f.usageRows).toHaveLength(2); expect(production.stages).toEqual([]);
});

test('an installed production reader with no production retains only the legacy unavailable media fields', async () => {
  const projection = jest.fn(async () => undefined), f = await setup({production: {projection}}), prepared = await f.prepare();
  projection.mockClear();
  const out = await f.service.open(f.ids.org, f.ids.actor, thread, prepared.pilotId);
  expect(out).not.toHaveProperty('production');
  expect(out.frames).toEqual({state: 'unavailable', reason: 'IMAGE_ROUTE_AND_HIGGSFIELD_PROFILE_PENDING'});
  expect(out.video).toEqual(out.frames); expect(projection).toHaveBeenCalledTimes(1); expect(f.calls).toHaveLength(2);
});

test('registered native tool prepares and reopens exact owned RU source with English directions and distinct actual models', async () => {
  const f = await setup(), originalPost = copy(f.post), originalCore = copy(f.piece);
  const result = await f.native('video.preproduction', f.input), out = summary(result);
  expect(out.executionModeV2).toEqual({version: 2, mode: 'review', canChange: true});
  expect(f.parent().payload.executionModeV2).toEqual({version: 2, mode: 'review'});
  expect(out).toMatchObject({ state: 'reviewed', independentReviewAccepted: true, contentOperations: 2, reviewCount: 1, sourceArtifact: f.source.ref, scenario: scenario(), frames: { state: 'unavailable' }, video: { state: 'unavailable' } });
  expect(out.models.map(model => model.actual)).toEqual(['openai/gpt-6.1-sol', 'openai/gpt-6.1-terra']);
  expect(f.selections.map(value => value.modelId)).toEqual(['openai/gpt-6.1-sol', 'openai/gpt-6.1-terra']);
  expect(f.parent().payload.request).toEqual(request);
  expect(f.calls[0].input.source.text).toBe(f.source.text); expect(f.calls[0].input.originalRequest).toBe(request.text);
  expect(f.usageRows).toHaveLength(2); expect(f.usageRows.every(row => row.status === 'succeeded' && row.userId === f.ids.actor && row.costUsd === 0.01)).toBe(true);
  expect(result.parts).toContainEqual({ type: 'data-clip-preproduction', data: { kind: 'clip-preproduction', id: out.pilotId, pieceId: f.ids.piece, threadId: thread } });
  expect(JSON.stringify(out)).not.toContain('admissionId');
  expect(summary(await f.native('video.preproduction_open', { pilotId: out.pilotId }))).toEqual(out);
  expect(await f.prepare()).toEqual(out); expect(f.calls).toHaveLength(2);
  expect(f.tables.videoPromptDraft.size).toBe(0); expect(f.post).toEqual(originalPost); expect(f.piece).toEqual(originalCore);
});

test('one targeted fix and two critiques are the absolute scenario bound even on non-accept', async () => {
  const f = await setup({ revise: true }), out = await f.prepare();
  expect(out).toMatchObject({ state: 'needs_input', contentOperations: 4, reviewCount: 2, independentReviewAccepted: false });
  expect(f.calls.map(call => call.role)).toEqual(['author', 'critic', 'author', 'critic']);
  expect(f.calls[2].input.critique.findings[0].detail).toBe('Slow the push-in.');
  expect(f.calls[3].input.scenarioDigest).not.toBe(f.calls[1].input.scenarioDigest);
  await f.prepare(); expect(f.calls).toHaveLength(4); expect(f.usageRows).toHaveLength(4);
});

test.each([{ actual: null }, { actual: 'openai/gpt-6.1-sol' }])('unknown or same actual critic cannot yield independent acceptance (%j)', async options => {
  const f = await setup(options), out = await f.prepare();
  expect(out.independentReviewAccepted).toBe(false); expect(out.state).toBe('needs_input');
  expect(f.parent().payload.stages.every(stage => stage.state === 'captured')).toBe(true);
  expect(f.calls.length).toBe(options.actual === null ? 1 : 2);
  await f.prepare(); expect(f.calls.length).toBe(options.actual === null ? 1 : 2);
});

test('lost response retains unknown paid claim; same or fresh request never silently buys a replacement', async () => {
  const f = await setup({ throwAt: 0 }), out = await f.prepare();
  expect(out).toMatchObject({ state: 'uncertain', contentOperations: 1, independentReviewAccepted: false });
  expect(f.parent().payload.stages[0].state).toBe('unknown');
  expect(f.usageRows[0].costUsd).toBeUndefined();
  await f.prepare(); expect(f.calls).toHaveLength(1);
  const fresh = { messageId: 'another-request', text: request.text };
  await rejectsCode(f.service.prepare(f.ids.org, f.ids.actor, thread, fresh, { ...f.input, requestMessageId: fresh.messageId }), 'CLIP_PREVIOUS_OPERATION_UNKNOWN');
  expect(f.calls).toHaveLength(1);
});

test('malformed paid raw response is checkpointed before JSON validation and retained without retry', async () => {
  const f = await setup({ raw: '{incomplete' }), out = await f.prepare();
  expect(out).toMatchObject({ state: 'needs_input', contentOperations: 1, independentReviewAccepted: false });
  expect(f.parent().payload.stages[0]).toMatchObject({ state: 'captured', raw: '{incomplete' });
  expect(f.usageRows[0].status).toBe('failed');
  await f.prepare(); expect(f.calls).toHaveLength(1);
});

test('editing the source during inference retains the purchased raw result but stops the next model', async () => {
  const f = await setup({ onCall: ({ f }) => f.editPost('Изменённый исходник.') }), out = await f.prepare();
  expect(out).toMatchObject({ state: 'needs_input', blocker: 'SOURCE_ARTIFACT_STALE', sourceCurrent: false, independentReviewAccepted: false });
  expect(f.parent().payload.stages[0].raw).toBe(JSON.stringify(scenario()));
  expect(f.calls).toHaveLength(1); await f.prepare(); expect(f.calls).toHaveLength(1);
});

test('later source edit invalidates a saved acceptance and cannot reset the pin under the same request', async () => {
  const f = await setup(), out = await f.prepare(); f.editPost('Новая версия.');
  expect(await f.service.open(f.ids.org, f.ids.actor, thread, out.pilotId)).toMatchObject({ state: 'needs_input', sourceCurrent: false, independentReviewAccepted: false });
  const changed = await f.sourceService.resolve(f.ids.org, f.ids.actor, f.selection);
  await rejectsCode(f.prepare({ sourceArtifact: changed.ref }), 'CLIP_PREPRODUCTION_INPUT_CHANGED'); expect(f.calls).toHaveLength(2);
});

test.each([{ unknownFacts: ['Exact event date'] }, { rightsConflicts: ['Unknown image reuse rights'] }, { outputLocale: 'en' }, { claims: [{ text: '50,000 people', sourceQuote: 'not in source' }] }])('final acceptance cannot clear author facts/rights/locale/source quotes even when critic says accept (%j)', async scenario => {
  const f = await setup({ scenario }), out = await f.prepare();
  expect(out).toMatchObject({ state: 'needs_input', blocker: 'CLIP_FACT_RIGHTS_OR_LANGUAGE_BLOCKED', independentReviewAccepted: false }); expect(f.calls).toHaveLength(2);
});

test('essential blocked rights and forged scenario hashes stop without another author call', async () => {
  for (const review of [{ verdict: 'blocked', findings: [{ category: 'rights', detail: 'Need permission for the actually used asset.' }] }, { scenarioDigest: 'a'.repeat(64) }]) {
    const f = await setup({ review }), out = await f.prepare();
    expect(out).toMatchObject({ state: 'needs_input', independentReviewAccepted: false }); expect(f.calls).toHaveLength(2);
  }
});

test('foreign actor/org/thread, missing author proof and stale source fail before a new model', async () => {
  const f = await setup(), out = await f.prepare();
  await rejectsCode(f.service.open(f.ids.org, f.ids.otherActor, thread, out.pilotId), 'CLIP_PREPRODUCTION_ACCESS_DENIED');
  await rejectsCode(f.service.open('foreign-org', f.ids.actor, thread, out.pilotId), 'CLIP_PREPRODUCTION_NOT_FOUND');
  await rejectsCode(f.service.open(f.ids.org, f.ids.actor, 'other-thread', out.pilotId), 'CLIP_PREPRODUCTION_ACCESS_DENIED');
  const fresh = await setup(); fresh.editPost('Stale source');
  await expect(fresh.prepare()).rejects.toMatchObject({ response: { code: 'SOURCE_ARTIFACT_STALE' } }); expect(fresh.calls).toHaveLength(0);
  const denied = await fresh.native('video.preproduction', fresh.input, { request: false }); expect(denied.output.ok).toBe(false); expect(fresh.calls).toHaveLength(0);
});

test('concurrent replay observes the started claim without submitting another call', async () => {
  const entered = deferred(), release = deferred();
  const f = await setup({ onCall: async ({ index }) => { if (index === 0) { entered.resolve(); await release.promise; } } });
  const running = f.prepare(); await entered.promise;
  const replay = await f.prepare(); expect(replay.contentOperations).toBe(1); expect(f.calls).toHaveLength(1);
  release.resolve(); expect((await running).state).toBe('reviewed'); expect(f.calls).toHaveLength(2);
});

test.each([false, true])('captured response recovered after process loss is applied or blocked without repurchase (invalid=%j)', async invalid => {
  const f = await setup(), id = identity('clip_preproduction', f.ids.org, f.ids.actor, thread, request.messageId);
  const inputDigest = digest({ originalRequest: request.text, source: f.source, outputLocale: 'ru', sourceDigest: f.source.contentDigest });
  // Seed the exact durable checkpoint left by a process ending after capture.
  await f.repository.put({ organizationId: f.ids.org, kind: 'video_composition', id, parentId: f.ids.piece, expectedRevision: 0, payload: {
    type: 'native_clip_preproduction', version: 1, actorId: f.ids.actor, threadId: thread, request, source: f.source, outputLocale: 'ru',
    policy: { author: 'openai/gpt-6.1-sol', critic: 'openai/gpt-6.1-terra', provider: 'openrouter' }, state: 'preparing',
    stages: [{ kind: 'author', state: 'captured', inputDigest, raw: invalid ? '{malformed' : JSON.stringify(scenario()), audit: { selectedModel: 'openai/gpt-6.1-sol', actualModel: 'openai/gpt-6.1-sol', modelProvenance: 'provider_response', providerReportedModels: ['openai/gpt-6.1-sol'], provider: 'openrouter', admissionId: 'previously-captured-admission', inputDigest } }],
  } });
  const reopened = await f.prepare();
  expect(reopened.pilotId).toBe(id); expect(reopened.state).toBe(invalid ? 'needs_input' : 'reviewed');
  expect(f.calls.map(call => call.role)).toEqual(invalid ? [] : ['critic']); expect(f.usageRows).toHaveLength(invalid ? 0 : 1);
});

test('identical configured author/critic policy is refused before admission', async () => {
  const f = await setup({ config: { roleModels: {draft: 'google/gemini-4-argon', review: 'google/gemini-4-argon'} } });
  await rejectsCode(f.prepare(), 'CLIP_DISTINCT_MODEL_POLICY_REQUIRED'); expect(f.usageRows).toHaveLength(0); expect(f.calls).toHaveLength(0);
});

test('fresh message id with identical authored request/source reuses the completed parent without new inference', async () => {
  const f = await setup(), out = await f.prepare(), repeated = { ...request, messageId: 'new-id-same-request' };
  const reused = await f.service.prepare(f.ids.org, f.ids.actor, thread, repeated, { ...f.input, requestMessageId: repeated.messageId });
  expect(reused.pilotId).toBe(out.pilotId); expect(f.calls).toHaveLength(2); expect(f.tables.socialFactoryRecord.size).toBe(1);
});

const constructors = new Proxy({}, { get: (_object, key) => {
  if (key === 'AuthorizationActions' || key === 'Sections') return new Proxy({}, { get: (_object, key) => key });
  if (['CheckPolicies', 'GetOrgFromRequest', 'GetUserFromRequest'].includes(key)) return () => () => {};
  return token;
} });
const originals = loadTypeScriptModule(base + 'chat/capabilities/original-author-request.ts', { '../conductor/agent-threads.service': { AgentThreadsService: token } });
const clipContracts = loadTypeScriptModule(base + 'content-intelligence/social-factory/contracts/native-clip-preproduction.v1.ts');
const { SocialFactoryController } = loadTypeScriptModule('apps/backend/src/api/routes/social-factory.controller.ts', {}, { resolve(imported) {
  if (imported === 'zod' || imported === '@nestjs/common' || imported === '@mastra/core/request-context') return undefined;
  if (imported.endsWith('/original-author-request')) return originals;
  if (imported.endsWith('/contracts/native-clip-preproduction.v1')) return clipContracts;
  return constructors;
} });

test('actual HTTP entrance resolves native user signals and reaches the real saved source/admission service', async () => {
  const f = await setup(), controller = Object.create(SocialFactoryController.prototype);
  const signal = { id: request.messageId, threadId: thread, resourceId: `${f.ids.org}:${f.ids.actor}`, role: 'signal', content: { content: request.text, metadata: { signal: { type: 'user' } } } };
  controller.clips = f.service;
  const clipThreads = { readMessages: jest.fn(async () => ({ messages: [signal] })), ownThread: async () => ({ id: thread }) };
  controller.clipModuleRef = { get: () => clipThreads };
  const org = { id: f.ids.org }, user = { id: f.ids.actor };
  const out = await controller.preproduceClip(org, user, { ...f.input, threadId: thread });
  expect(out.state).toBe('reviewed'); expect(f.parent().payload.request).toEqual(request);
  expect(clipThreads.readMessages).toHaveBeenCalledWith({ organizationId: org.id, userId: user.id }, thread, { page: 0, perPage: 200 });
  expect((await controller.openClipPreproduction(org, user, { pilotId: out.pilotId, threadId: thread })).pilotId).toBe(out.pilotId);
  expect((await controller.resumeClipPreproductionReview(org, user, { pilotId: out.pilotId, threadId: thread })).pilotId).toBe(out.pilotId);
  clipThreads.ownThread = async () => null;
  await rejectsCode(controller.openClipPreproduction(org, user, { pilotId: out.pilotId, threadId: thread }), 'CLIP_OWNED_CHAT_REQUIRED');
  await rejectsCode(controller.resumeClipPreproductionReview(org, user, { pilotId: out.pilotId, threadId: thread }), 'CLIP_OWNED_CHAT_REQUIRED');
  for (const message of [{ ...signal, role: 'assistant' }, { ...signal, resourceId: 'foreign-resource' }, { ...signal, content: { content: request.text, metadata: { signal: { type: 'tool' } } } }]) {
    clipThreads.readMessages.mockResolvedValue({ messages: [message] });
    await rejectsCode(controller.preproduceClip(org, user, { ...f.input, threadId: thread }), 'CLIP_ORIGINAL_REQUEST_REQUIRED');
  }
  await expect(controller.preproduceClip(org, user, { ...f.input, threadId: thread, organizationId: 'injected' })).rejects.toMatchObject({ response: { code: 'SOCIAL_FACTORY_INVALID_INPUT' } });
  expect(f.calls).toHaveLength(2);
});

const legacyFlags = {
  screenText: 'Example Summit 2026\\nDubai',
  unknownFacts: ['Previously saved research was not supplied here.', 'Higgsfield availability is unconfirmed.', 'Independent review and persistence have not been established.'],
  rightsConflicts: ['No cleared footage, logos, portraits or music were supplied; this abstract scenario excludes those assets.'],
};
async function seedBlockedAuthor(f, changes = {}) {
  const id = identity('clip_preproduction', f.ids.org, f.ids.actor, thread, request.messageId);
  const inputDigest = digest({ originalRequest: request.text, source: f.source, outputLocale: f.input.outputLocale, sourceDigest: f.source.contentDigest });
  const payload = { type: 'native_clip_preproduction', version: 1, actorId: f.ids.actor, threadId: thread, request, source: f.source, outputLocale: f.input.outputLocale,
    policy: { author: 'openai/gpt-6.1-sol', critic: 'openai/gpt-6.1-terra', provider: 'openrouter' }, state: 'needs_input', blocker: 'CLIP_FACT_RIGHTS_OR_LANGUAGE_BLOCKED',
    stages: [{ kind: 'author', state: 'captured', inputDigest, raw: JSON.stringify({ ...scenario(), outputLocale: f.input.outputLocale, ...legacyFlags }), audit: { selectedModel: 'openai/gpt-6.1-sol', actualModel: 'openai/gpt-6.1-sol', modelProvenance: 'provider_response', providerReportedModels: ['openai/gpt-6.1-sol'], provider: 'openrouter', admissionId: 'retained-paid-author', inputDigest } }], ...changes };
  await f.repository.put({ organizationId: f.ids.org, kind: 'video_composition', id, parentId: f.ids.piece, expectedRevision: 0, payload });
  return id;
}

test('valid author flags reach the independent critic while acceptance keeps unresolved facts/rights strictly blocked', async () => {
  const f = await setup({ scenario: legacyFlags, review: { verdict: 'blocked', findings: [{ category: 'facts', detail: 'A genuinely required event claim is still unsupported.' }] } });
  const out = await f.prepare();
  expect(f.calls.map(call => call.role)).toEqual(['author', 'critic']);
  expect(out).toMatchObject({ state: 'needs_input', independentReviewAccepted: false, reviewCount: 1 });
  expect(f.calls[1].input.scenario.unknownFacts).toEqual(legacyFlags.unknownFacts);
  expect(f.calls[1].input.source.text).toBe(f.source.text);
});

test('facts/rights revision findings permit only one actual author fix before a strict different-model final review', async () => {
  const f = await setup({ scenario: ({ index }) => index === 0 ? legacyFlags : {}, review: ({ index }) => index === 1
    ? { verdict: 'revise', findings: [{ category: 'rights', detail: 'Remove flags for explicitly excluded assets; do not invent clearance.' }, { category: 'language', detail: 'Correct the literal backslash-n public copy.' }] }
    : { verdict: 'accept', findings: [] } });
  const out = await f.prepare();
  expect(out).toMatchObject({ state: 'reviewed', independentReviewAccepted: true, contentOperations: 4, reviewCount: 2 });
  expect(f.calls.map(call => call.role)).toEqual(['author', 'critic', 'author', 'critic']);
  expect(JSON.parse(f.parent().payload.stages[0].raw)).toMatchObject(legacyFlags);
  expect(f.calls[2].input.critique.findings[0].category).toBe('rights');
  await f.prepare(); expect(f.calls).toHaveLength(4);
});

test('explicit registered captured-author resume preserves EN output/RU source/raw/request and buys critic before any targeted fix', async () => {
  const f = await setup({ outputLocale: 'en', review: ({ index }) => index === 0
    ? { verdict: 'revise', findings: [{ category: 'facts', detail: 'Source text already supplies the used facts; remove future workflow status from unknownFacts.' }] }
    : { verdict: 'accept', findings: [] } });
  const id = await seedBlockedAuthor(f), before = copy(f.parent().payload);
  expect((await f.service.open(f.ids.org, f.ids.actor, thread, id)).state).toBe('needs_input'); expect(f.calls).toHaveLength(0);
  const out = summary(await f.native('video.preproduction_resume_review', {pilotId: id}));
  expect(out).toMatchObject({ state: 'reviewed', independentReviewAccepted: true, contentOperations: 4, reviewCount: 2, outputLocale: 'en' });
  expect(f.calls.map(call => call.role)).toEqual(['critic', 'author', 'critic']);
  expect(f.parent().payload.stages[0]).toEqual(before.stages[0]); expect(f.parent().payload.request).toEqual(before.request); expect(f.parent().payload.source).toEqual(before.source);
  expect(f.parent().payload.source.locale).toBe('ru'); expect(out.scenario.screenText).toBe('MegaCampus Summit — Dubai');
  await f.service.resumeReview(f.ids.org, f.ids.actor, thread, id); expect(f.calls).toHaveLength(3);
});

test('resume refuses foreign owner, stale source, changed policy and mismatched captured provenance before inference', async () => {
  const owner = await setup(), ownerId = await seedBlockedAuthor(owner);
  await rejectsCode(owner.service.resumeReview(owner.ids.org, owner.ids.otherActor, thread, ownerId), 'CLIP_PREPRODUCTION_ACCESS_DENIED');
  await rejectsCode(owner.service.resumeReview(owner.ids.org, owner.ids.actor, 'foreign-thread', ownerId), 'CLIP_PREPRODUCTION_ACCESS_DENIED');
  expect(owner.calls).toHaveLength(0);
  const stale = await setup(), staleId = await seedBlockedAuthor(stale); stale.editPost('Changed source');
  await rejectsCode(stale.service.resumeReview(stale.ids.org, stale.ids.actor, thread, staleId), 'SOURCE_ARTIFACT_STALE'); expect(stale.calls).toHaveLength(0);
  const policy = await setup(), policyId = await seedBlockedAuthor(policy); policy.config.provider = 'openai';
  await rejectsCode(policy.service.resumeReview(policy.ids.org, policy.ids.actor, thread, policyId), 'CLIP_MODEL_POLICY_CHANGED'); expect(policy.calls).toHaveLength(0);
  for (const [tamper, code] of [
    [p => { delete p.stages[0].audit.actualModel; }, 'CLIP_ACTUAL_MODEL_UNVERIFIED'],
    [p => { p.stages[0].inputDigest = '0'.repeat(64); }, 'CLIP_REVIEW_RESUME_BINDING_INVALID'],
  ]) {
    const f = await setup(), id = await seedBlockedAuthor(f); tamper(f.parent().payload);
    await rejectsCode(f.service.resumeReview(f.ids.org, f.ids.actor, thread, id), code); expect(f.calls).toHaveLength(0); expect(f.parent().payload.reviewResume).toBeUndefined();
  }
});

test('started, unknown, malformed and unrelated blocked parents cannot be reset by the review-resume entrance', async () => {
  for (const state of ['started', 'unknown']) {
    const f = await setup(), id = await seedBlockedAuthor(f), p = f.parent().payload;
    p.stages[0].state = state; p.state = 'uncertain'; const before = copy(p);
    const out = await f.service.resumeReview(f.ids.org, f.ids.actor, thread, id);
    expect(out.independentReviewAccepted).toBe(false); expect(f.calls).toHaveLength(0); expect(f.parent().payload).toEqual(before);
  }
  const malformed = await setup(), badId = await seedBlockedAuthor(malformed); malformed.parent().payload.stages[0].raw = '{malformed';
  await expect(malformed.service.resumeReview(malformed.ids.org, malformed.ids.actor, thread, badId)).rejects.toThrow(); expect(malformed.calls).toHaveLength(0);
  const other = await setup(), otherId = await seedBlockedAuthor(other, {blocker: 'CLIP_REVIEW_BLOCKED'});
  await other.service.resumeReview(other.ids.org, other.ids.actor, thread, otherId); expect(other.calls).toHaveLength(0); expect(other.parent().payload.reviewResume).toBeUndefined();
});

test('concurrent explicit resume claims one critic and never repurchases the initial captured author', async () => {
  const entered = deferred(), release = deferred();
  const f = await setup({ onCall: async ({ index }) => { if (!index) { entered.resolve(); await release.promise; } }, review: ({ index }) => !index
    ? {verdict: 'revise', findings: [{category: 'facts', detail: 'Remove misplaced workflow flags.'}]} : {verdict: 'accept', findings: []} });
  const id = await seedBlockedAuthor(f);
  const running = f.service.resumeReview(f.ids.org, f.ids.actor, thread, id); await entered.promise;
  await f.service.resumeReview(f.ids.org, f.ids.actor, thread, id); expect(f.calls.map(c => c.role)).toEqual(['critic']);
  release.resolve(); expect((await running).independentReviewAccepted).toBe(true);
  expect(f.calls.map(c => c.role)).toEqual(['critic', 'author', 'critic']);
});

test('saved resume checkpoint after process loss continues once and preserves a genuine critic blocker on replay', async () => {
  const f = await setup({ review: {verdict: 'blocked', findings: [{category: 'rights', detail: 'The essential used portrait has no supplied permission.'}]} });
  const id = await seedBlockedAuthor(f), before = copy(f.parent().payload.stages[0]);
  f.parent().payload.reviewResume = {version: 1, authorInputDigest: before.inputDigest};
  f.parent().payload.state = 'preparing'; delete f.parent().payload.blocker;
  const out = await f.service.resumeReview(f.ids.org, f.ids.actor, thread, id);
  expect(out).toMatchObject({state: 'needs_input', blocker: 'CLIP_REVIEW_BLOCKED', independentReviewAccepted: false});
  expect(f.calls.map(c => c.role)).toEqual(['critic']); expect(f.parent().payload.stages[0]).toEqual(before);
  const saved = copy(f.parent().payload);
  await f.service.resumeReview(f.ids.org, f.ids.actor, thread, id);
  expect(f.calls).toHaveLength(1); expect(f.parent().payload).toEqual(saved);
});


test.each([
  ['google/gemini-4-argon', 'google/gemini-3.8-flash'],
  ['vendor/selected-author', 'vendor/selected-critic'],
])('configured distinct draft/review roles select %s and %s without a fixed model pair', async (author, critic) => {
  const f = await setup({config: {roleModels: {draft: author, review: critic, agent: author}}});
  const out = await f.prepare();
  expect(out.state).toBe('reviewed');
  expect(f.selections.map(call => [call.role, call.modelId])).toEqual([['draft', author], ['review', critic]]);
  expect(f.calls.map(call => call.selected)).toEqual([author, critic]);
  expect(f.parent().payload.policy).toEqual({author, critic, provider: 'openrouter'});
  expect(f.parent().payload.stages.map(stage => stage.audit.actualModel)).toEqual([author, critic]);
  const {binding} = require('./helpers/native-clip-production.fixture.cjs');
  expect(binding.clipAcceptedTextV1(f.parent().payload).scenario).toEqual(scenario());
});

test('changing configurable defaults preserves a completed legacy pilot and paid media checkpoint without new inference', async () => {
  const f = await setup(), prepared = await f.prepare(), row = f.parent();
  await f.repository.put({...row, expectedRevision: row.revision, payload: {...row.payload, production: {version: 1, stages: [{kind: 'first_frame', state: 'captured', mediaId: 'already-owned-first'}, {kind: 'last_frame', state: 'captured', mediaId: 'already-owned-last'}], lastFrameRepair: {id: 'saved-repair', state: 'quoted'}}}});
  const before = copy(f.parent());
  f.config.textModel = 'google/gemini-4-argon';
  f.config.roleModels = {draft: 'google/gemini-4-argon', agent: 'google/gemini-4-argon', review: 'google/gemini-3.8-flash', judge: 'google/gemini-3.8-flash'};
  expect((await f.service.open(f.ids.org, f.ids.actor, thread, prepared.pilotId)).pilotId).toBe(prepared.pilotId);
  expect((await f.prepare()).pilotId).toBe(prepared.pilotId);
  expect(f.parent()).toEqual(before);
  expect(f.calls).toHaveLength(2); expect(f.usageRows).toHaveLength(2);
  expect(f.parent().payload.policy).toEqual({author: 'openai/gpt-6.1-sol', critic: 'openai/gpt-6.1-terra', provider: 'openrouter'});
});

test('authored linked scenario revision creates a new review-only parent and preserves paid history and previous acceptance', async () => {
  const f = await setup({scenario: ({input}) => input.revisionV2 ? {...scenario(), motionDirections: 'NEW precise motion requested by the person.'} : scenario()});
  const old = await f.prepare(), before = copy(f.parent().payload);
  const request2 = {messageId:'actual-revision-request',text:'Keep the announcement and exact facts. Change the motion to one careful reveal.'};
  const child = await f.service.reviseV2(f.ids.org,f.ids.actor,thread,request2,{pilotId:old.pilotId,requestMessageId:request2.messageId,scope:'scenario'});
  expect(child.pilotId).not.toBe(old.pilotId);expect(child.revisionV2).toMatchObject({parentPilotId:old.pilotId,scope:'scenario'});
  expect(child.executionModeV2).toEqual({version:2,mode:'review',canChange:true});expect(child.production).toBeUndefined();
  expect(child.scenario.motionDirections).toContain('NEW precise motion');expect(f.parent().payload).toEqual(before);
  const calls=f.calls.length;expect(await f.service.reviseV2(f.ids.org,f.ids.actor,thread,request2,{pilotId:old.pilotId,requestMessageId:request2.messageId,scope:'scenario'})).toEqual(child);expect(f.calls).toHaveLength(calls);
  expect(f.calls[2].input.revisionV2).toMatchObject({scope:'scenario',originalRequest:request,previousScenario:scenario()});
});
test('reference-only revision preserves exact public copy/claims and explicitly creates a new image pair after its own approvals', async () => {
  const f=await setup({scenario:({input})=>input.revisionV2?{...scenario(),firstFrameDirections:'New first reference.',lastFrameDirections:'New last reference.'}:scenario()});
  const old=await f.prepare(),r={messageId:'reference-revision-request',text:'Replace both reference visuals, keeping all public copy.'};
  const child=await f.service.reviseV2(f.ids.org,f.ids.actor,thread,r,{pilotId:old.pilotId,requestMessageId:r.messageId,scope:'references'});
  expect(child.scenario.screenText).toBe(old.scenario.screenText);expect(child.scenario.claims).toEqual(old.scenario.claims);
  expect(child.revisionV2).toMatchObject({scope:'references',newImagePair:true});expect(child.production).toBeUndefined();
  const row=[...f.tables.socialFactoryRecord.values()].find(row=>row.id===child.pilotId);
  expect(require('./helpers/native-clip-production.fixture.cjs').binding.clipAcceptedTextV1(row.payload).scenario).toEqual(child.scenario);
});
test('a reference-only model rewrite of public copy is blocked before any media work', async () => {
  const f=await setup({scenario:({input})=>input.revisionV2?{...scenario(),screenText:'UNAPPROVED PUBLIC REWRITE'}:scenario()});const old=await f.prepare();
  const r={messageId:'bad-reference-revision',text:'Change only the reference visuals.'};const child=await f.service.reviseV2(f.ids.org,f.ids.actor,thread,r,{pilotId:old.pilotId,requestMessageId:r.messageId,scope:'references'});
  expect(child.state).toBe('needs_input');expect(child.blocker).toBe('CLIP_REFERENCE_COPY_CHANGED');expect(child.production).toBeUndefined();
});
test('revision cannot bypass unknown original text work or a foreign original chat', async () => {
  const f=await setup(),old=await f.prepare(),r={messageId:'new-revision',text:'Create a corrected scenario.'};
  f.parent().payload.stages[0].state='unknown';const count=f.calls.length;
  await rejectsCode(f.service.reviseV2(f.ids.org,f.ids.actor,thread,r,{pilotId:old.pilotId,requestMessageId:r.messageId,scope:'scenario'}),'CLIP_PREVIOUS_OPERATION_UNKNOWN');
  await rejectsCode(f.service.reviseV2(f.ids.org,f.ids.actor,'foreign-chat',r,{pilotId:old.pilotId,requestMessageId:r.messageId,scope:'scenario'}),'CLIP_PREPRODUCTION_ACCESS_DENIED');expect(f.calls).toHaveLength(count);
});
test('registered revision capability uses actual new authored correction and refuses a different selected pilot before spending', async () => {
  const f=await setup(),old=await f.prepare(),r={messageId:'new-owned-correction',text:'Keep the source and make the motion more concrete.'};
  const selected={context:{version:'assistant-work-context/v1',kind:'piece',id:f.ids.piece,clipPilotId:old.pilotId},data:{nativeClip:{pilotId:old.pilotId}}};
  const input={pilotId:old.pilotId,requestMessageId:r.messageId,scope:'scenario'};
  const child=summary(await f.native('video.preproduction_revise_v2',input,{authorRequest:r,workContext:selected}));
  expect(child.revisionV2.parentPilotId).toBe(old.pilotId);expect(child.production).toBeUndefined();
  const calls=f.calls.length;
  const refused=await f.native('video.preproduction_revise_v2',{...input,pilotId:'other-pilot'},{authorRequest:r,workContext:selected});
  expect(refused.output.ok).toBe(false);expect(f.calls).toHaveLength(calls);
});

test('revision cannot sidestep active or unknown paid work in a linked child by selecting its older parent', async () => {
  const projection=jest.fn(async(_o,_a,_id,p)=>p.production?{stages:[{jobId:'retained-job',state:'submission_unknown'}]}:undefined),f=await setup({production:{projection}});
  const old=await f.prepare(),r={messageId:'first-revision',text:'Refine the visual motion.'};
  const child=await f.service.reviseV2(f.ids.org,f.ids.actor,thread,r,{pilotId:old.pilotId,requestMessageId:r.messageId,scope:'scenario'});
  const childRow=[...f.tables.socialFactoryRecord.values()].find(row=>row.id===child.pilotId);childRow.payload.production={settledEvents:[]};
  const before=copy(childRow.payload),calls=f.calls.length,again={messageId:'attempt-another-revision',text:'Another revision from the older root.'};
  await rejectsCode(f.service.reviseV2(f.ids.org,f.ids.actor,thread,again,{pilotId:old.pilotId,requestMessageId:again.messageId,scope:'scenario'}),'CLIP_PREVIOUS_OPERATION_UNKNOWN');
  expect(childRow.payload).toEqual(before);expect(f.calls).toHaveLength(calls);
});
