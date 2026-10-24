'use strict';
const assert = require('node:assert/strict');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { Response, HttpController, AgentThreadsService, until } = require('./agent-native-session-http.probe.cjs');
const usage = { inputTokens: { total: 2, noCache: 2 }, outputTokens: { total: 0, text: 0 } };
async function scenario(recover) {
  const attempts = [];
  const runtime = await createRuntime({ modelFactory: modelId => new MockLanguageModelV3({ modelId, async doStream() {
    attempts.push(modelId);
    const parts = [{ type: 'stream-start', warnings: [] }];
    if (recover && modelId === 'fallback-1') parts.push({ type: 'text-start', id: 'answer' }, { type: 'text-delta', id: 'answer', delta: 'Сохранённый результат доступен.' }, { type: 'text-end', id: 'answer' });
    parts.push({ type: 'finish', finishReason: { unified: recover && modelId === 'fallback-1' ? 'stop' : 'other', raw: null }, usage });
    return { stream: convertArrayToReadableStream(parts) };
  } }) });
  try {
    const threads = new AgentThreadsService(runtime.service, runtime.redis);
    const controller = new HttpController(runtime.service, threads, runtime.aiUsage);
    const org = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] };
    const user = { id: IDENTITY.userId, language: 'ru' };
    const threadId = `empty-native-${recover ? 'recover' : 'terminal'}`;
    const response = new Response();
    await controller.chat(org, user, { threadId, messages: [{ id: `${threadId}-human`, role: 'user', parts: [{ type: 'text', text: 'Верните законченный ответ.' }] }] }, response);
    await until(() => response.writableEnded, 'bounded empty stream settlement');
    const history = await controller.getThread(org, user, threadId);
    assert.deepEqual(attempts, recover ? ['primary', 'fallback-1'] : ['primary', 'fallback-1', 'fallback-2']);
    assert.equal(history.pending.length, 0);
    assert.equal(history.execution.state, 'settled');
    assert.equal(history.execution.outcome, recover ? 'completed' : 'failed');
    assert.equal(runtime.admissions.length, 1, 'No new paid admission after an empty model chain');
    const text = response.parts().filter(part => part.type === 'text-delta').map(part => part.delta).join('');
    if (recover) assert.match(text, /Сохранённый результат/);
    else assert(response.parts().some(part => part.type === 'error') || text.length > 0, 'Terminal failure must have an actionable visible result');
    return { attempts, state: history.execution.state, outcome: history.execution.outcome, admissions: runtime.admissions.length, externalCalls: 0 };
  } finally { await runtime.close({ drop: true }); }
}
(async () => { const reports = [await scenario(false), await scenario(true)]; console.log(JSON.stringify(reports)); process.exit(0); })().catch(error => { console.error(error); process.exit(1); });
