'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

function outage(routingChoice, status, auxiliaryRole, extra = {}) {
  const result = execFileSync(process.execPath, ['-e', `
    const { runA30AndA31FallbackRetryStopAndAccounting } = require('./tests/helpers/agent-model-fallback-retry.probe.cjs');
    runA30AndA31FallbackRetryStopAndAccounting(${JSON.stringify({ allUnavailable: true, routingChoice, status, auxiliaryRole, ...extra })})
      .then(value => console.log('RESULT=' + JSON.stringify(value)))
      .catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 25_000, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(result.split('\n').find(line => line.startsWith('RESULT=')).slice(7));
}

describe('R2 combined native routing and provider outage', () => {
  test('an explicitly saved default fallback remains eligible for a workspace key', () => {
    const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
    const chain = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.text-chain.ts');
    const column = chain.serializeTextFallbackColumn({ textFallbackModels: ['z-ai/glm-5.3'], textMaxRetries: 0 });
    const settings = chain.resolveTextChainSettings({ textFlexEnabled: false, textFallbackModel: column });
    const options = { provider: 'openrouter', usageMode: 'workspace_key', hasKey: true, primaryModel: 'openai/gpt-6-luna' };
    const policy = chain.resolveOrderedTextChainPolicy(settings, options);
    expect(policy.inheritedDefault).toBe(false);
    expect(policy.effectiveChain.map(entry => entry.model)).toEqual(['openai/gpt-6-luna', 'z-ai/glm-5.3']);
    const inherited = chain.resolveTextChainSettings({ textFlexEnabled: false, textFallbackModel: null });
    expect(chain.resolveOrderedTextChainPolicy(inherited, options).effectiveChain.map(entry => entry.model))
      .toEqual(['openai/gpt-6-luna']);
    expect(chain.textChainFingerprint(settings)).not.toBe(chain.textChainFingerprint(inherited));
  });

  test('the current provider factory advances from primary 429 to an explicit default fallback with zero retries', () => {
    const result = outage('agent', 429, undefined, { allUnavailable: false, explicitDefaultFallback: true });
    expect(result).toEqual({
      httpAttemptModels: ['openai/gpt-5.4-primary', 'z-ai/glm-5.3'],
      ledgerAttemptCount: 2,
      configuredMaxRetries: 0,
      nativeModels: ['openai/gpt-5.4-primary', 'z-ai/glm-5.3'],
      text: 'Ответ получен от третьей модели в цепочке.',
    });
  });

  test('explicit session selection replaces the primary while preserving the ordered fallback policy', () => {
    const result = outage(undefined, undefined, undefined, { modelOverride: 'google/gemini-4-argon' });
    expect(result).toEqual({ primaryModel: 'google/gemini-4-argon', models: [
      'google/gemini-4-argon', 'openai/gpt-5.4-backup-1', 'anthropic/claude-4-sonnet',
    ] });
  });

  test('an OpenAI own key refuses a model from another provider before execution', () => {
    const result = outage(undefined, undefined, undefined, { provider: 'openai', modelOverride: 'anthropic/claude-4-sonnet' });
    expect(result.error).toMatch(/incompatible/);
  });

  test('retry settings survive native context cloning and ambiguous durable identities stay unresolved', () => {
    const raw = execFileSync(process.execPath, ['-e', `
      const { loadTypeScriptModule } = require('./tests/helpers/load-ts-module.cjs');
      const { RequestContext } = require('@mastra/core/request-context');
      const retries = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.native-retries.ts');
      const original = new RequestContext();
      retries.setNativeTextMaxRetries(original, 3, ['primary', 'backup']);
      const clone = new RequestContext(original.entries());
      clone.setRaw('mastra__durableExecutions', { run1: { executionId: 'e1' } });
      const single = retries.resolveNativeTextRunId({ requestContext: clone });
      clone.setRaw('mastra__durableExecutions', { run1: { executionId: 'e1' }, run2: { executionId: 'e2' } });
      console.log(JSON.stringify({ retries: retries.getNativeTextMaxRetries(clone), single,
        ambiguous: retries.resolveNativeTextRunId({ requestContext: clone }) ?? null }));
    `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 10_000 });
    expect(JSON.parse(raw.trim())).toEqual({ retries: 3, single: 'run1', ambiguous: null });
  });

  test('included Flex transport plans exactly one HTTP request per native attempt', () => {
    const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
    const { planTextAttempts } = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.text-chain.ts');
    expect(planTextAttempts('openai/gpt-5.4-primary', {
      provider: 'openrouter', usageMode: 'included', profile: 'interactive', singleModelAttempt: true,
      textChain: { flex: true, fallbackModel: 'anthropic/claude-4-sonnet', maxRetries: 3 },
    })).toEqual([{ number: 1, model: 'openai/gpt-5.4-primary', flex: true, timeoutMs: 25_000 }]);
  });

  test.each(['agent', 'classify'])('confident %s routing preserves one retry per ordered model', choice => {
    const result = outage(choice);
    const primary = choice === 'classify' ? 'openai/gpt-5.4-classify' : 'openai/gpt-5.4-primary';
    expect(result.httpAttemptModels).toEqual([
      primary, primary,
      'openai/gpt-5.4-backup-1', 'openai/gpt-5.4-backup-1',
      'anthropic/claude-4-sonnet', 'anthropic/claude-4-sonnet',
    ]);
    expect(result.ledgerAttemptCount).toBe(6);
    for (const index of [0, 2, 4]) expect(result.intervalsMs[index]).toBeGreaterThanOrEqual(450);
  });

  test('authorization failure sends one HTTP request and never walks fallback models', () => {
    const result = outage('agent', 401);
    expect(result.httpAttemptModels).toEqual(['openai/gpt-5.4-primary']);
    expect(result.ledgerAttemptCount).toBe(1);
  });

  test('Stop during native retry delay prevents all later provider attempts', () => {
    const result = outage('agent', undefined, undefined, { stopDuringBackoff: true });
    expect(result.httpAttemptModels).toEqual(['openai/gpt-5.4-primary']);
    expect(result.ledgerAttemptCount).toBe(1);
  });

  test('hard quota failures are actionable and never retried as availability faults', () => {
    const result = outage('agent', 429, undefined, { errorMessage: 'insufficient_quota: billing limit' });
    expect(result.httpAttemptModels).toEqual(['openai/gpt-5.4-primary']);
    expect(result.ledgerAttemptCount).toBe(1);
  });

  test('native Retry-After takes precedence over the configured backoff', () => {
    const result = outage('agent', undefined, undefined, { retryAfter: '1' });
    expect(result.httpAttemptModels).toHaveLength(6);
    for (const index of [0, 2, 4]) expect(result.intervalsMs[index]).toBeGreaterThanOrEqual(900);
  });

  test.each(['classify', 'review', 'research'])('%s auxiliary execution uses exactly the same single native retry budget', role => {
    const result = outage(undefined, undefined, role);
    expect(result.httpAttemptModels).toEqual([
      `openai/gpt-5.4-${role}`, `openai/gpt-5.4-${role}`,
      'openai/gpt-5.4-backup-1', 'openai/gpt-5.4-backup-1',
      'anthropic/claude-4-sonnet', 'anthropic/claude-4-sonnet',
    ]);
    expect(result.ledgerAttemptCount).toBe(6);
    expect(result.failure).toEqual(expect.any(String));
  });

  test('the metered native classifier returns a usable decision through the real outer Classifier', () => {
    expect(outage(undefined, undefined, 'classify', { classifierSuccess: true, allUnavailable: false })).toEqual({
      httpAttemptModels: ['openai/gpt-5.4-classify'], ledgerAttemptCount: 1, failure: null, choice: 'classify',
    });
  });
});
