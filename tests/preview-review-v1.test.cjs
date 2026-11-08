const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify')(new JSDOM('').window);
const { PreviewReviewServiceV1, reviewHashV1, reviewTextV1, reviewCookieNameV1, assertReviewMutationV1 } = loadWithMocks('libraries/nestjs-libraries/src/preview-review/v1/preview-review.service.ts', {
  'isomorphic-dompurify': DOMPurify,
  '@contentfactory/helpers/auth/auth.service': { AuthService: { verifySessionJWT: token => token === 'session-a' ? { id: 'user-a' } : token === 'session-b' ? { id: 'user-b' } : null } },
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaService: class {} },
});
const { PreviewReviewRepositoryV1 } = loadWithMocks('libraries/nestjs-libraries/src/preview-review/v1/preview-review.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaService: class {} },
});
const now = new Date('2035-01-01T00:00:00Z');
const token = 'a'.repeat(43);
const team = { kind: 'team', userId: 'user-a', organizationId: 'org-a', postId: 'post-a' };
const guest = { kind: 'guest', grantId: 'grant-a', organizationId: 'org-a', postId: 'post-a', expiresAt: new Date('2035-01-08T00:00:00Z') };
const currentPost = () => ({ id: 'post-a', content: '<p>Hello <strong>world</strong></p><p>Second line</p>', image: '[]', publishDate: now, integration: { id: 'integration-a', name: 'Channel', displayName: 'Local alias', providerIdentifier: 'telegram', profile: 'channel' }, childrenPost: [] });

function fixture() {
  const repository = {
    postScope: jest.fn(async id => id === 'post-a' ? { organizationId: 'org-a' } : null),
    member: jest.fn(async (user, org) => user === 'user-a' && org === 'org-a' ? { userId: user } : null),
    grant: jest.fn(async (hash, id, at) => hash === reviewHashV1(token) && id === 'post-a' && at < guest.expiresAt ? { ...guest, id: 'grant-a' } : null),
    preview: jest.fn(async () => [currentPost()]), media: jest.fn(async () => []), registeredMediaIds: jest.fn(async () => []),
    discussions: jest.fn(async () => []), legacyComments: jest.fn(async () => [{ id: 'legacy', content: 'Earlier', user: { name: 'Legacy', lastName: 'Author' }, createdAt: now }]),
    createThread: jest.fn(async () => ({ id: 'thread-a' })), reply: jest.fn(async () => ({ id: 'reply-a' })),
    resolve: jest.fn(async () => ({ resolved: true })), grants: jest.fn(async () => []),
    createGrant: jest.fn(async (_actor, _hash, expiresAt) => ({ id: 'new-grant', expiresAt })), revoke: jest.fn(async () => ({ revoked: true })),
  };
  return { repository, service: new PreviewReviewServiceV1(repository) };
}
beforeEach(() => { jest.useFakeTimers({ now }); process.env.FRONTEND_URL = 'https://factory.example'; });
afterEach(() => jest.useRealTimers());

test('anonymous legacy preview access is refused; active membership is scoped to the actual post organization', async () => {
  const { service, repository } = fixture();
  await expect(service.authorize('post-a', { headers: {}, cookies: {} })).rejects.toMatchObject({ status: 403 });
  await expect(service.authorize('post-a', { headers: { auth: 'session-b' }, cookies: {} })).rejects.toMatchObject({ status: 404 });
  expect(await service.authorize('post-a', { headers: { auth: 'session-a' }, cookies: {} })).toEqual(team);
  expect(repository.member).toHaveBeenLastCalledWith('user-a', 'org-a');
});

test('a valid grant stays a guest even beside a team session; foreign, expired, revoked and malformed grants fail', async () => {
  const { service, repository } = fixture();
  const request = { headers: { auth: 'session-a', 'x-preview-grant': token }, cookies: {} };
  expect((await service.authorize('post-a', request)).kind).toBe('guest');
  expect(repository.member).not.toHaveBeenCalled();
  await expect(service.authorize('post-b', request)).rejects.toMatchObject({ status: 403 });
  jest.setSystemTime(new Date('2035-01-09T00:00:00Z'));
  await expect(service.authorize('post-a', request)).rejects.toMatchObject({ status: 403 });
  jest.setSystemTime(now); repository.grant.mockResolvedValue(null);
  await expect(service.authorize('post-a', request)).rejects.toMatchObject({ status: 403 });
  await expect(service.authorize('post-a', { headers: { 'x-preview-grant': 'bad' }, cookies: {} })).rejects.toMatchObject({ status: 403 });
});

test('media-only cookies are checked per request and never authenticate the JSON door', async () => {
  const { service, repository } = fixture();
  const request = { headers: {}, cookies: { [reviewCookieNameV1('post-a')]: token } };
  expect((await service.authorize('post-a', request, true)).kind).toBe('guest');
  await expect(service.authorize('post-a', request)).rejects.toMatchObject({ status: 403 });
  repository.grant.mockResolvedValue(null);
  await expect(service.authorize('post-a', request, true)).rejects.toMatchObject({ status: 403 });
});

test('blocked users are excluded from both membership lookup and transaction revalidation', async () => {
  const queries = [];
  const prisma = { userOrganization: { findFirst: jest.fn(async query => { queries.push(query); return null; }) }, post: { findFirst: jest.fn(async () => ({ id: 'post-a' })) } };
  prisma.$transaction = fn => fn(prisma);
  const repository = new PreviewReviewRepositoryV1(prisma);
  expect(await repository.member('blocked-user', 'org-a')).toBeNull();
  await expect(repository.resolve({ ...team, userId: 'blocked-user' }, 'thread', true)).rejects.toThrow();
  expect(queries).toHaveLength(2);
  for (const query of queries) expect(query.where).toMatchObject({ organizationId: 'org-a', disabled: false, user: { activated: true, blockedAt: null } });
});

test('creating a link returns the bearer once, stores only its hash and uses a seven-day default; reissue names the previous grant', async () => {
  const { service, repository } = fixture();
  const created = await service.createGrant(team);
  expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const [actor, hash, expiresAt] = repository.createGrant.mock.calls[0];
  expect(actor).toEqual(team); expect(hash).toBe(reviewHashV1(created.token)); expect(hash).not.toContain(created.token);
  expect(expiresAt.getTime() - now.getTime()).toBe(7 * 86400000);
  await service.createGrant(team, 7, 'old-grant');
  expect(repository.createGrant.mock.calls[1][3]).toBe('old-grant');
});

test('guests cannot resolve, reopen, list/create/reissue or revoke grants', async () => {
  const { service, repository } = fixture();
  for (const action of [() => service.resolve(guest, 'thread', true), () => service.resolve(guest, 'thread', false), () => service.grants(guest), () => service.revoke(guest, 'grant')]) expect(action).toThrow();
  await expect(service.createGrant(guest)).rejects.toMatchObject({ status: 403 });
  expect(repository.resolve).not.toHaveBeenCalled(); expect(repository.createGrant).not.toHaveBeenCalled();
});

test('quotes are checked against the exact text revision; forged offsets and stale revisions never write', async () => {
  const { service, repository } = fixture();
  const text = reviewTextV1(currentPost().content);
  const anchor = { postId: 'post-a', quote: 'world', start: 6, end: 11, revision: reviewHashV1(text) };
  await service.createThread(guest, { content: 'Please check this', guestName: 'Reviewer', anchor });
  expect(repository.createThread).toHaveBeenCalledWith(guest, { anchorPostId: 'post-a', anchorQuote: 'world', anchorStart: 6, anchorEnd: 11, anchorRevision: anchor.revision }, 'Please check this', 'Reviewer');
  await expect(service.createThread(team, { content: 'Wrong', anchor: { ...anchor, quote: 'Hello' } })).rejects.toMatchObject({ status: 400 });
  await expect(service.createThread(team, { content: 'Old', anchor: { ...anchor, revision: '0'.repeat(64) } })).rejects.toMatchObject({ status: 409 });
  await expect(service.createThread(team, { content: 'Other', anchor: { ...anchor, postId: 'post-b' } })).rejects.toMatchObject({ status: 400 });
  expect(repository.createThread).toHaveBeenCalledTimes(1);
});

test('any text change marks an anchor stale without replacing the saved quote or offsets; legacy comments stay unanchored', async () => {
  const { service, repository } = fixture();
  const quote = 'world'; const revision = reviewHashV1(reviewTextV1(currentPost().content));
  repository.discussions.mockResolvedValue([{ id: 'thread', anchorPostId: 'post-a', anchorQuote: quote, anchorStart: 6, anchorEnd: 11, anchorRevision: revision, comments: [{ id: 'comment', content: 'Check', guestGrantId: 'grant', guestName: 'Reviewer', createdAt: now }], resolvedAt: null }]);
  let result = await service.discussions(guest);
  expect(result.threads[0].anchor.stale).toBe(false); expect(result.threads[0].comments[0].unverified).toBe(true);
  repository.preview.mockResolvedValue([{ ...currentPost(), content: currentPost().content + '<p>New ending</p>' }]);
  result = await service.discussions(guest);
  expect(result.threads[0].anchor).toMatchObject({ quote, start: 6, end: 11, revision, stale: true });
  expect(result.legacyComments[0]).toMatchObject({ id: 'legacy', unanchored: true, authorName: 'Legacy Author' });
  expect(result.canManage).toBe(false);
});

test.each([team, guest])('an ordinary uploaded MP4 with the inherited image default remains a video in scoped preview (%s)', async actor => {
  const { service, repository } = fixture();
  repository.preview.mockResolvedValue([{ ...currentPost(), image: JSON.stringify([{ id: 'clip', path: '/storage/clip.mp4' }]) }]);
  repository.media.mockResolvedValue([{ id: 'clip', name: 'clip.mp4', path: '/storage/clip.mp4', type: 'image' }]);
  const preview = await service.preview(actor);
  const attachments = JSON.parse(preview[0].image);
  expect(attachments).toEqual([expect.objectContaining({ id: 'clip', type: 'video', path: '/preview-review/v1/posts/post-a/media/clip' })]);
  expect(JSON.stringify(preview)).not.toContain('/storage/');
});

test('preview attachment metadata never exposes storage paths and cannot authorize a mismatched id/path', async () => {
  const { service, repository } = fixture();
  repository.preview.mockResolvedValue([{ ...currentPost(), image: JSON.stringify([{ id: 'media-a', path: '/storage/private-a' }, { id: 'foreign', path: '/storage/other' }]) }]);
  repository.media.mockImplementation(async (_org, ids, paths) => {
    expect(paths).toEqual([]);
    return ids.includes('media-a') ? [{ id: 'media-a', name: 'cover', path: '/storage/private-a', type: 'image', alt: 'Cover', thumbnail: null }] : [];
  });
  const preview = await service.preview(guest);
  const serialized = JSON.stringify(preview);
  expect(serialized).not.toContain('/storage/'); expect(serialized).not.toContain('tokenHash');
  expect(JSON.parse(preview[0].image)).toEqual([expect.objectContaining({ path: '/preview-review/v1/posts/post-a/media/media-a' })]);
  await expect(service.assertMedia(guest, 'foreign')).rejects.toMatchObject({ status: 404 });
  await expect(service.assertMedia(guest, 'media-a')).resolves.toMatchObject({ path: '/storage/private-a' });
});

test('mutations reject missing/foreign origins, simple forms and missing CSRF header', () => {
  const headers = { origin: 'https://factory.example', 'content-type': 'application/json', 'x-preview-review': '1' };
  expect(() => assertReviewMutationV1({ headers })).not.toThrow();
  for (const overrides of [{ origin: 'https://evil.example' }, { origin: undefined }, { 'content-type': 'text/plain' }, { 'x-preview-review': undefined }]) expect(() => assertReviewMutationV1({ headers: { ...headers, ...overrides } })).toThrow();
});

test('guest names, whitespace and comment lengths are bounded before repository access', async () => {
  const { service, repository } = fixture();
  for (const body of [{ content: ' ', guestName: 'Name' }, { content: 'a'.repeat(4001), guestName: 'Name' }, { content: 'Message', guestName: ' ' }, { content: 'Message', guestName: 'a'.repeat(81) }]) await expect(service.createThread(guest, body)).rejects.toMatchObject({ status: 400 });
  expect(repository.createThread).not.toHaveBeenCalled();
  await service.reply(guest, 'thread', { content: ' Reply ', guestName: ' Reviewer ' });
  expect(repository.reply).toHaveBeenCalledWith(guest, 'thread', 'Reply', 'Reviewer');
});

test('existing error diagnostics strip grant headers, scoped cookies and fragment URLs before collection', () => {
  const { sanitizeErrorEvent } = loadWithMocks('libraries/helpers/src/errors/sanitize.error.event.ts');
  const result = sanitizeErrorEvent({ event_id: 'a'.repeat(32), timestamp: 1, exception: { values: [{ type: 'Error', value: token }] }, request: { headers: { 'x-preview-grant': token }, cookies: { cf_preview_fixture: token }, url: `https://factory.example/p/post-a#review=${token}` }, extra: { bearer: token } }, { service: 'backend', environment: 'test' });
  expect(result).not.toBeNull();
  expect(JSON.stringify(result)).not.toContain(token);
  expect(result).not.toHaveProperty('request');
});
