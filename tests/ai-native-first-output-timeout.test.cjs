'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
let report;
beforeAll(() => {
  const output = execFileSync(process.execPath, ['tests/helpers/native-first-output-timeout.probe.cjs',
    'recover-default', 'recover-flex', 'recover-flex-only', 'exhausted', 'stop-active', 'stop-backoff',
    'partial-text', 'tool-intent', 'reported-usage', 'partial-frame', 'reset'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 25_000, maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  report = JSON.parse(output.split('\n').find(line => line.startsWith('RESULT=')).slice(7));
}, 30_000);

test.each(['recover-default', 'recover-flex', 'recover-flex-only'])('%s retries only the current native step after a silent first-output deadline', name => {
  const row = report.scenarios[name];
  expect(report.unexpectedNetwork).toBe(0);
  expect(row.text).toBe('recovered');
  expect(row.toolCalls).toBe(1);
  expect(row.emittedErrors).toEqual([]);
  expect(row.calls).toHaveLength(3);
  expect(new Set(row.calls.map(call => call.model)).size).toBe(1);
  expect(row.calls.map(call => call.tier)).toEqual(Array(3).fill(name === 'recover-default' ? 'default' : 'flex'));
  expect(row.calls[2].messages).toEqual(row.calls[1].messages);
  expect(row.waitMs).toBeGreaterThanOrEqual(450);
  expect(row.ledger.filter(call => call.failed)).toEqual([expect.objectContaining({ possiblyBilled: true })]);
  expect(row.ledger.find(call => call.failed).costUsd).toBeUndefined();
  expect(row.columns.possiblyBilled).toBe(true);
});

test('first-output retries stop at the existing finite budget', () => {
  const row = report.scenarios.exhausted;
  expect(row.calls).toHaveLength(3);
  expect(row.toolCalls).toBe(1);
  expect(row.text).toBe('');
  expect(row.emittedErrors).toHaveLength(1);
  expect(row.ledger.filter(call => call.failed)).toHaveLength(2);
  expect(row.ledger.filter(call => call.failed).every(call => call.possiblyBilled)).toBe(true);
});

test.each(['stop-active', 'stop-backoff'])('%s prevents any further native attempt', name => {
  const row = report.scenarios[name];
  expect(row.stopped).toBe(true);
  expect(row.calls).toHaveLength(2);
  expect(row.toolCalls).toBe(1);
  expect(row.text).toBe('');
});

test.each(['partial-text', 'tool-intent', 'reported-usage', 'partial-frame', 'reset'])('%s remains non-replayable', name => {
  const row = report.scenarios[name];
  expect(row.calls).toHaveLength(2);
  expect(row.toolCalls).toBe(1);
  expect(row.text).not.toBe('recovered');
  expect(row.columns.possiblyBilled).toBe(true);
  if (name === 'reported-usage') expect(row.ledger.find(call => call.failed)).toMatchObject({ promptTokens: 41, costUsd: 0.12 });
});
