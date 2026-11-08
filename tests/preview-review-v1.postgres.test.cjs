const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify')(new JSDOM('').window);
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { AuthService } = loadWithMocks('libraries/helpers/src/auth/auth.service.ts');
const { PreviewReviewServiceV1, reviewHashV1, reviewTextV1 } = loadWithMocks('libraries/nestjs-libraries/src/preview-review/v1/preview-review.service.ts', { 'isomorphic-dompurify': DOMPurify });
const { PreviewReviewRepositoryV1 } = loadWithMocks('libraries/nestjs-libraries/src/preview-review/v1/preview-review.repository.ts');
const { MediaRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts');

const databaseUrl = process.env.CF_PREVIEW_REVIEW_TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !parsed.searchParams.get('schema') || parsed.searchParams.get('schema') === 'public' || [...parsed.searchParams.keys()].some(key => ['host', 'hostaddr', 'service', 'servicefile'].includes(key.toLowerCase())) || process.env.CF_DOCKER_CI_DISPOSABLE_POSTGRES !== '1') throw new Error('Preview review tests require an explicitly marked loopback disposable database and a private schema');
}

(databaseUrl ? describe : describe.skip)('preview review V1 against real Prisma/PostgreSQL with two tenants', () => {
  let prisma, service, a, b, userA, userB, postA, postB, actor, requestA, requestB;
  const previousJwtSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.JWT_SECRET = `preview-review-test-${randomUUID()}`;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    const suffix = randomUUID();
    userA = await prisma.user.create({ data: { email: `preview-review-a-${suffix}@example.invalid`, providerName: 'LOCAL', timezone: 0, name: 'Team A' } });
    userB = await prisma.user.create({ data: { email: `preview-review-b-${suffix}@example.invalid`, providerName: 'LOCAL', timezone: 0, name: 'Team B' } });
    a = await prisma.organization.create({ data: { name: 'Preview fixture A', users: { create: { userId: userA.id, role: 'ADMIN' } } } });
    b = await prisma.organization.create({ data: { name: 'Preview fixture B', users: { create: { userId: userB.id, role: 'ADMIN' } } } });
    const integrationA = await prisma.integration.create({ data: { organizationId: a.id, internalId: suffix + '-a', name: 'Fixture A', type: 'social', providerIdentifier: 'telegram', token: 'synthetic-fixture-only' } });
    const integrationB = await prisma.integration.create({ data: { organizationId: b.id, internalId: suffix + '-b', name: 'Fixture B', type: 'social', providerIdentifier: 'telegram', token: 'synthetic-fixture-only' } });
    postA = await prisma.post.create({ data: { organizationId: a.id, integrationId: integrationA.id, content: '<p>Hello world</p>', state: 'DRAFT', group: suffix + '-a', publishDate: new Date('2035-01-01T00:00:00Z') } });
    postB = await prisma.post.create({ data: { organizationId: b.id, integrationId: integrationB.id, content: '<p>Private B</p>', state: 'DRAFT', group: suffix + '-b', publishDate: new Date('2035-01-01T00:00:00Z') } });
    service = new PreviewReviewServiceV1(new PreviewReviewRepositoryV1(prisma));
    requestA = { headers: { auth: AuthService.signSessionJWT({ id: userA.id }) }, cookies: {} };
    requestB = { headers: { auth: AuthService.signSessionJWT({ id: userB.id }) }, cookies: {} };
    actor = await service.authorize(postA.id, requestA);
  }, 30000);
  afterAll(async () => {
    if (prisma) {
      for (const organization of [a, b]) if (organization) {
        // Exact synthetic fixture records only; no shared schema/drop operation.
        await prisma.previewReviewCommentV1.deleteMany({ where: { organizationId: organization.id } });
        await prisma.organization.delete({ where: { id: organization.id } });
      }
      for (const user of [userA, userB]) if (user) await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    }
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousJwtSecret;
  }, 30000);

  test('team/guest threads, replies, resolve/reopen, legacy rows and revision drift use the actual tables', async () => {
    await prisma.comments.create({ data: { organizationId: a.id, postId: postA.id, userId: userA.id, content: 'Legacy row retained' } });
    const grant = await service.createGrant(actor);
    const saved = await prisma.previewReviewGrantV1.findUnique({ where: { id: grant.id } });
    expect(saved.tokenHash).toBe(reviewHashV1(grant.token)); expect(saved).not.toHaveProperty('token');
    const guestRequest = { headers: { 'x-preview-grant': grant.token }, cookies: {} };
    const guest = await service.authorize(postA.id, guestRequest);
    const text = reviewTextV1(postA.content);
    const thread = await service.createThread(guest, { content: 'Check the word', guestName: 'External reviewer', anchor: { postId: postA.id, quote: 'world', start: 6, end: 11, revision: reviewHashV1(text) } });
    await service.reply(actor, thread.id, { content: 'Team reply' });
    await service.reply(guest, thread.id, { content: 'Guest reply', guestName: 'External reviewer' });
    let discussions = await service.discussions(guest);
    expect(discussions.threads[0].comments).toHaveLength(3);
    expect(discussions.threads[0].comments.map(comment => comment.unverified)).toEqual([true, false, true]);
    expect(discussions.legacyComments[0]).toMatchObject({ content: 'Legacy row retained', unanchored: true });
    expect(discussions.threads[0].anchor.stale).toBe(false);
    expect(() => service.resolve(guest, thread.id, true)).toThrow();
    await service.resolve(actor, thread.id, true);
    expect((await service.discussions(actor)).threads[0].resolvedAt).not.toBeNull();
    await service.resolve(actor, thread.id, false);
    expect((await service.discussions(actor)).threads[0].resolvedAt).toBeNull();
    await prisma.post.update({ where: { id: postA.id }, data: { content: '<p>Hello world</p><p>Changed ending</p>' } });
    discussions = await service.discussions(guest);
    expect(discussions.threads[0].anchor).toMatchObject({ quote: 'world', start: 6, end: 11, stale: true });
    expect((await service.preview(guest))[0].reviewText).toContain('Changed ending');
    expect(await prisma.comments.count({ where: { postId: postA.id, userId: userA.id } })).toBe(1);
    await service.revoke(actor, grant.id);
    await expect(service.authorize(postA.id, guestRequest)).rejects.toMatchObject({ status: 403 });
  });

  test('cross-tenant posts, thread ids, grants and attachments are refused; expired and replaced grants stop working', async () => {
    const actorB = await service.authorize(postB.id, requestB);
    const threadB = await service.createThread(actorB, { content: 'Private B discussion' });
    const grantA = await service.createGrant(actor);
    const guestRequest = { headers: { 'x-preview-grant': grantA.token }, cookies: {} };
    await expect(service.authorize(postB.id, requestA)).rejects.toMatchObject({ status: 404 });
    await expect(service.authorize(postB.id, guestRequest)).rejects.toMatchObject({ status: 403 });
    await expect(service.reply(actor, threadB.id, { content: 'Foreign reply' })).rejects.toMatchObject({ status: 404 });
    await expect(service.resolve(actor, threadB.id, true)).rejects.toMatchObject({ status: 404 });
    const foreignMedia = await prisma.media.create({ data: { organizationId: b.id, name: 'private.jpg', path: '/synthetic/private-b.jpg' } });
    await prisma.post.update({ where: { id: postA.id }, data: { image: JSON.stringify([{ id: foreignMedia.id, path: foreignMedia.path }]) } });
    expect(JSON.parse((await service.preview(actor))[0].image)).toEqual([]);
    await expect(service.assertMedia(actor, foreignMedia.id)).rejects.toMatchObject({ status: 404 });
    await prisma.previewReviewGrantV1.update({ where: { id: grantA.id }, data: { expiresAt: new Date('2001-01-01T00:00:00Z') } });
    await expect(service.authorize(postA.id, guestRequest)).rejects.toMatchObject({ status: 403 });
    const replacement = await service.createGrant(actor, 7, grantA.id);
    expect((await service.authorize(postA.id, { headers: { 'x-preview-grant': replacement.token }, cookies: {} })).kind).toBe('guest');
    expect((await prisma.previewReviewGrantV1.findUnique({ where: { id: grantA.id } })).revokedAt).not.toBeNull();
    await expect(service.authorize(postA.id, guestRequest)).rejects.toMatchObject({ status: 403 });
  });

  test('database-level composite foreign keys reject foreign grants on comments; blocked users lose read and write access', async () => {
    const actorB = await service.authorize(postB.id, requestB);
    const foreignGrant = await service.createGrant(actorB);
    const localThread = await service.createThread(actor, { content: 'Local thread' });
    await expect(prisma.previewReviewCommentV1.create({ data: { organizationId: a.id, postId: postA.id, threadId: localThread.id, content: 'Forbidden mixed scope', guestGrantId: foreignGrant.id, guestName: 'Name' } })).rejects.toMatchObject({ code: 'P2003' });
    await prisma.user.update({ where: { id: userA.id }, data: { blockedAt: new Date() } });
    try {
      await expect(service.authorize(postA.id, requestA)).rejects.toMatchObject({ status: 404 });
      await expect(service.reply(actor, localThread.id, { content: 'Blocked write' })).rejects.toMatchObject({ status: 404 });
    } finally { await prisma.user.update({ where: { id: userA.id }, data: { blockedAt: null } }); }
  });

  test('real serializable object registration preserves one workspace owner across concurrent claims and deletion', async () => {
    const mediaRepository = new MediaRepository({ model: prisma });
    const path = `https://synthetic.example/${randomUUID()}.mp4`;
    const claims = await Promise.allSettled([
      mediaRepository.saveRegisteredObjectV1(a.id, 'clip.mp4', path),
      mediaRepository.saveRegisteredObjectV1(b.id, 'clip.mp4', path),
    ]);
    expect(claims.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(claims.filter(result => result.status === 'rejected')[0].reason).toMatchObject({ status: 403 });
    const rows = await prisma.media.findMany({ where: { path } });
    expect(rows).toHaveLength(1);
    expect((await mediaRepository.saveRegisteredObjectV1(rows[0].organizationId, 'same-object.mp4', path)).id).toBe(rows[0].id);
    await prisma.media.update({ where: { id: rows[0].id }, data: { deletedAt: new Date() } });
    for (const organizationId of [a.id, b.id]) {
      await expect(mediaRepository.saveRegisteredObjectV1(organizationId, 'clip.mp4', path)).rejects.toMatchObject({ status: 403 });
    }
    expect(await prisma.media.count({ where: { path } })).toBe(1);
  });
});
