'use strict';
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { validateToolInput } = require('@mastra/core/tools');
const { standardSchemaToJSONSchema } = require('@mastra/core/schema');
const { RequestContext } = require('@mastra/core/request-context');
const question = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/native-question-batch.ts');
const { AGENT_MATERIAL_FORMAT_CONTEXT_KEY } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/chat-mode.ts');
const wireSingle = { input: { question: 'Выберите формат.', questionPurpose: 'format', options: null,
  selectionMode: null, canDecideForPerson: null } };
const wireBatch = { input: { questions: [
  { question: 'Выберите форму.', questionPurpose: 'creative', options: [{ label: 'A', description: null }],
    selectionMode: 'single_select', canDecideForPerson: null },
  { question: 'Укажите подтверждённый факт.', options: null, selectionMode: null, canDecideForPerson: null },
] } };

test.each([wireSingle, wireBatch])('installed SDK accepts the native input envelope and optional nulls', async input => {
  const tool = question.createNativeQuestionTool();
  const before = JSON.stringify(input);
  const parsed = validateToolInput(tool.inputSchema, input, 'ask_user');
  expect(parsed.error).toBeUndefined();
  const suspend = jest.fn(async payload => payload);
  const result = await tool.execute(input, { agent: { suspend } });
  expect(result.error).not.toBe(true);
  expect(suspend).toHaveBeenCalledTimes(1);
  const payload = suspend.mock.calls[0][0];
  expect(JSON.stringify(payload)).not.toContain(':null');
  expect(payload.questions ? payload.questions[0].canDecideForPerson : payload.canDecideForPerson)
    .toBe(Boolean(payload.questions));
  expect(JSON.stringify(input)).toBe(before);
});

test('the actual SDK receives an object schema and a real native format reply is retained', async () => {
  const tool = question.createNativeQuestionTool();
  const json = standardSchemaToJSONSchema(tool.inputSchema, { io: 'input' });
  expect(json.type).toBe('object');
  expect(json.properties.question).toBeDefined();
  expect(json.properties.questions).toBeDefined();
  const context = new RequestContext();
  const reply = await tool.execute(wireSingle, { requestContext: context, agent: { resumeData: 'Карусель' } });
  expect(reply).toMatchObject({ resolution: 'person_reply', questionPurpose: 'format' });
  expect(JSON.parse(context.get(AGENT_MATERIAL_FORMAT_CONTEXT_KEY))).toEqual(['carousel']);
});

test.each([
  { input: { question: null } },
  { input: { questions: [] } },
  { input: { question: 'Q', selectionMode: 'single_select', options: null } },
  { input: { question: 'Q', options: [{ label: null }] } },
  { input: { question: 'Q' }, question: 'Different Q' },
  { question: 'Q', questions: [{ question: 'Another Q' }] },
  { input: { question: 'Q', unsupported: true } },
])('malformed native question still refuses before any suspension', async input => {
  const tool = question.createNativeQuestionTool(), suspend = jest.fn();
  const result = await tool.execute(input, { agent: { suspend } });
  expect(result.error).toBe(true);
  expect(suspend).not.toHaveBeenCalled();
});

test('actual native Session parks wrapped questions, repairs invalid input and resumes each once', () => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const output = execFileSync(process.execPath, ['tests/helpers/native-question-wire.probe.cjs'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 35_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(report.externalRequests).toBe(0);
  expect(report.scenarios).toEqual([
    { name: 'single', modelCalls: 2, pending: 0, outcome: 'completed', questionCalls: 1 },
    { name: 'batch', modelCalls: 2, pending: 0, outcome: 'completed', questionCalls: 1 },
    { name: 'repair', modelCalls: 3, pending: 0, outcome: 'completed', questionCalls: 2 },
  ]);
}, 40_000);
