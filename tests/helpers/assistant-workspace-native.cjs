'use strict';

// Real installed Mastra Memory1.32.1/Core1.71, an in-memory store and the
// source AgentThreadsService. No database, provider, model or network call.
const assert = require('node:assert/strict');
const { Memory } = require('@mastra/memory');
const { InMemoryStore } = require('@mastra/core/storage');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

async function main() {
  const memory = new Memory({ storage: new InMemoryStore(), options: { semanticRecall: false, workingMemory: { enabled: true, scope: 'resource' } } });
  await memory.createThread({ threadId: 'native-thread', resourceId: 'org-1:user-1', title: 'Saved native title', metadata: { unrelated: { keep: 12 }, workingMemory: 'Saved preferences' } });
  await memory.updateWorkingMemory({ threadId: 'native-thread', resourceId: 'org-1:user-1', workingMemory: 'New current preferences' });
  const { AgentThreadsService } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts', {
    '@mastra/ai-sdk/ui': { toAISdkMessages: (messages) => messages },
    '@mastra/memory': { Memory },
    '@mastra/core/processors': { RegexFilterProcessor: class {}, UnicodeNormalizer: class {} },
    '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
  });
  const service = new AgentThreadsService({ conductor: async () => ({ getMemory: async () => memory, listSuspendedRuns: async () => ({ runs: [] }) }) });
  const identity = { organizationId: 'org-1', userId: 'user-1' };
  const result = await service.patchWorkspace(identity, 'native-thread', { workContext: null, artifacts: [], activeArtifact: null });
  const stored = await memory.getThreadById({ threadId: 'native-thread' });
  assert.equal(stored.resourceId, 'org-1:user-1');
  assert.equal(stored.title, 'Saved native title');
  assert.equal(stored.metadata.workingMemory, 'Saved preferences');
  assert.deepEqual(stored.metadata.unrelated, { keep: 12 });
  assert.deepEqual(stored.metadata.assistantWorkspace, result.workspace);
  assert.equal(await memory.getWorkingMemory({ threadId: 'native-thread', resourceId: 'org-1:user-1' }), 'New current preferences');
  await service.rememberWorkContext(identity, 'native-thread', null);
  assert.equal(await memory.getWorkingMemory({ threadId: 'native-thread', resourceId: 'org-1:user-1' }), 'New current preferences');
  assert.equal((await memory.getThreadById({ threadId: 'native-thread' })).title, 'Saved native title');
  await service.rename(identity, 'native-thread', 'Renamed native title');
  const renamed = await memory.getThreadById({ threadId: 'native-thread' });
  assert.equal(renamed.title, 'Renamed native title');
  assert.deepEqual(renamed.metadata.assistantWorkspace, result.workspace);
  assert.deepEqual(renamed.metadata.unrelated, { keep: 12 });
  assert.equal(await memory.getWorkingMemory({ threadId: 'native-thread', resourceId: 'org-1:user-1' }), 'New current preferences');
  await assert.rejects(service.patchWorkspace({ ...identity, userId: 'user-2' }, 'native-thread', { workContext: null }), (error) => error.getStatus() === 403);
  assert.equal(await memory.getThreadById({ threadId: 'native-missing' }), null);
  process.stdout.write(JSON.stringify({ passed: true, version: result.workspace.version }));
}

main().catch((error) => { process.stderr.write(String(error.stack ?? error)); process.exitCode = 1; });
