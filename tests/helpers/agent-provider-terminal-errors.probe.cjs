'use strict';

const { Agent } = require('@mastra/core/agent');
const { RequestContext } = require('@mastra/core/request-context');
const { APICallError } = require('ai');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { createNativeTextRetryConfig, getNativeTerminalModelError } = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.native-retries.ts');
const { conductorErrorCode } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/conductor.errors.ts');

async function run(options) {
  const attempts = [];
  const fakeSecret = 'sk-or-v1-private-test-value';
  const models = ['primary', 'fallback'].map(modelId => new MockLanguageModelV3({
    modelId,
    doStream: async () => {
      attempts.push(modelId);
      if (modelId === 'primary' || options.failFallback) {
        throw new APICallError({
          message: `Provider error ${fakeSecret}`,
          url: `https://openrouter.ai/api/v1/chat/completions?key=${fakeSecret}`,
          requestBodyValues: { secret: fakeSecret },
          statusCode: options.status,
          responseBody: JSON.stringify({ error: { message: fakeSecret, metadata: options.metadata } }),
        });
      }
      return { stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: 'ok' },
        { type: 'text-end', id: 'text' },
        { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' },
          usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } } },
      ]) };
    },
  }));
  const agent = new Agent({ id: 'terminal-test', name: 'terminal-test', instructions: 'Test.',
    model: models.map(model => ({ model, maxRetries: 0 })),
    ...createNativeTextRetryConfig({ defaultMaxRetries: 0, delayMs: 0 }),
  });
  const requestContext = new RequestContext();
  const output = await agent.stream('Test.', { requestContext });
  const chunks = [];
  for await (const chunk of output.fullStream) chunks.push(chunk);
  const tripwire = chunks.find(chunk => chunk.type === 'tripwire');
  const replay = tripwire && JSON.parse(JSON.stringify(tripwire));
  const clone = new RequestContext(requestContext.entries());
  let blockedRouting = false, configReads = 0;
  if (options.verifyRouting) {
    const clients = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.clients.ts', {
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        requireActiveAiConfig: async () => { configReads++; throw new Error('Fresh request reached config.'); },
      },
    });
    try { await clients.getRoutedMastraModelEntries('terminal-org', 'agent', 'Same task', { requestContext: clone }); }
    catch (error) { blockedRouting = conductorErrorCode(error) === 'AI_PROVIDER_PAYMENT_REQUIRED'; }
    if (configReads !== 0) throw new Error('Terminal preflight reached config/model routing.');
    const fresh = new RequestContext();
    try { await clients.getRoutedMastraModelEntries('terminal-org', 'agent', 'Same task', { requestContext: fresh }); } catch {}
    if (configReads !== 1) throw new Error('Fresh request was incorrectly held by an old terminal marker.');
  }

  return { attempts, tripwire, blockedRouting, terminalContext: getNativeTerminalModelError(requestContext),
    clonedTerminalContext: getNativeTerminalModelError(clone), contextContainsSecret: JSON.stringify([...requestContext.entries()]).includes(fakeSecret), replayCode: replay && conductorErrorCode({ cause: { error: replay } }),
    containsSecret: JSON.stringify(chunks).includes(fakeSecret),
    text: chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.payload?.text ?? '').join('') };
}
run(JSON.parse(process.argv[2])).then(result => console.log('RESULT=' + JSON.stringify(result)))
  .catch(error => { console.error(error); process.exitCode = 1; });
