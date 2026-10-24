'use strict';

// A real MastraService/PG/Redis runtime; only provider and domain inputs are
// frozen. Run in a subprocess: node --expose-gc --max-old-space-size=512 ...
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { globalRunRegistry } = require('@mastra/core/agent/durable');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { loadWithMocks } = require('./load-ts-with-mocks.cjs');

const argument = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const runs = Number(argument('runs', 4));
const holdMs = Number(argument('hold-ms', 0));
const checkpointEvery = Number(argument('checkpoint-every', 0));
const verbose = argument('verbose', 'false') === 'true';
const baselineRef = argument('baseline-ref', '');
const heapSnapshot = argument('heap-snapshot', '');
const initialHeapSnapshot = argument('initial-heap-snapshot', '');
const observe = argument('observe', 'true') === 'true';
const retainModelCalls = argument('retain-model-calls', 'false') === 'true';
const sdkRoot = require('node:path').dirname(require.resolve('@mastra/core/package.json'));
const sdkHashes = Object.fromEntries(['create-durable-agent-v9Cu4dSm.cjs', 'create-durable-agent-CdL_GpVq.js',
  'agent-DpTPjdjR.cjs', 'agent-Blan8B5o.js', 'storage-Cfz_oB2T.cjs', 'storage-7mYy2C-B.js',
  'agent-controller-C_6RbJaM.cjs', 'agent-controller-DRiP9C5v.js'].map((file) => [file,
  createHash('sha256').update(require('node:fs').readFileSync(require('node:path').join(sdkRoot, 'dist', file))).digest('hex')]));
const BASE = 'libraries/nestjs-libraries/src/chat/';
const evidence = baselineRef
  ? loadWithMocks(`${BASE}capabilities/catalogue/research-evidence.ts`, {}, baselineRef)
  : loadCapabilityModule('catalogue/research-evidence.ts');
const sourceMocks = {
  '@contentfactory/backend/api/routes/content-source.controller': { ContentSourceController: class {} },
  '@contentfactory/nestjs-libraries/openai/web.research.service': { WebResearchService: class WebResearchService {} },
  '@contentfactory/nestjs-libraries/content-intelligence/intake/intake.service': { IntakeService: class IntakeService {} },
  './research-evidence': evidence,
};
const { researchSearch } = baselineRef
  ? loadWithMocks(`${BASE}capabilities/catalogue/research.capabilities.ts`, sourceMocks, baselineRef)
  : loadCapabilityModule('catalogue/research.capabilities.ts', { mocks: sourceMocks });
const { readCommittedToolReceipt } = loadCapabilityModule('../conductor/agent-operation-receipts.ts');
const { observeConductorRun } = loadCapabilityModule('../conductor/native-run-observer.ts');
const { conversationHistoryTool } = loadCapabilityModule('../conductor/conversation-history.ts');
const { nativeToolResultJson } = loadCapabilityModule('../conductor/native-tool-result.ts');
const usage = { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 5, text: 5 } };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const size = (value) => Buffer.byteLength(JSON.stringify(value));
const text = (seed, length) => {
  // Distinct sanitized contents avoid an artificial shared-string memory win.
  let body = '';
  for (let index = 0; body.length < length; index++) body += `${hash(`${seed}:${index}`)} `;
  return body.slice(0, length);
};

function corpus(index) {
  // The largest incident result reported 50 sources / 1,133,853 full source
  // characters. Keep that shape without copying any real text or account ID.
  const sources = Array.from({ length: 50 }, (_, sourceIndex) => ({
    url: `https://sources.example.test/run-${index}/source-${sourceIndex}`,
    title: `Synthetic retained source ${index}/${sourceIndex}`,
    publishedAt: '2026-10-15T12:00:00.000Z', provider: 'frozen',
    evidenceId: `evidence-${index}-${sourceIndex}`,
    content: text(`${index}:${sourceIndex}`, sourceIndex === 0 ? 321788 : sourceIndex === 49 ? 16609 : 16572),
  }));
  const facts = sources.map((source, factIndex) => ({
    factKey: `fact-${index}-${factIndex}`, statement: text(`statement:${index}:${factIndex}`, 1200),
    quote: text(`quote:${index}:${factIndex}`, 500), note: text(`note:${index}:${factIndex}`, 850),
    sourceUrl: source.url, evidenceId: source.evidenceId, status: 'confirmed', selected: true,
    dateProvenance: { status: 'in-period', publishedAt: source.publishedAt, from: '2026-10-09', to: '2026-10-23' },
  }));
  return { sources, facts, summary: text(`summary:${index}`, 2000), readerAssessment: {
    version: 'frozen-evidence/v1', status: 'sufficient', requestedDate: { from: '2026-10-09', to: '2026-10-23' },
    // Legacy summaries copied this full assessment alongside compact facts.
    summary: text(`assessment:${index}`, 56000),
  } };
}

async function main() {
  process.stderr.write(`${JSON.stringify({ stage: 'sdk', sdkRoot, sdkHashes })}\n`);
  assert.equal(process.versions.node, '22.23.2');
  assert.equal(require('@mastra/core/package.json').version, '1.78.0');
  assert.equal(typeof global.gc, 'function', '--expose-gc is required');
  assert.ok(Number.isSafeInteger(runs) && runs > 0 && runs <= 100);
  const samples = [];
  const settledSamples = [];
  let peakHeap = 0;
  let peakRss = 0;
  let maxPromptBytes = 0;
  let maxSnapshotBytes = 0;
  let maxResultBytes = 0;
  let modelCalls = 0;
  let domainCalls = 0;
  let sourceReads = 0;
  let reconnectResults = 0;
  let savedReconnects = 0;
  let fullReceiptRangeReads = 0;
  let liveReplay;
  let currentRun = 0;
  let currentStep = 0;
  let runtime;
  let state;
  let snapshotSaved = new Map();
  const sample = () => {
    const mem = process.memoryUsage();
    peakHeap = Math.max(peakHeap, mem.heapUsed);
    peakRss = Math.max(peakRss, mem.rss);
    return { heap: mem.heapUsed, rss: mem.rss };
  };
  const timer = setInterval(sample, 20);
  const drain = async () => {
    const deadline = Date.now() + 10_000;
    while (runtime.agent.getWorkflow().runs.size || runtime.storagePool.waitingCount ||
           runtime.storagePool.idleCount !== runtime.storagePool.totalCount) {
      assert.ok(Date.now() < deadline, 'native workflow and owned storage pool must drain');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await runtime.mastra.pubsub.flush();
  };
  try {
    runtime = await createRuntime({
      fixtureRisk: 'write',
      fixtureSummarize: (result) => result,
      fixtureRun: async () => {
        const callIndex = domainCalls++;
        if (callIndex % 24 < 4) {
          const frozen = corpus(callIndex);
          let captured;
          const result = await researchSearch.run({
            ...IDENTITY, entrance: 'chat', service: (token) => token.name === 'WebResearchService'
              ? { research: async () => frozen }
              : { storeResearchEvidence: async (_org, _user, input) => {
                  captured = { ...input, snapshotKey: `res_synthetic_${callIndex}` };
                  await state.setState({ threadId: `memory-${currentRun}`, type: captured.snapshotKey, value: captured });
                  return captured;
                } },
          }, { query: `Research source evidence ${callIndex} from 9 through 23 October2026`, level: 'deep' });
          const summary = researchSearch.summarize(result);
          maxResultBytes = Math.max(maxResultBytes, size(summary));
          // Keep only a digest and locator in the probe, not another corpus copy.
          snapshotSaved.set(captured.snapshotKey, { threadId: `memory-${currentRun}`, hash: hash(captured.sources[0].content) });
          return summary;
        }
        return { id: `range-${callIndex}`, part: 'research_source', offset: 0, nextOffset: 12000, text: text(`range:${callIndex}`, 12000), totalCharacters: 321788, revision: hash(`revision:${callIndex}`) };
      },
      modelFactory: (modelId) => {
        const model = new MockLanguageModelV3({ modelId, async doStream(args) {
        // MockLanguageModelV3 records every prompt by default. Resource probes
        // must not measure that test-only archive as product retention.
        if (!retainModelCalls) model.doStreamCalls.length = 0;
        modelCalls++;
        maxPromptBytes = Math.max(maxPromptBytes, size(args.prompt));
        sample();
        const step = currentStep++;
        process.stderr.write(`${JSON.stringify({ stage: 'model', run: currentRun, step, ...sample(), maxSnapshotBytes, maxPromptBytes, maxResultBytes })}\n`);
        if (verbose) process.stderr.write(`${JSON.stringify({ stage: 'prompt-parts', step, parts: args.prompt.flatMap((message) => Array.isArray(message.content) ? message.content.map((part) => ({ role: message.role, type: part.type, bytes: size(part), projected: !!part.output?.value?.nativeResult })) : []) })}\n`);
        if (observe && step === 6) {
          const thread = await runtime.memory.getThreadById({ threadId: `memory-${currentRun}` });
          const replay = await observeConductorRun(runtime.agent, thread.metadata.assistantNativeRun.runId, { closeOnSuspend: true });
          liveReplay = (async () => {
            const reader = replay.fullStream.getReader();
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value.type === 'tool-result') reconnectResults++;
              }
            } finally { replay.detach(); }
          })();
        }
        const chunks = [{ type: 'stream-start', warnings: [] }];
        if (step < 12) {
          for (let part = 0; part < 2; part++) chunks.push({ type: 'tool-call', toolCallId: `memory-${currentRun}-${step}-${part}`, toolName: 'fixture_persist', input: '{}' });
          chunks.push({ type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage });
        } else {
          chunks.push({ type: 'text-start', id: 'saved' }, { type: 'text-delta', id: 'saved', delta: `Saved result for synthetic run ${currentRun}.` }, { type: 'text-end', id: 'saved' }, { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage });
        }
        return { stream: convertArrayToReadableStream(chunks) };
      } });
        return model;
      },
    });
    state = await runtime.storage.getStore('threadState');
    const workflows = await runtime.storage.getStore('workflows');
    const persist = workflows.persistWorkflowSnapshot.bind(workflows);
    workflows.persistWorkflowSnapshot = async (input) => {
      maxSnapshotBytes = Math.max(maxSnapshotBytes, size(input.snapshot));
      sample();
      if (verbose) process.stderr.write(`${JSON.stringify({ stage: 'snapshot', run: currentRun, step: currentStep, bytes: size(input.snapshot), heap: process.memoryUsage().heapUsed })}\n`);
      return persist(input);
    };
    global.gc();
    const initial = sample();
    if (initialHeapSnapshot) require('node:v8').writeHeapSnapshot(initialHeapSnapshot);
    for (currentRun = 0; currentRun < runs; currentRun++) {
      currentStep = 0;
      const threadId = `memory-${currentRun}`;
      const resourceId = 'org-service:user-service';
      await runtime.memory.createThread({ threadId, resourceId, title: 'Sanitized memory regression' });
      let requestContext = runtime.contextModule.buildConductorContext({ identity: IDENTITY, threadId, requestId: `memory-request-${currentRun}` });
      let session = await runtime.service.sessionFor(IDENTITY, threadId, { bindThread: true, requestContext });
      let execution = new runtime.executionModule.ConductorExecution({ requestId: `memory-request-${currentRun}`, native: true });
      await execution.run(() => session.sendMessage({ content: 'Research the fixed 9–23 October2026 period, retain full sources, and save one result.', requestContext }));
      const thread = await runtime.memory.getThreadById({ threadId });
      const runId = thread.metadata.assistantNativeRun.runId;
      assert.equal(currentStep, 13, 'all frozen native tool steps and final response complete');
      let receipt = await readCommittedToolReceipt({ organizationId: IDENTITY.organizationId, threadId, runId, toolName: 'fixture_persist', toolCallId: `memory-${currentRun}-0-0`, memory: runtime.memory, storage: runtime.storage });
      assert.equal(receipt.result.ok, true);
      let exactResult = nativeToolResultJson(receipt.result);
      let range = await conversationHistoryTool(runtime.memory).execute({ outputRef: {
        version: 1, runId, toolName: 'fixture_persist', toolCallId: `memory-${currentRun}-0-0`, resumed: false, sha256: hash(exactResult),
      }, offset: Math.max(0, exactResult.length - 12000), length: 12000 }, { requestContext });
      assert.equal(range.ok, true, 'PG JSONB receipt digest is stable after key reordering');
      assert.equal(range.text.untrustedData.value, exactResult.slice(-12000));
      fullReceiptRangeReads++;
      let history = await runtime.memory.recall({ threadId, resourceId, page: 0, perPage: 2 });
      assert.ok(JSON.stringify(history.messages).includes('Saved result for synthetic run'));
      await liveReplay;
      if (observe) assert.ok(reconnectResults >= (currentRun + 1) * 24, 'active native reconnect replays every tool result');
      const isComplete = async () => JSON.stringify((await runtime.memory.recall({ threadId, resourceId, page: 0, perPage: 2 })).messages).includes(`Saved result for synthetic run ${currentRun}.`);
      if (observe) try {
        const replay = await observeConductorRun(runtime.agent, runId, { closeOnSuspend: true, isComplete });
        const reader = replay.fullStream.getReader();
        while (!(await reader.read()).done) { /* Drain native reconnect without retaining chunks. */ }
        replay.detach();
      } catch (error) {
        assert.equal(error.code, 'NATIVE_REPLAY_COMPLETE');
        assert.equal(await isComplete(), true);
        savedReconnects++;
      }
      // Read the earliest already-cached/evicted snapshot through native durable
      // storage. Cache policy must never remove full source retrieval.
      const [snapshotKey, locator] = snapshotSaved.entries().next().value;
      let retained = await state.getState({ threadId: locator.threadId, type: snapshotKey });
      assert.equal(hash(retained.sources[0].content), locator.hash);
      sourceReads++;
      await drain();
      // V8 async loop scopes and completion callbacks can keep the diagnostic
      // readbacks alive. They are not product retention and must be released
      // before measuring the producer's steady heap.
      requestContext = session = execution = receipt = history = retained = exactResult = range = null;
      global.gc();
      samples.push({ run: currentRun + 1, ...sample(), registry: runtime.agent.runRegistry.size, globalRegistry: globalRunRegistry.size,
        pgClients: runtime.storagePool.totalCount, pgIdle: runtime.storagePool.idleCount });
      process.stderr.write(`${JSON.stringify({ stage: 'run', ...samples.at(-1), maxSnapshotBytes, maxPromptBytes, maxResultBytes })}\n`);
      if (checkpointEvery && (currentRun + 1) % checkpointEvery === 0) {
        assert.ok(holdMs >= 35000, 'settled checkpoints require the full native cleanup grace');
        await new Promise((resolve) => setTimeout(resolve, holdMs));
        await drain();
        global.gc();
        settledSamples.push({ run: currentRun + 1, ...sample(), registry: runtime.agent.runRegistry.size, globalRegistry: globalRunRegistry.size });
        process.stderr.write(`${JSON.stringify({ stage: 'settled', ...settledSamples.at(-1) })}\n`);
      }
    }
    if (holdMs && (!checkpointEvery || runs % checkpointEvery !== 0)) await new Promise((resolve) => setTimeout(resolve, holdMs));
    await drain();
    global.gc();
    const final = sample();
    if (observe && holdMs >= 35000) {
      const threadId = `memory-${runs - 1}`;
      const resourceId = 'org-service:user-service';
      const saved = await runtime.memory.getThreadById({ threadId });
      const isComplete = async () => JSON.stringify((await runtime.memory.recall({ threadId, resourceId, page: 0, perPage: 2 })).messages).includes(`Saved result for synthetic run ${runs - 1}.`);
      assert.equal(await isComplete(), true);
      try {
        const replay = await observeConductorRun(runtime.agent, saved.metadata.assistantNativeRun.runId, { closeOnSuspend: true, isComplete });
        const reader = replay.fullStream.getReader();
        while (!(await reader.read()).done) { /* Late replay must also terminate. */ }
        replay.detach();
      } catch (error) {
        assert.equal(error.code, 'NATIVE_REPLAY_COMPLETE');
        savedReconnects++;
      }
      assert.ok(savedReconnects > 0, 'after native cleanup, the exact completion is recovered from saved history');
      assert.equal(modelCalls, runs * 13, 'history/reconnect never causes another provider attempt');
    }
    if (heapSnapshot) require('node:v8').writeHeapSnapshot(heapSnapshot);
    const steady = settledSamples;
    const steadySpreadBytes = steady.length ? Math.max(...steady.map((one) => one.heap)) - Math.min(...steady.map((one) => one.heap)) : null;
    process.stderr.write(`${JSON.stringify({ stage: 'retention', final, peakHeap, peakRss, steadySpreadBytes, settledSamples, samples })}\n`);
    if (runs >= 8 && checkpointEvery) assert.ok(steadySpreadBytes <= 8 * 1024 * 1024,
      `matched native cleanup checkpoints must stay within 8 MiB, observed ${steadySpreadBytes}`);
    return { passed: true, baselineRef: baselineRef || null, node: process.versions.node, core: require('@mastra/core/package.json').version,
      heapLimitMb: 512, sdkHashes, runs, observe, retainModelCalls, researchResults: runs * 4, sourcesPerResult: 50, domainCalls, modelCalls, sourceReads, fullReceiptRangeReads, reconnectResults, savedReconnects,
      maxResultBytes, maxSnapshotBytes, maxPromptBytes, peakHeap, peakRss, initial, final, registry: runtime.agent.runRegistry.size, globalRegistry: globalRunRegistry.size,
      pgClients: runtime.storagePool.totalCount, pgIdle: runtime.storagePool.idleCount, holdMs, checkpointEvery, steadySpreadBytes, settledSamples, samples };
  } finally {
    clearInterval(timer);
    snapshotSaved.clear();
    if (runtime) await runtime.close({ drop: true });
  }
}

main().then((result) => { console.log(JSON.stringify(result)); process.exit(0); }).catch((error) => { console.error(error); process.exit(1); });
