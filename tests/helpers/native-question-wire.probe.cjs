'use strict';
const assert = require('node:assert/strict');
const { fixture, org, user, resourceId, human, Response, until } = require('./agent-native-stale-suspension.probe.cjs');
let externalRequests = 0;
global.fetch = async () => { externalRequests++; throw new Error('EXTERNAL_PROVIDER_FORBIDDEN'); };
const single = { input: { question: 'Выберите формат.', questionPurpose: 'format', options: null,
  selectionMode: null, canDecideForPerson: null } };
const batch = { input: { questions: [
  { question: 'Выберите форму.', questionPurpose: 'creative', options: [{ label: 'A', description: null }],
    selectionMode: 'single_select', canDecideForPerson: null },
  { question: 'Укажите подтверждённый факт.', options: null, selectionMode: null, canDecideForPerson: null },
] } };
async function run(name) {
  const questionStep = name === 'repair' ? 2 : 1;
  const f = await fixture({ script: async (args, call) => {
    if (call > questionStep) {
      const history = JSON.stringify(args.prompt);
      assert.ok(history.includes(name === 'batch' ? 'Сохранённый факт' : 'Карусель'));
      return [{ type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: 'Ответ учтён.' }, { type: 'text-end', id: 'done' }];
    }
    const input = name === 'repair' && call === 1 ? { input: { question: null } } : name === 'batch' ? batch : single;
    return [{ type: 'tool-call', toolCallId: `wire-${name}-${call}`, toolName: 'ask_user', input: JSON.stringify(input) }];
  } });
  const threadId = `question-wire-${name}`;
  try {
    await f.memory.createThread({ threadId, resourceId, title: 'Synthetic native question' });
    const first = new Response();
    const parent = f.handler.chat(org, user, { threadId, messages: [human(`human-${name}`, 'Покажи предусмотренный вопрос и учти мой ответ.')] }, first);
    await until(async () => (await f.handler.getThread(org, user, threadId)).pending.length === 1, 'one answerable normalized native question');
    const pending = (await f.handler.getThread(org, user, threadId)).pending[0];
    assert.equal(f.modelCalls.length, questionStep);
    assert.equal(pending.suspendPayload.questionPurpose ?? pending.suspendPayload.questions?.[0]?.questionPurpose,
      name === 'batch' ? 'creative' : 'format');
    const address = { threadId, runId: pending.runId, toolCallId: pending.toolCallId, cardId: pending.suspendPayload.cardId };
    const resumeData = name === 'batch' ? { answers: [{ answer: 'A' }, { answer: 'Сохранённый факт' }] } : { answer: 'Карусель' };
    await f.handler.chat(org, user, { ...address, resumeData }, new Response());
    await parent;
    const after = await f.handler.getThread(org, user, threadId);
    assert.equal(after.pending.length, 0);
    assert.equal(after.execution.outcome, 'completed');
    await assert.rejects(() => f.handler.chat(org, user, { ...address, resumeData }, new Response()), error => error.getStatus?.() === 409);
    assert.equal(f.modelCalls.length, questionStep + 1);
    return { name, modelCalls: f.modelCalls.length, pending: after.pending.length, outcome: after.execution.outcome, questionCalls: questionStep };
  } finally { await f.close(); }
}
(async () => {
  const scenarios = [];
  for (const name of ['single', 'batch', 'repair']) scenarios.push(await run(name));
  console.log(JSON.stringify({ externalRequests, scenarios }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
