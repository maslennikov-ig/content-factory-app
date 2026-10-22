const chain = require('@contentfactory/nestjs-libraries/openai/ai.text-chain');

const SOL = 'openai/gpt-6.1-sol';
const LUNA = 'openai/gpt-6-luna';
const source = {
  usageMode: 'included',
  provider: 'openrouter',
  textChain: { flex: false, fallbackModel: SOL },
};

describe('service-managed Sol6.1 discounted route', () => {
  test.each([false, true])('Sol never plans a Standard attempt (native=%s)', (native) => {
    const attempts = chain.planTextAttempts(SOL, { ...source, singleModelAttempt: native });
    expect(attempts.map(x => [x.model, x.flex])).toEqual([[SOL, true]]);
  });

  test('legacy Luna failover uses discounted Sol even if Luna Flex is disabled', () => {
    expect(chain.planTextAttempts(LUNA, source).map(x => [x.model, x.flex])).toEqual([
      [LUNA, false], [SOL, true],
    ]);
    const policy = chain.resolveOrderedTextChainPolicy(source.textChain, {
      provider: source.provider, usageMode: source.usageMode, primaryModel: LUNA,
    });
    expect(policy.effectiveChain.map(x => [x.model, x.flex])).toEqual([
      [LUNA, false], [SOL, true],
    ]);
  });

  test('a definitive Flex refusal cannot buy a Standard Sol response', async () => {
    const bodies = [];
    const transport = chain.createTextChainFetch(source, async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ error: { code: 429, message: 'flex capacity unavailable' } }), {
        status: 429, headers: { 'content-type': 'application/json' },
      });
    });
    const response = await transport('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: SOL, messages: [{ role: 'user', content: 'draft' }], max_tokens: 64 }),
    });
    expect(response.status).toBe(429);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      model: SOL, service_tier: 'flex', reasoning: { effort: 'medium' },
      provider: { only: ['openai/flex'], allow_fallbacks: false },
    });
  });

  test('own-key Sol choices retain their Standard attempt and explicit reasoning', () => {
    const own = { ...source, usageMode: 'workspace_key', singleModelAttempt: true };
    expect(chain.planTextAttempts(SOL, own).map(x => [x.model, x.flex])).toEqual([[SOL, false]]);
    const body = chain.buildAttemptBody({ model: SOL, reasoning: { effort: 'high' } }, { model: SOL, flex: false });
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.provider).toBeUndefined();
    expect(body.service_tier).toBeUndefined();
  });

  test.each(['image-role alias', 'search plugin'])('%s cannot bypass discounted Sol pricing', async (kind) => {
    let sent;
    const transport = chain.createTextChainFetch({
      ...source, passthroughModels: kind === 'image-role alias' ? [SOL] : [],
    }, async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ model: SOL, choices: [{ message: { content: 'ok' } }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    await transport('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', body: JSON.stringify({ model: SOL, messages: [],
        ...(kind === 'search plugin' ? { plugins: [{ id: 'web' }] } : {}),
      }),
    });
    expect(sent).toMatchObject({ model: SOL, service_tier: 'flex',
      provider: { only: ['openai/flex'], allow_fallbacks: false },
    });
  });

  test('an unavailable discounted Sol call still preserves possibly-billed uncertainty', async () => {
    let sent = 0;
    const transport = chain.createTextChainFetch(source, async () => {
      sent++;
      throw new TypeError('connection lost after sending');
    });
    const ledger = new chain.TextUsageLedger();
    await expect(chain.runWithUsageLedger(ledger, () => transport('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', body: JSON.stringify({ model: SOL, messages: [{ role: 'user', content: 'draft' }] }),
    }))).rejects.toThrow('connection lost after sending');
    expect(sent).toBe(1);
    expect(ledger.columns().possiblyBilled).toBe(true);
  });
});
