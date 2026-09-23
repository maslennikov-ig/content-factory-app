/**
 * The shared text transport and its usage ledger (`content-factory-next-97dq.55`).
 *
 * Owner's decision of 23.09.2026: text runs on `openai/gpt-6-luna` with
 * reasoning effort `medium` through flex → flex → standard → `z-ai/glm-5.3`,
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
  test('included OpenRouter walks flex, flex, standard, then GLM', () => {
    expect(chain.planTextAttempts(LUNA, included)).toEqual([
      { number: 1, model: LUNA, flex: true, timeoutMs: 180_000 },
      { number: 2, model: LUNA, flex: true, timeoutMs: 180_000 },
      { number: 3, model: LUNA, flex: false, timeoutMs: 60_000 },
      { number: 4, model: 'z-ai/glm-5.3', flex: false, timeoutMs: 60_000 },
    ]);
    // The SDK deadline covers every attempt, not just the first.
    expect(chain.textChainBudgetMs(LUNA, included)).toBe(485_000);
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
      chain.planTextAttempts('z-ai/glm-5.3', included).map((a) => [a.model, a.flex])
    ).toEqual([['z-ai/glm-5.3', false]]);
  });

  test('workspace_key and the openai provider get a single attempt', () => {
    for (const source of [
      { ...included, usageMode: 'workspace_key' },
      { ...included, provider: 'openai' },
    ]) {
      expect(chain.planTextAttempts(LUNA, source)).toHaveLength(1);
      expect(chain.textChainApplies(source)).toBe(false);
    }
  });

  test('stored settings: NULL and empty read as the defaults', () => {
    expect(chain.resolveTextChainSettings(null)).toEqual({
      flex: true,
      fallbackModel: 'z-ai/glm-5.3',
    });
    expect(
      chain.resolveTextChainSettings({ textFlexEnabled: false, textFallbackModel: '  ' })
    ).toEqual({ flex: false, fallbackModel: 'z-ai/glm-5.3' });
    expect(
      chain.resolveTextChainSettings({ textFallbackModel: 'x/other' }).fallbackModel
    ).toBe('x/other');
  });
});

describe('text chain transport', () => {
  test('bodies: flex tier, usage accounting and medium effort on Luna only', async () => {
    const { fetch, calls } = scripted(
      json(503, { error: { code: 503, message: 'no capacity' } }),
      json(429, { error: { code: 429, message: 'flex capacity' } }),
      json(502, { error: { code: 502, message: 'bad gateway' } }),
      json(200, completion({ model: 'z-ai/glm-5.3', service_tier: undefined }))
    );
    const response = await chain.createTextChainFetch(included, fetch)(URL_, post(request));

    expect(response.status).toBe(200);
    expect(calls.map(({ body }) => [body.model, body.service_tier, body.reasoning])).toEqual([
      [LUNA, 'flex', { effort: 'medium' }],
      [LUNA, 'flex', { effort: 'medium' }],
      [LUNA, undefined, { effort: 'medium' }],
      ['z-ai/glm-5.3', undefined, undefined],
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
    const { fetch, calls } = scripted(failing(), failing(), failing(), failing());
    const response = await chain.createTextChainFetch(included, fetch)(URL_, post(request));
    expect(calls).toHaveLength(4);
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
    const source = { ...included, usageMode: 'workspace_key' };
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
      const { fetch, calls } = scripted(hang, hang, json(200, completion()));
      const pending = chain.createTextChainFetch(included, fetch)(URL_, post(request));
      await jest.advanceTimersByTimeAsync(180_000);
      expect(calls).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(180_000);
      const response = await pending;
      expect(calls).toHaveLength(3);
      expect(calls[2].body.service_tier).toBeUndefined();
      expect(response.status).toBe(200);
    } finally {
      jest.useRealTimers();
    }
  });
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
    });
  });

  test('workspace_key calls are recorded too, as attempt 1', async () => {
    const { fetch } = scripted(json(200, completion({ service_tier: 'default' })));
    const ledger = new chain.TextUsageLedger();
    await chain.runWithUsageLedger(ledger, () =>
      chain.createTextChainFetch({ ...included, usageMode: 'workspace_key' }, fetch)(
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
});

describe('direct client budget (review F14)', () => {
  test('covers the longest chain any role can walk: flex twice, standard, fallback', () => {
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
      chain.maxTextChainBudgetMs({ ...included, usageMode: 'workspace_key' })
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
      /^AI text chain: attempt 1\/4 skipped \(model openai\/gpt-6-luna, tier flex, HTTP 503, \d+ ms\): upstream down x+$/
    );
    expect(lines[0].split('): ')[1].length).toBeLessThanOrEqual(chain.SKIP_MESSAGE_MAX_CHARS);
    expect(lines[1]).toMatch(
      /^AI text chain: attempt 2\/4 skipped \(model openai\/gpt-6-luna, tier flex, TypeError, \d+ ms\): fetch failed$/
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

  it('leaves a non-reasoning fallback and an uncapped call alone', () => {
    const glm = chain.buildAttemptBody({ model: LUNA, max_tokens: 2048 }, attempt('z-ai/glm-5.3'));
    expect(glm.reasoning).toBeUndefined();
    expect(glm.max_tokens).toBe(2048);
    const open = chain.buildAttemptBody({ model: LUNA }, attempt(LUNA));
    expect(open.max_tokens).toBeUndefined();
  });
});
