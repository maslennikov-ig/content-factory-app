'use strict';
const {loadTypeScriptModule} = require('./load-ts-module.cjs');
let unexpectedNetwork = 0;
global.fetch = async () => {unexpectedNetwork++; throw Error('UNEXPECTED_EXTERNAL_NETWORK');};
const chain = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.text-chain.ts');
const retry = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.native-retries.ts', {'./ai.text-chain': chain});
const {Agent} = require('@mastra/core/agent');
const {RequestContext} = require('@mastra/core/request-context');
const {createOpenAI} = require('@ai-sdk/openai');
const {createTool} = require('@mastra/core/tools');
const {z} = require('zod');
const modelId = 'vendor/configured-author';
const stream = (delta, finish = 'stop', error) => {
  const events = [{id: 'fixture', object: 'chat.completion.chunk', created: 0, model: 'vendor/actual-author',
    service_tier: 'default', choices: [{index: 0, delta, finish_reason: null}]}];
  if (error) events.push({error: {code: 503, message: 'Service unavailable after generated output'}});
  else events.push({id: 'fixture', object: 'chat.completion.chunk', created: 0, model: 'vendor/actual-author',
    service_tier: null, choices: [{index: 0, delta: {}, finish_reason: finish}],
    usage: {prompt_tokens: 3, completion_tokens: 1, total_tokens: 4, cost: 0.01}});
  return new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') + 'data: [DONE]\n\n',
    {headers: {'content-type': 'text/event-stream'}});
};
async function scenario(name, status = 503, maxRetries = 1) {
  let toolCalls = 0;
  const calls = [], errors = [], ledger = new chain.TextUsageLedger();
  const context = new RequestContext();
  const models = ['payment402', 'reserved402', 'keyLimit402', 'params400', 'invalid404', 'uncertain', 'partialText', 'toolIntent',
    'json200Partial', 'json200Spent', 'json503Spent', 'status425', 'status501'].includes(name)
    ? [modelId, 'vendor/forbidden-backup'] : [modelId];
  retry.setNativeTextMaxRetries(context, maxRetries, models);
  retry.setNativeTextTierPolicy(context, {provider: 'openrouter', flexModels: [modelId], defaultRetryModels: [modelId]});
  const source = {provider: 'openrouter', usageMode: 'included', singleModelAttempt: true,
    textChain: {flex: true, maxRetries, fallbackModel: '', fallbackModels: [], fallbackDisabled: true}};
  const provider = createOpenAI({apiKey: 'synthetic-test-only', baseURL: 'https://openrouter.ai/api/v1',
    fetch: chain.createTextChainFetch(source, async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body);
      if (name.startsWith('json') && calls.length === 1) return new Response(JSON.stringify({
        error: {code: 503, message: 'Service unavailable after observation'}, model: 'vendor/first-actual', service_tier: 'default',
        ...(name === 'json200Partial' ? {choices: [{message: {content: 'partial'}}]} : {usage: {cost: 0.12, prompt_tokens: 41, completion_tokens: 9}}),
      }), {status: name === 'json503Spent' ? 503 : 200, headers: {'content-type': 'application/json'}});
      if (name === 'uncertain') throw new TypeError('network timeout after dispatch');
      const tool = {role: 'assistant', tool_calls: [{index: 0, id: 'fixture-save', type: 'function', function: {name: 'fixture_persist', arguments: '{}'}}]};
      if (name === 'partialText') return stream({role: 'assistant', content: 'partial'}, 'stop', true);
      if (name === 'toolIntent') return stream(tool, 'tool_calls', true);
      if (name === 'committedTool' && toolCalls === 0) return stream(tool, 'tool_calls');
      if (body.service_tier === 'default' && name !== 'defaultCap') return stream({role: 'assistant', content: 'recovered'});
      const message = name === 'flex404' ? 'No endpoints for service_tier flex' : name === 'invalid404'
        ? 'No endpoints found for model vendor/missing' : 'Service temporarily unavailable';
      return new Response(JSON.stringify({error: {code: status, message,
        ...(name.startsWith('reserved') ? {metadata: {limit_source: 'openrouter_in_flight_budget'}} :
          name === 'keyLimit402' ? {metadata: {limit_source: 'openrouter_key_limit'}} : {})}}), {status, headers: {'content-type': 'application/json'}});
    })});
  const raw = provider.chat(modelId);
  const model = name !== 'wrapped503' ? raw : new Proxy(raw, {get(target, key) {
    if (key === 'doStream') return async (...args) => {
      try {return await target.doStream(...args);} catch (cause) {throw Object.assign(new Error('Wrapped provider failure'), {cause});}
    };
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  }});
  const config = retry.createNativeTextRetryConfig({defaultMaxRetries: maxRetries, delayMs: 0});
  const original = config.errorProcessors[0].processAPIError;
  config.errorProcessors[0].processAPIError = async args => {
    errors.push({name: args.error.name, status: args.error.statusCode, causeStatus: args.error.cause?.statusCode});
    return original(args);
  };
  const agent = new Agent({id: 'tier-proof-' + name, name: 'Tier proof', instructions: 'Synthetic fixture.',
    model: models.map(id => ({model: id === modelId ? model : provider.chat(id), maxRetries: 0})), ...config,
    tools: {fixture_persist: createTool({id: 'fixture-persist', description: 'Controlled fixture action.',
      inputSchema: z.object({}), outputSchema: z.object({saved: z.boolean()}),
      execute: async () => {toolCalls++; return {saved: true};}})}});
  let text = '', failure;
  await chain.runWithUsageLedger(ledger, async () => {
    try {text = await (await agent.stream('Synthetic fixture only.', {requestContext: context, maxSteps: 3,
      maxRetries: 0, modelSettings: {maxRetries: 0}})).text;}
    catch (error) {failure = error.name;}
  });
  return {tiers: calls.map(body => body.service_tier), models: calls.map(body => body.model), text,
    toolCalls, errors, failure, usage: ledger.calls, columns: ledger.columns()};
}
(async () => {
  const scenarios = {};
  const selected = process.argv.slice(2);
  for (const [name, status, retries] of [['wrapped503', 503, 1], ['flex404', 404, 1], ['invalid404', 404, 5],
    ['payment402', 402, 1], ['reserved402', 402, 1], ['keyLimit402', 402, 1], ['reserved429', 429, 1],
    ['params400', 400, 1], ['zero', 503, 0], ['defaultCap', 503, 5],
    ['uncertain', 503, 1], ['partialText', 503, 1], ['toolIntent', 503, 1], ['committedTool', 503, 1],
    ['json200Partial', 503, 1], ['json200Spent', 503, 1], ['json503Spent', 503, 1],
    ['status425', 425, 1], ['status501', 501, 1], ['status529', 529, 1]]) {
    if (selected.length ? !selected.includes(name) : /^(?:json|status)/.test(name)) continue;
    scenarios[name] = await scenario(name, status, retries);
  }
  process.stdout.write(JSON.stringify({unexpectedNetwork, node: process.version, scenarios}));
})().catch(error => {process.stderr.write(error.stack); process.exitCode = 1;});
