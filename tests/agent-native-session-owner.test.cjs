'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('fresh HTTP and queued owners replace a finished Session subscription while approvals retain their current admission', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-session-owner.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 50_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual([
    { kind: 'http', priorFinished: true, admissions: 2, currentScopeRetained: true, domainCalls: 1 },
    { kind: 'queue', priorFinished: true, admissions: 2, currentScopeRetained: true, domainCalls: 1 },
  ]);
}, 55_000);
