require('reflect-metadata');
const { EventEmitter } = require('node:events');
const { Readable, Writable } = require('node:stream');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { PreviewReviewControllerV1 } = loadWithMocks('apps/backend/src/api/routes/preview-review.v1.controller.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/media/media.service': { MediaService: class {} },
  '@contentfactory/nestjs-libraries/preview-review/v1/preview-review.service': {
    PreviewReviewServiceV1: class {},
    reviewCookieNameV1: id => `fixture-${id}`,
    assertReviewMutationV1: request => {
      if (request.headers.origin !== 'https://factory.example' || request.headers['x-preview-review'] !== '1') throw new Error('forbidden');
    },
  },
});
const token = 'a'.repeat(43);
const guest = { kind: 'guest', organizationId: 'org-a', postId: 'post-a', grantId: 'grant-a', expiresAt: new Date(Date.now() + 86400000) };
const request = () => Object.assign(new EventEmitter(), { headers: { origin: 'https://factory.example', 'x-preview-review': '1', 'x-preview-grant': token }, cookies: {} });
function response() {
  const chunks = [], headers = {};
  const res = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk); callback(); } });
  res.setHeader = (name, value) => { headers[name] = value; };
  res.status = code => { res.statusCode = code; return res; };
  return { res, chunks, headers };
}

test('media exchange scopes a short HttpOnly cookie to one API media path and uses Secure in production', async () => {
  const previous = { NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL, NODE_ENV: process.env.NODE_ENV };
  process.env.NEXT_PUBLIC_BACKEND_URL = 'https://factory.example/api'; process.env.NODE_ENV = 'production';
  try {
    const review = { authorize: jest.fn(async () => guest) };
    const cookie = jest.fn();
    const controller = new PreviewReviewControllerV1(review, {});
    expect(await controller.mediaSession('post-a', request(), { cookie })).toEqual({ ready: true });
    expect(cookie).toHaveBeenCalledWith('fixture-post-a', token, expect.objectContaining({ path: '/api/preview-review/v1/posts/post-a/media', httpOnly: true, sameSite: 'lax', secure: true }));
    expect(cookie.mock.calls[0][2].maxAge).toBeGreaterThan(0);
    expect(cookie.mock.calls[0][2].maxAge).toBeLessThanOrEqual(30 * 60000);
  } finally { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('every native attachment request rechecks both live grant and current post reference, including thumbnails', async () => {
  const review = { authorize: jest.fn(async () => guest), assertMedia: jest.fn(async () => ({ path: 'fixture/selected-cover.png', filename: 'selected-cover.png' })) };
  const opened = { stream: Readable.from([Buffer.from('fixture-image')]), size: 13, contentType: 'image/png', filename: 'fixture.png', close: jest.fn() };
  const media = { openPreviewMediaV1: jest.fn(async () => opened) };
  const controller = new PreviewReviewControllerV1(review, media);
  const req = request(); const { res, chunks, headers } = response();
  await controller.attachment('post-a', 'media-a', 'thumbnail', req, res);
  expect(review.authorize).toHaveBeenCalledWith('post-a', req, true);
  expect(review.assertMedia).toHaveBeenCalledWith(guest, 'media-a', true, undefined);
  expect(media.openPreviewMediaV1).toHaveBeenCalledWith('fixture/selected-cover.png', 'selected-cover.png', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(Buffer.concat(chunks).toString()).toBe('fixture-image');
  expect(headers['Cache-Control']).toContain('no-store');
  expect(headers['Content-Type']).toBe('image/png');
  expect(opened.close).toHaveBeenCalledTimes(1);
  expect(req.listenerCount('aborted')).toBe(0);
  review.authorize.mockRejectedValue(new Error('revoked'));
  await expect(controller.attachment('post-a', 'media-a', undefined, request(), response().res)).rejects.toThrow('revoked');
  expect(media.openPreviewMediaV1).toHaveBeenCalledTimes(1);
});

test('a foreign or removed attachment never reaches the media resolver', async () => {
  const review = { authorize: jest.fn(async () => guest), assertMedia: jest.fn(async () => { throw new Error('not referenced'); }) };
  const media = { openPreviewMediaV1: jest.fn() };
  await expect(new PreviewReviewControllerV1(review, media).attachment('post-a', 'foreign', undefined, request(), response().res)).rejects.toThrow('not referenced');
  expect(media.openPreviewMediaV1).not.toHaveBeenCalled();
});

test('disconnect aborts the stream and always releases the source', async () => {
  const req = request(); const { res } = response();
  const opened = { stream: new Readable({ read() {} }), contentType: 'video/mp4', filename: 'fixture.mp4', close: jest.fn() };
  const review = { authorize: async () => guest, assertMedia: async () => ({ path: 'fixture/video.mp4', filename: 'video.mp4' }) };
  const media = { openPreviewMediaV1: jest.fn(async () => { setImmediate(() => req.emit('aborted')); return opened; }) };
  await expect(new PreviewReviewControllerV1(review, media).attachment('post-a', 'media-a', undefined, req, res)).rejects.toMatchObject({ name: 'AbortError' });
  expect(opened.close).toHaveBeenCalledTimes(1);
  expect(opened.stream.destroyed).toBe(true);
  expect(req.listenerCount('aborted')).toBe(0);
});

test('all preview JSON and media responses carry a no-store contract', () => {
  for (const method of ['preview', 'discussions', 'createThread', 'reply', 'resolve', 'grants', 'createGrant', 'reissue', 'revoke', 'mediaSession', 'attachment']) {
    const headers = Reflect.getMetadata('__headers__', PreviewReviewControllerV1.prototype[method]);
    expect(headers).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Cache-Control', value: expect.stringContaining('no-store') })]));
  }
});

const { McpMediaControllerV1 } = loadWithMocks('apps/backend/src/api/routes/mcp-media.controller.ts', {
  '@contentfactory/nestjs-libraries/chat/media/mcp-media-upload.service.v1': { McpMediaUploadServiceV1: class {} },
});

test.each(['review', 'mcp'])('%s private preview forwards Range and emits partial response metadata', async kind => {
  const source = { stream: Readable.from([Buffer.from('234')]), size: 3, contentType: 'video/mp4', filename: 'fixture.mp4', status: 206, contentRange: 'bytes 2-4/10', close: jest.fn() };
  const req = request(); req.headers.range = 'bytes=2-4';
  const { res, chunks, headers } = response();
  if (kind === 'review') {
    const media = { openPreviewMediaV1: jest.fn(async () => source) };
    const review = { authorize: async () => guest, assertMedia: async () => ({ path: 'fixture/video.mp4', filename: 'video.mp4' }) };
    await new PreviewReviewControllerV1(review, media).attachment('post-a', 'media-a', undefined, req, res);
    expect(media.openPreviewMediaV1).toHaveBeenCalledWith('fixture/video.mp4', 'video.mp4', expect.objectContaining({ range: 'bytes=2-4', signal: expect.any(AbortSignal) }));
  } else {
    const uploads = { preview: jest.fn(async () => source) };
    await new McpMediaControllerV1(uploads).preview('fixture-preview-token', res, req);
    expect(uploads.preview).toHaveBeenCalledWith('fixture-preview-token', expect.objectContaining({ range: 'bytes=2-4', signal: expect.any(AbortSignal) }));
  }
  expect(res.statusCode).toBe(206);
  expect(headers['Content-Range']).toBe('bytes 2-4/10');
  expect(headers['Accept-Ranges']).toBe('bytes');
  expect(headers['Content-Length']).toBe(3);
  expect(headers['Cache-Control']).toContain('no-store');
  expect(Buffer.concat(chunks).toString()).toBe('234');
  expect(source.close).toHaveBeenCalledTimes(1);
  expect(req.listenerCount('aborted')).toBe(0);
});

test.each(['review', 'mcp'])('%s private preview returns 416 for invalid or unsatisfiable Range', async kind => {
  const req = request(); req.headers.range = 'bytes=999999-';
  const { res, headers } = response();
  const invalid = async () => { throw new Error('MEDIA_RANGE_INVALID'); };
  const operation = kind === 'review'
    ? new PreviewReviewControllerV1({ authorize: async () => guest, assertMedia: async () => ({ path: 'fixture/video.mp4', filename: 'video.mp4' }) }, { openPreviewMediaV1: invalid }).attachment('post-a', 'media-a', undefined, req, res)
    : new McpMediaControllerV1({ preview: invalid }).preview('fixture-preview-token', res, req);
  await expect(operation).rejects.toMatchObject({ status: 416 });
  expect(headers['Cache-Control']).toContain('no-store');
  expect(req.listenerCount('aborted')).toBe(0);
});

test('owned media Range survives the service boundary before reaching the shared reader', async () => {
  const readMediaSource = jest.fn(async () => ({ stream: Readable.from([]), status: 206, size: 3, contentRange: 'bytes 2-4/10', close: () => {} }));
  const { MediaService } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/media/media.service.ts', {
    '@contentfactory/helpers/utils/media.source': { readMediaSource },
    '@contentfactory/helpers/utils/read.or.fetch': { readOrFetch: () => {} },
    './owned-post-media.v1': { resolveOwnedPostMediaV1: () => {} },
    '@contentfactory/nestjs-libraries/database/prisma/media/media.repository': { MediaRepository: class {} },
    '@contentfactory/nestjs-libraries/openai/openai.service': { OpenaiService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service': { SubscriptionService: class {} },
    '@contentfactory/nestjs-libraries/videos/video.manager': { VideoManager: class {} },
    '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
  });
  const repository = { getMediaById: async () => ({ organizationId: 'org-a', path: 'fixture/video.mp4', name: 'video.mp4' }) };
  const signal = new AbortController().signal;
  const opened = await new MediaService(repository, {}, {}, {}).openOwnedMediaV1('org-a', 'media-a', { signal, range: 'bytes=2-4' });
  expect(readMediaSource).toHaveBeenCalledWith('fixture/video.mp4', { signal, range: 'bytes=2-4' });
  expect(opened).toMatchObject({ status: 206, size: 3, contentRange: 'bytes 2-4/10' });
});
