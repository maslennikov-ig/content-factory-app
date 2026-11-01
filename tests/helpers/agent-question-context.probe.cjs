'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { MessageList } = require('@mastra/core/agent');
const { ProcessorRunner } = require('@mastra/core/processors');
const { askUserTool } = require('@mastra/core/tools');
const { ConsoleLogger } = require('@mastra/core/logger');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { buildConductorAgent } = loadCapabilityModule('../conductor/conductor.agent.ts');
const { CAPABILITY_CATALOGUE } = loadCapabilityModule('capability.registry.ts');
async function main() {
  const agent = buildConductorAgent({ services: () => ({}), capabilities: CAPABILITY_CATALOGUE,
    gate: { check: async () => ({ allowed: true, policies: [] }) },
    model: async () => { throw Error('No provider calls allowed'); }, snapshot: async () => ({}) });
  const configured = await agent.listConfiguredInputProcessors();
  const processors = ['tool-call-filter', 'token-limiter', 'native-tool-result-prompt'].map(id => configured.find(processor => processor.id === id));
  assert.ok(processors.every(Boolean));
  const runner = new ProcessorRunner({ inputProcessors: processors.filter(Boolean), outputProcessors: [],
    logger: new ConsoleLogger({ level: 'error' }), agentName: 'question-context-proof' });
  const answer = 'Group all migration updates in one short paragraph; do not ask me about each one again.';
  const question = 'What should I say about the migration milestones?';
  const output = await askUserTool.execute({ question }, { agent: { resumeData: answer } });
  const pair = (name, id, input, result, mapped = false) => [
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: id, toolName: name, input }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: id, toolName: name, output: { type: 'json', value: result },
      ...(mapped ? { providerOptions: { mastra: { modelOutput: { type: 'json', value: result } } } } : {}) }] },
  ];
  const original = [
    { role: 'system', content: 'Fulfil the user request using only granted authority.' },
    { role: 'user', content: [{ type: 'text', text: 'Prepare a complete release digest and collect missing author comments.' }] },
    ...pair('ask_user', 'answered-question', { question }, output),
    ...pair('submit_plan', 'approved-plan', { plan: 'Write one digest' }, { status: 'approved', feedback: 'Keep it brief' }),
    ...pair('task_write', 'task-state', { tasks: [{ content: 'Write digest', status: 'in_progress' }] }, { tasks: [{ content: 'Write digest', status: 'in_progress' }] }),
    ...Array.from({ length: 10 }, (_, index) => pair('piece_read', `read-${index}`, { pieceId: 'piece-a', part: 'core' },
      { ok: true, summary: { text: `retained-read-${index} ` + 'source evidence '.repeat(150) } }, true)).flat(),
  ];
  const raw = JSON.stringify(original), cases = [];
  for (const restored of [false, true]) {
    const list = new MessageList().add(original, 'memory');
    const messages = restored ? new MessageList().deserialize(JSON.parse(JSON.stringify(list.serialize()))) : list;
    const before = JSON.stringify(messages.serialize());
    const result = await runner.runProcessLLMRequest({ prompt: messages.get.all.aiV5.prompt(), messageList: messages,
      model: { modelId: 'no-call-proof', provider: 'local-proof' }, stepNumber: 15, steps: [] });
    const prompt = JSON.stringify(result.prompt);
    assert.ok(prompt.includes(answer), 'An earlier native human answer must survive later tool reads');
    assert.ok(prompt.includes(question), 'The question must stay paired with its answer');
    assert.ok(prompt.includes('approved-plan') && prompt.includes('Keep it brief'), 'Human plan decisions must survive');
    assert.ok(prompt.includes('task-state'), 'Native task progress must survive');
    assert.ok(!prompt.includes('read-0\"'), 'Older product tool calls are still compacted');
    assert.ok(prompt.includes('retained-read-0'), 'Native compact model output remains available');
    assert.equal(JSON.stringify(messages.serialize()), before, 'Filtering must not rewrite native history');
    cases.push({ restored, answerPreserved: true, questionPreserved: true, planPreserved: true, taskProgressPreserved: true, productHistoryCompacted: true, nativeHistoryUnchanged: true });
  }
  assert.equal(JSON.stringify(original), raw);
  console.log(JSON.stringify({ cases, modelCalls: 0 }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
