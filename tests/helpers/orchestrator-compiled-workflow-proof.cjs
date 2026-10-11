'use strict';

// Run outside Jest: the real Nest compiler, Node module loader and Temporal VM
// must see their installed dependencies rather than Jest's module mappings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const net = require('node:net');
const dns = require('node:dns');
const suppliedDist = process.argv[2] && path.resolve(process.argv[2]);
const root = suppliedDist ? path.resolve(suppliedDist, '../../..') : path.resolve(__dirname, '../..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const configPath = path.join(root, 'apps/orchestrator/tsconfig.build.json');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-orchestrator-compiled-'));
const network = { socketConnect: 0, dnsLookup: 0 };
const originalConnect = net.Socket.prototype.connect;
const originalLookup = dns.lookup;
net.Socket.prototype.connect = function (...args) {
  network.socketConnect += 1;
  return originalConnect.apply(this, args);
};
dns.lookup = function (...args) {
  network.dnsLookup += 1;
  return originalLookup.apply(this, args);
};

async function main() {
  let dist = suppliedDist;
  if (!dist) {
    const ts = requireFromRoot('typescript');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
    assert.deepEqual(parsed.errors, []);
    dist = path.join(temporaryRoot, 'dist');
    const overlayPath = path.join(temporaryRoot, 'tsconfig.json');
    // Preserve every effective source input and inherited compiler option. Only
    // outputs move, so a test never rewrites the application's build directory.
    fs.writeFileSync(overlayPath, JSON.stringify({
      extends: configPath,
      files: parsed.fileNames,
      include: [],
      compilerOptions: { outDir: dist, incremental: false },
    }));
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporaryRoot, 'node_modules'), 'dir');
    const relativeOverlay = path.relative(path.join(root, 'apps/orchestrator'), overlayPath);
    const build = spawnSync('pnpm', ['--filter', './apps/orchestrator', 'run', 'build', '--path', relativeOverlay], {
      cwd: root, env: process.env, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(build.status, 0, `${build.error || ''}\n${build.stdout}\n${build.stderr}`);
  }

  const modulePath = path.join(dist, 'libraries/nestjs-libraries/src/temporal/temporal.module.js');
  const workflowsPath = path.join(dist, 'apps/orchestrator/src/workflows/index.js');
  const fromCompiledModule = createRequire(modulePath);
  // This is the exact Node resolution that failed in the deployed module.
  const interceptorPath = fromCompiledModule.resolve('./mail-log-privacy.workflow');
  const { getTemporalModule } = fromCompiledModule(modulePath);
  const { TEMPORAL_MODULE_OPTIONS } = requireFromRoot('nestjs-temporal-core');
  // Registration returns provider metadata; do not instantiate the Nest graph
  // or invoke the library's connection providers.
  const temporalModule = getTemporalModule(true, workflowsPath, []);
  const options = temporalModule.providers.find((provider) => provider.provide === TEMPORAL_MODULE_OPTIONS).useValue;
  const mainWorker = options.workers.find((worker) => worker.taskQueue === 'main');
  assert.ok(mainWorker, 'The production main worker must exist');
  assert.deepEqual(mainWorker.workerOptions.interceptors.workflowModules, [interceptorPath]);
  assert.equal(require.cache[interceptorPath], undefined, 'Workflow-only interceptor must not execute on the host');

  const { bundleWorkflowCode } = requireFromRoot('@temporalio/worker');
  const bundle = await bundleWorkflowCode({
    workflowsPath: mainWorker.workflowsPath,
    workflowInterceptorModules: mainWorker.workerOptions.interceptors.workflowModules,
    logger: { log() {}, trace() {}, debug() {}, info() {}, warn() {}, error() {} },
  });
  // Use the installed SDK's offline reusable VM, the production default. Its
  // initRuntime imports the compiled interceptor and calls its real factory.
  // No Worker, NativeConnection, database or provider activity is started.
  const { ReusableVMWorkflowCreator } = requireFromRoot('@temporalio/worker/lib/workflow/reusable-vm');
  const { parseWorkflowCode } = requireFromRoot('@temporalio/worker/lib/worker');
  const creator = await ReusableVMWorkflowCreator.create(parseWorkflowCode(bundle.code), 10000, new Set());
  const initialized = [];
  try {
    for (const workflowType of ['sendEmailWorkflow', 'sendEmailWorkflowV2', 'sendEmailWorkflowV3', 'digestEmailWorkflow']) {
      const workflow = await creator.createWorkflow({
        info: {
          workflowId: 'compiled-artifact-proof', runId: `compiled-${workflowType}`, workflowType,
          namespace: 'default', taskQueue: 'main', attempt: 1,
          firstExecutionRunId: `compiled-${workflowType}`, startTime: new Date(0), runStartTime: new Date(0),
          taskTimeoutMs: 10000, historyLength: 1, historySize: 0,
          continueAsNewSuggested: false, searchAttributes: {}, typedSearchAttributes: [],
          unsafe: { isReplaying: false },
        },
        randomnessSeed: [1, 2, 3], now: 0, showStackTraceSources: false,
      });
      try { initialized.push(workflowType); } finally { await workflow.dispose(); }
    }
  } finally { await creator.destroy(); }
  assert.equal(require.cache[interceptorPath], undefined, 'Interceptor stays inside the Temporal sandbox');
  assert.deepEqual(network, { socketConnect: 0, dnsLookup: 0 });
  return { compiledModule: modulePath, compiledInterceptor: interceptorPath, bundleBytes: Buffer.byteLength(bundle.code), initialized, network };
}

(async () => {
  let result;
  try { result = await main(); } finally {
    net.Socket.prototype.connect = originalConnect;
    dns.lookup = originalLookup;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ ...result, temporaryOutputRemoved: !fs.existsSync(temporaryRoot) }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
