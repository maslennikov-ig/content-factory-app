'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native explicit Stop drains the original producer beyond Session abort grace and verifies saved response after swallowed persistence failures', () => {
 const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-stop-tail.probe.cjs')], {
  cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 60_000,
 });
 expect(output).toContain('"mode": "delayed-tail"');
 expect(output).toContain('"mode": "failed-tail"');
 expect(output).toContain('"mode": "early-response-failed"');
 expect(output).toContain('"mode": "accepted-run-pointer-failed"');
 expect(output).toContain('"kind": "pre-start"');
 expect(output).toContain('"kind": "approval"');
 expect(output).toContain('"kind": "question"');
 expect(output).toContain('"kind": "internal-close"');
}, 65_000);
