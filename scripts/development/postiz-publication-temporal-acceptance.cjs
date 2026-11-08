#!/usr/bin/env node
'use strict';
/** Actual task-isolated SDK workers + SIGKILL + V110 workflow/activity + Prisma
 * journal. Provider and auxiliary side effects are synthetic local functions. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { Client, Connection } = require('@temporalio/client');
const { Worker, NativeConnection, Runtime, DefaultLogger, bundleWorkflowCode } = require('@temporalio/worker');
const { Context } = require('@temporalio/activity');

const ROOT = path.resolve(__dirname, '../..');
const PRIVATE = '/home/me/.local/share/content-factory-orchestration/postiz-remaining-20261107';
const DB_FILE = path.join(PRIVATE, 'review-database-url.private');
const EVIDENCE_ROOT = path.join(PRIVATE, 'publication-temporal');
const ADDRESS = '127.0.0.1:39016';
const NAMESPACE = 'postiz-adoption-20261107';
const PREFIX = 'postiz-publication-20261107-';
const PHASES = ['before-claim', 'after-send', 'after-confirm'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function databaseUrl() {
  const url = new URL(fs.readFileSync(DB_FILE, 'utf8').trim());
  assert.equal(url.protocol, 'postgresql:');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only task-owned loopback PostgreSQL is allowed');
  assert.equal(url.searchParams.get('schema'), 'postiz_acceptance_20261107');
  url.searchParams.set('connection_limit', '2');
  return url.toString();
}

function validateRunDirectory(directory) {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), EVIDENCE_ROOT);
  assert.match(path.basename(resolved), /^postiz-publication-20261107-\d+-\d+$/);
  return resolved;
}

function writePrivate(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

function appendPrivate(file, value) {
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
}

function readLines(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}

async function until(predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() >= deadline) throw new Error('Task-owned acceptance deadline exceeded');
    await delay(100);
  }
}

async function bounded(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Task-owned workflow result deadline exceeded')), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}

function safeError(error) {
  return { name: error?.name || 'Error', code: typeof error?.code === 'string' || typeof error?.code === 'number' ? error.code : undefined,
    message: String(error?.message || 'Acceptance failed').replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, '[private database]').slice(0, 300) };
}

async function workerMain(directory, phase, mode) {
  directory = validateRunDirectory(directory);
  assert.ok(PHASES.includes(phase));
  assert.ok(['crash', 'resume'].includes(mode));
  const config = JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8'));
  assert.equal(config.namespace, NAMESPACE);
  assert.ok(config.runId.startsWith(PREFIX));
  const postId = `${config.runId}-${phase}`;
  const queue = `${config.runId}-queue-${phase}`;
  const events = path.join(directory, `${phase}.events.jsonl`);
  const counter = path.join(directory, `${phase}.provider.jsonl`);
  const barrier = path.join(directory, `${phase}.barrier.json`);
  const db = new PrismaClient({ datasourceUrl: databaseUrl() });
  let native, worker;
  try {
    const { fixture, dependencyMocks } = require('../../tests/helpers/publication-v109.module.cjs');
    const { loadTypeScriptModule } = require('../../tests/helpers/load-ts-module.cjs');
    db.row = await db.post.findUniqueOrThrow({ where: { id: postId } });
    const f = fixture(db);
    const integration = await db.integration.findUniqueOrThrow({ where: { id: config.integrationId } });
    const receipts = [{ id: postId, postId: `${postId}-remote`, releaseURL: `https://synthetic.invalid/${postId}`, status: 'published' }];
    f.service.getPostById = (id, organizationId) => db.post.findFirst({ where: { id, organizationId }, include: { integration: true } });
    f.service.getPostsRecursively = async (id, _withIntegration, organizationId) => {
      assert.equal(id, postId); assert.equal(organizationId, config.organizationId);
      const post = await f.service.getPostById(id, organizationId);
      return post ? [post] : [];
    };
    const pause = async stage => {
      writePrivate(barrier, { phase, stage, attempt: Context.current().info.attempt, pid: process.pid });
      await new Promise(() => {}); // This exact task-owned process is SIGKILLed by its parent.
    };
    f.service.updateMedia = async () => {
      if (mode === 'crash' && phase === 'before-claim') await pause('preparing');
      return [];
    };
    const confirm = f.service.confirmPublicationV110.bind(f.service);
    f.service.confirmPublicationV110 = async (...args) => {
      const result = await confirm(...args);
      if (mode === 'crash' && phase === 'after-confirm') await pause('confirming');
      return result;
    };
    const provider = {
      editor: 'normal',
      post: async () => {
        appendPrivate(counter, { postId, attempt: Context.current().info.attempt, receivedAt: new Date().toISOString() });
        if (mode === 'crash' && phase === 'after-send') await pause('submitting');
        return receipts;
      },
      comment: async () => { throw new Error('Fixture has no comments'); },
    };
    const decorator = () => () => undefined;
    const { PostActivityV110 } = loadTypeScriptModule('apps/orchestrator/src/activities/post.activity.v110.ts', {
      ...dependencyMocks,
      '@nestjs/common': { ...dependencyMocks['@nestjs/common'], Inject: decorator },
      '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': loadTypeScriptModule('libraries/nestjs-libraries/src/temporal/temporal.search.attribute.ts'),
      // Context is the real SDK async-local activity context, never a mock.
    });
    const activity = new PostActivityV110(f.service, { getSocialIntegration: () => provider }, {}, f.temporal, f.activity.publicationGuard);
    native = await NativeConnection.connect({ address: ADDRESS });
    const invoke = async (...args) => {
      const info = Context.current().info;
      appendPrivate(events, { type: 'publication-start', mode, attempt: info.attempt, heartbeatTimeoutMs: info.heartbeatTimeoutMs,
        priorHeartbeat: info.heartbeatDetails ?? null, at: new Date().toISOString() });
      try { return await activity.postSocialV110(...args); }
      finally { appendPrivate(events, { type: 'publication-settled', mode, attempt: info.attempt }); }
    };
    worker = await Worker.create({ connection: native, namespace: NAMESPACE, taskQueue: queue,
      workflowBundle: { codePath: path.join(directory, 'workflow-bundle.js') },
      maxConcurrentActivityTaskExecutions: 2, maxConcurrentWorkflowTaskExecutions: 2,
      activities: {
        getPost: (organizationId, id) => f.service.getPostById(id, organizationId),
        getPostsListV110: activity.getPostsListV110.bind(activity), postSocialV110: invoke,
        postCommentV110: activity.postCommentV110.bind(activity),
        startPublicationStreakV110: async () => ({ started: true }),
        changeState: async () => { throw new Error('Unexpected fixture state transition'); },
        isCommentable: async () => false, inAppNotification: async () => {}, sendWebhooksV108: async () => {},
        internalPlugs: async () => [], globalPlugs: async () => [],
      },
    });
    process.on('message', message => { if (message?.type === 'shutdown') worker.shutdown(); });
    const running = worker.run();
    process.send?.({ type: 'ready', phase, mode });
    await running;
  } finally {
    await native?.close();
    await db.$disconnect();
    // The shutdown message listener otherwise keeps a completed child alive.
    if (process.connected) process.disconnect();
  }
}

async function main() {
  process.chdir(ROOT);
  assert.equal(process.version, 'v22.23.2', 'Run under the repository Node version');
  Runtime.install({ logger: new DefaultLogger('ERROR') });
  const runId = `${PREFIX}${Date.now()}-${process.pid}`;
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true, mode: 0o700 });
  const directory = path.join(EVIDENCE_ROOT, runId);
  fs.mkdirSync(directory, { mode: 0o700 });
  const config = { runId, namespace: NAMESPACE, organizationId: `${runId}-org`, integrationId: `${runId}-channel` };
  writePrivate(path.join(directory, 'config.json'), config);
  const db = new PrismaClient({ datasourceUrl: databaseUrl() });
  let connection;
  const children = new Set(), handles = [];
  const postIds = PHASES.map(phase => `${runId}-${phase}`);
  const spawnWorker = async (phase, mode) => {
    const log = fs.openSync(path.join(directory, `${phase}-${mode}.log`), 'a', 0o600);
    const child = fork(__filename, ['worker', directory, phase, mode], { cwd: ROOT, execArgv: [],
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test' }, stdio: ['ignore', log, log, 'ipc'] });
    fs.closeSync(log); children.add(child);
    child.once('exit', () => children.delete(child));
    await bounded(new Promise((resolve, reject) => {
      child.on('message', message => { if (message?.type === 'ready') resolve(); });
      child.once('error', reject); child.once('exit', code => reject(new Error(`Task worker exited before readiness (${code})`)));
    }), 40_000);
    return child;
  };
  const waitExit = child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve));
  const result = { status: 'RUNNING', boundary: 'Actual V110 SDK worker SIGKILL/heartbeat timeout/retry + real isolated PostgreSQL ledger; synthetic provider/auxiliaries', namespace: NAMESPACE, runId, scenarios: [] };
  try {
    await db.organization.create({ data: { id: config.organizationId, name: 'Task-owned synthetic publication acceptance' } });
    await db.integration.create({ data: { id: config.integrationId, organizationId: config.organizationId,
      internalId: `${runId}-internal`, name: 'Synthetic acceptance channel', providerIdentifier: 'synthetic', type: 'social', token: 'inert-local-fixture' } });
    await db.post.createMany({ data: postIds.map(id => ({ id, organizationId: config.organizationId, integrationId: config.integrationId,
      state: 'QUEUE', content: 'Synthetic publication acceptance', group: runId, settings: '{}', image: '[]', publishDate: new Date('2000-01-01T00:00:00Z') })) });
    connection = await Connection.connect({ address: ADDRESS, connectTimeout: '15 seconds' });
    try { await connection.workflowService.describeNamespace({ namespace: NAMESPACE }); }
    catch (error) {
      if (error.code !== 5) throw error;
      await connection.workflowService.registerNamespace({ namespace: NAMESPACE, workflowExecutionRetentionPeriod: { seconds: 86400 } });
    }
    const client = new Client({ connection, namespace: NAMESPACE });
    const bundle = await bundleWorkflowCode({ workflowsPath: path.join(ROOT, 'apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.1.0.ts'), logger: new DefaultLogger('ERROR') });
    fs.writeFileSync(path.join(directory, 'workflow-bundle.js'), bundle.code, { mode: 0o600 });
    const firstWorkers = await Promise.all(PHASES.map(phase => spawnWorker(phase, 'crash')));
    for (const phase of PHASES) {
      const queue = `${runId}-queue-${phase}`;
      handles.push(await client.workflow.start('postWorkflowV110', { workflowId: `${runId}-workflow-${phase}`, taskQueue: queue,
        args: [{ taskQueue: queue, postId: `${runId}-${phase}`, organizationId: config.organizationId }] }));
    }
    await Promise.all(PHASES.map(phase => until(() => fs.existsSync(path.join(directory, `${phase}.barrier.json`)), 45_000)));
    // Observe the server's actual heartbeat receipt before killing each owned worker.
    await Promise.all(handles.map(handle => until(async () => (await handle.describe()).raw.pendingActivities?.some(item => item.heartbeatDetails?.payloads?.length), 30_000)));
    const before = await db.post.findMany({ where: { organizationId: config.organizationId, id: { in: postIds } } });
    for (let index = 0; index < PHASES.length; index++) {
      const phase = PHASES[index], row = before.find(post => post.id === `${runId}-${phase}`);
      if (phase === 'before-claim') { assert.equal(row.publicationJournal, null); assert.equal(row.state, 'QUEUE'); }
      else assert.equal(row.publicationJournal.attempts[0].status, phase === 'after-confirm' ? 'confirmed' : 'pending');
      firstWorkers[index].kill('SIGKILL');
    }
    await Promise.all(firstWorkers.map(waitExit));
    writePrivate(path.join(directory, 'crash-observed.json'), { at: new Date().toISOString(), cases: PHASES.map(phase => ({ phase, sends: readLines(path.join(directory, `${phase}.provider.jsonl`)).length })) });
    process.stdout.write('Task-owned workers killed at all three durable boundaries; waiting for real heartbeat timeout/retry.\n');
    const recoveryWorkers = await Promise.all(PHASES.map(phase => spawnWorker(phase, 'resume')));
    const outcomes = await bounded(Promise.all(handles.map(handle => handle.result())), 270_000);
    const after = await db.post.findMany({ where: { organizationId: config.organizationId, id: { in: postIds } } });
    for (let index = 0; index < PHASES.length; index++) {
      const phase = PHASES[index], row = after.find(post => post.id === `${runId}-${phase}`);
      const sends = readLines(path.join(directory, `${phase}.provider.jsonl`));
      const starts = readLines(path.join(directory, `${phase}.events.jsonl`)).filter(event => event.type === 'publication-start');
      assert.equal(sends.length, 1, 'Every scenario must have exactly one total provider invocation');
      assert.ok(starts.some(event => event.mode === 'resume' && event.attempt >= 2), 'The real server must retry the lost activity on a fresh worker');
      assert.ok(starts.every(event => event.heartbeatTimeoutMs === 60_000));
      assert.equal(row.state, phase === 'after-send' ? 'ERROR' : 'PUBLISHED');
      assert.equal(row.publicationJournal.attempts[0].status, phase === 'after-send' ? 'pending' : 'confirmed');
      assert.equal(outcomes[index], phase === 'after-send' ? false : undefined);
      const history = await handles[index].fetchHistory();
      writePrivate(path.join(directory, `${phase}.history.json`), history);
      result.scenarios.push({ phase, providerInvocations: sends.length, state: row.state,
        journal: row.publicationJournal.attempts[0].status, attempts: starts.map(event => ({ attempt: event.attempt, mode: event.mode, priorHeartbeat: event.priorHeartbeat })),
        confirmedRemoteIdPresent: !!row.releaseId, workflowResult: outcomes[index] === false ? 'uncertain' : 'completed', historyEvents: history.events.length });
    }
    for (const worker of recoveryWorkers) worker.send({ type: 'shutdown' });
    await bounded(Promise.all(recoveryWorkers.map(waitExit)), 30_000);
    result.status = 'PASS';
    writePrivate(path.join(directory, 'receipt.json'), result);
    process.stdout.write(JSON.stringify({ ...result, evidenceDirectory: directory }) + '\n');
  } catch (error) {
    result.status = 'FAIL'; result.error = safeError(error);
    writePrivate(path.join(directory, 'receipt.json'), result);
    throw error;
  } finally {
    for (const child of [...children]) { child.kill('SIGKILL'); await waitExit(child); }
    for (const handle of handles) await handle.terminate('Exact task-owned acceptance cleanup').catch(() => {});
    // Exact fixture IDs only; never clear a schema, namespace, shared queue or foreign fixture.
    await db.post.deleteMany({ where: { id: { in: postIds }, organizationId: config.organizationId } });
    await db.integration.deleteMany({ where: { id: config.integrationId, organizationId: config.organizationId } });
    await db.organization.deleteMany({ where: { id: config.organizationId } });
    await db.$disconnect(); await connection?.close();
  }
}

if (process.argv[2] === '--help') {
  process.stdout.write('Run with repository Node22.23.2. Uses only the fixed private loopback DB file, isolated acceptance schema and task Temporal namespace/queues; writes private evidence.\n');
} else if (process.argv[2] === 'worker') {
  Runtime.install({ logger: new DefaultLogger('ERROR') });
  workerMain(...process.argv.slice(3)).catch(error => { process.stderr.write(JSON.stringify(safeError(error)) + '\n'); process.exitCode = 1; });
} else {
  main().catch(error => { process.stderr.write(JSON.stringify(safeError(error)) + '\n'); process.exitCode = 1; });
}
