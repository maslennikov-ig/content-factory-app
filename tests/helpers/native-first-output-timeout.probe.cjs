'use strict';
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
let unexpectedNetwork = 0;
global.fetch = async () => { unexpectedNetwork++; throw new Error('EXTERNAL_NETWORK_FORBIDDEN'); };
const chain = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.text-chain.ts');
const retry = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.native-retries.ts', { './ai.text-chain': chain });
const { Agent } = require('@mastra/core/agent');
const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { Memory } = require('@mastra/memory');
const { RequestContext } = require('@mastra/core/request-context');
const { createTool } = require('@mastra/core/tools');
const { createOpenAI } = require('@ai-sdk/openai');
const { z } = require('zod');
const encoder = new TextEncoder();
const modelId = 'vendor/native-first-output-fixture';
const event = (delta, finish_reason = null, usage) => ({ id: 'fixture', object: 'chat.completion.chunk', created: 0,
  model: modelId, choices: [{ index: 0, delta, finish_reason }], ...(usage ? { usage } : {}) });
const toolDelta = { role: 'assistant', tool_calls: [{ index: 0, id: 'save-fixture', type: 'function',
  function: { name: 'fixture_persist', arguments: '{}' } }] };
const sse = events => new Response(new ReadableStream({
  start(controller) { for (const value of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
    controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close(); },
}), { headers: { 'content-type': 'text/event-stream' } });
const complete = delta => sse([event(delta), event({}, delta.tool_calls ? 'tool_calls' : 'stop',
  { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4, cost: 0.001 })]);

async function scenario(name) {
  const stopped = new AbortController(), calls = [], apiErrors = [], emittedErrors = [], ledger = new chain.TextUsageLedger();
  let toolCalls = 0, text = '', failedAttempts = 0;
  const flex = name !== 'recover-default';
  const context = new RequestContext();
  retry.setNativeTextMaxRetries(context, 1, [modelId]);
  retry.setNativeTextTierPolicy(context, { provider: 'openrouter', flexModels: flex ? [modelId] : [],
    defaultRetryModels: name === 'recover-flex-only' ? [] : [modelId] });
  const config = retry.createNativeTextRetryConfig({ defaultMaxRetries: 1 });
  const processError = config.errorProcessors[0].processAPIError;
  config.errorProcessors[0].processAPIError = args => {
    apiErrors.push({ name: args.error.name, step: args.stepNumber });
    if (name === 'stop-backoff') setTimeout(() => stopped.abort(new Error('fixture-stop-backoff')), 10);
    return processError(args);
  };
  const provider = createOpenAI({ apiKey: 'synthetic', baseURL: 'https://openrouter.ai/api/v1',
    fetch: chain.createTextChainFetch({ provider: 'openrouter', usageMode: 'included', singleModelAttempt: true,
      textChain: { flex, maxRetries: 1, fallbackModels: [], fallbackDisabled: true } }, async (_url, init) => {
      const body = JSON.parse(init.body); calls.push({ at: performance.now(), body });
      if (toolCalls === 0) return complete(toolDelta);
      failedAttempts++;
      if (name.startsWith('recover-') && failedAttempts > 1) return complete({ role: 'assistant', content: 'recovered' });
      if (name === 'reset') throw new TypeError('network timeout after dispatch');
      if (['partial-text', 'tool-intent', 'reported-usage'].includes(name)) return sse([
        event(name === 'tool-intent' ? toolDelta : name === 'partial-text' ? { content: 'partial' } : {}, null,
          name === 'reported-usage' ? { prompt_tokens: 41, cost: 0.12 } : undefined),
        { error: { code: 503, message: 'Unavailable after observation' } },
      ]);
      return new Response(new ReadableStream({ start(controller) {
        if (name === 'partial-frame') controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"partial'));
        if (name === 'stop-active') setTimeout(() => stopped.abort(new Error('fixture-stop-active')), 5);
        init.signal.addEventListener('abort', () => controller.error(init.signal.reason), { once: true });
      } }), { headers: { 'content-type': 'text/event-stream' } });
    }) });
  const storage = new InMemoryStore({ id: `first-output-${name}` });
  const agent = new Agent({ id: `first-output-${name}`, name: 'First output fixture', instructions: 'Save once, then answer.',
    durable: { cleanupTimeoutMs: 0 }, memory: new Memory({ storage }),
    model: [{ model: provider.chat(modelId), maxRetries: 0 }], ...config,
    tools: { fixture_persist: createTool({ id: 'fixture-persist', description: 'Save one isolated fixture.',
      inputSchema: z.object({}), outputSchema: z.object({ saved: z.boolean() }),
      execute: async () => { toolCalls++; return { saved: true }; } }) } });
  const mastra = new Mastra({ agents: { fixture: agent }, storage, logger: false });
  // Exercise the real attempt deadline quickly through its existing scoped
  // execution port; no production timer constant or source is substituted.
  await chain.runWithAiExecutionUsage({ signal: stopped.signal, remainingMs: () => 25,
    beforeProviderCall: () => { if (stopped.signal.aborted) throw stopped.signal.reason; } },
  () => chain.runWithUsageLedger(ledger, async () => {
    try {
      const output = await mastra.getAgent('fixture').stream('Save the fixture, then answer.', {
        maxSteps: 3, maxRetries: 0, requestContext: context, abortSignal: stopped.signal,
        memory: { thread: `thread-${name}`, resource: `resource-${name}` },
      });
      for await (const chunk of output.fullStream) {
        if (chunk.type === 'text-delta') text += chunk.payload?.text ?? chunk.textDelta ?? '';
        if (chunk.type === 'error' || chunk.type === 'tripwire') emittedErrors.push(chunk.type);
      }
    } catch (error) { emittedErrors.push(error.name); }
  }));
  await mastra.shutdown();
  return { text, toolCalls, calls: calls.map(call => ({ model: call.body.model, tier: call.body.service_tier,
    messages: call.body.messages })), waitMs: calls[2] ? calls[2].at - calls[1].at : null, apiErrors, emittedErrors,
    ledger: ledger.calls, columns: ledger.columns(), stopped: stopped.signal.aborted };
}
(async () => {
  const result = {};
  for (const name of process.argv.slice(2)) result[name] = await scenario(name);
  process.stdout.write('RESULT=' + JSON.stringify({ unexpectedNetwork, scenarios: result }) + '\n');
})().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
