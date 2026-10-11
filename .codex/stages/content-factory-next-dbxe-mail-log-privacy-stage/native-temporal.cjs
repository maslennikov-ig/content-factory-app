'use strict';

// Owned loopback SDK fixture; mail activities use the actual adapters and fakes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { Worker, NativeConnection, Runtime, DefaultLogger, bundleWorkflowCode } = require('@temporalio/worker');
const { Client, Connection } = require('@temporalio/client');
const { ApplicationFailure } = require('@temporalio/common');
const { Context } = require('@temporalio/activity');
const { temporal } = require('@temporalio/proto');
const { loadTypeScriptModule } = require('../../../tests/helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '../../..');
const baseline = process.argv.includes('--baseline');
const owner = randomUUID();
const image = 'sha256:cf86707827fac99e4d1c4a47dc11b105382d796199c7bd41fb3213fb0471628e';
const recipient = 'native-queue-recipient-sentinel@example.invalid';
const subjectMarker = 'native-queue-subject-sentinel';
const body = 'native-queue-body-sentinel';
const cookie = 'native-queue-cookie-sentinel';
const sentinels = [recipient, subjectMarker, body, cookie];
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000 }).trim();
const inventory = () => docker('ps', '-aq', '--no-trunc').split('\n').filter(Boolean).sort();
const hash = value => createHash('sha256').update(value).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(__dirname, name), JSON.stringify(value, null, 2) + '\n');
const fixtureName = name => baseline ? 'baseline-' + name : name;
const interceptor = path.join(root, 'libraries/nestjs-libraries/src/temporal/mail-log-privacy.workflow.ts');
const captured = [];
for (const stream of [process.stdout, process.stderr]) {
  const original = stream.write.bind(stream);
  stream.write = (chunk, ...args) => { captured.push(String(chunk)); return original(chunk, ...args); };
}
async function until(check, timeout = 45000) {
  const end = Date.now() + timeout;
  while (!await check()) {
    if (Date.now() >= end) throw new Error('Owned mail privacy fixture timed out');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function main() {
  if (baseline) Runtime.install({ logger: new DefaultLogger() });
  else loadTypeScriptModule('libraries/nestjs-libraries/src/temporal/mail-log-privacy.ts').installMailLogPrivacy();
  const source = path.join(__dirname, 'workflows.local.ts');
  fs.writeFileSync(source, [
    ...['', '.v2', '.v3'].map((suffix, index) => `export { sendEmailWorkflow${index ? 'V' + (index + 1) : ''} } from ${JSON.stringify(path.join(root, 'apps/orchestrator/src/workflows/send.email.workflow' + suffix + '.ts'))};`),
    `import { log, proxyActivities } from '@temporalio/workflow';`,
    `export async function unrelatedLogProbe() { console.log('cf-dbxe37-unrelated-console', { preserved: true }); log.warn('cf-dbxe37-unrelated-sdk', { preserved: true }); await proxyActivities({ startToCloseTimeout: '10 seconds' }).nonMailProbe(); return 'ok'; }`,
  ].join('\n'));
  const bundle = await bundleWorkflowCode({ workflowsPath: source,
    workflowInterceptorModules: baseline ? [] : [interceptor],
    webpackConfigHook: config => {
      config.resolve.alias = { ...config.resolve.alias,
        '@contentfactory/orchestrator': path.join(root, 'apps/orchestrator/src'),
        '@contentfactory/nestjs-libraries': path.join(root, 'libraries/nestjs-libraries/src'),
        '@contentfactory/helpers': path.join(root, 'libraries/helpers/src') };
      return config;
    },
  });
  fs.writeFileSync(path.join(__dirname, fixtureName('workflow-bundle.local.js')), bundle.code);
  const before = inventory(); save(fixtureName('containers-before.local.json'), before);
  const proof = { schema: 'mail-queue-log-privacy-native/v1', status: 'running', baseline,
    owner, image, sdk: require('@temporalio/worker/package.json').version, bundleSha256: hash(bundle.code),
    boundary: 'Synthetic loopback SDK server, real historical bodies/activity adapters, fake delivery only; no live messages/migration/collector/deployment.', histories: [] };
  save(fixtureName('native-start.local.json'), { owner, baseline, image, pid: process.pid });
  const options = { taskQueue: 'main', workflowBundle: bundle,
    maxCachedWorkflows: 3, workflowThreadPoolSize: 1, reuseV8Context: true,
    maxConcurrentWorkflowTaskExecutions: 3, maxConcurrentWorkflowTaskPolls: 2,
    maxConcurrentActivityTaskExecutions: 3, maxConcurrentActivityTaskPolls: 1,
    shutdownGraceTime: '1 second', shutdownForceTime: '10 seconds' };
  let container, native, connection;
  try {
    assert.equal(docker('image', 'inspect', '--format', '{{.Id}}', image), image);
    container = docker('run', '-d', '--name', 'cf-dbxe37-' + owner,
      '--label', 'cf.stage=dbxe.37', '--label', 'cf.owner=' + owner,
      '--memory', '768m', '--cpus', '1', '-p', '127.0.0.1::7233', image,
      'server', 'start-dev', '--ip', '0.0.0.0', '--port', '7233', '--headless', '--log-level', 'error');
    save(fixtureName('native-start.local.json'), { owner, baseline, image, pid: process.pid, container });
    const port = JSON.parse(docker('inspect', container))[0].NetworkSettings.Ports['7233/tcp'][0];
    assert.equal(port.HostIp, '127.0.0.1');
    const address = '127.0.0.1:' + port.HostPort;
    await until(async () => {
      try { native = await NativeConnection.connect({ address, connectTimeout: '1 second' }); return true; }
      catch { return false; }
    });
    connection = await Connection.connect({ address });
    const client = new Client({ connection });
    const calls = [];
    const interfaceModule = loadTypeScriptModule('libraries/nestjs-libraries/src/emails/email.interface.ts');
    const { EmailSendError } = interfaceModule;
    const mocks = {
      '@contentfactory/nestjs-libraries/services/email.service': { EmailService: class {} },
      '@contentfactory/nestjs-libraries/emails/email.interface': interfaceModule,
      '@contentfactory/nestjs-libraries/database/prisma/users/users.service': { UsersService: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': { OrganizationService: class {} },
    };
    const { EmailActivity } = loadTypeScriptModule('apps/orchestrator/src/activities/email.activity.ts', mocks);
    const { EmailActivityV2 } = loadTypeScriptModule('apps/orchestrator/src/activities/email.activity.v2.ts', mocks);
    const service = { sendEmailSync: async (...args) => {
      const { workflowType, attempt } = Context.current().info;
      calls.push({ workflowType, attempt, args });
      assert.equal(args[0], recipient); assert.equal(args[2], body);
      Context.current().log.info(body, { recipient, subject: args[1], headers: { cookie } });
      if (args[1].endsWith('-permanent')) {
        if (workflowType === 'sendEmailWorkflow') throw ApplicationFailure.nonRetryable(sentinels.join(' '), subjectMarker, { recipient, body, cookie });
        throw new EmailSendError(sentinels.join(' '), false);
      }
      if (args[1].endsWith('-transient') && attempt === 1) {
        throw Object.assign(new Error(sentinels.join(' ')), { cause: new Error(cookie), details: [{ recipient, body }] });
      }
    } };
    const v1 = new EmailActivity(service, {}, {}), v2 = new EmailActivityV2(service);
    const activities = {
      sendEmail: (...args) => v1.sendEmail(...args), sendEmailV2: (...args) => v2.sendEmailV2(...args),
      nonMailProbe: async () => Context.current().log.warn('cf-dbxe37-unrelated-activity', { preserved: true }),
    };
    const handles = [];
    const mail = suffix => ({ to: recipient, subject: subjectMarker + suffix, html: body, replyTo: recipient, language: 'ru', addTo: 'bottom' });
    const worker = await Worker.create({ ...options, connection: native, activities });
    await worker.runUntil(async () => {
      for (const type of ['sendEmailWorkflow', 'sendEmailWorkflowV2', 'sendEmailWorkflowV3']) {
        const id = type === 'sendEmailWorkflowV2' ? 'send_email_v2' : 'cf-dbxe37-' + type + '-' + owner;
        handles.push({ type, handle: await client.workflow.start(type, {
          taskQueue: 'main', workflowId: id,
          args: [{ queue: [mail('-permanent'), mail('-transient'), mail('-success')] }],
        }) });
      }
      const unrelated = await client.workflow.start('unrelatedLogProbe', { taskQueue: 'main', workflowId: 'cf-dbxe37-other-' + owner });
      await until(async () => (await unrelated.describe()).status.name === 'COMPLETED');
      assert.equal(await unrelated.result(), 'ok');
      await until(() => calls.length === 12);
      for (const { type, handle } of handles) {
        await until(async () => (await handle.fetchHistory()).events.filter(e => e.activityTaskCompletedEventAttributes).length === 2);
        const own = calls.filter(call => call.workflowType === type);
        assert.deepEqual(own.map(call => [call.args[1].slice(subjectMarker.length), call.attempt]), [
          ['-permanent', 1], ['-transient', 1], ['-transient', 2], ['-success', 1],
        ]);
      }
    });
    // No worker is running now: admission appends a pending letter to existing V2.
    const { EmailService } = loadTypeScriptModule('libraries/nestjs-libraries/src/services/email.service.ts', {
      '@contentfactory/nestjs-libraries/emails/resend.provider': { ResendProvider: class {} },
      '@contentfactory/nestjs-libraries/emails/node.mailer.provider': { NodeMailerProvider: class {} },
    });
    const previous = process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_PROVIDER;
    try {
      await new EmailService({ client: { getRawClient: () => client } }).sendEmail(
        recipient, subjectMarker + '-after-restart', body, 'bottom', recipient, 'ru');
    } finally { if (previous === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = previous; }
    assert.equal((await handles[1].handle.describe()).type, 'sendEmailWorkflowV2');
    assert.equal(calls.length, 12);
    const restarted = await Worker.create({ ...options, connection: native, activities });
    await restarted.runUntil(async () => {
      await until(() => calls.length === 13);
      await until(async () => (await handles[1].handle.fetchHistory()).events.filter(e => e.activityTaskCompletedEventAttributes).length === 3);
      assert.equal(calls[12].args[1], subjectMarker + '-after-restart');
      assert.equal(calls[12].workflowType, 'sendEmailWorkflowV2');
      for (const { handle } of handles) await handle.terminate('Owned synthetic fixture completed');
    });
    for (const { type, handle } of handles) {
      const history = await handle.fetchHistory();
      const json = temporal.api.history.v1.History.toObject(history, { json: true, longs: String, enums: String, bytes: String });
      const name = fixtureName('history-' + type + '.local.json'); save(name, json);
      assert.equal(history.events.filter(e => e.activityTaskFailedEventAttributes).length, 1);
      const failed = history.events.find(e => e.activityTaskFailedEventAttributes).activityTaskFailedEventAttributes.failure;
      assert.equal(failed.applicationFailureInfo.nonRetryable, true);
      await Worker.runReplayHistory(options, history, type);
      proof.histories.push({ type, sha256: hash(fs.readFileSync(path.join(__dirname, name))), events: history.events.length, replay: 'PASS' });
    }
    const output = captured.join('');
    proof.privacy = { stdoutStderrSentinelsAbsent: sentinels.every(value => !output.includes(value)),
      unrelatedConsolePreserved: output.includes('cf-dbxe37-unrelated-console'),
      unrelatedSDKPreserved: output.includes('cf-dbxe37-unrelated-sdk'),
      unrelatedActivityPreserved: output.includes('cf-dbxe37-unrelated-activity'),
      safeFailureVisible: output.includes('mail.activity_failed') && output.includes('mail.delivery_failed'),
      legacyConsoleRouted: output.includes('mail.workflow_console') };
    proof.mail = { activityAttempts: calls.length, permanentFailures: 3, transientRetries: 3,
      successfulLetters: 7, duplicateSuccessfulLetters: 0, existingV2Preserved: true,
      pendingLetterSurvivedWorkerRestart: true, historyNonRetryablePreserved: true };
    assert.equal(proof.privacy.stdoutStderrSentinelsAbsent, true, 'Synthetic mail sentinels leaked to stdout/stderr');
    for (const [key, value] of Object.entries(proof.privacy)) assert.equal(value, true, key);
    proof.status = 'PASS';
  } catch (error) {
    proof.status = 'FAIL'; proof.failure = error.message;
    throw error;
  } finally {
    try { if (connection) await connection.close(); if (native) await native.close(); }
    finally {
      if (container) {
        const labels = JSON.parse(docker('inspect', '--format', '{{json .Config.Labels}}', container));
        assert.equal(labels['cf.owner'], owner); assert.equal(labels['cf.stage'], 'dbxe.37');
        docker('rm', '-f', '-v', container);
      }
      const after = inventory(); save(fixtureName('containers-after.local.json'), after);
      proof.cleanup = { ownedRemoved: !after.includes(container), beforeCount: before.length,
        afterCount: after.length, preexistingRemoved: before.filter(id => !after.includes(id)),
        foreignAdded: after.filter(id => !before.includes(id)), volumesRemovedWithOwnedContainer: true };
      assert.deepEqual(proof.cleanup.preexistingRemoved, []);
      save(baseline ? 'native-baseline.local.json' : 'native-acceptance.actual.json', proof);
    }
  }
  console.log(JSON.stringify({ status: proof.status, privacy: proof.privacy, mail: proof.mail, replays: proof.histories.length, cleanup: proof.cleanup }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
