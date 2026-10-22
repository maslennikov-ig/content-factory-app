'use strict';
const { createRequire } = require('node:module');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { zodResponseFormat } = createRequire(require.resolve('@langchain/openai'))('openai/helpers/zod');
const base = 'libraries/nestjs-libraries/src/content-intelligence/intake/';
const meaning = loadWithMocks(base + 'request-understanding.ts');
const brief = loadWithMocks(base + 'intake.prompts.v12.ts');
const digest = loadWithMocks(base + 'research-digest.v4.ts');
const briefV13 = loadWithMocks(base + 'intake.prompts.v13.ts');
const digestV5 = loadWithMocks(base + 'research-digest.v5.ts');

test.each([
  ['native intake extraction', brief.briefFillSchemaV12],
  ['native evidence digest', digest.researchDigestSchemaV4],
  ['current native intake extraction', briefV13.briefFillSchemaV13],
  ['current native evidence digest', digestV5.researchDigestSchemaV5],
])('%s converts through the exact SDK used by LangChain before any paid request', (_name, schema) => {
  const response = zodResponseFormat(schema, 'extract');
  expect(response.type).toBe('json_schema');
  expect(response.json_schema.strict).toBe(true);
  const root = response.json_schema.schema;
  expect(root.required).toEqual(Object.keys(root.properties));
});

test.each([
  ['native intake extraction', brief.briefFillSchemaV12],
  ['current native intake extraction', briefV13.briefFillSchemaV13],
])('%s defines human fact selection in the actual provider schema as a person action before writing', (_name, schema) => {
  const root = zodResponseFormat(schema, 'extract').json_schema.schema;
  const constraints = root.properties.understanding.properties.constraints.anyOf.find(row => row.type === 'object');
  const description = constraints.properties.humanFactSelection.description;
  const declared = meaning.intakeRequestSchemaV1.shape.constraints.unwrap().shape.humanFactSelection.unwrap().description;
  expect(description).toEqual(expect.any(String));
  expect(description.trim().length).toBeGreaterThan(0);
  expect(description).toBe(declared);
});

test.each([true, false])('describing the human-selection field preserves its explicit %s value without coercion', humanFactSelection => {
  const request = meaning.parseModelIntakeUnderstanding({ version: 'intake-request/v1', goal: 'Write the requested note.',
    constraints: { humanFactSelection } });
  expect(request.constraints.humanFactSelection).toBe(humanFactSelection);
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
