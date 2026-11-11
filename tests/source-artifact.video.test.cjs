const { randomUUID } = require('node:crypto');
const { fixture, loadTypeScriptModule, base, copy } = require('./helpers/source-artifact.fixture.cjs');
const { IDENTITY, loadRegistry, servicesFrom, executeTool, requestContextFor } = require('./helpers/agent-capabilities.cjs');
const registry = loadRegistry();
const nativeVideo = async (f, id, input, identity = {}) => {
  const capability = registry.CAPABILITY_CATALOGUE.find(entry => entry.id === id);
  const tool = registry.buildCapabilityTool(capability, { entrance: 'chat', language: 'ru', services: servicesFrom({ VideoJobService: f.videos }) });
  return executeTool(tool, input, { requestContext: requestContextFor(registry, { ...IDENTITY, organizationId: f.ids.org, userId: f.ids.actor, ...identity }) });
};
const nativeSummary = result => result.output.summary.untrustedData.value;
const { VideoGenerationRepository } = loadTypeScriptModule(base + 'database/prisma/video-generation/video-generation.repository.ts');
const briefModule = loadTypeScriptModule(base + 'videos/video-brief.v1.ts');
const token = class {};
const { VideoJobService } = loadTypeScriptModule(base + 'videos/video-job.service.ts', {
  '../openai/ai.usage.service': { AiUsageService: token }, '../openai/ai.clients': { getModelForRole: () => { throw new Error('Model forbidden'); }, getOpenAiClient: () => { throw new Error('Model forbidden'); } },
  '../openai/ai.provider.config': { withoutActiveAiConfig: run => run() }, './video-credentials.service': { VideoCredentialsService: token },
  './providers/higgsfield.provider': { HiggsfieldProviderV1: token }, './providers/heygen.provider': { HeygenProviderV1: token },
  './video-media.v1': { VideoMediaV1: token }, './video-composition.provider.v1': { VideoCompositionProviderV1: token },
});
const { VideoAccessService } = loadTypeScriptModule(base + 'videos/video-access.service.ts', {
  './video-job.service': { VideoJobService: token }, './subscriptions/video-connection.service': { VideoConnectionService: token },
  './subscriptions/video-subscription-job.service': { VideoSubscriptionJobService: token }, './video-media.v1': { VideoMediaV1: token },
});
const { VideoSubscriptionJobService } = loadTypeScriptModule(base + 'videos/subscriptions/video-subscription-job.service.ts', {
  './video-connection.service': { VideoConnectionService: token }, '../providers/higgsfield-subscription.provider': { HiggsfieldSubscriptionProvider: token },
  '../providers/heygen-subscription.provider': { HeygenSubscriptionProvider: token }, '../video-media.v1': { VideoMediaV1: token },
});
const { AgentWorkContextResolver } = loadTypeScriptModule(base + 'chat/conductor/work-context.resolver.ts', {
  '@contentfactory/nestjs-libraries/content-intelligence/social-factory/social-factory.service': { SocialFactoryService: class SocialFactoryService {} },
  '@contentfactory/nestjs-libraries/content-intelligence/social-factory/source-artifact.service': { SourceArtifactServiceV1: class SourceArtifactServiceV1 {} },
  '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service': { PieceService: class PieceService {} },
  '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.repository': { PieceRepository: class PieceRepository {} },
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice.service': { VoiceService: class VoiceService {} },
  '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': { IntegrationService: class IntegrationService {} },
  '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.service': { ContentFactService: class ContentFactService {} },
  '@contentfactory/nestjs-libraries/content-intelligence/leads/content-lead.service': { ContentLeadService: class ContentLeadService {} },
  '@contentfactory/nestjs-libraries/videos/video-job.service': { VideoJobService: class VideoJobService {} },
  '@contentfactory/nestjs-libraries/database/prisma/media/media.service': { MediaService: class MediaService {} },
});
const reject = (promise, code) => expect(promise).rejects.toMatchObject({ response: { code } });

function videoFixture() {
  const f = fixture(), counters = { model: 0, quotes: 0, credentials: 0, dispatch: 0, submit: 0, poll: 0 };
  const repository = new VideoGenerationRepository(f.db);
  const credential = { provider: 'higgsfield', payer: 'workspace_key', reference: 'fixture-credential', maxCostUsd: 2, monthlyBudgetUsd: 100 };
  const provider = { prepare: async input => { counters.quotes++; return { provider: 'higgsfield', endpoint: 'https://fixture.example.invalid/generate', body: { prompt: input.prompt },
    estimate: { usd: 1, upperBoundUsd: 1, source: 'synthetic-quote', expiresAt: new Date(Date.now() + 60000).toISOString() } }; } };
  const credentials = { resolve: async () => { counters.credentials++; return credential; } };
  const usage = { executeAiOperation: async () => { counters.model++; throw new Error('Paid model forbidden'); } };
  const settings = { provider: 'higgsfield', model: 'fixture-clip', mode: 'clip', locale: 'ru', duration: 5, aspectRatio: '9:16', resolution: '720p', audio: false, captions: false };
  const videos = new VideoJobService(repository, credentials, usage, provider, {}, {}, { start: async () => { counters.dispatch++; } }, undefined, f.service);
  const prepare = async extra => { const source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection); return videos.prepare(f.ids.org, f.ids.actor, { pieceId: f.ids.piece, settings, sourceArtifact: source.ref, ...extra }); };
  return { ...f, get post() { return f.post; }, get piece() { return f.piece; }, counters, repository, videos, settings, prepare };
}

test('native selected-post preparation saves and reopens the exact edited adaptation without changing CORE or source', async () => {
  const f = videoFixture();
  f.editPost('<p>Проверяйте ДЕВЯТЬ минут. Не семь.</p>');
  const source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection), originalCore = copy(f.piece), originalPost = copy(f.post);
  const result = await nativeVideo(f, 'video.prepare', { pieceId: f.ids.piece, settings: f.settings, sourceArtifact: source.ref, prepareWithAi: false });
  expect(result.output.ok).toBe(true);
  const draft = nativeSummary(result);
  expect(draft.brief.script).toBe('Проверяйте ДЕВЯТЬ минут. Не семь.');
  expect(draft.brief.sourceArtifact).toEqual(source);
  expect(result.parts).toContainEqual({ type: 'data-media', data: expect.objectContaining({ kind: 'media', id: 'library', videoDraftId: draft.id, pieceId: f.ids.piece, title: expect.stringContaining('Current edited post') }) });
  const reopened = nativeSummary(await nativeVideo(f, 'video.draft', { draftId: draft.id }));
  expect(reopened.brief).toEqual(draft.brief);
  const edited = nativeSummary(await nativeVideo(f, 'video.edit', { draftId: draft.id, version: draft.version, prompt: 'Вертикальный ролик: ' + draft.brief.script }));
  expect(edited.id).toBe(draft.id); expect(edited.version).toBe(2); expect(edited.brief.sourceArtifact).toEqual(source);
  expect(edited.brief.script).toBe(draft.brief.script);
  expect(f.tables.videoPromptDraft.size).toBe(1); expect(f.piece).toEqual(originalCore); expect(f.post).toEqual(originalPost);
  expect(f.counters).toEqual({ model: 0, quotes: 0, credentials: 0, dispatch: 0, submit: 0, poll: 0 });
});

test('native explicit stale, mismatched or forged source never falls back to CORE or reaches model/provider work', async () => {
  const f = videoFixture(), source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  const input = { pieceId: f.ids.piece, settings: f.settings, sourceArtifact: source.ref, prepareWithAi: true };
  f.editPost('Текущая новая версия.');
  await expect(nativeVideo(f, 'video.prepare', input)).resolves.toMatchObject({ output: { ok: false, code: 'SOURCE_ARTIFACT_STALE' } });
  await expect(nativeVideo(f, 'video.prepare', { ...input, pieceId: randomUUID() })).resolves.toMatchObject({ output: { ok: false, code: 'VIDEO_INVALID_INPUT' } });
  const capability = registry.CAPABILITY_CATALOGUE.find(entry => entry.id === 'video.prepare');
  for (const sourceArtifact of [{ ...source.ref, revision: null }, { ...source.ref, actorId: f.ids.otherActor }]) {
    expect(capability.input.safeParse({ ...input, sourceArtifact }).success).toBe(false);
  }
  await expect(nativeVideo(f, 'video.prepare', input, { organizationId: randomUUID() })).resolves.toMatchObject({ output: { ok: false, code: 'VIDEO_PIECE_NOT_FOUND' } });
  expect(f.tables.videoPromptDraft.size).toBe(0);
  expect(f.counters).toEqual({ model: 0, quotes: 0, credentials: 0, dispatch: 0, submit: 0, poll: 0 });
});

test('native omitted and optional-null source retain the legacy CORE choice and default preparation policy', async () => {
  const f = videoFixture(), capability = registry.CAPABILITY_CATALOGUE.find(entry => entry.id === 'video.prepare');
  expect(capability.input.parse({ pieceId: f.ids.piece, settings: f.settings }).prepareWithAi).toBe(true);
  for (const extra of [{}, { sourceArtifact: null }]) {
    const result = await nativeVideo(f, 'video.prepare', { pieceId: f.ids.piece, settings: f.settings, prepareWithAi: false, ...extra });
    expect(result.output.ok).toBe(true);
    expect(nativeSummary(result).brief.script).toBe(f.piece.body);
    expect(nativeSummary(result).brief.sourceArtifact).toBeUndefined();
  }
  expect(f.counters.model).toBe(0); expect(f.counters.quotes).toBe(0);
});

test('video draft grounds facts and script in the current edited post and persists the structured server stamp', async () => {
  const f = videoFixture(), draft = await f.prepare();
  expect(draft.brief.sourceArtifact.text).toBe(f.post.content);
  expect(draft.brief.sourceArtifact.ref.postId).toBe(f.ids.post);
  expect(draft.brief.facts.map(fact => fact.text).join(' ')).toBe('Масса 12,5 кг. Не содержит сахар.');
  expect(draft.brief.script).toBe('Масса 12,5 кг. Не содержит сахар.'); expect(draft.brief.script).not.toContain('10 kg');
  expect(draft.brief.sourceLocale).toBe('ru'); expect(f.counters.model).toBe(0); expect(f.counters.quotes).toBe(0);
  const persisted = await f.repository.draft(f.ids.org, draft.id);
  expect(persisted.brief.sourceArtifact).toEqual(draft.brief.sourceArtifact);
});

test('stale or wrong-piece source fails before any model call or draft write', async () => {
  const f = videoFixture(), source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  f.editPost('Только актуальная правка.');
  await reject(f.videos.prepare(f.ids.org, f.ids.actor, { pieceId: f.ids.piece, settings: f.settings, sourceArtifact: source.ref, prepareWithAi: true }), 'SOURCE_ARTIFACT_STALE');
  await reject(f.videos.prepare(f.ids.org, f.ids.actor, { pieceId: randomUUID(), settings: f.settings, sourceArtifact: source.ref }), 'VIDEO_INVALID_INPUT');
  expect(f.tables.videoPromptDraft.size).toBe(0); expect(f.counters.model).toBe(0); expect(f.counters.quotes).toBe(0);
});

test('inherited source survives another video draft and cannot be rebound or replayed by another actor', async () => {
  const f = videoFixture(), draft = await f.prepare();
  const inherited = await f.videos.prepare(f.ids.org, f.ids.actor, { pieceId: f.ids.piece, settings: f.settings, fromDraftId: draft.id, fromDraftVersion: draft.version });
  expect(inherited.brief.sourceArtifact).toEqual(draft.brief.sourceArtifact);
  await reject(f.videos.prepare(f.ids.org, f.ids.otherActor, { pieceId: f.ids.piece, settings: f.settings, fromDraftId: draft.id, fromDraftVersion: draft.version }), 'SOURCE_ARTIFACT_ACCESS_DENIED');
  const different = await f.service.resolve(f.ids.org, f.ids.actor, { version: 1, kind: 'piece', pieceId: f.ids.piece });
  await reject(f.videos.prepare(f.ids.org, f.ids.actor, { pieceId: f.ids.piece, settings: f.settings, fromDraftId: draft.id, fromDraftVersion: draft.version, sourceArtifact: different.ref }), 'VIDEO_FACT_SOURCE_CHANGED');
  expect(f.tables.videoPromptDraft.size).toBe(2);
});

test('brief edits tolerate JSONB key ordering but cannot remove or rewrite source provenance', async () => {
  const f = videoFixture(), draft = await f.prepare(), original = copy(draft.brief);
  original.sourceArtifact.ref = Object.fromEntries(Object.entries(original.sourceArtifact.ref).reverse());
  expect(briefModule.editVideoBriefV1(original, copy(draft.brief), f.settings).sourceArtifact).toEqual(draft.brief.sourceArtifact);
  const removed = copy(draft.brief); delete removed.sourceArtifact;
  expect(() => briefModule.editVideoBriefV1(original, removed, f.settings)).toThrow();
  const changed = copy(draft.brief); changed.sourceArtifact.actorId = f.ids.otherActor;
  expect(() => briefModule.editVideoBriefV1(original, changed, f.settings)).toThrow();
});

test('post-only edits after draft/preflight block quoting and launch before credentials, new jobs or dispatch', async () => {
  const f = videoFixture(), draft = await f.prepare();
  f.editPost('Новая текущая версия.');
  await reject(f.videos.preflight(f.ids.org, f.ids.actor, draft.id), 'SOURCE_ARTIFACT_STALE');
  expect(f.counters.credentials).toBe(0); expect(f.counters.quotes).toBe(0);
  const current = await f.prepare(), checked = await f.videos.preflight(f.ids.org, f.ids.actor, current.id);
  const counts = copy(f.counters); f.editPost('Ещё одна правка перед запуском.');
  await reject(f.videos.launch(f.ids.org, f.ids.actor, { draftId: current.id, version: current.version, preflightId: checked.preflightId, intentId: randomUUID() }), 'SOURCE_ARTIFACT_STALE');
  expect(f.tables.videoGenerationJob.size).toBe(0); expect(f.counters.credentials).toBe(counts.credentials); expect(f.counters.dispatch).toBe(0);
});

test('atomic draft writer refuses a source changed after the service read', async () => {
  const f = videoFixture(), source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  const input = briefModule.VideoPrepareSchemaV1.parse({ pieceId: f.ids.piece, settings: f.settings, sourceArtifact: source.ref });
  const brief = briefModule.compileVideoBriefV1(f.piece, input, source);
  f.editPost('Изменение между подготовкой и записью.');
  await reject(f.repository.createDraft({ organizationId: f.ids.org, userId: f.ids.actor, pieceId: f.ids.piece, pieceRevision: briefModule.videoSourceRevisionV1(f.piece), brief, settings: f.settings }), 'SOURCE_ARTIFACT_STALE');
  expect(f.tables.videoPromptDraft.size).toBe(0);
});

test('API send-claim transaction checks selected post before accepted becomes submitting', async () => {
  const f = videoFixture(), draft = await f.prepare(), checked = await f.videos.preflight(f.ids.org, f.ids.actor, draft.id);
  const input = { draftId: draft.id, version: draft.version, preflightId: checked.preflightId, intentId: randomUUID() };
  const launched = await f.videos.launch(f.ids.org, f.ids.actor, input), job = f.tables.videoGenerationJob.get(launched.id);
  job.leaseOwner = 'fixture-lease'; job.leaseUntil = new Date(Date.now() + 60000);
  f.editPost('Правка до фактической отправки.');
  await reject(f.repository.write(f.ids.org, job.id, job.leaseOwner, { state: 'submitting', submitAttempts: 1 }), 'SOURCE_ARTIFACT_STALE');
  expect(f.tables.videoGenerationJob.get(job.id).state).toBe('accepted'); expect(f.tables.videoGenerationJob.get(job.id).submitAttempts).toBe(0);
  const existing = f.tables.videoGenerationJob.get(job.id); existing.state = 'submission_unknown'; existing.receipt = { id: 'provider-accepted' };
  const replay = await f.videos.launch(f.ids.org, f.ids.actor, input);
  expect(replay.state).toBe('submission_unknown'); expect(f.tables.videoGenerationJob.get(job.id).receipt).toEqual({ id: 'provider-accepted' });
  await reject(f.videos.launch(f.ids.org, f.ids.otherActor, input), 'SOURCE_ARTIFACT_ACCESS_DENIED');
});

test('a unique-intent recovery path keeps the same source/actor checks and preserves already-spent receipts', async () => {
  const f = videoFixture(), draft = await f.prepare(), checked = await f.videos.preflight(f.ids.org, f.ids.actor, draft.id);
  const launched = await f.videos.launch(f.ids.org, f.ids.actor, { draftId: draft.id, version: draft.version, preflightId: checked.preflightId, intentId: randomUUID() });
  const job = f.tables.videoGenerationJob.get(launched.id), transaction = f.db.$transaction;
  const recover = async userId => {
    let conflict = true;
    f.db.$transaction = async run => { if (conflict) { conflict = false; throw Object.assign(new Error('Synthetic unique-intent race'), { code: 'P2002' }); } return transaction(run); };
    try { return await f.repository.launch({ ...job, userId }, 100); } finally { f.db.$transaction = transaction; }
  };
  f.editPost('Новый текст после первой записи задания.');
  await reject(recover(f.ids.actor), 'SOURCE_ARTIFACT_STALE');
  f.tables.videoGenerationJob.get(job.id).state = 'queued'; f.tables.videoGenerationJob.get(job.id).receipt = { id: 'accepted-external-receipt' };
  const existing = await recover(f.ids.actor); expect(existing.receipt).toEqual({ id: 'accepted-external-receipt' });
  await reject(recover(f.ids.otherActor), 'SOURCE_ARTIFACT_ACCESS_DENIED'); expect(f.tables.videoGenerationJob.size).toBe(1);
});

test('personal access facade checks the same source before any token/quote operation', async () => {
  const f = videoFixture(), draft = await f.prepare(); f.editPost('Изменено до личной подписки.');
  const forbidden = new Proxy({}, { get: () => () => { throw new Error('Provider boundary reached'); } });
  const access = new VideoAccessService({ member: async () => {} }, f.repository, f.videos, forbidden, forbidden, {});
  await reject(access.preflight(f.ids.org, f.ids.actor, { draftId: draft.id, version: draft.version, access: { kind: 'subscription', connectionId: randomUUID() } }), 'SOURCE_ARTIFACT_STALE');
  expect(f.tables.videoAccessPreflight.size).toBe(0); expect(f.counters.quotes).toBe(0);
});

test('subscription send CAS blocks changed source; receipt polling remains usable after source changes', async () => {
  const f = videoFixture(), draft = await f.prepare(), connectionId = randomUUID(), now = new Date();
  const request = { tool: 'synthetic-tool', args: {}, schemaDigest: 'a'.repeat(64), quote: { amount: '1', unit: 'higgsfield_credit', upperBound: '1', source: 'synthetic', asOf: now.toISOString(), expiresAt: new Date(now.getTime() + 60000).toISOString() } };
  const job = await f.db.videoSubscriptionJob.create({ data: { organizationId: f.ids.org, actorId: f.ids.actor, pieceId: f.ids.piece, pieceRevision: draft.pieceRevision,
    draftId: draft.id, draftVersion: 1, connectionId, generation: 1, provider: 'higgsfield', unit: 'higgsfield_credit', snapshot: { brief: draft.brief }, request, quote: request.quote, state: 'accepted', statusDeadlineAt: new Date(Date.now() + 60000) } });
  const repository = { db: f.db, transaction: run => f.db.$transaction(run), connection: async () => ({ generation: 1 }) };
  const credential = { token: 'synthetic', connection: { walletDigest: 'b'.repeat(64) }, assertUsable: async () => {} };
  const connections = { token: async () => credential, enabled: async () => ({}) }, runtime = { now: () => new Date(), definition: () => ({}) };
  const provider = { submit: async () => { f.counters.submit++; return { id: 'new-provider-call' }; }, poll: async () => { f.counters.poll++; return { jobId: 'old-provider-receipt', state: 'failed', actualCost: null }; } };
  const worker = new VideoSubscriptionJobService(repository, connections, runtime, { capabilities: async () => ({ digest: request.schemaDigest }) }, provider, {}, {}, f.repository, { start: async () => {} });
  f.editPost('Правка до платной отправки.'); await worker.runStep(f.ids.org, job.id);
  expect(f.counters.submit).toBe(0); expect(f.tables.videoSubscriptionJob.get(job.id)).toMatchObject({ state: 'access_unavailable', errorCode: 'SOURCE_ARTIFACT_STALE', submitAttempts: 0 });
  const stored = f.tables.videoSubscriptionJob.get(job.id); stored.state = 'queued'; stored.receipt = { id: 'old-provider-receipt' };
  f.reads.length = 0; await worker.runStep(f.ids.org, job.id);
  expect(f.counters.poll).toBe(1); expect(f.counters.submit).toBe(0); expect(f.tables.videoSubscriptionJob.get(job.id).receipt).toEqual({ id: 'old-provider-receipt' });
  expect(f.reads.filter(([name]) => ['contentPiece', 'contentDerivation', 'post', 'userOrganization'].includes(name))).toEqual([]);
});

test('selected adaptation context uses the shared reader and keeps browser revision distinct from source revision', async () => {
  const f = fixture(), identity = { organizationId: f.ids.org, userId: f.ids.actor, role: 'EDITOR', language: 'ru' };
  const services = { SourceArtifactServiceV1: f.service, PieceService: { detail: async () => ({ piece: { id: f.ids.piece, title: f.piece.title }, legacyBody: f.piece.body,
    adaptations: [{ id: f.ids.adaptation, integrationId: null, body: f.adaptation.body, state: 'draft' }] }) } };
  const resolver = new AgentWorkContextResolver({ services: token => services[token.name], gate: { check: async () => ({ allowed: true }) }, capabilities: [{ id: 'piece.open', door: {} }] });
  const target = { version: 'assistant-work-context/v1', kind: 'adaptation', pieceId: f.ids.piece, adaptationId: f.ids.adaptation };
  const first = await resolver.resolve(identity, target);
  expect(first.data.currentText).toBe(f.post.content); expect(first.data.sourceArtifact.postId).toBe(f.ids.post);
  expect(first.context.revision).not.toBe(first.data.sourceArtifact.revision);
  f.editPost('Изменено только в выбранном посте.');
  await expect(resolver.resolve(identity, first.context)).rejects.toMatchObject({ status: 409 });
  const refreshed = await resolver.resolve(identity, first.context, { refresh: true }); expect(refreshed.data.currentText).toBe(f.post.content);
});

test('bounded long selected text cannot consume or truncate the authoritative source reference', async () => {
  const f = fixture(); f.post.content = 'Current selected post. '.repeat(700); f.piece.body = 'Long original core. '.repeat(700);
  const identity = { organizationId: f.ids.org, userId: f.ids.actor, role: 'EDITOR', language: 'ru' };
  const services = { SourceArtifactServiceV1: f.service, PieceService: { detail: async () => ({ piece: { id: f.ids.piece, title: f.piece.title }, legacyBody: f.piece.body,
    adaptations: [{ id: f.ids.adaptation, integrationId: null, body: f.adaptation.body, state: 'draft' }] }) } };
  const resolver = new AgentWorkContextResolver({ services: token => services[token.name], gate: { check: async () => ({ allowed: true }) }, capabilities: [{ id: 'piece.open', door: {} }] });
  const result = await resolver.resolve(identity, { version: 'assistant-work-context/v1', kind: 'adaptation', pieceId: f.ids.piece, adaptationId: f.ids.adaptation });
  const actual = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  expect(result.truncated).toBe(true); expect(result.data.sourceArtifact).toEqual(actual.ref);
});
