'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const ROUTE = 'apps/frontend/src/app/(app)/api/uploads/[[...path]]/route.ts';
const FILE_BYTES = 8 * 1024 * 1024;
let directory;
let previousDirectory;
let streams;
let get;
let head;

const closed = (stream) =>
  stream.closed ? Promise.resolve() : new Promise((resolve) => stream.once('close', resolve));

async function closesWithin(stream, milliseconds = 1500) {
  let timer;
  try {
    return await Promise.race([
      closed(stream).then(() => true),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-upload-stream-lifetime-'));
  fs.writeFileSync(path.join(directory, 'sample.txt'), Buffer.alloc(FILE_BYTES, 0x61));
  previousDirectory = process.env.UPLOAD_DIRECTORY;
  process.env.UPLOAD_DIRECTORY = directory;
  streams = [];
  get = loadTypeScriptModule(ROUTE, {
    'node:fs/promises': {
      ...fs.promises,
      async open(...args) {
        const file = await fs.promises.open(...args);
        const createReadStream = file.createReadStream.bind(file);
        file.createReadStream = (...streamArgs) => {
          const stream = createReadStream(...streamArgs);
          stream.on('error', () => {});
          streams.push(stream);
          return stream;
        };
        return file;
      },
    },
    'next/server': { NextResponse: class extends Response {} },
  });
  head = get.HEAD;
  get = get.GET;
});

afterEach(async () => {
  await Promise.all(streams.map(async (stream) => {
    const done = closed(stream);
    stream.destroy();
    await done;
  }));
  if (previousDirectory === undefined) delete process.env.UPLOAD_DIRECTORY;
  else process.env.UPLOAD_DIRECTORY = previousDirectory;
  fs.rmSync(directory, { recursive: true, force: true });
});

const download = (segments = ['sample.txt'], options = {}) =>
  get({ method: 'GET', headers: new Headers(options.headers), signal: options.signal }, { params: Promise.resolve({ path: segments }) });

test('canceling a paused real 8 MiB download closes its file stream and descriptor', async () => {
  const response = await download();
  const stream = streams[0];
  const reader = response.body.getReader();
  const first = await reader.read();
  expect(first.done).toBe(false);
  expect(first.value.byteLength).toBeGreaterThan(0);
  expect(stream.fd).toEqual(expect.any(Number));
  expect(stream.bytesRead).toBeLessThan(FILE_BYTES);

  await reader.cancel('synthetic canceled download');

  expect(await closesWithin(stream)).toBe(true);
  expect(stream.destroyed).toBe(true);
  expect(stream.closed).toBe(true);
  expect(stream.fd).toBe(null);
});

test('cancel before the first body read also closes the real file stream', async () => {
  const response = await download();
  await response.body.cancel();
  expect(await closesWithin(streams[0])).toBe(true);
  expect(streams[0].fd).toBe(null);
});

test('cancel during the first pending read closes the file without an abandoned read', async () => {
  const response = await download();
  const reader = response.body.getReader();
  const pending = reader.read();
  await reader.cancel();
  expect(await pending).toMatchObject({ done: true });
  expect(await closesWithin(streams[0])).toBe(true);
  expect(streams[0].closed).toBe(true);
  expect(streams[0].fd).toBe(null);
});

test('a paused body keeps file read-ahead bounded instead of consuming all 8 MiB', async () => {
  const response = await download();
  const reader = response.body.getReader();
  await reader.read();
  await nextTurn();
  await nextTurn();
  expect(streams[0].bytesRead).toBeLessThanOrEqual(3 * streams[0].readableHighWaterMark);
  await reader.cancel();
});

test('normal downloads preserve exact bytes, type, length, mtime and immutable header', async () => {
  const response = await download();
  const expected = fs.readFileSync(path.join(directory, 'sample.txt'));
  const stats = fs.statSync(path.join(directory, 'sample.txt'));
  expect(response.headers.get('content-type')).toBe('text/plain');
  expect(response.headers.get('content-length')).toBe(String(FILE_BYTES));
  expect(response.headers.get('last-modified')).toBe(stats.mtime.toUTCString());
  expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  const actual = Buffer.from(await response.arrayBuffer());
  expect(actual.byteLength).toBe(expected.byteLength);
  expect(actual.equals(expected)).toBe(true);
  expect(await closesWithin(streams[0])).toBe(true);
  expect(streams[0].fd).toBe(null);
});

test('missing-file stat failure creates no orphan ReadStream', async () => {
  expect((await download(['missing.txt'])).status).toBe(404);
  expect(streams.length).toBe(0);
});

test.each([
  ['bytes=0-99', 0, 99],
  [`bytes=${FILE_BYTES - 100}-`, FILE_BYTES - 100, FILE_BYTES - 1],
  ['bytes=-100', FILE_BYTES - 100, FILE_BYTES - 1],
  [`bytes=${FILE_BYTES - 10}-999999999999999999999999`, FILE_BYTES - 10, FILE_BYTES - 1],
  ['bytes=-999999999999999999999999', 0, FILE_BYTES - 1],
])('single range %s returns exact bounded bytes and metadata', async (range, start, end) => {
  const bytes = Buffer.alloc(FILE_BYTES);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  fs.writeFileSync(path.join(directory, 'sample.txt'), bytes);
  const response = await download(['sample.txt'], { headers: { Range: range } });
  expect(response.status).toBe(206);
  expect(response.headers.get('accept-ranges')).toBe('bytes');
  expect(response.headers.get('content-range')).toBe(`bytes ${start}-${end}/${FILE_BYTES}`);
  expect(response.headers.get('content-length')).toBe(String(end - start + 1));
  expect(response.headers.get('content-type')).toBe('text/plain');
  expect(Buffer.from(await response.arrayBuffer()).equals(bytes.subarray(start, end + 1))).toBe(true);
  expect(await closesWithin(streams[0])).toBe(true);
});

test.each([`bytes=${FILE_BYTES}-`, 'bytes=99-10', 'bytes=-0', 'bytes=999999999999999999999999-'])('unsatisfiable range %s returns 416 without opening a stream', async range => {
  const response = await download(['sample.txt'], { headers: { Range: range } });
  expect(response.status).toBe(416);
  expect(response.headers.get('content-range')).toBe(`bytes */${FILE_BYTES}`);
  expect(response.headers.get('accept-ranges')).toBe('bytes');
  expect(await response.text()).toBe(''); expect(streams).toHaveLength(0);
});

test.each(['bytes=0-1,3-4', 'items=0-5', 'bytes=nope', 'bytes=-'])('unsupported range %s preserves full download behavior', async range => {
  const response = await download(['sample.txt'], { headers: { Range: range } });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-range')).toBeNull();
  expect(response.headers.get('content-length')).toBe(String(FILE_BYTES));
  await response.body.cancel();
});

test('HEAD advertises full bytes/type/cache without opening a stream, including when Range is supplied', async () => {
  const response = await head(new Request('http://localhost/uploads/sample.txt', {method: 'HEAD', headers: {Range: 'bytes=0-99'}}),
    {params: Promise.resolve({path: ['sample.txt']})});
  expect(response.status).toBe(200); expect(response.body).toBeNull();
  expect(response.headers.get('accept-ranges')).toBe('bytes');
  expect(response.headers.get('content-length')).toBe(String(FILE_BYTES));
  expect(response.headers.get('content-type')).toBe('text/plain');
  expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  expect(response.headers.get('content-range')).toBeNull(); expect(streams).toHaveLength(0);
  const missing = await head(new Request('http://localhost/uploads/missing.txt', {method: 'HEAD'}), {params: Promise.resolve({path: ['missing.txt']})});
  expect(missing.status).toBe(404); expect(missing.body).toBeNull();
});

test('If-Range preserves partial delivery only for the matching Last-Modified validator', async () => {
  const modified = fs.statSync(path.join(directory, 'sample.txt')).mtime.toUTCString();
  const partial = await download(['sample.txt'], { headers: { Range: 'bytes=0-99', 'If-Range': modified } });
  expect(partial.status).toBe(206); expect((await partial.arrayBuffer()).byteLength).toBe(100);
  const full = await download(['sample.txt'], { headers: { Range: 'bytes=0-99', 'If-Range': 'Wed, 01 Jan 2020 00:00:00 GMT' } });
  expect(full.status).toBe(200); expect(full.headers.get('content-range')).toBeNull(); await full.body.cancel();
});

test('directory paths do not become file streams', async () => {
  const response = await download([]);
  expect(response.status).toBe(404); expect(streams).toHaveLength(0);
});

test('path confinement refuses traversal without opening a file', async () => {
  const response = await download(['..', 'outside.txt']);
  expect(response.status).toBe(404);
  expect(await response.text()).toBe('Not found');
  expect(streams.length).toBe(0);
});

test('a real file-stream failure reaches the body reader and closes the descriptor', async () => {
  const response = await download();
  const stream = streams[0];
  const reader = response.body.getReader();
  await reader.read();
  const failure = new Error('synthetic file read failure');
  stream.destroy(failure);
  let caught;
  try {
    while (!(await reader.read()).done) {}
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(failure);
  expect(await closesWithin(stream)).toBe(true);
  expect(stream.fd).toBe(null);
});

test('a file error before the first body read stays available to the reader', async () => {
  const response = await download();
  const failure = new Error('synthetic open failure');
  streams[0].destroy(failure);
  await nextTurn();
  await expect(response.body.getReader().read()).rejects.toBe(failure);
  expect(await closesWithin(streams[0])).toBe(true);
  expect(streams[0].fd).toBe(null);
});

test('directory and leaf symlinks cannot read outside the configured storage root', async () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-upload-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'private.txt'), 'OUTSIDE_STORAGE_FIXTURE');
    fs.symlinkSync(outside, path.join(directory, 'link'));
    fs.symlinkSync(path.join(outside, 'private.txt'), path.join(directory, 'leaf.txt'));
    for (const segments of [['link', 'private.txt'], ['leaf.txt']]) {
      const response = await download(segments);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('OUTSIDE_STORAGE_FIXTURE');
    }
    expect(fs.readFileSync(path.join(outside, 'private.txt'), 'utf8')).toBe('OUTSIDE_STORAGE_FIXTURE');
    expect(streams).toHaveLength(0);
  } finally { fs.rmSync(outside, { recursive: true, force: true }); }
});

test('upload route parameters remain local keys and cannot become a remote proxy', async () => {
  const original = global.fetch;
  global.fetch = jest.fn(() => { throw new Error('must not fetch from a local upload route'); });
  try {
    for (const segments of [['https://public.example/payload.html'], ['https%3A%2F%2Fpublic.example%2Fpayload.html']]) {
      expect((await download(segments)).status).toBe(404);
    }
    expect(global.fetch).not.toHaveBeenCalled();
    // A real nested directory named uploads is not treated as a URL prefix.
    fs.mkdirSync(path.join(directory, 'uploads'));
    fs.writeFileSync(path.join(directory, 'uploads', 'nested.txt'), 'literal local directory');
    expect(await (await download(['uploads', 'nested.txt'])).text()).toBe('literal local directory');
  } finally { global.fetch = original; }
});

test('HEAD returns the same public asset headers without reading the file body', async () => {
  const response = await head({ method: 'HEAD', headers: new Headers() }, { params: Promise.resolve({ path: ['sample.txt'] }) });
  expect(response.status).toBe(200);
  expect(response.body).toBe(null);
  expect(response.headers.get('content-length')).toBe(String(FILE_BYTES));
  expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  expect(streams).toHaveLength(0);
});

test('valid local byte ranges return exact206 segments and invalid ranges return416', async () => {
  const response = await download(['sample.txt'], { headers: { range: 'bytes=2-5' } });
  expect(response.status).toBe(206);
  expect(response.headers.get('content-range')).toBe(`bytes 2-5/${FILE_BYTES}`);
  expect(response.headers.get('content-length')).toBe('4');
  expect(response.headers.get('accept-ranges')).toBe('bytes');
  expect(await response.text()).toBe('aaaa');
  expect((await download(['sample.txt'], { headers: { range: 'bytes=999999999-' } })).status).toBe(416);
});

test('request cancellation closes a paused download and its source descriptor', async () => {
  const abort = new AbortController();
  const response = await download(['sample.txt'], { signal: abort.signal });
  const reader = response.body.getReader();
  await reader.read();
  abort.abort();
  await expect((async () => { while (!(await reader.read()).done) {} })()).rejects.toThrow();
  expect(await closesWithin(streams[0])).toBe(true);
  expect(streams[0].fd).toBe(null);
});
