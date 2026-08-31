'use strict';

/**
 * `parse-isolation.ts` is the boundary `docx-file.ts` and `pdf-file.ts` run
 * `mammoth`/`unpdf` behind — `content-factory-next-uoy`'s DESIGN requires
 * that a hostile file's crash or hang "не должно уносить рабочий процесс."
 * This file proves the two ways that promise could fail to hold, against
 * real forked processes, not by reasoning about what `SIGKILL` and
 * `--max-old-space-size` are documented to do:
 *
 * - `spin.worker.entry.js` never yields to the event loop at all, so the
 *   only way `runWorkerScript` can end it is `SIGKILL` — a graceful signal
 *   would never be seen.
 * - `oom.worker.entry.js` never sends a result and never stops allocating,
 *   so the only way it ends is the memory ceiling this module passes to
 *   `execArgv`.
 */

const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const isolation = loadTypeScriptModule(`${base}/parse-isolation.ts`);
const helpersDir = path.join(__dirname, 'helpers');

describe('runWorkerScript: a synchronous infinite loop', () => {
  test('is ended by SIGKILL within the timeout budget, not left running', async () => {
    const timeoutMs = 500;
    const startedAt = Date.now();
    const outcome = await isolation.runWorkerScript(
      helpersDir,
      'spin.worker.entry',
      [],
      { timeoutMs, memoryLimitMb: 64 }
    );
    const elapsedMs = Date.now() - startedAt;

    expect(outcome).toEqual({ ok: false, reason: 'PARSE_TIMEOUT' });
    // Close to the budget, not to whatever an unbounded hang would take —
    // the margin covers process-spawn and signal-delivery overhead, not a
    // second, unrelated wait.
    expect(elapsedMs).toBeGreaterThanOrEqual(timeoutMs);
    expect(elapsedMs).toBeLessThan(timeoutMs + 2_000);
  });
});

describe('runWorkerScript: a process that keeps allocating', () => {
  test(
    'is ended by its own memory ceiling and reported as PARSE_CRASHED',
    async () => {
      const outcome = await isolation.runWorkerScript(
        helpersDir,
        'oom.worker.entry',
        [],
        // A ceiling small enough that unbounded 1 MiB JS strings exhaust the
        // old-generation heap in a few seconds, and a timeout generous
        // enough that the memory crash — not the clock — is what ends the
        // process here.
        { timeoutMs: 15_000, memoryLimitMb: 48 }
      );

      expect(outcome.ok).toBe(false);
      expect(outcome.reason).toBe('PARSE_CRASHED');
    },
    20_000
  );
});

describe('runWorkerScript: a worker script that does not exist', () => {
  test('resolves PARSE_CRASHED instead of throwing', async () => {
    const outcome = await isolation.runWorkerScript(
      helpersDir,
      'no-such-worker',
      [],
      { timeoutMs: 1_000, memoryLimitMb: 64 }
    );
    expect(outcome).toEqual({
      ok: false,
      reason: 'PARSE_CRASHED',
      detail: expect.stringContaining('no-such-worker'),
    });
  });
});
