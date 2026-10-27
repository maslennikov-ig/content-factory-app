"use strict";
require('reflect-metadata');
const assert = require('node:assert/strict');
const { MessageList } = require('@mastra/core/agent');
const { ProcessorRunner } = require('@mastra/core/processors');
const { ConsoleLogger } = require('@mastra/core/logger');
const { loadCapabilityModule, IDENTITY } = require('./agent-capabilities.cjs');
const { buildConductorAgent } = loadCapabilityModule('../conductor/conductor.agent.ts');
const { buildConductorContext } = loadCapabilityModule('../conductor/conductor.context.ts');

async function main() {
  let snapshotReads = 0;
  const agent = buildConductorAgent({ services: () => ({}), capabilities: [],
    gate: { check: async () => ({ allowed: true, policies: [] }) },
    model: async () => { throw new Error('No model calls allowed'); },
    snapshot: async () => { snapshotReads++; return { marker: 'current workspace' }; },
    now: () => new Date('2026-10-27T00:00:00Z'),
  });
  const processor = await agent.resolveProcessorById('bundled-product-instructions');
  assert.ok(processor);
  const runner = new ProcessorRunner({ inputProcessors: [processor], outputProcessors: [],
    logger: new ConsoleLogger({ level: 'error' }), agentName: 'instructions-proof' });
  const report = [];
  for (const restored of [false, true]) {
    const original = new MessageList().addSystem('Old deployment: speak as a plural team.')
      .addSystem('Native processor-owned guidance', 'fixture-guidance')
      .add({ id: 'historical-user', role: 'user', createdAt: new Date('2026-01-01T00:00:00Z'),
        content: { format: 2, parts: [{ type: 'text', text: 'Keep my original request' }] } }, 'memory');
    const list = restored ? new MessageList().deserialize(JSON.parse(JSON.stringify(original.serialize()))) : original;
    const history = JSON.stringify(list.get.all.db());
    const context = buildConductorContext({ identity: { ...IDENTITY, interfaceLanguage: 'de' }, threadId: 'instructions-thread' });
    await runner.runProcessInputStep({ messageList: list, requestContext: context, stepNumber: 1, steps: [] });
    const current = JSON.stringify(list.getSystemMessages());
    assert.ok(current.includes('Do not describe your own work with product/team plural or in the third person'), 'Current first-person instructions must replace the frozen prompt');
    assert.ok(current.includes('Use Deutsch by default'), 'The trusted full reply locale must reach a resumed step');
    assert.ok(current.includes('current workspace'));
    assert.ok(!current.includes('Old deployment:'));
    assert.deepEqual(list.getSystemMessages('fixture-guidance'), [{ role: 'system', content: 'Native processor-owned guidance' }]);
    assert.equal(JSON.stringify(list.get.all.db()), history, 'Native memory history is not rewritten');
    await runner.runProcessInputStep({ messageList: list, requestContext: context, stepNumber: 2, steps: [] });
    assert.equal(JSON.stringify(list.getSystemMessages()), current, 'Each step refreshes without duplicating instructions');
    assert.equal(JSON.stringify(list.get.all.db()), history);
    report.push({ restored, currentInstructions: true, taggedGuidancePreserved: true, historyPreserved: true });
  }
  assert.equal(snapshotReads, 2, 'Workspace reads remain once per request');
  console.log(JSON.stringify({ cases: report, snapshotReads, modelCalls: 0 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
