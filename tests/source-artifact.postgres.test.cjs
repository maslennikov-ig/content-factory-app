const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/';
const { SourceArtifactRepositoryV1, assertSourceArtifactCurrentV1 } = loadTypeScriptModule(base + 'content-intelligence/social-factory/source-artifact.repository.ts');
const { VideoGenerationRepository } = loadTypeScriptModule(base + 'database/prisma/video-generation/video-generation.repository.ts');
const { serializableWithRetry } = loadTypeScriptModule(base + 'database/prisma/serializable.transaction.ts');
const { videoSourceRevisionV1 } = loadTypeScriptModule(base + 'videos/video-brief.v1.ts');
const database = process.env.CF_SOURCE_ARTIFACT_DATABASE_URL;
const suite = database && process.env.CF_SOURCE_ARTIFACT_DISPOSABLE === '1' ? describe : describe.skip;

suite('source artifact assertions against assigned synthetic PostgreSQL', () => {
  let db;
  beforeAll(async () => {
    const url = new URL(database);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== '39004' || url.pathname !== '/social_factory' || url.search || url.hash) throw new Error('Source tests require the assigned loopback synthetic database only');
    db = new PrismaClient({ datasources: { db: { url: database } } }); await db.$connect();
  });
  afterAll(async () => { await db?.$disconnect(); });
  async function fixture(run) {
    const org = randomUUID(), actor = randomUUID();
    try {
      await db.organization.create({ data: { id: org, name: 'Isolated source artifact regression' } });
      await db.user.create({ data: { id: actor, email: `${actor}@example.invalid`, providerName: 'LOCAL', timezone: 0 } });
      await db.userOrganization.create({ data: { userId: actor, organizationId: org, role: 'EDITOR' } });
      const piece = await db.contentPiece.create({ data: { organizationId: org, title: 'Source core', body: 'Old core', createdByUserId: actor, language: 'en' } });
      const integration = await db.integration.create({ data: { organizationId: org, internalId: randomUUID(), name: 'Synthetic disconnected source only', providerIdentifier: 'telegram', type: 'social', token: 'synthetic-no-provider-credential', disabled: true, contentLanguage: 'ru' } });
      const post = await db.post.create({ data: { organizationId: org, integrationId: integration.id, state: 'DRAFT', group: randomUUID(), publishDate: new Date(), content: '<p>Правка 12,5 кг. Без сахара.</p>\n' } });
      const adaptation = await db.contentDerivation.create({ data: { organizationId: org, contentPieceId: piece.id, integrationId: integration.id, postId: post.id, platform: 'telegram', format: 'post', body: 'Stale derivation body' } });
      const reader = new SourceArtifactRepositoryV1(db), ref = await reader.resolve(org, actor, { version: 1, kind: 'adaptation', pieceId: piece.id, adaptationId: adaptation.id });
      return await run({ org, actor, piece, integration, post, adaptation, reader, source: ref });
    } finally {
      await db.organization.deleteMany({ where: { id: org } });
      await db.user.deleteMany({ where: { id: actor } });
    }
  }
  const draftData = f => ({ organizationId: f.org, userId: f.actor, pieceId: f.piece.id, pieceRevision: videoSourceRevisionV1(f.piece), brief: { sourceArtifact: f.source }, settings: {} });

  test('post-only manual edit blocks the actual video draft writer without modifying core or derivation', () => fixture(async f => {
    await db.post.update({ where: { id: f.post.id }, data: { content: 'Изменение только в посте.' } });
    await expect(new VideoGenerationRepository(db).createDraft(draftData(f))).rejects.toMatchObject({ response: { code: 'SOURCE_ARTIFACT_STALE' } });
    expect(await db.videoPromptDraft.count({ where: { organizationId: f.org } })).toBe(0);
    expect((await db.contentPiece.findUnique({ where: { id: f.piece.id } })).body).toBe('Old core');
    expect((await db.contentDerivation.findUnique({ where: { id: f.adaptation.id } })).body).toBe('Stale derivation body');
  }));

  test('a genuinely standalone adaptation edit is authoritative without an integration/post or any base-piece mutation', () => fixture(async f => {
    await db.contentDerivation.update({ where: { id: f.adaptation.id }, data: { postId: null, integrationId: null, body: 'Самостоятельная текущая адаптация.' } });
    const selection = { version: 1, kind: 'adaptation', pieceId: f.piece.id, adaptationId: f.adaptation.id };
    const first = await f.reader.resolve(f.org, f.actor, selection);
    await db.contentDerivation.update({ where: { id: f.adaptation.id }, data: { body: 'Самостоятельная адаптация после правки.' } });
    await expect(f.reader.resolve(f.org, f.actor, first.ref)).rejects.toMatchObject({ response: { code: 'SOURCE_ARTIFACT_STALE' } });
    f.source = await f.reader.resolve(f.org, f.actor, selection);
    expect(f.source.ref.postId).toBeUndefined(); expect(f.source.text).toBe('Самостоятельная адаптация после правки.');
    await new VideoGenerationRepository(db).createDraft(draftData(f));
    expect((await db.contentPiece.findUnique({ where: { id: f.piece.id } })).body).toBe('Old core');
    expect(await db.videoPromptDraft.count({ where: { organizationId: f.org } })).toBe(1);
  }));

  test('owned standalone edit and concurrent exact replay update only derivation once with one durable receipt', () => fixture(async f => {
    const channelId = `draft_${randomUUID()}`;
    await db.contentPiece.update({ where: { id: f.piece.id }, data: { kind: 'CORE', brief: { version: 'social-factory-material/v1',
      material: { channelId, platform: 'telegram', destination: { kind: 'draft', id: channelId, publishable: false } } } } });
    await db.contentDerivation.update({ where: { id: f.adaptation.id }, data: { postId: null, integrationId: null } });
    await db.socialFactoryRecord.create({ data: { organizationId: f.org, kind: 'draft_destination', id: channelId, payload: { version: 1, id: channelId, kind: 'draft', publishable: false,
      actorId: f.actor, platform: 'telegram', locale: 'ru', name: 'Synthetic standalone target', requestDigest: 'a'.repeat(64) } } });
    const original = await f.reader.resolve(f.org, f.actor, { version: 1, kind: 'adaptation', pieceId: f.piece.id, adaptationId: f.adaptation.id });
    const input = { sourceArtifact: original.ref, body: 'Только самостоятельная адаптация после ручной правки.', requestId: randomUUID() };
    const [first, replay] = await Promise.all([f.reader.editDraft(f.org, f.actor, input), f.reader.editDraft(f.org, f.actor, input)]);
    expect(replay).toEqual(first); expect(first.text).toBe(input.body); expect(first.ref.postId).toBeUndefined();
    expect((await db.contentPiece.findUnique({ where: { id: f.piece.id } })).body).toBe('Old core');
    expect((await db.contentDerivation.findUnique({ where: { id: f.adaptation.id } })).body).toBe(input.body);
    expect(await db.post.count({ where: { organizationId: f.org } })).toBe(1);
    expect(await db.socialFactoryRecord.count({ where: { organizationId: f.org, kind: 'action' } })).toBe(1);
    await expect(f.reader.editDraft(f.org, f.actor, { ...input, body: 'Changed request body' })).rejects.toMatchObject({ response: { code: 'SOURCE_ARTIFACT_IDEMPOTENCY_CONFLICT' } });
    await db.socialFactoryRecord.update({ where: { organizationId_kind_id: { organizationId: f.org, kind: 'draft_destination', id: channelId } }, data: { invalidatedAt: new Date() } });
    await expect(f.reader.editDraft(f.org, f.actor, input)).rejects.toMatchObject({ response: { code: 'SOURCE_ARTIFACT_DRAFT_ONLY' } });
  }));

  test('writer fences preserve every actual updatedAt and the source revision, including SQL NULL brief', () => fixture(async f => {
    await db.$transaction(tx => assertSourceArtifactCurrentV1(tx, f.org, f.actor, f.source.ref), { isolationLevel: 'Serializable' });
    const current = await f.reader.resolve(f.org, f.actor, f.source.ref);
    expect(current.ref).toEqual(f.source.ref);
    expect((await db.contentPiece.findUnique({ where: { id: f.piece.id } })).updatedAt).toEqual(f.piece.updatedAt);
    expect((await db.contentDerivation.findUnique({ where: { id: f.adaptation.id } })).updatedAt).toEqual(f.adaptation.updatedAt);
    expect((await db.post.findUnique({ where: { id: f.post.id } })).updatedAt).toEqual(f.post.updatedAt);
    expect((await db.integration.findUnique({ where: { id: f.integration.id } })).updatedAt).toEqual(f.integration.updatedAt);
  }));

  test('a concurrent post edit cannot commit between the locked source assertion and the source-bound draft write', () => fixture(async f => {
    let locked, release; const lockedPromise = new Promise(resolve => { locked = resolve; }), releasePromise = new Promise(resolve => { release = resolve; });
    let writer;
    try {
      writer = db.$transaction(async tx => {
        await assertSourceArtifactCurrentV1(tx, f.org, f.actor, f.source.ref); locked(); await releasePromise;
        return tx.videoPromptDraft.create({ data: draftData(f) });
      }, { isolationLevel: 'Serializable', timeout: 10000 });
      await lockedPromise;
      let edited = false;
      const editor = db.post.update({ where: { id: f.post.id }, data: { content: 'Правка после сохранения связанного черновика.' } }).then(row => { edited = true; return row; });
      await new Promise(resolve => setTimeout(resolve, 40)); expect(edited).toBe(false);
      release(); await writer; await editor;
      expect(await db.videoPromptDraft.count({ where: { organizationId: f.org } })).toBe(1);
      await expect(f.reader.resolve(f.org, f.actor, f.source.ref)).rejects.toMatchObject({ response: { code: 'SOURCE_ARTIFACT_STALE' } });
    } finally { release?.(); await writer?.catch(() => {}); }
  }));

  test('an edit winning after the source read causes serializable retry and refuses the stale writer', () => fixture(async f => {
    let edited = false, attempts = 0;
    await expect(serializableWithRetry(db, async tx => {
      attempts++;
      const sourceTx = { userOrganization: tx.userOrganization, contentPiece: tx.contentPiece, contentDerivation: tx.contentDerivation, integration: tx.integration,
        post: { findFirst: async query => {
          const post = await tx.post.findFirst(query);
          if (!edited) { edited = true; await db.post.update({ where: { id: f.post.id }, data: { content: 'Правка выиграла до замка источника.' } }); }
          return post;
        }, updateMany: query => tx.post.updateMany(query) } };
      await assertSourceArtifactCurrentV1(sourceTx, f.org, f.actor, f.source.ref);
      return tx.videoPromptDraft.create({ data: draftData(f) });
    }, 'Synthetic source writer busy')).rejects.toMatchObject({ response: { code: 'SOURCE_ARTIFACT_STALE' } });
    expect(attempts).toBeGreaterThanOrEqual(2); expect(await db.videoPromptDraft.count({ where: { organizationId: f.org } })).toBe(0);
    expect((await db.post.findUnique({ where: { id: f.post.id } })).content).toBe('Правка выиграла до замка источника.');
  }));
});
