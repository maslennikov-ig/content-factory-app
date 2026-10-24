'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native completion detaches SDK abort listeners while pending and resumed questions keep their contract', () => {
  const output = execFileSync(process.execPath, ['--expose-gc', path.join(__dirname, 'helpers/agent-native-abort-cleanup.probe.cjs')], { encoding: 'utf8', timeout: 30_000 });
  const result = JSON.parse(output.trim().split('\n').at(-1));
  expect(result).toEqual({ passed: true, completedListenerReleased: true, registryListenerReleased: true, releaseIsNotStop: true,
    liveSubscriptionsReleasedOutputs: true, subscriptionFinishesReleased: true, nativeSessionFinishesReleased: true,
    pendingGatePreserved: true, resumeListenerReleased: true, applied: 1 });
});
