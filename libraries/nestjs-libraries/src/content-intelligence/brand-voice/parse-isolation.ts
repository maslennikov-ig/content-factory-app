import { fork, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAX_PARALLEL_PARSES } from './binary-file';

/**
 * The isolation boundary `content-factory-next-uoy`'s DESIGN calls for:
 * "разбор в изоляции, а не в процессе приложения... падение или зависание не
 * должно уносить рабочий процесс."
 *
 * A forked, disposable OS process, not a `worker_threads` thread — a thread
 * shares the host process's address space, and a native crash inside a
 * dependency (not something either `mammoth` or `pdf.js`'s core layer is
 * expected to do, but not something this module can prove they never will)
 * can still take the whole process with it. A separate process cannot: the
 * worst it does is exit, and `SIGKILL` ends it unconditionally, including
 * mid-way through a synchronous infinite loop a hostile file induced —
 * `tests/brand-voice.parse-isolation.test.cjs` proves that specific case
 * rather than assuming it.
 */

export type IsolationBudgets = {
  timeoutMs: number;
  memoryLimitMb: number;
};

/**
 * The gate on how many of those processes exist at once.
 *
 * It sits here rather than in `file-intake.ts` because this is the one
 * function that forks: a limit placed per extension would cap `.docx` and
 * `.pdf` separately and let a batch of both run eight processes while
 * believing it ran four. The number and the reasoning behind it live in
 * `binary-file.ts` beside the other two ceilings a parse is held to.
 *
 * A file's own budget starts when it gets a slot, because the timer below is
 * started after the wait rather than before it. Queueing is not a timeout.
 */
let running = 0;
const waiting: Array<() => void> = [];

const takeSlot = (): Promise<void> => {
  if (running < MAX_PARALLEL_PARSES) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      running += 1;
      resolve();
    });
  });
};

const freeSlot = () => {
  running -= 1;
  waiting.shift()?.();
};

export type IsolationOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'PARSE_TIMEOUT' | 'PARSE_CRASHED'; detail?: string };

/**
 * The failed half, told apart by a predicate rather than by `!outcome.ok`.
 *
 * The backend compiles with `strictNullChecks` off, under which a boolean
 * discriminant does not narrow a union — so the plain check reads as narrowing
 * and leaves `reason` unreachable at the type level.
 */
export type IsolationFailure = Extract<
  IsolationOutcome<unknown>,
  { ok: false }
>;

export const parseFailed = <T>(
  outcome: IsolationOutcome<T>
): outcome is IsolationFailure => !outcome.ok;

/**
 * Runs `<workerDir>/<workerBasename>.js` (or, failing that, `.ts`) as a
 * forked child, sends it `args` on `process.argv`, and settles on its first
 * `message` — or on a timeout, a spawn error, or an exit that arrived
 * without ever sending one.
 *
 * The `.js`-then-`.ts` fallback is not a style choice: `nest build` compiles
 * every file reachable from the app's own imports (this repository's
 * `tsconfig.build.json` has no `include` narrower than that, and the
 * `dist/` tree already mirrors `libraries/nestjs-libraries/src` file for
 * file), so in a built app — `nest start` included, since `nest-cli.json`
 * sets `webpack: false` and runs the same `tsc` output — the compiled
 * sibling is always there. Only the test harness's in-memory
 * `ts.transpileModule` loader never produces one, which is exactly the one
 * place the `.ts` fallback is reached; it runs under Node's own
 * `--experimental-strip-types`, which is why the worker entry files avoid
 * decorators, enums and namespaces — anything type-stripping alone cannot
 * erase.
 */
export async function runWorkerScript<T>(
  workerDir: string,
  workerBasename: string,
  args: string[],
  budgets: IsolationBudgets
): Promise<IsolationOutcome<T>> {
  await takeSlot();
  try {
    return await forkWorkerScript<T>(workerDir, workerBasename, args, budgets);
  } finally {
    freeSlot();
  }
}

function forkWorkerScript<T>(
  workerDir: string,
  workerBasename: string,
  args: string[],
  budgets: IsolationBudgets
): Promise<IsolationOutcome<T>> {
  return new Promise((resolve) => {
    const compiledPath = path.join(workerDir, `${workerBasename}.js`);
    const sourcePath = path.join(workerDir, `${workerBasename}.ts`);

    let modulePath: string;
    const execArgv: string[] = [
      `--max-old-space-size=${budgets.memoryLimitMb}`,
    ];

    if (fs.existsSync(compiledPath)) {
      modulePath = compiledPath;
    } else if (fs.existsSync(sourcePath)) {
      modulePath = sourcePath;
      execArgv.unshift(
        '--experimental-strip-types',
        '--disable-warning=ExperimentalWarning'
      );
    } else {
      resolve({
        ok: false,
        reason: 'PARSE_CRASHED',
        detail: `worker script not found: ${compiledPath}`,
      });
      return;
    }

    let child: ChildProcess;
    try {
      child = fork(modulePath, args, {
        execArgv,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        serialization: 'json',
      });
    } catch (error) {
      resolve({
        ok: false,
        reason: 'PARSE_CRASHED',
        detail: error instanceof Error ? error.message : 'spawn failed',
      });
      return;
    }

    let settled = false;
    const settle = (outcome: IsolationOutcome<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners();
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      settle({ ok: false, reason: 'PARSE_TIMEOUT' });
    }, budgets.timeoutMs);

    child.once('message', (message: IsolationOutcome<T>) => {
      settle(message);
    });

    child.once('error', (error: Error) => {
      settle({ ok: false, reason: 'PARSE_CRASHED', detail: error.message });
    });

    // Reached only when the process ended without a `message` ever landing:
    // an uncaught exception, a native crash, or the OS killing it (an OOM
    // kill arrives here as `signal: 'SIGKILL'`, indistinguishable from the
    // timeout branch's own kill only because that branch already settled
    // first and this listener is a no-op by the time it runs).
    child.once('exit', (code: number | null, signal: string | null) => {
      settle({
        ok: false,
        reason: 'PARSE_CRASHED',
        detail: `exit code=${code} signal=${signal}`,
      });
    });
  });
}
