'use strict';

const { r2Fixture, loadRepositories } = require('./helpers/media-ownership.module.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const operations = [
  ['sign-part', pair => ({ ...pair, partNumber: 1 })],
  ['prepare-upload-parts', pair => ({ partData: { ...pair, parts: [{ number: 1 }] } })],
  ['list-parts', pair => pair],
  ['complete-multipart-upload', pair => ({ ...pair, parts: [{ PartNumber: 1, ETag: 'synthetic-part' }] })],
  ['abort-multipart-upload', pair => pair],
];

test.each(['hangGet', 'hangSet'])('a stuck Redis %s request answers 503 within five seconds', async mode => {
  jest.useFakeTimers();
  try {
    const f = r2Fixture(), pair = await f.create();
    f.hooks[mode] = true;
    let result;
    const pending = mode === 'hangGet'
      ? f.run('sign-part', { ...pair, partNumber: 1 })
      : f.run('create-multipart-upload', { file: { name: 'image.png' } });
    pending.then(value => { result = value; });
    await jest.advanceTimersByTimeAsync(5001);
    expect(result?.res.statusCode).toBe(503);
    expect(f.signatures).toHaveLength(0);
  } finally { jest.useRealTimers(); }
});

describe.each([
  ['another tenant', { organizationId: 'org-b', userId: 'user-b' }],
  ['another member', { organizationId: 'org-a', userId: 'user-b' }],
  ['another workspace of the owner', { organizationId: 'org-b', userId: 'user-a' }],
])('%s cannot use an owned R2 pair', (_name, actor) => {
  test.each(operations)('%s rejects before SDK or signer calls', async (endpoint, body) => {
    const f = r2Fixture(), pair = await f.create();
    f.calls.length = 0;
    expect((await f.run(endpoint, body(pair), actor)).res.statusCode).toBe(403);
    expect(f.calls).toHaveLength(0);
    expect(f.signatures).toHaveLength(0);
  });
});

test.each(operations)('%s rejects unknown, expired and malformed sessions', async (endpoint, body) => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  try {
    const f = r2Fixture(), pair = await f.create();
    f.calls.length = 0;
    expect((await f.run(endpoint, body({ ...pair, uploadId: 'unknown' }))).res.statusCode).toBe(403);
    expect((await f.run(endpoint, body({ key: [] }))).res.statusCode).toBe(403);
    jest.advanceTimersByTime(3600000);
    expect((await f.run(endpoint, body(pair))).res.statusCode).toBe(403);
    expect(f.calls).toHaveLength(0);
    expect(f.signatures).toHaveLength(0);
  } finally { jest.useRealTimers(); }
});

test.each(operations)('%s fails closed when the session store fails', async (endpoint, body) => {
  const f = r2Fixture(), pair = await f.create();
  f.calls.length = 0;
  f.hooks.failRedis = true;
  expect((await f.run(endpoint, body(pair))).res.statusCode).toBe(503);
  expect(f.calls).toHaveLength(0);
  expect(f.signatures).toHaveLength(0);
});

test('own part retries and list work; signed URLs retain the original deadline', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  try {
    const f = r2Fixture(), pair = await f.create();
    expect((await f.run('sign-part', { ...pair, partNumber: '1' })).res.statusCode).toBe(200);
    jest.advanceTimersByTime(3500000);
    expect((await f.run('sign-part', { ...pair, partNumber: 1 })).res.statusCode).toBe(200);
    expect(f.signatures.map(item => item.options.expiresIn)).toEqual([3600, 100]);
    expect((await f.run('list-parts', pair)).body).toEqual([{ PartNumber: 1, ETag: 'synthetic-part' }]);
    expect(await f.redis.ttl(f.sessionKeys[0])).toBe(100);
  } finally { jest.useRealTimers(); }
});

test.each([0, -1, 1.5, 10001, '1junk', null])('invalid part %s cannot be signed', async partNumber => {
  const f = r2Fixture(), pair = await f.create();
  expect((await f.run('sign-part', { ...pair, partNumber })).res.statusCode).toBe(400);
  expect(f.signatures).toHaveLength(0);
});

test('prepare validates all part numbers before signing any URL', async () => {
  const f = r2Fixture(), pair = await f.create();
  expect((await f.run('prepare-upload-parts', { partData: { ...pair, parts: [{ number: 1 }, { number: 0 }] } })).res.statusCode).toBe(400);
  expect(f.signatures).toHaveLength(0);
  expect((await f.run('prepare-upload-parts', { partData: { ...pair, parts: [{ number: 1 }, { number: 2 }] } })).body.presignedUrls).toEqual({
    1: 'https://synthetic.invalid/signed', 2: 'https://synthetic.invalid/signed',
  });
});

test('validated completion is retryable without repeated SDK completion or deletion', async () => {
  const f = r2Fixture(), pair = await f.create();
  const result = await f.run('complete-multipart-upload', { ...pair, parts: [] });
  expect(result.res.headersSent).toBe(false);
  expect(result.value).toMatchObject({ Key: pair.key, Location: process.env.CLOUDFLARE_BUCKET_URL + '/' + pair.key });
  expect(result.value.Location).not.toContain('untrusted.invalid');
  f.calls.length = 0;
  const again = await f.run('complete-multipart-upload', { ...pair, parts: [] });
  expect(again.value).toEqual(result.value);
  expect(f.calls).toHaveLength(0);
  expect((await f.run('abort-multipart-upload', pair)).res.statusCode).toBe(403);
  expect((await f.run('sign-part', { ...pair, partNumber: 1 })).res.statusCode).toBe(403);
  expect(f.objects.has(pair.key)).toBe(true);
});

test('completion response lost before storing receipt is recovered by owned-object validation', async () => {
  const f = r2Fixture(), pair = await f.create();
  f.hooks.failSet = true;
  expect((await f.run('complete-multipart-upload', { ...pair, parts: [] })).res.statusCode).toBe(503);
  expect(f.objects.has(pair.key)).toBe(true);
  f.hooks.failSet = false;
  expect((await f.run('complete-multipart-upload', { ...pair, parts: [] })).value.Key).toBe(pair.key);
  expect(f.calls.filter(c => c.kind === 'CompleteMultipartUploadCommand')).toHaveLength(2);
});

test('NoSuchUpload without a verified object and a generic failure are not completion receipts', async () => {
  const f = r2Fixture(), pair = await f.create();
  f.uploads.clear();
  expect((await f.run('complete-multipart-upload', { ...pair, parts: [] })).res.statusCode).toBe(500);
  f.objects.add(pair.key);
  f.calls.length = 0;
  f.hooks.failSend = c => c.kind === 'CompleteMultipartUploadCommand' ? new Error('synthetic timeout') : null;
  expect((await f.run('complete-multipart-upload', { ...pair, parts: [] })).res.statusCode).toBe(500);
  expect(f.calls.map(c => c.kind)).toEqual(['CompleteMultipartUploadCommand']);
});

test('owned invalid contents are rejected and removed; existing retention of other objects is preserved', async () => {
  const f = r2Fixture(), pair = await f.create();
  f.objects.add('unrelated.png');
  f.hooks.detectedMime = 'video/mp4';
  expect((await f.run('complete-multipart-upload', { ...pair, parts: [] })).res.statusCode).toBe(400);
  expect([...f.objects]).toEqual(['unrelated.png']);
  expect(f.calls.filter(c => c.kind === 'DeleteObjectCommand').map(c => c.input.Key)).toEqual([pair.key]);
});

test('own abort retries do not repeat provider calls and cannot subsequently complete', async () => {
  const f = r2Fixture(), pair = await f.create();
  expect((await f.run('abort-multipart-upload', pair)).res.statusCode).toBe(200);
  f.calls.length = 0;
  expect((await f.run('abort-multipart-upload', pair)).res.statusCode).toBe(200);
  expect((await f.run('complete-multipart-upload', { ...pair, parts: [] })).res.statusCode).toBe(403);
  expect(f.calls).toHaveLength(0);
});

test('creation refuses unsupported types or missing actor and never returns an unrecorded pair', async () => {
  const f = r2Fixture();
  expect((await f.run('create-multipart-upload', { file: { name: 'bad.exe' } })).res.statusCode).toBe(400);
  expect((await f.run('create-multipart-upload', { file: { name: 'image.png' } }, null)).res.statusCode).toBe(403);
  expect(f.calls).toHaveLength(0);
  f.hooks.failRedis = true;
  const result = await f.run('create-multipart-upload', { file: { name: 'image.png' } });
  expect(result.res.statusCode).toBe(503);
  expect(result.body.uploadId).toBeUndefined();
});

test('a known foreign R2 pair cannot be signed before any provider/presigner call', async () => {
  const f = r2Fixture();
  const pair = await f.create();
  f.calls.length = 0;
  const result = await f.run('sign-part', { ...pair, partNumber: 1 }, { organizationId: 'org-b', userId: 'user-b' });
  expect(result.res.statusCode).toBe(403);
  expect(f.signatures).toHaveLength(0);
  expect(f.calls).toHaveLength(0);
});

test('avatar connection carries current active membership and nondeleted media in the same update', async () => {
  const { UsersRepository } = loadRepositories();
  const update = jest.fn(async () => {});
  const repository = new UsersRepository({ model: { user: { update } } }, {});
  await repository.changePersonal('user-a', { picture: { id: 'media' }, fullname: 'Name' });
  expect(update.mock.calls[0][0].data.picture.connect).toMatchObject({
    id: 'media', deletedAt: null,
    organization: { users: { some: { userId: 'user-a', disabled: false } } },
  });
});

test('conditional avatar rejection is a stable HTTP error, other database errors are preserved', async () => {
  const { UsersRepository } = loadRepositories();
  const error = Object.assign(new Error('synthetic database refusal'), { code: 'P2025' });
  const repository = new UsersRepository({ model: { user: { update: async () => { throw error; } } } }, {});
  await expect(repository.changePersonal('user', { picture: { id: 'foreign' } })).rejects.toMatchObject({
    response: { code: 'PROFILE_MEDIA_UNAVAILABLE' }, status: 404,
  });
  error.code = 'P2034';
  await expect(repository.changePersonal('user', { picture: { id: 'owned' } })).rejects.toBe(error);
});

test('controller passes both identities and never registers a rejected completion', async () => {
  const handler = jest.fn(async (_endpoint, _req, res) => res.status(403).json({ message: 'Unavailable' }));
  const { MediaController } = loadWithMocks('apps/backend/src/api/routes/media.controller.ts', {
    '@contentfactory/nestjs-libraries/database/prisma/media/media.service': { MediaService: class {} },
    '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
    '@contentfactory/nestjs-libraries/upload/r2.uploader': { default: handler, __esModule: true },
  });
  const saveMultipartFile = jest.fn(async () => ({ id: 'media' }));
  const controller = new MediaController({ saveMultipartFile });
  const { response } = require('./helpers/media-ownership.module.cjs');
  await controller.uploadFile({ id: 'org' }, { body: {} }, response(), 'complete-multipart-upload', { id: 'user' });
  expect(handler.mock.calls[0][3]).toEqual({ organizationId: 'org', userId: 'user' });
  expect(saveMultipartFile).not.toHaveBeenCalled();
  handler.mockImplementation(async () => ({ Key: 'owned.png', Location: 'https://synthetic.invalid/owned.png' }));
  const res = response();
  await controller.uploadFile({ id: 'org' }, { body: { file: { name: 'photo.png' } } }, res, 'complete-multipart-upload', { id: 'user' });
  expect(saveMultipartFile).toHaveBeenCalledWith('org', 'owned.png', 'https://synthetic.invalid/owned.png', 'photo.png');
  expect(res.body.saved).toEqual({ id: 'media' });
});

test.each(['listParts', 'signPart', 'abortMultipartUpload', 'completeMultipartUpload'])('Uppy %s propagates rejected upload responses', async operation => {
  const { getUppyUploadPlugin } = loadWithMocks('libraries/react-shared-libraries/src/helpers/uppy.upload.ts', {
    '@uppy/xhr-upload': class {}, '@uppy/aws-s3': class {}, '@uppy/transloadit': class {},
  });
  const json = jest.fn();
  const fetch = jest.fn(async () => ({ ok: false, json }));
  await expect(getUppyUploadPlugin('cloudflare', fetch).options[operation]({}, {})).rejects.toThrow('Upload request failed');
  expect(json).not.toHaveBeenCalled();
});
