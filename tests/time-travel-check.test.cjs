const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
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
  function inShiftedProcess(days, expression, beforeSetup = '') {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const real = Date.now();
         ${beforeSetup}
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

  test('native, cloned and subclass dates keep their identity while timers stay real', () => {
    const actual = JSON.parse(inShiftedProcess(400, `(() => {
      const explicit = new Date('2030-01-01T12:00:00Z');
      class DerivedDate extends Date {}
      const derived = new DerivedDate('2030-01-01T12:00:00Z');
      let callable = false; try { callable = typeof Date() === 'string'; } catch {}
      return JSON.stringify({
        prototype: Date.prototype === NativeDate.prototype,
        existing: existing instanceof Date,
        explicit: explicit instanceof Date,
        cloned: structuredClone(explicit) instanceof Date,
        subclass: derived instanceof DerivedDate && derived instanceof Date,
        explicitISO: derived.toISOString(), callable,
        realTimers: setTimeout === nativeSetTimeout && setInterval === nativeSetInterval,
      });
    })()`, `const NativeDate = Date, existing = new Date('2030-01-01T12:00:00Z');
      const nativeSetTimeout = setTimeout, nativeSetInterval = setInterval;`));
    expect(actual).toEqual({prototype: true, existing: true, explicit: true, cloned: true, subclass: true,
      explicitISO: '2030-01-01T12:00:00.000Z', callable: true, realTimers: true});
  });

  test('Jest timers captured before the shift construct valid dates and restore the shifted clock', () => {
    const actual = JSON.parse(inShiftedProcess(400, `(() => {
      timers.useFakeTimers({now: Date.parse('2030-01-01T12:00:00Z')});
      let result;
      try {
        const future = new Date('2031-01-01T00:00:00Z');
        let fired = false; setTimeout(() => { fired = true; }, 25);
        timers.advanceTimersByTime(25);
        result = {future: future instanceof Date, cloned: structuredClone(future) instanceof Date,
          futureAfterNow: future.getTime() > Date.now(), nowMatches: new Date().getTime() === Date.now(),
          nowISO: new Date().toISOString(), fired};
      } finally { timers.useRealTimers(); }
      result.restoredShift = Math.abs(Date.now() - NativeDate.now() - ${offset}) < 1000;
      result.restoredPrototype = Date.prototype === NativeDate.prototype;
      return JSON.stringify(result);
    })()`, `const NativeDate = Date;
      const {ModernFakeTimers} = require('@jest/fake-timers');
      const timers = new ModernFakeTimers({global: globalThis, config: {fakeTimers: {}}});`));
    expect(actual).toEqual({future: true, cloned: true, futureAfterNow: true, nowMatches: true,
      nowISO: '2030-01-01T12:00:00.025Z', fired: true, restoredShift: true, restoredPrototype: true});
  });

  test('explicit Date.now spies and property overrides remain effective and restore without mutating the native clock', () => {
    const actual = JSON.parse(inShiftedProcess(400, `(() => {
      const {spyOn} = require('jest-mock');
      const spy = spyOn(Date, 'now').mockReturnValue(123);
      const spied = Date.now() === 123; spy.mockRestore();
      const restoredSpy = Math.abs(Date.now() - NativeDate.now() - ${offset}) < 1000;
      const descriptor = Object.getOwnPropertyDescriptor(Date, 'now');
      Object.defineProperty(Date, 'now', {configurable: true, writable: true, value: () => 456});
      const defined = Date.now() === 456;
      Object.defineProperty(Date, 'now', descriptor);
      return JSON.stringify({spied, restoredSpy, defined,
        restoredProperty: Math.abs(Date.now() - NativeDate.now() - ${offset}) < 1000,
        nativeUntouched: NativeDate.now === nativeNow});
    })()`, 'const NativeDate = Date, nativeNow = Date.now;'));
    expect(actual).toEqual({spied: true, restoredSpy: true, defined: true, restoredProperty: true, nativeUntouched: true});
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

  // Both launchers are intercepted so an old npx dispatch cannot start a suite.
  function recordedRunner(args, exit = 0) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-time-travel-runner-'));
    const capture = path.join(directory, 'invocation.json');
    const launcher = `#!/usr/bin/env node
      const fs = require('node:fs'), path = require('node:path');
      fs.writeFileSync(process.env.CF_TEST_CLOCK_CAPTURE, JSON.stringify({
        binary: path.basename(process.argv[1]), args: process.argv.slice(2), days: process.env.CF_TIME_TRAVEL_DAYS,
      }));
      process.exit(Number(process.env.CF_TEST_CLOCK_EXIT));
    `;
    try {
      for (const name of ['pnpm', 'npx']) fs.writeFileSync(path.join(directory, name), launcher, {mode: 0o755});
      const result = spawnSync('bash', [path.join(root, runner), ...args], {
        encoding: 'utf8', env: {...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}`,
          CF_TEST_CLOCK_CAPTURE: capture, CF_TEST_CLOCK_EXIT: String(exit)},
      });
      return {...result, invocation: fs.existsSync(capture) ? JSON.parse(fs.readFileSync(capture, 'utf8')) : null};
    } finally { fs.rmSync(directory, {recursive: true, force: true}); }
  }

  test('the runner delegates the exact requested population to canonical Jest with the setup last', () => {
    const args = ['--shard=1/2', '--runTestsByPath', 'a test with spaces.test.cjs'];
    const result = recordedRunner(['400', ...args]);
    expect(result.status).toBe(0); expect(result.stderr).toBe('');
    expect(result.invocation).toEqual({binary: 'pnpm', days: '400',
      args: ['run', 'test:jest', ...args, `--setupFiles=${path.join(root, setupFile)}`]});
  });

  test('the runner propagates a failed canonical Jest exit status', () => {
    expect(recordedRunner(['400', '--shard=1/2'], 7).status).toBe(7);
  });

  test.each(['0', 'not-an-integer'])('the runner refuses invalid offset %s before launching Jest', days => {
    const result = recordedRunner([days]);
    expect(result.status).toBe(64); expect(result.invocation).toBeNull();
    expect(result.stderr).toContain(days === '0' ? 'prove nothing' : 'non-negative integer');
  });
});
