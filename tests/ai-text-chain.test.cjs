/**
 * The shared text transport and its usage ledger (`content-factory-next-97dq.55`).
 *
 * Owner's default of 21.10.2026: text runs on `openai/gpt-6-luna` with
 * reasoning effort `medium` through flex → standard → discounted Sol6.1,
 * and every usage row records tokens, served tier, model, attempt and cost.
 * The transport is mocked; no request leaves the process.
 */
const { AsyncLocalStorage } = require('node:async_hooks');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
// The same instance the sources get through the Jest map, so the ledger that
// the usage service opens is the one the transport writes into.
const chain = require('@contentfactory/nestjs-libraries/openai/ai.text-chain');

const URL_ = 'https://openrouter.ai/api/v1/chat/completions';
const LUNA = 'openai/gpt-6-luna';

const included = {
  usageMode: 'included',
  provider: 'openrouter',
  textChain: chain.defaultTextChainSettings(),
  passthroughModels: ['openai/gpt-5-image'],
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const completion = (overrides = {}) => ({
  id: 'gen-1',
  model: LUNA,
  service_tier: 'flex',
  choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 40,
    completion_tokens_details: { reasoning_tokens: 25 },
    prompt_tokens_details: { cached_tokens: 60 },
    cost: 0.0000123,
  },
  ...overrides,
});

const sse = (events, { failAfter = false } = {}) => {
  const encoder = new TextEncoder();
  const queue = events.map((event) =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  );
  // Pulled one event at a time, so a failure lands after the events before
  // it were read, the way a dropped connection does.
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (queue.length) return controller.enqueue(queue.shift());
        if (failAfter) return controller.error(new TypeError('socket hang up'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );
};

/** A transport that answers from a script, one entry per call, and keeps the bodies. */
const scripted = (...answers) => {
  const calls = [];
  const fetch = jest.fn(async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const next = answers[calls.length - 1];
    if (!next) throw new Error(`unexpected call ${calls.length}`);
    return typeof next === 'function' ? next(init) : next;
  });
  return { fetch, calls };
};

const post = (body, extra = {}) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
  ...extra,
});

const request = { model: LUNA, messages: [{ role: 'user', content: 'hi' }] };

describe('text chain plan', () => {
  test('included OpenRouter walks one 60 s Luna Flex attempt, Standard, then Sol6.1 Flex', () => {
    expect(chain.planTextAttempts(LUNA, included)).toEqual([
      { number: 1, model: LUNA, flex: true, timeoutMs: 60_000 },
      { number: 2, model: LUNA, flex: false, timeoutMs: 60_000 },
      { number: 3, model: 'openai/gpt-6.1-sol', flex: true, timeoutMs: 60_000 },
    ]);
    // The SDK deadline covers every attempt at its longest non-streaming
    // window (F2), and the retry after a cut answer as a second pass (F1).
    expect(chain.textChainBudgetMs(LUNA, included)).toBe(5_000 + 2 * 3 * 180_000);
  });

  test('interactive chat: Luna Flex25s, Luna Standard, then Sol6.1 Flex25s', () => {
    const source = { ...included, profile: 'interactive' };
    expect(chain.planTextAttempts(LUNA, source)).toEqual([
      { number: 1, model: LUNA, flex: true, timeoutMs: 25_000 },
      { number: 2, model: LUNA, flex: false, timeoutMs: 60_000 },
      { number: 3, model: 'openai/gpt-6.1-sol', flex: true, timeoutMs: 25_000 },
    ]);
  });

  test('flex off leaves standard then fallback', () => {
    const source = { ...included, textChain: { flex: false, fallbackModel: 'z-ai/glm-5.3' } };
    expect(chain.planTextAttempts(LUNA, source).map((a) => [a.model, a.flex])).toEqual([
      [LUNA, false],
      ['z-ai/glm-5.3', false],
    ]);
  });

  test('a model without a flex endpoint and the fallback itself are not doubled', () => {
    expect(
      chain.planTextAttempts('openai/gpt-6.1-sol', included).map((a) => [a.model, a.flex])
    ).toEqual([['openai/gpt-6.1-sol', true]]);
    expect(
      chain.planTextAttempts('z-ai/glm-5.3', included).map((a) => [a.model, a.flex])
    ).toEqual([['z-ai/glm-5.3', false], ['openai/gpt-6.1-sol', true]]);
  });

  test('an explicitly empty chain preserves a single attempt for either key provider', () => {
    for (const source of [
      { ...included, usageMode: 'workspace_key', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } },
      { ...included, provider: 'openai', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } },
    ]) {
      expect(chain.planTextAttempts(LUNA, source)).toHaveLength(1);
      expect(chain.textChainApplies(source)).toBe(false);
    }
  });

  test('stored settings: NULL and empty read as the defaults', () => {
    expect(chain.resolveTextChainSettings(null)).toEqual({
      flex: true,
      fallbackModel: 'openai/gpt-6.1-sol',
    });
    expect(
      chain.resolveTextChainSettings({ textFlexEnabled: false, textFallbackModel: '  ' })
    ).toEqual({ flex: false, fallbackModel: 'openai/gpt-6.1-sol' });
    expect(
      chain.resolveTextChainSettings({ textFallbackModel: 'x/other' }).fallbackModel
    ).toBe('x/other');
  });
});

describe('text chain transport', () => {
  test('bodies: metering and medium effort on Luna and discounted Sol6.1', async () => {
    const { fetch, calls } = scripted(
      json(429, { error: { code: 429, message: 'flex capacity' } }),
      json(502, { error: { code: 502, message: 'bad gateway' } }),
      json(200, completion({ model: 'openai/gpt-6.1-sol', service_tier: 'flex' }))
    );
    const response = await chain.createTextChainFetch(included, fetch)(URL_, post(request));

    expect(response.status).toBe(200);
    expect(calls.map(({ body }) => [body.model, body.service_tier, body.reasoning])).toEqual([
      [LUNA, 'flex', { effort: 'medium' }],
      [LUNA, undefined, { effort: 'medium' }],
      ['openai/gpt-6.1-sol', 'flex', { effort: 'medium' }],
    ]);
    for (const { body } of calls) expect(body.usage).toEqual({ include: true });
  });

  test('a validation error is final: no second attempt, the 400 reaches the SDK', async () => {
    const { fetch, calls } = scripted(
      json(400, { error: { code: 400, message: 'response_format is invalid' } })
    );
    const response = await chain.createTextChainFetch(included, fetch)(URL_, post(request));
    expect(calls).toHaveLength(1);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 400, message: 'response_format is invalid' },
    });
  });

  test('network failure and an error in a 200 body both move on', async () => {
    const { fetch, calls } = scripted(
      async () => {
        throw new TypeError('fetch failed');
      },
      json(200, { error: { code: 429, message: 'Rate limit exceeded' } }),
      json(200, completion({ service_tier: 'default' }))
    );
    const response = await chain.createTextChainFetch(included, fetch)(URL_, post(request));
    expect(calls).toHaveLength(3);
    expect((await response.json()).choices[0].message.content).toBe('ok');
  });

  test('the last attempt fails the way the SDK always saw it', async () => {
    const failing = () => json(503, { error: { code: 503, message: 'down' } });
    const { fetch, calls } = scripted(failing(), failing(), failing());
    const response = await chain.createTextChainFetch(included, fetch)(URL_, post(request));
    expect(calls).toHaveLength(3);
    expect(response.status).toBe(503);
  });

  test('flex off: standard Luna, then GLM', async () => {
    const source = { ...included, textChain: { flex: false, fallbackModel: 'z-ai/glm-5.3' } };
    const { fetch, calls } = scripted(
      json(500, { error: { code: 500, message: 'x' } }),
      json(200, completion({ model: 'z-ai/glm-5.3' }))
    );
    await chain.createTextChainFetch(source, fetch)(URL_, post(request));
    expect(calls.map(({ body }) => [body.model, body.service_tier])).toEqual([
      [LUNA, undefined],
      ['z-ai/glm-5.3', undefined],
    ]);
  });

  test('workspace_key leaves the request byte-for-byte and never retries', async () => {
    const source = { ...included, usageMode: 'workspace_key', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } };
    const { fetch, calls } = scripted(json(503, { error: { code: 503, message: 'down' } }));
    const init = post(request);
    const response = await chain.createTextChainFetch(source, fetch)(URL_, init);
    expect(calls).toHaveLength(1);
    expect(calls[0].init).toBe(init);
    expect(response.status).toBe(503);
  });

  test('image requests and non-chat endpoints pass through', async () => {
    const { fetch, calls } = scripted(json(200, {}), json(200, {}));
    const run = chain.createTextChainFetch(included, fetch);
    const image = post({ ...request, model: 'openai/gpt-5-image' });
    await run(URL_, image);
    const models = post({});
    await run('https://openrouter.ai/api/v1/images/generations', models);
    expect(calls[0].init).toBe(image);
    expect(calls[1].init).toBe(models);
  });

  test("the caller's abort ends the chain", async () => {
    const controller = new AbortController();
    const { fetch, calls } = scripted(async () => {
      controller.abort();
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    await expect(
      chain.createTextChainFetch(included, fetch)(
        URL_,
        post(request, { signal: controller.signal })
      )
    ).rejects.toThrow('aborted');
    expect(calls).toHaveLength(1);
  });

  test('a flex attempt that outlives its deadline moves to the next one', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
    try {
      const hang = (init) =>
        new Promise((_, reject) =>
          init.signal.addEventListener('abort', () => reject(init.signal.reason))
        );
      const { fetch, calls } = scripted(hang, json(200, completion()));
      const pending = chain.createTextChainFetch(included, fetch)(URL_, post(request));
      await jest.advanceTimersByTimeAsync(59_000);
      expect(calls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1_000);
      const response = await pending;
      expect(calls).toHaveLength(2);
      expect(calls[1].body.service_tier).toBeUndefined();
      expect(response.status).toBe(200);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('OpenRouter in-flight credit reservation', () => {
  const metadata = { limit_source: 'openrouter_in_flight_budget', reason: 'in_flight_budget_exhausted' };
  const source = { ...included, usageMode: 'workspace_key', singleModelAttempt: true };
  const refusal = (details = metadata) => ({ error: { code: 402, message: 'Private provider diagnostic.', metadata: details } });

  test.each([metadata, { limit_source: metadata.limit_source }, { limit_source: metadata.limit_source, reason: 'future_reason' }])(
    'the exact transient source becomes 429, preserving body, Retry-After and request limits: %j', async details => {
    const body = `  ${JSON.stringify(refusal(details))}\n`;
    const { fetch, calls } = scripted(new Response(body, { status: 402,
      headers: { 'content-type': 'application/json', 'retry-after': '1', 'x-request-id': 'credit-reservation-test' } }));
    const init = post({ ...request, max_tokens: 87, temperature: 0.2 });
    const ledger = new chain.TextUsageLedger();
    const response = await chain.runWithUsageLedger(ledger, () => chain.createTextChainFetch({ ...source, outputLimits: { [LUNA]: 87 } }, fetch)(URL_, init));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('1');
    expect(response.headers.get('x-request-id')).toBe('credit-reservation-test');
    expect(await response.text()).toBe(body);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.max_tokens).toBe(87);
    expect(calls[0].body.temperature).toBe(0.2);
    expect(ledger.calls).toHaveLength(1);
    expect(ledger.calls[0]).toMatchObject({ failed: true });
    expect(ledger.calls[0].possiblyBilled).toBeUndefined();
  });

  test.each([
    ['key limit', { limit_source: 'openrouter_key_limit', reason: 'in_flight_budget_exhausted' }],
    ['credits', { limit_source: 'openrouter_credits', reason: 'weight_exceeds_budget' }],
    ['reason without source', { reason: 'in_flight_budget_exhausted' }],
    ['unknown', {}],
  ])('%s remains a terminal 402 even with the same message and Retry-After', async (_label, details) => {
    const body = refusal(details);
    const { fetch, calls } = scripted(new Response(JSON.stringify(body), { status: 402,
      headers: { 'content-type': 'application/json', 'retry-after': '1' } }));
    const response = await chain.createTextChainFetch(included, fetch)(URL_, post(request));
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual(body);
    expect(calls).toHaveLength(1);
  });

  test.each([
    ['OpenAI provider', { ...source, provider: 'openai' }, URL_],
    ['OpenAI endpoint', source, 'https://api.openai.com/v1/chat/completions'],
    ['embeddings', source, 'https://openrouter.ai/api/v1/embeddings'],
  ])('%s does not normalize the refusal', async (_label, config, url) => {
    const original = json(402, refusal());
    const { fetch, calls } = scripted(original);
    const response = await chain.createTextChainFetch(config, fetch)(url, post(request));
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual(refusal());
    expect(calls).toHaveLength(1);
  });

  test('non-JSON 402 and successful streams retain their bodies without a new success-body read', async () => {
    const success = sse([{ choices: [{ delta: { content: 'unchanged' } }] }]);
    const read = jest.spyOn(success, 'text');
    const clone = jest.spyOn(success, 'clone');
    const { fetch, calls } = scripted(new Response('opaque refusal', { status: 402 }), success);
    const run = chain.createTextChainFetch({ ...source, passthroughModels: [LUNA] }, fetch);
    const opaque = await run(URL_, post(request));
    expect(opaque.status).toBe(402);
    expect(await opaque.text()).toBe('opaque refusal');
    const result = await run(URL_, post({ ...request, stream: true }));
    expect(result).toBe(success);
    expect(read).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
    await result.body.cancel();
    expect(calls).toHaveLength(2);
  });

  test('Stop interrupts a stalled 402 body read without another request', async () => {
    const abort = new AbortController();
    let close;
    const { fetch, calls } = scripted(new Response(new ReadableStream({ start(controller) { close = () => controller.close(); } }), { status: 402 }));
    const pending = chain.createTextChainFetch(source, fetch)(URL_, post(request, { signal: abort.signal }));
    const rejected = expect(pending).rejects.toThrow('stop-credit-body');
    await new Promise(resolve => setImmediate(resolve));
    abort.abort(new Error('stop-credit-body'));
    close();
    await rejected;
    expect(calls).toHaveLength(1);
  });

  test('authority failures remain terminal around a documented temporary provider cause', () => {
    const { execFileSync } = require('node:child_process');
    const output = execFileSync(process.execPath, ['-e', `
      const { loadTypeScriptModule } = require('./tests/helpers/load-ts-module.cjs');
      const chain = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.text-chain.ts');
      const retry = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.native-retries.ts', { './ai.text-chain': chain });
      const provider = { statusCode: 429, url: ${JSON.stringify(URL_)}, message: 'credit balance temporarily reserved',
        responseBody: JSON.stringify({ error: { metadata: ${JSON.stringify(metadata)} } }) };
      const authority = ['Permission denied', 'consent_denied', 'invalid_api_key', 'access_denied', 'bad_request'];
      console.log(JSON.stringify({ wrappedBilling: retry.isTransientNativeTextError({ message: 'credit balance temporarily reserved', cause: provider }),
        authority: authority.map(message => retry.isTransientNativeTextError({ message, cause: provider })),
        hardStatus: retry.isTransientNativeTextError({ statusCode: 402, cause: provider }),
        stopped: retry.isTransientNativeTextError({ name: 'AbortError', cause: provider }),
        budget: retry.isTransientNativeTextError({ executionBudgetStop: true, cause: provider }) }));
    `], { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8', timeout: 10_000 });
    expect(JSON.parse(output.trim())).toEqual({ wrappedBilling: true, authority: [false, false, false, false, false],
      hardStatus: false, stopped: false, budget: false });
  });

  test.each([
    ['transient', metadata, 2],
    ['transient credit wording', metadata, 2],
    ['transient wrapped billing', metadata, 2],
    ['permanent key', { limit_source: 'openrouter_key_limit' }, 1],
    ['permanent credits', { limit_source: 'openrouter_credits', reason: 'weight_exceeds_budget' }, 1],
    ['permanent unknown', {}, 1],
    ['permanent wrapped permission', metadata, 1],
    ['permanent wrapped consent', metadata, 1],
    ['permanent wrapped auth', metadata, 1],
    ['stop', metadata, 1],
  ])(
    'the actual native SDK owns %s retry count and preserves accounting', (_label, details, expectedCalls) => {
      const { execFileSync } = require('node:child_process');
      const output = execFileSync(process.execPath, ['-e', `
        const { loadTypeScriptModule } = require('./tests/helpers/load-ts-module.cjs');
        const chain = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.text-chain.ts');
        const retry = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.native-retries.ts', { './ai.text-chain': chain });
        const { Agent } = require('@mastra/core/agent');
        const { RequestContext } = require('@mastra/core/request-context');
        const { createOpenAI } = require('@ai-sdk/openai');
        const details = ${JSON.stringify(details)};
        const diagnostic = ${JSON.stringify(_label.includes('wording') ? 'credit balance temporarily reserved' : 'Private provider diagnostic.')};
        const wrapperMessage = ${JSON.stringify(_label.includes('wrapped') ?
          _label.includes('permission') ? 'Permission denied' : _label.includes('consent') ? 'consent_denied' :
          _label.includes('auth') ? 'invalid_api_key' : 'credit balance temporarily reserved' : null)};
        const stopping = ${JSON.stringify(_label === 'stop')};
        const stopped = new AbortController();
        const calls = [], errors = [];
        const config = retry.createNativeTextRetryConfig({ defaultMaxRetries: 1, delayMs: 0 });
        const handleError = config.errorProcessors[0].processAPIError;
        config.errorProcessors[0].processAPIError = async args => {
          errors.push({ status: args.error.statusCode, retryAfter: args.error.responseHeaders?.['retry-after'] });
          if (stopping) setTimeout(() => stopped.abort(new Error('stop-native-credit-backoff')), 15);
          return handleError(args);
        };
        const fetch = async (_url, init) => {
          calls.push({ at: performance.now(), body: JSON.parse(init.body) });
          if (calls.length === 1) return new Response(JSON.stringify({ error: { code: 402, message: diagnostic, metadata: details } }),
            { status: 402, headers: { 'content-type': 'application/json', 'retry-after': '1' } });
          const events = [
            { id: 'native-credit', object: 'chat.completion.chunk', created: 0, model: 'test-credit-model', choices: [{ index: 0, delta: { role: 'assistant', content: 'recovered' }, finish_reason: null }] },
            { id: 'native-credit', object: 'chat.completion.chunk', created: 0, model: 'test-credit-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4, cost: 0.0001 } },
          ];
          return new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\\n\\n').join('') + 'data: [DONE]\\n\\n',
            { headers: { 'content-type': 'text/event-stream' } });
        };
        const provider = createOpenAI({ apiKey: 'synthetic', baseURL: 'https://openrouter.ai/api/v1',
          fetch: chain.createTextChainFetch({ provider: 'openrouter', usageMode: 'included', singleModelAttempt: true,
            textChain: { flex: false, fallbackModel: '', fallbackModels: [] } }, fetch) });
        const models = ['test-credit-primary', 'test-credit-backup'];
        const context = new RequestContext();
        retry.setNativeTextMaxRetries(context, 1, models);
        const wrap = model => !wrapperMessage ? model : new Proxy(model, { get(target, property) {
          if (property === 'doStream') return async (...args) => {
            try { return await target.doStream(...args); }
            catch (error) { throw Object.assign(new Error(wrapperMessage), { cause: error }); }
          };
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
        const agent = new Agent({ id: 'native-credit-retry', name: 'Credit retry test', instructions: 'Reply once.',
          model: models.map(model => ({ model: wrap(provider.chat(model)), maxRetries: 0 })), ...config });
        const ledger = new chain.TextUsageLedger();
        chain.runWithUsageLedger(ledger, async () => {
          let text = '', failure;
          try { text = await (await agent.stream('Reply once.', { maxRetries: 0, requestContext: context, abortSignal: stopped.signal })).text; }
          catch (error) { failure = error.message; }
          console.log('RESULT=' + JSON.stringify({ text, failure, calls: calls.length, models: calls.map(call => call.body.model),
            elapsedAfterFirstMs: performance.now() - calls[0].at, waitMs: calls[1] ? calls[1].at - calls[0].at : null,
            errors, ledger: ledger.calls.map(call => ({ failed: call.failed === true, possiblyBilled: call.possiblyBilled === true, costUsd: call.costUsd })) }));
        }).catch(error => { console.error(error); process.exitCode = 1; });
      `], { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8', timeout: 12_000, stdio: ['ignore', 'pipe', 'pipe'] });
      const report = JSON.parse(output.split('\n').find(line => line.startsWith('RESULT=')).slice(7));
      expect(report.calls).toBe(expectedCalls);
      expect(report.models).toEqual(Array(expectedCalls).fill('test-credit-primary'));
      if (!_label.includes('wrapped')) expect(report.errors[0]).toEqual({ status: details.limit_source === metadata.limit_source ? 429 : 402, retryAfter: '1' });
      expect(report.ledger).toHaveLength(expectedCalls);
      expect(report.ledger[0]).toEqual({ failed: true, possiblyBilled: false });
      if (expectedCalls === 2) {
        expect(report.text).toBe('recovered');
        expect(report.waitMs).toBeGreaterThanOrEqual(900);
        expect(report.ledger[1]).toEqual({ failed: false, possiblyBilled: false, costUsd: 0.0001 });
      }
      if (_label === 'stop') expect(report.elapsedAfterFirstMs).toBeLessThan(900);
    }, 15_000
  );
});

describe('native OpenRouter HTTP 200 error envelopes and empty streams', () => {
  const source = { ...included, singleModelAttempt: true };
  const refusal = (code) => ({ error: { code,
    message: code === 502 ? 'Flex processing is temporarily unavailable.' : 'Provider refused the request.',
    metadata: { error_type: 'provider_unavailable' } } });

  test.each([false, true])('surfaces the provider status before the SDK, stream=%s', async stream => {
    const body = ` ${JSON.stringify(refusal(502))}\n`;
    const { fetch, calls } = scripted(new Response(body, { status: 200,
      headers: { 'content-type': 'application/json', 'retry-after': '1', 'x-request-id': 'fixture-envelope' } }));
    const ledger = new chain.TextUsageLedger();
    const response = await chain.runWithUsageLedger(ledger, () =>
      chain.createTextChainFetch(source, fetch)(URL_, post({ ...request, stream })));
    expect(response.status).toBe(502);
    expect(await response.text()).toBe(body);
    expect(response.headers.get('retry-after')).toBe('1');
    expect(response.headers.get('x-request-id')).toBe('fixture-envelope');
    expect(calls).toHaveLength(1);
    expect(ledger.calls).toEqual([expect.objectContaining({ failed: true })]);
    expect(ledger.calls[0].possiblyBilled).not.toBe(true);
  });

  test('a successful JSON body remains unchanged for a streaming request', async () => {
    const body = JSON.stringify(completion());
    const { fetch, calls } = scripted(new Response(body, { headers: { 'content-type': 'application/json' } }));
    const response = await chain.createTextChainFetch(source, fetch)(URL_, post({ ...request, stream: true }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
    expect(calls).toHaveLength(1);
  });

  test.each([false, true])('native SSE retains its bytes and accounting, error=%s', async failed => {
    const event = failed ? refusal(502) : completion();
    const body = `data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`;
    const { fetch, calls } = scripted(new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
    const ledger = new chain.TextUsageLedger();
    const response = await chain.runWithUsageLedger(ledger, () =>
      chain.createTextChainFetch(source, fetch)(URL_, post({ ...request, stream: true })));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toBe(body);
    expect(calls).toHaveLength(1);
    expect(ledger.calls).toHaveLength(1);
    expect(ledger.calls[0].failed === true).toBe(failed);
    if (!failed) expect(ledger.calls[0].costUsd).toBe(completion().usage.cost);
  });

  test('a native call to another provider retains its original status', async () => {
    const body = JSON.stringify(refusal(502));
    const { fetch } = scripted(new Response(body, { headers: { 'content-type': 'application/json' } }));
    const response = await chain.createTextChainFetch(source, fetch)('https://api.openai.com/v1/chat/completions', post(request));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
  });

  test('Stop interrupts an unfinished JSON envelope without another native attempt', async () => {
    const abort = new AbortController();
    let canceled = false;
    const { fetch, calls } = scripted(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"error":')); },
      cancel() { canceled = true; },
    }), { headers: { 'content-type': 'application/json' } }));
    const pending = chain.createTextChainFetch(source, fetch)(URL_, post({ ...request, stream: true }, { signal: abort.signal }));
    const rejected = expect(pending).rejects.toThrow('stop-envelope-read');
    await new Promise(resolve => setImmediate(resolve));
    abort.abort(new Error('stop-envelope-read'));
    await rejected;
    expect(calls).toHaveLength(1);
    expect(canceled).toBe(true);
  });

  test('empty stream recovery requires the native identity and retains terminal guards', () => {
    const { execFileSync } = require('node:child_process');
    const output = execFileSync(process.execPath, ['-e', `
      const { loadTypeScriptModule } = require('./tests/helpers/load-ts-module.cjs');
      const retry = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.native-retries.ts');
      const empty = { id: 'AGENT_STREAM_ERROR', message: 'Agent stream finished with finishReason "other" without producing any output' };
      const errors = [empty, new Error(empty.message), { ...empty, id: 'UNKNOWN' },
        { ...empty, message: 'Agent stream finished with finishReason "error" but no error payload was provided' },
        { ...empty, message: empty.message + ' unexpected detail' }, { ...empty, isRetryable: false },
        { name: 'AbortError', cause: empty }, { executionBudgetStop: true, cause: empty },
        { statusCode: 401, cause: empty }, { statusCode: 402, cause: empty },
        { message: 'insufficient_quota', cause: empty }, { message: 'permission_denied', cause: empty }];
      console.log(JSON.stringify(errors.map(retry.isTransientNativeTextError)));
    `], { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8', timeout: 10_000 });
    expect(JSON.parse(output.trim())).toEqual([true, ...Array(11).fill(false)]);
  });

  test.each([[502, 0], [502, 1], [401, 0], [402, 0], ['empty', 0], ['empty', 1], ['empty-stop', 1]])(
    'the durable native SDK handles envelope %s with maxRetries=%s after one committed tool', (code, maxRetries) => {
      const emptyStream = String(code).startsWith('empty');
      const stopping = code === 'empty-stop';
      const recovers = code === 502 || code === 'empty';
      const { execFileSync } = require('node:child_process');
      const output = execFileSync(process.execPath, ['-e', `
        const { loadTypeScriptModule } = require('./tests/helpers/load-ts-module.cjs');
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
        const calls = [], errors = [], emptyErrors = [];
        const stopped = new AbortController();
        let toolCalls = 0;
        const models = ['fixture-envelope-primary', 'fixture-envelope-backup'];
        const config = retry.createNativeTextRetryConfig({ defaultMaxRetries: ${maxRetries}, delayMs: ${stopping ? 1000 : 0} });
        const handleError = config.errorProcessors[0].processAPIError;
        config.errorProcessors[0].processAPIError = args => {
          errors.push(args.error.statusCode ?? null);
          emptyErrors.push(args.error.id === 'AGENT_STREAM_ERROR' &&
            args.error.message === 'Agent stream finished with finishReason "other" without producing any output');
          if (${stopping}) setTimeout(() => stopped.abort(new Error('fixture-stop-empty-retry')), 10);
          return handleError(args);
        };
        const stream = (model, tool) => {
          const chunks = [
            { id: 'fixture', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0,
              delta: tool ? { role: 'assistant', tool_calls: [{ index: 0, id: 'fixture-save', type: 'function',
                function: { name: 'fixture_persist', arguments: '{}' } }] } : { role: 'assistant', content: 'recovered' }, finish_reason: null }] },
            { id: 'fixture', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta: {},
              finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4, cost: 0.0001 } },
          ];
          return new Response(chunks.map(chunk => 'data: ' + JSON.stringify(chunk) + '\\n\\n').join('') + 'data: [DONE]\\n\\n',
            { headers: { 'content-type': 'text/event-stream' } });
        };
        const provider = createOpenAI({ apiKey: 'synthetic', baseURL: ${JSON.stringify(URL_.replace('/chat/completions', ''))},
          fetch: chain.createTextChainFetch({ provider: 'openrouter', usageMode: 'included', singleModelAttempt: true,
            textChain: { flex: false, fallbackDisabled: true, fallbackModels: [] } }, async (_url, init) => {
            const body = JSON.parse(init.body);
            calls.push(body.model);
            if (toolCalls === 0) return stream(body.model, true);
            if (${emptyStream} && body.model === models[0]) {
              const event = { id: 'fixture-empty', object: 'chat.completion.chunk', created: 0, model: body.model,
                choices: [{ index: 0, delta: {}, finish_reason: null }],
                usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4, cost: 0.0001 } };
              return new Response('data: ' + JSON.stringify(event) + '\\n\\ndata: [DONE]\\n\\n',
                { headers: { 'content-type': 'text/event-stream' } });
            }
            if (body.model === models[0]) return new Response(${JSON.stringify(JSON.stringify(refusal(code)))},
              { headers: { 'content-type': 'application/json' } });
            return stream(body.model, false);
          }) });
        const storage = new InMemoryStore({ id: 'fixture-envelope-store' });
        const agent = new Agent({ id: 'fixture-envelope', name: 'Envelope fixture', instructions: 'Save once, then answer.',
          durable: { cleanupTimeoutMs: 0 }, memory: new Memory({ storage }),
          model: models.map(model => ({ model: provider.chat(model), maxRetries: 0 })), ...config,
          tools: { fixture_persist: createTool({ id: 'fixture-persist', description: 'Commit the fixture once.',
            inputSchema: z.object({}), outputSchema: z.object({ saved: z.boolean() }),
            execute: async () => { toolCalls++; return { saved: true }; } }) } });
        const mastra = new Mastra({ agents: { fixture: agent }, storage, logger: false });
        const context = new RequestContext();
        retry.setNativeTextMaxRetries(context, ${maxRetries}, models);
        const ledger = new chain.TextUsageLedger();
        chain.runWithUsageLedger(ledger, async () => {
          let text = '', failure = false;
          try {
            const output = await mastra.getAgent('fixture').stream('Run the fixture.', {
              maxSteps: 3, maxRetries: 0, requestContext: context, abortSignal: stopped.signal,
              memory: { thread: 'fixture-envelope-thread', resource: 'fixture-envelope-resource' },
            });
            for await (const chunk of output.fullStream) {
              if (chunk.type === 'text-delta') text += chunk.payload?.text ?? chunk.textDelta ?? '';
              if (chunk.type === 'tripwire' || chunk.type === 'error') failure = true;
            }
          } catch { failure = true; }
          await mastra.shutdown();
          console.log('RESULT=' + JSON.stringify({ text, failure, calls, toolCalls, errors, emptyErrors,
            ledger: ledger.calls.map(call => ({ failed: call.failed === true, possiblyBilled: call.possiblyBilled === true, costUsd: call.costUsd })) }));
        }).catch(() => { process.exitCode = 1; });
      `], { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] });
      const result = JSON.parse(output.split('\n').find(line => line.startsWith('RESULT=')).slice(7));
      const expected = recovers
        ? ['fixture-envelope-primary', ...Array(maxRetries + 1).fill('fixture-envelope-primary'), 'fixture-envelope-backup']
        : ['fixture-envelope-primary', 'fixture-envelope-primary'];
      const expectedErrors = recovers ? maxRetries + 1 : 1;
      expect(result.calls).toEqual(expected);
      expect(result.toolCalls).toBe(1);
      expect(result.errors).toEqual(Array(expectedErrors).fill(emptyStream ? null : code));
      expect(result.emptyErrors).toEqual(Array(expectedErrors).fill(emptyStream));
      expect(result.text).toBe(recovers ? 'recovered' : '');
      if (recovers) expect(result.failure).toBe(false);
      expect(result.ledger).toHaveLength(expected.length);
      expect(result.ledger.filter(call => call.failed)).toEqual(Array(emptyStream ? 0 : expectedErrors)
        .fill({ failed: true, possiblyBilled: false }));
      if (emptyStream) expect(result.ledger.map(call => call.costUsd)).toEqual(Array(expected.length).fill(0.0001));
    }, 20_000
  );
});

describe('streaming through the chain', () => {
  const chunk = (content, extra = {}) => ({
    id: 's',
    model: LUNA,
    choices: [{ index: 0, delta: { content } }],
    ...extra,
  });
  const readAll = async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text;
      text += decoder.decode(value);
    }
  };

  test('an error before the first token falls to the next attempt; the stream is still a stream', async () => {
    const { fetch, calls } = scripted(
      sse([{ error: { code: 429, message: 'flex capacity' } }]),
      sse([
        chunk('Hel'),
        chunk('lo'),
        chunk('', {
          service_tier: 'flex',
          usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.001 },
        }),
      ])
    );
    const ledger = new chain.TextUsageLedger();
    const response = await chain.runWithUsageLedger(ledger, () =>
      chain.createTextChainFetch(included, fetch)(URL_, post({ ...request, stream: true }))
    );
    expect(calls).toHaveLength(2);
    expect(response.body).toBeInstanceOf(ReadableStream);
    const text = await readAll(response);
    expect(text).toContain('"Hel"');
    expect(text).toContain('[DONE]');
    expect(ledger.columns()).toMatchObject({
      attempt: 2,
      serviceTier: 'flex',
      promptTokens: 10,
      completionTokens: 2,
      costUsd: 0.001,
    });
  });

  test('a flex stream with no first token in 60 s moves to standard; after the first token no deadline applies (97dq.94)', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
    try {
      const silent = (init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init.signal.addEventListener('abort', () => controller.error(init.signal.reason));
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } }
        );
      const { fetch, calls } = scripted(silent, sse([chunk('Hel'), chunk('lo')]));
      const pending = chain.createTextChainFetch(included, fetch)(URL_, post({ ...request, stream: true }));
      await jest.advanceTimersByTimeAsync(60_000);
      const response = await pending;
      expect(calls.map(({ body }) => body.service_tier)).toEqual(['flex', undefined]);
      await jest.advanceTimersByTimeAsync(120_000);
      expect(await readAll(response)).toContain('"lo"');
    } finally {
      jest.useRealTimers();
    }
  });

  test('a failure after the first token is surfaced, never restarted', async () => {
    const { fetch, calls } = scripted(sse([chunk('Hel')], { failAfter: true }));
    const response = await chain.createTextChainFetch(included, fetch)(
      URL_,
      post({ ...request, stream: true })
    );
    await expect(readAll(response)).rejects.toThrow('socket hang up');
    expect(calls).toHaveLength(1);
  });
});

describe('usage capture', () => {
  test('the winning attempt, served model, tier, tokens and cost', async () => {
    const { fetch } = scripted(
      json(429, { error: { code: 429, message: 'capacity' } }),
      json(200, completion())
    );
    const ledger = new chain.TextUsageLedger();
    await chain.runWithUsageLedger(ledger, () =>
      chain.createTextChainFetch(included, fetch)(URL_, post(request))
    );
    expect(ledger.columns()).toEqual({
      model: LUNA,
      serviceTier: 'flex',
      attempt: 2,
      promptTokens: 100,
      completionTokens: 40,
      reasoningTokens: 25,
      cachedTokens: 60,
      costUsd: 0.0000123,
      // The refused flex attempt answered; nothing ran unanswered (tcxv).
      possiblyBilled: false,
    });
  });

  test('workspace_key calls are recorded too, as attempt 1', async () => {
    const { fetch } = scripted(json(200, completion({ service_tier: 'default' })));
    const ledger = new chain.TextUsageLedger();
    await chain.runWithUsageLedger(ledger, () =>
      chain.createTextChainFetch({ ...included, usageMode: 'workspace_key', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } }, fetch)(
        URL_,
        post(request)
      )
    );
    expect(ledger.columns()).toMatchObject({ attempt: 1, serviceTier: 'default', promptTokens: 100 });
  });

  test('an operation of several calls sums tokens and keeps the furthest attempt', () => {
    const ledger = new chain.TextUsageLedger();
    ledger.record({ attempt: 1, model: LUNA, serviceTier: 'flex', promptTokens: 10, costUsd: 0.1 });
    ledger.record({ attempt: 4, model: 'z-ai/glm-5.3', promptTokens: 5 });
    ledger.record({ attempt: 1, model: LUNA, serviceTier: 'flex', promptTokens: 1, costUsd: 0.2 });
    expect(ledger.columns()).toMatchObject({
      model: 'z-ai/glm-5.3',
      serviceTier: null,
      attempt: 4,
      promptTokens: 16,
      completionTokens: null,
      costUsd: expect.closeTo(0.3, 10),
    });
    expect(new chain.TextUsageLedger().columns()).toBeUndefined();
  });

  test('direct SDK calls get the chain budget only from a chained client', () => {
    const chained = {};
    chain.registerChainClient(chained, 485_000);
    expect(chain.textRequestOptions(chained)).toEqual({ maxRetries: 0, timeout: 485_000 });
    expect(chain.textRequestOptions({})).toEqual({ maxRetries: 0, timeout: 60_000 });
  });

  let usageServiceClass;
  test('the usage service writes what the transport heard into the row it admitted', async () => {
    const active = new AsyncLocalStorage();
    const update = jest.fn(async () => ({}));
    const create = jest.fn(async ({ data }) => ({ id: 'usage-1', ...data }));
    const config = {
      usageMode: 'workspace_key',
      provider: 'openrouter',
      apiKey: 'own',
      textModel: LUNA,
      imageModel: 'openai/gpt-5-image',
      search: { enabled: false, apiKey: '' },
    };
    const { AiUsageService } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/openai/ai.usage.service.ts',
      {
        '@prisma/client': {
          Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
        },
        '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
          PrismaService: class {},
        },
        '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
          AiProviderNotConfigured: class extends Error {},
          loadAiConfig: async () => config,
          getActiveAiConfig: (id) =>
            active.getStore()?.organizationId === id ? active.getStore().config : undefined,
          getActiveAiOrganizationId: () => active.getStore()?.organizationId,
          withActiveAiConfig: (organizationId, next, callback) =>
            active.run({ organizationId, config: next }, callback),
          setAiProviderSettingReader: () => undefined,
          setInstanceAiDefaultsReader: () => undefined,
          INSTANCE_AI_DEFAULTS_ID: 'instance',
        },
        '@contentfactory/nestjs-libraries/openai/ai.roles': loadTypeScriptModule(
          'libraries/nestjs-libraries/src/openai/ai.roles.ts'
        ),
        '@contentfactory/nestjs-libraries/user/acting.user': {
          getActingUserId: () => undefined,
        },
        // This loader compiles its own copy of repository imports; the ledger
        // store must be the one the transport below writes into.
        '@contentfactory/nestjs-libraries/openai/ai.text-chain': chain,
      }
    );
    usageServiceClass = AiUsageService;
    const service = new AiUsageService({ aiUsageRecord: { create, update } });
    const { fetch } = scripted(json(200, completion({ model: 'openai/gpt-6-luna-20260901' })));
    const transport = chain.createTextChainFetch(
      { usageMode: 'workspace_key', provider: 'openrouter' },
      fetch
    );

    await service.executeAiOperation('organization-a', 'text_generation', () =>
      transport(URL_, post(request))
    );

    expect(create.mock.calls[0][0].data.model).toBe(LUNA);
    // The status goes first and alone; the usage columns follow (review F16).
    expect(update.mock.calls[0][0]).toEqual({
      where: { id: 'usage-1' },
      data: { status: 'succeeded' },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'usage-1' },
      data: {
        model: 'openai/gpt-6-luna-20260901',
        serviceTier: 'flex',
        attempt: 1,
        promptTokens: 100,
        completionTokens: 40,
        reasoningTokens: 25,
        cachedTokens: 60,
        costUsd: 0.0000123,
      },
    });
  });

  test('a failed usage-columns write does not lose the status (review F16)', async () => {
    const statuses = [];
    const update = jest.fn(async ({ data }) => {
      if (data.status) {
        statuses.push(data.status);
        return {};
      }
      throw new Error('column "promptTokens" does not exist');
    });
    const create = jest.fn(async ({ data }) => ({ id: 'usage-2', ...data }));
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new usageServiceClass({ aiUsageRecord: { create, update } });
    const { fetch } = scripted(json(200, completion()));
    const transport = chain.createTextChainFetch(
      { usageMode: 'workspace_key', provider: 'openrouter' },
      fetch
    );
    const response = await service.executeAiOperation('organization-a', 'text_generation', () =>
      transport(URL_, post(request))
    );
    expect(response.status).toBe(200);
    expect(statuses).toEqual(['succeeded']);
    expect(update).toHaveBeenCalledTimes(2);
    expect(errors.mock.calls.map((call) => call[0])).toEqual([
      'Failed to record AI usage tokens and cost',
    ]);
    errors.mockRestore();
  });

  test('the usage service writes it into the admitted row after a transport failure', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const update = jest.fn(async () => ({}));
      const create = jest.fn(async ({ data }) => ({ id: 'usage-3', ...data }));
      const service = new usageServiceClass({ aiUsageRecord: { create, update } });
      const { fetch } = scripted(
        async () => {
          throw new TypeError('socket hang up');
        },
        json(200, completion({ service_tier: 'default' }))
      );
      const transport = chain.createTextChainFetch(included, fetch);
      await service.executeAiOperation('organization-a', 'text_generation', () =>
        transport(URL_, post(request))
      );
      const columns = update.mock.calls.map((call) => call[0].data).find((data) => !data.status);
      expect(columns).toMatchObject({ attempt: 2, serviceTier: 'default', possiblyBilled: true });
    } finally {
      warn.mockRestore();
    }
  });
});

describe('direct client budget (review F14)', () => {
  test('covers the longest chain any role can walk: flex, standard, fallback', () => {
    expect(chain.maxTextChainBudgetMs(included)).toBe(
      chain.textChainBudgetMs(LUNA, included)
    );
    // A default role on a non-flex model used to set a budget that ended a
    // flex-capable role's chain in the middle of its first flex attempt.
    expect(chain.maxTextChainBudgetMs(included)).toBeGreaterThan(
      chain.textChainBudgetMs('z-ai/glm-5.3', included)
    );
    expect(
      chain.maxTextChainBudgetMs({ ...included, textChain: { flex: false, fallbackModel: '' } })
    ).toBe(chain.textChainBudgetMs(LUNA, { ...included, textChain: { flex: false, fallbackModel: '' } }));
    expect(
      chain.maxTextChainBudgetMs({ ...included, usageMode: 'workspace_key', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } })
    ).toBe(60_000);
  });

  test('the direct OpenAI client takes that budget, not the default role model', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'libraries/nestjs-libraries/src/openai/ai.clients.ts'),
      'utf8'
    );
    const client = source.slice(source.indexOf('export const getOpenAiClient'));
    expect(client.slice(0, client.indexOf('const chatMemo'))).toMatch(
      /timeout: maxTextChainBudgetMs\(chainSourceOf\(config\)\)/
    );
    expect(client.slice(0, client.indexOf('const chatMemo'))).not.toContain('DEFAULT_AI_ROLE');
  });
});

describe('skipped attempts are logged (stand finding)', () => {
  test('one line per skipped attempt: number, model, tier, status or error class, elapsed; no prompt, no key', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const secretPrompt = { model: LUNA, messages: [{ role: 'user', content: 'TOP-SECRET-PROMPT' }] };
    const { fetch } = scripted(
      json(503, { error: { code: 503, message: `upstream down ${'x'.repeat(400)}` } }),
      async () => {
        throw new TypeError('fetch failed');
      },
      json(200, completion({ service_tier: 'default' }))
    );
    const response = await chain.createTextChainFetch(included, fetch)(
      URL_,
      post(secretPrompt, { headers: { authorization: 'Bearer sk-SECRET' } })
    );
    expect(response.status).toBe(200);
    const lines = warn.mock.calls.map((call) => String(call[0]));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^AI text chain: attempt 1\/3 skipped \(model openai\/gpt-6-luna, tier flex, HTTP 503, \d+ ms\): upstream down x+$/
    );
    expect(lines[0].split('): ')[1].length).toBeLessThanOrEqual(chain.SKIP_MESSAGE_MAX_CHARS);
    expect(lines[1]).toMatch(
      /^AI text chain: attempt 2\/3 skipped \(model openai\/gpt-6-luna, tier standard, TypeError, \d+ ms\): fetch failed$/
    );
    for (const line of lines) {
      expect(line).not.toContain('TOP-SECRET-PROMPT');
      expect(line).not.toContain('sk-SECRET');
    }
    warn.mockRestore();
  });

  test('a flex deadline reads as AttemptTimeout with the attempt budget', () => {
    expect(
      chain.textChainSkipLine(
        { number: 1, model: LUNA, flex: true, timeoutMs: 180_000 },
        4,
        { errorClass: 'AttemptTimeout', message: 'no answer within 180000 ms' },
        180_004.4
      )
    ).toBe(
      'AI text chain: attempt 1/4 skipped (model openai/gpt-6-luna, tier flex, AttemptTimeout, 180004 ms): no answer within 180000 ms'
    );
  });
});

describe('reasoning headroom (production 23.09: intake parse cut on «length»)', () => {
  const attempt = (model) => ({ model, flex: true });

  it('adds headroom to a caller cap when the attempt reasons', () => {
    const body = chain.buildAttemptBody({ model: LUNA, max_tokens: 2048 }, attempt(LUNA));
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.max_tokens).toBe(2048 + chain.REASONING_HEADROOM_TOKENS);
    const alt = chain.buildAttemptBody({ model: LUNA, max_completion_tokens: 2048 }, attempt(LUNA));
    expect(alt.max_completion_tokens).toBe(2048 + chain.REASONING_HEADROOM_TOKENS);
  });

  it('gives the fallback the headroom too: it reasons by its own default (97dq.91); an uncapped call stays uncapped', () => {
    const glm = chain.buildAttemptBody({ model: LUNA, max_tokens: 2048 }, { model: 'z-ai/glm-5.3', flex: false });
    expect(glm.reasoning).toBeUndefined();
    expect(glm.max_tokens).toBe(2048 + chain.REASONING_HEADROOM_TOKENS);
    const open = chain.buildAttemptBody({ model: LUNA }, attempt(LUNA));
    expect(open.max_tokens).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------
 * `content-factory-next-97dq.91`: production 24.09.2026, a draft call spent
 * 1 887 of 2 162 completion tokens on reasoning and its JSON ran out inside a
 * percent-encoded address. Mock provider only.
 * ---------------------------------------------------------------------- */

describe('an answer cut at the ceiling is asked for once more, with a larger one (97dq.91)', () => {
  const cut = (content, extra = {}) =>
    completion({
      choices: [{ index: 0, finish_reason: 'length', message: { role: 'assistant', content } }],
      usage: { prompt_tokens: 900, completion_tokens: 2162, completion_tokens_details: { reasoning_tokens: 1887 } },
      ...extra,
    });
  const whole = (content) =>
    completion({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] });
  const jsonRequest = {
    ...request,
    max_tokens: 2162,
    response_format: { type: 'json_schema', json_schema: { name: 'post', schema: {} } },
  };
  const quiet = () => jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  test('truncated then whole: one retry, the caller gets the whole answer, both calls are in the ledger', async () => {
    const warn = quiet();
    try {
      const { fetch, calls } = scripted(
        json(200, cut('{"content":"Подробнее — [статья](https://ru.wikipedia.org/wiki/%D0%9F')),
        json(200, whole('{"content":"ok"}'))
      );
      const ledger = new chain.TextUsageLedger();
      const response = await chain.runWithUsageLedger(ledger, () =>
        chain.createTextChainFetch(included, fetch)(URL_, post(jsonRequest))
      );
      expect(JSON.parse(await response.text()).choices[0].message.content).toBe('{"content":"ok"}');
      expect(calls).toHaveLength(2);
      // The first ceiling already had the headroom; the retry doubles the
      // visible budget and adds another headroom on top.
      expect(calls[0].body.max_tokens).toBe(2162 + chain.REASONING_HEADROOM_TOKENS);
      expect(calls[1].body.max_tokens).toBe(
        chain.lengthRetryCap(2162) + chain.REASONING_HEADROOM_TOKENS
      );
      expect(ledger.calls).toHaveLength(2);
      expect(ledger.columns().completionTokens).toBe(2162 + 40);
      expect(String(warn.mock.calls[0][0])).toMatch(/answer cut at the ceiling .*finish_reason length, cap 2162\); retrying once/);
    } finally {
      warn.mockRestore();
    }
  });

  test('a JSON answer that does not parse and names no reason to stop counts as cut', async () => {
    const warn = quiet();
    try {
      const unterminated = completion({
        choices: [{ index: 0, message: { role: 'assistant', content: '{"content":"Unterminated' } }],
      });
      const { fetch, calls } = scripted(json(200, unterminated), json(200, whole('{"content":"ok"}')));
      await chain.createTextChainFetch(included, fetch)(URL_, post(jsonRequest));
      expect(calls).toHaveLength(2);
    } finally {
      warn.mockRestore();
    }
  });

  test('tool-call arguments cut on «length» are retried too', () => {
    const payload = {
      choices: [{
        finish_reason: 'length',
        message: { tool_calls: [{ function: { name: 'post', arguments: '{"content":"x' } }] },
      }],
    };
    expect(chain.answerWasCut(payload, { tools: [{}] })).toBe(true);
    expect(chain.answerWasCut({ choices: [{ finish_reason: 'stop', message: { content: 'plain text' } }] }, {})).toBe(false);
    expect(chain.answerWasCut({ choices: [{ finish_reason: 'content_filter', message: { content: '{' } }] }, jsonRequest)).toBe(false);
  });

  test('once only: a second cut reaches the caller as it is', async () => {
    const warn = quiet();
    try {
      const { fetch, calls } = scripted(json(200, cut('{"a":"')), json(200, cut('{"a":"b')));
      const response = await chain.createTextChainFetch(included, fetch)(URL_, post(jsonRequest));
      expect(calls).toHaveLength(2);
      expect(JSON.parse(await response.text()).choices[0].finish_reason).toBe('length');
    } finally {
      warn.mockRestore();
    }
  });

  test('workspace_key and the openai provider: no retry at all, only the ceiling is raised (fifteenth F1, 97dq.95)', async () => {
    for (const source of [
      { ...included, usageMode: 'workspace_key', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } },
      { ...included, provider: 'openai', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } },
    ]) {
      const { fetch, calls } = scripted(json(200, cut('{"a":"')), json(200, whole('{"a":1}')));
      const init = post(jsonRequest);
      const response = await chain.createTextChainFetch(source, fetch)(URL_, init);
      expect(calls).toHaveLength(1);
      const cap = Object.keys(jsonRequest).find((key) => /max_(completion_)?tokens/.test(key));
      expect(calls[0].body).toEqual({
        ...jsonRequest,
        [cap]: chain.withReasoningHeadroom(jsonRequest[cap]),
      });
      expect(JSON.parse(await response.text()).choices[0].finish_reason).toBe('length');
    }
  });

  test('97dq.95: on the own key the draft ceiling leaves room for reasoning (25.09.2026: 2 085 of 2 247)', async () => {
    const source = { ...included, usageMode: 'workspace_key', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } };
    const { fetch, calls } = scripted(json(200, whole('{"a":1}')));
    await chain.createTextChainFetch(source, fetch)(URL_, post({ ...request, max_tokens: 2247 }));
    expect(calls[0].body).toEqual({ ...request, max_tokens: 2247 + chain.REASONING_HEADROOM_TOKENS });
  });

  test('97dq.95: a raised ceiling the model refuses is sent once more as the SDK built it', async () => {
    const source = { ...included, usageMode: 'workspace_key', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } };
    const { fetch, calls } = scripted(
      json(400, { error: { code: 400, message: 'max_tokens is too large' } }),
      json(200, whole('{"a":1}'))
    );
    const init = post({ ...request, max_tokens: 2000 });
    const response = await chain.createTextChainFetch(source, fetch)(URL_, init);
    expect(calls).toHaveLength(2);
    expect(calls[0].body.max_tokens).toBe(2000 + chain.REASONING_HEADROOM_TOKENS);
    expect(calls[1].init).toBe(init);
    expect(response.status).toBe(200);
  });

  test('the retry cap is twice the caller cap, never more; a known model limit clamps it (fifteenth F12)', () => {
    expect(chain.lengthRetryCap(2162)).toBe(4324);
    expect(chain.lengthRetryCap(2162, 3000)).toBe(3000);
    const body = chain.buildAttemptBody({ model: LUNA, max_tokens: 2048 }, { model: LUNA, flex: false }, 4096);
    expect(body.max_tokens).toBe(4096);
  });

  test('a retry the model refuses hands back the first answer, not a new 400 (fifteenth F12)', async () => {
    const warn = quiet();
    try {
      const { fetch, calls } = scripted(
        json(200, cut('{"a":"')),
        json(400, { error: { code: 400, message: 'max_tokens is too large' } })
      );
      const response = await chain.createTextChainFetch(included, fetch)(URL_, post(jsonRequest));
      expect(calls).toHaveLength(2);
      expect(response.status).toBe(200);
      expect(JSON.parse(await response.text()).choices[0].finish_reason).toBe('length');
    } finally {
      warn.mockRestore();
    }
  });

  test('a fenced JSON answer is whole, not cut (fifteenth F11)', () => {
    const fenced = { choices: [{ finish_reason: 'stop', message: { content: '```json\n{"a":1}\n```' } }] };
    expect(chain.answerWasCut(fenced, jsonRequest)).toBe(false);
    const fencedCut = { choices: [{ finish_reason: 'stop', message: { content: '```json\n{"a":"' } }] };
    expect(chain.answerWasCut(fencedCut, jsonRequest)).toBe(true);
    expect(chain.parsesAsJson('```\n[1,2]\n```')).toBe(true);
  });

  test('an uncapped call and a stream are never retried', async () => {
    const { fetch, calls } = scripted(json(200, cut('{"a":"')));
    await chain.createTextChainFetch(included, fetch)(URL_, post({ ...jsonRequest, max_tokens: undefined }));
    expect(calls).toHaveLength(1);
    const streamed = scripted(
      sse([{ model: LUNA, choices: [{ delta: { content: '{"a":"' }, finish_reason: 'length' }] }])
    );
    const response = await chain.createTextChainFetch(included, streamed.fetch)(
      URL_,
      post({ ...jsonRequest, stream: true })
    );
    await response.text();
    expect(streamed.calls).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------
 * Review F15, F17, F18 (`content-factory-next-97dq.66`). Mock provider only.
 * ---------------------------------------------------------------------- */

describe('failed attempts are in the ledger (review F15)', () => {
  const quiet = () => jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  test('a served call keeps the served attempt; the failed ones add no tokens and no cost', async () => {
    const warn = quiet();
    try {
      const { fetch } = scripted(
        async () => {
          throw new TypeError('socket hang up');
        },
        json(503, { error: { code: 503, message: 'down' } }),
        json(200, completion({ service_tier: 'default' }))
      );
      const ledger = new chain.TextUsageLedger();
      await chain.runWithUsageLedger(ledger, () =>
        chain.createTextChainFetch(included, fetch)(URL_, post(request))
      );
      expect(ledger.calls.map((call) => [call.attempt, !!call.failed, !!call.possiblyBilled])).toEqual([
        [1, true, true],
        [2, true, false],
        [3, false, false],
      ]);
      expect(ledger.columns()).toMatchObject({
        model: LUNA,
        serviceTier: 'default',
        attempt: 3,
        promptTokens: 100,
        costUsd: 0.0000123,
      });
    } finally {
      warn.mockRestore();
    }
  });

  test('an operation that never got an answer still says how far it went', async () => {
    const warn = quiet();
    try {
      const failing = () => json(503, { error: { code: 503, message: 'down' } });
      const { fetch } = scripted(failing(), failing(), failing());
      const ledger = new chain.TextUsageLedger();
      const response = await chain.runWithUsageLedger(ledger, () =>
        chain.createTextChainFetch(included, fetch)(URL_, post(request))
      );
      expect(response.status).toBe(503);
      expect(ledger.columns()).toEqual({
        model: 'openai/gpt-6.1-sol',
        serviceTier: 'flex',
        attempt: 3,
        promptTokens: null,
        completionTokens: null,
        reasoningTokens: null,
        cachedTokens: null,
        costUsd: null,
        // Every failure was an answered refusal: nothing ran unanswered (tcxv).
        possiblyBilled: false,
      });
    } finally {
      warn.mockRestore();
    }
  });

  test('a timed-out last attempt is recorded as possibly billed', async () => {
    const source = { ...included, textChain: { flex: false, fallbackModel: '' } };
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
    try {
      const hang = (init) =>
        new Promise((_, reject) =>
          init.signal.addEventListener('abort', () => reject(init.signal.reason))
        );
      const { fetch } = scripted(hang);
      const ledger = new chain.TextUsageLedger();
      const pending = chain.runWithUsageLedger(ledger, () =>
        chain.createTextChainFetch(source, fetch)(URL_, post(request))
      );
      const settled = expect(pending).rejects.toThrow('Request timed out.');
      await jest.advanceTimersByTimeAsync(60_000);
      await settled;
      expect(ledger.calls).toEqual([
        { attempt: 1, model: LUNA, failed: true, possiblyBilled: true },
      ]);
      expect(ledger.columns().possiblyBilled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('possiblyBilled is stored (tcxv)', () => {
  test('columns: true when an attempt may have been billed, false for refusals only, absent without a failure', () => {
    const billed = new chain.TextUsageLedger();
    billed.record({ attempt: 1, model: LUNA, failed: true, possiblyBilled: true });
    billed.record({ attempt: 2, model: LUNA, promptTokens: 1 });
    expect(billed.columns().possiblyBilled).toBe(true);
    const refused = new chain.TextUsageLedger();
    refused.record({ attempt: 1, model: LUNA, failed: true });
    refused.record({ attempt: 2, model: LUNA, promptTokens: 1 });
    expect(refused.columns().possiblyBilled).toBe(false);
    const clean = new chain.TextUsageLedger();
    clean.record({ attempt: 1, model: LUNA, promptTokens: 1 });
    expect('possiblyBilled' in clean.columns()).toBe(false);
  });

  test('the schema column is additive and nullable, with no default', () => {
    const schema = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'libraries/nestjs-libraries/src/database/prisma/schema.prisma'),
      'utf8'
    );
    const model = schema.slice(schema.indexOf('model AiUsageRecord {'));
    const body = model.slice(0, model.indexOf('\n}'));
    expect(body).toMatch(/^\s+possiblyBilled\s+Boolean\?\s*$/m);
  });
});

describe('web-plugin text calls are metered and not treated as images (review F17)', () => {
  test('one pass as built, usage read, no flex, no fallback', async () => {
    const { fetch, calls } = scripted(json(200, completion({ service_tier: 'default' })));
    const ledger = new chain.TextUsageLedger();
    const init = post({ ...request, plugins: [{ id: 'web', max_results: 5 }] });
    const response = await chain.runWithUsageLedger(ledger, () =>
      chain.createTextChainFetch(included, fetch)(URL_, init)
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].init).toBe(init);
    expect(calls[0].body.service_tier).toBeUndefined();
    expect(ledger.columns()).toMatchObject({ attempt: 1, promptTokens: 100, costUsd: 0.0000123 });
  });

  test('an image is still decided by the model or the modalities, and is not read', async () => {
    const { fetch, calls } = scripted(json(200, completion()), json(200, completion()));
    const ledger = new chain.TextUsageLedger();
    const run = chain.createTextChainFetch(included, fetch);
    await chain.runWithUsageLedger(ledger, async () => {
      await run(URL_, post({ ...request, modalities: ['image', 'text'] }));
      await run(URL_, post({ ...request, model: 'openai/gpt-5-image' }));
    });
    expect(calls).toHaveLength(2);
    expect(ledger.calls).toEqual([]);
  });

  test('the web search client meters through the shared transport', () => {
    const fs = require('node:fs');
    const source = fs.readFileSync(
      require.resolve('../libraries/nestjs-libraries/src/openai/ai.clients.ts'),
      'utf8'
    );
    const factory = source.slice(source.indexOf('return new OpenRouterWebSearch('));
    expect(factory.slice(0, 400)).toMatch(/fetch: createTextChainFetch\(chainSourceOf\(config\)/);
    expect(factory.slice(0, 400)).toMatch(/maxRetries: 0/);
  });
});

describe('a flex tier refusal falls to standard (review F18)', () => {
  test('400 naming service_tier falls to standard and serves there', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { fetch, calls } = scripted(
        json(400, { error: { code: 400, message: 'service_tier "flex" is not supported for this model' } }),
        json(200, completion({ service_tier: 'default' }))
      );
      const ledger = new chain.TextUsageLedger();
      const response = await chain.runWithUsageLedger(ledger, () =>
        chain.createTextChainFetch(included, fetch)(URL_, post(request))
      );
      expect(response.status).toBe(200);
      expect(calls.map(({ body }) => body.service_tier)).toEqual(['flex', undefined]);
      expect(ledger.columns()).toMatchObject({ attempt: 2, serviceTier: 'default' });
    } finally {
      warn.mockRestore();
    }
  });

  test('flex capacity is not a refusal; a plain validation 400 stays final', () => {
    const flex = { number: 1, model: LUNA, flex: true, timeoutMs: 1 };
    const standard = { ...flex, flex: false };
    expect(chain.isFlexRefusal(429, 'flex capacity', flex)).toBe(false);
    expect(chain.isFlexRefusal(404, 'No endpoints found for flex', flex)).toBe(false);
    expect(chain.isFlexRefusal(400, 'Invalid service_tier', flex)).toBe(true);
    expect(chain.isFlexRefusal(400, 'Invalid service_tier', standard)).toBe(false);
    expect(chain.isRetryableFailure(400, 'response_format is invalid', flex)).toBe(false);
    expect(chain.isRetryableFailure(400, 'flex tier is not available for this model', flex)).toBe(true);
  });
});

/* -------------------------------------------------------------------------
 * The copilot chat (`content-factory-next-97dq.63`): the real `@ai-sdk/openai`
 * chat model on the shared transport. The provider is mocked.
 * ---------------------------------------------------------------------- */

describe('copilot chat through the chain (@ai-sdk/openai chat model)', () => {
  const { createOpenAI } = require('@ai-sdk/openai');
  const prompt = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }];
  const drain = async (stream) => {
    const reader = stream.getReader();
    const parts = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return parts;
      parts.push(value);
    }
  };

  test('stream: flex refused for capacity, standard serves; tokens and cost reach the ledger', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { fetch, calls } = scripted(
        json(429, { error: { code: 429, message: 'flex capacity' } }),
        sse([
          { id: 'c', model: LUNA, choices: [{ index: 0, delta: { role: 'assistant', content: 'Hel' } }] },
          { id: 'c', model: LUNA, choices: [{ index: 0, delta: { content: 'lo' }, finish_reason: 'stop' }] },
          {
            id: 'c',
            model: LUNA,
            service_tier: 'default',
            choices: [],
            usage: { prompt_tokens: 12, completion_tokens: 3, cost: 0.0004 },
          },
        ])
      );
      const provider = createOpenAI({
        apiKey: 'test-key',
        baseURL: 'https://openrouter.ai/api/v1',
        fetch: chain.createTextChainFetch(included, fetch),
      });
      const ledger = new chain.TextUsageLedger();
      const parts = await chain.runWithUsageLedger(ledger, async () => {
        const { stream } = await provider.chat(LUNA).doStream({ prompt });
        return drain(stream);
      });
      expect(calls.map(({ url }) => url)).toEqual([URL_, URL_]);
      // One flex attempt (97dq.94), then the standard tier.
      expect(calls.map(({ body }) => body.service_tier)).toEqual(['flex', undefined]);
      expect(calls[1].body).toMatchObject({
        stream: true,
        stream_options: { include_usage: true },
        usage: { include: true },
        reasoning: { effort: 'medium' },
      });
      const text = parts
        .filter((part) => part.type === 'text-delta')
        .map((part) => part.delta)
        .join('');
      expect(text).toBe('Hello');
      expect(ledger.columns()).toMatchObject({
        model: LUNA,
        serviceTier: 'default',
        attempt: 2,
        promptTokens: 12,
        completionTokens: 3,
        costUsd: 0.0004,
      });
    } finally {
      warn.mockRestore();
    }
  });

  test('generate: the served answer and its usage; workspace_key goes out once as built', async () => {
    const { fetch, calls } = scripted(json(200, completion({ service_tier: 'default' })));
    const provider = createOpenAI({
      apiKey: 'workspace-key',
      baseURL: 'https://openrouter.ai/api/v1',
      fetch: chain.createTextChainFetch({ ...included, usageMode: 'workspace_key', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } }, fetch),
    });
    const ledger = new chain.TextUsageLedger();
    const result = await chain.runWithUsageLedger(ledger, () =>
      provider.chat(LUNA).doGenerate({ prompt })
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].body.service_tier).toBeUndefined();
    expect(calls[0].body.usage).toBeUndefined();
    expect(result.content).toEqual([{ type: 'text', text: 'ok' }]);
    expect(ledger.columns()).toMatchObject({ attempt: 1, serviceTier: 'default', promptTokens: 100 });
  });
});

/* -------------------------------------------------------------------------
 * Review W1 of the fifteenth walk: F1 (retry under the SDK deadline), F2
 * (non-streaming body deadline), F4 (an aborted attempt may be billed).
 * Mock provider only; the SDK is a wrapper that arms its deadline around
 * `fetch` the way openai@6 `fetchWithTimeout` does.
 * ---------------------------------------------------------------------- */

/** The SDK: one timer around the whole custom `fetch`, cleared when it resolves. */
const sdkFetch = (fetchImpl, timeoutMs) => (url, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('SDK timeout')), timeoutMs);
  return fetchImpl(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

/** Headers at once, the body after `ms`: a long generation, as OpenRouter serves it. */
const slowBody = (payload, ms) => (init) => {
  let sent = false;
  return new Response(
    new ReadableStream({
      pull: (controller) =>
        new Promise((resolve, reject) => {
          if (sent) {
            controller.close();
            return resolve();
          }
          const timer = setTimeout(() => {
            sent = true;
            controller.enqueue(new TextEncoder().encode(JSON.stringify(payload)));
            resolve();
          }, ms);
          init.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(init.signal.reason);
          });
        }),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};

const hang = (init) =>
  new Promise((_, reject) =>
    init.signal.addEventListener('abort', () => reject(init.signal.reason))
  );

const fakeTimers = () =>
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });

describe('the retry after a cut answer has its own budget (fifteenth F1)', () => {
  const jsonRequest = {
    ...request,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
  };
  const cut = completion({
    choices: [{ index: 0, finish_reason: 'length', message: { role: 'assistant', content: '{"a":"' } }],
  });
  const whole = completion({
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"a":1}' } }],
  });

  test('flex out of time, standard cut after 55 s, a 150 s retry: the SDK does not abort it', async () => {
    fakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { fetch, calls } = scripted(hang, slowBody(cut, 55_000), slowBody(whole, 150_000));
      const budget = chain.textChainBudgetMs(LUNA, included);
      const ledger = new chain.TextUsageLedger();
      const pending = chain.runWithUsageLedger(ledger, () =>
        sdkFetch(chain.createTextChainFetch(included, fetch, { budgetMs: budget }), budget)(
          URL_,
          post(jsonRequest)
        )
      );
      await jest.advanceTimersByTimeAsync(60_000 + 55_000 + 150_000);
      const response = await pending;
      expect(JSON.parse(await response.text()).choices[0].message.content).toBe('{"a":1}');
      expect(calls).toHaveLength(3);
      expect(calls[2].body.service_tier).toBe('flex');
      expect(calls[2].body.max_tokens).toBe(2048 * 2 + chain.REASONING_HEADROOM_TOKENS);
      expect(ledger.columns().possiblyBilled).toBe(true);
    } finally {
      warn.mockRestore();
      jest.useRealTimers();
    }
  });

  test('the retry starts only while its pass fits in the SDK deadline; otherwise the first answer', async () => {
    fakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { fetch, calls } = scripted(hang, slowBody(cut, 55_000));
      const budget = 200_000;
      const pending = sdkFetch(
        chain.createTextChainFetch(included, fetch, { budgetMs: budget }),
        budget
      )(URL_, post(jsonRequest));
      await jest.advanceTimersByTimeAsync(60_000 + 55_000);
      const response = await pending;
      expect(calls).toHaveLength(2);
      expect(JSON.parse(await response.text()).choices[0].finish_reason).toBe('length');
      expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/not retrying: \d+ ms left/);
    } finally {
      warn.mockRestore();
      jest.useRealTimers();
    }
  });

  test('a retry that runs out of time hands back the first answer', async () => {
    fakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const source = { ...included, textChain: { flex: false, fallbackModel: '' } };
      const { fetch, calls } = scripted(json(200, cut), hang);
      const pending = chain.createTextChainFetch(source, fetch)(URL_, post(jsonRequest));
      await jest.advanceTimersByTimeAsync(60_000);
      const response = await pending;
      expect(calls).toHaveLength(2);
      expect(response.status).toBe(200);
      expect(JSON.parse(await response.text()).choices[0].finish_reason).toBe('length');
    } finally {
      warn.mockRestore();
      jest.useRealTimers();
    }
  });

  test('the chat model and the direct client hand the SDK deadline to the transport; SDK retries stay off in the chain', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'libraries/nestjs-libraries/src/openai/ai.clients.ts'),
      'utf8'
    );
    expect(source.match(/budgetMs: sdkBudget/g)).toHaveLength(2);
    expect(source).toMatch(/\{ timeout: textChainBudgetMs\(model, chainSourceOf\(config\)\), maxRetries: 0 \}/);
    expect(source).toMatch(/\{ timeout: maxTextChainBudgetMs\(chainSourceOf\(config\)\), maxRetries: 0 \}/);
  });
});

describe('a non-streaming body is not cut at the start-of-answer deadline (fifteenth F2)', () => {
  const capped = { ...request, max_tokens: 2048 };

  test('the window scales with the cap it sends, up to three minutes', () => {
    expect(chain.generationTimeoutMs(2048 + chain.REASONING_HEADROOM_TOKENS)).toBe(60_000 + 102_400);
    expect(chain.generationTimeoutMs(100)).toBe(61_000);
    expect(chain.generationTimeoutMs(50_000)).toBe(chain.MAX_GENERATION_TIMEOUT_MS);
    expect(chain.generationTimeoutMs(undefined)).toBe(chain.MAX_GENERATION_TIMEOUT_MS);
  });

  test('flex: headers at once and a 90 s body is served, not aborted at 60 s', async () => {
    fakeTimers();
    try {
      const { fetch, calls } = scripted(slowBody(completion(), 90_000));
      const pending = chain.createTextChainFetch(included, fetch)(URL_, post(capped));
      await jest.advanceTimersByTimeAsync(90_000);
      const response = await pending;
      expect(calls).toHaveLength(1);
      expect(response.status).toBe(200);
    } finally {
      jest.useRealTimers();
    }
  });

  test('standard does not inherit a 60 s total either', async () => {
    fakeTimers();
    try {
      const source = { ...included, textChain: { flex: false, fallbackModel: 'z-ai/glm-5.3' } };
      const { fetch, calls } = scripted(slowBody(completion({ service_tier: 'default' }), 120_000));
      const pending = chain.createTextChainFetch(source, fetch)(URL_, post(capped));
      await jest.advanceTimersByTimeAsync(120_000);
      const response = await pending;
      expect(calls).toHaveLength(1);
      expect(response.status).toBe(200);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a body past its window moves on, and the skip line says it was the body', async () => {
    fakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { fetch, calls } = scripted(slowBody(completion(), 600_000), json(200, completion()));
      const pending = chain.createTextChainFetch(included, fetch)(URL_, post(capped));
      await jest.advanceTimersByTimeAsync(162_400);
      const response = await pending;
      expect(calls).toHaveLength(2);
      expect(response.status).toBe(200);
      expect(String(warn.mock.calls[0][0])).toMatch(/AttemptTimeout.*the body did not finish within 162400 ms/);
    } finally {
      warn.mockRestore();
      jest.useRealTimers();
    }
  });
});

describe('an attempt the caller aborts in flight may be billed (fifteenth F4)', () => {
  test('non-streaming: the SDK deadline aborts the chain mid-attempt', async () => {
    fakeTimers();
    try {
      const { fetch } = scripted(hang);
      const ledger = new chain.TextUsageLedger();
      const pending = chain.runWithUsageLedger(ledger, () =>
        sdkFetch(chain.createTextChainFetch(included, fetch), 10_000)(URL_, post(request))
      );
      const settled = expect(pending).rejects.toThrow('SDK timeout');
      await jest.advanceTimersByTimeAsync(10_000);
      await settled;
      expect(ledger.calls).toEqual([
        { attempt: 1, model: LUNA, serviceTier: 'flex', failed: true, possiblyBilled: true },
      ]);
      expect(ledger.columns().possiblyBilled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('streaming: a stream that stops after hand-off is possibly billed, not served', async () => {
    const { fetch } = scripted(
      sse([{ model: LUNA, choices: [{ delta: { content: 'Hi' } }] }], { failAfter: true })
    );
    const ledger = new chain.TextUsageLedger();
    const response = await chain.runWithUsageLedger(ledger, () =>
      chain.createTextChainFetch(included, fetch)(URL_, post({ ...request, stream: true }))
    );
    await expect(response.text()).rejects.toThrow();
    expect(ledger.calls).toEqual([
      { attempt: 1, model: LUNA, serviceTier: 'flex', failed: true, possiblyBilled: true },
    ]);
  });

  test('pass-through (workspace_key): an aborted request is recorded as possibly billed', async () => {
    const controller = new AbortController();
    const { fetch } = scripted(async () => {
      controller.abort();
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    const ledger = new chain.TextUsageLedger();
    await expect(
      chain.runWithUsageLedger(ledger, () =>
        chain.createTextChainFetch({ ...included, usageMode: 'workspace_key', textChain: { flex:false, fallbackModel:'', fallbackModels:[], fallbackDisabled:true } }, fetch)(
          URL_,
          post(request, { signal: controller.signal })
        )
      )
    ).rejects.toThrow('aborted');
    expect(ledger.columns().possiblyBilled).toBe(true);
  });
});
