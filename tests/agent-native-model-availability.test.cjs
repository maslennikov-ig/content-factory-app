'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

describe('native Mastra availability waiting and continuation (R3, A30/A31)', () => {
  jest.setTimeout(75_000);
  let report;

  beforeAll(() => {
    const raw = execFileSync(
      process.execPath,
      [path.join(__dirname, 'helpers', 'native-model-availability.probe.cjs')],
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        timeout: 70_000,
      }
    );
    report = JSON.parse(raw.trim().split('\n').at(-1));
  });

  test('native wait and signal preemption restart the configured chain when only the primary returns', () => {
    expect(report.memory.writes).toBe(1);
    expect(report.memory.waits).toBe(1);
    expect(report.memory.text).toBe('Recovered using the primary model.');
    expect(report.memory.attempts.map((attempt) => attempt.modelId)).toEqual([
      'primary',
      'primary',
      'fallback-1',
      'fallback-2',
      'primary',
    ]);
    expect(
      report.memory.attempts.slice(1).every((attempt) => attempt.hasToolResult)
    ).toBe(true);
  });

  test('several unavailable cycles retain completed work without consuming the task step budget', () => {
    expect(report.repeated.writes).toBe(1);
    expect(report.repeated.waits).toBe(4);
    expect(report.repeated.text).toBe('Recovered using the primary model.');
    expect(report.repeated.attempts).toHaveLength(14);
    expect(report.repeated.signals).toHaveLength(4);
  });

  test('PostgreSQL retains the wait before SIGKILL and a fresh process honors its deadline', () => {
    const crash = report.postgres.crash;
    expect(crash.signal).toBe('SIGKILL');
    expect(crash.waitWasDurable).toBe(true);
    expect(crash.writes).toBe(1);
    expect(crash.text).toBe('Recovered using the primary model.');
    expect(crash.attempts.map((attempt) => attempt.model)).toEqual([
      'primary',
      'primary',
      'fallback-1',
      'fallback-2',
      'primary',
    ]);
    expect(crash.attempts.at(-1).at_ms).toBeGreaterThanOrEqual(
      Date.parse(crash.deadline) - 30
    );
  });

  test('Stop persists native cancellation and refuses a cold attempt', () => {
    expect(report.postgres.stop).toEqual({
      beforeAttempts: 4,
      afterAttempts: 4,
      status: 'canceled',
      coldAttemptRejected: true,
    });
  });

  test('partial output uses a native queued continuation on the same thread and preserves completed tools', () => {
    expect(report.postgres.partial).toEqual(
      expect.objectContaining({
        writes: 1,
        oldRunAborted: true,
        finalText: 'Recovered using the primary model.',
        internalRunChanged: true,
        clientErrorChunks: 0,
      })
    );
    expect(
      report.postgres.partial.attempts.map((attempt) => attempt.model)
    ).toEqual(['primary', 'primary', 'fallback-1', 'fallback-2', 'primary']);
    expect(
      report.postgres.partial.attempts
        .slice(1)
        .every((attempt) => attempt.has_tool_result)
    ).toBe(true);
  });

  test('Stop clears a queued native continuation before another model request', () => {
    expect(report.postgres.stopQueued).toEqual({
      attempts: 4,
      continuationCanceled: true,
    });
  });
});
