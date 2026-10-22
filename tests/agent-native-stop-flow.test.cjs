'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('actual useChat Stop callbacks preserve lagging native history and unlock only a verified settled Stop', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-stop-flow.probe.cjs')], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 30000,
  });
  const result = JSON.parse(output.slice(output.indexOf('{\n  "reports"')));
  expect(result.reports.map(report => report.mode)).toEqual([
    'lag', 'shorter', 'terminal', 'late-finish', 'mismatch', 'unknown', 'failed',
    'uncertain', 'unresolved', 'pending', 'no-ack', 'network', 'successor', 'late-stop-reply',
    'retired-owner', 'cold-native-owner', 'mismatched-native-pointer',
    'null-receipt', 'settlement-lag', 'settlement-lag-uncertain',
  ]);
  expect(result.reports.every(report => report.calls === report.finish)).toBe(true);
}, 35000);
