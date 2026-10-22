'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native HTTP observers replay complete deltas without stealing model output or clearing shared history on detach', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-session-observe.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 40_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual({ providerCalls: 1, admissions: 1, fullOwner: true,
    fullConcurrentObserver: true, nativeMemoryComplete: true, replayAfterDetach: true, terminalUsesMemory: true,
    commitLagRetainsUncertainty: true, stopDuringReadRefused: true, splitSecretRedacted: true, expectedNotes: 40 });
}, 45_000);
