const { inspect } = require('node:util');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { DefaultLogger, LogTimestamp } = require('@temporalio/worker');
const { Activity } = require('@temporalio/worker/lib/activity');
const { Context } = require('@temporalio/activity');
const { ApplicationFailure } = require('@temporalio/common');
const { initLoggerSink } = require('@temporalio/worker/lib/workflow/logger');
const file = 'libraries/nestjs-libraries/src/temporal/mail-log-privacy.ts';
const { createMailPrivacyLogger } = loadTypeScriptModule(file);
const recipient = 'queue-recipient-sentinel@example.invalid';
const subject = 'queue-subject-sentinel';
const body = 'queue-body-sentinel';
const cookie = 'queue-cookie-sentinel';
const sentinels = [recipient, subject, body, cookie];
const runId = '20e78d57-c8cf-4a24-86d2-053810e35e63';
const unsafeMeta = () => ({
  workflowType: 'sendEmailWorkflowV2', runId, workflowId: recipient,
  namespace: cookie, taskQueue: body, taskToken: cookie,
  to: recipient, subject, html: body, headers: { cookie },
  error: Object.assign(new Error(body), { cause: new Error(subject), details: [{ recipient, cookie }] }),
});
const assertNoSentinels = value => {
  const output = inspect(value, { depth: null });
  for (const sentinel of sentinels) expect(output.includes(sentinel)).toBe(false);
};

test.each(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'])('mail %s records retain severity/timestamp but no message or payload', level => {
  const delegate = { log: jest.fn() };
  const logger = createMailPrivacyLogger(delegate);
  const meta = Object.freeze({ ...unsafeMeta(), [LogTimestamp]: 123456789n });
  logger.log(level, sentinels.join(' '), meta);
  const [actualLevel, message, safe] = delegate.log.mock.calls[0];
  expect(actualLevel).toBe(level);
  expect(message).toBe('mail.log_event');
  expect(safe).toEqual({ code: 'log_event', correlationId: runId, workflowType: 'sendEmailWorkflowV2', [LogTimestamp]: 123456789n });
  assertNoSentinels(delegate.log.mock.calls);
});

test.each(['sendEmailWorkflow', 'sendEmailWorkflowV2', 'sendEmailWorkflowV3'])('installed SDK workflow sink redacts %s dropped-mail messages', workflowType => {
  const delegate = { log: jest.fn() };
  const { __temporal_logger: sink } = initLoggerSink(createMailPrivacyLogger(delegate));
  const meta = { ...unsafeMeta(), workflowType };
  const message = `${workflowType}: dropping an email that failed to send`;
  sink.error.fn({}, message, meta);
  const safe = delegate.log.mock.calls[0][2];
  expect(safe.correlationId).toBe(runId);
  expect(delegate.log.mock.calls[0][0]).toBe('ERROR');
  expect(safe.code).toBe(workflowType === 'sendEmailWorkflow' ? 'log_event' : 'delivery_failed');
  assertNoSentinels(delegate.log.mock.calls);
});

test.each(['sendEmail', 'sendEmailV2', 'sendEmailAsync'])('mail activity %s is redacted even in a non-mail workflow', activityType => {
  const delegate = { log: jest.fn() };
  createMailPrivacyLogger(delegate).warn('Activity failed', {
    ...unsafeMeta(), workflowType: recipient, activityType, workflowRunId: runId, attempt: 3, durationMs: 0.75,
  });
  expect(delegate.log.mock.calls[0]).toEqual(['WARN', 'mail.activity_failed', {
    code: 'activity_failed', correlationId: runId, activityType, attempt: 3, durationMs: 0.75,
  }]);
  assertNoSentinels(delegate.log.mock.calls);
});

test('missing/invalid execution IDs use random correlation rather than unsafe identifiers', () => {
  const delegate = { log: jest.fn() };
  const logger = createMailPrivacyLogger(delegate);
  for (const runId of [undefined, recipient, 12]) logger.error(body, { ...unsafeMeta(), runId });
  const ids = delegate.log.mock.calls.map(call => call[2].correlationId);
  expect(new Set(ids).size).toBe(3);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  assertNoSentinels(delegate.log.mock.calls);
});

test('logging never reads provider-error getters or mutates caller metadata', () => {
  const delegate = { log: jest.fn() };
  const meta = unsafeMeta();
  Object.defineProperty(meta, 'error', { get() { throw new Error('Raw error must not be inspected'); } });
  Object.freeze(meta);
  expect(() => createMailPrivacyLogger(delegate).error('Activity failed', meta)).not.toThrow();
  expect(delegate.log).toHaveBeenCalledTimes(1);
  assertNoSentinels(delegate.log.mock.calls);
});

test.each([NaN, Infinity, -1, recipient, 1.5])('unsafe attempt %s does not enter the safe record', attempt => {
  const delegate = { log: jest.fn() };
  createMailPrivacyLogger(delegate).warn('Activity failed', { ...unsafeMeta(), attempt });
  expect(delegate.log.mock.calls[0][2]).not.toHaveProperty('attempt');
  assertNoSentinels(delegate.log.mock.calls);
});

test.each(['postWorkflow', 'sendEmailWorkflowV3Suffix', undefined])('unrelated workflow %s logs keep exact message, metadata and severity', workflowType => {
  const delegate = { log: jest.fn() }, meta = { ...unsafeMeta(), workflowType, activityType: 'publishPost' };
  const message = sentinels.join(' ');
  createMailPrivacyLogger(delegate).warn(message, meta);
  expect(delegate.log.mock.calls[0][0]).toBe('WARN');
  expect(delegate.log.mock.calls[0][1]).toBe(message);
  expect(delegate.log.mock.calls[0][2]).toBe(meta);
});

test.each([false, true])('installed SDK activity retains failure identity and retryability=%s with safe logs', nonRetryable => {
  const entries = [];
  const logger = createMailPrivacyLogger(new DefaultLogger('TRACE', entry => entries.push(entry)));
  const failure = ApplicationFailure.create({ message: sentinels.join(' '), type: subject, nonRetryable, details: [{ recipient, html: body, cookie }] });
  const activity = new Activity({
    workflowType: 'sendEmailWorkflowV2', activityType: 'sendEmailV2', attempt: 2,
    workflowExecution: { workflowId: recipient, runId },
    workflowNamespace: cookie, taskQueue: body, activityId: subject, base64TaskToken: cookie,
  }, undefined, {}, () => {}, undefined, logger, {}, []);
  return expect(activity.runNoEncoding(async () => {
    Context.current().log.info(body, { recipient, subject, cookie });
    throw failure;
  }, { args: [recipient, subject, body], headers: {} })).rejects.toBe(failure).then(() => {
    expect(failure.nonRetryable).toBe(nonRetryable);
    expect(entries.some(entry => entry.message === 'mail.activity_failed' && entry.level === 'WARN')).toBe(true);
    expect(entries.every(entry => entry.meta.correlationId === runId)).toBe(true);
    assertNoSentinels(entries);
  });
});

test('sandbox console checks the current workflow per call and never formats mail arguments', () => {
  const hostConsole = globalThis.console;
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  const calls = [], emitted = [];
  let workflowType = 'sendEmailWorkflow';
  try {
    globalThis.console = Object.freeze(Object.fromEntries(methods.map(method => [method, (...args) => calls.push({ method, args })])));
    const { interceptors } = loadTypeScriptModule('libraries/nestjs-libraries/src/temporal/mail-log-privacy.workflow.ts', {
      '@temporalio/workflow': {
        workflowInfo: () => ({ workflowType }),
        log: Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, (...args) => emitted.push({ level, args })])),
      },
    });
    expect(interceptors()).toEqual({});
    const payload = { recipient, subject, html: body, cookie, toString() { throw new Error('must not format'); } };
    for (const method of methods) console[method](payload);
    expect(calls).toHaveLength(0);
    assertNoSentinels(emitted);
    expect(emitted).toHaveLength(5);
    workflowType = 'postWorkflow';
    for (const method of methods) console[method](payload);
    expect(calls).toHaveLength(5);
    expect(calls.every(call => call.args[0] === payload)).toBe(true);
    workflowType = 'sendEmailWorkflowV3';
    interceptors();
    console.error(payload);
    expect(calls).toHaveLength(5);
    expect(emitted).toHaveLength(6);
  } finally { globalThis.console = hostConsole; }
});

test('bootstrap installs default-severity mail adapter without telemetry/filter/collector options', () => {
  const install = jest.fn();
  const { installMailLogPrivacy } = loadTypeScriptModule(file, {
    '@temporalio/worker': { DefaultLogger, LogTimestamp, Runtime: { install } },
  });
  installMailLogPrivacy();
  expect(install).toHaveBeenCalledWith({ logger: expect.objectContaining({ log: expect.any(Function), error: expect.any(Function) }) });
  expect(Object.keys(install.mock.calls[0][0])).toEqual(['logger']);
});

test('orchestrator entrypoint installs privacy before Nest can start workers', async () => {
  const order = [], app = { enableShutdownHooks: () => {}, listen: async () => {} };
  const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    loadTypeScriptModule('apps/orchestrator/src/main.ts', {
      '@contentfactory/nestjs-libraries/temporal/mail-log-privacy': { installMailLogPrivacy: () => order.push('privacy') },
      '@contentfactory/nestjs-libraries/sentry/initialize.sentry': { initializeSentry: () => false },
      '@nestjs/core': { NestFactory: { create: async () => { order.push('Nest'); return app; } } },
      '@contentfactory/orchestrator/app.module': { AppModule: class {} },
      'source-map-support/register': {}, dayjs: { extend: () => {} }, 'dayjs/plugin/utc': {}, 'node:dns': { setDefaultResultOrder: () => {} },
    });
    await Promise.resolve(); await Promise.resolve();
    expect(order).toEqual(['privacy', 'Nest']);
  } finally { consoleLog.mockRestore(); }
});

test('actual Temporal configuration loads console interceptor on main only and keeps client-only modules unchanged', () => {
  const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
  const filename = path.resolve(__dirname, '../libraries/nestjs-libraries/src/temporal/temporal.module.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const substitutes = {
    '@nestjs/common': {},
    'nestjs-temporal-core': { TemporalModule: { register: options => options }, TEMPORAL_CLIENT: 'client', TEMPORAL_CONNECTION: 'connection' },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': { socialIntegrationList: [{ identifier: 'x', maxConcurrentJob: 2 }] },
  };
  const take = request => { if (!(request in substitutes)) throw new Error('Unexpected configuration dependency'); return substitutes[request]; };
  take.resolve = request => require.resolve(path.resolve(path.dirname(filename), request + '.ts'));
  const module = { exports: {} };
  new Function('exports', 'require', 'module', code)(module.exports, take, module);
  const excluded = process.env.EXCLUDE_QUEUE;
  delete process.env.EXCLUDE_QUEUE;
  try {
    const options = module.exports.getTemporalModule(true, 'synthetic-workflows', []);
    const main = options.workers.find(worker => worker.taskQueue === 'main');
    expect(main.workerOptions.interceptors.workflowModules).toEqual([
      require.resolve('../libraries/nestjs-libraries/src/temporal/mail-log-privacy.workflow.ts'),
    ]);
    expect(main.workflowsPath).toBe('synthetic-workflows');
    expect(options.workers.find(worker => worker.taskQueue === 'x').workerOptions.interceptors).toBeUndefined();
    expect(module.exports.getTemporalModule(false).workers).toBeUndefined();
    expect(options.logLevel).toBe('error');
  } finally { if (excluded === undefined) delete process.env.EXCLUDE_QUEUE; else process.env.EXCLUDE_QUEUE = excluded; }
});
