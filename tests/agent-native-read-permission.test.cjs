'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('actual native Session executes private reads and retains objective/default/domain/mutating-inbox approval gates', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-read-permission.probe.cjs')], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 90000,
  });
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(report).toMatchObject({ ownerRefusals: 2, domainWrites: 0, externalProviderCalls: 0 });
  expect(report.reports.map(item => [item.id, item.calls, item.gateArmed])).toEqual([
    ['reads', 4, false], ['objective-set', 1, true], ['objective-default', 1, true],
    ['objective-clear', 1, true], ['domain-write', 1, true], ['notification-list-marks-seen', 1, true],
  ]);
}, 95000);
