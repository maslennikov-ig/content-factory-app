'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('cold native rebind preserves an old updateWorkingMemory approval until explicit approval', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-memory-cold-policy.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 90_000,
  });
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(report).toEqual({
    oldGateRetainedOnRebind: true,
    passiveRebindModelCalls: 0,
    passiveRebindMemoryWrites: 0,
    explicitApprovalMemoryWrites: 1,
    explicitApprovalModelCalls: 1,
    futureMemoryCallsAutoAllowed: true,
    totalMemoryWrites: 2,
    settled: true,
  });
}, 95_000);
