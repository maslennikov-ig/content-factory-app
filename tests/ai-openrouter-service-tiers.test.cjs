const chain = require('@contentfactory/nestjs-libraries/openai/ai.text-chain');
const url = 'https://openrouter.ai/api/v1/chat/completions';
const model = 'vendor/configured-author';
const source = (maxRetries = 1, extra = {}) => ({usageMode: 'included', provider: 'openrouter',
  textChain: {flex: true, maxRetries, fallbackModel: '', fallbackModels: [], fallbackDisabled: true}, ...extra});
const json = (status, value) => new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
const answer = service_tier => ({model: 'vendor/actual-author', service_tier,
  choices: [{message: {content: 'Answer'}, finish_reason: 'stop'}], usage: {prompt_tokens: 2, completion_tokens: 1, cost: 0.02}});
const post = extra => ({method: 'POST', body: JSON.stringify({model, messages: [{role: 'user', content: 'Synthetic'}], ...extra})});

test('configured vendor model requests Flex then at most one same-model Default within its retry budget', async () => {
  const calls = [], ledger = new chain.TextUsageLedger();
  const fetch = async (_url, init) => {calls.push(JSON.parse(init.body)); return calls.length === 1
    ? json(503, {error: {code: 503, message: 'No capacity'}}) : json(200, answer('default'));};
  const response = await chain.runWithUsageLedger(ledger, () => chain.createTextChainFetch(source(5), fetch)(url, post()));
  await response.text();
  expect(calls.map(body => [body.model, body.service_tier])).toEqual([[model, 'flex'], [model, 'default']]);
  expect(calls.every(body => body.provider?.only === undefined)).toBe(true);
  expect(ledger.calls[0]).toMatchObject({failed: true, requestedServiceTier: 'flex'});
  expect(ledger.calls[0].serviceTier).toBeUndefined();
  expect(ledger.columns()).toMatchObject({model: 'vendor/actual-author', serviceTier: 'default', costUsd: 0.02});
});

test.each([0, 1])('explicit maxRetries=%i bounds Default retries even when both tiers are unavailable', async maxRetries => {
  const calls = [];
  const fetch = async (_url, init) => {calls.push(JSON.parse(init.body)); return json(503, {error: {code: 503, message: 'No capacity'}});};
  expect((await chain.createTextChainFetch(source(maxRetries), fetch)(url, post())).status).toBe(503);
  expect(calls.map(body => body.service_tier)).toEqual(maxRetries ? ['flex', 'default'] : ['flex']);
});

test.each([400, 401, 402, 403, 422])('HTTP%i never gains a paid Default retry', async status => {
  const fetch = jest.fn(async () => json(status, {error: {code: status, message: 'flex service_tier is unavailable'}}));
  expect((await chain.createTextChainFetch(source(), fetch)(url, post())).status).toBe(status);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('a timeout/reset with unknown charge never gains a Default replay', async () => {
  const ledger = new chain.TextUsageLedger();
  const fetch = jest.fn(async () => {throw new TypeError('network timeout after dispatch');});
  await expect(chain.runWithUsageLedger(ledger, () => chain.createTextChainFetch(source(), fetch)(url, post())))
    .rejects.toThrow('network timeout');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(ledger.columns()).toMatchObject({serviceTier: null, possiblyBilled: true});
});

test.each([null, undefined, 'default', 'flex'])('actual tier %j stays independent of requested Flex', async tier => {
  const ledger = new chain.TextUsageLedger();
  const response = await chain.runWithUsageLedger(ledger, () => chain.createTextChainFetch(source(), async () => json(200, answer(tier)))(url, post()));
  await response.text();
  expect(ledger.calls[0].providerReportedModel).toBe('vendor/actual-author');
  expect(ledger.columns().serviceTier).toBe(tier ?? null);
});

test('an explicit null final SSE tier cannot inherit an earlier Flex tier', async () => {
  const ledger = new chain.TextUsageLedger(), encoder = new TextEncoder();
  const body = ['data: ' + JSON.stringify({model: 'vendor/actual-author', service_tier: 'flex', choices: [{delta: {content: 'Hi'}}]}),
    'data: ' + JSON.stringify({service_tier: null, choices: [], usage: {cost: 0.01}}), 'data: [DONE]'].join('\n\n') + '\n\n';
  const response = await chain.runWithUsageLedger(ledger, () => chain.createTextChainFetch(source(), async () => new Response(encoder.encode(body)))(url, post({stream: true})));
  await response.text();
  expect(ledger.columns()).toMatchObject({serviceTier: null, model: 'vendor/actual-author', costUsd: 0.01});
});

test('an explicitly selected own-key Flex profile is honored and explicit Default stays untouched', async () => {
  for (const flex of [true, false]) {
    const selected = source(0, {usageMode: 'workspace_key'}); selected.textChain.flex = flex;
    const fetch = jest.fn(async () => json(200, answer(null)));
    await chain.createTextChainFetch(selected, fetch)(url, post());
    expect(JSON.parse(fetch.mock.calls[0][1].body).service_tier).toBe(flex ? 'flex' : undefined);
  }
});

test.each(['openai/gpt-6.1-sol', 'openai/gpt-6.1-terra'])('existing explicit OpenAI Flex-only profile %s never broadens to Default', async selected => {
  const cfg = source(2); cfg.textChain.modelTiers = {[selected]: true};
  const calls = [];
  const fetch = async (_url, init) => {calls.push(JSON.parse(init.body)); return json(503, {error: {code: 503, message: 'No capacity'}});};
  expect((await chain.createTextChainFetch(cfg, fetch)(url, post({model: selected}))).status).toBe(503);
  expect(calls.map(body => body.service_tier)).toEqual(['flex', 'flex', 'flex']);
  expect(calls.every(body => body.provider?.only?.join(',') === 'openai/flex' && body.provider.allow_fallbacks === false)).toBe(true);
  expect(chain.allowsDefaultTierRetry(selected, cfg)).toBe(false);
});

test.each(['No endpoints for service_tier flex', 'No endpoints found for model vendor/missing'])('404 availability is narrow: %s', async message => {
  const fetch = jest.fn(async () => fetch.mock.calls.length === 1 ? json(404, {error: {code: 404, message}}) : json(200, answer('default')));
  const response = await chain.createTextChainFetch(source(), fetch)(url, post());
  expect(response.status).toBe(message.includes('service_tier') ? 200 : 404);
  expect(fetch).toHaveBeenCalledTimes(message.includes('service_tier') ? 2 : 1);
});

test('installed SDK and native Mastra share one tier budget without replaying output or tool work', () => {
  const {execFileSync} = require('node:child_process');
  const report = JSON.parse(execFileSync(process.execPath, ['tests/helpers/openrouter-tier-sdk-proof.cjs'], {
    cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8', timeout: 30000,
    maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }));
  expect(report.unexpectedNetwork).toBe(0);
  for (const name of ['wrapped503', 'flex404', 'reserved429']) {
    expect(report.scenarios[name]).toMatchObject({tiers: ['flex', 'default'], text: 'recovered'});
    expect(report.scenarios[name].columns.serviceTier).toBeNull();
    expect(report.scenarios[name].usage.at(-1).providerReportedModel).toBe('vendor/actual-author');
  }
  for (const name of ['invalid404', 'payment402', 'reserved402', 'keyLimit402', 'params400', 'zero', 'uncertain', 'partialText', 'toolIntent'])
    expect(report.scenarios[name].tiers).toEqual(['flex']);
  for (const value of Object.values(report.scenarios)) expect(value.models.every(id => id === model)).toBe(true);
  expect(report.scenarios.uncertain.columns).toMatchObject({serviceTier: null, possiblyBilled: true});
  expect(report.scenarios.defaultCap.tiers).toEqual(['flex', 'default']);
  expect(report.scenarios.committedTool).toMatchObject({tiers: ['flex', 'flex', 'default'], toolCalls: 1, text: 'recovered'});
});
