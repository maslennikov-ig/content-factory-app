'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('queued native tasks reuse their original admission for HTTP approval and questions, and Stop verifies their exact saved response', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-session-queued.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 75_000,
  });
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(report).toEqual([
    { kind: 'approval', nativeAdmissions: 1, httpAdmissions: 0, domainCalls: 1, repeatedAnswerRefused: true },
    { kind: 'question', nativeAdmissions: 1, httpAdmissions: 0, domainCalls: 1, repeatedAnswerRefused: true },
    { kind: 'stop', nativeAdmissions: 1, httpAdmissions: 0, domainCalls: 0, repeatedAnswerRefused: true },
    { kind: 'proof', sameRunInitRetained: true, initWaitedForHeldProof: true,
      newOwnerCleared: true, newRunCleared: true, lateWrongRequestRefused: true,
      wrongRunRefused: true, sameRequestOldRunRefused: true, stoppedRefused: true,
      settledRefused: true, failedProofRefused: true, unprovenStopRefused503: true,
      actualPostgres: true, providerCalls: 0 },
  ]);
}, 80_000);
