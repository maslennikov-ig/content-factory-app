'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { Response, HttpController, AgentThreadsService, until } = require('./agent-native-session-http.probe.cjs');

const ORG = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] };
const USER = { id: IDENTITY.userId, language: 'ru' };
const usage = { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 5, text: 5 } };

async function child(phase, schemaName, auditPath) {
  let modelCalls = 0;
  const runtime = await createRuntime({
    schemaName,
    auditPath,
    fixtureMode: 'approval',
    modelFactory: (modelId) => new MockLanguageModelV3({
      modelId,
      async doStream() {
        const call = ++modelCalls;
        fs.appendFileSync(auditPath, `${JSON.stringify({ type: 'model', phase, call })}\n`);
        if ((phase === 'start' && call === 1) || (phase === 'resume' && call === 2)) {
          const preference = phase === 'start' ? 'cold approved preference' : 'future allowed preference';
          return { stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'tool-call', toolCallId: `memory-call-${call}`, toolName: 'updateWorkingMemory',
              input: JSON.stringify({ memory: { answerLength: 'short', notes: [preference] } }) },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
          ]) };
        }
        return { stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: `answer-${call}` },
          { type: 'text-delta', id: `answer-${call}`, delta: 'Готово.' },
          { type: 'text-end', id: `answer-${call}` },
          { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
        ]) };
      },
    }),
  });
  const { service, memory, contextModule } = runtime;
  const originalListTools = memory.listTools.bind(memory);
  memory.listTools = (...args) => {
    const tools = originalListTools(...args);
    const tool = tools.updateWorkingMemory;
    if (!tool) return tools;
    return { ...tools, updateWorkingMemory: { ...tool, execute: async (...executeArgs) => {
      const toolCallId = executeArgs[1]?.toolCallId ?? null;
      fs.appendFileSync(auditPath, `${JSON.stringify({ type: 'memory-tool-execute', phase, toolCallId })}\n`);
      const result = await tool.execute(...executeArgs);
      fs.appendFileSync(auditPath, `${JSON.stringify({ type: 'memory-tool-success', phase, toolCallId })}\n`);
      return result;
    } } };
  };
  const threadId = `${schemaName}-memory`;
  const threads = new AgentThreadsService(service, runtime.redis);
  const usageLedger = { beginAiOperation: async () => ({ run: work => work(), finish: async () => undefined }) };
  const handler = new HttpController(service, threads, usageLedger);

  if (phase === 'start') {
    const bindNativeTaskSession = service.bindNativeTaskSession.bind(service);
    service.bindNativeTaskSession = async (...args) => {
      const session = await bindNativeTaskSession(...args);
      const rules = session.permissions.getRules();
      // Model the old release's saved gate behavior without persisting an ask preference.
      await session.state.set({ permissionRules: { ...rules, tools: { ...rules.tools, updateWorkingMemory: 'ask' } } });
      return session;
    };
    const response = new Response();
    void handler.chat(ORG, USER, { threadId, messages: [{ id: 'memory-human', role: 'user', parts: [{ type: 'text', text: 'Запомни короткий ответ.' }] }] }, response)
      .catch(error => { console.error(error); process.exit(1); });
    await until(() => response.writableEnded, 'old memory approval card');
    const history = await handler.getThread(ORG, USER, threadId);
    assert.equal(history.pending.length, 1);
    assert.equal(history.pending[0].toolName, 'updateWorkingMemory');
    assert.equal(modelCalls, 1);
    assert.equal(String(await memory.getWorkingMemory({ threadId, resourceId: 'org-service:user-service' }) ?? '').includes('cold approved preference'), false);
    process.send({ phase: 'ready', threadId });
    return;
  }

  try {
    const before = await handler.getThread(ORG, USER, threadId);
    const pending = before.pending.find(call => call.toolName === 'updateWorkingMemory');
    assert.ok(pending, 'The old memory approval remains persisted across process death.');
    const emptyMemory = await memory.getWorkingMemory({ threadId, resourceId: `org-service:user-service` });
    assert.equal(String(emptyMemory ?? '').includes('cold approved preference'), false, 'The pending tool has not changed memory yet.');

    // Exercise the exact GET used by the frontend's transport reconnect.
    const observerResponse = new Response();
    const observerTask = handler.observeThread(ORG, USER, threadId, observerResponse).catch(error => {
      fs.appendFileSync(auditPath, `${JSON.stringify({ type: 'observer-error', phase, message: String(error?.message ?? error) })}\n`);
    });
    await until(async () => !!(await runtime.controller.getSessionByResource('org-service:user-service', threadId)), 'observer GET session bind');
    const session = await runtime.controller.getSessionByResource('org-service:user-service', threadId);
    assert.ok(session, 'Observer GET reconstructs and binds the native Session.');
    // Observe longer than a request reconnect window; the old app lease remains held.
    await new Promise(resolve => setTimeout(resolve, 20_000));
    const afterPassiveBind = await handler.getThread(ORG, USER, threadId);
    assert.equal(afterPassiveBind.pending.length, 1, 'Passive rebind must leave the old approval armed.');
    assert.equal(modelCalls, 0, 'Passive rebind must not continue into the model.');
    assert.equal((await memory.getWorkingMemory({ threadId, resourceId: 'org-service:user-service' })), emptyMemory);
    assert.equal(session.resolveToolApproval('updateWorkingMemory', threadId), 'allow', 'New memory calls use the current safe policy.');

    const answer = { threadId, messages: [{ id: 'memory-approval', role: 'assistant', parts: [{
      type: 'tool-updateWorkingMemory', toolCallId: pending.toolCallId, state: 'approval-responded',
      input: pending.args, approval: { id: `${pending.runId}::${pending.toolCallId}`, approved: true },
    }] }] };
    const approvalResponse = new Response();
    await handler.chat(ORG, USER, answer, approvalResponse);
    assert.equal(approvalResponse.parts().filter(part => part.type === 'text-delta').map(part => part.delta).join(''), 'Готово.');
    assert.equal(modelCalls, 1, 'Explicit approval resumes the prior run and completes its answer.');
    assert.equal((await memory.getWorkingMemory({ threadId, resourceId: 'org-service:user-service' })).includes('cold approved preference'), true);
    const explicitApprovalExecutions = fs.readFileSync(auditPath, 'utf8').trim().split('\n').map(JSON.parse)
      .filter(event => event.phase === 'resume' && event.type === 'memory-tool-success');
    assert.equal(explicitApprovalExecutions.length, 1, 'The explicit approval executes the stored tool once.');

    const futureResponse = new Response();
    await handler.chat(ORG, USER, { threadId, messages: [{ id: 'memory-future-human', role: 'user', parts: [{ type: 'text', text: 'Запомни ещё одну настройку.' }] }] }, futureResponse);
    assert.equal(futureResponse.parts().filter(part => part.type === 'text-delta').map(part => part.delta).join(''), 'Готово.');
    assert.equal(modelCalls, 3, 'The future call executes and receives its own final model response.');
    const finalHistory = await handler.getThread(ORG, USER, threadId);
    assert.equal(finalHistory.pending.length, 0);
    assert.equal(finalHistory.execution.state, 'settled');
    const events = fs.readFileSync(auditPath, 'utf8').trim().split('\n').map(JSON.parse);
    const memoryExecutions = events.filter(event => event.phase === 'resume' && event.type === 'memory-tool-success');
    assert.equal(memoryExecutions.length, 2, 'The two memory tool executions are explicit approval and a later fresh allow.');
    await Promise.race([observerTask, new Promise(resolve => setTimeout(resolve, 1_000))]);
    process.send({ phase: 'complete', report: {
      oldGateRetainedOnRebind: afterPassiveBind.pending.length === 1,
      passiveRebindModelCalls: 0,
      passiveRebindMemoryWrites: 0,
      explicitApprovalMemoryWrites: 1,
      explicitApprovalModelCalls: 1,
      futureMemoryCallsAutoAllowed: true,
      totalMemoryWrites: memoryExecutions.length,
      settled: true,
    } });
  } finally {
    await runtime.close({ drop: true });
  }
  process.exit(0);
}

const spawnPhase = (phase, schemaName, auditPath) => {
  const childProcess = fork(__filename, ['child', phase, schemaName, auditPath], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  childProcess.stdout.on('data', chunk => { output += chunk; });
  childProcess.stderr.on('data', chunk => { output += chunk; });
  let accepted;
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { childProcess.kill('SIGKILL'); reject(new Error(`Cold ${phase} timed out: ${output}`)); }, 60_000);
    childProcess.on('message', message => {
      if (message.phase === 'ready' || message.phase === 'complete') {
        accepted = message;
        if (phase === 'start') { clearTimeout(timer); resolve(message); }
      }
    });
    childProcess.once('exit', code => {
      clearTimeout(timer);
      if (phase === 'resume' && code === 0 && accepted) resolve(accepted);
      else if (!accepted) reject(new Error(`Cold ${phase} failed (${code}): ${output}`));
    });
  });
  return { childProcess, result };
};

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-native-memory-cold-'));
  const schemaName = `cf_native_memory_cold_${process.pid}_${Date.now()}`;
  const auditPath = path.join(directory, 'audit.jsonl');
  try {
    const start = spawnPhase('start', schemaName, auditPath);
    await start.result;
    const exited = new Promise(resolve => start.childProcess.once('exit', resolve));
    start.childProcess.kill('SIGKILL');
    await exited;
    const resume = spawnPhase('resume', schemaName, auditPath);
    const complete = await resume.result;
    console.log(JSON.stringify(complete.report));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[2] === 'child') child(...process.argv.slice(3)).catch(error => { console.error(error); process.exit(1); });
else main().catch(error => { console.error(error); process.exit(1); });
