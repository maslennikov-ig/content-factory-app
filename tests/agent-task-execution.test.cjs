'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadCapabilityModule, loadRegistry, requestContextFor } = require('./helpers/agent-capabilities.cjs');
const chain = require('./helpers/ai-text-chain.cjs');
const execution = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/conductor/conductor.execution.ts',
  { '../../openai/ai.text-chain': chain }
);
const context = loadCapabilityModule('capability.context.ts', {
  mocks: { '../conductor/conductor.execution': execution },
});
const policy = (extra = {}) => ({ maxDurationMs: 10_000, emergencyMaxSteps: 64, maxIdenticalToolResults: 3, ...extra });
const task = (extra = {}) => execution.createConductorExecution({ requestId: 'request-1', policy: policy(), ...extra });
const served = (costUsd, extra = {}) => ({ attempt: 1, promptTokens: 2, completionTokens: 3, ...(costUsd !== undefined ? { costUsd } : {}), ...extra });

describe('task execution uses real accounting and technical fuses', () => {
  test.each(['direct', 'sdk-wrapped', 'sent-response-lost'])('image request keeps truthful preflight and sent-attempt accounting (%s)', async (mode) => {
    const OpenAI = require('openai').default;
    const sent = mode === 'sent-response-lost';
    const scope = task({ policy: policy({ maxCostUsd: sent ? 0.01 : 0.005 }) });
    const ledger = new chain.TextUsageLedger();
    const imageHttp = jest.fn(async () => { throw new Error('Image connection lost after sending'); });
    const sdk = new OpenAI({ apiKey: 'synthetic-test-key', baseURL: 'https://synthetic.invalid/v1',
      dangerouslyAllowBrowser: true, maxRetries: 0,
      fetch: chain.createTextChainFetch({ usageMode: 'workspace_key', provider: 'openai' }, imageHttp),
    });
    const { OpenaiService } = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/openai.service.ts', {
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        getModelForRole: async () => 'image-model',
        getOpenAiClient: async () => {
          if (mode === 'direct') scope.assertCanSpend();
          return sdk;
        },
      },
      '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
      '@contentfactory/nestjs-libraries/openai/ai.text-chain': chain,
    });
    const service = new OpenaiService({ executeAiOperation: (_org, _operation, work) => work() });
    const failure = await scope.run(() => chain.runWithUsageLedger(ledger, async () => {
      ledger.record(served(0.005, { model: 'prompt-model' }));
      return service.generateImage('organization-a', 'Paid prompt');
    })).catch(error => error);
    expect(failure).toBeDefined();
    expect(imageHttp).toHaveBeenCalledTimes(sent ? 1 : 0);
    expect(ledger.calls).toHaveLength(sent ? 2 : 1);
    expect(ledger.calls[0]).toMatchObject({ model: 'prompt-model', costUsd: 0.005 });
    if (sent) expect(ledger.calls[1]).toMatchObject({ model: 'image-model', failed: true, possiblyBilled: true });
    expect(scope.snapshot()).toMatchObject({ stopCode: sent ? 'AGENT_TASK_UNCERTAIN' : 'AGENT_TASK_COST_BUDGET', knownCostUsd: 0.005,
      providerCalls: sent ? 2 : 1, unknownCostCalls: sent ? 1 : 0, possiblyBilled: sent });
  });

  test.each(['task-stop', 'caller-stop', 'task-deadline'])('native non-chat SDK requests inherit %s before further outbound work', async (stop) => {
    jest.useFakeTimers();
    // Node's AbortSignal.timeout uses native timers, outside Jest's clock.
    const taskTimeout = jest.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Task deadline', 'TimeoutError')), ms);
      return controller.signal;
    });
    try {
      const taskAbort = new AbortController();
      const callerAbort = new AbortController();
      const scope = task({ signal: taskAbort.signal });
      let started;
      const began = new Promise(resolve => { started = resolve; });
      const fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        started();
      }));
      const transport = chain.createTextChainFetch({ usageMode: 'workspace_key', provider: 'openrouter' }, fetch);
      const send = () => transport('https://openrouter.ai/api/v1/images/generations', {
        method: 'POST', body: JSON.stringify({ model: 'image-model', prompt: 'Test drawing' }), signal: callerAbort.signal,
      });
      const call = scope.run(send).catch(error => error);
      await began;
      if (stop === 'task-stop') taskAbort.abort(new Error('User stopped the task.'));
      else if (stop === 'caller-stop') callerAbort.abort(new Error('Caller stopped the image request.'));
      else await jest.advanceTimersByTimeAsync(10_001);
      expect(await call).toMatchObject({ name: stop === 'task-deadline' ? 'TimeoutError' : 'Error' });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
      if (stop !== 'caller-stop') {
        await expect(scope.run(send)).rejects.toThrow();
        expect(fetch).toHaveBeenCalledTimes(1);
      }
    } finally { taskTimeout.mockRestore(); jest.useRealTimers(); }
  });

  test('nested own-key text inherits task cancellation without another provider attempt', async () => {
    const abort = new AbortController();
    const scope = task({ signal: abort.signal });
    const ledger = new chain.TextUsageLedger();
    let started;
    const began = new Promise(resolve => { started = resolve; });
    const fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      started();
    }));
    const call = scope.run(() => chain.runWithUsageLedger(ledger, () => chain.createTextChainFetch({ usageMode: 'workspace_key', provider: 'openrouter' }, fetch)(
      'https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'own-model', messages: [] }) }
    ))).catch(error => error);
    await began;
    abort.abort(new Error('User stopped the task.'));
    expect(await call).toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(scope.snapshot()).toMatchObject({ possiblyBilled: true, providerCalls: 1 });
  });

  test('a healthy task model wait outlives legacy soft deadlines while the next call shares the remaining task time', async () => {
    jest.useFakeTimers();
    try {
      const scope = task({ policy: policy({ maxDurationMs: 120_000 }) });
      const ledger = new chain.TextUsageLedger();
      const fetch = jest.fn((_url, init) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response(JSON.stringify({
          choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 2, completion_tokens: 3, cost: 0.001 },
        }))), 75_000);
        init.signal.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal.reason); }, { once: true });
      }));
      const transport = chain.createTextChainFetch({ usageMode: 'included', provider: 'openrouter', profile: 'interactive', textChain: chain.defaultTextChainSettings() }, fetch);
      const send = () => transport('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'openai/gpt-6-luna', messages: [] }) });
      const first = scope.run(() => chain.runWithUsageLedger(ledger, send));
      const firstResult = first.then(response => ({ response }), error => ({ error }));
      await jest.advanceTimersByTimeAsync(75_001);
      expect((await firstResult).error).toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(scope.snapshot()).toMatchObject({ knownCostUsd: 0.001, providerCalls: 1, possiblyBilled: false });
      const second = scope.run(() => chain.runWithUsageLedger(ledger, send)).catch(error => error);
      await jest.advanceTimersByTimeAsync(45_000);
      expect(await second).toBeInstanceOf(Error);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(scope.snapshot()).toMatchObject({ possiblyBilled: true, providerCalls: 2 });
    } finally { jest.useRealTimers(); }
  });

  test.each([[true, 'completed'], [undefined, 'failed'], ['true', 'failed']])('only exact server proof %s permits a recovered turn to complete', async (canReviseInput, expected) => {
    const { AgentTurnLifecycle } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/agent-turn-lifecycle.ts');
    const outcomes = [];
    const turn = new AgentTurnLifecycle('revised-input', async outcome => outcomes.push(outcome));
    await turn.track(async () => ({ ok: false, code: 'INTAKE_INPUT_INSUFFICIENT', ...(canReviseInput !== undefined ? { canReviseInput } : {}) }));
    await turn.track(async () => ({ ok: true, summary: { saved: true } }));
    await turn.finish('completed');
    expect(outcomes).toEqual([expected]);
  });

  test.each([
    [true, false, undefined],
    [undefined, false, 'AGENT_TASK_OPERATION_FAILED'],
    [true, true, 'AGENT_TASK_UNCERTAIN'],
  ])('server-proven revision=%s with uncertain provider=%s preserves the correct stop boundary', async (canReviseInput, uncertain, stopCode) => {
    const registry = loadRegistry({ mocks: { '../conductor/conductor.execution': execution } });
    const hooks = registry.createCapabilityHooks(registry.CAPABILITY_CATALOGUE, { check: async () => ({ allowed: true, policies: [] }) });
    const requestContext = requestContextFor(registry);
    const scope = task();
    await scope.run(async () => {
      const call = { toolName: registry.toolNameOf('piece.create'), input: { text: 'Исходный запрос.' }, context: { requestContext, toolCallId: 'first' } };
      await expect(hooks.beforeToolCall(call)).resolves.toBeUndefined();
      const ledger = new chain.TextUsageLedger();
      chain.runWithUsageLedger(ledger, () => ledger.record(served(0.01, uncertain ? { failed: true, possiblyBilled: true } : {})));
      await hooks.afterToolCall({ ...call, output: { ok: false, code: 'INTAKE_RESEARCH_OPT_IN_REQUIRED', ...(canReviseInput ? { canReviseInput } : {}) } });
      expect(scope.snapshot()).toMatchObject({ knownCostUsd: 0.01, providerCalls: 1 });
      expect(scope.snapshot().stopCode).toBe(stopCode);
      const next = await hooks.beforeToolCall({ ...call, context: { requestContext, toolCallId: 'revised' }, input: { ...call.input, research: 'standard' } });
      if (stopCode) expect(next.output.code).toBe(stopCode);
      else expect(next).toBeUndefined();
    });
  });

  test('no invented task dollar or token allowance; active claims renew so tasks can run beyond the old nine-minute window', async () => {
    expect(execution.readConductorExecutionPolicy({})).toEqual({
      maxDurationMs: 3_600_000, emergencyMaxSteps: 64, maxIdenticalToolResults: 3,
    });
    expect(execution.readConductorExecutionPolicy({ CF_AGENT_TASK_MAX_DURATION_MS: '600001' })).toMatchObject({
      maxDurationMs: 600_001,
    });
    expect(() => execution.readConductorExecutionPolicy({ CF_AGENT_TASK_MAX_DURATION_MS: String(86_400_001) })).toThrow('fuse');
    expect(() => execution.readConductorExecutionPolicy({ CF_AGENT_TASK_MAX_COST_USD: 'Infinity' })).toThrow();

    const claims = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/agent-run-claims.ts');
    const store = claims.inProcessRunClaimStore();
    let currentTime = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    try {
      const release = await claims.claimAgentRun(store, 'thread:org-1:user-1:t-long');
      expect(release).toEqual(expect.any(Function));
      const scope = task({
        now: () => currentTime,
        policy: execution.readConductorExecutionPolicy({ CF_AGENT_TASK_MAX_DURATION_MS: '1200000' }),
      });
      await scope.run(async () => {
        for (const elapsedMs of [180_000, 360_000, 540_000, 720_000]) {
          currentTime = 1_000_000 + elapsedMs;
          expect(await claims.renewAgentRunClaim(store, 'thread:org-1:user-1:t-long')).toBe(true);
          expect(await claims.claimAgentRun(store, 'thread:org-1:user-1:t-long')).toBeNull();
          scope.assertCanSpend();
          scope.streamOptions().onStepFinish({ finishReason: elapsedMs === 720_000 ? 'stop' : 'tool-calls' });
        }
      });
      expect(scope.snapshot()).toMatchObject({
        elapsedMs: 720_000,
        steps: 4,
        stopCode: undefined,
      });
      await release();
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('many settled paid steps continue without a message or approval increasing a numeric allowance', () => {
    const scope = task();
    const values = new Map([['cf.paidLimit', 1]]);
    const ctx = { get: (key) => values.get(key), set: (key, value) => values.set(key, value) };
    scope.run(() => {
      for (let index = 0; index < 12; index += 1) {
        expect(context.reservePaidSlot(ctx, `c${index}`)).toEqual({ ok: true });
        context.settlePaidSlot(ctx, `c${index}`);
      }
    });
    expect(values.get('cf.paidCalls')).toBe(12);
    expect(scope.snapshot().stopCode).toBeUndefined();
  });

  test('native task search uses actual operation admission only inside the trusted budget scope', () => {
    const scope = task();
    expect(chain.usesAiOperationResearchAdmission()).toBe(false);
    scope.run(() => expect(chain.usesAiOperationResearchAdmission()).toBe(true));
    expect(chain.usesAiOperationResearchAdmission()).toBe(false);
    chain.runWithAiExecutionUsage({ researchAdmission: 'operation-allowance' }, () => {
      expect(chain.usesAiOperationResearchAdmission()).toBe(false);
    });
  });

  test('concurrent admission is atomic and another call cannot release the owned permit', async () => {
    const scope = task();
    await scope.run(async () => {
      const calls = await Promise.all(['one', 'two', 'three'].map(async (id) => scope.reservePaidOperation(id)));
      expect(calls.filter((call) => call.ok)).toHaveLength(1);
      scope.releasePaidOperation('two');
      expect(scope.reservePaidOperation('four').ok).toBe(false);
      scope.releasePaidOperation('one');
      expect(scope.reservePaidOperation('four').ok).toBe(true);
    });
  });

  test('every nested operation/retry reaches both its unchanged ledger and task measurements', () => {
    const scope = task();
    const outer = new chain.TextUsageLedger();
    const inner = new chain.TextUsageLedger();
    scope.run(() => chain.runWithUsageLedger(outer, () => {
      outer.record(served(0.01));
      chain.runWithUsageLedger(inner, () => {
        inner.record({ attempt: 1, failed: true, possiblyBilled: false });
        inner.record(served(0.02, { attempt: 2 }));
        inner.recordSearch({ engine: 'tavily', credits: 2 });
      });
      outer.record(served(0.03));
    }));
    expect(scope.snapshot()).toMatchObject({ knownCostUsd: 0.06, tokens: 15, providerCalls: 5, unknownCostCalls: 1, possiblyBilled: false });
    expect(outer.columns().costUsd).toBe(0.04);
    expect(inner.columns().costUsd).toBe(0.02);
    expect(scope.snapshot().stopCode).toBeUndefined();
  });

  test('unknown price/credits do not become dollars; optional threshold stops on unknown price', () => {
    const allowed = task();
    allowed.run(() => {
      new chain.TextUsageLedger().record(served(undefined));
      chain.assertAiExecutionBudget();
    });
    expect(allowed.snapshot()).toMatchObject({ knownCostUsd: 0, unknownCostCalls: 1, stopCode: undefined });
    const bounded = task({ policy: policy({ maxCostUsd: 1 }) });
    bounded.run(() => {
      new chain.TextUsageLedger().recordSearch({ engine: 'tavily', credits: 2 });
      expect(() => chain.assertAiExecutionBudget()).toThrow(expect.objectContaining({ code: 'AGENT_TASK_COST_UNKNOWN' }));
    });
  });

  test.each([
    [{ maxCostUsd: 0.1 }, served(0.1), 'AGENT_TASK_COST_BUDGET'],
    [{ maxTokens: 5 }, served(0.001), 'AGENT_TASK_TOKEN_BUDGET'],
    [{}, { attempt: 1, failed: true, possiblyBilled: true }, 'AGENT_TASK_UNCERTAIN'],
  ])('configured/uncertain stop prevents the next provider attempt and preserves measured usage', (limits, call, code) => {
    const scope = task({ policy: policy(limits) });
    scope.run(() => {
      const ledger = new chain.TextUsageLedger();
      ledger.record(call);
      expect(() => chain.assertAiExecutionBudget()).toThrow(expect.objectContaining({ code }));
      expect(ledger.calls).toEqual([call]);
    });
    expect(scope.snapshot().stopCode).toBe(code);
    expect(scope.closing('ru')).toContain('Задача не завершена');
  });

  test('time and Stop apply across approval legs without resetting measurements', () => {
    let now = 0;
    const scope = task({ now: () => now });
    const first = scope.streamOptions();
    first.onStepFinish({ toolCalls: [{}] });
    now = 9_000;
    expect(scope.streamOptions().modelSettings.timeout.totalMs).toBe(1_000);
    now = 10_000;
    expect(scope.snapshot().stopCode).toBe('AGENT_TASK_TIME_BUDGET');
    const stopped = task();
    stopped.stop();
    expect(stopped.signal.aborted).toBe(true);
    expect(stopped.reservePaidOperation().ok).toBe(false);
  });

  test('identical call/result loops stop, changed useful results continue', () => {
    const scope = task();
    for (let index = 0; index < 8; index += 1) scope.recordToolResult('read', { id: 'p' }, { revision: index });
    expect(scope.snapshot().stopCode).toBeUndefined();
    for (let index = 0; index < 3; index += 1) scope.recordToolResult('read', { id: 'p' }, { revision: 8 });
    expect(scope.snapshot().stopCode).toBe('AGENT_TASK_NO_PROGRESS');
  });

  test('native fuse reports incomplete work while every ordinary step retains tools', () => {
    const scope = task({ policy: policy({ emergencyMaxSteps: 9 }) });
    const native = scope.streamOptions(['NOTE']);
    for (let index = 0; index < 9; index += 1) {
      expect(native.prepareStep({ stepNumber: index, systemMessages: [] }).toolChoice).toBeUndefined();
      native.onStepFinish({ toolCalls: [{}] });
    }
    expect(scope.snapshot()).toMatchObject({ stopCode: 'AGENT_TASK_EMERGENCY_FUSE', steps: 9 });
    expect(native.stopWhen({ steps: [] })).toBe(true);
    expect(scope.closing('en')).toContain('task is incomplete');
    const truncated = task();
    truncated.streamOptions().onStepFinish({ finishReason: 'length' });
    expect(truncated.snapshot().stopCode).toBe('AGENT_TASK_OPERATION_FAILED');
  });

  test('an uncertain sent provider attempt is accounted once and does not start the chain fallback', async () => {
    const scope = task();
    const ledger = new chain.TextUsageLedger();
    const fetch = jest.fn(async () => { throw new TypeError('connection lost after sending'); });
    const transport = chain.createTextChainFetch({
      usageMode: 'included', provider: 'openrouter', textChain: chain.defaultTextChainSettings(),
    }, fetch);
    await expect(scope.run(() => chain.runWithUsageLedger(ledger, () => transport('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', body: JSON.stringify({ model: 'openai/gpt-6-luna', messages: [{ role: 'user', content: 'test' }] }),
    })))).rejects.toMatchObject({ code: 'AGENT_TASK_UNCERTAIN' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ledger.calls).toEqual([expect.objectContaining({ failed: true, possiblyBilled: true })]);
    expect(scope.snapshot()).toMatchObject({ providerCalls: 1, possiblyBilled: true, unknownCostCalls: 1 });
  });

  test('BYOK headroom refusal and retry are both metered without inventing a charge for refusal', async () => {
    const scope = task();
    const ledger = new chain.TextUsageLedger();
    const fetch = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'ceiling refused' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 2, completion_tokens: 3, cost: 0.001 } })));
    await scope.run(() => chain.runWithUsageLedger(ledger, () => chain.createTextChainFetch({ usageMode: 'workspace_key', provider: 'openrouter' }, fetch)(
      'https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'model', max_tokens: 100, messages: [] }) }
    )));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(ledger.calls).toHaveLength(2);
    expect(ledger.calls[0]).toMatchObject({ failed: true });
    expect(ledger.columns().possiblyBilled).toBe(false);
    expect(scope.snapshot()).toMatchObject({ providerCalls: 2, knownCostUsd: 0.001, unknownCostCalls: 0 });
  });

  test('a cancelled BYOK stream is metered as uncertain once and blocks another call', async () => {
    const scope = task();
    const ledger = new chain.TextUsageLedger();
    const fetch = jest.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n')); },
    })));
    await scope.run(() => chain.runWithUsageLedger(ledger, async () => {
      const transport = chain.createTextChainFetch({ usageMode: 'workspace_key', provider: 'openrouter' }, fetch);
      const response = await transport('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', body: JSON.stringify({ model: 'model', stream: true, messages: [] }),
      });
      const reader = response.body.getReader();
      await reader.read();
      await reader.cancel();
      expect(() => chain.assertAiExecutionBudget()).toThrow(expect.objectContaining({ code: 'AGENT_TASK_UNCERTAIN' }));
    }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ledger.calls).toEqual([expect.objectContaining({ failed: true, possiblyBilled: true })]);
  });
});

describe('bounded autonomy inside the installed native Mastra loop', () => {
  let report;
  beforeAll(() => {
    const { execFileSync } = require('node:child_process');
    const path = require('node:path');
    report = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-task-execution.probe.cjs')], {
      encoding: 'utf8', timeout: 45_000,
    }));
  }, 60_000);

  test('eight paid operations and the final answer run in the same request with native tools available', () => {
    expect(report.multiple).toMatchObject({ calls: 8, modelCalls: 9, text: 'Saved requested artifacts.' });
    expect(report.multiple.choices).not.toContain('none');
    expect(report.multiple.budget).toMatchObject({ steps: 9, providerCalls: 8, tokens: 16, knownCostUsd: 0.008 });
    expect(report.multiple.budget.stopCode).toBeUndefined();
  });

  test('native stopWhen ends unchanged loops before another model/provider step', () => {
    expect(report.repeated).toMatchObject({ calls: 3, modelCalls: 3, budget: { stopCode: 'AGENT_TASK_NO_PROGRESS' } });
  });

  test('the emergency fuse stops an endless but changing loop without claiming task completion', () => {
    expect(report.fuse).toMatchObject({ calls: 9, modelCalls: 9, budget: { stopCode: 'AGENT_TASK_EMERGENCY_FUSE' } });
    expect(report.fuse.choices).not.toContain('none');
  });
});
