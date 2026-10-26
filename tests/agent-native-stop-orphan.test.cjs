'use strict';
const {execFileSync} = require('node:child_process');
const path = require('node:path');

test('cold Stop settles its orphaned native task durably without another model call', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-stop-orphan.probe.cjs')], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 45_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual({
    orphan: 'interrupted', redisExpired: 'interrupted', terminalAncestorsPreserved: 6, nonterminalAncestorsProtected: 5, uncanceledTargetProtected: true, completedPreserved: true,
    missingTailRejected: true, failedCommitRejected: true, liveOwnerProtected: true, successorPreserved: true, modelCalls: 0,
  });
}, 50_000);
