const fs = require('node:fs');
const promises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/video-v1/flower.mp4'));
let bytesRead = 0;
let swapAfterRealpath;
const safeUrl = jest.fn(async () => true);
const {inspectTikTokOwnedVideo} = loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/social/tiktok-video-inspection.ts', {
  '../../dtos/webhooks/webhook.url.validator': {isSafePublicHttpsUrl: safeUrl},
  '../../dtos/webhooks/ssrf.safe.dispatcher': {ssrfSafeDispatcher: {}},
  'node:fs/promises': {...promises, realpath: async (...args) => {
    const result = await promises.realpath(...args);
    if (swapAfterRealpath && args[0] === swapAfterRealpath.file) {
      const swap = swapAfterRealpath; swapAfterRealpath = undefined; await swap.run();
    }
    return result;
  }, open: async (...args) => {
    const handle = await promises.open(...args);
    const read = handle.read.bind(handle);
    handle.read = (...input) => {bytesRead += input[2]; return read(...input);};
    return handle;
  }},
});
const env = {...process.env}, nativeFetch = global.fetch;
let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-tiktok-inspect-'));
  fs.mkdirSync(path.join(root, '2026/11/05'), {recursive: true});
  process.env.UPLOAD_DIRECTORY = root; process.env.FRONTEND_URL = 'http://127.0.0.1:4477'; process.env.STORAGE_PROVIDER = 'local';
  bytesRead = 0; swapAfterRealpath = undefined; safeUrl.mockClear();
  global.fetch = jest.fn(async () => {throw Error('Local inspection must not fetch');});
});
afterEach(() => {fs.rmSync(root, {recursive: true, force: true}); for (const key of ['UPLOAD_DIRECTORY', 'FRONTEND_URL', 'STORAGE_PROVIDER', 'CLOUDFLARE_BUCKET_URL']) {
  if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
} global.fetch = nativeFetch;});
const write = value => {fs.writeFileSync(path.join(root, '2026/11/05/aabb.mp4'), value); return 'http://127.0.0.1:4477/uploads/2026/11/05/aabb.mp4';};

test('real owned MP4 duration is measured with bounded seeks, no whole video allocation or network', async () => {
  const result = await inspectTikTokOwnedVideo(write(bytes));
  expect(result.durationSeconds).toBeCloseTo(5.055, 3); expect(result.size).toBe(bytes.length);
  expect(bytesRead).toBeLessThan(4096); expect(global.fetch).not.toHaveBeenCalled();
});
test('foreign local origin and symlinked upload cannot be inspected', async () => {
  const url = write(bytes);
  await expect(inspectTikTokOwnedVideo(url.replace('4477', '4457'))).rejects.toBeDefined();
  fs.unlinkSync(path.join(root, '2026/11/05/aabb.mp4')); fs.symlinkSync(__filename, path.join(root, '2026/11/05/aabb.mp4'));
  await expect(inspectTikTokOwnedVideo(url)).rejects.toBeDefined(); expect(global.fetch).not.toHaveBeenCalled();
});
test('a symlinked date directory cannot redirect inspection outside owned uploads', async () => {
  const url = write(bytes);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-tiktok-inspect-external-'));
  try {
    fs.writeFileSync(path.join(external, 'aabb.mp4'), bytes);
    fs.rmSync(path.join(root, '2026/11/05'), {recursive: true});
    fs.symlinkSync(external, path.join(root, '2026/11/05'));
    await expect(inspectTikTokOwnedVideo(url)).rejects.toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();
  } finally {fs.rmSync(external, {recursive: true, force: true});}
});
test('a date directory replaced after realpath cannot redirect inspection to another file', async () => {
  const url = write(bytes), directory = path.join(root, '2026/11/05');
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-tiktok-inspect-race-'));
  fs.writeFileSync(path.join(external, 'aabb.mp4'), bytes);
  swapAfterRealpath = {file: path.join(directory, 'aabb.mp4'), run: async () => {
    fs.renameSync(directory, directory + '-original'); fs.symlinkSync(external, directory);
  }};
  try {await expect(inspectTikTokOwnedVideo(url)).rejects.toBeDefined();}
  finally {fs.rmSync(external, {recursive: true, force: true});}
});
test.each(['short', 'bad-scale', 'audio-only'])('unsupported or malformed MP4 stays unavailable (%s)', async kind => {
  const value = Buffer.from(bytes);
  if (kind === 'bad-scale') value.writeUInt32BE(0, value.indexOf(Buffer.from('mvhd')) + 16);
  if (kind === 'audio-only') value.write('soun', value.indexOf(Buffer.from('hdlr')) + 12, 'ascii');
  await expect(inspectTikTokOwnedVideo(write(kind === 'short' ? value.subarray(0, 8) : value))).rejects.toBeDefined();
});
function remote(override) {
  process.env.STORAGE_PROVIDER = 'cloudflare'; process.env.CLOUDFLARE_BUCKET_URL = 'https://bucket.example/owned';
  global.fetch = jest.fn(async (_url, init) => {
    if (init.method === 'HEAD') return new Response(null, {headers: {'content-length': String(bytes.length), etag: '"synthetic-version"'}});
    const match = /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range), start = Number(match[1]), end = Number(match[2]);
    return override ? override(start, end) : new Response(bytes.subarray(start, end + 1), {status: 206, headers: {'content-range': `bytes ${start}-${end}/${bytes.length}`}});
  });
}
test('configured owned bucket uses exact bounded conditional ranges and never forwards application credentials', async () => {
  remote(); const result = await inspectTikTokOwnedVideo('https://bucket.example/owned/movie.mp4');
  expect(result.durationSeconds).toBeCloseTo(5.055, 3); expect(safeUrl).toHaveBeenCalledTimes(1);
  for (const [url, init] of global.fetch.mock.calls) {
    expect(url).toBe('https://bucket.example/owned/movie.mp4'); expect(init.redirect).toBe('error');
    expect(init.headers?.Authorization).toBeUndefined(); expect(init.headers?.Cookie).toBeUndefined();
    if (init.method === 'GET') {expect(init.headers['If-Match']).toBe('"synthetic-version"'); const range = /bytes=(\d+)-(\d+)/.exec(init.headers.Range); expect(Number(range[2]) - Number(range[1]) + 1).toBeLessThanOrEqual(32);}
  }
});
test('a foreign bucket, ignored Range or mismatched content range cannot fall back to a full download', async () => {
  remote(); await expect(inspectTikTokOwnedVideo('https://foreign.example/owned/movie.mp4')).rejects.toBeDefined(); expect(global.fetch).not.toHaveBeenCalled();
  remote(() => new Response(bytes, {status: 200})); await expect(inspectTikTokOwnedVideo('https://bucket.example/owned/movie.mp4')).rejects.toBeDefined();
  remote(() => new Response(bytes.subarray(0, 16), {status: 206, headers: {'content-range': 'bytes 0-15/1'}}));
  await expect(inspectTikTokOwnedVideo('https://bucket.example/owned/movie.mp4')).rejects.toBeDefined();
});
