'use strict';
require('reflect-metadata');
const { EventEmitter } = require('node:events');
const { Readable, Writable, addAbortSignal } = require('node:stream');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

let readMediaSource;
const placeholders = new Proxy({}, { get: () => class Placeholder {} });
const { PublicController } = loadTypeScriptModule('apps/backend/src/api/routes/public.controller.ts', {}, {
  resolve: request => request === '@contentfactory/helpers/utils/media.source'
    ? { readMediaSource: (...args) => readMediaSource(...args) }
    : request === '@contentfactory/helpers/utils/integration-name'
      ? loadTypeScriptModule('libraries/helpers/src/utils/integration-name.ts')
    : request.startsWith('@contentfactory/') ? placeholders : undefined,
});

test('member legacy preview and comment payloads retain their authorized contract', async () => {
  const legacy = { id: 'post', group: 'group', state: 'DRAFT', settings: '{}', childrenPost: [], integration: { id: 'channel', name: 'Provider', displayName: 'Local alias', picture: null, providerIdentifier: 'telegram', profile: null, token: 'synthetic-unused' } };
  const comments = [{ id: 'comment', userId: 'member', postId: 'post', content: 'legacy', organizationId: 'org' }];
  const posts = { getPostsRecursively: jest.fn(async () => [legacy]), getComments: jest.fn(async () => comments) };
  const review = { authorize: async () => ({ kind: 'team', organizationId: 'org', postId: 'post' }) };
  const controller = new PublicController({}, posts, {}, review);
  const result = await controller.getPreview('post', {});
  expect(posts.getPostsRecursively).toHaveBeenCalledWith('post', true, 'org');
  expect(result[0]).toMatchObject({ group: 'group', state: 'DRAFT', settings: '{}', integration: { name: 'Local alias' } });
  expect(result[0]).not.toHaveProperty('childrenPost');expect(result[0].integration).not.toHaveProperty('token');
  expect(await controller.getComments('post', {})).toEqual({ comments });
});

test('guest legacy paths receive only the scoped sanitized representation', async () => {
  const actor = { kind: 'guest', organizationId: 'org', postId: 'post' };
  const posts = { getPostsRecursively: jest.fn(), getComments: jest.fn() };
  const review = { authorize: async () => actor, preview: async () => [{ id: 'post', image: 'scoped media' }], discussions: async () => ({ legacyComments: [{ content: 'safe' }] }) };
  const controller = new PublicController({}, posts, {}, review);
  expect(await controller.getPreview('post', {})).toEqual([{ id: 'post', image: 'scoped media' }]);
  expect(await controller.getComments('post', {})).toEqual({ comments: [{ content: 'safe' }] });
  expect(posts.getPostsRecursively).not.toHaveBeenCalled();expect(posts.getComments).not.toHaveBeenCalled();
});

const response = () => {
  const chunks = [];
  const res = new Writable({ write(chunk, _encoding, next) { chunks.push(Buffer.from(chunk)); next(); } });
  res.headers = {};
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
  res.status = code => { res.statusCode = code; return res; };
  res.send = body => res.end(body);
  res.text = () => Buffer.concat(chunks).toString();
  return res;
};
const request = (method = 'GET', headers = {}) => Object.assign(new EventEmitter(), { method, headers });
const run = (req, res) => PublicController.prototype.streamFile.call({}, { url: 'https://public.example/asset.mp4' }, res, req);
const source = (contentType, body = 'video fixture', extra = {}) => {
  const stream = Readable.from(Buffer.from(body));
  return { stream, contentType, status: 200, close: jest.fn(() => stream.destroy()), ...extra };
};

test('an upstream HTML response is refused without forwarding its executable body', async () => {
  const upstream = source('text/html', '<script>window.PWNED=true</script>');
  readMediaSource = jest.fn(async () => upstream);
  const res = response();
  await run(request(), res);
  expect(res.statusCode).toBe(415);
  expect(res.text()).toBe('Unsupported video type');
  expect(res.text()).not.toContain('<script>');
  expect(upstream.close).toHaveBeenCalledTimes(1);
  expect(upstream.stream.destroyed).toBe(true);
});

test.each(['video/mp4', 'application/octet-stream', 'binary/octet-stream', undefined])('accepted %s bytes always have safe MP4/CSP headers', async contentType => {
  const upstream = source(contentType, '<script>this is not an HTML document</script>');
  readMediaSource = jest.fn(async () => upstream);
  const res = response();
  await run(request(), res);
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toBe('video/mp4');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
  expect(upstream.close).toHaveBeenCalledTimes(1);
});

test('the proxy retains validated partial range status, length and content-range', async () => {
  const upstream = source('video/mp4', 'abc', { status: 206, size: 3, contentRange: 'bytes 2-4/100' });
  readMediaSource = jest.fn(async () => upstream);
  const res = response();
  await run(request('GET', { range: 'bytes=2-4' }), res);
  expect(readMediaSource.mock.calls[0][1].range).toBe('bytes=2-4');
  expect(res.statusCode).toBe(206);
  expect(res.headers['content-range']).toBe('bytes 2-4/100');
  expect(res.headers['content-length']).toBe(3);
  expect(res.headers['accept-ranges']).toBe('bytes');
  expect(res.text()).toBe('abc');
});

test('HEAD returns source headers and releases the stream without reading its body', async () => {
  const upstream = source('video/mp4', 'abc', { size: 3 });
  readMediaSource = jest.fn(async () => upstream);
  const res = response();
  await run(request('HEAD'), res);
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-length']).toBe(3);
  expect(res.text()).toBe('');
  expect(upstream.close).toHaveBeenCalledTimes(1);
});

test('a disconnected client aborts the shared reader and closes its pending body', async () => {
  let upstream, signal;
  readMediaSource = jest.fn(async (_url, options) => {
    signal = options.signal;
    const stream = addAbortSignal(signal, new Readable({ read() {} }));
    upstream = { stream, contentType: 'video/mp4', close: jest.fn(() => stream.destroy()) };
    return upstream;
  });
  const req = request(), res = response();
  const pending = run(req, res);
  await new Promise(resolve => setImmediate(resolve));
  res.destroy();
  await pending;
  expect(signal.aborted).toBe(true);
  expect(upstream.stream.destroyed).toBe(true);
  expect(upstream.close).toHaveBeenCalledTimes(1);
  expect(req.listenerCount('aborted')).toBe(0);
  // Node pipeline retains its own stream listeners; this route must detach
  // its request-specific cancellation callback.
  expect(res.listeners('close').some(listener => listener.name === 'onClose')).toBe(false);
});
