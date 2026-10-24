'use strict';
const path = require('node:path');
const { runProbeProcess } = require('./helpers/native-probe-process.cjs');

const modes = [
  'lag', 'shorter', 'terminal', 'late-finish', 'mismatch', 'unknown', 'failed',
  'uncertain', 'unresolved', 'pending', 'no-ack', 'network', 'successor', 'late-stop-reply',
  'retired-owner', 'cold-native-owner', 'mismatched-native-pointer',
  'null-receipt', 'settlement-lag', 'settlement-lag-uncertain',
];
const batches = Array.from({ length: 4 }, (_, index) => modes.slice(index * 5, (index + 1) * 5));

test.each(batches.map((batch, index) => [index + 1, batch]))('actual useChat Stop callbacks preserve lagging history and verified settlement, batch %i', (_index, batch) => {
  const output = runProbeProcess(path.join(__dirname, 'helpers/agent-native-stop-flow.probe.cjs'), [], {
    timeout: 30000, env: { STOP_PROBE_MODES: JSON.stringify(batch) },
  });
  const result = JSON.parse(output.slice(output.indexOf('{\n  "reports"')));
  expect(result.reports.map(report => report.mode)).toEqual(batch);
  expect(result.reports.every(report => report.calls === report.finish)).toBe(true);
}, 35000);
