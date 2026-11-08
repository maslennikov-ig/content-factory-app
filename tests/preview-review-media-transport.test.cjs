require('reflect-metadata');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const { loadTypeScriptModule: load } = require('./helpers/load-ts-module.cjs');
const reader = load('libraries/helpers/src/utils/media.source.ts', {
  '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher': { ssrfSafeDispatcher: {} },
  '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator': { isSafePublicHttpsUrl: async url => new URL(url).hostname === 'public.fixture' },
});
const { PreviewReviewServiceV1 } = load('libraries/nestjs-libraries/src/preview-review/v1/preview-review.service.ts', {
  '@contentfactory/helpers/auth/auth.service': { AuthService: {} },
  '@contentfactory/helpers/utils/sanitize.post.content': { sanitizePostContent: value => value },
  '@contentfactory/helpers/utils/strip.html.validation': { stripHtmlValidation: (_mode, value) => value },
  './preview-review.repository': { PreviewReviewRepositoryV1: class {} },
});
const placeholders = new Proxy({}, { get: () => class Placeholder {} });
const { MediaService } = load('libraries/nestjs-libraries/src/database/prisma/media/media.service.ts', {}, {
  resolve: request => request === '@contentfactory/helpers/utils/media.source' ? reader
    : request === '@contentfactory/nestjs-libraries/upload/upload.factory' ? { UploadFactory: { createStorage: () => ({}) } }
    : request.startsWith('@contentfactory/') ? placeholders : undefined,
});
const { PreviewReviewControllerV1 } = load('apps/backend/src/api/routes/preview-review.v1.controller.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/media/media.service': { MediaService },
  '@contentfactory/nestjs-libraries/preview-review/v1/preview-review.service': { PreviewReviewServiceV1 },
});
function response() {
  const chunks = [], headers = {};
  const res = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.setHeader = (name, value) => { headers[name] = value; };
  res.status = code => { res.statusCode = code; return res; };
  return { res, chunks, headers };
}
const token = 'a'.repeat(43);
const request = () => Object.assign(new EventEmitter(), { headers: { 'x-preview-grant': token, range: 'bytes=2-4' }, cookies: {} });
let originalFetch;
beforeEach(() => { originalFetch = global.fetch; });
afterEach(() => { global.fetch = originalFetch; });

test('actual scoped external transport retains Range/no-store and rechecks the live grant/current reference every request', async () => {
  let live = true, references = [{ id: 'client-label', path: 'https://public.fixture/clip.mp4?private-query=value' }];
  const repository = {
    grant: async () => live ? { id: 'grant', organizationId: 'org', expiresAt: new Date('2099-01-01') } : null,
    preview: async () => [{ id: 'post', image: JSON.stringify(references), content: '', childrenPost: [], integration: { name: 'Channel' } }],
    media: async () => [], registeredMediaIds: async () => [],
  };
  const review = new PreviewReviewServiceV1(repository);
  const controller = new PreviewReviewControllerV1(review, new MediaService({}, {}, {}, {}));
  const actor = await review.authorize('post', request());
  const [media] = JSON.parse((await review.preview(actor))[0].image);
  global.fetch = jest.fn(async () => new Response(Uint8Array.from([2, 3, 4]), { status: 206, headers: { 'content-range': 'bytes 2-4/10', 'content-length': '3' } }));
  const { res, chunks, headers } = response();
  await controller.attachment('post', media.id, undefined, request(), res);
  expect(global.fetch).toHaveBeenCalledWith(references[0].path, expect.objectContaining({ redirect: 'manual', headers: { Range: 'bytes=2-4' }, signal: expect.any(AbortSignal) }));
  expect(res.statusCode).toBe(206);
  expect(headers['Cache-Control']).toContain('no-store');
  expect(headers['Content-Type']).toBe('video/mp4');
  expect(headers['Content-Range']).toBe('bytes 2-4/10');
  expect(Buffer.concat(chunks)).toEqual(Buffer.from([2, 3, 4]));
  references = [];
  await expect(controller.attachment('post', media.id, undefined, request(), response().res)).rejects.toMatchObject({ status: 404 });
  live = false;
  await expect(controller.attachment('post', media.id, undefined, request(), response().res)).rejects.toMatchObject({ status: 403 });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('a current external reference cannot make the scoped transport fetch a private destination', async () => {
  const repository = {
    grant: async () => ({ id: 'grant', organizationId: 'org', expiresAt: new Date('2099-01-01') }),
    preview: async () => [{ id: 'post', image: JSON.stringify([{ id: 'client-label', path: 'https://127.0.0.1/private.mp4' }]), content: '', childrenPost: [], integration: { name: 'Channel' } }],
    media: async () => [], registeredMediaIds: async () => [],
  };
  const review = new PreviewReviewServiceV1(repository);
  const controller = new PreviewReviewControllerV1(review, new MediaService({}, {}, {}, {}));
  const [media] = JSON.parse((await review.preview(await review.authorize('post', request())))[0].image);
  global.fetch = jest.fn();
  await expect(controller.attachment('post', media.id, undefined, request(), response().res)).rejects.toThrow('MEDIA_URL_UNSAFE');
  expect(global.fetch).not.toHaveBeenCalled();
});
