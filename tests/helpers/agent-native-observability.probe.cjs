'use strict';

require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { PostgresStore } = require('@mastra/pg');
const { Mastra } = require('@mastra/core/mastra');
const { Agent } = require('@mastra/core/agent');
const { createTool } = require('@mastra/core/tools');
const { SpanType } = require('@mastra/core/observability');
const { RequestContext, MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } = require('@mastra/core/request-context');
const { Memory } = require('@mastra/memory');
const { MockLanguageModelV3 } = require('ai/test');
const { APICallError } = require('ai');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { z } = require('zod');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');

async function main() {
  const schemaName = `cf_native_obs_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const pgUrl = process.env.CF_TEST_PG_URL || 'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db';
  const endpoint = new URL(pgUrl);
  assert.ok(['127.0.0.1', 'localhost'].includes(endpoint.hostname) && endpoint.port === '5433', 'Use only the local test PostgreSQL.');
  assert.ok(endpoint.pathname === '/cf-dev-db' || /^\/cf_on0i_qa_[a-z0-9_]+_mastra$/.test(endpoint.pathname), 'Use only a known local test database.');
  const storage = new PostgresStore({ id: schemaName, connectionString: pgUrl, schemaName });
  let mastra;
  const originalFetch = globalThis.fetch;
  const inlineMediaReads = [];
  const blockedExternalRequests = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const headers = Object.fromEntries(new Headers(init?.headers || input?.headers || {}));
    const request = { method: init?.method || input?.method || 'GET',
      hasBody: Boolean(init?.body || input?.body), headers };
    if (url.protocol === 'data:') {
      inlineMediaReads.push({ scheme: 'data:', mediaType: url.pathname.split(';', 1)[0],
        method: request.method, hasBody: request.hasBody, headerNames: Object.keys(headers) });
      return originalFetch(input, init);
    }
    blockedExternalRequests.push({ url: url.toString(), ...request });
    throw new Error('No external network in synthetic tracing fixture.');
  };
  try {
    await storage.init();
    const { createNativeObservability } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/native-observability.ts');
    const owner = { organizationId: 'fixture-observability-org', userId: 'fixture-observability-user', role: 'ADMIN', language: 'ru', timeZone: 'Europe/Moscow', organizationCreatedAt: '2026-01-01T00:00:00.000Z' };
    const threadId = randomUUID();
    const resourceId = `${owner.organizationId}:${owner.userId}`;
    const requestId = randomUUID();
    const usageRecordId = randomUUID();
    const apiSecret = 'sk-or-v1-' + 'SyntheticNativeTraceKey1234567890';
    const headerSecret = 'SYNTHETIC_HEADER_NOT_FOR_STORAGE';
    const visionSentinel = 'SYNTHETIC_RAW_VISION_TRACE_PAYLOAD';
    const pdfSentinel = 'SYNTHETIC_RAW_PDF_TRACE_PAYLOAD';
    const instructionsSentinel = 'SYNTHETIC_PRIVATE_DYNAMIC_INSTRUCTIONS';
    const toolDescriptionSentinel = 'SYNTHETIC_PRIVATE_TOOL_DESCRIPTION';
    const failureSentinels = ['SYNTHETIC_PRIVATE_PROVIDER_ERROR', 'SYNTHETIC_PRIVATE_PROVIDER_STACK',
      'SYNTHETIC_PRIVATE_PROVIDER_CAUSE', 'SYNTHETIC_PRIVATE_PROVIDER_CONFIG'];
    const visionDataUrl = 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(visionSentinel)]).toString('base64');
    const pdfBytes = Buffer.from('%PDF-1.4\n' + pdfSentinel);
    const pdfDataUrl = 'data:application/pdf;base64,' + pdfBytes.toString('base64');
    const context = new RequestContext();
    context.set(MASTRA_RESOURCE_ID_KEY, resourceId);
    context.set(MASTRA_THREAD_ID_KEY, threadId);
    context.set('cf.organizationId', owner.organizationId);
    context.set('cf.userId', owner.userId);
    context.set('cf.requestId', requestId);
    context.set('headers', { authorization: headerSecret, 'x-private': headerSecret });
    context.set('credentials', { apiKey: apiSecret });
    let modelCalls = 0;
    let toolCalls = 0;
    const usage = { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 5, text: 5 } };
    const response = () => {
      modelCalls++;
      return modelCalls === 1
        ? { content: [{ type: 'tool-call', toolCallId: 'native-observability-tool', toolName: 'inspect_fixture', input: JSON.stringify({ value: apiSecret }) }], finishReason: { unified: 'tool-calls', raw: 'tool_calls' } }
        : { content: [{ type: 'text', text: 'Synthetic native tool completed.' }], finishReason: { unified: 'stop', raw: 'stop' } };
    };
    const model = new MockLanguageModelV3({ modelId: 'synthetic-native-observability',
      async doGenerate() { return { ...response(), usage, warnings: [] }; },
      async doStream() {
        const value = response();
        const parts = [{ type: 'stream-start', warnings: [] }];
        for (const part of value.content) {
          if (part.type === 'text') parts.push({ type: 'text-start', id: 'answer' }, { type: 'text-delta', id: 'answer', delta: part.text }, { type: 'text-end', id: 'answer' });
          else parts.push(part);
        }
        parts.push({ type: 'finish', finishReason: value.finishReason, usage });
        return { stream: convertArrayToReadableStream(parts) };
      },
    });
    const agent = new Agent({ id: 'native-observability-fixture', name: 'Native observability fixture',
      instructions: `Call inspect_fixture once, then finish. ${instructionsSentinel}`, model,
      tools: { inspect_fixture: createTool({ id: 'inspect_fixture', description: toolDescriptionSentinel,
        inputSchema: z.object({ value: z.string() }),
        execute: async () => { toolCalls++; return { note: apiSecret, image: visionDataUrl, pdf: pdfDataUrl, bytes: pdfBytes, headers: { authorization: headerSecret } }; },
      }) },
    });
    mastra = new Mastra({ logger: false, storage, agents: { fixture: agent }, observability: createNativeObservability() });
    const memory = new Memory({ storage });
    await memory.createThread({ threadId, resourceId, title: 'Synthetic observability thread' });
    const output = await agent.stream([{ role: 'user', content: [
      { type: 'text', text: `Synthetic input ${apiSecret}` },
      { type: 'image', image: visionDataUrl },
      { type: 'file', data: pdfBytes, mediaType: 'application/pdf' },
    ] }], { requestContext: context, maxSteps: 3,
      // Exercise the global export boundary without per-call input/output hiding.
      tracingOptions: { metadata: { usageRecordId } },
    });
    assert.equal(await output.text, 'Synthetic native tool completed.');
    assert.equal(modelCalls, 2);
    assert.equal(toolCalls, 1);
    const instance = mastra.observability.getDefaultInstance();
    assert.ok(instance, 'Native observability must be active.');
    const failure = new APICallError({ message: failureSentinels[0],
      url: 'https://synthetic-provider.invalid/generate', requestBodyValues: { prompt: apiSecret, pdf: pdfDataUrl },
      responseHeaders: { authorization: headerSecret },
      responseBody: JSON.stringify({ headers: { authorization: headerSecret }, config: failureSentinels[3], pdf: pdfDataUrl }),
      statusCode: 503, cause: new Error(failureSentinels[2]),
    });
    failure.stack = failureSentinels[1];
    const failedSpan = instance.startSpan({ name: 'synthetic provider failure', type: SpanType.MODEL_GENERATION,
      attributes: { model: 'synthetic-error', provider: 'in-process' }, metadata: { threadId, resourceId } });
    failedSpan.error({ error: failure, attributes: {
      error: failureSentinels[0], cause: failureSentinels[2], stack: failureSentinels[1],
      config: { value: failureSentinels[3], headers: { authorization: headerSecret } },
    } });
    const foreignActor = instance.startSpan({ name: 'other actor', type: SpanType.AGENT_RUN,
      attributes: { agentId: 'fixture' }, metadata: { threadId, resourceId: owner.organizationId + ':other-user' } });
    foreignActor.end();
    const foreignThread = instance.startSpan({ name: 'other thread', type: SpanType.AGENT_RUN,
      attributes: { agentId: 'fixture' }, metadata: { threadId: randomUUID(), resourceId } });
    foreignThread.end();
    await mastra.observability.flush();
    const observability = await storage.getStore('observability');
    const all = await observability.listTraces({ pagination: { page: 0, perPage: 50 } });
    const scoped = await observability.listTraces({ filters: { threadId, resourceId }, pagination: { page: 0, perPage: 50 } });
    assert.ok(scoped.spans.length >= 1);
    assert.ok(all.spans.length >= scoped.spans.length + 2);
    assert.equal(scoped.spans.some(span => [foreignActor.traceId, foreignThread.traceId].includes(span.traceId)), false);
    const allSpans = [];
    for (const trace of all.spans) allSpans.push(...(await observability.getTrace({ traceId: trace.traceId })).spans);
    const serialized = JSON.stringify(allSpans);
    for (const sentinel of [apiSecret, headerSecret, visionSentinel, pdfSentinel, visionDataUrl, pdfDataUrl,
      pdfBytes.toString('base64'), instructionsSentinel, toolDescriptionSentinel]) {
      assert.equal(serialized.includes(sentinel), false, 'Raw secret/media reached native PostgreSQL spans.');
    }
    for (const sentinel of failureSentinels) assert.equal(serialized.includes(sentinel), false,
      'Raw native provider error/stack/cause/config reached PostgreSQL spans.');
    const storedFailure = allSpans.find(span => span.spanId === failedSpan.id);
    assert.ok(storedFailure?.error, 'The native failure must remain observable after privacy filtering.');
    assert.equal(storedFailure.error.message, 'Operation failed');
    assert.ok(allSpans.every(span => span.input == null && span.output == null), 'Native span input/output must be omitted.');
    const { AgentThreadsService } = loadCapabilityModule('../conductor/agent-threads.service.ts', {
      mocks: { '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} } },
    });
    const service = new AgentThreadsService({ conductor: async () => ({ getMemory: async () => memory }), mastra: async () => mastra });
    const queried = await service.queryObservability(owner, threadId);
    const mainSpan = queried.spans.find(span => span.name.includes('agent run')) || queried.spans.find(span => !span.parentSpanId);
    const toolSpan = queried.spans.find(span => span.attributes.toolId === 'inspect_fixture' || span.attributes.toolName === 'inspect_fixture' || span.name.includes('inspect_fixture'));
    assert.ok(mainSpan, 'Native agent run span must reach the actual consumer.');
    assert.ok(toolSpan, 'Native tool span must reach the actual consumer.');
    assert.ok(queried.linkedSpans.some(span => span.spanId === toolSpan.spanId));
    assert.equal(queried.spans.some(span => [foreignActor.traceId, foreignThread.traceId].includes(span.traceId)), false);
    assert.equal(queried.nativeQueries.metrics, 'unsupported');
    assert.equal(queried.usage.isInvoice, false);
    assert.equal(queried.usage.knownCostUsd, null);
    await assert.rejects(service.queryObservability({ ...owner, userId: 'other-user' }, threadId));
    const ownRawSpans = allSpans.filter(span => scoped.spans.some(root => root.traceId === span.traceId));
    assert.ok(ownRawSpans.some(span => span.threadId === threadId && span.resourceId === resourceId && span.requestId === requestId), 'Trusted request/thread/resource IDs must be stored natively.');
    assert.ok(ownRawSpans.some(span => span.metadata?.usageRecordId === usageRecordId), 'Only an explicit public ledger ID is correlated; no ledger is invented.');
    const attemptedRequests = JSON.stringify(blockedExternalRequests);
    for (const privateValue of [apiSecret, headerSecret, visionSentinel, pdfSentinel, threadId, resourceId, requestId, usageRecordId]) {
      assert.equal(attemptedRequests.includes(privateValue), false, 'An external request attempted to include private scope or payload.');
    }
    assert.ok(blockedExternalRequests.every(request => request.method === 'GET' && !request.hasBody), 'No provider generation or telemetry POST is allowed in the fixture.');
    assert.ok(inlineMediaReads.every(request => request.method === 'GET' && !request.hasBody && request.headerNames.length === 0));

    const ownRoot = { traceId: 'scope-chain', spanId: 'root', parentSpanId: null, name: 'root', threadId, resourceId };
    const rows = [ownRoot,
      { traceId: 'scope-chain', spanId: 'inherited', parentSpanId: 'root', name: 'inherited child' },
      { traceId: 'scope-chain', spanId: 'grandchild', parentSpanId: 'inherited', name: 'inherited grandchild' },
      { traceId: 'scope-chain', spanId: 'conflict', parentSpanId: 'root', name: 'conflicting child', resourceId: 'other-user' },
      { traceId: 'scope-chain', spanId: 'conflict-descendant', parentSpanId: 'conflict', name: 'wrong branch', threadId, resourceId },
      { traceId: 'scope-chain', spanId: 'orphan', parentSpanId: 'missing', name: 'unproven child', threadId, resourceId },
    ];
    const scopeStore = {
      listTraces: async args => { assert.deepEqual(args.filters, { threadId, resourceId }); return { spans: [ownRoot] }; },
      getTrace: async args => { assert.equal(args.traceId, 'scope-chain'); return { spans: rows }; },
      querySpans: async () => { throw new Error('Unsupported legacy span-query API must not be invoked.'); },
      aggregateTraces: async () => { throw new Error('Unsupported legacy trace-aggregate API must not be invoked.'); },
    };
    const scopedService = new AgentThreadsService({ conductor: async () => ({ getMemory: async () => memory }),
      mastra: async () => ({ getStorage: () => ({ getStore: async () => scopeStore }) }) });
    const inherited = await scopedService.queryObservability(owner, threadId);
    assert.deepEqual(inherited.spans.map(span => span.spanId).sort(), ['grandchild', 'inherited', 'root']);
    console.log(JSON.stringify({ nativeObservability: true, postgres: true, nativeAgentAndTool: true,
      linkedTool: true, otherActorExcluded: true, otherThreadExcluded: true, requestCorrelation: true,
      secretsAndMediaNeverStored: true, inputOutputOmitted: true, realLegacyConsumer: true,
      privateInstructionsAndToolDescriptionsOmitted: true,
      nativeProviderFailureDetailsOmitted: true,
      advancedMetricsUnsupported: true, scopeLessChildrenInherited: true, conflictingBranchesExcluded: true,
      syntheticModelCalls: modelCalls, actualProviderCalls: 0, actualExternalRequests: 0,
      inlineMediaReads, blockedExternalRequests: blockedExternalRequests.map(request => ({
        url: request.url, method: request.method, hasBody: request.hasBody, headerNames: Object.keys(request.headers),
      })) }));
  } finally {
    if (mastra) await mastra.observability.shutdown();
    await storage.close();
    const cleanup = new Client({ connectionString: pgUrl });
    await cleanup.connect();
    try {
      assert.match(schemaName, /^cf_native_obs_\d+_[a-f0-9]{10}$/);
      // Test-only lifecycle DDL, confined to the uniquely owned native schema.
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally { await cleanup.end(); globalThis.fetch = originalFetch; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
