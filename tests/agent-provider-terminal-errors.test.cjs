'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { conductorErrorCode } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/conductor.errors.ts');
const { isTransientNativeTextError, createNativeTextRetryConfig } = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.native-retries.ts');
const probe = options => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-provider-terminal-errors.probe.cjs'), JSON.stringify(options)],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(output.split('\n').find(line => line.startsWith('RESULT=')).slice(7));
};

describe('native provider terminal errors', () => {
  test.each([
    [402, undefined, 'AI_PROVIDER_PAYMENT_REQUIRED'],
    [403, { limit_source: 'openrouter_key_limit', scope: 'key_limit' }, 'AI_PROVIDER_PAYMENT_REQUIRED'],
    [403, { limit_source: 'other', scope: 'key_limit' }, 'AI_PROVIDER_REJECTED'],
    [401, undefined, 'AI_PROVIDER_REJECTED'],
    [400, undefined, 'AI_PROVIDER_REJECTED'],
  ])('native provider HTTP %s with metadata %j emits %s through actual processor pipeline', (status, metadata, expected) => {
    const result = probe({ status, metadata });
    expect(result.attempts).toEqual(['primary']);
    expect(result.tripwire.payload.metadata.cfNativeTerminalModelError).toEqual({ code: expected, status });
    expect(result.tripwire.payload.reason).toBe('Model provider request failed.');
    expect(result.replayCode).toBe(expected);
    expect(result.terminalContext).toEqual({ code: expected, status });
    expect(result.clonedTerminalContext).toEqual(result.terminalContext);
    expect(result.contextContainsSecret).toBe(false);
    expect(result.containsSecret).toBe(false);
    expect(conductorErrorCode(result.tripwire, { picturesInStep: () => true }))
      .toBe(status === 400 ? 'AGENT_PICTURE_NOT_SEEN' : expected);
  });

  test('transient 429 still moves to the configured fallback', () => {
    const result = probe({ status: 429 });
    expect(result.attempts).toEqual(['primary', 'fallback']);
    expect(result.tripwire).toBeUndefined();
    expect(result.text).toBe('ok');
    expect(result.terminalContext).toBeUndefined();
  });

  test('provider-specific metadata requires both exact fields and the OpenRouter origin', () => {
    const error = { name: 'AI_APICallError', statusCode: 403, url: 'https://openrouter.ai/api/v1/chat/completions',
      responseBody: JSON.stringify({ error: { metadata: { limit_source: 'openrouter_key_limit', scope: 'key_limit' } } }) };
    expect(conductorErrorCode({ cause: error })).toBe('AI_PROVIDER_PAYMENT_REQUIRED');
    expect(conductorErrorCode({ ...error, url: 'https://openrouter.ai.attacker.example' })).toBe('AI_PROVIDER_REJECTED');
    expect(conductorErrorCode({ ...error, responseBody: 'openrouter_key_limit scope key_limit' })).toBe('AI_PROVIDER_REJECTED');
    expect(conductorErrorCode({ ...error, responseBody: JSON.stringify({ error: { metadata: { limit_source: 'openrouter_key_limit' } } }) })).toBe('AI_PROVIDER_REJECTED');
    expect(isTransientNativeTextError(error)).toBe(false);
  });

  test('unknown tripwires remain blocked and invalid metadata is never exposed', () => {
    expect(conductorErrorCode({ name: 'TripWire', processorId: 'regex-filter' })).toBe('AGENT_BLOCKED');
    expect(conductorErrorCode({ name: 'TripWire', options: { metadata: { cfNativeTerminalModelError: { code: 'private' } } } })).toBe('AGENT_BLOCKED');
  });

  test('user Stop takes precedence over a previously recorded refusal', async () => {
    const { inputProcessors } = createNativeTextRetryConfig();
    const controller = new AbortController();
    controller.abort();
    const abort = jest.fn((reason, options) => { throw { reason, options }; });
    await expect(inputProcessors[0].processInputStep({ state: { terminalModelError: { code: 'AI_PROVIDER_PAYMENT_REQUIRED', status: 402 } }, abortSignal: controller.signal, abort }))
      .rejects.toEqual({ reason: 'Model execution stopped.', options: { metadata: undefined } });
  });

  test('legacy persisted message is not reused as abort reason', async () => {
    const { inputProcessors } = createNativeTextRetryConfig();
    const abort = jest.fn((reason, options) => { throw { reason, options }; });
    await expect(inputProcessors[0].processInputStep({ state: { terminalModelError: 'sk-private' }, abort }))
      .rejects.toEqual({ reason: 'Model provider request failed.', options: { metadata: undefined } });
  });
});

test('terminal request preflight cannot call the routing classifier while a fresh explicit request can proceed', () => {
  expect(probe({ status: 402, verifyRouting: true }).blockedRouting).toBe(true);
});
