'use strict';
const assert = require('node:assert/strict');
const { Memory } = require('@mastra/memory');
const { InMemoryStore } = require('@mastra/core/storage');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
async function main() {
  const memory = new Memory({ storage: new InMemoryStore(), options: { semanticRecall: false, generateTitle: false } });
  for (let i = 0; i < 105; i++) await memory.createThread({ threadId: `chat-${i}`, resourceId: 'org:user', title: `Chat ${i}` });
  await memory.createThread({ threadId: 'foreign-user', resourceId: 'org:other', title: 'Private' });
  await memory.createThread({ threadId: 'foreign-org', resourceId: 'other:user', title: 'Private' });
  await memory.saveMessages({ messages: Array.from({ length: 405 }, (_, i) => ({ id: `msg-${i}`, threadId: 'chat-0', resourceId: 'org:user', role: i % 2 ? 'assistant' : 'user', createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)), content: { format: 2, parts: [{ type: 'text', text: `Message ${i}` }] } })) });
  const { AgentThreadsService } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts', {
    '@mastra/ai-sdk/ui': { toAISdkMessages: (messages) => messages },
    '@mastra/memory': { Memory },
    '@mastra/core/processors': { RegexFilterProcessor: class {}, UnicodeNormalizer: class {} },
    '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
  });
  let modelCalls = 0;
  const service = new AgentThreadsService({ conductor: async () => ({ getMemory: async () => memory, listSuspendedRuns: async () => ({ runs: [] }), stream: () => { modelCalls++; throw Error('No model allowed'); } }) });
  const identity = { organizationId: 'org', userId: 'user' };
  const first = await service.list(identity);
  const second = await service.list(identity, { page: 1 });
  assert.equal(first.threads.length, 100);
  assert.equal(second.threads.length, 5);
  assert.deepEqual(first.pagination, { page: 0, perPage: 100, total: 105, hasMore: true });
  assert.equal(second.pagination.hasMore, false);
  assert.equal(new Set([...first.threads, ...second.threads].map((row) => row.id)).size, 105);
  const latest = await service.history(identity, 'chat-0');
  assert.equal(latest.messages.length, 200);
  assert.equal(latest.messages[0].id, 'msg-205');
  assert.equal(latest.messages.at(-1).id, 'msg-404');
  const older = await service.readMessages(identity, 'chat-0', { page: 1 });
  const oldest = await service.readMessages(identity, 'chat-0', { page: 2 });
  assert.equal(older.messages[0].id, 'msg-5');
  assert.equal(older.messages.at(-1).id, 'msg-204');
  assert.equal(oldest.messages.length, 5);
  assert.equal(oldest.pagination.hasMore, false);
  assert.equal(new Set([...latest.messages, ...older.messages, ...oldest.messages].map((row) => row.id)).size, 405);
  for (const foreign of ['foreign-user', 'foreign-org']) {
    await assert.rejects(service.readMessages(identity, foreign), (error) => error.getStatus() === 403);
    await assert.rejects(service.history(identity, foreign, { page: 1 }), (error) => error.getStatus() === 403);
  }
  await assert.rejects(service.readMessages(identity, 'missing'), (error) => error.getStatus() === 404);
  for (const options of [{ page: -1 }, { page: 0.5 }, { perPage: false }, { perPage: 201 }]) await assert.rejects(service.readMessages(identity, 'chat-0', options), (error) => error.getStatus() === 400);
  assert.equal(modelCalls, 0);
  assert.equal((await service.list(identity)).pagination.total, 105);
  process.stdout.write(JSON.stringify({ passed: true, threads: 105, messages: 405, modelCalls }));
}
main().catch((error) => { process.stderr.write(error.stack ?? String(error)); process.exitCode = 1; });
