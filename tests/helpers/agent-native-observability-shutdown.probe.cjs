'use strict';

require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool, Client } = require('pg');
const { PostgresStore } = require('@mastra/pg');
const { Mastra } = require('@mastra/core/mastra');
const { SpanType } = require('@mastra/core/observability');
const { createStep, createWorkflow } = require('@mastra/core/workflows/evented');
const { z } = require('zod');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');

async function main() {
  const schemaName = `cf_native_obs_shutdown_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  const pgUrl = process.env.CF_TEST_PG_URL || 'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db';
  const endpoint = new URL(pgUrl);
  const overridesTarget = [...endpoint.searchParams.keys()].some((key) =>
    ['host', 'hostaddr', 'service', 'servicefile', 'port', 'dbname', 'database'].includes(key.toLowerCase()));
  assert.ok(['postgres:', 'postgresql:'].includes(endpoint.protocol) &&
    ['127.0.0.1', 'localhost'].includes(endpoint.hostname) && Number(endpoint.port) > 0 && !overridesTarget,
    'Use only an explicit local test PostgreSQL endpoint.');
  assert.ok(endpoint.pathname === '/cf-dev-db' ||
    /^\/cf_on0i_qa_[a-z0-9_]+_mastra$/.test(endpoint.pathname) ||
    /^\/cf_[a-z0-9_]+_test$/.test(endpoint.pathname), 'Use only a known local test database.');
  let poolEnds = 0;
  class OwnedPool extends Pool {
    constructor(options) {
      super(options);
      assert.equal(options.max, 20);
      assert.equal(options.idleTimeoutMillis, 30_000);
    }
    end() { poolEnds++; return super.end(); }
  }
  const previousUrl = process.env.MASTRA_DATABASE_URL;
  process.env.MASTRA_DATABASE_URL = pgUrl;
  const storeModule = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/mastra.store.ts', {
    pg: { Pool: OwnedPool },
    '@mastra/pg': { PostgresStore: class extends PostgresStore {
      constructor(options) { super({ ...options, schemaName, disableInit: false }); }
    } },
  });
  if (previousUrl === undefined) delete process.env.MASTRA_DATABASE_URL;
  else process.env.MASTRA_DATABASE_URL = previousUrl;
  const { pStore: storage, closeMastraStore } = storeModule;
  let mastra;
  let reader;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let shutdownStarted = false;
  let endedDuringDrain = false;
  let drainSpan;
  const originalFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = async () => { externalRequests++; throw new Error('No network in shutdown fixture.'); };
  try {
    await storage.init();
    const { createNativeObservability } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/native-observability.ts');
    const scope = { threadId: 'shutdown-thread', resourceId: 'shutdown-org:shutdown-user' };
    const empty = z.object({});
    const workflow = createWorkflow({ id: 'native-observability-shutdown-drain', inputSchema: empty, outputSchema: empty })
      .then(createStep({ id: 'wait-during-drain', inputSchema: empty, outputSchema: empty, execute: async () => {
        drainSpan = mastra.observability.getDefaultInstance().startSpan({
          name: 'span ending during native drain', type: SpanType.AGENT_RUN, attributes: {}, metadata: scope,
        });
        entered();
        await gate;
        endedDuringDrain = shutdownStarted;
        drainSpan.end();
        return {};
      } })).commit();
    mastra = new Mastra({ logger: false, storage, workflows: { drain: workflow }, observability: createNativeObservability() });
    await mastra.startWorkers();
    const { MastraService } = loadCapabilityModule('../mastra.service.ts', {
      mocks: {
        '@contentfactory/nestjs-libraries/chat/mastra.store': storeModule,
        '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
        '@contentfactory/nestjs-libraries/openai/ai.clients': {},
      },
    });
    const service = new MastraService({}, {});
    service.instance = mastra;
    const buffered = mastra.observability.getDefaultInstance().startSpan({
      name: 'completed buffered shutdown span', type: SpanType.AGENT_RUN, attributes: {}, metadata: scope,
    });
    buffered.end();
    const run = await workflow.createRun();
    const result = run.start({ inputData: {} });
    let entryTimer;
    try {
      await Promise.race([started, result.then(() => { throw new Error('Workflow ended before the drain fixture entered.'); }),
        new Promise((_, reject) => { entryTimer = setTimeout(() => reject(new Error('Native workflow did not enter the drain fixture.')), 5_000); })]);
    } finally { clearTimeout(entryTimer); }
    shutdownStarted = true;
    const shutdown = service.onApplicationShutdown();
    const unblock = setTimeout(release, 25);
    try { await Promise.all([result, shutdown, service.onApplicationShutdown()]); }
    finally { clearTimeout(unblock); release(); }
    mastra = undefined;
    assert.equal(endedDuringDrain, true);
    assert.equal(poolEnds, 1, 'Application shutdown must end its owned pool exactly once.');
    await closeMastraStore();
    assert.equal(poolEnds, 1);
    reader = new PostgresStore({ id: schemaName + '-reader', connectionString: pgUrl, schemaName, disableInit: true });
    const observability = await reader.getStore('observability');
    for (const span of [buffered, drainSpan]) {
      const trace = await observability.getTrace({ traceId: span.traceId });
      assert.ok(trace?.spans.some(row => row.spanId === span.id && row.endedAt), 'Native shutdown lost a buffered terminal span.');
    }
    assert.equal(externalRequests, 0);
    console.log(JSON.stringify({ actualServiceAndStore: true, actualNativeEventedDrain: true,
      manualFlush: false, bufferedSpanPersisted: true, spanEndedDuringDrainPersisted: true,
      repeatedShutdownIdempotent: true, ownedPoolEnds: poolEnds, actualExternalRequests: externalRequests, actualProviderCalls: 0 }));
  } finally {
    release();
    if (mastra) await mastra.shutdown();
    await closeMastraStore();
    if (reader) await reader.close();
    const cleanup = new Client({ connectionString: pgUrl });
    await cleanup.connect();
    try {
      assert.match(schemaName, /^cf_native_obs_shutdown_\d+_[a-f0-9]{8}$/);
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally { await cleanup.end(); globalThis.fetch = originalFetch; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
