'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native Stop tracks deferred work, terminal failures, unknown outcomes and private legacy history', () => {
  const report = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-stop-reconciliation.probe.cjs')], {
    encoding: 'utf8', timeout: 45_000,
  }));
  expect(report).toEqual({
    completed: { state: 'settled', outcome: 'completed', writes: 1 },
    interrupted: { intermediate: 'running', missingReceipt: 'unknown', state: 'settled', outcome: 'interrupted', writes: 1 },
    failed: { intermediate: 'running', missingReceipt: 'unknown', state: 'settled', outcome: 'failed', writes: 0 },
    resumedQuestion: { intermediate: 'running', missingReceipt: 'unknown', state: 'settled', outcome: 'interrupted', writes: 1, serializedExecutionStayedOld: true },
    resumedApproval: { state: 'settled', outcome: 'completed', writes: 1, serializedExecutionStayedOld: true },
    recoveredInput: { state: 'settled', outcome: 'completed', writes: 1, revisedInputRefusals: 1 },
    lateCallback: { oldRejected: true, successorWrites: 1 },
    privateLegacyAndMetadata: true,
  });
}, 60_000);
