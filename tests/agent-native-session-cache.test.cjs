'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native idle cache is bounded without evicting live work or losing saved policy and history', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-session-cache.probe.cjs')], { encoding: 'utf8', timeout: 90_000 });
  const result = JSON.parse(output.trim().split('\n').at(-1));
  expect(result).toEqual({ passed: true, maxIdleSessions: 8, idleTimeoutMs: 30000, coldHistory: true, coldReadDeny: true,
    nextRequest: true, pendingPreserved: true, activePreserved: true, bindingAndTaskScopeProtected: true });
}, 95_000);
