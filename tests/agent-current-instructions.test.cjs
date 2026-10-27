"use strict";
const path = require('node:path');
const { runProbeProcess } = require('./helpers/native-probe-process.cjs');

test('native per-step instruction refresh preserves restored history and processor-owned guidance', () => {
  const report = JSON.parse(runProbeProcess(path.join(__dirname, 'helpers/agent-current-instructions.probe.cjs')));
  expect(report).toEqual({ cases: [false, true].map(restored => ({ restored,
    currentInstructions: true, taggedGuidancePreserved: true, historyPreserved: true })),
    snapshotReads: 2, modelCalls: 0 });
}, 90_000);
