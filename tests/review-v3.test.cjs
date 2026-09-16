'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const root = 'libraries/nestjs-libraries/src/content-intelligence/pieces';

let responses = [];
const calls = [];
const warnings = [];
const clients = {
  getModelForRole: async () => 'review-model',
  getOpenAiClient: async () => ({
    chat: {
      completions: {
        create: async (...args) => {
          calls.push(args);
          const content = responses.shift();
          return { choices: [{ message: { content } }] };
        },
      },
    },
  }),
};
const { reviewPromptV3, reviewOnceV3, readReview } = loadWithMocks(`${root}/review.v3.ts`, {
  '@contentfactory/nestjs-libraries/openai/ai.clients': clients,
});
const legacy = loadWithMocks(`${root}/review.v2.ts`, {
  '@contentfactory/nestjs-libraries/openai/ai.clients': clients,
});

const input = {
  text: 'Комиссия составляет 10%. Тон оставим спокойным.',
  title: 'Комиссия',
  core: 'Комиссия составляет 10%.',
  personText: 'Комиссия составляет 10%.',
  facts: [],
  language: 'ru',
  mode: 'web',
  sources: [{ url: 'https://example.com/proof', excerpt: 'Комиссия составляет 12%.' }],
};
const usage = {
  executeAiOperation: async (_org, _operation, run, role) => {
    expect(role).toBe('review');
    return run();
  },
};

beforeEach(() => {
  process.env.JWT_SECRET = 'test-review-signing-key';
  responses = [];
  calls.length = 0;
  warnings.length = 0;
});

test('web prompt sends sources but no style catalog and permits factual corrections only', () => {
  const prompt = reviewPromptV3(input);
  const user = JSON.parse(prompt.user);
  expect(user.sources).toEqual(input.sources);
  expect(user).not.toHaveProperty('catalogFindings');
  expect(prompt.system).not.toMatch(/L52:|A29:|A35\.2:/);
  expect(prompt.system).toContain('correct only wording that contradicts');
  expect(prompt.system).toContain('PROMPT VERSION: adaptation-review-prompt/v4');
});

test('recorded mixed response returns review: unsupported edits become notes and unknown URLs are removed', async () => {
  responses = [
    JSON.stringify({
      changes: [
        {
          id: 'style',
          excerpt: 'Тон оставим спокойным.',
          replacement: 'Сохраним спокойный тон.',
          why: 'Стиль короче.',
          basket: 'show',
        },
        {
          id: 'slash',
          excerpt: 'Комиссия составляет 10%.',
          replacement: 'Комиссия составляет 12%.',
          sourceUrls: ['https://example.com/proof/'],
          why: 'Источник уточняет число.',
          basket: 'show',
        },
      ],
      verdict: 'review',
      summary: 'Проверено по источникам.',
    }),
  ];

  const result = await reviewOnceV3('org', input, usage, (message) =>
    warnings.push(message)
  );
  expect(result.text).toBe(input.text);
  expect(result.changes).toHaveLength(2);
  expect(result.changes.every((change) => change.replacement === change.excerpt)).toBe(true);
  expect(result.changes[1].sourceUrls).toBeUndefined();
  expect(calls).toHaveLength(1);
});

test('an exact returned source permits its factual replacement', async () => {
  responses = [
    JSON.stringify({
      changes: [
        {
          id: 'fact',
          excerpt: 'Комиссия составляет 10%.',
          replacement: 'Комиссия составляет 12%.',
          sourceUrls: ['https://example.com/proof'],
          why: 'Источник уточняет число.',
          basket: 'show',
        },
      ],
      verdict: 'review',
      summary: 'Число уточнено.',
    }),
  ];
  const result = await reviewOnceV3('org', input, usage, () => undefined);
  expect(result.text).toContain('Комиссия составляет 12%.');
  expect(result.changes[0].sourceUrls).toEqual([
    'https://example.com/proof',
  ]);
});

test('more than forty valid notes are bounded instead of invalidating the response', async () => {
  const sentences = Array.from({ length: 42 }, (_, index) => `Факт ${index}.`);
  responses = [
    JSON.stringify({
      changes: sentences.map((excerpt, index) => ({
        id: `note-${index}`,
        excerpt,
        replacement: excerpt,
        why: 'Источник не найден.',
        basket: 'show',
      })),
      verdict: 'review',
      summary: 'Есть заметки.',
    }),
  ];
  const result = await reviewOnceV3(
    'org',
    { ...input, text: sentences.join(' ') },
    usage,
    () => undefined
  );
  expect(result.changes).toHaveLength(40);
  expect(result.text).toBe(sentences.join(' '));
});

test('unparseable output is retried once with a repair explanation and logs codes only', async () => {
  responses = [
    '{broken',
    JSON.stringify({ changes: [], verdict: 'clean', summary: 'Ошибок нет.' }),
  ];
  const result = await reviewOnceV3('org', input, usage, (message) =>
    warnings.push(message)
  );
  expect(result.verdict).toBe('clean');
  expect(calls).toHaveLength(2);
  expect(calls[1][0].messages.at(-1).content).toContain('REVIEW_OUTPUT_JSON');
  expect(warnings).toEqual([
    'Review validation rejected model output: REVIEW_OUTPUT_JSON; retry=1',
  ]);
  expect(warnings.join(' ')).not.toContain(input.text);
});

test('only two unparseable responses produce REVIEW_INVALID', async () => {
  responses = ['not json', 'still not json'];
  await expect(
    reviewOnceV3('org', input, usage, () => undefined)
  ).rejects.toMatchObject({ code: 'REVIEW_INVALID', status: 502 });
  expect(calls).toHaveLength(2);
});

test('v3 reader accepts a still-open signed v2 result', () => {
  const proposal = {
    version: 'adaptation-review/v2',
    organizationId: 'org',
    pieceId: 'piece',
    adaptationId: 'adaptation',
    expires: Date.now() + 10_000,
    language: 'ru',
    originalText: input.text,
    text: input.text,
    title: input.title,
    changes: [],
    verdict: 'clean',
    summary: '',
    slopBefore: 0,
    slopAfter: 0,
    pieceSnapshot: { body: input.text, brief: {}, title: input.title },
  };
  const token = legacy.signReview(proposal);
  expect(readReview(token, 'org', 'piece', 'adaptation')).toMatchObject({
    version: 'adaptation-review/v2',
    pieceId: 'piece',
  });
});


test('one malformed change is discarded without losing a valid sibling or retrying', async () => {
  responses = [JSON.stringify({changes: [null, {id: 'broken'}, {
    id: 'valid', excerpt: 'Комиссия составляет 10%.', replacement: 'Комиссия составляет 12%.',
    sourceUrls: ['https://example.com/proof'], why: 'Источник уточняет число.', basket: 'show',
  }], verdict: 'review', summary: 'Число уточнено.'})];
  const result = await reviewOnceV3('org', input, usage, message => warnings.push(message));
  expect(result.changes.map(change => change.id)).toEqual(['valid']);
  expect(result.text).toContain('Комиссия составляет 12%.');
  expect(calls).toHaveLength(1);
  expect(warnings.filter(message => message.includes('REVIEW_CHANGE_SCHEMA'))).toHaveLength(2);
});

test('more than two hundred notes still return a bounded usable review', async () => {
  const sentences = Array.from({length: 201}, (_, i) => `Утверждение номер ${i}.`);
  responses = [JSON.stringify({changes: sentences.map((excerpt, i) => ({
    id: `note-${i}`, excerpt, replacement: excerpt, why: 'Источник не найден.', basket: 'show',
  })), verdict: 'review', summary: 'Есть заметки.'})];
  const text = sentences.join(' ');
  const result = await reviewOnceV3('org', {...input, text}, usage);
  expect(result.changes).toHaveLength(40);
  expect(result.text).toBe(text);
  expect(calls).toHaveLength(1);
});
