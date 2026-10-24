'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native tool projections bound repeated payloads while exact complete receipts remain readable and idempotent', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-output-projection.probe.cjs')], {
    encoding: 'utf8', timeout: 30_000,
  });
  const result = JSON.parse(output.trim().split('\n').at(-1));
  expect(result).toEqual(expect.objectContaining({ passed: true, sources: 50, facts: 50,
    completeRangeRetrieval: true, domainWrites: 1, digestAndThreadChecked: true, readOutageNotUncertain: true }));
  expect(result.projectionBytes).toBeLessThanOrEqual(32_768);
  expect(result.fullBytes).toBeGreaterThan(500_000);
});
