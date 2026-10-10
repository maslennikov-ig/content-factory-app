'use strict';

// Explicit, local-only SDK/replay check. Not part of the ordinary Jest suite.
// Uses a cached pinned image, one loopback dev server and synthetic activities.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { Worker, NativeConnection, Runtime, DefaultLogger, bundleWorkflowCode } = require('@temporalio/worker');
const { Connection, Client } = require('@temporalio/client');
const { temporal } = require('@temporalio/proto');

const root = path.resolve(__dirname, '../../..');
const stage = __dirname;
const baseline = 'f398dcfa7560a8220802b4fa73f73884fca30e95';
const image = 'sha256:cf86707827fac99e4d1c4a47dc11b105382d796199c7bd41fb3213fb0471628e';
const owner = randomUUID();
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000 }).trim();
const inventory = () => docker('ps', '-aq', '--no-trunc').split('\n').filter(Boolean).sort();
const hash = data => createHash('sha256').update(data).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(stage, name), JSON.stringify(value, null, 2) + '\n');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const options = { maxCachedWorkflows: 2, workflowThreadPoolSize: 1,
  maxConcurrentWorkflowTaskExecutions: 2, maxConcurrentActivityTaskExecutions: 2,
  maxConcurrentWorkflowTaskPolls: 2, maxConcurrentActivityTaskPolls: 1,
  shutdownGraceTime: '1 second', shutdownForceTime: '10 seconds' };

async function bundle(workflowsPath) {
  return bundleWorkflowCode({ workflowsPath,
    webpackConfigHook: config => {
      config.resolve.alias = { ...config.resolve.alias,
        '@contentfactory/orchestrator': path.join(root, 'apps/orchestrator/src'),
        '@contentfactory/nestjs-libraries': path.join(root, 'libraries/nestjs-libraries/src'),
        '@contentfactory/helpers': path.join(root, 'libraries/helpers/src'),
      };
      return config;
    },
  });
}

async function main() {
  fs.mkdirSync(stage, { recursive: true });
  Runtime.install({ logger: new DefaultLogger('ERROR') });
  // Histories originate in the baseline export tree, not in the new bundle.
  const oldIndex = execFileSync('git', ['show', baseline + ':apps/orchestrator/src/workflows/index.ts'],
    { cwd: root, encoding: 'utf8' });
  const oldFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline,
    'apps/orchestrator/src/activities', 'apps/orchestrator/src/workflows'], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(file => file.endsWith('.ts') && !file.endsWith('/index.ts'));
  for (const file of oldFiles) {
    const original = execFileSync('git', ['show', baseline + ':' + file], { cwd: root });
    assert.equal(hash(fs.readFileSync(path.join(root, file))), hash(original), 'Historical source changed: ' + file);
  }
  const oldPath = path.join(stage, 'baseline-workflows-index.local.ts');
  fs.writeFileSync(oldPath, oldIndex.replace(/from '\.\//g,
    "from '" + path.join(root, 'apps/orchestrator/src/workflows') + '/'));
  const oldBundle = await bundle(oldPath);
  const currentBundle = await bundle(path.join(root, 'apps/orchestrator/src/workflows/index.ts'));
  fs.writeFileSync(path.join(stage, 'baseline-workflow-bundle.local.js'), oldBundle.code);
  fs.writeFileSync(path.join(stage, 'workflow-bundle.local.js'), currentBundle.code);

  const before = inventory();
  save('containers-before.local.json', before);
  let container;
  let native;
  let connection;
  const proof = { schema: 'cf-automation-deadlines-native/v1', status: 'running', baseline,
    sdk: require('@temporalio/worker/package.json').version, image, owner,
    bundles: { baseline: hash(oldBundle.code), current: hash(currentBundle.code) },
    boundary: 'local synthetic histories and activities; no production history, provider or database',
    versions: [], providerCalls: 0 };
  try {
    container = docker('run', '-d', '--name', 'cf-dbxe16-' + owner,
      '--label', 'cf.stage=dbxe.16', '--label', 'cf.owner=' + owner,
      '--memory', '768m', '--cpus', '1', '-p', '127.0.0.1::7233', image,
      'server', 'start-dev', '--ip', '0.0.0.0', '--port', '7233', '--headless', '--log-level', 'error');
    proof.container = container;
    const inspect = JSON.parse(docker('inspect', container))[0];
    const port = inspect.NetworkSettings.Ports['7233/tcp'][0];
    assert.equal(port.HostIp, '127.0.0.1');
    const address = '127.0.0.1:' + port.HostPort;
    const deadline = Date.now() + 45000;
    while (!native) {
      try { native = await NativeConnection.connect({ address, connectTimeout: '1 second' }); }
      catch (error) { if (Date.now() >= deadline) throw error; await wait(250); }
    }
    connection = await Connection.connect({ address });
    const client = new Client({ connection });
    const traces = new Map();
    const postFor = id => ({ id, organizationId: 'synthetic-org', state: 'QUEUE', settings: '{}',
      publishDate: new Date('2000-01-01T00:00:00Z'), intervalInDays: 0,
      integration: { id, organizationId: 'synthetic-org', providerIdentifier: 'synthetic',
        name: 'Synthetic', disabled: false } });
    const postSocial = async (_integration, posts) => posts.map(post => ({ id: post.id,
      postId: post.id, releaseURL: 'https://synthetic.invalid/' + post.id, status: 'published' }));
    const activities = {
      getPost: async (_org, id) => postFor(id),
      getPostsList: async (_org, id) => [postFor(id)],
      getPostsListV106: async (_org, id) => [postFor(id)],
      postSocial, postSocialV106: postSocial,
      changeState: async () => {}, updatePost: async () => {},
      inAppNotification: async () => {}, startPublicationStreakV106: async () => {},
      sendWebhooks: async () => {}, isCommentable: async () => false,
      internalPlugs: async () => [],
      globalPlugs: async integration => [{ type: 'global', plugId: integration.id, delay: 100, totalRuns: 3 }],
      processPlug: async data => {
        const trace = traces.get(data.postId) || [];
        trace.push(Date.now()); traces.set(data.postId, trace);
        await wait(350); // Later deadlines expire during processing, independent of server timer precision.
        return false;
      },
    };
    for (const [versions, workflowBundle] of [[[1, 2, 3, 4, 5, 6], oldBundle], [[7], currentBundle]]) {
      const taskQueue = 'cf-dbxe16-' + owner + '-' + versions[0];
      const worker = await Worker.create({ ...options, connection: native, taskQueue, workflowBundle, activities });
      await worker.runUntil(async () => {
        for (const version of versions) {
          const workflowType = 'postWorkflowV10' + version;
          const workflowId = 'synthetic-v10' + version + '-' + owner;
          const handle = await client.workflow.start(workflowType, { workflowId, taskQueue,
            workflowExecutionTimeout: '15 seconds',
            args: [{ taskQueue, postId: workflowId, organizationId: 'synthetic-org', postNow: true }] });
          await handle.result();
          assert.equal(traces.get(workflowId)?.length, 3, workflowType + ' did not run all actions');
          const history = await handle.fetchHistory();
          const json = temporal.api.history.v1.History.toObject(history,
            { json: true, longs: String, enums: String, bytes: String });
          assert(json.events.some(event => event.workflowExecutionCompletedEventAttributes));
          const timers = history.events.filter(event => event.timerStartedEventAttributes);
          assert.equal(timers.length, version === 7 ? 1 : 3,
            workflowType + ' created an unnecessary overdue timer');
          save('history-v10' + version + '.local.json', json);
          await Worker.runReplayHistory({ ...options, workflowBundle: currentBundle }, history, workflowId);
          proof.versions.push({ workflowType, actions: traces.get(workflowId).length,
            elapsedActionOffsets: traces.get(workflowId).map(at => at - traces.get(workflowId)[0]),
            historyEvents: history.events.length, timers: timers.length, replay: 'pass',
            origin: version < 7 ? 'baseline bundle' : 'current bundle' });
        }
      });
    }
    proof.status = 'pass';
  } catch (error) {
    proof.status = 'fail'; proof.error = String(error);
    if (container) fs.writeFileSync(path.join(stage, 'temporal-server.local.log'), docker('logs', container));
    throw error;
  } finally {
    try {
      if (connection) await connection.close();
      if (native) await native.close();
    } finally {
      if (container) {
        const labels = JSON.parse(docker('inspect', '--format', '{{json .Config.Labels}}', container));
        assert.equal(labels['cf.owner'], owner);
        docker('rm', '-f', container);
      }
      const after = inventory();
      proof.cleanup = { ownedRemoved: !after.includes(container), beforeCount: before.length,
        afterCount: after.length, preexistingRemoved: before.filter(id => !after.includes(id)),
        foreignAdded: after.filter(id => !before.includes(id)) };
      save('containers-after.local.json', after);
      save('native-acceptance.local.json', proof);
      assert.deepEqual(proof.cleanup.preexistingRemoved, []);
    }
  }
  console.log(JSON.stringify(proof));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
