'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('actual OpenAI V2 HTTP SSE + PostgreSQL/Redis + native Session executes its allowed skill and returns resumed final text', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-provider-postgres.probe.cjs')], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30_000 });
  const report = output.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value?.providerV2);
  expect(report).toEqual({ providerV2: true, postgres: true, redis: true, actualService: true, executionScopeAligned: true,
    allowedSkillCompleted: true, assistantFinalText: true, noPending: true, requests: 2 });
}, 35_000);
