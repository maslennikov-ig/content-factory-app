'use strict';
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { z } = require('zod');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { Response, HttpController, AgentThreadsService, until } = require('./agent-native-session-http.probe.cjs');
const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } };
const org = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] };
const user = { id: IDENTITY.userId, language: 'ru' };
async function phase(action, mode, schemaName, auditPath) {
  const { pieceRead } = loadCapabilityModule('catalogue/material-read.capabilities.ts');
  const { pieceRename } = loadCapabilityModule('catalogue/piece.capabilities.ts');
  let runtime;
  const checkpoint = { ...pieceRead, id: 'permission.checkpoint', door: pieceRename.door, risk: 'confirm', input: z.object({}),
    label: { ru: 'Сохранить проверочную запись', en: 'Save test record' },
    describeApproval: async () => 'Сохранить одну проверочную запись в локальном тестовом пространстве.',
    run: async () => { fs.appendFileSync(auditPath, 'write\n'); return { marker: 'checkpoint-written' }; }, summarize: value => value };
  runtime = await createRuntime({ schemaName, capabilities: [checkpoint, pieceRead],
    serviceFor: token => token.name === 'PieceService' ? { detail: async () => ({ piece: { id: 'owned-piece', title: 'Локальный источник' }, core: { text: 'READ-MATERIAL-SENTINEL' } }) } : {},
    modelFactory: modelId => new MockLanguageModelV3({ modelId, async doStream(args) {
      const prompt = JSON.stringify(args.prompt);
      console.error('MODEL', action, mode, modelId, prompt.includes('checkpoint-written'), prompt.includes('READ-MATERIAL-SENTINEL'));
      const calls = !prompt.includes('checkpoint-written')
        ? [{ type: 'tool-call', toolCallId: 'checkpoint-call', toolName: 'permission_checkpoint', input: '{}' }]
        : !prompt.includes('READ-MATERIAL-SENTINEL')
        ? [{ type: 'tool-call', toolCallId: 'skill-call', toolName: 'skill', input: '{"name":"content"}' },
           { type: 'tool-call', toolCallId: 'read-call', toolName: 'piece_read', input: '{"pieceId":"owned-piece","part":"core"}' }]
        : [{ type: 'text-start', id: 'answer' }, { type: 'text-delta', id: 'answer', delta: 'Проверенный источник прочитан.' }, { type: 'text-end', id: 'answer' }];
      return { stream: convertArrayToReadableStream([{ type: 'stream-start', warnings: [] }, ...calls,
        { type: 'finish', finishReason: { unified: calls[0].type === 'tool-call' ? 'tool-calls' : 'stop', raw: null }, usage }]) };
    } }) });
  const threadId = `${schemaName}-thread`;
  const threads = new AgentThreadsService(runtime.service, runtime.redis);
  const http = new HttpController(runtime.service, threads, runtime.aiUsage);
  if (action === 'start') {
    await runtime.memory.createThread({ threadId, resourceId: 'org-service:user-service', title: 'Cold permission fixture' });
    const ctx = runtime.contextModule.buildConductorContext({ identity: IDENTITY, threadId });
    const session = await runtime.service.sessionFor(IDENTITY, threadId, { bindThread: true, requestContext: ctx });
    if (mode === 'ask') await session.permissions.setForTool({ toolName: 'piece_read', policy: 'ask' });
    await session.permissions.setForTool({ toolName: 'skill_read', policy: 'deny' });
    const response = new Response();
    void http.chat(org, user, { threadId, messages: [{ id: 'cold-permission-human', role: 'user', parts: [{ type: 'text', text: 'Сохраните запись и прочитайте источник.' }] }] }, response).catch(error => { console.error(error); process.exit(1); });
    await until(() => response.writableEnded, 'checkpoint consent before SIGKILL');
    const history = await http.getThread(org, user, threadId);
    assert.equal(history.pending[0].toolName, 'permission_checkpoint');
    process.send({ ready: true }); return;
  }
  try {
    const ctx = runtime.contextModule.buildConductorContext({ identity: IDENTITY, threadId });
    const session = await runtime.service.sessionFor(IDENTITY, threadId, { bindThread: true, requestContext: ctx });
    assert.equal(session.resolveToolApproval('skill', threadId), 'allow');
    assert.equal(session.resolveToolApproval('skill_read', threadId), 'deny');
    assert.equal(session.resolveToolApproval('piece_read', threadId), mode === 'ask' ? 'ask' : 'allow');
    assert.equal(session.resolveToolApproval('permission_checkpoint', threadId), 'ask');
    const stored = await http.getThread(org, user, threadId);
    await runtime.redis.set(`agent-run-claim:${stored.pending[0].runId}`, '1', 'EX', 600);
    const seenGates = [];
    session.subscribe(event => { if (['tool_approval_required','tool_suspended','error','agent_end','tool_end'].includes(event.type)) console.error('EVENT',JSON.stringify({type:event.type,tool:event.toolName,id:event.toolCallId,reason:event.reason})); });
    session.subscribe(event => { if (event.type === 'tool_approval_required') seenGates.push(event.toolName); });
    const answerPending = async () => {
      const history = await http.getThread(org, user, threadId); const pending = history.pending[0]; assert(pending);
      const response = new Response();
      let failure;
      void http.chat(org, user, { threadId, messages: [{ id: `approve-${pending.toolCallId}`, role: 'assistant', parts: [{ type: `tool-${pending.toolName}`, toolCallId: pending.toolCallId,
        state: 'approval-responded', input: pending.args ?? {}, approval: { id: `${pending.runId}::${pending.toolCallId}`, approved: true } }] }] }, response).catch(error => { failure = error; });
      try { await until(() => response.writableEnded || failure, 'cold answer response'); } catch (error) { console.error('PENDING',JSON.stringify((await http.getThread(org,user,threadId)).pending)); console.error('PARTS',JSON.stringify(response.parts())); throw error; }
      if (failure) throw failure;
    };
    await answerPending();
    if (mode === 'ask') {
      const pending = (await http.getThread(org, user, threadId)).pending;
      assert.equal(pending[0]?.toolName, 'piece_read', 'Explicit ask survives recovery and names the exact read');
      await answerPending();
    }
    // A gate's HTTP response can end before its original native owner has
    // drained FINISH and written the terminal receipt. Read that proof rather
    // than treating response EOF or a fixed delay as completed work.
    let final;
    await until(async () => {
      final = await http.getThread(org, user, threadId);
      return final.execution?.state === 'settled';
    }, 'durable cold permission terminal receipt');
    assert.equal(final.pending.length, 0);
    assert.equal(final.execution.outcome, 'completed');
    assert.equal(fs.readFileSync(auditPath, 'utf8').trim(), 'write');
    assert(!seenGates.includes('skill'), 'Bundled skill must not ask after recovery');
    process.send({ report: { mode, skill: 'allow', materialRead: mode, restrictedSkill: 'deny', writes: 1, completed: true, actualProcessRecreated: true } });
  } finally { await runtime.close({ drop: true }); }
  process.exit(0);
}
function launch(action, mode, schemaName, auditPath) {
  const child = fork(__filename, ['child', action, mode, schemaName, auditPath], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '', report;
  child.stdout.on('data', part => output += part); child.stderr.on('data', part => output += part);
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(output || 'Cold permission timeout')); }, 35000);
    child.on('message', message => { if (message.ready) { clearTimeout(timer); resolve(message); } if (message.report) report = message.report; });
    child.on('exit', code => { clearTimeout(timer); if (code === 0 && report) resolve(report); else if (action !== 'start' || code !== null) reject(new Error(`Cold permission ${action} ${code}: ${output}`)); });
  }); return { child, result };
}
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-cold-permission-')); const reports = [];
  try { for (const mode of ['allow', 'ask']) {
    const schema = `cf_cold_permission_${process.pid}_${mode}`, audit = path.join(dir, `${mode}.txt`);
    const start = launch('start', mode, schema, audit); await start.result;
    const exited = new Promise(resolve => start.child.once('exit', resolve)); start.child.kill('SIGKILL'); await exited;
    reports.push(await launch('resume', mode, schema, audit).result);
  } console.log(JSON.stringify(reports)); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
(process.argv[2] === 'child' ? phase(...process.argv.slice(3)) : main()).catch(error => { console.error(error); process.exit(1); });
