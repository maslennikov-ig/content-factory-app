'use strict';
const { runProbeProcess } = require('./helpers/native-probe-process.cjs');

test('native proof stdout survives a successful child', () => {
  expect(JSON.parse(runProbeProcess('-e', ['process.stdout.write(JSON.stringify({ok:true}))']))).toEqual({ ok: true });
});

test('a real child timeout retains its code without a circular worker error', () => {
  let error;
  try { runProbeProcess('-e', ['setInterval(()=>{},1000)'], { timeout: 30 }); }
  catch (failure) { error = failure; }
  expect(error).toMatchObject({ name: 'NativeProbeError', code: 'ETIMEDOUT', signal: 'SIGTERM' });
  expect(error.message).toContain('timeout=30ms');
  expect(() => JSON.stringify({ error })).not.toThrow();
});

test('a failed native proof retains its exit status and original diagnostic', () => {
  expect.assertions(3);
  try { runProbeProcess('-e', ["process.stderr.write('synthetic proof failure');process.exit(7)"]); }
  catch (error) {
    expect(error).toMatchObject({ code: 'PROBE_EXIT_FAILED', status: 7 });
    expect(error.message).toContain('synthetic proof failure');
    expect(() => JSON.stringify({ error })).not.toThrow();
  }
});
