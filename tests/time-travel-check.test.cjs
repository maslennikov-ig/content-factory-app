const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const setupFile = 'tests/helpers/time-travel.setup.cjs';
const runner = 'scripts/ci/run-time-travel-suite.sh';

/**
 * The check this guards exists because of one afternoon. On 31.08.2026 five
 * backup tests went red at 12:00 UTC on code nobody had touched: the fixture
 * pinned an artifact name while retention counted fourteen days back from the
 * real clock, and at noon the cutoff walked past the name. The morning run was
 * green. Nothing warned anyone in between, and the same shape had already been
 * seen on 21.08.2026.
 *
 * The answer was to run the suite a second time with the calendar moved
 * forward. That answer is only worth having while it is still wired up — a
 * setup file nobody loads, or a job quietly dropped from the workflow, leaves
 * exactly the blindness it was built to remove, and leaves it looking solved.
 *
 * So this holds two things: the shift behaves as described, and the check is
 * still reachable from the places that are supposed to reach it.
 */
describe('the calendar shift behaves as the check describes', () => {
  /**
   * Ask a clean Node process what the setup does. Loading it in-process would
   * measure Jest's module registry as much as the file — under the shifted run
   * the setup is already loaded, `require` hands back the cached instance, and
   * the test reports a shift of zero for code that works. A child process has
   * one clock and one copy, which is the thing being described.
   */
  function inShiftedProcess(days, expression) {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const real = Date.now();
         require(${JSON.stringify(path.join(root, setupFile))});
         process.stdout.write(String(${expression}));`,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, CF_TIME_TRAVEL_DAYS: String(days) },
      }
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    return result.stdout;
  }

  const offset = 400 * 24 * 60 * 60 * 1000;

  test('today moves by the offset, in both of the ways code asks for it', () => {
    // A minute of slack: the two readings are taken moments apart.
    expect(Number(inShiftedProcess(400, 'Date.now() - real'))).toBeGreaterThan(
      offset - 60_000
    );
    expect(
      Number(inShiftedProcess(400, 'new Date().getTime() - real'))
    ).toBeGreaterThan(offset - 60_000);
  });

  test('a moment given explicitly is left exactly where it was written', () => {
    // The whole check rests on this. Shift a pinned instant and every fixture
    // in the repository moves with the calendar, so nothing ever ages and the
    // run reports only failures it invented itself.
    const pinned = '2026-08-17T12:00:00Z';
    const expected = '1786968000000';

    expect(inShiftedProcess(400, `new Date(${JSON.stringify(pinned)}).getTime()`))
      .toBe(expected);
    expect(inShiftedProcess(400, `Date.parse(${JSON.stringify(pinned)})`))
      .toBe(expected);
    expect(inShiftedProcess(400, 'Date.UTC(2026, 7, 17, 12, 0, 0)'))
      .toBe(expected);
  });

  test('with no offset asked for, the real clock is left alone', () => {
    expect(inShiftedProcess(0, 'Math.abs(Date.now() - real) < 1000')).toBe(
      'true'
    );
  });
});

describe('the check is still wired to the places that run it', () => {
  test('the runner and its setup file are both present', () => {
    for (const file of [setupFile, runner]) {
      expect({ file, exists: fs.existsSync(path.join(root, file)) }).toEqual({
        file,
        exists: true,
      });
    }
  });

  test('the runner names the setup file, so the two cannot drift apart', () => {
    const text = fs.readFileSync(path.join(root, runner), 'utf8');
    expect(text).toContain('time-travel.setup.cjs');
  });

  test('package.json and the workflow both reach the runner', () => {
    const scripts = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    ).scripts;
    expect(scripts['test:time-travel']).toContain(runner);

    const workflow = fs.readFileSync(
      path.join(root, '.github/workflows/build.yml'),
      'utf8'
    );
    expect(workflow).toContain('test:time-travel');
  });

  test('the runner refuses an offset that would prove nothing', () => {
    // Zero days runs the ordinary suite under a different name, which is the
    // most expensive way to learn nothing at all.
    const result = spawnSync('bash', [path.join(root, runner), '0'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(64);
    expect(result.stderr).toContain('prove nothing');
  });
});
