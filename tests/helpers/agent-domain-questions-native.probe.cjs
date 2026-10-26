'use strict';

// Actual Mastra durable tools, native HTTP ingress, PostgreSQL checkpoints and Redis claims.
// Only the external model and domain service are deterministic substitutes here.
const assert = require('node:assert/strict');
const {fork} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {MockLanguageModelV3} = require('ai/test');
const {convertArrayToReadableStream} = require('@ai-sdk/provider-utils/test');
const {createRuntime, IDENTITY} = require('./mastra-service-native-integration.probe.cjs');
const {Response, HttpController, AgentThreadsService, until} = require('./agent-native-session-http.probe.cjs');
const {loadCapabilityModule} = require('./agent-capabilities.cjs');
const {pieceCreate} = loadCapabilityModule('catalogue/piece.capabilities.ts');
const ORG = {id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{role: 'EDITOR'}]};
const USER = {id: IDENTITY.userId, language: 'ru'};
const usage = {inputTokens: {total: 5, noCache: 5}, outputTokens: {total: 5, text: 5}};

async function child(phase, schemaName, statePath) {
  const read = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const write = state => fs.writeFileSync(statePath, JSON.stringify(state));
  const pieces = {
    detail: async () => read().detail,
    prepareAnswer: async (_org, pieceId, request) => ({pieceId, request, core: read().detail.core}),
    answer: async function* (_org, plan) {
      const state = read();
      state.applied++;
      assert.equal(state.applied, 1, 'A completed batch must never be applied twice.');
      assert.equal(plan.request.answers[0].text, 'Мои точные слова.');
      state.detail.core.text = 'Сохранённая суть с ответом и без выдуманного личного эпизода.';
      state.detail.core.questions = {round: 2, items: [], answered: [
        {field: 'position', text: plan.request.answers[0].text, origin: 'person'},
        {field: 'facts', key: 'ask-1', text: '', origin: 'model'},
      ]};
      write(state);
      yield {name: 'piece', pieceId: plan.pieceId, code: 'cnt-native-1', core: state.detail.core};
      yield {name: 'questions', questions: []};
    },
  };
  const intake = {
    prepare: async () => ({}),
    run: async function* () {
      const state = read();
      state.created++;
      assert.equal(state.created, 1, 'Resuming questions cannot rerun the original create.');
      write(state);
      yield {name: 'piece', pieceId: 'native-piece-1', code: 'cnt-native-1'};
      yield {name: 'questions', questions: state.detail.core.questions.items};
    },
  };
  const runtime = await createRuntime({schemaName, capabilities: [pieceCreate],
    serviceFor: token => token.name === 'PieceService' ? pieces : token.name === 'IntakeService' ? intake : {},
    modelFactory: modelId => new MockLanguageModelV3({modelId, doStream: async args => ({stream: convertArrayToReadableStream([
      {type: 'stream-start', warnings: []},
      ...(args.prompt.some(message => message.role === 'tool')
        ? [{type: 'text-start', id: 'answer'}, {type: 'text-delta', id: 'answer', delta: 'Материал сохранён.'}, {type: 'text-end', id: 'answer'},
          {type: 'finish', finishReason: {unified: 'stop', raw: 'stop'}, usage}]
        : [{type: 'tool-call', toolCallId: 'native-domain-create', toolName: 'piece_create', input: JSON.stringify({text: 'Напиши материал', research: 'none'})},
          {type: 'finish', finishReason: {unified: 'tool-calls', raw: 'tool_calls'}, usage}]),
    ])})}),
  });
  const threadId = `${schemaName}-thread`;
  const handler = new HttpController(runtime.service, new AgentThreadsService(runtime.service, runtime.redis), runtime.aiUsage);
  const send = async body => {
    const response = new Response();
    let failed;
    void handler.chat(ORG, USER, body, response).catch(error => {failed = error;});
    await until(() => failed || response.writableEnded, 'native question response');
    if (failed) throw failed;
    return response;
  };
  const answer = (pending, resumeData) => ({threadId, runId: pending.runId, toolCallId: pending.toolCallId,
    cardId: pending.suspendPayload.cardId, resumeData});
  if (phase === 'start') {
    await send({threadId, messages: [{id: 'native-original', role: 'user', parts: [{type: 'text', text: 'Напиши материал'}]}]});
    const first = (await handler.getThread(ORG, USER, threadId)).pending[0];
    assert.equal(first.suspendPayload.kind, 'domain-questions');
    assert.equal(first.suspendPayload.questions[0].options.length, 7);
    await send(answer(first, {answers: [{key: 'position', mode: 'custom', text: 'Мои точные слова.'}]}));
    const partial = (await handler.getThread(ORG, USER, threadId)).pending[0];
    assert.equal(partial.toolCallId, first.toolCallId);
    assert.notEqual(partial.suspendPayload.cardId, first.suspendPayload.cardId);
    assert.equal(partial.suspendPayload.activeKey, 'ask-1');
    assert.equal(partial.suspendPayload.answers[0].text, 'Мои точные слова.');
    assert.equal(read().applied, 0);
    await assert.rejects(send(answer(first, {decideForPerson: true})), error => error.getStatus?.() === 409);
    const session = await runtime.service.sessionFor(IDENTITY, threadId);
    await until(() => session.suspensions.resolve({runId: partial.runId, toolCallId: partial.toolCallId}), 'warm native suspension');
    const parked = session.suspensions.resolve({runId: partial.runId, toolCallId: partial.toolCallId});
    const address = {runId: partial.runId, toolCallId: partial.toolCallId, threadId, resourceId: parked.resourceId};
    session.suspensions.delete(address);
    assert.equal(session.suspensions.has(address), false);
    await send(answer(partial, {answers: [{key: 'ask-1', mode: 'delegate'}]}));
    const restored = (await handler.getThread(ORG, USER, threadId)).pending[0];
    assert.equal(restored.suspendPayload.activeKey, 'ask-2');
    assert.equal(read().applied, 0);
    process.send({phase: 'ready'});
    return;
  }
  try {
    const pending = (await handler.getThread(ORG, USER, threadId)).pending[0];
    assert.equal(pending.suspendPayload.activeKey, 'ask-2');
    assert.equal(pending.suspendPayload.answers[0].text, 'Мои точные слова.');
    await send(answer(pending, {answers: [{key: 'ask-2', mode: 'delegate'}]}));
    const after = await handler.getThread(ORG, USER, threadId);
    assert.equal(after.pending.length, 0);
    assert.equal(after.execution.state, 'settled');
    assert.equal(read().created, 1);
    assert.equal(read().applied, 1);
    await assert.rejects(send(answer(pending, {decideForPerson: true})), error => error.getStatus?.() === 409);
    process.send({phase: 'complete', result: {nativePartialSaved: true, sameToolCallNewCard: true, processRecreated: true,
      staleDuplicateRejected: true, warmMirrorRebuilt: true, created: read().created, applied: read().applied, settled: true}});
  } finally { await runtime.close({drop: true}); }
  process.exit(0);
}

const spawn = (phase, schemaName, statePath) => {
  const childProcess = fork(__filename, [phase, schemaName, statePath], {stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  let output = '';
  childProcess.stdout.on('data', chunk => {output += chunk;});
  childProcess.stderr.on('data', chunk => {output += chunk;});
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {childProcess.kill('SIGKILL'); reject(new Error(output || `Timed out ${phase}`));}, 30_000);
    childProcess.on('message', message => {
      if (message.phase === 'ready' || message.phase === 'complete') {clearTimeout(timer); resolve(message);}
    });
    childProcess.once('exit', code => {clearTimeout(timer); if (code) reject(new Error(output || `Child exited ${code}`));});
  });
  return {childProcess, result};
};

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-domain-native-'));
  const statePath = path.join(directory, 'domain-state.json');
  fs.writeFileSync(statePath, JSON.stringify({created: 0, applied: 0, detail: {piece: {id: 'native-piece-1', code: 'cnt-native-1'},
    core: {text: 'Сохранённая суть', questions: {round: 1, answered: [], items: [
      {field: 'position', question: 'Дословный длинный вопрос '.repeat(30), suggested: null, options: Array.from({length: 7}, (_, i) => `Вариант ${i + 1}`)},
      {field: 'facts', key: 'ask-1', question: 'Ваш собственный эпизод?', suggested: null},
      {field: 'facts', key: 'ask-2', question: 'Какое ограничение оставить явным?', suggested: null},
    ]}}, adaptations: []}}));
  try {
    const schemaName = `cf_domain_questions_${process.pid}`;
    const initial = spawn('start', schemaName, statePath);
    await initial.result;
    const exited = new Promise(resolve => initial.childProcess.once('exit', resolve));
    initial.childProcess.kill('SIGKILL');
    await exited;
    const resumed = spawn('resume', schemaName, statePath);
    const complete = await resumed.result;
    console.log(JSON.stringify(complete.result));
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
}

if (process.argv[2]) child(...process.argv.slice(2)).catch(error => {console.error(error); process.exit(1);});
else main().catch(error => {console.error(error); process.exit(1);});
