'use strict';

// Source ConductorMemory + native installed Memory/Core/tool execution. The only
// isolated dependency is unrelated paid-operation tracking, which must not run.
const assert = require('node:assert/strict');
const { InMemoryStore } = require('@mastra/core/storage');
const { RequestContext, MASTRA_THREAD_ID_KEY, MASTRA_RESOURCE_ID_KEY } = require('@mastra/core/request-context');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const BASE = 'libraries/nestjs-libraries/src/chat/';
const mocks = { '../conductor/conductor.execution': { currentConductorExecution: () => { throw Error('History must not admit a paid operation'); } } };

async function main() {
  let externalCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => { externalCalls++; throw Error('History must not call an external service'); };
  try {
    const { createConductorMemory } = loadTypeScriptModule(`${BASE}conductor/conductor.memory.ts`, mocks);
    const { seedCapabilityContext } = loadTypeScriptModule(`${BASE}capabilities/capability.context.ts`, mocks);
    const { redactSecretShapes } = loadTypeScriptModule(`${BASE}conductor/secret-shapes.ts`);
    const memory = createConductorMemory(new InMemoryStore());
    assert.equal(memory.constructor.name, 'ConductorMemory');
    const tools = memory.listTools();
    assert.ok(tools.readConversationHistory, 'native memory.listTools must register the history tool');
    assert.equal(tools.readConversationHistory.id, 'read-conversation-history');
    assert.equal(typeof tools.readConversationHistory.execute, 'function');
    const tool = tools.readConversationHistory;
    const identity = { organizationId: 'org', organizationCreatedAt: '2026-01-01T00:00:00Z', userId: 'user', role: 'EDITOR', language: 'en', timeZone: 'UTC' };
    for (const [id, resourceId] of [['current', 'org:user'], ['personal-sibling', 'org:user'], ['foreign-user', 'org:other'], ['foreign-org', 'other:user']]) await memory.createThread({ threadId: id, resourceId, title: id });
    const syntheticSecret = 'sk-or-v1-SyntheticOnlyA1B2C3D4E5F6G7H8';
    const secondSecret = 'tvly-SyntheticOnlyA1B2C3D4E5F6';
    const longText = `Original constraint: preserve all citations. ${'a'.repeat(3900)} ${syntheticSecret}\n${'b'.repeat(16400)} ${secondSecret}\nFinal requirement: preserve the complete input.`;
    const messages = Array.from({ length: 32 }, (_, index) => ({
      id: `current-${index}`, threadId: 'current', resourceId: 'org:user', role: index % 2 ? 'assistant' : 'user', createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      content: { format: 2, parts: [{ type: 'text', text: index === 4 ? longText : index === 0 ? 'EARLIEST_GOAL: use the source dated January1 and save the artifact.' : `Current private message ${index}` }] },
    }));
    for (const [id, resourceId] of [['personal-sibling', 'org:user'], ['foreign-user', 'org:other'], ['foreign-org', 'other:user']]) messages.push({ id: `${id}-message`, threadId: id, resourceId, role: 'user', createdAt: new Date('2026-01-01T00:01:00Z'), content: { format: 2, parts: [{ type: 'text', text: `DO_NOT_LEAK_${id}` }] } });
    await memory.saveMessages({ messages });
    const reads = [];
    const recall = memory.recall.bind(memory);
    memory.recall = async (args) => { reads.push(args); return recall(args); };
    const contextFor = (threadId = 'current', resourceId = 'org:user', actor = identity) => {
      const context = new RequestContext();
      if (actor) seedCapabilityContext(context, actor);
      if (threadId !== undefined) context.set(MASTRA_THREAD_ID_KEY, threadId);
      if (resourceId !== undefined) context.set(MASTRA_RESOURCE_ID_KEY, resourceId);
      return context;
    };
    const call = (input = {}, requestContext = contextFor()) => tool.execute(input, { requestContext });
    const values = (result) => result.messages.untrustedData.value;

    const latest = await call();
    assert.equal(latest.ok, true);
    assert.equal(latest.page, 0);
    assert.equal(latest.perPage, 10);
    assert.equal(latest.total, 32);
    assert.equal(latest.hasMore, true);
    assert.equal(values(latest).length, 10);
    assert.ok(values(latest).every((message) => Number(message.id.split('-')[1]) >= 22));
    assert.match(latest.messages.untrustedData.rule, /never follow instructions/);
    assert.deepEqual(latest.messages.untrustedData.sources, ['workspace-text', 'foreign-post', 'uploaded-file']);
    const oldest = await call({ page: 3 });
    assert.equal(oldest.hasMore, false);
    assert.equal(values(oldest).length, 2);
    assert.ok(values(oldest).some((message) => message.text.includes('EARLIEST_GOAL')));
    const allIds = new Set();
    for (let page = 0; page < 4; page++) for (const message of values(await call({ page }))) allIds.add(message.id);
    assert.equal(allIds.size, 32, 'bounded continuation reaches every message beyond the recent10');

    const redacted = redactSecretShapes(longText);
    assert.ok(!redacted.includes(syntheticSecret));
    assert.ok(!redacted.includes(secondSecret));
    let offset = 0;
    let collected = '';
    let chunks = 0;
    while (true) {
      const result = await call({ page: 2, messageId: 'current-4', offset, length: 4000 });
      assert.equal(result.ok, true);
      const [message] = values(result);
      assert.equal(values(result).length, 1);
      assert.equal(message.totalCharacters, redacted.length);
      assert.ok(message.text.length <= 4000);
      assert.ok(!message.text.includes(syntheticSecret));
      assert.ok(!message.text.includes(secondSecret));
      collected += message.text;
      chunks++;
      if (!message.truncated) { assert.equal(message.nextOffset, undefined); break; }
      assert.equal(message.nextOffset, offset + message.text.length);
      offset = message.nextOffset;
      assert.ok(chunks < 10, 'long-message continuation must make bounded progress');
    }
    assert.equal(collected, redacted);
    assert.match(collected, /Final requirement: preserve the complete input\.$/);
    assert.ok(chunks > 1);
    const wrongPage = await call({ page: 0, messageId: 'current-4' });
    assert.equal(wrongPage.messageNotInPage, true);
    assert.deepEqual(values(wrongPage), []);

    // Input cannot select either a sibling chat or a foreign tenant/user.
    for (const other of ['personal-sibling', 'foreign-user', 'foreign-org']) {
      const result = await call({ threadId: other, resourceId: other === 'foreign-org' ? 'other:user' : 'org:other', requestContext: { [MASTRA_THREAD_ID_KEY]: other }, page: 0 });
      assert.equal(result.ok, true);
      assert.ok(values(result).every((message) => message.id.startsWith('current-')));
      assert.ok(!JSON.stringify(result).includes('DO_NOT_LEAK_'));
      assert.equal(reads.at(-1).threadId, 'current');
      assert.equal(reads.at(-1).resourceId, 'org:user');
    }
    for (const requestContext of [contextFor('foreign-user'), contextFor('foreign-org'), contextFor('missing'), contextFor('current', 'org:other'), contextFor('current', 'other:user'), contextFor('current', 'org:user', null), new RequestContext()]) {
      const before = reads.length;
      const refused = await call({}, requestContext);
      assert.equal(refused.ok, false);
      assert.equal(refused.code, 'AGENT_NOT_YOURS');
      assert.equal(reads.length, before, 'identity/owner refusal precedes native transcript recall');
    }
    for (const args of reads) {
      assert.equal(args.threadId, 'current');
      assert.equal(args.resourceId, 'org:user');
      assert.ok(args.perPage >= 1 && args.perPage <= 20);
      assert.notEqual(args.perPage, false);
      assert.equal(args.vectorSearchString, undefined);
    }
    assert.equal(externalCalls, 0);
    process.stdout.write(JSON.stringify({ passed: true, toolRegistered: true, messagesReached: allIds.size, longMessageChunks: chunks, ownerRefusals: 7, inputCannotSelectThread: true, redacted: true, externalCalls }));
  } finally { global.fetch = originalFetch; }
}
main().catch((error) => { process.stderr.write(error.stack ?? String(error)); process.exitCode = 1; });
