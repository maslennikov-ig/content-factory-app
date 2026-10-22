'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native PG/Redis observers isolate text state, detach locally, and preserve public generation fencing and tool chunks', () => {
  const output = execFileSync(process.execPath, [
    path.join(__dirname, 'helpers', 'mastra-native-stream-fanout.probe.cjs'),
    'production-view',
  ], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 45_000 });
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(report).toEqual(expect.objectContaining({
    passed: true, providerCalls: 1, providerAborts: 0, produced: 80,
    cachePreservedAfterDetach: true, persistedLength: 479,
    fencing: { publicStorageClaims: true, staleGenerationDropped: true, modes: 4, toolPairsPreserved: 4, terminalProofRequired: true, terminalReadFailuresPropagated: true },
  }));
  for (const index of [0, 2]) {
    expect(report.observerLengths[index].length).toBe(480);
    expect(report.observerLengths[index].ids).toEqual(['provider-text-stable']);
    expect(report.observerLengths[index].starts).toEqual(['provider-text-stable']);
  }
}, 50_000);
