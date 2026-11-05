'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadRegistry, servicesFrom, requestContextFor, executeTool, IDENTITY } = require('./helpers/agent-capabilities.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence/social-factory/';
const schemas = loadTypeScriptModule(base + 'contracts/social-factory.production.schemas.v1.ts');
const registry = loadRegistry();
const capability = id => registry.CAPABILITY_CATALOGUE.find(row => row.id === id);
const HEYGEN = '11111111-1111-4111-8111-111111111111';
const HIGGSFIELD = '22222222-2222-4222-8222-222222222222';
const PIECE = '33333333-3333-4333-8333-333333333333';
const funding = { kind: 'personal_subscription', connections: { heygen: HEYGEN, higgsfield: HIGGSFIELD }, finalProvider: 'heygen' };
const creditLimits = [{ connectionId: HEYGEN, unit: 'heygen_credit', maxCredits: '10.25' }, { connectionId: HIGGSFIELD, unit: 'higgsfield_credit', maxCredits: '20' }];
const manifest = () => ({ version: 1, pieceId: PIECE, pieceRevision: 'input-source-revision', title: 'Owned video', locale: 'en',
  aspectRatio: '9:16', resolution: '1080p', durationSeconds: 30, audio: true, captions: true,
  scenes: [{ id: 'first', kind: 'presenter', durationSeconds: 30, script: 'A useful public explanation.', avatarId: 'owned-avatar', voiceId: 'owned-voice', engine: 'avatar_iv' }] });
const input = () => ({ manifest: manifest(), intentId: 'personal_binding_intent_01', funding });
const summary = output => output.summary?.untrustedData?.value ?? output.summary;
const native = (id, services) => registry.buildCapabilityTool(capability(id), { entrance: 'chat', language: 'ru', services: servicesFrom(services) });
const run = (id, services, value) => executeTool(native(id, services), capability(id).input.parse(value), { requestContext: requestContextFor(registry) });

test('legacy schemas retain their strict V1 surface while public inputs accept explicit and stored personal funding', () => {
  const old = { manifest: manifest(), intentId: input().intentId };
  expect(schemas.videoRevisionSchema.parse(old).manifest.version).toBe(1);
  expect(schemas.videoRevisionSchema.safeParse(input()).success).toBe(false);
  expect(schemas.videoPreflightSchema.safeParse({ creditLimits }).success).toBe(false);
  expect(schemas.videoRevisionInputSchema.parse(input()).funding).toEqual(funding);
  const stored = { ...old, manifest: { ...manifest(), version: 2, funding } };
  expect(schemas.videoRevisionInputSchema.parse(stored).manifest.funding).toEqual(funding);
  expect(schemas.campaignVideoBindInputSchema.parse({ ...stored, operationId: 'op' }).manifest.version).toBe(2);
  expect(schemas.videoPreflightInputSchema.parse({ creditLimits })).toEqual({ creditLimits });
  expect(schemas.videoPreflightInputSchema.parse({ maxTotalUsd: 3 })).toEqual({ maxTotalUsd: 3 });
  expect(capability('video.production_preflight').input).toBeInstanceOf(require('zod').z.ZodObject);
  for (const value of [{ maxTotalUsd: 3, creditLimits }, {}, { creditLimits: [{ ...creditLimits[0], maxCredits: 2 }] },
    { creditLimits: [{ ...creditLimits[0], unit: 'USD' }] }, { creditLimits: [creditLimits[0], creditLimits[0]] }]) {
    expect(schemas.videoPreflightInputSchema.safeParse(value).success).toBe(false);
  }
});

test('native create/bind preserve funding and actor while selective revision may omit funding for server inheritance', async () => {
  const videos = { createRevision: jest.fn(async value => value) }, production = { bindVideo: jest.fn(async () => ({ id: 'video' })) };
  await run('video.production_create', { VideoProductionService: videos }, input());
  expect(videos.createRevision).toHaveBeenLastCalledWith('org-1', 'user-1', schemas.videoRevisionInputSchema.parse(input()));
  const stored = { ...input(), manifest: { ...manifest(), version: 2, funding } }; delete stored.funding;
  await run('video.production_create', { VideoProductionService: videos }, stored);
  expect(videos.createRevision.mock.calls.at(-1)[2].manifest.funding).toEqual(funding);
  const bind = { ...input(), campaignId: 'campaign', itemId: 'item', operationId: 'op' };
  await run('campaign.bind_video', { SocialFactoryProductionService: production }, bind);
  expect(production.bindVideo).toHaveBeenLastCalledWith('org-1', 'user-1', 'campaign', 'item', capability('campaign.bind_video').input.parse(bind));
  const selective = { ...bind, parentId: 'personal-parent' }; delete selective.funding;
  await run('campaign.bind_video', { SocialFactoryProductionService: production }, selective);
  expect(production.bindVideo.mock.calls.at(-1)[4]).toMatchObject({ parentId: 'personal-parent' });
  expect(production.bindVideo.mock.calls.at(-1)[4]).not.toHaveProperty('funding');
});

test('native preflight forwards complete native-unit limits and rejects mixed budgets before invoking either lane', async () => {
  const videos = { preflight: jest.fn(async (_org, _actor, _id, value) => value) };
  const personal = await run('video.production_preflight', { VideoProductionService: videos }, { productionId: 'personal', creditLimits });
  expect(personal.output.ok).toBe(true); expect(summary(personal.output)).toEqual({ creditLimits });
  expect(videos.preflight).toHaveBeenLastCalledWith('org-1', 'user-1', 'personal', { creditLimits });
  await run('video.production_preflight', { VideoProductionService: videos }, { productionId: 'api', maxTotalUsd: 3 });
  expect(videos.preflight).toHaveBeenLastCalledWith('org-1', 'user-1', 'api', { maxTotalUsd: 3 });
  videos.preflight.mockClear();
  await expect(run('video.production_preflight', { VideoProductionService: videos }, { productionId: 'personal', creditLimits, maxTotalUsd: 99 })).rejects.toThrow();
  expect(videos.preflight).not.toHaveBeenCalled();
});

test('personal native approval names credit limits/quotes and absent provider cap; API keeps its exact USD wording', async () => {
  const row = { id: 'personal', manifest: manifest(), funding: { kind: 'personal_subscription', apiFallback: false },
    approval: { creditLimits, providerBillingCap: false, scenes: [{ provider: 'heygen', quote: { amount: '2.5', unit: 'heygen_credit' } }],
      final: { provider: 'higgsfield', quote: { amount: '3', unit: 'higgsfield_credit' } } } };
  const videos = { get: jest.fn(async () => structuredClone(row)), approveAndLaunch: jest.fn() };
  const args = { productionId: 'personal', approvalId: 'approval', digest: 'a'.repeat(64) };
  const services = servicesFrom({ VideoProductionService: videos });
  expect(native('video.production_launch', { VideoProductionService: videos }).requireApproval(args)).toBe(true);
  const text = await registry.describeApprovalCall(registry.CAPABILITY_CATALOGUE, services, IDENTITY, 'video_production_launch', args);
  expect(text).toContain('10.25 heygen_credit'); expect(text).toContain('20 higgsfield_credit');
  expect(text).toContain('2.5 heygen_credit'); expect(text).toContain('3 higgsfield_credit');
  expect(text).toContain('Провайдер не гарантирует предел списаний'); expect(text).not.toContain('USD');
  expect(videos.get).toHaveBeenLastCalledWith('org-1', 'personal', 'user-1');
  const content = await capability('video.production_launch').approvalContent({ ...IDENTITY, service: services }, args);
  expect(content.approval.providerBillingCap).toBe(false); expect(content.approval.creditLimits).toEqual(creditLimits);
  const before = await registry.approvalContentDigest(registry.CAPABILITY_CATALOGUE, services, IDENTITY, 'video_production_launch', args);
  row.approval.final.quote.amount = '4';
  expect(await registry.approvalContentDigest(registry.CAPABILITY_CATALOGUE, services, IDENTITY, 'video_production_launch', args)).not.toBe(before);
  expect(videos.approveAndLaunch).not.toHaveBeenCalled();
  videos.get.mockImplementation(async () => ({ manifest: { title: 'API video' }, approval: { maxTotalUsd: 3 } }));
  expect(await registry.describeApprovalCall(registry.CAPABILITY_CATALOGUE, services, IDENTITY, 'video_production_launch', args)).toBe('Запустить «API video»: до 3 USD');
  await run('video.production_open', { VideoProductionService: videos }, { productionId: 'personal' });
  expect(videos.get).toHaveBeenLastCalledWith('org-1', 'personal', 'user-1');
});

const tokens = new Map();
const constructorImports = new Proxy({}, { get: (_target, name) => {
  if (name === 'AuthorizationActions' || name === 'Sections') return new Proxy({}, { get: (_object, key) => key });
  if (['CheckPolicies', 'GetOrgFromRequest', 'GetUserFromRequest'].includes(name)) return () => () => {};
  if (!tokens.has(name)) tokens.set(name, class {}); return tokens.get(name);
} });
const { SocialFactoryController } = loadTypeScriptModule('apps/backend/src/api/routes/social-factory.controller.ts', {}, { resolve(request) {
  if (request === 'zod' || request === '@nestjs/common') return undefined;
  if (request.endsWith('/social-factory.production.schemas.v1')) return schemas;
  if (request.endsWith('/social-factory.schemas.v1')) return loadTypeScriptModule(base + 'contracts/social-factory.schemas.v1.ts');
  return constructorImports;
} });
test('actual HTTP handlers use shared schemas and server identity for create, bind, preflight, list and owner views', async () => {
  const controller = Object.create(SocialFactoryController.prototype), org = { id: 'org-1' }, actor = { id: 'user-1' };
  controller.videos = { createRevision: jest.fn(async () => ({})), preflight: jest.fn(async () => ({})), list: jest.fn(async () => []), get: jest.fn(async () => ({})) };
  controller.production = { bindVideo: jest.fn(async () => ({})) };
  await controller.createVideo(org, actor, input());
  expect(controller.videos.createRevision).toHaveBeenLastCalledWith('org-1', 'user-1', schemas.videoRevisionInputSchema.parse(input()));
  await controller.bindVideo(org, actor, 'campaign', 'item', { ...input(), operationId: 'op' });
  expect(controller.production.bindVideo.mock.calls[0].slice(0, 4)).toEqual(['org-1', 'user-1', 'campaign', 'item']);
  expect(controller.production.bindVideo.mock.calls[0][4].funding).toEqual(funding);
  await controller.videoPreflight(org, actor, 'personal', { creditLimits });
  expect(controller.videos.preflight).toHaveBeenLastCalledWith('org-1', 'user-1', 'personal', { creditLimits });
  await controller.videoPreflight(org, actor, 'api', { maxTotalUsd: 3 });
  expect(controller.videos.preflight).toHaveBeenLastCalledWith('org-1', 'user-1', 'api', { maxTotalUsd: 3 });
  await controller.listVideos(org, actor); await controller.video(org, actor, 'personal');
  expect(controller.videos.list).toHaveBeenCalledWith('org-1', undefined, 'user-1');
  expect(controller.videos.get).toHaveBeenCalledWith('org-1', 'personal', 'user-1');
  const calls = controller.videos.preflight.mock.calls.length;
  await expect(controller.videoPreflight(org, actor, 'personal', { creditLimits, maxTotalUsd: 9 })).rejects.toThrow();
  await expect(controller.createVideo(org, actor, { ...input(), organizationId: 'foreign' })).rejects.toThrow();
  expect(controller.videos.preflight).toHaveBeenCalledTimes(calls);
});

class DomainError extends Error { constructor(code) { super(code); this.code = code; } }
const repository = { SocialFactoryRepository: class {}, SocialFactoryError: DomainError, resourceRef: (kind, id) => `resource:${kind}:${id}`, sourceRef: id => `source:${id}` };
const mocks = { '@nestjs/common': { Injectable: () => target => target, Optional: () => () => {}, Inject: () => () => {} }, './social-factory.repository': repository, '../social-factory.repository': repository,
  './autonomy/editorial-decision.service': { EditorialDecisionService: class {} }, './profiles/channel-profile.v1': { ChannelProfileServiceV1: class {} },
  // This fixture exercises personal-provider binding/finalization, never local rendering.
  './editorial/local-reel.service': { CampaignLocalReelServiceV1: class { constructor() { throw new Error('Local rendering is outside this fixture'); } } },
  './editorial/social-editorial-production.v1': { SocialEditorialProductionV1: class {} }, './editorial/native-material.service': { NativeEditorialMaterialService: class {} },
  './learning/learning.service': { SocialFactoryLearningService: class {} }, './publishing/publishing.service': { SocialFactoryPublishingService: class {} },
  './planning.service': { SocialFactoryPlanningService: class {} }, '../../videos/production/video-production.service': { VideoProductionService: class {} },
  '../../database/prisma/video-generation/video-generation.repository': { VideoGenerationRepository: class {} }, '../../openai/ai.provider.config': { loadAiConfig: async () => { throw new Error('No model calls'); } } };
const { CampaignService } = loadTypeScriptModule(base + 'campaign/campaign.service.ts', mocks);
const { SocialFactoryProductionService } = loadTypeScriptModule(base + 'production.service.ts', mocks);
const { videoSourceRevisionV1 } = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/video-brief.v1.ts');
async function campaignFixture(personal = true) {
  const rows = new Map(), key = (org, kind, id) => [org, kind, id].join(':');
  const store = { transact: work => work(store), assertSourceAdmissions: jest.fn(async () => {}),
    read: async (org, kind, id) => structuredClone(rows.get(key(org, kind, id)) ?? null),
    list: async (org, kind, _limit, parentId) => structuredClone([...rows.values()].filter(row => row.organizationId === org && row.kind === kind && (parentId === undefined || row.parentId === parentId))),
    put: async value => { const id = key(value.organizationId, value.kind, value.id), old = rows.get(id);
      if ((old?.revision ?? 0) !== value.expectedRevision) throw new DomainError('SOCIAL_FACTORY_CONFLICT');
      const row = { ...structuredClone(value), revision: value.expectedRevision + 1 }; rows.set(id, row); return structuredClone(row); } };
  const campaigns = new CampaignService(store);
  const campaign = await campaigns.create('org-1', { actorId: 'user-1', requestId: 'campaign-personal-video', name: 'Campaign', timeZone: 'UTC', startsAt: '2030-01-01', endsAt: '2030-01-02', allocations: [{ channelId: 'channel', platform: 'instagram', format: 'reel', count: 1 }] });
  const original = (await campaigns.get('org-1', campaign.id)).items[0];
  const material = { version: 1, channelId: 'channel', platform: 'instagram', format: 'reel', title: 'Video', body: 'Public description', caption: 'Public caption',
    script: 'A useful public explanation.', scenes: [], assets: [], evidence: [], settings: {}, playbook: { version: '1', sourceDate: '2026-11-03' }, pieceId: PIECE, derivationId: 'draft' };
  const item = await campaigns.setMaterial('org-1', campaign.id, original.id, { material, expectedContentRevision: original.contentRevision, editorialId: 'op' });
  const context = { profile: { channelId: 'channel', languages: ['en'] }, profileRevision: 1, brandVersionDigest: null, findings: [] };
  await store.put({ organizationId: 'org-1', kind: 'editorial', id: 'op', parentId: campaign.id, expectedRevision: 0, sourceIds: [], payload: {
    version: 2, id: 'op', campaignId: campaign.id, itemId: item.id, sourceContentRevision: 1, appliedContentRevision: item.contentRevision,
    material, videoBaseMaterial: material, sourceAdmissions: [], state: 'needs_video', productionId: 'video', context,
    baseInput: { profile: context.profile, sourceIds: [], findings: [], brief: { language: 'en' } }, campaignAuthority: { mode: campaign.mode }, discoveryId: 'research' } });
  const piece = { id: PIECE, title: 'Source', body: 'Script', brief: {}, language: 'en', updatedAt: new Date('2026-11-03T00:00:00Z') };
  const result = { id: 'media', type: 'video', path: '/owned.mp4', durationSeconds: 29.4, width: 1080, height: 1920,
    metadata: { source: 'mp4_bytes', sha256: 'b'.repeat(64) }, captions: { burned: 'provider_confirmed', sourceJobIds: ['final'] }, subtitles: [] };
  const view = { id: 'video', revision: 2, digest: 'd'.repeat(64), state: 'completed', manifest: manifest(), result,
    approval: { finalJobId: 'final', scenes: [] }, jobs: [], ...(personal ? { funding: { kind: 'personal_subscription', apiFallback: false } } : {}) };
  const job = { id: 'final', state: 'completed', resultMediaId: 'media', provider: 'heygen' };
  const videos = { createRevision: jest.fn(async () => view), get: jest.fn(async () => view), finalResultJob: jest.fn(async () => job) };
  const records = { piece: jest.fn(async () => piece), job: jest.fn(async () => job) };
  const editorial = { finalizeVideo: jest.fn(async (_org, value, assets) => ({ status: 'ready', inspection: { complete: true, issues: [] }, material: { ...value, assets } })) };
  const nativeDraft = { save: jest.fn(async (_org, _actor, value) => ({ ...value.material, pieceId: PIECE, derivationId: 'new-draft' })) };
  const service = new SocialFactoryProductionService(store, campaigns, {}, {}, { resolve: async () => ({ profile: context.profile, revision: 1, brandVersionDigest: null }) }, editorial, nativeDraft,
    { forPlanning: async () => ({ findings: [] }) }, {}, videos, records, {});
  return { service, campaigns, campaign, item, piece, view, videos, records, editorial, nativeDraft };
}

test('real campaign bind forwards selected funding while server owns piece identity/revision and leaves script untouched', async () => {
  const f = await campaignFixture(), value = { ...input(), operationId: 'op', parentId: 'personal-parent' };
  const before = structuredClone(value);
  await f.service.bindVideo('org-1', 'user-1', f.campaign.id, f.item.id, value);
  expect(f.videos.createRevision).toHaveBeenCalledWith('org-1', 'user-1', { manifest: { ...value.manifest, pieceId: PIECE, pieceRevision: videoSourceRevisionV1(f.piece) }, intentId: value.intentId, parentId: 'personal-parent', funding });
  expect(value).toEqual(before);
  const inherited = { ...value }; delete inherited.funding;
  await f.service.bindVideo('org-1', 'user-1', f.campaign.id, f.item.id, inherited);
  expect(f.videos.createRevision.mock.calls.at(-1)[2]).not.toHaveProperty('funding');
  expect(f.videos.createRevision.mock.calls.at(-1)[2].parentId).toBe('personal-parent');
});

test.each([true, false])('real campaign finalize selects the personal receipt port only when personal=%s and keeps measured evidence', async personal => {
  const f = await campaignFixture(personal);
  const output = await f.service.finalizeVideo('org-1', 'user-1', 'op');
  expect(output.state).toBe('ready'); expect(f.videos.get).toHaveBeenCalledWith('org-1', 'video', 'user-1');
  if (personal) { expect(f.videos.finalResultJob).toHaveBeenCalledWith('org-1', 'video', 'final'); expect(f.records.job).not.toHaveBeenCalled(); }
  else { expect(f.records.job).toHaveBeenCalledWith('org-1', 'final'); expect(f.videos.finalResultJob).not.toHaveBeenCalled(); }
  expect(output.material.assets[0]).toMatchObject({ mediaId: 'media', durationSeconds: 29.4, width: 1080, height: 1920,
    provenance: { jobId: 'final' }, videoEvidence: { metadata: { source: 'mp4_bytes', sha256: 'b'.repeat(64) } } });
});

test('missing personal final receipt never falls through to an API job or bypasses actual metadata inspection', async () => {
  const f = await campaignFixture(); f.videos.finalResultJob.mockResolvedValue(null);
  await expect(f.service.finalizeVideo('org-1', 'user-1', 'op')).rejects.toHaveProperty('code', 'VIDEO_FINAL_RESULT_MISMATCH');
  expect(f.records.job).not.toHaveBeenCalled(); expect(f.nativeDraft.save).not.toHaveBeenCalled();
  const invalid = await campaignFixture(); delete invalid.view.result.metadata;
  await expect(invalid.service.finalizeVideo('org-1', 'user-1', 'op')).rejects.toHaveProperty('code', 'VIDEO_ACTUAL_METADATA_REQUIRED');
  expect(invalid.editorial.finalizeVideo).not.toHaveBeenCalled(); expect(invalid.nativeDraft.save).not.toHaveBeenCalled();
});
