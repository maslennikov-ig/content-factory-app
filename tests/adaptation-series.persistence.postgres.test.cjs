'use strict';
require('reflect-metadata');
const { randomUUID, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const rawUrl = process.env.CF_SERIES_TEST_DATABASE_URL;
if (rawUrl) {
  const url = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      url.pathname !== '/cf-dev-db' || url.hash || [...url.searchParams.keys()].length) {
    throw new Error('Series test requires explicit loopback cf-dev-db without URL overrides.');
  }
}
const suite = rawUrl ? describe : describe.skip;
const prismaMock = { PrismaRepository: class {}, PrismaTransaction: class {} };
const { PostsRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': prismaMock,
});
const { ContentBriefRepository } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': prismaMock,
  '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository': { PostsRepository },
});

suite('atomic adaptation series, isolated PostgreSQL schema', () => {
  jest.setTimeout(90_000);
  let admin, db, repo, posts, schema;
  const org = 'fixture-org', actor = 'fixture-user', channel = 'fixture-channel', piece = 'fixture-piece';
  const sourceBrief = { version: 'fixture', facts: ['a', 'b'], nested: { z: 2, a: 1 } };
  const input = () => ({ seriesId: `series-${randomUUID()}`, actorUserId: actor, pieceId: piece, channelId: channel,
    providerIdentifier: 'telegram', kind: 'post', sourceBody: 'Original neutral core.', sourceBrief,
    date: '2026-10-27T12:00:00.000Z', parts: [1, 2, 3].map(index => ({
      body: `Part ${index}`, content: `<p>Part ${index}</p>`, title: `Title ${index}`, format: 'text',
    })) });
  beforeAll(async () => {
    schema = `cf_series_${randomUUID().replaceAll('-', '')}`;
    admin = new Client({ connectionString: rawUrl });
    await admin.connect();
    const migration = execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel',
      'libraries/nestjs-libraries/src/database/prisma/schema.prisma', '--script'], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    await admin.query(migration);
    const url = new URL(rawUrl); url.searchParams.set('schema', schema);
    db = new PrismaClient({ datasources: { db: { url: url.href } } });
    await db.organization.create({ data: { id: org, name: 'Series test' } });
    await db.user.create({ data: { id: actor, email: 'series-user@example.test', providerName: 'LOCAL', timezone: 0 } });
    await db.user.create({ data: { id: 'other-user', email: 'series-other@example.test', providerName: 'LOCAL', timezone: 0 } });
    await db.userOrganization.createMany({ data: [
      { userId: actor, organizationId: org, role: 'EDITOR' }, { userId: 'other-user', organizationId: org, role: 'EDITOR' },
    ] });
    await db.integration.create({ data: { id: channel, organizationId: org, name: 'Channel', internalId: 'test-channel',
      providerIdentifier: 'telegram', type: 'social', token: 'synthetic' } });
    await db.contentPiece.create({ data: { id: piece, organizationId: org, createdByUserId: actor, kind: 'CORE',
      title: 'Core', body: 'Original neutral core.', brief: sourceBrief } });
    const ref = { model: db };
    posts = new PostsRepository(ref, ref, ref, ref, ref, ref, ref);
    repo = new ContentBriefRepository(ref, posts);
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
    if (admin) {
      await admin.query('SET search_path TO public');
      if (/^cf_series_[a-f0-9]{32}$/.test(schema || '')) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await db.contentDerivation.deleteMany();
    await db.post.deleteMany();
    await db.contentPiece.update({ where: { id: piece }, data: { body: 'Original neutral core.', brief: sourceBrief, tags: { otherSetting: 'kept' }, archivedAt: null } });
  });

  test('middle-part failure rolls back post, derivation and receipt together', async () => {
    const original = posts.createOrUpdatePost.bind(posts); let calls = 0;
    posts.createOrUpdatePost = async (...args) => { if (++calls === 2) throw Error('controlled second post failure'); return original(...args); };
    try { await expect(repo.createAdaptationSeries(org, { ...input(), materialAsk: ask() })).rejects.toThrow('controlled second post failure'); }
    finally { posts.createOrUpdatePost = original; }
    expect(await db.post.count()).toBe(0);
    expect(await db.contentDerivation.count()).toBe(0);
    const pieceAfter = await db.contentPiece.findUnique({ where: { id: piece } });
    expect(pieceAfter.brief).toEqual(sourceBrief);
    expect(pieceAfter.tags).toEqual({ otherSetting: 'kept' });
  });

  const ask = () => ({ adaptationId: '', length: 300, min: 500,
    questions: [{ key: 'ask-1', question: 'What else matters?', suggested: null, why: 'Add context' }],
    state: 'open', core: createHash('sha256').update('Original neutral core.').digest('hex').slice(0, 16),
    askedAt: '2026-10-27T12:00:00.000Z', closedAt: null });

  test('atomically binds prepared questions to the first draft and replay preserves dismissal', async () => {
    const request = { ...input(), materialAsk: ask() };
    const first = await repo.createAdaptationSeries(org, request);
    let saved = await db.contentPiece.findUnique({ where: { id: piece } });
    expect(saved.tags.otherSetting).toBe('kept');
    expect(saved.tags.materialAsks[channel]).toMatchObject({ ...request.materialAsk, adaptationId: first.parts[0].adaptationId });
    const dismissed = { ...saved.tags.materialAsks[channel], state: 'dismissed', closedAt: '2026-10-27T12:10:00.000Z' };
    await db.contentPiece.update({ where: { id: piece }, data: { tags: { ...saved.tags, materialAsks: { [channel]: dismissed } } } });
    expect(await repo.createAdaptationSeries(org, request)).toEqual({ ...first, created: false });
    saved = await db.contentPiece.findUnique({ where: { id: piece } });
    expect(saved.tags.materialAsks[channel]).toEqual(dismissed);
    expect(await db.post.count()).toBe(3);
  });

  test.each(['dismissed', 'answered'])('questions prepared earlier cannot overwrite a concurrent %s record', async state => {
    const closed = { ...ask(), adaptationId: 'older', state, closedAt: '2026-10-27T12:05:00.000Z' };
    await db.contentPiece.update({ where: { id: piece }, data: { tags: { otherSetting: 'kept', materialAsks: { [channel]: closed } } } });
    const savedSeries = await repo.createAdaptationSeries(org, { ...input(), materialAsk: ask() });
    const saved = await db.contentPiece.findUnique({ where: { id: piece } });
    expect(savedSeries.parts).toHaveLength(3);
    expect(saved.tags.materialAsks[channel]).toEqual(closed);
    expect(saved.tags.otherSetting).toBe('kept');
  });

  test('lost acknowledgement replay preserves the same IDs and a human-edited post', async () => {
    const request = input();
    const first = await repo.createAdaptationSeries(org, request);
    expect(first.created).toBe(true); expect(first.parts).toHaveLength(3);
    const drafts = await db.post.findMany({ orderBy: { content: 'asc' } });
    expect(drafts.every(row => row.state === 'DRAFT')).toBe(true);
    await db.post.update({ where: { id: first.parts[0].postId }, data: { content: '<p>Human edit</p>' } });
    const second = await repo.createAdaptationSeries(org, request);
    expect(second).toEqual({ ...first, created: false });
    expect((await db.post.findUnique({ where: { id: first.parts[0].postId } })).content).toBe('<p>Human edit</p>');
    expect(await db.post.count()).toBe(3); expect(await db.contentDerivation.count()).toBe(3);
    const saved = await db.contentPiece.findUnique({ where: { id: piece } });
    expect(saved.brief.adaptationSeries).toHaveLength(1);
    expect(saved.brief.adaptationSeries[0].parts.map(part => part.ordinal)).toEqual([1, 2, 3]);
  });

  test('a source rewrite preserves the receipt and an old completed request only replays its IDs', async () => {
    const request = input();
    const first = await repo.createAdaptationSeries(org, request);
    const old = await db.contentPiece.findUnique({ where: { id: piece } });
    await repo.updateCore(org, piece, { body: 'Rewritten core', brief: { version: 'new', facts: [] },
      expected: { body: old.body, brief: old.brief } });
    const rewritten = await db.contentPiece.findUnique({ where: { id: piece } });
    expect(rewritten.brief.adaptationSeries).toEqual(old.brief.adaptationSeries);
    expect(await repo.createAdaptationSeries(org, request)).toEqual({ ...first, created: false });
    expect(await db.post.count()).toBe(3);
    await expect(repo.createAdaptationSeries(org, { ...request, seriesId: 'new-series' })).rejects.toMatchObject({ code: 'ADAPTATION_SERIES_SOURCE_CHANGED' });
    expect(await db.post.count()).toBe(3);
  });

  test('metadata and core rewrites cannot forge or replace a completed receipt', async () => {
    const request = input();
    const first = await repo.createAdaptationSeries(org, request);
    let old = await db.contentPiece.findUnique({ where: { id: piece } });
    await repo.updateCoreMetadata(org, piece, { expectedBody: old.body, expectedBrief: old.brief,
      brief: { ...old.brief, notes: 'Saved', adaptationSeries: [] } });
    let current = await db.contentPiece.findUnique({ where: { id: piece } });
    expect(current.brief.adaptationSeries).toEqual(old.brief.adaptationSeries);
    await repo.updateCore(org, piece, { body: current.body, brief: { ...current.brief, adaptationSeries: [] } });
    current = await db.contentPiece.findUnique({ where: { id: piece } });
    expect(current.brief.adaptationSeries).toEqual(old.brief.adaptationSeries);
    expect(await repo.createAdaptationSeries(org, request)).toEqual({ ...first, created: false });
    expect(await db.post.count()).toBe(3);
  });

  test('legacy core with a null brief can be updated without allowing receipt injection', async () => {
    await db.contentPiece.update({ where: { id: piece }, data: { brief: require('@prisma/client').Prisma.DbNull } });
    await repo.updateCore(org, piece, { body: 'Legacy rewritten', brief: { text: 'New', adaptationSeries: [{ seriesId: 'forged' }] } });
    const current = await db.contentPiece.findUnique({ where: { id: piece } });
    expect(current.body).toBe('Legacy rewritten');
    expect(current.brief).toEqual({ text: 'New' });
  });

  test('different actor, tenant, channel, changed input and source refuse without additional drafts', async () => {
    const request = input();
    await repo.createAdaptationSeries(org, request);
    await expect(repo.createAdaptationSeries(org, { ...request, actorUserId: 'other-user' })).rejects.toMatchObject({ code: 'ADAPTATION_SERIES_CONFLICT' });
    await expect(repo.createAdaptationSeries('other-org', request)).rejects.toMatchObject({ code: 'ADAPTATION_SERIES_UNAVAILABLE' });
    await expect(repo.createAdaptationSeries(org, { ...request, parts: [{ ...request.parts[0], body: 'Different' }] })).rejects.toMatchObject({ code: 'ADAPTATION_SERIES_CONFLICT' });
    await expect(repo.createAdaptationSeries(org, { ...input(), channelId: 'foreign-channel' })).rejects.toMatchObject({ code: 'ADAPTATION_SERIES_UNAVAILABLE' });
    await db.contentPiece.update({ where: { id: piece }, data: { body: 'Changed by author' } });
    await expect(repo.createAdaptationSeries(org, input())).rejects.toMatchObject({ code: 'ADAPTATION_SERIES_SOURCE_CHANGED' });
    expect(await db.post.count()).toBe(3); expect(await db.contentDerivation.count()).toBe(3);
  });

  test('fresh role demotion refuses saving without draft writes', async () => {
    await db.userOrganization.updateMany({ where: { organizationId: org, userId: actor }, data: { role: 'USER' } });
    await expect(repo.createAdaptationSeries(org, input())).rejects.toMatchObject({ code: 'ADAPTATION_SERIES_UNAVAILABLE' });
    expect(await db.post.count()).toBe(0);
    await db.userOrganization.updateMany({ where: { organizationId: org, userId: actor }, data: { role: 'EDITOR' } });
  });

  test('simultaneous identical requests create once, and independent receipts merge', async () => {
    const request = input();
    const same = await Promise.all([repo.createAdaptationSeries(org, request), repo.createAdaptationSeries(org, request)]);
    expect(same.map(value => value.created).sort()).toEqual([false, true]);
    expect(same[0].parts).toEqual(same[1].parts);
    const a = input(), b = input();
    await Promise.all([repo.createAdaptationSeries(org, a), repo.createAdaptationSeries(org, b)]);
    const saved = await db.contentPiece.findUnique({ where: { id: piece } });
    expect(saved.brief.adaptationSeries.map(receipt => receipt.seriesId).sort()).toEqual([request.seriesId, a.seriesId, b.seriesId].sort());
    expect(await db.post.count()).toBe(9); expect(await db.contentDerivation.count()).toBe(9);
  });
});
