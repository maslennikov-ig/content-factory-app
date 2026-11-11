'use strict';
const {execFileSync} = require('node:child_process');
const path = require('node:path');

test('a parked native task after an earlier approval accepts the exact human answer', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-internal-approval.probe.cjs')], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 25_000,
  });
  const line = output.split('\n').find(value => value.startsWith('{"schema":"native-internal-approval/1"'));
  expect(JSON.parse(line)).toMatchObject({acceptedAfterEarlierApproval: true, summaryVisible: true,
    exactTaskSaved: true, askPreserved: true, foreignRejected: true, unknownRejected: true, externalRequests: 0, paidCalls: 0});
}, 30_000);
