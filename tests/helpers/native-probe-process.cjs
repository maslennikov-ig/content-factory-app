'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

/** Keep native child failures readable by Jest's worker JSON transport. */
const runProbeProcess = (file, args = [], { timeout = 200_000, env = {} } = {}) => {
  try {
    return execFileSync(process.execPath, [file, ...args], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8', timeout, env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // spawnSync attaches its result to the original error; on a timeout that
    // result.error is the error itself. Passing it to a Jest worker hides the
    // actual ETIMEDOUT behind "Converting circular structure to JSON".
    const failure = new Error([
      `Native probe ${path.basename(file)} ${args.join(' ')} failed: ${error.code ?? 'exit'}; timeout=${timeout}ms; status=${error.status}; signal=${error.signal}.`,
      String(error.stderr ?? '').slice(-6000),
      String(error.stdout ?? '').slice(-1000),
    ].filter(Boolean).join('\n'));
    failure.name = 'NativeProbeError';
    failure.code = error.code ?? 'PROBE_EXIT_FAILED';
    failure.status = error.status ?? null;
    failure.signal = error.signal ?? null;
    throw failure;
  }
};

module.exports = { runProbeProcess };
