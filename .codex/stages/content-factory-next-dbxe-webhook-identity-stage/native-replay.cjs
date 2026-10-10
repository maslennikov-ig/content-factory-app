'use strict';

// Offline SDK replay only: reuses .16's saved synthetic histories. No server,
// activities, database, HTTP receiver or external provider is started.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Worker, Runtime, DefaultLogger, bundleWorkflowCode } = require('@temporalio/worker');
const { temporal } = require('@temporalio/proto');
const { defaultPayloadConverter } = require('@temporalio/common');

const root = path.resolve(__dirname, '../../..');
const prior = path.join(root, '.codex/stages/content-factory-next-dbxe-automation-deadlines-stage');
const baseline = '76ddaa82a57efd611e2a674e0c39e6034d4ef209';
const hash = data => createHash('sha256').update(data).digest('hex');

async function main() {
  Runtime.install({ logger: new DefaultLogger('ERROR') });
  const priorReceipt = JSON.parse(fs.readFileSync(path.join(prior, 'root-acceptance.actual.json')));
  const priorNative = fs.readFileSync(path.join(prior, 'native-acceptance.local.json'));
  const relativeNative = path.relative(root, path.join(prior, 'native-acceptance.local.json'));
  assert.equal(hash(priorNative), priorReceipt.evidence_sha256[relativeNative]);
  const origin = JSON.parse(priorNative);
  assert.equal(origin.status, 'pass');
  assert.equal(hash(fs.readFileSync(path.join(prior, 'workflow-bundle.local.js'))), origin.bundles.current);

  const oldFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline,
    'apps/orchestrator/src/activities', 'apps/orchestrator/src/workflows'], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(file => file.endsWith('.ts') && !file.endsWith('/index.ts'));
  assert.equal(oldFiles.length, 31);
  for (const file of oldFiles) {
    const original = execFileSync('git', ['show', baseline + ':' + file], { cwd: root });
    assert.equal(hash(fs.readFileSync(path.join(root, file))), hash(original), 'Historical source changed: ' + file);
  }

  const bundle = await bundleWorkflowCode({ workflowsPath: path.join(root, 'apps/orchestrator/src/workflows/index.ts'),
    webpackConfigHook: config => {
      config.resolve.alias = { ...config.resolve.alias,
        '@contentfactory/orchestrator': path.join(root, 'apps/orchestrator/src'),
        '@contentfactory/nestjs-libraries': path.join(root, 'libraries/nestjs-libraries/src'),
        '@contentfactory/helpers': path.join(root, 'libraries/helpers/src'),
      };
      return config;
    },
  });
  fs.writeFileSync(path.join(__dirname, 'workflow-bundle.local.js'), bundle.code);
  const proof = { schema: 'cf-webhook-identity-offline-replay/v1', status: 'running', baseline,
    sdk: require('@temporalio/worker/package.json').version, bundle_sha256: hash(bundle.code),
    historical_sources_unchanged: oldFiles.length, histories: [],
    boundary: 'saved synthetic V101–V107 histories only; V108 bundled but not natively executed; no production, provider or receiver',
    resources: 'offline replay workers only; no container, server, database or network calls' };
  for (let version = 1; version <= 7; version++) {
    const filename = path.join(prior, 'history-v10' + version + '.local.json');
    const raw = fs.readFileSync(filename);
    const history = temporal.api.history.v1.History.fromObject(JSON.parse(raw));
    const started = history.events[0].workflowExecutionStartedEventAttributes;
    assert.equal(started.workflowType.name, 'postWorkflowV10' + version);
    const input = defaultPayloadConverter.fromPayload(started.input.payloads[0]);
    assert.equal(input.postId, 'synthetic-v10' + version + '-' + origin.owner);
    assert(history.events.some(event => event.workflowExecutionCompletedEventAttributes));
    await Worker.runReplayHistory({ workflowBundle: bundle, workflowThreadPoolSize: 1,
      maxCachedWorkflows: 2, shutdownGraceTime: '1 second' }, history, input.postId);
    proof.histories.push({ workflowType: started.workflowType.name, events: history.events.length,
      source: path.relative(root, filename), sha256: hash(raw), replay: 'pass' });
  }
  proof.status = 'pass';
  fs.writeFileSync(path.join(__dirname, 'native-replay.local.json'), JSON.stringify(proof, null, 2) + '\n');
  process.stdout.write(JSON.stringify(proof, null, 2) + '\n');
}

main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
