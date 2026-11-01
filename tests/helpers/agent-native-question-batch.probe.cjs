'use strict';
// Real native Session/HTTP, isolated PG schema and Redis namespace, controlled model.
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { Response, HttpController, AgentThreadsService, until } = require('./agent-native-session-http.probe.cjs');
const ORG = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'ADMIN' }] };
const USER = { id: IDENTITY.userId, language: 'ru' };
const questions = [
  { question: 'Какова позиция?', options: [{ label: 'Первый ответ' }, { label: 'Другой ответ' }] },
  { question: 'Укажите детали.', canDecideForPerson: false },
  { question: 'Что пропустить?' },
  { question: 'Какой подход выбрать?' },
];
const answers = { answers: [{ answer: 'Первый ответ' }, { answer: 'Мои слова' }, { skipped: true }, { decideForPerson: true }] };
const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } };
async function child(phase, schemaName) {
  let calls = 0, toolSchema;
  const runtime = await createRuntime({ schemaName, modelFactory: modelId => new MockLanguageModelV3({ modelId, doStream: async args => {
    calls++;
    toolSchema = (args.tools || []).find(tool => tool.name === 'ask_user');
    const parts = phase === 'start'
      ? [{ type: 'tool-call', toolCallId: 'batch-one', toolName: 'ask_user', input: JSON.stringify({ questions }) }]
      : [{ type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: 'Продолжаю.' }, { type: 'text-end', id: 'done' }];
    if (phase !== 'start') {
      const prompt = JSON.stringify(args.prompt);
      for (const text of ['Первый ответ', 'Мои слова', 'skipped', 'decideForPerson']) assert.ok(prompt.includes(text), text);
    }
    return { stream: convertArrayToReadableStream([{ type: 'stream-start', warnings: [] }, ...parts,
      { type: 'finish', finishReason: { unified: phase === 'start' ? 'tool-calls' : 'stop', raw: phase === 'start' ? 'tool_calls' : 'stop' }, usage }]) };
  } }) });
  const threadId = `${schemaName}-thread`;
  const handler = new HttpController(runtime.service, new AgentThreadsService(runtime.service, runtime.redis), runtime.aiUsage);
  const send = async body => { const response = new Response(); let failure;
    void handler.chat(ORG, USER, body, response).catch(error => { failure = error; });
    await until(() => failure || response.writableEnded, 'native batch response');
    if (failure) throw failure;
    return response;
  };
  const payload = pending => ({ threadId, runId: pending.runId, toolCallId: pending.toolCallId, cardId: pending.suspendPayload.cardId });
  if (phase === 'start') {
    await send({ threadId, messages: [{ id: 'question-batch-human', role: 'user', parts: [{ type: 'text', text: 'Задай вопросы.' }] }] });
    const pending = (await handler.getThread(ORG, USER, threadId)).pending[0];
    const hasQuestionArraySchema = value => !!value && typeof value === 'object' &&
      (!!value.properties?.questions || Object.values(value).some(hasQuestionArraySchema));
    assert.equal(calls, 1); assert.ok(hasQuestionArraySchema(toolSchema), 'Model receives a questions array in its input schema.');
    assert.equal(pending.suspendPayload.kind, 'question-batch'); assert.deepEqual(pending.suspendPayload.questions, questions);
    assert.match(pending.suspendPayload.cardId, /^[a-f0-9]{32}$/);
    await assert.rejects(send({ ...payload(pending), resumeData: { answers: answers.answers.slice(0, 3) } }), e => e.getStatus?.() === 400);
    await assert.rejects(send({ ...payload(pending), cardId: '0'.repeat(32), resumeData: answers }), e => e.getStatus?.() === 409);
    assert.equal(calls, 1); assert.equal((await handler.getThread(ORG, USER, threadId)).pending.length, 1);
    const stopThreadId = `${threadId}-stop`;
    await send({ threadId: stopThreadId, messages: [{ id: 'stop-human', role: 'user', parts: [{ type: 'text', text: 'Задай вопросы для остановки.' }] }] });
    const stoppedPending = (await handler.getThread(ORG, USER, stopThreadId)).pending[0];
    assert.equal(stoppedPending.suspendPayload.kind, 'question-batch');
    await handler.stopThread(ORG, USER, stopThreadId);
    const stopped = await handler.getThread(ORG, USER, stopThreadId);
    assert.equal(stopped.pending.length, 0); assert.equal(stopped.execution.outcome, 'interrupted');
    await assert.rejects(send({ threadId: stopThreadId, runId: stoppedPending.runId, toolCallId: stoppedPending.toolCallId,
      cardId: stoppedPending.suspendPayload.cardId, resumeData: answers }), e => e.getStatus?.() === 409);
    assert.equal(calls, 2, 'Stopping cannot invoke the model.');
    process.send({ phase: 'ready' }); return;
  }
  try {
    const pending = (await handler.getThread(ORG, USER, threadId)).pending[0];
    assert.equal(pending.suspendPayload.kind, 'question-batch'); assert.deepEqual(pending.suspendPayload.questions, questions);
    assert.equal(calls, 0);
    const result = await send({ ...payload(pending), resumeData: answers });
    const after = await handler.getThread(ORG, USER, threadId);
    assert.equal(calls, 1); assert.equal(after.pending.length, 0); assert.equal(after.execution.outcome, 'completed');
    assert.equal(result.parts().filter(part => part.type === 'data-tool-call-approval').length, 0);
    await assert.rejects(send({ ...payload(pending), resumeData: answers }), e => e.getStatus?.() === 409);
    process.send({ phase: 'complete', result: { nativePgRedis: true, processRecreated: true, modelCallsBefore: 1, modelCallsAfter: 1,
      orderedAnswersPreserved: true, invalidAndStaleRejected: true, oneSuspension: true, noApprovalHop: true, stoppedBatchCannotResume: true } });
  } finally { await runtime.close({ drop: true }); }
  process.exit(0);
}
function spawn(phase, schemaName) {
  const proc = fork(__filename, [phase, schemaName], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = ''; proc.stdout.on('data', c => output += c); proc.stderr.on('data', c => output += c);
  const result = new Promise((resolve, reject) => { const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(Error(`timeout ${phase}: ${output}`)); }, 45000);
    proc.on('message', msg => { if (msg.phase === 'ready' || msg.phase === 'complete') { clearTimeout(timer); resolve(msg); } });
    proc.once('exit', code => { clearTimeout(timer); if (code) reject(Error(`exit ${phase} ${code}: ${output}`)); });
  });
  return { proc, result };
}
async function main() {
  const schema = `cf_native_question_batch_${process.pid}`;
  const start = spawn('start', schema); await start.result;
  const exited = new Promise(resolve => start.proc.once('exit', resolve)); start.proc.kill('SIGKILL'); await exited;
  const resumed = spawn('resume', schema); console.log(JSON.stringify((await resumed.result).result));
}
if (process.argv[2]) child(...process.argv.slice(2)).catch(error => { console.error(error.stack); process.exit(1); });
else main().catch(error => { console.error(error.stack); process.exitCode = 1; });
