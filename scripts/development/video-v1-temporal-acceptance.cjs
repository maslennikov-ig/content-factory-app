#!/usr/bin/env node
'use strict';
/** Disposable local Temporal + real workflow/activity/service/Prisma/storage.
 * Only paid provider/text HTTP is synthetic. Never connect to a shared queue. */
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client, Connection } = require('@temporalio/client');
const { Worker, NativeConnection, Runtime, DefaultLogger, bundleWorkflowCode } = require('@temporalio/worker');
const { create, assertDisposableDatabaseV1 } = require('../../tests/helpers/video-domain-v1.fixture.cjs');
const { loadTypeScriptModule } = require('../../tests/helpers/load-ts-module.cjs');

const ROOT = path.resolve(__dirname, '../..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Local Temporal acceptance deadline exceeded');
    await delay(100);
  }
}

async function main() {
  assertDisposableDatabaseV1(process.env.CF_VIDEO_DATABASE_URL);
  const address = process.env.CF_VIDEO_TEMPORAL_ADDRESS || '';
  if (process.env.CF_VIDEO_TEMPORAL_DISPOSABLE !== '1' || !/^127\.0\.0\.1:[1-9]\d{3,4}$/.test(address)) {
    throw new Error('Requires CF_VIDEO_TEMPORAL_DISPOSABLE=1 and a dedicated loopback Temporal dev server');
  }
  Runtime.install({ logger: new DefaultLogger('WARN') });
  let f, connection, native, worker, running;
  const handles = [];
  try {
    connection = await Connection.connect({ address, connectTimeout: '15 seconds' });
    native = await NativeConnection.connect({ address });
    const client = new Client({ connection, namespace: 'default' });
    f = await create(process.env.CF_VIDEO_DATABASE_URL);
    const { VideoExecutionV1 } = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/video-execution.v1.ts', {
      // Constructor type token only; no domain behavior is substituted here.
      './video-job.service': { VideoJobService: f.service.constructor },
    });
    const starter = new VideoExecutionV1({ client: { getRawClient: () => client } });
    f.execution.start = starter.start.bind(starter);
    const { VideoGenerationActivityV1 } = loadTypeScriptModule('apps/orchestrator/src/activities/video-generation.activity.v1.ts', {
      '@contentfactory/nestjs-libraries/videos/video-job.service': { VideoJobService: f.service.constructor },
    });
    const workflowBundle = await bundleWorkflowCode({
      workflowsPath: path.join(ROOT, 'apps/orchestrator/src/workflows/video-generation.workflow.v1.ts'),
    });
    const newWorker = async () => {
      const activity = new VideoGenerationActivityV1(f.service);
      return Worker.create({
        connection: native, namespace: 'default', taskQueue: 'main', workflowBundle,
        activities: {
          stepVideoGenerationV1: activity.stepVideoGenerationV1.bind(activity),
          expireVideoGenerationV1: activity.expireVideoGenerationV1.bind(activity),
        },
      });
    };
    worker = await newWorker();
    running = worker.run();
    const jobs = [];
    for (const presenter of [false, true]) {
      const ready = await f.ready({ presenter });
      const job = await f.service.launch(f.org.id, f.user.id, ready.launch);
      jobs.push(job);
      handles.push(client.workflow.getHandle(`video-v1:${job.id}`));
    }
    await waitFor(async () => (await f.db.videoGenerationJob.count({
      where: { id: { in: jobs.map((job) => job.id) }, state: 'queued' },
    })) === 2, 25_000);
    const before = await f.db.videoGenerationJob.findMany({
      where: { id: { in: jobs.map((job) => job.id) } }, orderBy: { id: 'asc' },
      select: { id: true, state: true, receipt: true },
    });
    assert.equal(f.transport.submits.length, 2);
    worker.shutdown();
    await running;
    running = undefined;
    // New service and worker instances; PostgreSQL and workflow history survive.
    f.restart();
    worker = await newWorker();
    let timer;
    try {
      const results = await worker.runUntil(async () => Promise.race([
        Promise.all(handles.map((handle) => handle.result())),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Workflow restart acceptance timeout')), 90_000); }),
      ]));
      assert.deepEqual(results, [{ state: 'completed', done: true }, { state: 'completed', done: true }]);
    } finally { clearTimeout(timer); }
    const after = await f.db.videoGenerationJob.findMany({
      where: { id: { in: jobs.map((job) => job.id) } }, orderBy: { id: 'asc' },
      select: { id: true, state: true, receipt: true, resultMediaId: true },
    });
    assert.equal(f.transport.submits.length, 2, 'Worker restart must not submit again');
    for (let index = 0; index < after.length; index++) {
      assert.deepEqual(after[index].receipt, before[index].receipt);
      assert.equal(after[index].state, 'completed');
      assert.ok(after[index].resultMediaId);
      const download = await f.service.download(f.org.id, after[index].id);
      assert.ok(Buffer.isBuffer(download.bytes));
      assert.deepEqual(download.bytes, f.mp4);
    }
    // The deadline path must keep a durable execution while another activity
    // owns the job lease. No third generation is submitted in this case.
    const expiryReady = await f.ready();
    f.execution.start = async () => {};
    const expiryJob = await f.service.launch(f.org.id, f.user.id, expiryReady.launch);
    f.execution.start = starter.start.bind(starter);
    assert.equal(await f.repository.claim(f.org.id, expiryJob.id, 'synthetic-busy-owner'), true);
    const expiryHandle = await client.workflow.start('videoGenerationWorkflowV1', {
      workflowId: `video-v1:${expiryJob.id}`, taskQueue: 'main',
      args: [{organizationId: f.org.id, jobId: expiryJob.id}, Date.now() - 1],
    });
    handles.push(expiryHandle);
    const originalRun = (await expiryHandle.describe()).runId;
    worker = await newWorker();
    const observer = client.workflow.getHandle(`video-v1:${expiryJob.id}`);
    let expiryTimer;
    try {
      const expired = await worker.runUntil(async () => Promise.race([
        (async () => {
          await waitFor(async () => (await observer.describe()).runId !== originalRun, 30_000);
          const pending = await f.db.videoGenerationJob.findUnique({where: {id: expiryJob.id}});
          assert.equal(pending.state, 'accepted');
          await f.db.videoGenerationJob.update({where: {id: expiryJob.id}, data: {leaseUntil: new Date(Date.now() - 1000)}});
          return expiryHandle.result();
        })(),
        new Promise((_, reject) => {expiryTimer = setTimeout(() => reject(new Error('Busy-lease expiry acceptance timeout')), 50_000);}),
      ]));
      assert.deepEqual(expired, {state: 'uncertain', done: true});
      assert.equal(f.transport.submits.length, 2);
    } finally {clearTimeout(expiryTimer);}
    const receipt = {
      schema: 'video-v1-temporal-acceptance/v1', result: 'PASS',
      boundary: 'Dedicated loopback Temporal server and real SDK worker/workflow/activity/service/PostgreSQL/storage; synthetic provider/text HTTP',
      workerRestartedAfter: 'both provider receipts persisted, state queued',
      workflowCount: 3, modes: ['clip', 'presenter'], submitCountBeforeRestart: 2,
      submitCountAfterRestart: f.transport.submits.length,
      unchangedProviderReceipts: true, ownedMedia: 2, downloadBytesMatch: true,
      busyLeaseAtDeadline: {continuedAsNew: true, terminalStateAfterLeaseRelease: 'uncertain', extraSubmits: 0},
      providerQuality: 'UNKNOWN', providerActualCost: 'UNKNOWN',
    };
    if (process.env.CF_VIDEO_TEMPORAL_EVIDENCE) {
      fs.writeFileSync(path.resolve(process.env.CF_VIDEO_TEMPORAL_EVIDENCE), JSON.stringify(receipt, null, 2) + '\n');
    }
    process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
  } finally {
    if (running) { worker.shutdown(); await running.catch(() => {}); }
    for (const handle of handles) await handle.terminate('Disposable local acceptance cleanup').catch(() => {});
    if (native) await native.close();
    if (connection) await connection.close();
    if (f) await f.close();
  }
}
main().catch((error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
