'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

describe('native Mastra 1.78 DurableAgent execution, signals, reconnect, and crash recovery (on0i.3, A11-A14, A30)', () => {
  let report;

  beforeAll(() => {
    const raw = execFileSync(
      process.execPath,
      [path.join(__dirname, 'helpers', 'agent-durable-recovery.probe.cjs')],
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        timeout: 60_000,
      }
    );
    const lines = raw.trim().split('\n');
    report = JSON.parse(lines[lines.length - 1]);
  });

  test('A11: observer disconnect detaches the SSE response while the durable run completes in the background and reconnecting observers receive the stream', () => {
    expect(report.a11).toEqual({
      midState: 'running',
      finalOutcome: 'completed',
      toolExecutions: 1,
      observedText: 'Фоновая задача завершена.',
      messageCount: 2,
    });
  });

  test('A13: explicit Stop cancels the active durable turn, settles as interrupted, and rejects late callbacks without writing', () => {
    expect(report.a13).toEqual({
      stopped: true,
      finalOutcome: 'interrupted',
      committedWrites: 0,
      lateCallRejected: true,
    });
  });

  test('A12 & A30: real child-process crash mid-run recovers on PostgreSQL and completes remaining steps with zero duplicate domain writes', () => {
    expect(report.a12AndA14.exitCode).toBe(99);
    expect(report.a12AndA14.rowsAfterCrash).toBe(1);
    expect(report.a12AndA14.rowsAfterRecovery).toEqual([
      { step_name: 'piece.create', payload: 'Восстановленный материал' },
      { step_name: 'piece.update', payload: 'p-crash-1' },
    ]);
    expect(report.a12AndA14.settledExecution).toEqual({
      requestId: 'req-crash-1',
      state: 'settled',
      outcome: 'completed',
    });
  });

  test('A14: PostgreSQL ExecutionFence prevents concurrent duplicate drivers and rejects stale-generation writes after takeover', () => {
    expect(report.a12AndA14.fencing).toEqual({
      claimAAcquired: true,
      claimBNonForcedAcquired: false,
      claimBForcedAcquired: true,
      staleDriverWriteRejected: true,
    });
  });
});
