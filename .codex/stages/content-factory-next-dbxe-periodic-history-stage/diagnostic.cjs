'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { runPeriodicWorkflow } = require('../../../tests/helpers/periodic-history.module.cjs');

async function main() {
  const cases = [];
  for (const [file, name, args] of [
    ['autopost.workflow.ts', 'autoPostWorkflow', [{ id: 'synthetic-auto', immediately: true }]],
    ['autopost-draft-v2.workflow.ts', 'autoPostDraftV2Workflow', [{ id: 'synthetic-draft', organizationId: 'synthetic-org', immediately: true }]],
    ['missing.post.workflow.ts', 'missingPostWorkflow', []],
    ['missing.post.workflow.v108.ts', 'missingPostWorkflowV108', []],
  ]) {
    const run = await runPeriodicWorkflow('apps/orchestrator/src/workflows/' + file, name, args);
    assert.equal(run.completion, 'fixture-stopped');
    assert.equal(run.calls.continuations.length, 0);
    assert.equal(run.calls.sleeps.length, 101);
    cases.push({ name, attempts: run.calls.activities.length, sleeps: 101, continuations: 0 });
  }
  const queue = Array.from({ length: 33 }, (_, n) => ({ to: 'synthetic@example.test', subject: 'synthetic-' + n, html: '<p/>', addTo: 'bottom' }));
  const mail = await runPeriodicWorkflow('apps/orchestrator/src/workflows/send.email.workflow.v2.ts',
    'sendEmailWorkflowV2', [{ queue }], { maxSleeps: 32, activity: async () => { throw new Error('Synthetic failed send'); } });
  assert.equal(mail.calls.activities.length, 33);
  assert.equal(mail.calls.logs.length, 33);
  assert.equal(mail.calls.continuations.length, 0);
  cases.push({ name: 'sendEmailWorkflowV2', attempts: 33, failures: 33, continuations: 0 });
  const proof = { schema: 'cf-periodic-history-original-diagnostic/v1', baseline: '31e7170fba4edb26214a8618dca62ebdb0aeff13', result: 'reproduced',
    boundary: 'actual legacy workflow bodies, virtual timers and inert activities; no server/provider', cases };
  fs.writeFileSync(__dirname + '/diagnostic.local.json', JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
