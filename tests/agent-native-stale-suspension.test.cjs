'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
let report;
beforeAll(() => {
  let output;
  try { output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-stale-suspension.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30_000,
  }); } catch (error) { throw new Error(String(error.stderr || error.message)); }
  report = JSON.parse(output.trim().split('\n').at(-1));
}, 35_000);

test.each([false, true])('a completed native question accepts the next message with delayed delivery=%s', delayed => {
  const value = delayed ? report.delayed : report.normal;
  expect(value).toEqual({ delayed, staleBeforeSend: delayed, finalOutcome: 'completed', newMessageSaved: true,
    originalHistoryUnchanged: true, modelTransportCalls: 3, admissions: 2, actualNativeResume: true });
  expect(report.externalRequests).toBe(0);
});

test.each(['pending', 'active', 'partial', 'queued', 'unknown', 'same-owner', 'approval', 'new-mirror', 'pointer-change', 'foreign-thread', 'read-error'])(
  'native reconciliation preserves the %s owner or gate', kind => expect(report.protectedCases).toContain(kind)
);
