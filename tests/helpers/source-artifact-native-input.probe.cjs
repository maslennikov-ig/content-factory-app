'use strict';

// Actual installed V2 provider bridge, durable Agent, HTTP controller and
// isolated PostgreSQL/Redis. Only transport responses and source rows are fake.
const assert = require('node:assert/strict');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { HttpController, AgentThreadsService, Response: HttpResponse, providerModel, providerRequests } = require('./agent-native-session-http.probe.cjs');
const { loadRegistry } = require('./agent-capabilities.cjs');

const sourceCapability = loadRegistry().CAPABILITY_CATALOGUE.find(capability => capability.id === 'source.resolve_artifact');

async function scenario(kind, pinned = false) {
  const input = { version: 1, kind, pieceId: 'source-owned', adaptationId: kind === 'adaptation' ? 'adaptation-owned' : null,
    postId: null, revision: pinned ? 'a'.repeat(64) : null };
  const before = JSON.stringify(input);
  const expected = { version: 1, kind, pieceId: 'source-owned',
    ...(kind === 'adaptation' ? { adaptationId: 'adaptation-owned' } : {}), ...(pinned ? { revision: 'a'.repeat(64) } : {}) };
  let resolverCalls = 0;
  const model = await providerModel(['source-native', 'source_resolve_artifact', input]);
  assert.equal(model.specificationVersion, 'v2', 'Use the production V2 bridge, not a V3 mock that removes undefined keys.');
  const runtime = await createRuntime({ capabilities: [sourceCapability], modelFactory: () => model,
    serviceFor: token => token.name === 'SourceArtifactServiceV1' ? { resolve: async (organizationId, actorId, selection) => {
      resolverCalls++;
      assert.equal(organizationId, IDENTITY.organizationId);
      assert.equal(actorId, IDENTITY.userId);
      assert.deepEqual(selection, expected);
      return { ref: { ...selection, revision: 'a'.repeat(64) }, actorId, organizationId,
        title: 'Controlled source', text: 'Exact controlled source.', locale: 'en', contentDigest: 'b'.repeat(64) };
    } } : {} });
  try {
    const handler = new HttpController(runtime.service, new AgentThreadsService(runtime.service, runtime.redis), runtime.aiUsage);
    const org = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] };
    const user = { id: IDENTITY.userId, language: 'ru' }, threadId = `${runtime.schemaName}-source-${kind}-${pinned}`;
    const response = new HttpResponse();
    await handler.chat(org, user, { threadId, messages: [{ id: 'source-native-human', role: 'user', parts: [{ type: 'text', text: 'Resolve the exact saved source.' }] }] }, response);
    assert.equal(resolverCalls, 1, 'The native piece call must reach the resolver instead of failing strict parsing.');
    assert.equal(response.parts().some(part => part.type === 'tool-output-error' || part.type === 'error'), false);
    const toolResult = response.parts().find(part => part.type === 'tool-output-available');
    assert.equal(toolResult?.output?.ok, true);
    assert.equal(toolResult.output.summary.untrustedData.value.text, 'Exact controlled source.');
    const saved = await handler.getThread(org, user, threadId);
    assert.equal(saved.execution.state, 'settled');
    assert.equal(saved.execution.outcome, 'completed');
    assert.equal(saved.pending.length, 0);
    assert.equal(response.parts().find(part => part.type === 'finish').finishReason, 'stop');
    assert.equal(response.writableEnded, true);
    assert.equal(providerRequests.get(model).length, 2);
    assert.equal(JSON.stringify(input), before, 'Transport arguments remain unchanged.');
    return { kind, pinned, resolverCalls, transportCalls: 2, outputOk: true, outcome: 'completed', inputUnchanged: true };
  } finally { await runtime.close({ drop: true }); }
}

(async () => {
  let externalRequests = 0;
  global.fetch = async () => { externalRequests++; throw Error('External HTTP is forbidden in source artifact regression.'); };
  const cases = [await scenario('piece'), await scenario('piece', true), await scenario('adaptation')];
  assert.equal(externalRequests, 0);
  console.log(JSON.stringify({ cases, externalRequests }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
