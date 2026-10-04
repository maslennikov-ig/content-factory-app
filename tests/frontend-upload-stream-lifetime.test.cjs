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
    fs: {
      ...fs,
      createReadStream(...args) {
        const stream = fs.createReadStream(...args);
        // Observe real files while keeping the original missing-file RED from
        // becoming an unhandled background error before cleanup can destroy it.
        stream.on('error', () => {});
        streams.push(stream);
        return stream;
      },
    },
    'next/server': { NextResponse: class extends Response {} },
  }).GET;
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

const download = (segments = ['sample.txt']) =>
  get({}, { params: Promise.resolve({ path: segments }) });

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
  await expect(download(['missing.txt'])).rejects.toMatchObject({ code: 'ENOENT' });
  expect(streams.length).toBe(0);
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
