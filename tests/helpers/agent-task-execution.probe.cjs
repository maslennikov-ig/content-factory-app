'use strict';

const { Agent } = require('@mastra/core/agent');
const { z } = require('zod');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { IDENTITY, loadRegistry, requestContextFor } = require('./agent-capabilities.cjs');
const chain = require('./ai-text-chain.cjs');
const execution = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/conductor/conductor.execution.ts',
  { '../../openai/ai.text-chain': chain }
);
const registry = loadRegistry({ mocks: { '../conductor/conductor.execution': execution } });
const gate = { check: async () => ({ allowed: true, policies: [] }) };

async function run({ steps = 8, repeat = false, emergencyMaxSteps = 64 }) {
  let calls = 0;
  let modelCalls = 0;
  const choices = [];
  const capability = {
    id: 'test.paid', group: 'content', label: { ru: 'Шаг', en: 'Step' }, description: 'test',
    input: z.object({ index: z.number() }), risk: 'paid', door: registry.pieceCreate.door,
    untrusted: [], summarize: (output) => output,
    run: async (_context, input) => {
      calls += 1;
      const ledger = new chain.TextUsageLedger();
      chain.runWithUsageLedger(ledger, () => ledger.record({ attempt: 1, promptTokens: 1, completionTokens: 1, costUsd: 0.001 }));
      return { index: input.index };
    },
  };
  const scope = execution.createConductorExecution({ requestId: 'native-test', policy: {
    maxDurationMs: 10_000, emergencyMaxSteps, maxIdenticalToolResults: 3,
  } });
  const model = {
    specificationVersion: 'v3', provider: 'scripted', modelId: 'scripted', supportedUrls: {},
    doStream: async () => { throw new Error('generate only'); },
    doGenerate: async (options) => {
      modelCalls += 1;
      choices.push(options.toolChoice?.type ?? 'auto');
      const content = modelCalls <= steps ? [{
        type: 'tool-call', toolCallId: `c${modelCalls}`, toolName: 'test_paid',
        input: JSON.stringify({ index: repeat ? 0 : modelCalls }),
      }] : [{ type: 'text', text: 'Saved requested artifacts.' }];
      return { content, finishReason: { unified: modelCalls <= steps ? 'tool-calls' : 'stop', raw: 'scripted' },
        usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } }, warnings: [] };
    },
  };
  const agent = new Agent({ id: 'native-task-budget', name: 'test', instructions: 'test', model,
    tools: registry.buildMastraCapabilityTools([capability], { language: 'ru', services: () => ({}) }),
    hooks: registry.createCapabilityHooks([capability], gate),
  });
  const result = await scope.run(() => agent.generate('Finish requested work.', {
    requestContext: requestContextFor(registry, IDENTITY), ...scope.streamOptions(), abortSignal: scope.signal,
  }));
  return { calls, modelCalls, choices, text: result.text, budget: scope.snapshot() };
}

(async () => {
  const report = {
    multiple: await run({}),
    repeated: await run({ steps: 20, repeat: true }),
    fuse: await run({ steps: 20, emergencyMaxSteps: 9 }),
  };
  process.stdout.write(JSON.stringify(report));
})().catch((error) => { console.error(error); process.exitCode = 1; });
