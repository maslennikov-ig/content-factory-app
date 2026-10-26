'use strict';
const { MessageList } = require('@mastra/core/agent');
const { ProcessorRunner } = require('@mastra/core/processors');
const { ConsoleLogger } = require('@mastra/core/logger');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { NativeResponseBoundaryProcessor } = loadWithMocks('libraries/nestjs-libraries/src/chat/conductor/native-response-boundary.ts');

const invocation = (name, call) => ({ type: 'tool-invocation', toolInvocation: {
  state: 'result', toolName: name, toolCallId: call, args: {}, result: { ok: true },
} });
const message = (id, second, name, call) => ({ id, role: 'assistant',
  createdAt: new Date(`2026-01-01T00:00:0${second}Z`),
  content: { format: 2, parts: [invocation(name, call)] } });
const seeded = () => new MessageList().add(message('first-response', 1, 'first_tool', 'first-call'), 'memory', { merge: false })
  .add(message('newer-response', 2, 'second_tool', 'second-call'), 'memory', { merge: false });
const tools = list => list.get.all.db().flatMap(row => row.content.parts
  .filter(part => part.type === 'tool-invocation').map(part => part.toolInvocation.toolName));
const processStep = async (list, messageId, extra = {}) => {
  const rotate = jest.fn(() => list.rotateResponseMessageId(messageId));
  const runner = new ProcessorRunner({ inputProcessors: [new NativeResponseBoundaryProcessor()],
    outputProcessors: [], logger: new ConsoleLogger({ level: 'error' }), agentName: 'boundary-test' });
  const result = await runner.runProcessInputStep({ messageList: list, messageId, rotateResponseMessageId: rotate,
    stepNumber: 1, steps: [], ...extra });
  return { result, rotate };
};

test.each([false, true])('native response rotation preserves tool chronology with restored snapshot=%s', async restored => {
  const broken = seeded();
  broken.add(message('first-response', 3, 'third_tool', 'third-call'), 'response');
  expect(tools(broken)).toEqual(['first_tool', 'third_tool', 'second_tool']);

  const initial = seeded();
  // Exercise the public SDK's serialized-state restore without a database,
  // service, model, rewritten timestamps or tool-name-specific correction.
  const list = restored ? new MessageList().deserialize(JSON.parse(JSON.stringify(initial.serialize()))) : initial;
  const originalRows = list.get.all.db().map(row => ({ id: row.id, createdAt: row.createdAt.toISOString() }));
  const { result, rotate } = await processStep(list, 'first-response');
  expect(rotate).toHaveBeenCalledTimes(1);
  expect(result.messageId).not.toBe('first-response');
  expect(result.messageId).not.toBe('newer-response');
  expect(list.get.all.db().map(row => ({ id: row.id, createdAt: row.createdAt.toISOString() }))).toEqual(originalRows);
  expect(tools(list)).toEqual(['first_tool', 'second_tool']);
  list.add(message(result.messageId, 3, 'third_tool', 'third-call'), 'response');
  expect(tools(list)).toEqual(['first_tool', 'second_tool', 'third_tool']);
  const next = await processStep(list, list.get.all.db().at(-1).id);
  expect(next.rotate).not.toHaveBeenCalled();
});

test.each(['newer-response', 'not-yet-created-response', undefined])('current or unknown response %s does not rotate', async id => {
  const list = seeded();
  const before = JSON.stringify(list.serialize());
  const { rotate } = await processStep(list, id);
  expect(rotate).not.toHaveBeenCalled();
  expect(JSON.stringify(list.serialize())).toBe(before);
});

test('a caller without native response rotation is left untouched', async () => {
  const list = seeded();
  const before = JSON.stringify(list.serialize());
  const { rotate } = await processStep(list, 'first-response', { rotateResponseMessageId: undefined });
  expect(rotate).not.toHaveBeenCalled();
  expect(JSON.stringify(list.serialize())).toBe(before);
});
