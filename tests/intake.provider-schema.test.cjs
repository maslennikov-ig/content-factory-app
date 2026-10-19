'use strict';
const { createRequire } = require('node:module');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { zodResponseFormat } = createRequire(require.resolve('@langchain/openai'))('openai/helpers/zod');
const base = 'libraries/nestjs-libraries/src/content-intelligence/intake/';
const meaning = loadWithMocks(base + 'request-understanding.ts');
const brief = loadWithMocks(base + 'intake.prompts.v12.ts');
const digest = loadWithMocks(base + 'research-digest.v4.ts');

test.each([
  ['native intake extraction', brief.briefFillSchemaV12],
  ['native evidence digest', digest.researchDigestSchemaV4],
])('%s converts through the exact SDK used by LangChain before any paid request', (_name, schema) => {
  const response = zodResponseFormat(schema, 'extract');
  expect(response.type).toBe('json_schema');
  expect(response.json_schema.strict).toBe(true);
  const root = response.json_schema.schema;
  expect(root.required).toEqual(Object.keys(root.properties));
});

test('provider nulls mean absent optional semantics, while explicit title and temporal boundaries survive', () => {
  const supplied = {
    version: 'intake-request/v1', goal: 'Объясни материал без новостей.', requestedOutputs: null,
    materials: [{ role: 'reference', origin: 'user', text: 'Исходный пример.', sourceUrl: null }],
    evidenceNeeds: null, unresolvedChoices: null,
    constraints: { research: 'forbidden', temporal: null, requirements: null, humanFactSelection: null, title: 'Точное название' },
  };
  expect(meaning.parseModelIntakeUnderstanding(supplied)).toEqual({ version: 'intake-request/v1',
    goal: supplied.goal, materials: [{ role: 'reference', origin: 'user', text: 'Исходный пример.' }],
    constraints: { research: 'forbidden', title: 'Точное название' } });
  expect(meaning.parseModelIntakeTemporal({ mode: 'historical', eventInterval: { start: '2026-10-09', end: '2026-10-16' }, priorCoverageEnd: null, exclusions: null }))
    .toEqual({ mode: 'historical', eventInterval: { start: '2026-10-09', end: '2026-10-16' } });
  expect(meaning.parseModelIntakeTemporal({ mode: 'historical', eventInterval: { start: '2026-02-30', end: '2026-10-16' }, exclusions: null })).toBeNull();
});

test('misplaced task constraints are refused instead of silently losing an exact title or requirement', () => {
  expect(meaning.intakeRequestSchemaV1.safeParse({ version: 'intake-request/v1', goal: 'Подготовить текст.',
    constraints: { research: 'allowed' }, title: 'Важное название' }).success).toBe(false);
  expect(meaning.intakeRequestSchemaV1.safeParse({ version: 'intake-request/v1', goal: 'Подготовить текст.',
    constraints: { research: 'allowed', unsupportedRequirement: 'Существенное условие' } }).success).toBe(false);
});
