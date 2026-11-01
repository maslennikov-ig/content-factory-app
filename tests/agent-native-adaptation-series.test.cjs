'use strict';
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const path = require('node:path');
const fixture = require('./helpers/agent-native-adaptation-series.probe.cjs');

jest.setTimeout(60_000);
let schema, f;
beforeAll(async () => {
  schema = `cf_native_series_${randomUUID().replaceAll('-', '')}`;
  f = await fixture.runtime(schema);
  await f.storage.db.none(`CREATE TABLE "${schema}".events (kind text NOT NULL)`);
  await f.storage.db.none(`CREATE TABLE "${schema}".receipts (id text PRIMARY KEY, value jsonb NOT NULL)`);
});
afterAll(async () => {
  if (!f) return;
  if (!/^cf_native_series_[a-f0-9]{32}$/.test(schema)) throw Error('Unexpected fixture schema');
  await f.storage.db.none(`DROP SCHEMA "${schema}" CASCADE`);
  await f.mastra.shutdown();
});

const start = (id, options = {}, signal) => f.native.startNativeAdaptationSeries(f.mastra, fixture.input(options), id, undefined, signal);
const counts = async () => ({ generate: await f.count('generate'), persist: await f.count('persist'), receipts: await f.receipts() });
const delta = (before, after) => Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));

test.each([1, 2, 5])('native workflow saves exactly %i generated parts', async count => {
  const before = await counts();
  const result = await start(`ordinary-${count}`, { fixtureCount: count });
  expect(result.status).toBe('success'); expect(result.result.parts).toHaveLength(count);
  expect(result.result.parts.map(part => part.postId)).toEqual(Array.from({ length: count }, (_, i) => `${result.runId}-post-${i}`));
  expect(delta(before, await counts())).toEqual({ generate: 1, persist: 1, receipts: 1 });
});

test('native questions return to the caller without persisting any draft', async () => {
  const before = await counts();
  const result = await start('questions', { fixtureMode: 'questions' });
  expect(result.status).toBe('success'); expect(result.result.kind).toBe('questions');
  expect(delta(before, await counts())).toEqual({ generate: 1, persist: 0, receipts: 0 });
});

test.each(['fail', 'lost-ack'])('%s suspends then resumes save without a second generation', async mode => {
  const before = await counts();
  if (mode === 'fail') f.failNext(); else f.loseNextAck();
  const first = await start(`save-${mode}`);
  expect(first).toMatchObject({ status: 'pending', nativeStatus: 'suspended' });
  const resumed = await f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, first.runId);
  expect(resumed.status).toBe('success'); expect(resumed.result.parts).toHaveLength(3);
  expect(delta(before, await counts())).toEqual({ generate: 1, persist: 2, receipts: 1 });
});

test('duplicate completed start returns the identical receipt and never creates new work', async () => {
  const before = await counts();
  const first = await start('same-tool'), second = await start('same-tool');
  expect(second).toEqual(first);
  expect(delta(before, await counts())).toEqual({ generate: 1, persist: 1, receipts: 1 });
});

test('other tenant, actor or piece cannot resume or list the owned series', async () => {
  f.failNext(); const first = await start('ownership');
  const before = await counts();
  for (const mismatch of [{ organizationId: 'other-org' }, { userId: 'other-user' }, { pieceId: 'other-piece' }]) {
    const foreign = { ...fixture.owner, ...mismatch };
    await expect(f.native.resumeNativeAdaptationSeries(f.mastra, foreign, first.runId)).rejects.toMatchObject({ code: 'ADAPTATION_SERIES_UNAVAILABLE' });
    expect(await f.native.readNativeAdaptationSeries(f.mastra, foreign)).toEqual([]);
  }
  expect(delta(before, await counts())).toEqual({ generate: 0, persist: 0, receipts: 0 });
});

test('an already stopped call creates no run and performs no generation', async () => {
  const before = await counts(), controller = new AbortController(); controller.abort();
  await expect(start('stopped-before-start', {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(delta(before, await counts())).toEqual({ generate: 0, persist: 0, receipts: 0 });
});

test('cold running persist is recovered with saved generation and original receipt id', async () => {
  const before = await counts();
  const child = fork(path.join(__dirname, 'helpers/agent-native-adaptation-series.probe.cjs'), [], {
    env: { ...process.env, CF_SERIES_SCHEMA: schema }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let runId;
  try {
    runId = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Child never reached persist')), 15_000);
      child.on('message', message => { if (message.type === 'persist-entered') { clearTimeout(timer); resolve(message.runId); } });
      child.on('exit', code => { if (code !== null) { clearTimeout(timer); reject(Error(`Child exited ${code}`)); } });
    });
    child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve));
    const state = await f.workflow.getWorkflowRunById(runId);
    expect(state.status).toBe('running'); expect(state.steps['generate-posts'].status).toBe('success');
    const resumed = await f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, runId);
    expect(resumed.status).toBe('success'); expect(resumed.result.seriesId).toBe(runId);
    expect(delta(before, await counts())).toEqual({ generate: 1, persist: 2, receipts: 1 });
  } finally { if (!child.killed) child.kill('SIGKILL'); }
});


test('a cold run without completed generation refuses recovery instead of rerunning the model', async () => {
  const before = await counts();
  const existing = await f.native.readNativeAdaptationSeries(f.mastra, fixture.owner);
  const seen = new Set(existing.map(row => row.runId));
  const child = fork(path.join(__dirname, 'helpers/agent-native-adaptation-series.probe.cjs'), [], {
    env: { ...process.env, CF_SERIES_SCHEMA: schema, CF_SERIES_MODE: 'pre-generate' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Child never reached generation')), 15_000);
      child.on('message', message => { if (message.type === 'generation-entered') { clearTimeout(timer); resolve(); } });
      child.on('exit', code => { if (code !== null) { clearTimeout(timer); reject(Error(`Child exited ${code}`)); } });
    });
    child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve));
    const rows = await f.native.readNativeAdaptationSeries(f.mastra, fixture.owner);
    const added = rows.filter(row => !seen.has(row.runId));
    expect(added).toHaveLength(1);
    await expect(f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, added[0].runId)).rejects.toMatchObject({ code: 'ADAPTATION_SERIES_NOT_RESUMABLE' });
    expect(delta(before, await counts())).toEqual({ generate: 1, persist: 0, receipts: 0 });
  } finally { if (!child.killed) child.kill('SIGKILL'); }
});


test('a failed cold save-only recovery can resume via the original run without regenerating', async () => {
  const before = await counts();
  const child = fork(path.join(__dirname, 'helpers/agent-native-adaptation-series.probe.cjs'), [], {
    env: { ...process.env, CF_SERIES_SCHEMA: schema, CF_SERIES_TOOL: 'cold-save-fails' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  try {
    const runId = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Child never reached persist')), 15_000);
      child.on('message', message => { if (message.type === 'persist-entered') { clearTimeout(timer); resolve(message.runId); } });
      child.on('exit', code => { if (code !== null) { clearTimeout(timer); reject(Error(`Child exited ${code}`)); } });
    });
    child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve));
    f.failNext();
    const pending = await f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, runId);
    expect(pending).toMatchObject({ status: 'pending', nativeStatus: 'suspended', runId: `${runId}:save` });
    const completed = await f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, runId);
    expect(completed.status).toBe('success'); expect(completed.result.seriesId).toBe(runId);
    expect(delta(before, await counts())).toEqual({ generate: 1, persist: 3, receipts: 1 });
  } finally { if (!child.killed) child.kill('SIGKILL'); }
});

test('concurrent cold recovery cannot duplicate the paid generation or saved receipt', async () => {
  const before = await counts();
  const child = fork(path.join(__dirname, 'helpers/agent-native-adaptation-series.probe.cjs'), [], {
    env: { ...process.env, CF_SERIES_SCHEMA: schema, CF_SERIES_TOOL: 'cold-concurrent' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  try {
    const runId = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Child never reached persist')), 15_000);
      child.on('message', message => { if (message.type === 'persist-entered') { clearTimeout(timer); resolve(message.runId); } });
      child.on('exit', code => { if (code !== null) { clearTimeout(timer); reject(Error(`Child exited ${code}`)); } });
    });
    child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve));
    const results = await Promise.allSettled([
      f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, runId),
      f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, runId),
    ]);
    expect(results.some(result => result.status === 'fulfilled' && result.value.status === 'success')).toBe(true);
    const completed = await f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, runId);
    expect(completed.status).toBe('success'); expect(completed.result.seriesId).toBe(runId);
    const actual = delta(before, await counts());
    expect(actual.generate).toBe(1); expect(actual.receipts).toBe(1);
  } finally { if (!child.killed) child.kill('SIGKILL'); }
});


test('failed generation is incomplete, not a retained draft awaiting save', async () => {
  const before = await counts();
  const failed = await start('failed-generation', { fixtureMode: 'failure' });
  expect(failed).toMatchObject({ status: 'incomplete', generated: false, nativeStatus: 'failed' });
  expect(delta(before, await counts())).toEqual({ generate: 1, persist: 0, receipts: 0 });
  await expect(f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, failed.runId)).rejects.toMatchObject({ code: 'ADAPTATION_SERIES_NOT_RESUMABLE' });
});
test('Stop while recovery awaits its native run prevents saving', async () => {
  f.failNext(); const first = await start('recovery-stop');
  const before = await counts(), controller = new AbortController();
  const original = f.workflow.createRun.bind(f.workflow);
  let entered, release;
  const paused = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.workflow.createRun = async (...args) => { const run = await original(...args); entered(); await gate; return run; };
  try {
    const recovery = f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, first.runId, undefined, controller.signal);
    await paused; controller.abort(); release();
    await expect(recovery).rejects.toMatchObject({ name: 'AbortError' });
    expect(delta(before, await counts())).toEqual({ generate: 0, persist: 0, receipts: 0 });
  } finally { release(); f.workflow.createRun = original; }
});
test('Stop of an entered save retains any committed receipt and never repeats generation', async () => {
  f.failNext(); const first = await start('entered-save-stop');
  const before = await counts(), controller = new AbortController(), held = f.holdNextPersist();
  const saving = f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, first.runId, undefined, controller.signal);
  await held.entered; controller.abort(); held.release();
  const stopped = await saving;
  expect(['pending', 'success']).toContain(stopped.status);
  expect(delta(before, await counts())).toEqual({ generate: 0, persist: 1, receipts: 1 });
  const reconciled = await f.native.resumeNativeAdaptationSeries(f.mastra, fixture.owner, first.runId);
  expect(reconciled.status).toBe('success'); expect(await f.count('generate')).toBe(before.generate);
  expect(await f.receipts()).toBe(before.receipts + 1);
});


test('author material after delegated interview creates a new version; replay and receipts do not regenerate', async () => {
  const before = await counts();
  const original = fixture.input(); original.plan.request.skipInterview = true;
  const first = await f.native.startNativeAdaptationSeries(f.mastra, original, 'delegated-then-material');
  const updated = fixture.input(); updated.plan.request.skipInterview = true;
  updated.plan.sourceRevision = { body: 'Core plus the actual author answer', brief: { fixture: true, answers: ['My actual view'] } };
  const next = await f.native.startNativeAdaptationSeries(f.mastra, updated, 'delegated-then-material');
  expect(next.runId).not.toBe(first.runId);
  const replay = await f.native.startNativeAdaptationSeries(f.mastra, { ...updated, plan: { ...updated.plan,
    sourceRevision: { ...updated.plan.sourceRevision, brief: { ...updated.plan.sourceRevision.brief, adaptationSeries: [{ seriesId: next.runId }] } } } }, 'delegated-then-material');
  expect(replay).toEqual(next);
  expect(delta(before, await counts())).toEqual({ generate: 2, persist: 2, receipts: 2 });
});
