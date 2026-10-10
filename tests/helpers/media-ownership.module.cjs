'use strict';

const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { loadWithMocks } = require('./load-ts-with-mocks.cjs');

const prismaStub = { '@contentfactory/nestjs-libraries/database/prisma/prisma.service':
  { PrismaRepository: class {}, PrismaTransaction: class {} } };
function loadRepositories() {
  return {
    ...loadWithMocks('libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts', prismaStub),
    ...loadWithMocks('libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts', prismaStub),
  };
}

function response() {
  return { statusCode: 200, headersSent: false, body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.headersSent = true; this.body = body; return this; },
    end() { this.headersSent = true; return this; } };
}

function r2Fixture() {
  const { MockRedis } = loadTypeScriptModule('libraries/nestjs-libraries/src/redis/redis.service.ts', {
    ioredis: { Redis: class {} },
  });
  const redis = new MockRedis();
  const calls = [], signatures = [], uploads = new Set(), objects = new Set();
  let sequence = 0;
  const commandNames = ['UploadPartCommand', 'ListPartsCommand', 'CreateMultipartUploadCommand',
    'CompleteMultipartUploadCommand', 'AbortMultipartUploadCommand', 'PutObjectCommand', 'GetObjectCommand', 'DeleteObjectCommand'];
  const commands = Object.fromEntries(commandNames.map(name => [name, class {
    constructor(input) { this.kind = name; this.input = input; }
  }]));
  const hooks = { failSend: null, detectedMime: 'image/png', failRedis: false, failSet: false, hangGet: false, hangSet: false };
  const sessionKeys = [];
  const realGet = redis.get.bind(redis), realSet = redis.set.bind(redis);
  redis.get = async (...args) => {
    if (hooks.hangGet) return new Promise(() => {});
    if (hooks.failRedis) throw new Error('Synthetic store unavailable');
    return realGet(...args);
  };
  redis.set = async (...args) => {
    if (hooks.hangSet) return new Promise(() => {});
    if (hooks.failRedis || hooks.failSet) throw new Error('Synthetic store unavailable');
    sessionKeys.push(args[0]);
    return realSet(...args);
  };
  const send = async command => {
    calls.push(command);
    if (hooks.failSend) { const failure = hooks.failSend(command); if (failure) throw failure; }
    const { Key: key, UploadId: id } = command.input;
    const pair = JSON.stringify([key, id]);
    switch (command.kind) {
      case 'CreateMultipartUploadCommand': {
        const UploadId = 'synthetic-upload-' + ++sequence;
        uploads.add(JSON.stringify([key, UploadId]));
        return { Key: key, UploadId };
      }
      case 'CompleteMultipartUploadCommand':
        if (!uploads.delete(pair)) throw Object.assign(new Error('Synthetic missing upload'), { name: 'NoSuchUpload' });
        objects.add(key);
        return { Key: key, ETag: 'synthetic-etag', Location: 'https://untrusted.invalid/' + key };
      case 'GetObjectCommand':
        if (!objects.has(key)) throw Object.assign(new Error('Synthetic missing object'), { name: 'NoSuchKey' });
        return { Body: (async function* () { yield Buffer.from('synthetic-image'); })() };
      case 'DeleteObjectCommand': objects.delete(key); return {};
      case 'AbortMultipartUploadCommand': uploads.delete(pair); return {};
      case 'ListPartsCommand': return { Parts: [{ PartNumber: 1, ETag: 'synthetic-part' }] };
      default: throw new Error('Unexpected fake R2 operation ' + command.kind);
    }
  };
  class S3Client { send = send; }
  const uploader = loadTypeScriptModule('libraries/nestjs-libraries/src/upload/r2.uploader.ts', {
    '@aws-sdk/client-s3': { ...commands, S3Client },
    '@aws-sdk/s3-request-presigner': { getSignedUrl: async (_client, command, options) => {
      signatures.push({ command, options }); return 'https://synthetic.invalid/signed';
    } },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'synthetic-file-' + (sequence + 1) },
    '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: redis },
    'file-type': { fromBuffer: async () => ({ ext: 'png', mime: hooks.detectedMime }) },
  });
  const owner = { organizationId: 'org-a', userId: 'user-a' };
  const run = async (endpoint, body, actor = owner) => {
    const res = response();
    const value = await uploader.default(endpoint, { body }, res, actor);
    return { res, value, body: res.body };
  };
  const create = async actor => {
    const result = await run('create-multipart-upload', { file: { name: 'image.png' }, fileHash: 'synthetic-hash' }, actor);
    return result.body;
  };
  return { owner, run, create, calls, signatures, redis, hooks, uploads, objects, sessionKeys };
}

module.exports = { r2Fixture, response, loadRepositories, prismaStub };
