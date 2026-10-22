'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('actual native Session HTTP answers survive SIGKILL with PostgreSQL/Redis and the old app lease still held', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-session-cold.probe.cjs')], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 75_000 });
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(report).toEqual([
    { kind: 'approval', oldLeasePresent: true, resumedWithoutWaiting: true, domainCalls: 1, settled: true },
    { kind: 'question', oldLeasePresent: true, resumedWithoutWaiting: true, domainCalls: 1, settled: true },
  ]);
}, 80_000);
