'use strict';

// Explicit local-only proof, outside Jest. Cached image and inert activities.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { Worker, NativeConnection, Runtime, DefaultLogger, bundleWorkflowCode } = require('@temporalio/worker');
const { Connection, Client } = require('@temporalio/client');
const { ApplicationFailure, defaultPayloadConverter } = require('@temporalio/common');
const { temporal } = require('@temporalio/proto');
const { loadTypeScriptModule } = require('../../../tests/helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '../../..');
const baseline = '31e7170fba4edb26214a8618dca62ebdb0aeff13';
const image = 'sha256:cf86707827fac99e4d1c4a47dc11b105382d796199c7bd41fb3213fb0471628e';
const owner = randomUUID();
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000 }).trim();
const inventory = () => docker('ps', '-aq', '--no-trunc').split('\n').filter(Boolean).sort();
const hash = data => createHash('sha256').update(data).digest('hex');
const save = (file, data) => fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2) + '\n');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const workerOptions = { maxCachedWorkflows: 2, workflowThreadPoolSize: 1,
  maxConcurrentWorkflowTaskExecutions: 2, maxConcurrentActivityTaskExecutions: 2,
  maxConcurrentWorkflowTaskPolls: 2, maxConcurrentActivityTaskPolls: 1,
  shutdownGraceTime: '1 second', shutdownForceTime: '10 seconds' };

async function until(check, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error('Owned native fixture timed out');
    await wait(50);
  }
}

async function bundle(workflowsPath) {
  return bundleWorkflowCode({ workflowsPath, webpackConfigHook: config => {
    config.resolve.alias = { ...config.resolve.alias,
      '@contentfactory/orchestrator': path.join(root, 'apps/orchestrator/src'),
      '@contentfactory/nestjs-libraries': path.join(root, 'libraries/nestjs-libraries/src'),
      '@contentfactory/helpers': path.join(root, 'libraries/helpers/src') };
    return config;
  } });
}

const email = n => ({ to: 'synthetic@example.test', subject: n, html: '<p/>',
  language: 'ru', replyTo: 'reply@example.test', addTo: 'bottom' });

function emailService(client, requests) {
  class EmptyProvider { name = 'synthetic'; validateEnvKeys = []; }
  const { EmailService } = loadTypeScriptModule('libraries/nestjs-libraries/src/services/email.service.ts', {
    '@contentfactory/nestjs-libraries/emails/email.interface': { EmailSendError: class extends Error {} },
    '@contentfactory/nestjs-libraries/emails/empty.provider': { EmptyProvider },
    '@contentfactory/nestjs-libraries/emails/resend.provider': { ResendProvider: EmptyProvider },
    '@contentfactory/nestjs-libraries/emails/node.mailer.provider': { NodeMailerProvider: EmptyProvider },
    '@contentfactory/helpers/utils/timer': {},
    '@contentfactory/nestjs-libraries/locale/backend-strings': {},
    '@contentfactory/nestjs-libraries/emails/email.template': {},
  });
  const previous = process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_PROVIDER;
  try {
    return new EmailService({ client: { getRawClient: () => ({ workflow: {
      signalWithStart: (type, options) => {
        requests.push({ type, workflowId: options.workflowId, policy: options.workflowIdConflictPolicy });
        return client.workflow.signalWithStart(type, options);
      },
    } }) } });
  } finally {
    if (previous === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = previous;
  }
}

async function main() {
  Runtime.install({ logger: new DefaultLogger('ERROR') });
  const oldIndex = execFileSync('git', ['show', baseline + ':apps/orchestrator/src/workflows/index.ts'], { cwd: root, encoding: 'utf8' });
  const oldFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline,
    'apps/orchestrator/src/activities', 'apps/orchestrator/src/workflows'], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(file => file.endsWith('.ts') && !file.endsWith('/index.ts'));
  assert.equal(oldFiles.length, 34);
  for (const file of oldFiles) {
    assert.equal(hash(fs.readFileSync(path.join(root, file))),
      hash(execFileSync('git', ['show', baseline + ':' + file], { cwd: root })), 'Historical source changed: ' + file);
  }
  const oldPath = path.join(__dirname, 'baseline-workflows-index.local.ts');
  fs.writeFileSync(oldPath, oldIndex.replace(/from '\.\//g, "from '" + path.join(root, 'apps/orchestrator/src/workflows') + '/'));
  const oldBundle = await bundle(oldPath);
  const currentBundle = await bundle(path.join(root, 'apps/orchestrator/src/workflows/index.ts'));
  fs.writeFileSync(path.join(__dirname, 'baseline-workflow-bundle.local.js'), oldBundle.code);
  fs.writeFileSync(path.join(__dirname, 'workflow-bundle.local.js'), currentBundle.code);
  const before = inventory();
  save('containers-before.local.json', before);
  const proof = { schema: 'cf-periodic-history-native/v1', status: 'running', baseline, image, owner,
    sdk: require('@temporalio/worker/package.json').version,
    bundles: { baseline: hash(oldBundle.code), current: hash(currentBundle.code) },
    historicalBodiesUnchanged: oldFiles.length, histories: [], selectorRequests: [],
    boundary: 'synthetic loopback server/activities; hourly bounds use separate virtual tests; no live history, provider, database or source push' };
  let container, native, connection;
  try {
    container = docker('run', '-d', '--name', 'cf-dbxe20-' + owner,
      '--label', 'cf.stage=dbxe.20', '--label', 'cf.owner=' + owner,
      '--memory', '768m', '--cpus', '1', '-p', '127.0.0.1::7233', image,
      'server', 'start-dev', '--ip', '0.0.0.0', '--port', '7233', '--headless', '--log-level', 'error');
    const inspect = JSON.parse(docker('inspect', container))[0];
    const port = inspect.NetworkSettings.Ports['7233/tcp'][0];
    assert.equal(port.HostIp, '127.0.0.1');
    const address = '127.0.0.1:' + port.HostPort;
    await until(async () => {
      try { native = await NativeConnection.connect({ address, connectTimeout: '1 second' }); return true; }
      catch { return false; }
    });
    connection = await Connection.connect({ address });
    const client = new Client({ connection });
    const mailCalls = [];
    const newerId = 'synthetic-mail-v3-' + owner;
    const activities = {
      autoPost: async () => {}, autoPostDraftV2: async () => {},
      searchForMissingThreeHoursPosts: async () => {}, searchForMissingThreeHoursPostsV108: async () => {},
      sendEmailV2: async (...args) => {
        mailCalls.push(args);
        if (args[1] === 'new-29') {
          const handle = client.workflow.getHandle(newerId);
          await handle.signal('sendEmail', { ...email('boundary-top'), addTo: 'top' });
          await handle.signal('sendEmail', email('boundary-tail'));
        }
        throw ApplicationFailure.nonRetryable('Synthetic provider failure', 'SyntheticMailFailure');
      },
    };
    async function capture(handle, name) {
      const history = await handle.fetchHistory();
      const json = temporal.api.history.v1.History.toObject(history, { json: true, longs: String, enums: String, bytes: String });
      const filename = 'history-' + name + '.local.json';
      save(filename, json);
      await Worker.runReplayHistory({ ...workerOptions, workflowBundle: currentBundle }, history, name);
      proof.histories.push({ name, workflowType: history.events[0].workflowExecutionStartedEventAttributes.workflowType.name,
        events: history.events.length, sha256: hash(fs.readFileSync(path.join(__dirname, filename))), replay: 'pass' });
      return history;
    }

    const legacyWorker = await Worker.create({ ...workerOptions, connection: native, taskQueue: 'main', workflowBundle: oldBundle, activities });
    await legacyWorker.runUntil(async () => {
      for (const [type, args] of [
        ['autoPostWorkflow', [{ id: 'synthetic-auto', immediately: true }]],
        ['autoPostDraftV2Workflow', [{ id: 'synthetic-draft', organizationId: 'synthetic-org', immediately: true }]],
        ['missingPostWorkflow', []], ['missingPostWorkflowV108', []],
      ]) {
        const handle = await client.workflow.start(type, { workflowId: 'synthetic-' + type + '-' + owner, taskQueue: 'main', args });
        await until(async () => (await handle.fetchHistory()).events.some(event => event.timerStartedEventAttributes));
        await handle.terminate('Owned local compatibility fixture completed');
        await capture(handle, type);
      }
      // Real source consumer selects V3, but the server must signal existing V2.
      const legacy = await client.workflow.start('sendEmailWorkflowV2', { workflowId: 'send_email_v2',
        taskQueue: 'main', args: [{ queue: [email('legacy-0')] }] });
      await until(() => mailCalls.some(args => args[1] === 'legacy-0'));
      const service = emailService(client, proof.selectorRequests);
      await service.sendEmail('synthetic@example.test', 'legacy-new-selector', '<p/>', 'top', 'reply@example.test', 'ru');
      assert.equal((await legacy.describe()).type, 'sendEmailWorkflowV2');
      await until(async () => {
        const history = await legacy.fetchHistory();
        return history.events.filter(event => event.activityTaskFailedEventAttributes).length === 2;
      });
      assert.equal(mailCalls.filter(args => args[1].startsWith('legacy')).length, 2);
      assert.equal(mailCalls[1][4], 'ru');
      await legacy.terminate('Owned local existing-consumer fixture completed');
      await capture(legacy, 'sendEmailWorkflowV2');
      proof.existingMailTypePreserved = true;
    });

    const currentWorker = await Worker.create({ ...workerOptions, connection: native, taskQueue: 'main', workflowBundle: currentBundle, activities });
    await currentWorker.runUntil(async () => {
      const handle = await client.workflow.start('sendEmailWorkflowV3', { workflowId: newerId, taskQueue: 'main',
        args: [{ queue: Array.from({ length: 32 }, (_, n) => email('new-' + n)) }] });
      const first = client.workflow.getHandle(newerId, handle.firstExecutionRunId);
      let continuation;
      await until(async () => {
        const history = await first.fetchHistory();
        continuation = history.events.find(event => event.workflowExecutionContinuedAsNewEventAttributes)?.workflowExecutionContinuedAsNewEventAttributes;
        return !!continuation;
      });
      const input = defaultPayloadConverter.fromPayload(continuation.input.payloads[0]);
      assert.deepEqual(input.queue, [{ ...email('boundary-top'), addTo: 'top' }, email('new-30'), email('new-31'), email('boundary-tail')]);
      const second = client.workflow.getHandle(newerId, continuation.newExecutionRunId);
      await until(async () => {
        const history = await second.fetchHistory();
        return history.events.filter(event => event.timerFiredEventAttributes).length === 4;
      });
      const currentCalls = mailCalls.filter(args => !args[1].startsWith('legacy'));
      assert.equal(currentCalls.length, 34);
      assert.equal(new Set(currentCalls.map(args => args[1])).size, 34);
      assert.deepEqual(currentCalls.slice(30).map(args => args[1]), input.queue.map(email => email.subject));
      await second.terminate('Owned local mail-continuation fixture completed');
      const firstHistory = await capture(first, 'sendEmailWorkflowV3-first');
      const nextHistory = await capture(second, 'sendEmailWorkflowV3-next');
      assert.equal(firstHistory.events.filter(event => event.activityTaskFailedEventAttributes).length, 30);
      assert.equal(nextHistory.events[0].workflowExecutionStartedEventAttributes.workflowType.name, 'sendEmailWorkflowV3');
      proof.mail = { failedAttemptsBeforeRotation: 30, queueAtRotation: input.queue.length,
        attemptsAcrossRuns: currentCalls.length, duplicateSubjects: 0,
        sameWorkflowId: true, differentRunIds: handle.firstExecutionRunId !== continuation.newExecutionRunId,
        taskQueue: nextHistory.events[0].workflowExecutionStartedEventAttributes.taskQueue.name,
        boundarySignals: 2, fiveActivityArgsAndLanguage: currentCalls.every(args => args.length === 5 && args[4] === 'ru') };
      assert.equal(proof.mail.taskQueue, 'main');
      assert.equal(proof.mail.fiveActivityArgsAndLanguage, true);
    });
    proof.status = 'pass';
  } catch (error) {
    proof.status = 'fail'; proof.error = String(error);
    if (container) fs.writeFileSync(path.join(__dirname, 'temporal-server.local.log'), docker('logs', container));
    throw error;
  } finally {
    try {
      if (connection) await connection.close();
      if (native) await native.close();
    } finally {
      if (container) {
        const labels = JSON.parse(docker('inspect', '--format', '{{json .Config.Labels}}', container));
        assert.equal(labels['cf.owner'], owner); assert.equal(labels['cf.stage'], 'dbxe.20');
        docker('rm', '-f', container);
      }
      const after = inventory();
      proof.cleanup = { ownedRemoved: !after.includes(container), beforeCount: before.length, afterCount: after.length,
        preexistingRemoved: before.filter(id => !after.includes(id)), foreignAdded: after.filter(id => !before.includes(id)) };
      save('containers-after.local.json', after);
      save('native-acceptance.local.json', proof);
      assert.deepEqual(proof.cleanup.preexistingRemoved, []);
    }
  }
  console.log(JSON.stringify(proof));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
