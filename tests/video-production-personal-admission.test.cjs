const { randomUUID, createHash } = require('node:crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const lib = 'libraries/nestjs-libraries/src/';
const { VideoProductionRepository } = loadTypeScriptModule(lib + 'database/prisma/video-production/video-production.repository.ts');
const { VideoSubscriptionRepository } = loadTypeScriptModule(lib + 'database/prisma/video-subscription/video-subscription.repository.ts');
const { VideoGenerationRepository } = loadTypeScriptModule(lib + 'database/prisma/video-generation/video-generation.repository.ts');
const { VideoAccessService, draftAccessDigest } = loadTypeScriptModule(lib + 'videos/video-access.service.ts');
const { SUBSCRIPTION_PENDING } = loadTypeScriptModule(lib + 'videos/subscriptions/video-subscription-job.service.ts');
const { personalManifestV2, personalSceneKeyV2 } = loadTypeScriptModule(lib + 'videos/production/video-production.personal.v2.ts');
const { videoProductionDigestV1 } = loadTypeScriptModule(lib + 'videos/production/video-production.v1.ts');
const { videoSourceRevisionV1 } = loadTypeScriptModule(lib + 'videos/video-brief.v1.ts');
const url = process.env.CF_VIDEO_PERSONAL_DATABASE_URL || process.env.CF_VIDEO_DATABASE_URL;
const suite = url && process.env.CF_VIDEO_DATABASE_DISPOSABLE === '1' ? describe : describe.skip;

suite('personal production admission in the shared subscription PostgreSQL ledger', () => {
  let db;
  beforeAll(async () => {
    const target = new URL(url);
    if (!['postgresql:', 'postgres:'].includes(target.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.port === '39418' ||
      !((target.port === '39004' && target.pathname === '/social_factory') || target.pathname === '/cf_video_v1_test') || target.search || target.hash) {
      throw new Error('Personal production tests require the assigned disposable loopback database');
    }
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
  });
  afterAll(async () => { await db?.$disconnect(); });

  async function withFixture(run, options = {}) {
    const org = randomUUID(), actor = randomUUID(), otherActor = randomUUID(), connectionId = randomUUID();
    const repo = new VideoProductionRepository(db), subscriptionRepo = new VideoSubscriptionRepository(db);
    try {
      await db.organization.create({ data: { id: org, name: 'Personal production isolated regression' } });
      for (const id of [actor, otherActor]) {
        await db.user.create({ data: { id, email: `${id}@example.invalid`, providerName: 'LOCAL', timezone: 0 } });
        await db.userOrganization.create({ data: { userId: id, organizationId: org, role: id === actor ? 'ADMIN' : 'EDITOR' } });
      }
      const piece = await db.contentPiece.create({ data: { organizationId: org, createdByUserId: actor, title: 'Owned source', body: 'An exact authored line.' } });
      await db.videoSubscriptionConnection.create({ data: { id: connectionId, ownerId: actor, provider: 'heygen', issuer: 'https://issuer.example.invalid',
        resource: 'https://resource.example.invalid', walletDigest: createHash('sha256').update(connectionId).digest('hex'), unit: 'heygen_credit',
        perJob: '0.25', perMonth: options.perMonth || '10' } });
      await db.videoSubscriptionGrant.create({ data: { connectionId, organizationId: org } });
      const funding = { kind: 'personal_subscription', connections: { heygen: connectionId }, finalProvider: 'heygen' };
      const content = { version: 1, pieceId: piece.id, pieceRevision: videoSourceRevisionV1(piece), title: 'Two exact scenes', locale: 'en',
        aspectRatio: '9:16', resolution: '1080p', durationSeconds: 10, audio: true, captions: false,
        scenes: ['opening', 'closing'].map(id => ({ id, kind: 'presenter', durationSeconds: 5, script: 'An exact authored line.', avatarId: 'owned-avatar', voiceId: 'owned-voice', engine: 'avatar_iii' })) };
      const f = { db, org, actor, otherActor, connectionId, repo, subscriptionRepo, piece, funding, content };
      f.preparation = async (operation = 'presenter') => {
        const connection = await db.videoSubscriptionConnection.findUniqueOrThrow({ where: { id: connectionId } });
        const now = new Date();
        return { connectionId, provider: 'heygen', accountGeneration: connection.generation, walletDigest: connection.walletDigest, unit: connection.unit,
          perJob: connection.perJob.toFixed(), perMonth: connection.perMonth.toFixed(), operation,
          request: { tool: 'synthetic-reviewed-operation', args: { operation }, schemaDigest: 'a'.repeat(64),
            quote: { amount: '0.1', unit: connection.unit, source: 'synthetic-native-quote', asOf: now.toISOString(), expiresAt: new Date(now.getTime() + 60000).toISOString(), upperBound: '0.2' } } };
      };
      f.ready = async (input = {}) => {
        const manifest = personalManifestV2(input.content || content, input.funding || funding);
        const draft = await repo.create({ organizationId: org, userId: actor, intentId: randomUUID(), parentId: input.parentId, manifest, digest: videoProductionDigestV1(manifest) });
        const approval = { version: 2, kind: 'personal_subscription', id: randomUUID(), actorId: actor, manifestDigest: draft.digest,
          expiresAt: new Date(Date.now() + 60000).toISOString(), creditLimits: [{ connectionId, unit: 'heygen_credit', maxCredits: input.limit || '1' }],
          scenes: [], final: { provider: 'heygen', connectionId, jobId: randomUUID(), preparation: await f.preparation('final_composition') }, blockers: input.blockers || [] };
        const jobs = [];
        for (const [index, scene] of manifest.scenes.entries()) {
          const key = personalSceneKeyV2(draft.productionId, manifest, scene, []), preparation = await f.preparation();
          preparation.request.args.sceneId = scene.id;
          const plan = { sceneId: scene.id, key, kind: 'generation', reused: false, jobId: randomUUID(), preparation };
          approval.scenes.push(plan);
          jobs.push({ id: plan.jobId, intentId: input.sceneIntents?.[index] || `scene-${randomUUID()}`, state: 'accepted', preparation,
            snapshot: { details: { sceneId: scene.id, sceneKey: key }, kind: 'caller-cannot-override-this', productionRevisionId: 'foreign-row' } });
        }
        jobs.push({ id: approval.final.jobId, intentId: `final-${draft.id}`, state: 'awaiting_assets', preparation: approval.final.preparation, snapshot: { details: { deferred: true } } });
        if (input.mutate) input.mutate(approval, jobs);
        const row = await repo.savePersonalPreflight(draft, approval);
        return { row, draft, approval, jobs, approve: () => repo.approvePersonal(row, approval, jobs) };
      };
      f.legacyJob = async (data = {}) => {
        const preparation = await f.preparation();
        return db.videoSubscriptionJob.create({ data: { organizationId: org, actorId: actor, pieceId: piece.id, pieceRevision: content.pieceRevision,
          draftId: randomUUID(), draftVersion: 1, preflightId: randomUUID(), intentId: randomUUID(), connectionId,
          walletDigest: preparation.walletDigest, generation: preparation.accountGeneration, provider: 'heygen', unit: 'heygen_credit',
          snapshot: {}, request: preparation.request, quote: preparation.request.quote, reserved: '0.25', period: new Date().toISOString().slice(0, 7), ...data } });
      };
      f.legacyLaunch = async () => {
        const preparation = await f.preparation(), connection = await db.videoSubscriptionConnection.findUniqueOrThrow({ where: { id: connectionId } });
        const draft = await db.videoPromptDraft.create({ data: { organizationId: org, userId: actor, pieceId: piece.id, pieceRevision: content.pieceRevision,
          brief: { script: 'An exact authored line.', referenceMediaIds: [] }, settings: { provider: 'heygen', model: 'heygen-avatar', mode: 'presenter' } } });
        const approval = await db.videoAccessPreflight.create({ data: { organizationId: org, actorId: actor, draftId: draft.id, draftVersion: draft.version,
          draftDigest: draftAccessDigest(draft), access: { kind: 'subscription', connectionId }, connectionId, generation: connection.generation,
          snapshot: { brief: draft.brief, settings: draft.settings, perJob: connection.perJob.toFixed(), perMonth: connection.perMonth.toFixed(), remaining: '0.75' },
          request: preparation.request, quote: preparation.request.quote, schemaDigest: preparation.request.schemaDigest, expiresAt: new Date(Date.now() + 60000) } });
        const connections = { runtime: { now: () => new Date() }, enabled: async () => ({}),
          token: async () => ({ connection: await subscriptionRepo.connection(org, actor, connectionId), token: 'synthetic-no-network', assertUsable: async () => {} }) };
        const subscriptions = { mcp: { capabilities: async () => ({ digest: preparation.request.schemaDigest }) }, dispatch: async () => {}, view: async job => job };
        const access = new VideoAccessService(subscriptionRepo, new VideoGenerationRepository(db), {}, connections, subscriptions, {});
        return () => access.launch(org, actor, { preflightId: approval.id, intentId: randomUUID() });
      };
      return await run(f);
    } finally {
      await db.videoSubscriptionJob.deleteMany({ where: { organizationId: org } });
      await db.videoRouteIntent.deleteMany({ where: { organizationId: org } });
      await db.videoAccessPreflight.deleteMany({ where: { organizationId: org } });
      await db.videoSubscriptionGrant.deleteMany({ where: { connectionId } });
      await db.videoSubscriptionConnection.deleteMany({ where: { id: connectionId } });
      await db.organization.deleteMany({ where: { id: org } });
      await db.user.deleteMany({ where: { id: { in: [actor, otherActor] } } });
    }
  }
  const rejects = (promise, code) => expect(promise).rejects.toMatchObject({ response: { code } });
  async function completedScenes(f, ready) {
    for (const job of ready.jobs.slice(0, 2)) await db.videoSubscriptionJob.update({ where: { id: job.id }, data: { state: 'completed', resultMediaId: randomUUID() } });
  }
  const reservation = job => ({ id: job.id, intentId: job.intentId, preflightId: job.preflightId, draftId: job.draftId, connectionId: job.connectionId,
    walletDigest: job.walletDigest, generation: job.generation, provider: job.provider, unit: job.unit, reserved: job.reserved.toFixed(), period: job.period,
    request: job.request, quote: job.quote, snapshot: job.snapshot });

  test('the existing V1 immutable create/replay and parent contracts remain usable in real PostgreSQL', () => withFixture(async f => {
    const input = { organizationId: f.org, userId: f.actor, intentId: randomUUID(), manifest: f.content, digest: videoProductionDigestV1(f.content) };
    const row = await f.repo.create(input);
    expect((await f.repo.create(input)).id).toBe(row.id);
    expect(row.manifest.version).toBe(1); expect(row.manifest.funding).toBeUndefined();
    await rejects(f.repo.create({ ...input, digest: 'b'.repeat(64) }), 'VIDEO_PRODUCTION_INTENT_MISMATCH');
    const child = await f.repo.create({ ...input, intentId: randomUUID(), parentId: row.id });
    expect(child.productionId).toBe(row.productionId); expect(child.revision).toBe(2);
    await rejects(f.repo.create({ ...input, intentId: randomUUID(), parentId: row.id }), 'VIDEO_PRODUCTION_PARENT_CHANGED');
  }));

  test('admission atomically reserves all scenes and deferred final in the existing ledger and replay creates nothing', () => withFixture(async f => {
    const ready = await f.ready();
    const [a, b] = await Promise.all([ready.approve(), ready.approve()]);
    expect(a.approval.acceptedAt).toBe(b.approval.acceptedAt);
    const jobs = await db.videoSubscriptionJob.findMany({ where: { organizationId: f.org } });
    expect(jobs).toHaveLength(3); expect(jobs.every(job => job.reserved.eq('0.25') && job.actualCost === null)).toBe(true);
    expect(jobs.every(job => job.draftId === ready.row.id && job.preflightId === job.id && job.snapshot.kind === 'production/personal-v2' && job.snapshot.productionRevisionId === ready.row.id)).toBe(true);
    const final = jobs.find(job => job.id === ready.approval.final.jobId);
    expect(final.state).toBe('awaiting_assets'); expect(SUBSCRIPTION_PENDING).not.toContain(final.state);
    expect(await db.videoGenerationJob.count({ where: { organizationId: f.org } })).toBe(0);
    expect(await f.repo.subscriptionJob(randomUUID(), jobs[0].id)).toBeNull();
    expect(await f.repo.personalJobByIntent(randomUUID(), jobs[0].intentId)).toBeNull();
  }));

  test('aggregate approval caps reserve perJob, including deferred final, rather than the smaller quoted price', () => withFixture(async f => {
    const ready = await f.ready({ limit: '0.5' });
    await rejects(ready.approve(), 'VIDEO_PRODUCTION_TOTAL_CREDIT_LIMIT_EXCEEDED');
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(0);
    expect((await f.repo.read(f.org, ready.row.id)).state).toBe('preflight');
  }));

  test('real legacy facade launch and production admission cannot concurrently exceed one wallet allowance', () => withFixture(async f => {
    const ready = await f.ready(), launch = await f.legacyLaunch();
    const outcomes = await Promise.allSettled([ready.approve(), launch()]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(result => result.status === 'rejected');
    expect(rejected.reason.response.code).toBe('VIDEO_MONTHLY_CREDIT_LIMIT_EXCEEDED');
    const jobs = await db.videoSubscriptionJob.findMany({ where: { connectionId: f.connectionId } });
    expect(jobs.reduce((total, job) => total.plus(job.reserved), new Prisma.Decimal(0)).lte('0.75')).toBe(true);
    expect([1, 3]).toContain(jobs.length);
  }, { perMonth: '0.75' }));

  test('old unknown liabilities survive generation/month changes and approval replay preserves unknown receipt state', () => withFixture(async f => {
    const unknown = await f.legacyJob({ state: 'submission_unknown', period: '2000-01', receipt: { id: 'accepted-but-response-lost' } });
    await db.videoSubscriptionConnection.update({ where: { id: f.connectionId }, data: { generation: { increment: 1 } } });
    const ready = await f.ready();
    await rejects(ready.approve(), 'VIDEO_MONTHLY_CREDIT_LIMIT_EXCEEDED');
    expect((await f.repo.subscriptionJob(f.org, unknown.id))).toMatchObject({ generation: 1, state: 'submission_unknown', actualCost: null, receipt: { id: 'accepted-but-response-lost' } });
    await db.videoSubscriptionJob.update({ where: { id: unknown.id }, data: { actualCost: 0, costCertainty: 'owner_reconciled' } });
    const approved = await ready.approve();
    const id = approved.approval.scenes[0].jobId;
    await db.videoSubscriptionJob.update({ where: { id }, data: { state: 'submission_unknown', receipt: { id: 'production-unknown' } } });
    await ready.approve();
    expect((await f.repo.subscriptionJob(f.org, id))).toMatchObject({ state: 'submission_unknown', actualCost: null, receipt: { id: 'production-unknown' } });
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(4);
  }, { perMonth: '0.75' }));

  test.each([
    ['generation', { generation: 2 }, 'VIDEO_CONNECTION_CHANGED'],
    ['wallet', { walletDigest: 'b'.repeat(64) }, 'VIDEO_CONNECTION_CHANGED'],
    ['unit', { unit: 'higgsfield_credit' }, 'VIDEO_CONNECTION_CHANGED'],
    ['per-job limit', { perJob: '0.5' }, 'VIDEO_PREFLIGHT_STALE'],
    ['per-month limit', { perMonth: '9' }, 'VIDEO_PREFLIGHT_STALE'],
    ['revocation', { state: 'revoked' }, 'VIDEO_REAUTH_REQUIRED'],
  ])('a changed %s invalidates preflight before any reservation', (_name, change, code) => withFixture(async f => {
    const ready = await f.ready();
    await db.videoSubscriptionConnection.update({ where: { id: f.connectionId }, data: change });
    await rejects(ready.approve(), code);
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(0);
  }));

  test('saved approval, actor, source and optimistic preflight state are authoritative', () => withFixture(async f => {
    const ready = await f.ready();
    await rejects(f.repo.savePersonalPreflight(ready.draft, { ...ready.approval, id: randomUUID() }), 'VIDEO_PRODUCTION_APPROVAL_STALE');
    await rejects(f.repo.approvePersonal({ ...ready.row, userId: f.otherActor }, { ...ready.approval, actorId: f.otherActor }, ready.jobs), 'VIDEO_PRODUCTION_APPROVAL_STALE');
    await rejects(f.repo.approvePersonal(ready.row, { ...ready.approval, creditLimits: [{ ...ready.approval.creditLimits[0], maxCredits: '100' }] }, ready.jobs), 'VIDEO_PRODUCTION_APPROVAL_STALE');
    await rejects(f.repo.approvePersonal(ready.row, ready.approval, ready.jobs.slice(1)), 'VIDEO_PRODUCTION_APPROVAL_STALE');
    await db.contentPiece.update({ where: { id: f.piece.id }, data: { body: 'Changed after approval.' } });
    await rejects(ready.approve(), 'VIDEO_SOURCE_CHANGED');
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(0);
  }));

  test.each([
    ['expired quote', quote => { quote.expiresAt = new Date(Date.now() - 1000).toISOString(); }],
    ['USD quote', quote => { quote.unit = 'USD'; }],
    ['unknown price', quote => { quote.amount = null; }],
  ])('%s cannot reserve personal credits', (_name, mutate) => withFixture(async f => {
    const ready = await f.ready({ mutate: approval => mutate(approval.final.preparation.request.quote) });
    await rejects(ready.approve(), 'VIDEO_PRICE_UNAVAILABLE');
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(0);
  }));

  test('persisted blockers and a revoked workspace wallet grant are checked again at admission', () => withFixture(async f => {
    const blocked = await f.ready({ blockers: ['VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE'] });
    await rejects(blocked.approve(), 'VIDEO_PRODUCTION_PREFLIGHT_BLOCKED');
    const ready = await f.ready();
    await db.videoSubscriptionGrant.updateMany({ where: { connectionId: f.connectionId, organizationId: f.org }, data: { enabled: false } });
    await rejects(ready.approve(), 'VIDEO_REAUTH_REQUIRED');
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(0);
  }));

  test('personal parents cannot downgrade to API or change accepted funding; an unaccepted draft can explicitly change its choice', () => withFixture(async f => {
    const ready = await f.ready();
    const changed = personalManifestV2({ ...f.content, title: 'Draft choice' }, { kind: 'personal_subscription', connections: {}, finalProvider: 'higgsfield' });
    await rejects(f.repo.create({ organizationId: f.org, userId: f.actor, intentId: randomUUID(), parentId: ready.row.id, manifest: f.content, digest: videoProductionDigestV1(f.content) }), 'VIDEO_PRODUCTION_FUNDING_CHANGED');
    const draftChoice = await f.repo.create({ organizationId: f.org, userId: f.actor, intentId: randomUUID(), parentId: ready.row.id, manifest: changed, digest: videoProductionDigestV1(changed) });
    expect(draftChoice.manifest.funding.connections).toEqual({});
    const another = await f.ready(); await another.approve();
    await rejects(f.repo.create({ organizationId: f.org, userId: f.actor, intentId: randomUUID(), parentId: another.row.id, manifest: changed, digest: videoProductionDigestV1(changed) }), 'VIDEO_PRODUCTION_FUNDING_CHANGED');
  }));

  test('an intervening unapproved child cannot bypass accepted family funding', () => withFixture(async f => {
    const first = await f.ready(); await first.approve();
    const child = await f.ready({ parentId: first.row.id });
    const funding = { ...f.funding, connections: { ...f.funding.connections, higgsfield: randomUUID() } };
    const manifest = personalManifestV2(f.content, funding);
    await rejects(f.repo.create({ organizationId: f.org, userId: f.actor, parentId: child.row.id, intentId: randomUUID(), manifest, digest: videoProductionDigestV1(manifest) }), 'VIDEO_PRODUCTION_FUNDING_CHANGED');
    expect(await db.videoProductionRevision.count({ where: { organizationId: f.org, productionId: first.row.productionId } })).toBe(2);
  }));

  test('funding is rechecked at admission when an ancestor was accepted after the different draft already existed', () => withFixture(async f => {
    const first = await f.ready();
    const funding = { ...f.funding, connections: { ...f.funding.connections, higgsfield: randomUUID() } };
    const child = await f.ready({ parentId: first.row.id, funding });
    expect(child.row.manifest.funding).toEqual(funding);
    await first.approve();
    await rejects(child.approve(), 'VIDEO_PRODUCTION_FUNDING_CHANGED');
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(3);
  }));

  test('completed exact funded scene intents are aliased into a selective revision without charging them again', () => withFixture(async f => {
    const first = await f.ready(); await first.approve();
    for (const job of first.jobs) await db.videoSubscriptionJob.update({ where: { id: job.id }, data: { state: 'completed', resultMediaId: randomUUID(), actualCost: '0.1', costCertainty: 'provider_confirmed' } });
    const next = await f.ready({ parentId: first.row.id, content: { ...f.content, title: 'Selective parent revision' }, sceneIntents: first.jobs.slice(0, 2).map(job => job.intentId), limit: '0.25' });
    const approved = await next.approve();
    expect(approved.approval.scenes.map(scene => scene.jobId)).toEqual(first.jobs.slice(0, 2).map(job => job.id));
    expect(approved.approval.scenes.every(scene => scene.reused)).toBe(true);
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(4);
    expect((await f.repo.subscriptionJob(f.org, approved.approval.final.jobId)).state).toBe('awaiting_assets');
  }));

  test('an unfinished scene intent is never automatically retried or aliased', () => withFixture(async f => {
    const first = await f.ready(); await first.approve();
    await db.videoSubscriptionJob.update({ where: { id: first.jobs[0].id }, data: { state: 'submission_unknown', receipt: { id: 'uncertain-native-receipt' } } });
    const next = await f.ready({ parentId: first.row.id, sceneIntents: first.jobs.slice(0, 2).map(job => job.intentId) });
    await rejects(next.approve(), 'VIDEO_SCENE_RECONCILIATION_REQUIRED');
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(3);
  }));

  test.each(['submission_unknown', 'save_failed', 'running'])('changing the scene script, generationAttempt and intent cannot bypass earlier %s work', state => withFixture(async f => {
    const first = await f.ready(); await first.approve();
    await completedScenes(f, first);
    const old = first.jobs[0];
    await db.videoSubscriptionJob.update({ where: { id: old.id }, data: { state, resultMediaId: null, submitAttempts: 1, receipt: { id: 'existing-provider-receipt' } } });
    expect(await f.repo.unresolvedPersonalScene(f.org, f.actor, first.row.productionId, 'opening')).toBe(true);
    expect(await f.repo.unresolvedPersonalScene(randomUUID(), f.actor, first.row.productionId, 'opening')).toBe(false);
    expect(await f.repo.unresolvedPersonalScene(f.org, f.otherActor, first.row.productionId, 'opening')).toBe(false);
    const content = structuredClone(f.content); content.scenes[0].script = 'An explicit revision still cannot duplicate unknown work.'; content.scenes[0].generationAttempt = 1;
    const child = await f.ready({ parentId: first.row.id, content });
    await rejects(child.approve(), 'VIDEO_SCENE_RECONCILIATION_REQUIRED');
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(3);
    expect((await f.repo.subscriptionJob(f.org, old.id))).toMatchObject({ state, actualCost: null, receipt: { id: 'existing-provider-receipt' } });
  }));

  test.each(['completed', 'failed', 'canceled'])('the lineage helper treats %s as terminal without fabricating cost knowledge', state => withFixture(async f => {
    const first = await f.ready(); await first.approve();
    await db.videoSubscriptionJob.update({ where: { id: first.jobs[0].id }, data: { state } });
    expect(await f.repo.unresolvedPersonalScene(f.org, f.actor, first.row.productionId, 'opening')).toBe(false);
    expect((await f.repo.subscriptionJob(f.org, first.jobs[0].id)).actualCost).toBeNull();
  }));

  test('final preparation freezes a request once against the existing reservation and never creates a second job', () => withFixture(async f => {
    const ready = await f.ready(), approved = await ready.approve(), final = ready.jobs[2];
    const preparation = await f.preparation('final_composition'); preparation.request.args = { ownedSceneMediaIds: [randomUUID(), randomUUID()] };
    const job = { ...final, state: 'accepted', preparation, snapshot: { details: { resolvedScenes: ['owned-1', 'owned-2'] }, manifestDigest: 'cannot-replace' } };
    const frozen = await f.repo.finalPersonalJob(approved, job);
    expect(frozen.state).toBe('accepted'); expect(frozen.reserved.eq('0.25')).toBe(true);
    expect(frozen.request.args).toEqual(preparation.request.args); expect(frozen.snapshot.manifestDigest).toBe(approved.digest);
    const saved = await f.repo.read(f.org, approved.id);
    expect(saved.approval.final.readyRequestDigest).toBe(videoProductionDigestV1(frozen.request));
    expect(saved.approval.final.preparation).toEqual(approved.approval.final.preparation);
    for (const replacement of [{ ...preparation.request, args: { replacement: true } }, { ...preparation.request, tool: 'different-tool' }]) {
      expect((await f.repo.finalPersonalJob(approved, { ...job, preparation: { ...preparation, request: replacement } })).request).toEqual(frozen.request);
      expect((await f.repo.read(f.org, approved.id)).approval.final.readyRequestDigest).toBe(saved.approval.final.readyRequestDigest);
    }
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(3);
  }));

  test('concurrent final preparation pins the winning full ready request atomically on its trusted parent', () => withFixture(async f => {
    const ready = await f.ready(), approved = await ready.approve(), final = ready.jobs[2];
    const preparation = await f.preparation('final_composition');
    const variants = ['first-ready-tool', 'second-ready-tool'].map(tool => ({ ...final, state: 'accepted', preparation: { ...preparation,
      request: { ...preparation.request, tool, args: { orderedOwnedMedia: [tool] } } } }));
    const results = await Promise.all(variants.map(job => f.repo.finalPersonalJob(approved, job)));
    const persisted = await f.repo.subscriptionJob(f.org, final.id), parent = await f.repo.read(f.org, approved.id);
    expect(results.map(job => job.request)).toEqual([persisted.request, persisted.request]);
    expect(parent.approval.final.readyRequestDigest).toBe(videoProductionDigestV1(persisted.request));
    expect(parent.approval.final.preparation).toEqual(approved.approval.final.preparation);
    expect(persisted.reserved.eq('0.25')).toBe(true); expect(persisted.submitAttempts).toBe(0); expect(persisted.receipt).toBeNull();
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(3);
  }));

  test('a final refreshed quote cannot exceed its earlier reservation even after a larger current per-job limit', () => withFixture(async f => {
    const ready = await f.ready(), approved = await ready.approve();
    await db.videoSubscriptionConnection.update({ where: { id: f.connectionId }, data: { perJob: '0.5' } });
    const preparation = await f.preparation('final_composition'); preparation.request.quote.amount = '0.3'; preparation.request.quote.upperBound = '0.4';
    await rejects(f.repo.finalPersonalJob(approved, { ...ready.jobs[2], state: 'accepted', preparation }), 'VIDEO_JOB_CREDIT_LIMIT_EXCEEDED');
    expect((await f.repo.subscriptionJob(f.org, ready.jobs[2].id)).state).toBe('awaiting_assets');
    expect((await f.repo.read(f.org, approved.id)).approval.final).not.toHaveProperty('readyRequestDigest');
  }));

  test('final preparation rejects a reconnect generation even if the same wallet and a fresh quote remain', () => withFixture(async f => {
    const ready = await f.ready(), approved = await ready.approve();
    await db.videoSubscriptionConnection.update({ where: { id: f.connectionId }, data: { generation: { increment: 1 } } });
    await rejects(f.repo.finalPersonalJob(approved, { ...ready.jobs[2], state: 'accepted', preparation: await f.preparation('final_composition') }), 'VIDEO_CONNECTION_CHANGED');
    expect((await f.repo.subscriptionJob(f.org, ready.jobs[2].id)).state).toBe('awaiting_assets');
  }));

  test('final preparation error and pause persist atomically; explicit same-approval recovery reuses the exact reservation and replays safely', () => withFixture(async f => {
    const ready = await f.ready(); await ready.approve(); await completedScenes(f, ready);
    const original = await f.repo.subscriptionJob(f.org, ready.jobs[2].id);
    expect(await f.repo.recordPersonalFinalPreparationError(f.org, ready.row.id, original.id, 'VIDEO_SUBSCRIPTION_UNAVAILABLE')).toBe(true);
    expect((await f.repo.read(f.org, ready.row.id)).state).toBe('needs_attention');
    expect((await f.repo.subscriptionJob(f.org, original.id)).errorCode).toBe('VIDEO_SUBSCRIPTION_UNAVAILABLE');
    const resume = () => f.repo.resumePersonalFinal(f.org, f.actor, ready.row.id, ready.approval.id, ready.row.digest);
    const [a, b] = await Promise.all([resume(), resume()]);
    expect(a.state).toBe('approved'); expect(b.state).toBe('approved');
    const final = await f.repo.subscriptionJob(f.org, original.id);
    expect(final.errorCode).toBeNull(); expect(final.state).toBe('awaiting_assets'); expect(reservation(final)).toEqual(reservation(original));
    expect(final.submitAttempts).toBe(0); expect(final.receipt).toBeNull();
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(3);
  }));

  test('final recovery rejects another actor, stale approval, stopped project and changed source', () => withFixture(async f => {
    const ready = await f.ready(); await ready.approve(); await completedScenes(f, ready);
    await f.repo.recordPersonalFinalPreparationError(f.org, ready.row.id, ready.jobs[2].id, 'VIDEO_SUBSCRIPTION_UNAVAILABLE');
    await rejects(f.repo.resumePersonalFinal(f.org, f.otherActor, ready.row.id, ready.approval.id, ready.row.digest), 'VIDEO_PRODUCTION_ACTOR_MISMATCH');
    await rejects(f.repo.resumePersonalFinal(f.org, f.actor, ready.row.id, randomUUID(), ready.row.digest), 'VIDEO_PRODUCTION_APPROVAL_STALE');
    await rejects(f.repo.resumePersonalFinal(f.org, f.actor, ready.row.id, ready.approval.id, 'b'.repeat(64)), 'VIDEO_PRODUCTION_APPROVAL_STALE');
    await db.contentPiece.update({ where: { id: f.piece.id }, data: { body: 'Changed authoritative source before recovery.' } });
    await rejects(f.repo.resumePersonalFinal(f.org, f.actor, ready.row.id, ready.approval.id, ready.row.digest), 'VIDEO_SOURCE_CHANGED');
    await f.repo.stopPersonal(f.org, f.actor, ready.row.id);
    await rejects(f.repo.resumePersonalFinal(f.org, f.actor, ready.row.id, ready.approval.id, ready.row.digest), 'VIDEO_PRODUCTION_STOPPED');
    expect(await db.videoSubscriptionJob.count({ where: { organizationId: f.org } })).toBe(3);
  }));

  test.each([
    ['unknown send', { state: 'submission_unknown', submitAttempts: 1, receipt: { id: 'accepted-provider-receipt' } }],
    ['receipt-bearing placeholder', { receipt: { id: 'receipt-is-not-unsent' } }],
    ['already frozen final', { state: 'accepted' }],
  ])('final recovery and error recording cannot restart %s', (_name, change) => withFixture(async f => {
    const ready = await f.ready(); await ready.approve(); await completedScenes(f, ready);
    await f.repo.recordPersonalFinalPreparationError(f.org, ready.row.id, ready.jobs[2].id, 'VIDEO_SUBSCRIPTION_UNAVAILABLE');
    await db.videoSubscriptionJob.update({ where: { id: ready.jobs[2].id }, data: change });
    const before = await f.repo.subscriptionJob(f.org, ready.jobs[2].id);
    expect(await f.repo.recordPersonalFinalPreparationError(f.org, ready.row.id, ready.jobs[2].id, 'VIDEO_TEMPORARY_FAILURE')).toBe(false);
    await rejects(f.repo.resumePersonalFinal(f.org, f.actor, ready.row.id, ready.approval.id, ready.row.digest), 'VIDEO_FINAL_PREPARATION_RETRY_UNAVAILABLE');
    const after = await f.repo.subscriptionJob(f.org, ready.jobs[2].id);
    expect(reservation(after)).toEqual(reservation(before)); expect(after.state).toBe(before.state); expect(after.receipt).toEqual(before.receipt); expect(after.actualCost).toBeNull();
  }));

  test('a nonfinal or relinked job cannot receive a final error or authorize recovery; unresolved scenes remain blocked', () => withFixture(async f => {
    const ready = await f.ready(); await ready.approve(); await completedScenes(f, ready);
    expect(await f.repo.recordPersonalFinalPreparationError(f.org, ready.row.id, ready.jobs[0].id, 'VIDEO_TEMPORARY_FAILURE')).toBe(false);
    expect((await f.repo.read(f.org, ready.row.id)).state).toBe('approved');
    await f.repo.recordPersonalFinalPreparationError(f.org, ready.row.id, ready.jobs[2].id, 'VIDEO_TEMPORARY_FAILURE');
    await db.videoSubscriptionJob.update({ where: { id: ready.jobs[0].id }, data: { state: 'submission_unknown', receipt: { id: 'unknown-scene' } } });
    await rejects(f.repo.resumePersonalFinal(f.org, f.actor, ready.row.id, ready.approval.id, ready.row.digest), 'VIDEO_SCENE_RECONCILIATION_REQUIRED');
    const final = await f.repo.subscriptionJob(f.org, ready.jobs[2].id);
    await db.videoSubscriptionJob.update({ where: { id: final.id }, data: { snapshot: { ...final.snapshot, productionRevisionId: randomUUID() } } });
    expect(await f.repo.recordPersonalFinalPreparationError(f.org, ready.row.id, final.id, 'VIDEO_TEMPORARY_FAILURE')).toBe(false);
    await rejects(f.repo.resumePersonalFinal(f.org, f.actor, ready.row.id, ready.approval.id, ready.row.digest), 'VIDEO_FINAL_PREPARATION_RETRY_UNAVAILABLE');
  }));

  test('an error recorded after final freeze cannot pause the progressing aggregate', () => withFixture(async f => {
    const ready = await f.ready(), approved = await ready.approve(); await completedScenes(f, ready);
    await f.repo.finalPersonalJob(approved, { ...ready.jobs[2], state: 'accepted', preparation: await f.preparation('final_composition') });
    expect(await f.repo.recordPersonalFinalPreparationError(f.org, ready.row.id, ready.jobs[2].id, 'VIDEO_TEMPORARY_FAILURE')).toBe(false);
    expect((await f.repo.read(f.org, ready.row.id)).state).toBe('approved');
    expect((await f.repo.subscriptionJob(f.org, ready.jobs[2].id)).errorCode).toBeNull();
  }));

  test('competing final freeze and preparation failure cannot leave an accepted final under a paused aggregate', () => withFixture(async f => {
    const ready = await f.ready(), approved = await ready.approve(); await completedScenes(f, ready);
    await Promise.allSettled([
      f.repo.finalPersonalJob(approved, { ...ready.jobs[2], state: 'accepted', preparation: await f.preparation('final_composition') }),
      f.repo.recordPersonalFinalPreparationError(f.org, ready.row.id, ready.jobs[2].id, 'VIDEO_TEMPORARY_FAILURE'),
    ]);
    const row = await f.repo.read(f.org, ready.row.id), final = await f.repo.subscriptionJob(f.org, ready.jobs[2].id);
    expect([[ 'approved', 'accepted' ], [ 'needs_attention', 'awaiting_assets' ]]).toContainEqual([row.state, final.state]);
    expect(final.submitAttempts).toBe(0); expect(final.receipt).toBeNull();
  }));

  test('concurrent stop and final freezing leave the final unsent and canceled', () => withFixture(async f => {
    const ready = await f.ready(), approved = await ready.approve();
    const preparation = await f.preparation('final_composition');
    await Promise.allSettled([f.repo.finalPersonalJob(approved, { ...ready.jobs[2], state: 'accepted', preparation }), f.repo.stopPersonal(f.org, f.actor, ready.row.id)]);
    const final = await f.repo.subscriptionJob(f.org, ready.jobs[2].id);
    expect(final.state).toBe('canceled'); expect(final.submitAttempts).toBe(0); expect(final.receipt).toBeNull();
    expect((await f.repo.read(f.org, ready.row.id)).state).toBe('stopped');
  }));

  test('stop cancels only linked unsent jobs and leaves receipts, uncertainty and unrelated work intact', () => withFixture(async f => {
    const ready = await f.ready(); await ready.approve();
    await db.videoSubscriptionJob.update({ where: { id: ready.jobs[0].id }, data: { state: 'submission_unknown', submitAttempts: 1, submittedAt: new Date(), receipt: { id: 'provider-accepted' } } });
    await db.videoSubscriptionJob.update({ where: { id: ready.jobs[1].id }, data: { receipt: { id: 'receipt-must-survive' } } });
    const unrelated = await f.legacyJob();
    await rejects(f.repo.stopPersonal(f.org, f.otherActor, ready.row.id), 'VIDEO_PRODUCTION_ACTOR_MISMATCH');
    await f.repo.stopPersonal(f.org, f.actor, ready.row.id);
    expect((await f.repo.subscriptionJob(f.org, ready.jobs[0].id))).toMatchObject({ state: 'submission_unknown', actualCost: null, receipt: { id: 'provider-accepted' } });
    expect((await f.repo.subscriptionJob(f.org, ready.jobs[1].id))).toMatchObject({ state: 'accepted', receipt: { id: 'receipt-must-survive' } });
    const final = await f.repo.subscriptionJob(f.org, ready.jobs[2].id);
    expect(final.state).toBe('canceled'); expect(final.actualCost.eq(0)).toBe(true); expect(final.costCertainty).toBe('locally_canceled');
    expect((await f.repo.subscriptionJob(f.org, unrelated.id)).state).toBe('accepted');
    await rejects(f.repo.finalPersonalJob(ready.row, ready.jobs[2]), 'VIDEO_PRODUCTION_STOPPED');
  }));
});
