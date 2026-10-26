'use strict';
const {execFileSync} = require('node:child_process');
const path = require('node:path');
test('native manual question partial answers survive SIGKILL and one final batch applies once', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-domain-questions-native.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 70_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual({nativePartialSaved: true, sameToolCallNewCard: true,
    processRecreated: true, staleDuplicateRejected: true, warmMirrorRebuilt: true, created: 1, applied: 1, settled: true});
}, 75_000);
