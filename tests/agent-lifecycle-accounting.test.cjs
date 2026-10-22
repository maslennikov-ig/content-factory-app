'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native queued accounting uses the actual lifecycle outcome and requires a durable terminal acknowledgement', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-lifecycle-accounting.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 75_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual([
    { kind: 'fatal', modelCalls: 2, domainCalls: 1, admissionCompleted: false, state: 'settled', outcome: 'failed', nativeStatus: 'success' },
    { kind: 'revision', modelCalls: 3, domainCalls: 2, admissionCompleted: true, state: 'settled', outcome: 'completed', nativeStatus: 'success' },
    { kind: 'settlement-failure', modelCalls: 2, domainCalls: 1, admissionCompleted: false, state: 'running', outcome: null, nativeStatus: 'failed' },
  ]);
}, 80_000);
