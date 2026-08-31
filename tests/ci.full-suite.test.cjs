const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, '.github/workflows/build.yml');
const guardPath = path.join(root, 'scripts/ci/assert-suite-halves.cjs');

/**
 * CI has to run the suite, and the log has to show it ran all of it.
 *
 * Between 25.08.2026 and 30.08.2026 fourteen tests were red through five
 * releases. Even a paid, working CI would not have caught them: `build.yml` ran
 * `pnpm run build` and the Docker-backed proofs, and the fourteen live in suites
 * neither job executes. So the job below is the fix — and these tests hold it to
 * the two things that make it worth having: it runs the whole command, and it
 * refuses when a half of that command never reported.
 */

const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));
const job = workflow.jobs['full-suite'];
const runSteps = (job?.steps ?? []).filter((step) => typeof step.run === 'string');
const runText = runSteps.map((step) => step.run).join('\n');

describe('the full-suite CI job', () => {
  test('exists and is named as required', () => {
    expect(job).toBeDefined();
    expect(job.name).toBe('Full test suite (required)');
  });

  test('runs the whole command, not a chosen subset of it', () => {
    // A job that names individual suites drifts away from `package.json` and
    // silently stops covering whatever was added since. `pnpm test` is the
    // command `AGENTS.md` names in release acceptance; CI runs that one.
    expect(runText).toMatch(/^\s*pnpm test\b/m);
    expect(runText).not.toContain('jest --');
    expect(runText).not.toContain('--test-concurrency');
  });

  test('pipes into tee under pipefail, so tee cannot swallow a red run', () => {
    // `pnpm test | tee suite.log` reports tee's exit status. Without pipefail a
    // failing suite would leave the job green — the exact shape of blindness
    // this job exists to remove.
    const piping = runSteps.find((step) => step.run.includes('| tee'));
    expect(piping).toBeDefined();
    expect(piping.run).toMatch(/set -o pipefail/);
  });

  test('pins Node to .nvmrc, because the shell version changes the verdict', () => {
    const nvmrc = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
    const setup = job.steps.find(
      (step) => typeof step.uses === 'string' && step.uses.startsWith('actions/setup-node')
    );

    expect(setup).toBeDefined();
    expect(String(setup.with['node-version'])).toBe(nvmrc);
  });

  test('checks the halves even when the suite failed', () => {
    // On a red run this is the step that says which half never got to speak.
    // Without `always()` it is skipped exactly when it is needed.
    const check = job.steps.find(
      (step) => typeof step.run === 'string' && step.run.includes('assert-suite-halves.cjs')
    );

    expect(check).toBeDefined();
    expect(check.if).toBe('always()');
  });
});

describe('the suite-halves guard', () => {
  const JEST = 'Test Suites: 222 passed, 222 total\nTests:       1 skipped, 3049 passed, 3050 total\n';
  const NODE = '# pass 93\n# fail 0\n';
  const PYTHON = 'Ran 12 tests in 0.412s\n\nOK\n';

  let workspace;

  beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-suite-halves-'));
  });

  afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  let counter = 0;
  const check = (contents) => {
    counter += 1;
    const logPath = path.join(workspace, `suite-${counter}.log`);
    fs.writeFileSync(logPath, contents);
    return spawnSync(process.execPath, [guardPath, logPath], {
      cwd: root,
      encoding: 'utf8',
    });
  };

  test('accepts a log where all three halves reported', () => {
    const result = check(`${JEST}${NODE}${PYTHON}`);

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(result.stdout).toContain('All 3 suite halves reported.');
    expect(result.stdout).toContain('222 passed');
    expect(result.stdout).toContain('# pass 93');
    expect(result.stdout).toContain('OK');
  });

  test('accepts the Unicode spec reporter the same as plain TAP', () => {
    // Node prints `ℹ pass 93` on a TTY and `# pass 93` when piped. The guard
    // reads logs from both, and a reader that knew only one would call a
    // complete run incomplete.
    const result = check(`${JEST}ℹ pass 93\nℹ fail 0\n${PYTHON}`);

    expect(result.status).toBe(0);
  });

  test('refuses a log missing the python half, and names it', () => {
    const result = check(`${JEST}${NODE}`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('python unittest');
    expect(result.stderr).toContain('1 of 3 suite halves did not report');
  });

  test('refuses a log missing the node --test half, and names it', () => {
    const result = check(`${JEST}${PYTHON}`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('node --test');
    expect(result.stderr).not.toContain('python unittest (');
  });

  test('refuses the jest-only log — the exact mistake being closed', () => {
    // 221 green jest suites while fourteen `node --test` tests were failing.
    const result = check(JEST);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('2 of 3 suite halves did not report');
  });

  test('refuses an empty log rather than reading silence as success', () => {
    expect(check('').status).toBe(1);
  });

  test('judges reporting, not results: a red-but-complete log passes', () => {
    // The exit status of `pnpm test` already judges results, and duplicating
    // that judgement here would make the two disagree eventually.
    const result = check(
      'Test Suites: 3 failed, 219 passed, 222 total\nTests:       14 failed, 3035 passed, 3049 total\n' +
        '# pass 79\n# fail 14\n' +
        'Ran 12 tests in 0.402s\n\nFAILED (failures=2)\n'
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('# fail 14');
    expect(result.stdout).toContain('FAILED (failures=2)');
  });

  test('a bare "OK" is not a python verdict without its run count', () => {
    // "OK" appears in ordinary test output. Requiring `Ran N tests in` next to
    // it keeps an unrelated line from standing in for a half that never ran.
    const result = check(`${JEST}${NODE}OK\n`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('python unittest');
  });

  test('refuses a missing log path instead of assuming an empty one', () => {
    const result = spawnSync(process.execPath, [guardPath], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('was not provided');
  });
});
