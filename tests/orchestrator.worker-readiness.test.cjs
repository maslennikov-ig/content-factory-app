const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { Test } = require('@nestjs/testing');
const { loadTypeScriptModule, repositoryRoot } = require('./helpers/load-ts-module.cjs');

const BASE_TIME = Date.parse('2026-10-09T12:00:00Z');
const IDENTITY = 'owned-native-process@owned-host';
class TemporalService {}
const TEMPORAL_MODULE_OPTIONS = 'TEMPORAL_MODULE_OPTIONS';
function timestamp(ageMs = 0) {
  const access = BASE_TIME - ageMs;
  return { seconds: String(Math.floor(access / 1000)), nanos: (access % 1000) * 1000000 };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const { HealthController } = loadTypeScriptModule('apps/orchestrator/src/health.controller.ts', {
    'nestjs-temporal-core': { TemporalService, TEMPORAL_MODULE_OPTIONS },
  });
  const WorkerReadinessService = Reflect.getMetadata('design:paramtypes', HealthController)[0];
  const options = { workers: [{ taskQueue: 'main', workflowsPath: '/owned/workflows' },
    ...Array.from({ length: 32 }, (_, index) => ({ taskQueue: 'provider-' + index }))] };
  const states = new Map(options.workers.map(({ taskQueue }) => [taskQueue, {
    runState: 'RUNNING', activityPollerState: 'POLLING',
    workflowPollerState: taskQueue === 'main' ? 'POLLING' : 'SHUTDOWN',
    hasOutstandingActivityPoll: false, hasOutstandingWorkflowPoll: false,
    numInFlightActivities: 0, numInFlightWorkflowActivations: 0,
  }]));
  const workers = new Map(options.workers.map(({ taskQueue }) => [taskQueue, {
    options: { identity: IDENTITY, namespace: 'default' }, getStatus: jest.fn(() => states.get(taskQueue)),
  }]));
  const connection = { withDeadline: jest.fn((_deadline, callback) => callback()),
    workflowService: { describeTaskQueue: jest.fn().mockResolvedValue({
      pollers: [{ identity: IDENTITY, lastAccessTime: timestamp() }],
    }) } };
  const raw = { options: { namespace: 'default' }, connection };
  const temporal = { getWorker: jest.fn((name) => workers.get(name) || null),
    client: { getRawClient: jest.fn(() => raw) } };
  const service = new WorkerReadinessService(temporal, options);
  return { HealthController, WorkerReadinessService, options, states, workers, connection,
    raw, temporal, service, controller: new HealthController(service) };
}
describe('native worker readiness', () => {
  beforeEach(() => jest.useFakeTimers({ now: BASE_TIME }));
  afterEach(() => jest.useRealTimers());
  test('healthy idle 32 providers + main need activity pollers and only main workflow pollers', async () => {
    const h = harness();
    await expect(h.service.isReady()).resolves.toBe(true);
    const calls = h.connection.workflowService.describeTaskQueue.mock.calls.map(([request]) => request);
    expect(calls).toHaveLength(34);
    expect(calls.filter((request) => request.taskQueueType === 1)).toEqual([
      { namespace: 'default', taskQueue: { name: 'main' }, taskQueueType: 1 },
    ]);
    expect(calls.filter((request) => request.taskQueueType === 2)).toHaveLength(33);
    expect(h.connection.withDeadline).toHaveBeenCalledWith(BASE_TIME + 2000, expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
  });
  test('a reachable Temporal namespace does not hide a stopped native worker', async () => {
    const h = harness();
    h.states.get('main').runState = 'STOPPED';
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    await h.controller.getHealthStatus(res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ status: 'error' });
    expect(h.temporal.client.getRawClient).not.toHaveBeenCalled();
  });
  test.each(['INITIALIZED', 'STOPPING', 'DRAINING', 'DRAINED', 'STOPPED', 'FAILED'])(
    'worker state %s immediately overrides a cached success', async (state) => {
      const h = harness();
      await expect(h.service.isReady()).resolves.toBe(true);
      h.states.get('provider-31').runState = state;
      await expect(h.service.isReady()).resolves.toBe(false);
      expect(h.connection.workflowService.describeTaskQueue).toHaveBeenCalledTimes(34);
    });
  test.each([['main', 'activityPollerState'], ['main', 'workflowPollerState'], ['provider-31', 'activityPollerState']])(
    'missing %s %s is unavailable even with fresh server entries', async (queue, field) => {
      const h = harness(); h.states.get(queue)[field] = 'SHUTDOWN';
      await expect(h.service.isReady()).resolves.toBe(false);
      expect(h.temporal.client.getRawClient).not.toHaveBeenCalled();
    });
  test.each(['main', 'provider-31'])('missing configured %s worker is unavailable', async (queue) => {
    const h = harness(); h.workers.delete(queue);
    await expect(h.service.isReady()).resolves.toBe(false);
  });
  test('empty placement fails closed and deliberately excluded queues are not added', async () => {
    const h = harness();
    await expect(new h.WorkerReadinessService(h.temporal, { workers: [] }).isReady()).resolves.toBe(false);
    const selected = new h.WorkerReadinessService(h.temporal, { workers: [{ taskQueue: 'provider-0' }] });
    await expect(selected.isReady()).resolves.toBe(true);
    expect(h.connection.workflowService.describeTaskQueue).toHaveBeenCalledTimes(1);
  });
  test.each([['main', 1], ['main', 2], ['provider-31', 2]])(
    'missing %s task type %s pollers fail while other reads stay healthy', async (queue, type) => {
      const h = harness();
      h.connection.workflowService.describeTaskQueue.mockImplementation(async (request) => ({
        pollers: request.taskQueue.name === queue && request.taskQueueType === type
          ? [] : [{ identity: IDENTITY, lastAccessTime: timestamp() }],
      }));
      await expect(h.service.isReady()).resolves.toBe(false);
    });
  test.each([
    ['stale', { pollers: [{ identity: IDENTITY, lastAccessTime: timestamp(120001) }] }],
    ['future', { pollers: [{ identity: IDENTITY, lastAccessTime: timestamp(-1) }] }],
    ['old identity', { pollers: [{ identity: 'old-process@owned-host', lastAccessTime: timestamp() }] }],
    ['missing identity', { pollers: [{ lastAccessTime: timestamp() }] }],
    ['missing timestamp', { pollers: [{ identity: IDENTITY }] }], ['missing metadata', {}],
    ['malformed pollers', { pollers: {} }], ['null poller', { pollers: [null] }],
    ['fractional seconds', { pollers: [{ identity: IDENTITY, lastAccessTime: { seconds: 1.2 } }] }],
    ['unsafe seconds', { pollers: [{ identity: IDENTITY, lastAccessTime: { seconds: '99999999999999999' } }] }],
    ['coercible seconds', { pollers: [{ identity: IDENTITY, lastAccessTime: { seconds: [BASE_TIME / 1000] } }] }],
    ['invalid nanos', { pollers: [{ identity: IDENTITY, lastAccessTime: { seconds: String(BASE_TIME / 1000), nanos: 1000000000 } }] }],
  ])('%s poller data fails closed', async (_label, response) => {
    const h = harness(); h.connection.workflowService.describeTaskQueue.mockResolvedValue(response);
    await expect(h.service.isReady()).resolves.toBe(false);
  });
  test('120s boundary and protobuf Long are accepted for the current identity', async () => {
    const h = harness(); const access = timestamp(120000);
    access.seconds = { toString: () => String((BASE_TIME - 120000) / 1000) };
    h.connection.workflowService.describeTaskQueue.mockResolvedValue({ pollers: [
      { identity: 'foreign-process', lastAccessTime: timestamp() }, { identity: IDENTITY, lastAccessTime: access },
    ] });
    await expect(h.service.isReady()).resolves.toBe(true);
  });
  test('same-process worker replacement invalidates cached success', async () => {
    const h = harness(); await expect(h.service.isReady()).resolves.toBe(true);
    h.workers.set('main', { ...h.workers.get('main') });
    h.connection.workflowService.describeTaskQueue.mockResolvedValue({ pollers: [] });
    await expect(h.service.isReady()).resolves.toBe(false);
    expect(h.connection.workflowService.describeTaskQueue).toHaveBeenCalledTimes(68);
  });
  test('restart rejects old identity and recovers only once the new identity polls', async () => {
    const h = harness(); await expect(h.service.isReady()).resolves.toBe(true);
    for (const worker of h.workers.values()) worker.options.identity = 'restarted-process@owned-host';
    await expect(h.service.isReady()).resolves.toBe(false);
    h.connection.workflowService.describeTaskQueue.mockResolvedValue({ pollers: [
      { identity: IDENTITY, lastAccessTime: timestamp() },
      { identity: 'restarted-process@owned-host', lastAccessTime: timestamp() },
    ] });
    await jest.advanceTimersByTimeAsync(5000);
    await expect(h.service.isReady()).resolves.toBe(true);
  });
  test.each([
    ['RPC refusal', (h) => h.connection.workflowService.describeTaskQueue.mockRejectedValue(Error('private-sentinel API_KEY'))],
    ['deadline refusal', (h) => h.connection.withDeadline.mockRejectedValue(Error('private-sentinel'))],
    ['no client', (h) => h.temporal.client.getRawClient.mockReturnValue(null)],
    ['no namespace', (h) => { delete h.raw.options.namespace; }],
    ['wrong worker namespace', (h) => { h.workers.get('main').options.namespace = 'other'; }],
    ['worker status refusal', (h) => h.workers.get('main').getStatus.mockImplementation(() => { throw Error('private-sentinel'); })],
  ])('%s produces only unavailable503', async (_label, cut) => {
    const h = harness(); cut(h);
    const res = { status: jest.fn(), json: jest.fn() }; res.status.mockReturnValue(res);
    await h.controller.getHealthStatus(res);
    expect(res.status).toHaveBeenCalledWith(503); expect(res.json).toHaveBeenCalledWith({ status: 'error' });
  });
  test('50 simultaneous requests share one batch of at most four active RPCs', async () => {
    const h = harness(); let active = 0, peak = 0;
    h.connection.workflowService.describeTaskQueue.mockImplementation(async () => {
      active++; peak = Math.max(peak, active); await Promise.resolve(); active--;
      return { pollers: [{ identity: IDENTITY, lastAccessTime: timestamp() }] };
    });
    await expect(Promise.all(Array.from({ length: 50 }, () => h.service.isReady()))).resolves.toEqual(Array(50).fill(true));
    expect(h.temporal.client.getRawClient).toHaveBeenCalledTimes(1);
    expect(h.connection.workflowService.describeTaskQueue).toHaveBeenCalledTimes(34);
    expect(peak).toBe(4); expect(jest.getTimerCount()).toBe(0);
  });
  test.each([true, false])('cached %s expires at exactly five seconds', async (initial) => {
    const h = harness(); const fresh = [{ identity: IDENTITY, lastAccessTime: timestamp() }];
    h.connection.workflowService.describeTaskQueue.mockResolvedValue({ pollers: initial ? fresh : [] });
    await expect(h.service.isReady()).resolves.toBe(initial);
    h.connection.workflowService.describeTaskQueue.mockResolvedValue({ pollers: initial ? [] : fresh });
    await jest.advanceTimersByTimeAsync(4999);
    await expect(h.service.isReady()).resolves.toBe(initial);
    expect(h.connection.workflowService.describeTaskQueue).toHaveBeenCalledTimes(34);
    await jest.advanceTimersByTimeAsync(1);
    await expect(h.service.isReady()).resolves.toBe(!initial);
    expect(h.connection.workflowService.describeTaskQueue).toHaveBeenCalledTimes(68);
  });
  test('stuck RPC responds in two seconds and cannot admit replacement batches', async () => {
    const h = harness(); const work = deferred();
    h.connection.workflowService.describeTaskQueue.mockReturnValue(work.promise);
    const pending = h.service.isReady(); await jest.advanceTimersByTimeAsync(1999);
    let settled = false; void pending.then(() => { settled = true; }); await Promise.resolve();
    expect(settled).toBe(false); await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe(false); await jest.advanceTimersByTimeAsync(10000);
    await expect(Promise.all(Array.from({ length: 50 }, () => h.service.isReady()))).resolves.toEqual(Array(50).fill(false));
    expect(h.connection.workflowService.describeTaskQueue).toHaveBeenCalledTimes(4);
    work.reject(Error('private-sentinel late RPC')); await jest.advanceTimersByTimeAsync(0);
    expect(jest.getTimerCount()).toBe(0);
  });
  test('worker shutdown during a metadata batch cannot return success', async () => {
    const h = harness(); const work = deferred();
    h.connection.workflowService.describeTaskQueue.mockReturnValue(work.promise);
    const pending = h.service.isReady(); await jest.advanceTimersByTimeAsync(0);
    h.states.get('main').runState = 'STOPPING';
    work.resolve({ pollers: [{ identity: IDENTITY, lastAccessTime: timestamp() }] });
    await expect(pending).resolves.toBe(false);
  });
  test('late event-loop completion fails before its delayed timeout fires', async () => {
    const h = harness(); const work = deferred();
    h.connection.workflowService.describeTaskQueue.mockReturnValue(work.promise);
    const pending = h.service.isReady(); await jest.advanceTimersByTimeAsync(0);
    jest.setSystemTime(BASE_TIME + 2001);
    work.resolve({ pollers: [{ identity: IDENTITY, lastAccessTime: timestamp() }] });
    await expect(pending).resolves.toBe(false);
  });
});
function request(origin) {
  return new Promise((resolve, reject) => {
    const req = http.get(new URL('/health/status', origin), { agent: false }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) })); res.on('error', reject);
    });
    req.on('error', reject); req.setTimeout(3000, () => req.destroy(Error('owned HTTP fixture timeout')));
  });
}
test('real Nest injection and HTTP report ready200, stopped503 and restart200', async () => {
  const h = harness();
  h.connection.workflowService.describeTaskQueue.mockImplementation(async () => ({ pollers: [{
    identity: IDENTITY, lastAccessTime: { seconds: String(Math.floor(Date.now() / 1000)) },
  }] }));
  const module = await Test.createTestingModule({ controllers: [h.HealthController], providers: [
    h.WorkerReadinessService, { provide: TemporalService, useValue: h.temporal },
    { provide: TEMPORAL_MODULE_OPTIONS, useValue: h.options }],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.listen(0, '127.0.0.1'); const origin = await app.getUrl();
    await expect(request(origin)).resolves.toEqual({ status: 200, body: { status: 'ok' } });
    h.states.get('main').runState = 'STOPPED';
    await expect(request(origin)).resolves.toEqual({ status: 503, body: { status: 'error' } });
    h.states.get('main').runState = 'RUNNING';
    await expect(request(origin)).resolves.toEqual({ status: 200, body: { status: 'ok' } });
  } finally { await app.close(); }
});
test.each([[0, 0, 0], [1, 0, 1], [0, 22, 22], [0, 7, 7]])(
  'production health requires API and worker (exit %s/%s => %s)', (api, worker, expected) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-readiness-health-'));
    try {
      fs.writeFileSync(path.join(directory, 'curl'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CF_READINESS_CURL_CALLS"\ncase "$*" in\n *:5000/api/*) exit "$CF_READINESS_API_EXIT";;\n *:4321/health/status*) exit "$CF_READINESS_WORKER_EXIT";;\n *) exit 99;;\nesac\n', { mode: 0o700 });
      const calls = path.join(directory, 'calls');
      const command = fs.readFileSync(path.join(repositoryRoot, 'Dockerfile'), 'utf8').match(/HEALTHCHECK[^\n]*\\\n\s+CMD ([^\n]+)/)[1];
      expect(command).toBe('sh /app/var/docker/healthcheck.sh');
      const result = spawnSync('sh', [path.join(repositoryRoot, 'var/docker/healthcheck.sh')], {
        env: { ...process.env, PATH: directory + ':' + process.env.PATH, ORCHESTRATOR_PORT: '4321',
          CF_READINESS_CURL_CALLS: calls, CF_READINESS_API_EXIT: String(api), CF_READINESS_WORKER_EXIT: String(worker) }, timeout: 5000,
      });
      expect(result.status).toBe(expected);
      const actual = fs.readFileSync(calls, 'utf8');
      expect(actual).toContain('-fsS --max-time 1 http://127.0.0.1:5000/api/');
      if (api === 0) expect(actual).toContain('-fsS --max-time 3 http://127.0.0.1:4321/health/status');
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
