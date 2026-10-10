'use strict';

const { createRequire } = require('node:module');
const http = require('node:http');
const zlib = require('node:zlib');

const fromPackage = (consumer, dependency) =>
  createRequire(require.resolve(`${consumer}/package.json`))(dependency);

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('legacy request multipart boundaries use independent entropy with Math.random fixed', () => {
  const FormData = fromPackage('request', 'form-data');
  const random = jest.spyOn(Math, 'random').mockReturnValue(0.25);
  try {
    expect(new FormData().getBoundary()).not.toBe(new FormData().getBoundary());
  } finally { random.mockRestore(); }
});

test.each(['request', 'axios', 'transloadit'])('%s multipart prevents header injection from field names', (consumer) => {
  const FormData = fromPackage(consumer, 'form-data');
  const form = new FormData();
  // Either reject invalid input or safely serialize it without a new header.
  const failures = [];
  form.on('error', (error) => failures.push(error));
  try { form.append('caption\r\nX-Injected: yes', 'synthetic'); }
  catch (error) { failures.push(error); }
  if (failures.length === 0) expect(form.getBuffer().toString()).not.toContain('\r\nX-Injected: yes');
});

test('Handlebars refuses non-numeric AST block parameter count before code generation', () => {
  const handlebars = require('handlebars');
  const ast = handlebars.parse('{{#if ok}}safe{{/if}}');
  ast.body[0].program.blockParams = { length: '1 + 1' };
  expect(() => handlebars.compile(ast)({ ok: true })).toThrow();
  expect(handlebars.compile('Hello {{name}}')({ name: '<person>' })).toBe('Hello &lt;person&gt;');
});

test('Express proxy subnet does not trust an arbitrary IPv4 through a short mapped IPv6 prefix', () => {
  const proxyaddr = fromPackage('express', 'proxy-addr');
  const req = { socket: { remoteAddress: '203.0.113.7' }, headers: { 'x-forwarded-for': '10.0.0.8' } };
  expect(proxyaddr(req, proxyaddr.compile('::ffff:10.0.0.0/8'))).toBe('203.0.113.7');
  expect(proxyaddr(req, proxyaddr.compile('10.0.0.0/8'))).toBe('203.0.113.7');
});

test('shell object operators containing a command separator are rejected', () => {
  const shellQuote = fromPackage('mastra', 'shell-quote');
  expect(() => shellQuote.quote([{ op: '\necho synthetic' }])).toThrow();
  expect(shellQuote.parse(shellQuote.quote(['one two', 'plain']))).toEqual(['one two', 'plain']);
  expect(() => shellQuote.quote(['echo', 'safe', { comment: 'comment' }, 'a\necho synthetic;#'])).toThrow();
});

test('Sharp retains metadata, resizing and image conversion on actual native binaries', async () => {
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 12, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
  expect(await sharp(png).metadata()).toMatchObject({ width: 12, height: 8, format: 'png' });
  const jpeg = await sharp(png).resize({ width: 6 }).toFormat('jpeg').toBuffer();
  expect(await sharp(jpeg).metadata()).toMatchObject({ width: 6, height: 4, format: 'jpeg' });
  const avif = await sharp(png).avif().toBuffer();
  expect(await sharp(avif).metadata()).toMatchObject({ width: 12, height: 8, format: 'heif', compression: 'av1' });
});

test('SMTP message creation retains text, HTML and envelope with no SMTP connection', async () => {
  const transport = require('nodemailer').createTransport({ streamTransport: true, buffer: true });
  const result = await transport.sendMail({ from: 'Factory <factory@example.test>', to: 'person@example.test',
    subject: 'Synthetic reset', text: 'Reset link', html: '<p>Reset link</p>' });
  expect(result.envelope).toEqual({ from: 'factory@example.test', to: ['person@example.test'] });
  expect(result.message.toString()).toContain('multipart/alternative');
  expect(result.message.toString()).toContain('<p>Reset link</p>');
});

test('Multer retains buffer upload, nested text fields and file size errors through Express', async () => {
  const express = require('express');
  const multer = require('multer');
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 } }).single('file');
  app.post('/upload', (req, res) => upload(req, res, (error) => {
    if (error) return res.status(400).json({ code: error.code });
    res.json({ name: req.file.originalname, content: req.file.buffer.toString(), caption: req.body.caption });
  }));
  await withServer(app, async (base) => {
    const axios = require('axios');
    const FormData = fromPackage('axios', 'form-data');
    const valid = new FormData();
    valid.append('caption[title]', 'Synthetic');
    valid.append('file', Buffer.from('image'), { filename: 'sample.png', contentType: 'image/png' });
    const reply = await axios.post(`${base}/upload`, valid, { proxy: false });
    expect(reply.data).toEqual({ name: 'sample.png', content: 'image', caption: { title: 'Synthetic' } });
    const large = new FormData();
    large.append('file', Buffer.alloc(17), { filename: 'large.png' });
    const rejected = await axios.post(`${base}/upload`, large, { proxy: false, validateStatus: () => true });
    expect(rejected.status).toBe(400);
    expect(rejected.data.code).toBe('LIMIT_FILE_SIZE');
  });
});

test('HTTP compression retains gzip output and Axios decompresses it on loopback', async () => {
  const express = require('express');
  const app = express();
  app.use(require('compression')({ threshold: 0 }));
  app.get('/', (_req, res) => res.type('text/plain').send('synthetic '.repeat(200)));
  await withServer(app, async (base) => {
    const reply = await require('axios').get(base, { proxy: false, responseType: 'arraybuffer', decompress: false,
      headers: { 'Accept-Encoding': 'gzip' } });
    expect(reply.headers['content-encoding']).toBe('gzip');
    expect(zlib.gunzipSync(reply.data).toString()).toBe('synthetic '.repeat(200));
  });
});

test('Temporal protobuf encoding retains its actual trusted workflow message', () => {
  const { temporal } = require('@temporalio/proto');
  const type = temporal.api.common.v1.WorkflowExecution;
  const bytes = type.encode(type.create({ workflowId: 'synthetic', runId: 'synthetic-run' })).finish();
  expect(type.toObject(type.decode(bytes))).toEqual({ workflowId: 'synthetic', runId: 'synthetic-run' });
});

test('Temporal gRPC dependency retains a real loopback unary round trip', async () => {
  const grpc = fromPackage('@temporalio/client', '@grpc/grpc-js');
  const service = { echo: { path: '/synthetic.Echo/Echo', requestStream: false, responseStream: false,
    requestSerialize: (value) => Buffer.from(value), requestDeserialize: (value) => value.toString(),
    responseSerialize: (value) => Buffer.from(value), responseDeserialize: (value) => value.toString() } };
  const server = new grpc.Server();
  server.addService(service, { echo: (call, reply) => reply(null, call.request) });
  const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(),
    (error, value) => error ? reject(error) : resolve(value)));
  const Client = grpc.makeGenericClientConstructor(service, 'Echo');
  const client = new Client(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  try {
    const reply = await new Promise((resolve, reject) => client.echo('synthetic',
      (error, value) => error ? reject(error) : resolve(value)));
    expect(reply).toBe('synthetic');
  } finally { client.close(); server.forceShutdown(); }
});

test('Fast XML Parser retains source RSS and AWS XML response shapes', () => {
  const { XMLParser } = require('fast-xml-parser');
  expect(new XMLParser({ ignoreAttributes: false }).parse('<rss><channel><item><title>Synthetic</title></item></channel></rss>'))
    .toEqual({ rss: { channel: { item: { title: 'Synthetic' } } } });
  const { XMLParser: AwsParser } = fromPackage('@aws-sdk/xml-builder', 'fast-xml-parser');
  expect(new AwsParser().parse('<Result><ETag>synthetic</ETag></Result>')).toEqual({ Result: { ETag: 'synthetic' } });
});
