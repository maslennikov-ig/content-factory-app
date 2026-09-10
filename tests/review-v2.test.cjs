'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const root = 'libraries/nestjs-libraries/src/content-intelligence/pieces';
let output,
  calls = [];
const clients = {
  getModelForRole: async () => 'review-model',
  getOpenAiClient: async () => ({
    chat: {
      completions: {
        create: async (...args) => {
          calls.push(args);
          return {
            choices: [{ message: { content: JSON.stringify(output) } }],
          };
        },
      },
    },
  }),
};
const { reviewPromptV2, reviewOnceV2, signReview, readReview } = loadWithMocks(
  `${root}/review.v2.ts`,
  { '@contentfactory/nestjs-libraries/openai/ai.clients': clients }
);
const { applyReviewChanges } = loadWithMocks(
  `${root}/review.v2.contract.ts`,
  {}
);
const change = (id, excerpt, replacement, basket = 'show') => ({
  id,
  excerpt,
  replacement,
  why: 'Причина',
  basket,
});
const input = {
  text: 'В современном мире мы пишем. Середина без правок. Важно отметить, что это работает.',
  title: 'Автор пишет',
  core: 'Мы пишем',
  personText: 'Мы пишем',
  facts: [],
  language: 'ru',
  mode: 'slop',
};
const usage = {
  executeAiOperation: async (_o, _k, run, role) => {
    expect(role).toBe('review');
    return run();
  },
};
beforeEach(() => {
  calls = [];
  process.env.JWT_SECRET = 'test-review-signing-key';
});
test('catalog findings include exact rule IDs and ranges in the one-call prompt', async () => {
  const prompt = reviewPromptV2(input);
  const data = JSON.parse(prompt.user);
  expect(data.catalogFindings.length).toBeGreaterThan(0);
  expect(data.catalogFindings[0]).toEqual(
    expect.objectContaining({
      ruleId: expect.any(String),
      excerpt: expect.any(String),
      start: expect.any(Number),
      end: expect.any(Number),
    })
  );
  output = {
    changes: [change('a', 'В современном мире мы пишем.', 'Мы пишем.')],
    verdict: 'review',
    summary: 'Исправлено',
  };
  const result = await reviewOnceV2('org', input, usage);
  expect(result.text).toContain('Середина без правок.');
  expect(calls).toHaveLength(1);
  expect(calls[0][1].maxRetries).toBe(0);
});
test('partial changes preserve untouched text; questions never alter claims', () => {
  const changes = [
    change('a', 'Первое.', 'Новое.'),
    change('b', 'Последнее.', 'Другое.'),
    change('q', 'Факт.', 'Выдумка.', 'ask'),
  ];
  expect(applyReviewChanges('Первое. Факт. Последнее.', changes, ['a'])).toBe(
    'Новое. Факт. Последнее.'
  );
  expect(() => applyReviewChanges('Первое. Факт.', changes, ['q'])).toThrow();
  expect(() => applyReviewChanges('Первое.', changes, ['invented'])).toThrow();
  expect(() => applyReviewChanges('Первое. Первое.', changes, ['a'])).toThrow();
  expect(() => applyReviewChanges('Первое.', changes, ['a', 'a'])).toThrow();
});
test('missing-fact question replacement is forced to its original excerpt', async () => {
  output = {
    changes: [change('q', 'мы пишем', 'модель выдумала', 'ask')],
    verdict: 'review',
    summary: 'Вопрос',
  };
  const result = await reviewOnceV2('org', input, usage);
  expect(result.text).toBe(input.text);
  expect(result.changes[0].replacement).toBe('мы пишем');
});
test('signed proposals bind tenant, piece, adaptation and expiry; edits invalidate signature', () => {
  const proposal = {
    organizationId: 'org',
    pieceId: 'p',
    adaptationId: 'a',
    expires: Date.now() + 10000,
    changes: [],
  };
  const token = signReview(proposal);
  expect(readReview(token, 'org', 'p', 'a')).toEqual(proposal);
  for (const scope of [
    ['other', 'p', 'a'],
    ['org', 'other', 'a'],
    ['org', 'p', 'other'],
  ])
    expect(() => readReview(token, ...scope)).toThrow();
  expect(() => readReview(token + 'x', 'org', 'p', 'a')).toThrow();
  expect(() =>
    readReview(signReview({ ...proposal, expires: 0 }), 'org', 'p', 'a')
  ).toThrow();
});
test('title-only rejects body edits and unsupported numbers; three honest variants accepted', async () => {
  output = {
    changes: [change('a', 'мы пишем', 'мы читаем')],
    verdict: 'review',
    summary: '',
  };
  await expect(
    reviewOnceV2('org', { ...input, instruction: 'Только заголовок' }, usage)
  ).rejects.toThrow();
  output = {
    changes: [
      {
        ...change('t', input.title, 'Автор рассказывает'),
        target: 'title',
        variants: ['Автор рассказывает', 'Как мы пишем', 'Наш текст'],
      },
    ],
    verdict: 'review',
    summary: '',
  };
  const result = await reviewOnceV2(
    'org',
    { ...input, instruction: 'Только заголовок' },
    usage
  );
  expect(result.text).toBe(input.text);
  output.changes[0].variants[0] = '100 способов';
  await expect(
    reviewOnceV2('org', { ...input, instruction: 'Только заголовок' }, usage)
  ).rejects.toThrow();
});
test('web changes require an actual returned source; unknown URLs are rejected', async () => {
  output = {
    changes: [change('a', 'мы пишем', 'мы публикуем')],
    verdict: 'review',
    summary: '',
  };
  const web = {
    ...input,
    mode: 'web',
    sources: [{ url: 'https://example.com/proof' }],
  };
  await expect(reviewOnceV2('org', web, usage)).rejects.toThrow();
  output.changes[0].sourceUrls = ['https://invented.example.com/'];
  await expect(reviewOnceV2('org', web, usage)).rejects.toThrow();
  output.changes[0].sourceUrls = ['https://example.com/proof'];
  await expect(reviewOnceV2('org', web, usage)).resolves.toMatchObject({
    text: expect.stringContaining('мы публикуем'),
  });
});
test('no-op proposals become clean and semantic missing context stays an author question', async () => {
  output = {
    changes: [change('a', 'мы пишем', 'мы пишем')],
    verdict: 'review',
    summary: '',
  };
  expect(await reviewOnceV2('org', input, usage)).toMatchObject({
    changes: [],
    verdict: 'clean',
  });
  expect(reviewPromptV2(input).system).toContain('needs_context');
});
