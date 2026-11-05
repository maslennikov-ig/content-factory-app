const chain = require('@contentfactory/nestjs-libraries/openai/ai.text-chain');
const {execFileSync} = require('node:child_process');
const url = 'https://openrouter.ai/api/v1/chat/completions';
const source = {usageMode: 'included', provider: 'openrouter',
  textChain: {flex: true, maxRetries: 1, fallbackModel: '', fallbackModels: [], fallbackDisabled: true}};
const post = () => ({method: 'POST', body: JSON.stringify({model: 'vendor/configured', messages: [{role: 'user', content: 'Synthetic'}]})});
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
const observed = [
  ['text', {choices: [{message: {content: 'partial'}}]}],
  ['choice text', {choices: [{text: 'partial'}]}],
  ['choice content', {choices: [{content: 'partial'}]}],
  ['reasoning', {choices: [{message: {reasoning: 'partial reasoning'}}]}],
  ['reasoning details', {choices: [{message: {reasoning_details: [{text: 'partial reasoning'}]}}]}],
  ['reasoning_content', {choices: [{delta: {reasoning_content: 'partial reasoning'}}]}],
  ['tool intent', {choices: [{message: {tool_calls: [{id: 'fixture', function: {name: 'fixture_action', arguments: '{}'}}]}}]}],
  ['function intent', {choices: [{message: {function_call: {name: 'fixture_action', arguments: '{}'}}}]}],
  ['reported charge', {usage: {cost: 0.12, prompt_tokens: 41, completion_tokens: 9}}],
  ['input tokens', {usage: {input_tokens: 41}}],
  ['output tokens', {usage: {output_tokens: 9}}],
  ['total tokens', {usage: {total_tokens: 50}}],
  ['reasoning tokens', {usage: {completion_tokens_details: {reasoning_tokens: 9}}}],
  ['cached tokens', {usage: {prompt_tokens_details: {cached_tokens: 12}}}],
];

test.each(observed.flatMap(([kind, body]) => [200, 503].map(status => [status, kind, body])))
  ('JSON HTTP%i with %s cannot replay and retains its first receipt', async (status, _kind, body) => {
    const payload = {error: {code: 503, message: 'Capacity unavailable'}, model: 'vendor/first-actual', service_tier: 'default', ...body};
    const fetch = jest.fn(async () => fetch.mock.calls.length === 1 ? json(status, payload) : json(200, {model: 'vendor/replacement', usage: {cost: 0.02}}));
    const ledger = new chain.TextUsageLedger();
    await expect(chain.runWithUsageLedger(ledger, () => chain.createTextChainFetch(source, fetch)(url, post())))
      .rejects.toMatchObject({textAttemptNonReplayable: true});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ledger.calls).toHaveLength(1);
    expect(ledger.calls[0]).toMatchObject({attempt: 1, model: 'vendor/first-actual', providerReportedModel: 'vendor/first-actual',
      requestedServiceTier: 'flex', serviceTier: 'default', failed: true, possiblyBilled: true});
    expect(ledger.columns()).toMatchObject({attempt: 1, costUsd: body.usage?.cost ?? null, possiblyBilled: true});
    if (body.usage?.prompt_tokens) expect(ledger.columns()).toMatchObject({promptTokens: 41, completionTokens: 9});
    if (body.usage?.input_tokens) expect(ledger.columns().promptTokens).toBe(41);
    if (body.usage?.output_tokens) expect(ledger.columns().completionTokens).toBe(9);
    if (body.usage?.completion_tokens_details) expect(ledger.columns().reasoningTokens).toBe(9);
    if (body.usage?.prompt_tokens_details) expect(ledger.columns().cachedTokens).toBe(12);
  });

test('a partial JSON receipt does not fabricate absent actual model or tier', async () => {
  const ledger = new chain.TextUsageLedger();
  await expect(chain.runWithUsageLedger(ledger, () => chain.createTextChainFetch(source,
    async () => json(200, {error: {code: 503, message: 'Unavailable'}, choices: [{message: {content: 'partial'}}], usage: {cost: 0.12}}))(url, post())))
    .rejects.toMatchObject({textAttemptNonReplayable: true});
  expect(ledger.calls[0].providerReportedModel).toBeUndefined();
  expect(ledger.calls[0].serviceTier).toBeUndefined();
  expect(ledger.columns()).toMatchObject({serviceTier: null, costUsd: 0.12, possiblyBilled: true});
});

test.each([200, 503])('zero-output/zero-usage JSON HTTP%i remains eligible for one Default attempt', async status => {
  const fetch = jest.fn(async () => fetch.mock.calls.length === 1
    ? json(status, {error: {code: 503, message: 'No capacity'}, usage: {cost: 0, prompt_tokens: 0, completion_tokens: 0}})
    : json(200, {model: 'vendor/recovered', service_tier: 'default', choices: [{message: {content: 'recovered'}}], usage: {cost: 0.02}}));
  const response = await chain.createTextChainFetch(source, fetch)(url, post());
  expect(response.status).toBe(200);
  expect(fetch.mock.calls.map(call => JSON.parse(call[1].body).service_tier)).toEqual(['flex', 'default']);
});

test.each([408, 429, 500, 502, 503, 504, 529, 425, 501, 505, 599])('availability status%i has the same bounded raw policy', status => {
  const eligible = [408, 429, 500, 502, 503, 504, 529].includes(status);
  expect(chain.isRetryableFailure(status, 'Provider refusal', {number: 1, model: 'vendor/configured', flex: true})).toBe(eligible);
});

test('installed native SDK cannot replay JSON partial/spend failures or broaden unsupported statuses', () => {
  const report = JSON.parse(execFileSync(process.execPath, ['tests/helpers/openrouter-tier-sdk-proof.cjs',
    'json200Partial', 'json200Spent', 'json503Spent', 'status425', 'status501', 'status529'], {
    cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8', timeout: 20000,
    maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }));
  expect(report.unexpectedNetwork).toBe(0);
  for (const name of ['json200Partial', 'json200Spent', 'json503Spent', 'status425', 'status501'])
    expect(report.scenarios[name].tiers).toEqual(['flex']);
  for (const value of Object.values(report.scenarios))
    expect(value.models.every(model => model === 'vendor/configured-author')).toBe(true);
  for (const name of ['json200Spent', 'json503Spent']) expect(report.scenarios[name].columns)
    .toMatchObject({costUsd: 0.12, promptTokens: 41, completionTokens: 9, possiblyBilled: true, serviceTier: 'default'});
  expect(report.scenarios.status529).toMatchObject({tiers: ['flex', 'default'], text: 'recovered'});
});
