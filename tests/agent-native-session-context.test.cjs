'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');
test('native remote/cold approval retains scoped context, explicit decisions, deny and replay safety', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-session-context.probe.cjs')], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 120000 });
  const report = JSON.parse(out.trim().split('\n').at(-1));
  expect(report.externalRequests).toBe(0);
  expect(report.reports.map(x => [x.policy, x.decision, x.persistedEffect, x.replayDuplicatedEffect])).toEqual([
    ['ask','approve',true,false], ['ask','decline',false,false], ['deny',null,false,false], ['allow','approve',true,false],
    ['allow','approve',false,false], ['allow',null,false,false],
  ]);
  expect(report.reports.filter(x => x.access !== 'revoked' && x.policy !== 'deny').every(x => x.explicitGate)).toBe(true);
  expect(report.reports.find(x => x.policy === 'deny').explicitGate).toBe(false);
  expect(report.reports.find(x => x.access === 'revoked').modelCalls).toBe(0);
}, 125000);
