'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native HTTP Stop awaits its exact terminal Memory commit and refuses failed settlement', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-stop-settlement.probe.cjs')], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 30000,
  });
  expect(output).toContain('"respondedBeforeCommit": false');
  expect(output).toContain('"stopRejected": true');
}, 35000);
