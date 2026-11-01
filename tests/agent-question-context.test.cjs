'use strict';
const path = require('node:path');
const { runProbeProcess } = require('./helpers/native-probe-process.cjs');
test('native human answers and decisions survive product-history filtering and cold restoration', () => {
  const result = JSON.parse(runProbeProcess(path.join(__dirname, 'helpers/agent-question-context.probe.cjs')));
  expect(result).toEqual({ cases: [false, true].map(restored => ({ restored,
    answerPreserved: true, questionPreserved: true, planPreserved: true, taskProgressPreserved: true,
    productHistoryCompacted: true, nativeHistoryUnchanged: true })), modelCalls: 0 });
}, 90_000);
