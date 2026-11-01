'use strict';
const path = require('node:path');
const {runProbeProcess} = require('./helpers/native-probe-process.cjs');
test('offline native research retains a later source and original request across a terminal refusal and explicit restart', () => {
  const output = runProbeProcess(path.join(__dirname, 'helpers/agent-research-efficiency.probe.cjs'), [], {timeout: 160_000});
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(report).toMatchObject({native: true, sources: 50, laterSource: 43, questionAnswered: true, restart: true,
    getNoInference: true, originalPreserved: true, searches: 1, modelCalls: 10, cores: 1, telegramDrafts: 1, expiredEvidence: true, stopped: true, humanRowsStableOnGet: true, writesStableOnGet: true, failedPointer: {state: 'settled', outcome: 'failed'}, coldPointer: {state: 'settled', outcome: 'failed'}, stoppedPointer: {state: 'stopped'}});
}, 170_000);
