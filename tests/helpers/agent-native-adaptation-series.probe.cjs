'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { PostgresStore } = require('@mastra/pg');
const { Mastra } = require('@mastra/core/mastra');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const native = loadCapabilityModule('../conductor/native-adaptation-series.ts');
const connectionString = process.env.CF_TEST_PG_URL || 'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db';
const endpoint = new URL(connectionString);
assert.ok(['postgres:', 'postgresql:'].includes(endpoint.protocol) &&
  ['127.0.0.1', 'localhost'].includes(endpoint.hostname) && Number(endpoint.port) > 0 &&
  endpoint.pathname === '/cf-dev-db' && !endpoint.hash && [...endpoint.searchParams].length === 0,
  'Series probes require an explicit loopback cf-dev-db without URL overrides.');
const plan = (options = {}) => ({ pieceId: 'piece-a', request: { integrationId: 'channel-a' },
  channel: { id: 'channel-a', name: 'Channel', providerIdentifier: 'telegram', editor: 'html' },
  kind: 'post', language: 'ru', sourceRevision: { body: 'Original core', brief: { fixture: true } }, ...options });
const input = (options = {}) => ({ organizationId: 'org-a', userId: 'person-a', plan: plan(options), presentation: 'auto' });
const owner = { organizationId: 'org-a', userId: 'person-a', pieceId: 'piece-a' };

async function runtime(schemaName, childMode = false) {
  assert.match(schemaName, /^cf_native_series_[a-f0-9]{32}$/);
  const storage = new PostgresStore({ id: `${schemaName}-${process.pid}`, connectionString, schemaName });
  await storage.init();
  let failOnce = false, loseAckOnce = false, hold = null;
  const service = {
    generateSeriesAdaptation: async (org, planValue, userId, presentation) => {
      await storage.db.none(`INSERT INTO "${schemaName}".events(kind) VALUES ('generate')`);
      if (childMode && planValue.fixtureMode === 'pre-generate') {
        process.send({ type: 'generation-entered' });
        await new Promise(() => {});
      }
      if (planValue.fixtureMode === 'failure') throw Error('Synthetic provider failure');
      if (planValue.fixtureMode === 'questions') return { kind: 'questions', plan: planValue, questions: [{ key: 'topic', question: 'What topic?' }] };
      return { kind: 'generated', plan: planValue, output: { hook: 'Opening', content: Array.from({ length: planValue.fixtureCount || 3 }, (_, i) => ({ content: `Part ${i + 1}` })) }, answers: [] };
    },
    persistSeriesAdaptation: async (org, userId, seriesId, generated) => {
      await storage.db.none(`INSERT INTO "${schemaName}".events(kind) VALUES ('persist')`);
      if (childMode && generated.plan.fixtureMode === 'cold') {
        process.send({ type: 'persist-entered', runId: seriesId });
        await new Promise(() => {});
      }
      if (failOnce) { failOnce = false; throw Object.assign(new Error('Synthetic storage unavailable'), { code: 'FIXTURE_SAVE_FAILED' }); }
      if (hold) { const waiting = hold; hold = null; waiting.enter(); await waiting.wait; }
      const result = { kind: 'adaptation', seriesId, created: true,
        parts: generated.output.content.map((item, index) => ({ adaptationId: `${seriesId}-adapt-${index}`, postId: `${seriesId}-post-${index}`, createdAt: '2026-10-27T00:00:00.000Z', title: null })) };
      await storage.db.none(`INSERT INTO "${schemaName}".receipts(id, value) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING`, [seriesId, JSON.stringify(result)]);
      if (loseAckOnce) { loseAckOnce = false; throw Error('Synthetic lost acknowledgement'); }
      const row = await storage.db.one(`SELECT value FROM "${schemaName}".receipts WHERE id=$1`, [seriesId]);
      return row.value;
    },
  };
  const workflow = native.createNativeAdaptationSeriesWorkflow(() => service);
  const mastra = new Mastra({ logger: false, storage, workflows: { nativeAdaptationSeries: workflow } });
  return { storage, service, workflow, mastra, native, failNext: () => { failOnce = true; },
    holdNextPersist: () => { let enter, release; const entered = new Promise(r => { enter = r; }); const wait = new Promise(r => { release = r; }); hold = { enter, wait }; return { entered, release }; },
    loseNextAck: () => { loseAckOnce = true; }, count: async kind => Number((await storage.db.one(`SELECT count(*) AS n FROM "${schemaName}".events WHERE kind=$1`, [kind])).n),
    receipts: async () => Number((await storage.db.one(`SELECT count(*) AS n FROM "${schemaName}".receipts`)).n),
  };
}
async function main() {
  const schemaName = process.env.CF_SERIES_SCHEMA;
  const fixture = await runtime(schemaName, true);
  const preGenerate = process.env.CF_SERIES_MODE === 'pre-generate';
  await fixture.native.startNativeAdaptationSeries(fixture.mastra, input({ fixtureMode: preGenerate ? 'pre-generate' : 'cold' }), process.env.CF_SERIES_TOOL || (preGenerate ? 'pre-generate-tool' : 'cold-tool'));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { runtime, plan, input, owner, native, connectionString };
