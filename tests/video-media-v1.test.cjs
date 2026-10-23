const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/video-v1/flower.mp4'));
const publicIp = '93.184.216.34';
const dnsPromises = { lookup: jest.fn() };
const dnsCallback = { lookup: jest.fn() };
const uploads = jest.fn();

// Transport-only stand-in: the connect.lookup body under test remains the
// actual ssrf.safe.dispatcher.ts implementation, including every IP check.
class CaptureAgent {
  constructor(options) { this.connect = options.connect; }
}
const media = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/video-media.v1.ts', {
  'node:dns/promises': dnsPromises,
  'node:dns': dnsCallback,
  undici: { Agent: CaptureAgent },
  '../upload/upload.factory': { UploadFactory: { createStorage: () => ({ uploadFile: uploads }) } },
});

function streamResponse(chunks, { status = 200, headers = {}, failure } = {}) {
  let position = 0;
  const reader = {
    read: jest.fn(async () => {
      if (failure) throw failure;
      return position < chunks.length ? { done: false, value: chunks[position++] } : { done: true };
    }),
    cancel: jest.fn(async () => {}),
    releaseLock: jest.fn(),
  };
  const body = { getReader: () => reader, cancel: jest.fn(async () => {}) };
  return { status, ok: status >= 200 && status < 300, headers: new Headers(headers), body, reader };
}
function lookupConnection(dispatcher, hostname) {
  return new Promise((resolve, reject) => dispatcher.connect.lookup(hostname, { all: true }, (error, value) => error ? reject(error) : resolve(value)));
}
const rejectCode = (promise, code) => expect(promise).rejects.toHaveProperty('response.code', code);

let savedFetch;
let savedSsrfOptout;
beforeEach(() => {
  savedFetch = global.fetch;
  savedSsrfOptout = process.env.DISABLE_SSRF_PROTECTION;
  dnsPromises.lookup.mockReset().mockResolvedValue([{ address: publicIp, family: 4 }]);
  dnsCallback.lookup.mockReset().mockImplementation((_host, options, callback) => callback(null, options?.all ? [{ address: publicIp, family: 4 }] : publicIp, 4));
  uploads.mockReset().mockResolvedValue({ originalname: 'video.mp4', path: 'owned/video.mp4' });
});
afterEach(() => {
  global.fetch = savedFetch;
  if (savedSsrfOptout === undefined) delete process.env.DISABLE_SSRF_PROTECTION;
  else process.env.DISABLE_SSRF_PROTECTION = savedSsrfOptout;
  jest.restoreAllMocks();
});

test('committed CC0 fixture is intact and valid without codecs or network at test runtime', async () => {
  expect(crypto.createHash('sha256').update(fixture).digest('hex')).toBe('0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451');
  await expect(media.assertMp4VideoV1(fixture)).resolves.toBeUndefined();
});

test.each([
  'http://media.example/video.mp4', 'https://localhost/video.mp4',
  'https://127.0.0.1/video.mp4', 'https://10.0.0.1/video.mp4',
  'https://172.16.0.1/video.mp4', 'https://192.168.1.1/video.mp4',
  'https://169.254.169.254/latest/meta-data/', 'https://[::1]/video.mp4',
  'https://[fe80::1]/video.mp4', 'https://[fe90::1]/video.mp4', 'https://[fd00::1]/video.mp4',
  'https://[::ffff:127.0.0.1]/video.mp4', 'https://[::ffff:169.254.169.254]/video.mp4',
  'https://user:password@media.example/video.mp4', 'not a url',
])('unsafe initial URL is rejected before transport: %s', async url => {
  global.fetch = jest.fn();
  await rejectCode(media.downloadVideoAssetV1(url), 'VIDEO_RESULT_URL_UNSAFE');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('hostname with any private DNS result is rejected before transport', async () => {
  dnsPromises.lookup.mockResolvedValue([{ address: publicIp, family: 4 }, { address: '10.0.0.5', family: 4 }]);
  global.fetch = jest.fn();
  await rejectCode(media.downloadVideoAssetV1('https://media.example/video.mp4'), 'VIDEO_RESULT_URL_UNSAFE');
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each(['http://next.example/file.mp4', 'https://169.254.169.254/file.mp4', 'https://[fe80::1]/file.mp4', 'https://127.0.0.1/file.mp4'])('each redirect target is checked before following: %s', async location => {
  const first = streamResponse([], { status: 302, headers: { location } });
  global.fetch = jest.fn().mockResolvedValue(first);
  await rejectCode(media.downloadVideoAssetV1('https://media.example/video.mp4'), 'VIDEO_RESULT_URL_UNSAFE');
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(first.body.cancel).toHaveBeenCalledTimes(1);
});

test('relative and public cross-host redirects are followed manually with pinned DNS on every fetch', async () => {
  const first = streamResponse([], { status: 302, headers: { location: '/next.mp4' } });
  const second = streamResponse([], { status: 307, headers: { location: 'https://cdn.example/final.mp4' } });
  const last = streamResponse([fixture]);
  global.fetch = jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(last);
  const bytes = await media.downloadVideoAssetV1('https://media.example/video.mp4');
  expect(bytes.equals(fixture)).toBe(true);
  expect(global.fetch.mock.calls.map(([url]) => url)).toEqual(['https://media.example/video.mp4', 'https://media.example/next.mp4', 'https://cdn.example/final.mp4']);
  expect(dnsPromises.lookup.mock.calls.map(([host]) => host)).toEqual(['media.example', 'media.example', 'cdn.example']);
  const options = global.fetch.mock.calls.map(([, value]) => value);
  options.forEach(value => {
    expect(value.redirect).toBe('manual');
    expect(value.signal).toBeInstanceOf(AbortSignal);
    expect(value.dispatcher).toBeInstanceOf(CaptureAgent);
    expect(value.dispatcher).toBe(options[0].dispatcher);
  });
  expect(new Set(options.map(value => value.signal)).size).toBe(1);
  expect(first.body.cancel).toHaveBeenCalledTimes(1);
  expect(second.body.cancel).toHaveBeenCalledTimes(1);
});

test('a later redirect hostname resolving privately is blocked, even after a safe first redirect', async () => {
  dnsPromises.lookup.mockImplementation(async host => [{ address: host === 'internal.example' ? '192.168.1.2' : publicIp, family: 4 }]);
  global.fetch = jest.fn()
    .mockResolvedValueOnce(streamResponse([], { status: 301, headers: { location: 'https://cdn.example/second.mp4' } }))
    .mockResolvedValueOnce(streamResponse([], { status: 308, headers: { location: 'https://internal.example/final.mp4' } }));
  await rejectCode(media.downloadVideoAssetV1('https://media.example/video.mp4'), 'VIDEO_RESULT_URL_UNSAFE');
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('redirect loops are bounded and redirect bodies are released', async () => {
  const redirects = [];
  global.fetch = jest.fn(async () => { const r = streamResponse([], { status: 302, headers: { location: '/again.mp4' } }); redirects.push(r); return r; });
  await rejectCode(media.downloadVideoAssetV1('https://media.example/video.mp4'), 'VIDEO_RESULT_REDIRECT_LIMIT');
  expect(global.fetch).toHaveBeenCalledTimes(5);
  redirects.forEach(response => expect(response.body.cancel).toHaveBeenCalledTimes(1));
});

test.each(['10.1.2.3', '169.254.169.254', '::1', 'fe80::1', 'fe90::1', '::ffff:7f00:1'])('DNS rebinding to %s is rejected by actual connection lookup despite env optout', async connectionIp => {
  process.env.DISABLE_SSRF_PROTECTION = 'true';
  dnsCallback.lookup.mockImplementation((_host, _options, callback) => callback(null, [{ address: connectionIp, family: connectionIp.includes(':') ? 6 : 4 }], 0));
  global.fetch = jest.fn(async (url, options) => {
    await lookupConnection(options.dispatcher, new URL(url).hostname);
    return streamResponse([fixture]);
  });
  await expect(media.downloadVideoAssetV1('https://media.example/video.mp4')).rejects.toThrow('Blocked IP');
  expect(dnsPromises.lookup).toHaveBeenCalledTimes(1);
  expect(dnsCallback.lookup).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][1].dispatcher).toBeInstanceOf(CaptureAgent);
});

test('valid public connection DNS is the transport set used, also with env optout', async () => {
  process.env.DISABLE_SSRF_PROTECTION = 'true';
  global.fetch = jest.fn(async (url, options) => {
    expect(await lookupConnection(options.dispatcher, new URL(url).hostname)).toEqual([{ address: publicIp, family: 4 }]);
    return streamResponse([fixture]);
  });
  expect((await media.downloadVideoAssetV1('https://media.example/video.mp4')).equals(fixture)).toBe(true);
});

test('Content-Length above the budget rejects and cancels before reading', async () => {
  const response = streamResponse([Buffer.from('abc')], { headers: { 'content-length': '9' } });
  global.fetch = jest.fn().mockResolvedValue(response);
  await rejectCode(media.downloadVideoAssetV1('https://media.example/video.mp4', 8), 'VIDEO_RESULT_TOO_LARGE');
  expect(response.reader.read).not.toHaveBeenCalled();
  expect(response.body.cancel).toHaveBeenCalledTimes(1);
});

test.each([{}, { 'content-length': '1' }])('streaming limit holds when length is missing or dishonest: %p', async headers => {
  const response = streamResponse([Buffer.alloc(5), Buffer.alloc(5)], { headers });
  global.fetch = jest.fn().mockResolvedValue(response);
  await rejectCode(media.downloadVideoAssetV1('https://media.example/video.mp4', 8), 'VIDEO_RESULT_TOO_LARGE');
  expect(response.reader.cancel).toHaveBeenCalledTimes(1);
  expect(response.reader.releaseLock).toHaveBeenCalledTimes(1);
});

test('download at the exact budget boundary succeeds and empty body fails', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(streamResponse([Buffer.from('1234'), Buffer.from('5678')])).mockResolvedValueOnce(streamResponse([]));
  expect((await media.downloadVideoAssetV1('https://media.example/video.mp4', 8)).toString()).toBe('12345678');
  await rejectCode(media.downloadVideoAssetV1('https://media.example/video.mp4'), 'VIDEO_RESULT_EMPTY');
});

test('download timeout signal is propagated to transport, including its exact reason', async () => {
  const controller = new AbortController();
  jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const reason = new DOMException('Fixture timeout', 'TimeoutError');
  global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
    expect(options.signal).toBe(controller.signal);
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    queueMicrotask(() => controller.abort(reason));
  }));
  await expect(media.downloadVideoAssetV1('https://media.example/video.mp4')).rejects.toBe(reason);
  expect(AbortSignal.timeout).toHaveBeenCalledWith(60_000);
});

test('stream timeout releases reader and preserves failure', async () => {
  const reason = new DOMException('Fixture stream timeout', 'TimeoutError');
  const response = streamResponse([], { failure: reason });
  global.fetch = jest.fn().mockResolvedValue(response);
  await expect(media.downloadVideoAssetV1('https://media.example/video.mp4')).rejects.toBe(reason);
  expect(response.reader.releaseLock).toHaveBeenCalledTimes(1);
});

test.each([
  ['HTML', Buffer.from('<html><body>not a video</body></html>')],
  ['PNG', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1z8AAAAASUVORK5CYII=', 'base64')],
])('%s disguised by an MP4 URL or declared MIME is rejected by real sniffing before storage', async (_name, bytes) => {
  global.fetch = jest.fn().mockResolvedValue(streamResponse([bytes], { headers: { 'content-type': 'video/mp4' } }));
  await rejectCode(new media.VideoMediaV1().importVideo('https://media.example/looks-valid.mp4'), 'VIDEO_RESULT_NOT_MP4');
  expect(uploads).not.toHaveBeenCalled();
});

test('truncated MP4 is rejected even when its signature identifies MP4', async () => {
  await rejectCode(media.assertMp4VideoV1(fixture.subarray(0, 256)), 'VIDEO_RESULT_INVALID_MP4');
});

test('valid real MP4 import writes the downloaded bytes once to the owned storage boundary', async () => {
  global.fetch = jest.fn().mockResolvedValue(streamResponse([fixture.subarray(0, 1024), fixture.subarray(1024)], { headers: { 'content-type': 'application/octet-stream' } }));
  const result = await new media.VideoMediaV1().importVideo('https://media.example/provider-result');
  expect(result).toEqual({ name: 'video.mp4', path: 'owned/video.mp4', size: fixture.length });
  expect(uploads).toHaveBeenCalledTimes(1);
  const file = uploads.mock.calls[0][0];
  expect(file.buffer.equals(fixture)).toBe(true);
  expect(file.mimetype).toBe('video/mp4');
});
