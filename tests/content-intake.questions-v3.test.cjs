'use strict';

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const { briefFillPromptV3, briefFillSchemaV3 } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v3.ts'
);
const { intakeCopy } = loadWithMocks(
  'apps/frontend/src/components/content-intelligence/intake/intake.copy.ts'
);

const base = {
  goal: null,
  thesis: null,
  position: null,
  disagreement: null,
  audience: null,
  format: null,
  facts: [],
  origins: {},
  options: {},
};

test('sixth walk question schema accepts only thesis and position', () => {
  expect(briefFillSchemaV3.safeParse({
    ...base,
    questions: [
      { field: 'thesis', question: 'Какую мысль вы хотите отстоять?', options: ['Я считаю, что это полезно'] },
      { field: 'position', question: 'Где вы стоите в этом споре?', options: ['Я скорее на стороне OpenAI'] },
    ],
  }).success).toBe(true);
  expect(briefFillSchemaV3.safeParse({
    ...base,
    questions: [{ field: 'facts', question: 'Какой источник это подтвердит?', options: [] }],
  }).success).toBe(false);
});

test('sixth walk prompt asks only what the author knows and requires first-person options', () => {
  const prompt = briefFillPromptV3({
    language: 'ru', material: 'Спор OpenAI и математиков', materialKind: 'thought',
    fixed: [], avatar: [], channel: [], facts: [], evidence: [],
  });
  expect(prompt).toContain('only the author can know');
  expect(prompt).toContain('first person');
  expect(prompt).toContain('Never ask for a source, number, document or searchable context');
});

test('research depth describes source capacity rather than query count', () => {
  expect([
    intakeCopy.ru.researchQuick,
    intakeCopy.ru.researchStandard,
    intakeCopy.ru.researchDeep,
  ]).toEqual([
    'Быстрый · до 8 источников',
    'Стандартный · до 20 источников',
    'Глубокий · до 50 источников',
  ]);
  expect([
    intakeCopy.en.researchQuick,
    intakeCopy.en.researchStandard,
    intakeCopy.en.researchDeep,
  ]).toEqual([
    'Quick · up to 8 sources',
    'Standard · up to 20 sources',
    'Deep · up to 50 sources',
  ]);
});
