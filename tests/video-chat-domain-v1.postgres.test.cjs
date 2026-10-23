const { randomUUID } = require('node:crypto');
const fixture = require('./helpers/video-domain-v1.fixture.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } = require('@mastra/core/request-context');

const databaseUrl = process.env.CF_VIDEO_DATABASE_URL;
if (databaseUrl) fixture.assertDisposableDatabaseV1(databaseUrl);
const integration = databaseUrl ? describe : describe.skip;
const policy = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.ability.ts');
const { authorRequestResolver } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/original-author-request.ts');
const { approvalContentDigest } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/approval-summary.ts');

const loadCapabilities = (f) => loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/capabilities/catalogue/video.capabilities.ts', {
    '@contentfactory/backend/api/routes/media.controller': { MediaController: f.Controller },
    '@contentfactory/nestjs-libraries/videos/video-job.service': { VideoJobService: f.service.constructor },
  }
);

const contextFor = (f, { foreign = false, role = 'ADMIN' } = {}) => {
  const organization = foreign ? f.otherOrg : f.org;
  const user = foreign ? f.otherUser : f.user;
  const messageId = randomUUID();
  const identity = {
    organizationId: organization.id, organizationCreatedAt: organization.createdAt.toISOString(),
    userId: user.id, role, language: 'ru', timeZone: 'Europe/Moscow',
  };
  // Exercise the real provenance resolver's authenticated current-ingress path.
  // This synthetic author message belongs to the isolated fixture's actual user.
  const request = new Map([
    [MASTRA_THREAD_ID_KEY, randomUUID()],
    [MASTRA_RESOURCE_ID_KEY, `${organization.id}:${user.id}`],
    ['cf.originalAuthorRequest', JSON.stringify({ messageId, text: 'Подготовь и создай видео по подтверждённым фактам.' })],
  ]);
  const service = (token) => {
    if (token === f.service.constructor) return f.service;
    throw new Error('Unexpected service at the shared video capability boundary');
  };
  return { ...identity, entrance: 'chat', service, messageId,
    resolveAuthorRequest: authorRequestResolver(identity, request, service) };
};

const policiesFor = (capability) => Reflect.getMetadata(
  policy.CHECK_POLICIES_KEY,
  capability.door.controller.prototype[capability.door.method]
) || [];

const call = async (f, capability, ctx, input) => {
  const policies = policiesFor(capability);
  if (policies.length) {
    const permission = await f.permissions.check(ctx.organizationId, new Date(ctx.organizationCreatedAt), ctx.role, policies);
    if (policies.some(([action, section]) => !permission.can(action, section))) {
      throw new Error('CHAT_VIDEO_DOOR_FORBIDDEN');
    }
  }
  return capability.run(ctx, capability.input.parse(input), async () => {});
};

const rejectsProductCode = async (promise, expected) => {
  let error;
  try { await promise; } catch (caught) { error = caught; }
  expect(error).toBeDefined();
  expect(error?.getResponse?.()?.code).toBe(expected);
};

// Native approval/run fencing and LLM tool selection are covered separately.
// Here the actual registered capability run calls the real Prisma domain,
// actual adapters and owned storage; only external provider/text transports are synthetic.
integration('Video V1 shared chat capability -> Prisma domain -> owned media', () => {
  jest.setTimeout(30000);

  test('selected job resolves the current editable draft even after a long old snapshot; foreign context is denied', async () => {
    const f = await fixture.create(databaseUrl);
    try {
      const draft = await f.prepare();
      const long = fixture.SOURCE_TEXT.repeat(100);
      const first = await f.service.updateDraft(f.org.id, f.user.id, draft.id, {
        version: draft.version, prompt: long, script: long,
      });
      const quote = await f.service.preflight(f.org.id, f.user.id, first.id);
      const job = await f.service.launch(f.org.id, f.user.id, {
        draftId: first.id, version: first.version, preflightId: quote.preflightId, intentId: randomUUID(),
      });
      const current = await f.service.updateDraft(f.org.id, f.user.id, first.id, {
        version: first.version, prompt: fixture.SOURCE_TEXT, script: fixture.SOURCE_TEXT,
      });
      const mocks = {'@contentfactory/nestjs-libraries/videos/video-job.service': {VideoJobService: f.service.constructor}};
      for (const [path, exported] of [
        ['content-intelligence/pieces/piece.service', 'PieceService'],
        ['content-intelligence/brand-voice/voice.service', 'VoiceService'],
        ['database/prisma/integrations/integration.service', 'IntegrationService'],
        ['content-intelligence/context/content-fact.service', 'ContentFactService'],
        ['content-intelligence/leads/content-lead.service', 'ContentLeadService'],
        ['database/prisma/media/media.service', 'MediaService'],
      ]) mocks[`@contentfactory/nestjs-libraries/${path}`] = {[exported]: class UnusedReader {}};
      const {AgentWorkContextResolver} = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/work-context.resolver.ts', mocks);
      const resolver = new AgentWorkContextResolver({
        services: token => {expect(token).toBe(f.service.constructor); return f.service;},
        gate: {check: async () => ({allowed: true})},
        capabilities: [{id: 'video.status', door: {}}, {id: 'video.draft', door: {}}],
      });
      const target = {version: 'assistant-work-context/v1', kind: 'media', id: 'library', videoJobId: job.id};
      const result = await resolver.resolve(contextFor(f), target);
      expect(result.context.videoJobId).toBe(job.id);
      expect(result.data.videoDraft).toMatchObject({id: current.id, version: current.version, brief: {script: fixture.SOURCE_TEXT}});
      expect(result.data.videoDraft.brief.prompt).toBe(fixture.SOURCE_TEXT);
      await expect(resolver.resolve(contextFor(f, {foreign: true}), target)).rejects.toMatchObject({status: 404});
      expect(f.transport.submits).toHaveLength(0);
    } finally {await f.close();}
  });

  test.each([
    { mode: 'clip', prepareWithAi: false },
    { mode: 'presenter', prepareWithAi: true },
  ])('$mode prepares, accepts one preflight, creates one job, reopens and downloads owned media', async ({ mode, prepareWithAi }) => {
    const f = await fixture.create(databaseUrl, { textKey: true });
    try {
      const caps = loadCapabilities(f);
      const ctx = contextFor(f);
      const original = await f.db.contentPiece.findUnique({ where: { id: f.pieceId } });
      const settings = mode === 'clip' ? f.clipSettings : f.presenterSettings;
      const draft = await call(f, caps.videoPrepare, ctx, {
        pieceId: f.pieceId, intent: 'Показать подтверждённые факты', settings, prepareWithAi,
      });
      expect(draft).toMatchObject({ pieceId: f.pieceId, preparedWithAi: prepareWithAi, settings });
      expect(draft.brief.script).toBe(fixture.SOURCE_TEXT);
      expect(draft.brief.prompt).toContain('12,5');
      expect(f.transport.submits).toHaveLength(0);
      expect(f.transport.textCalls).toHaveLength(prepareWithAi ? 1 : 0);
      expect(caps.videoPrepare.spentNothing(draft)).toBe(!prepareWithAi);
      expect(caps.videoPrepare.cardOf(draft)).toMatchObject({ kind: 'media', videoDraftId: draft.id, pieceId: f.pieceId });

      const preflight = await call(f, caps.videoPreflight, ctx, { draftId: draft.id });
      expect(preflight).toMatchObject({ id: draft.id, version: draft.version, payer: 'workspace_key' });
      expect(preflight.estimate.usd).toBeGreaterThan(0);
      expect(f.transport.submits).toHaveLength(0);
      const input = { draftId: draft.id, version: draft.version, preflightId: preflight.preflightId, requestMessageId: ctx.messageId };
      expect(await caps.videoLaunch.approvalContent(ctx, input)).toEqual(preflight);
      const digest = await approvalContentDigest([caps.videoLaunch], ctx.service, ctx, 'video_launch', input);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
      const approval = await caps.videoLaunch.describeApproval(ctx, input);
      expect(approval).toContain(settings.model);
      expect(approval).toContain('USD');
      expect(caps.videoLaunch.risk).toBe('paid');
      expect(caps.videoLaunch.asksInWebChat).toBe(true);

      // Same immutable preflight, including a repeated chat tool invocation,
      // must resolve to one logical domain job before any provider submit.
      const first = await call(f, caps.videoLaunch, ctx, input);
      const repeated = await call(f, caps.videoLaunch, ctx, input);
      expect(repeated.id).toBe(first.id);
      expect(await f.db.videoGenerationJob.count({ where: { organizationId: f.org.id } })).toBe(1);
      expect(f.transport.submits).toHaveLength(0);
      const launched = await f.db.videoGenerationJob.findUnique({ where: { id: first.id } });
      expect(launched).toMatchObject({ organizationId: f.org.id, userId: f.user.id, draftId: draft.id, draftVersion: draft.version });
      expect(launched.snapshot.preflightId).toBe(preflight.preflightId);

      await f.runToTerminal(first.id);
      f.restart();
      const reopened = await call(f, caps.videoStatus, ctx, { jobId: first.id });
      expect(reopened.state).toBe('completed');
      expect(reopened.result.id).toBeTruthy();
      expect(caps.videoStatus.cardOf(reopened)).toMatchObject({ kind: 'media', id: 'library', videoJobId: first.id, pieceId: f.pieceId });
      expect((await call(f, caps.videoStatus, ctx, { jobId: first.id })).result.id).toBe(reopened.result.id);
      expect(await f.db.media.count({ where: { organizationId: f.org.id, type: 'video' } })).toBe(1);
      expect(f.transport.submits).toHaveLength(1);
      expect(f.transport.submits[0].provider).toBe(settings.provider);
      expect(f.transport.downloads).toHaveLength(1);

      // The download door reads our stored bytes after the provider URL expires.
      for (const providerJob of f.transport.jobs.values()) providerJob.url = 'https://expired.invalid/video.mp4';
      const headers = {};
      let downloaded;
      await f.controller.downloadVideoJob(f.org, first.id, {
        setHeader: (name, value) => { headers[name] = value; },
        send: (bytes) => { downloaded = bytes; return bytes; },
      });
      expect(headers).toMatchObject({ 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store' });
      expect(headers['Content-Disposition']).toContain(`video-${first.id}.mp4`);
      expect(downloaded).toEqual(f.mp4);
      expect(f.transport.downloads).toHaveLength(1);
      expect(await f.db.contentPiece.findUnique({ where: { id: f.pieceId } })).toEqual(original);

      await rejectsProductCode(call(f, caps.videoStatus, contextFor(f, { foreign: true }), { jobId: first.id }), 'VIDEO_JOB_NOT_FOUND');
      await rejectsProductCode(f.controller.downloadVideoJob(f.otherOrg, first.id, { setHeader() {}, send() {} }), 'VIDEO_OWNED_FILE_UNAVAILABLE');
      expect(f.transport.submits).toHaveLength(1);
      expect(f.transport.downloads).toHaveLength(1);
    } finally { await f.close(); }
  });

  test('the real launch door metadata and PermissionsService deny USER before any launch', async () => {
    const f = await fixture.create(databaseUrl, { textKey: true });
    try {
      const { videoLaunch } = loadCapabilities(f);
      expect(videoLaunch.door.controller).toBe(f.Controller);
      expect(videoLaunch.door.method).toBe('launchVideoJob');
      const policies = policiesFor(videoLaunch);
      expect(policies.length).toBeGreaterThan(0);
      const identity = contextFor(f, { role: 'USER' });
      const permissions = await f.permissions.check(f.org.id, f.org.createdAt, 'USER', policies);
      expect(policies.every(([action, section]) => !permissions.can(action, section))).toBe(true);
      await expect(call(f, videoLaunch, identity, {
        draftId: randomUUID(), version: 1, preflightId: randomUUID(), requestMessageId: identity.messageId,
      })).rejects.toThrow('CHAT_VIDEO_DOOR_FORBIDDEN');
      expect(await f.db.videoGenerationJob.count({ where: { organizationId: f.org.id } })).toBe(0);
      expect(f.transport.submits).toHaveLength(0);
    } finally { await f.close(); }
  });
});
