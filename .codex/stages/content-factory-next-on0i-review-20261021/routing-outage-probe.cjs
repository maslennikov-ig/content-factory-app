'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = process.cwd();
const filename = path.join(root, 'tests/helpers/agent-model-fallback-retry.probe.cjs');
let source = fs.readFileSync(filename, 'utf8');
source = source.slice(0, source.indexOf('async function main()'));
const mode = process.argv[2] || 'routing';
if (mode.startsWith('routing')) {
  const needle = "    memory,\n    capabilities: [capability],\n    snapshot: async () => ({ channels: [] }),\n  });\n  const mastra = new Mastra({";
  const injection = `    memory,
    capabilities: [capability],
    snapshot: async () => ({ channels: [] }),
    modelSelection: async () => conductorModule.createConductorModelSelectionProcessor({
      model: {
        specificationVersion: 'v4', provider: 'test', modelId: 'classifier',
        supportedQuestionTypes: ['choice'],
        async doDecide(options) { return { answers: Object.fromEntries(Object.keys(options.questions).map(id => [id, { type: 'choice', choice: 'agent', probabilities: { agent: 1, classify: 0 } }])), usage: {}, warnings: [] }; },
        doEvaluate(options) { return this.doDecide(options); },
      },
      minProbability: 0.85,
      choices: [{ name: 'agent', model: (await clientsMod.getAiSdkProvider('org-1')).chat(entries.primaryModel), criteria: 'Any request' }, { name: 'classify', model: (await clientsMod.getAiSdkProvider('org-1')).chat('openai/gpt-5.4-classify'), criteria: 'Simple request' }],
    }),
  });
  const mastra = new Mastra({`;
  if (!source.includes(needle)) throw new Error('probe injection missing');
  source = source.replace(needle, injection);
}
if (mode.includes('outage')) {
  const needle = "  const fetchBehavior = (model) => {";
  source = source.replace(needle, needle + "\n    return new Response(JSON.stringify({error:{message:'all providers unavailable'}}), {status:503,headers:{'content-type':'application/json'}});\n");
}
source = source.replaceAll('    storage: store,\n  });', "    storage: store,\n    recovery: { workflows: 'auto', durableAgents: 'auto' },\n  });");
// Timestamp the actual single-attempt transport. Retry-After asks for a two-second wait.
source = source.replace("model: parsed.model,\n                serviceTier:", "model: parsed.model,\n                time: performance.now(),\n                serviceTier:");
source = source.replaceAll("{ status: 503, headers: { 'content-type': 'application/json' } }", "{ status: 503, headers: { 'content-type': 'application/json', 'retry-after': '2' } }");
source = source.replace("  // Verify A31: Stop / abortSignal", `  const activeAgent = mastra.getAgent(conductorModule.CONDUCTOR_AGENT_ID);
  await new Promise(resolve => setTimeout(resolve, 50));
  const activeBefore = await activeAgent.listActiveRuns({});
  const workflows = await store.getStore('workflows');
  const persistedRuns = await workflows.listWorkflowRuns({workflowName: 'durable-agentic-loop'});
  const recovery = await activeAgent.recoverActiveRuns({});
  const diagnostic = {mode: '${mode}', streamOutputText, httpAttemptModels: httpCalls.map(x => x.model), httpAttemptIntervalsMs: httpCalls.slice(1).map((x,i) => Math.round(x.time-httpCalls[i].time)), ledgerAttemptCount: ledger.calls.length, activeRunCount: activeBefore.runs.length, persistedRuns: persistedRuns.runs.map(x => ({status:x.status,snapshotStatus:typeof x.snapshot==='string'?JSON.parse(x.snapshot).status:x.snapshot?.status})), recovery};
  await mastra.shutdown();
  return diagnostic;
  // Verify A31: Stop / abortSignal`);
source += "\nrunA30AndA31FallbackRetryStopAndAccounting().then(r => { console.log('REVIEW_RESULT=' + JSON.stringify(r)); }).catch(e => { console.error(e); process.exitCode=1; });\n";
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(source, filename);
