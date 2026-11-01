'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('native queued completion survives handled reads while terminal model and write failures stay failed', () => {
  const raw = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-read-recovery.probe.cjs')], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 65000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(JSON.parse(raw.split('\n').find(line => line.startsWith('RESULT=')).slice(7))).toEqual([
    { mode: 'recovered', outcome: 'completed', admissionCompleted: true, readCalls: 2, writeCalls: 0,
      attempts: ['primary', 'primary', 'primary', 'fallback-1'], preservedDrafts: 12, externalCalls: 0 },
    { mode: 'terminal', outcome: 'failed', admissionCompleted: false, readCalls: 2, writeCalls: 0,
      attempts: ['primary', 'primary', 'primary', 'fallback-1', 'fallback-2'], preservedDrafts: 12, externalCalls: 0 },
    { mode: 'write', outcome: 'failed', admissionCompleted: false, readCalls: 0, writeCalls: 1,
      attempts: ['primary', 'primary'], preservedDrafts: 12, externalCalls: 0 },
  ]);
}, 70000);
