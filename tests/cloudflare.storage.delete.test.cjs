const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

function fixture(uploadUrl = 'https://uploads.example.test', bucket = 'owned-media') {
  const objects = new Map();
  const send = jest.fn(async (command) => {
    if (command instanceof PutObjectCommand) objects.set(command.input.Key, command.input.Body);
    if (command instanceof DeleteObjectCommand) objects.delete(command.input.Key);
    return { $metadata: { httpStatusCode: 204 } };
  });
  const { CloudflareStorage } = loadTypeScriptModule('libraries/nestjs-libraries/src/upload/cloudflare.storage.ts', {
    '@aws-sdk/client-s3': { PutObjectCommand, DeleteObjectCommand, S3Client: class { constructor() { this.send = send; this.middlewareStack = { add() {} }; } } },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'Abc123Def4' },
    '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator': { isSafePublicHttpsUrl: async () => true },
    '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher': { ssrfSafeDispatcher: {} },
    '@contentfactory/nestjs-libraries/upload/data.url': { parseDataUrl: () => ({ buffer: Buffer.from('image bytes') }) },
    'file-type': { fromBuffer: async () => ({ mime: 'image/png', ext: 'png' }) },
    mime: { getExtension: () => 'png' },
  });
  return { storage: new CloudflareStorage('account', 'fixture-key', 'fixture-secret', 'auto', bucket, uploadUrl), send, objects };
}

test.each(['https://uploads.example.test', 'https://uploads.example.test/', 'https://uploads.example.test/media', 'https://uploads.example.test/media/'])('removes actual uploadSimple/uploadFile output under configured base %s', async (base) => {
  const f = fixture(base);
  const url = await f.storage.uploadSimple('data:image/png;base64,aW1hZ2U=');
  expect(f.objects.has('Abc123Def4.png')).toBe(true);
  await f.storage.removeFile(url);
  expect(f.objects.has('Abc123Def4.png')).toBe(false);
  const uploaded = await f.storage.uploadFile({ buffer: Buffer.from('image bytes'), mimetype: 'image/png', size: 11 });
  await f.storage.removeFile(uploaded.path);
  expect(f.send.mock.calls.filter(([command]) => command instanceof DeleteObjectCommand).map(([command]) => command.input)).toEqual([
    { Bucket: 'owned-media', Key: 'Abc123Def4.png' }, { Bucket: 'owned-media', Key: 'Abc123Def4.png' },
  ]);
});

test('retains the entire relative object key and uses only the configured bucket', async () => {
  const f = fixture('https://uploads.example.test/bucket-mount');
  await f.storage.removeFile('https://uploads.example.test/bucket-mount/generated/channel-1/file.mp4');
  expect(f.send).toHaveBeenCalledTimes(1);
  expect(f.send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
  expect(f.send.mock.calls[0][0].input).toEqual({ Bucket: 'owned-media', Key: 'generated/channel-1/file.mp4' });
});

test.each([
  'https://foreign.example.test/media/file.png', 'https://uploads.example.test.evil.test/media/file.png',
  'http://uploads.example.test/media/file.png', 'https://uploads.example.test:444/media/file.png',
  'https://user:password@uploads.example.test/media/file.png', 'https://@uploads.example.test/media/file.png',
  'https://uploads.example.test/another-bucket/file.png', 'https://uploads.example.test/media-other/file.png',
  'https://uploads.example.test/media/../file.png', 'https://uploads.example.test/media/sub/../file.png',
  'https://uploads.example.test/media/%2e%2e/file.png', 'https://uploads.example.test/media/sub%2ffile.png',
  'https://uploads.example.test/media/%252e%252e/file.png', 'https://uploads.example.test/media/sub\\file.png',
  'https://uploads.example.test/media//file.png', 'https://uploads.example.test/media/',
  'https://uploads.example.test/media/file.png?versionId=other', 'https://uploads.example.test/media/file.png#other',
  'https://uploads.example.test/media/./file.png', 'https://uploads.example.test/media/fi\nle.png',
  `https://uploads.example.test/media/${'a'.repeat(1025)}`,
  '/media/file.png', 'file.png', 's3://another-bucket/file.png', ' https://uploads.example.test/media/file.png',
])('rejects unowned or ambiguous target %s before any SDK operation', async (target) => {
  const f = fixture('https://uploads.example.test/media');
  await expect(f.storage.removeFile(target)).rejects.toThrow();
  expect(f.send).not.toHaveBeenCalled();
});

test.each([
  ['http://uploads.example.test', 'owned-media'], ['https://user:password@uploads.example.test', 'owned-media'],
  ['https://uploads.example.test/media/..', 'owned-media'], ['https://uploads.example.test/media?bucket=other', 'owned-media'],
  ['https://uploads.example.test', ''], ['https://uploads.example.test', 'other/bucket'],
])('refuses unsafe configuration %s / %s', async (base, bucket) => {
  const f = fixture(base, bucket);
  await expect(f.storage.removeFile('https://uploads.example.test/file.png')).rejects.toThrow();
  expect(f.send).not.toHaveBeenCalled();
});

test('waits for deletion acknowledgement and propagates provider failure for retention retry', async () => {
  const f = fixture();
  let acknowledge;
  f.send.mockImplementationOnce(() => new Promise((resolve) => { acknowledge = resolve; }));
  let complete = false;
  const pending = f.storage.removeFile('https://uploads.example.test/file.png').then(() => { complete = true; });
  await Promise.resolve();
  expect(complete).toBe(false);
  acknowledge({ $metadata: { httpStatusCode: 204 } });
  await pending;
  expect(complete).toBe(true);
  const failed = new Error('R2 unavailable');
  f.send.mockRejectedValueOnce(failed);
  await expect(f.storage.removeFile('https://uploads.example.test/file.png')).rejects.toBe(failed);
  // Repeating a delete uses the same bucket/key and succeeds even when the object is already absent.
  await expect(f.storage.removeFile('https://uploads.example.test/file.png')).resolves.toBeUndefined();
});
