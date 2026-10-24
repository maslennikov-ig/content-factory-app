'use strict';
const { runProbeProcess } = require('./helpers/native-probe-process.cjs');
const path = require('node:path');

test('fresh HTTP and queued owners replace a finished Session subscription while approvals retain their current admission', () => {
  const output = runProbeProcess(path.join(__dirname, 'helpers', 'agent-native-session-owner.probe.cjs'), [], {
    timeout: 50_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual([
    { kind: 'http', priorFinished: true, admissions: 2, currentScopeRetained: true, domainCalls: 1 },
    { kind: 'queue', priorFinished: true, admissions: 2, currentScopeRetained: true, domainCalls: 1 },
  ]);
}, 55_000);

test('a queued approval visible before native event delivery retains its existing admission', () => {
  const output = runProbeProcess(path.join(__dirname, 'helpers', 'agent-native-session-owner.probe.cjs'), ['--delay-approval-delivery'], {
    timeout: 50_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual([
    { kind: 'queue', priorFinished: true, admissions: 2, currentScopeRetained: true, domainCalls: 1 },
  ]);
}, 55_000);
