'use strict';

const simple = require('./helpers/reader-summary.cjs');
const legacy = require('./helpers/reader-source-review.cjs');
const retained = require('./fixtures/reader-summary-retained-public.json');
const { ChatOpenAI } = require('@langchain/openai');

const prepare = (fixture, language = 'Russian') =>
  simple.prepareReaderSummary(
    fixture.subject,
    fixture.sources,
    fixture.sources.map((source) => ({
      sourceUrl: source.url,
      text: source.excerpt,
    })),
    language
  );
const output = (fixture, gaps = []) => ({
  answer: fixture.answer,
  references: fixture.sources.map(({ id }) => ({ id, relevance: 'relevant' })),
  gaps,
});
const article = (excerpt, answer = excerpt, subject = 'Что известно?') => ({
  subject,
  answer,
  sources: [
    {
      id: 'S1',
      url: 'https://example.org/article',
      title: 'Источник',
      publishedAt: null,
      excerpt,
    },
  ],
});

test.each(['telegram-labeling', 'rate-summary'])(
  'retained %s auxiliary names reproduce the strict rejection without losing the useful simple answer',
  (name) => {
    const fixture = retained[name];
    const input = prepare(fixture);
    const subjectQuote = name === 'telegram-labeling' ? 'erid' : 'Банк России';
    const original = legacy.packReaderReview(
      fixture.subject,
      fixture.sources,
      fixture.sources.map((source) => ({
        sourceUrl: source.url,
        text: source.excerpt,
      })),
      'Russian'
    );
    const rejections = [];
    expect(
      legacy.compileReaderReview(
        original,
        {
          version: legacy.READER_REVIEW_WIRE_VERSION,
          sources: fixture.sources.map(({ id }) => ({
            id,
            relevance: 'relevant',
          })),
          claims: [],
          coverage: [{ question: fixture.subject, status: 'partial' }],
          entities: [
            {
              subjectQuote,
              status: 'contextual_mention',
              ref: { source: 'S1', quote: fixture.sources[0].excerpt },
            },
          ],
        },
        (code) => rejections.push(code)
      )
    ).toBeNull();
    expect(rejections).toEqual(['entity_subject_quote']);
    const result = simple.compileReaderSummary(input, {
      ...output(
        fixture,
        name === 'rate-summary'
          ? ['В ответе не установлена дата действующего решения.']
          : ['Суммы штрафов в выдержках не указаны.']
      ),
      entities: [{ subjectQuote }],
      coverage: { invalid: true },
    });
    expect(result.summary.startsWith(fixture.answer)).toBe(true);
    expect(result.assessment.status).toBe('partial');
    expect(result.assessment.entities).toEqual([]);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.summary).not.toMatch(/не найдены числа/);
  }
);

test('retained 1C useful migration, licence and cost context stays readable with the honest missing-price gap', () => {
  const fixture = retained['1c-cloud'];
  const result = simple.compileReaderSummary(
    prepare(fixture),
    output(fixture, ['В представленных фрагментах нет конкретных цен.'])
  );
  expect(result.summary).toContain(fixture.answer);
  expect(result.summary).toContain('нет конкретных цен');
  expect(result.facts.length).toBeGreaterThan(0);
  expect(result.assessment.status).toBe('partial');
  expect(result.summary).not.toMatch(/не найдены числа/);
});

test('off-topic and garbled 1C recordings remain evidence only, never accepted references', () => {
  const fixture = require('./fixtures/search-reader-recorded5818-neutral.json')
    .cases['1c'];
  const result = simple.compileReaderSummary(prepare(fixture), {
    answer: '',
    references: fixture.sources.map((_, i) => ({
      id: `S${i + 1}`,
      relevance: 'irrelevant',
    })),
    gaps: ['Найденные страницы не отвечают на вопрос о переходе 1С в облако.'],
  });
  expect(result.facts).toEqual([]);
  expect(result.assessment.status).toBe('insufficient_evidence');
  expect(result.assessment.evidence).toHaveLength(fixture.sources.length);
  expect(result.summary).toContain('не отвечают на вопрос');
});

test.each(['Russian', 'English'])(
  'a later retrospective is allowed on the requested date in %s, including translated dates and natural inflection',
  (language) => {
    const fixture = article(
      '11 сентября 2026 года Банк России принял решение о ставке 16,5%, действующей с 14 сентября 2026 года. На 1 октября 2026 года она не менялась.',
      language === 'Russian'
        ? 'По решению Банка России от 11.09.2026 ставка на 1 октября 2026 года составляет 16,5%.'
        : 'As of October 1, 2026, the Bank of Russia rate is 16.5%, under its September 11, 2026 decision.',
      'По состоянию на 1 октября 2026 года: действующая ключевая ставка Банка России.'
    );
    fixture.sources[0].publishedAt = '2026-10-02';
    const result = simple.compileReaderSummary(
      prepare(fixture, language),
      output(fixture)
    );
    expect(result.assessment.status).toBe('supported');
    expect(result.facts).toHaveLength(1);
    expect(result.assessment.requestedDate).toBe('2026-10-01');
  }
);

test('material unsupported rate/date is visible and never promoted as supported or takeable facts', () => {
  const fixture = article(
    'Ставка составляет 16,5%. Решение принято 11 сентября 2026 года.',
    'Ставка составляет 18%. Решение принято 31 декабря 2026 года.'
  );
  const result = simple.compileReaderSummary(prepare(fixture), output(fixture));
  expect(result.summary.startsWith(fixture.answer)).toBe(true);
  expect(result.summary).toContain('не найдены числа: 18');
  expect(result.summary).toContain('не найдены даты: 31 декабря 2026');
  expect(result.assessment.status).toBe('partial');
  expect(result.facts).toEqual([]);
});

test('a requested-date frame cannot establish applicability from an undated source', () => {
  const fixture = article(
    'Ставка составляет 16,5%.',
    'На 1 октября 2026 года ставка составляет 16,5%.',
    'По состоянию на 1 октября 2026 года: какова ставка?'
  );
  const result = simple.compileReaderSummary(prepare(fixture), output(fixture));
  expect(result.summary).toContain(fixture.answer);
  expect(result.summary).toContain('нет полной даты');
  expect(result.assessment.status).toBe('partial');
  expect(result.facts).toEqual([]);
});

test('ordinary numbered prose is not treated as unsupported material numbers', () => {
  const fixture = article(
    'Нужны маркировка и регистрация.',
    '1. Нужна маркировка.\n2. Нужна регистрация.'
  );
  const result = simple.compileReaderSummary(prepare(fixture), output(fixture));
  expect(result.summary).toBe(fixture.answer);
  expect(result.facts).toHaveLength(1);
});

test('decimal formatting may translate naturally, but an invented negative rate is a material gap', () => {
  const fixture = article(
    'Ставка составляет 16.50%.',
    'Ставка составляет 16,5%.'
  );
  expect(
    simple.compileReaderSummary(prepare(fixture), output(fixture)).assessment
      .status
  ).toBe('supported');
  fixture.answer = 'Ставка составляет -16,5%.';
  const result = simple.compileReaderSummary(prepare(fixture), output(fixture));
  expect(result.assessment.status).toBe('partial');
  expect(result.facts).toEqual([]);
  expect(result.summary).toContain('не найдены числа: -16.5');
});

test('a broken reference does not remove readable text or the other validated source', () => {
  const fixture = article(
    'Маркировка сохраняется.',
    'Маркировка сохраняется; подробные суммы штрафов здесь не приведены.'
  );
  const result = simple.compileReaderSummary(prepare(fixture), {
    answer: fixture.answer,
    gaps: [],
    references: [
      { id: 'S1', relevance: 'relevant' },
      { id: 'S9', relevance: 'relevant' },
    ],
  });
  expect(result.summary).toContain(fixture.answer);
  expect(result.assessment.status).toBe('partial');
  expect(result.facts).toHaveLength(1);
});

test('duplicate/conflicting references cannot silently qualify a source', () => {
  const fixture = article('Маркировка сохраняется.');
  const result = simple.compileReaderSummary(prepare(fixture), {
    ...output(fixture),
    references: [
      { id: 'S1', relevance: 'relevant' },
      { id: 'S1', relevance: 'irrelevant' },
    ],
  });
  expect(result.facts).toEqual([]);
  expect(result.assessment.status).toBe('insufficient_evidence');
  expect(result.summary).toContain(fixture.answer);
});

test('preparation keeps the original provenance and exact serialized input limit, with no offset tables', () => {
  const fixture = retained['1c-cloud'];
  const input = prepare(fixture);
  expect(input.inputBytes).toBe(
    legacy.serializedReaderV5InputBytes(
      input.prompt,
      simple.readerSummaryJsonSchema
    )
  );
  expect(input.inputBytes).toBeLessThanOrEqual(25000);
  expect(Object.isFrozen(input.evidence.sources)).toBe(true);
  expect(input.evidence.sources[0]).toMatchObject({
    url: fixture.sources[0].url,
    excerpt: fixture.sources[0].excerpt,
  });
  expect(
    simple.compileReaderSummary(structuredClone(input), output(fixture))
  ).toBeNull();
  expect(
    simple.prepareReaderSummary('x'.repeat(5001), [], [], 'Russian')
  ).toBeNull();
  expect(
    simple.prepareReaderSummary(
      'По состоянию на неопределенную дату',
      [],
      [],
      'Russian'
    )
  ).toBeNull();
});

test('the installed SDK serializes the simple contract and makes exactly one offline invocation', async () => {
  const fixture = article('Маркировка сохраняется.');
  const input = prepare(fixture);
  const calls = [];
  const model = new ChatOpenAI({
    apiKey: 'offline-no-secret',
    model: 'openai/gpt-6-luna',
    maxTokens: 1200,
    maxRetries: 0,
    disableStreaming: true,
    configuration: {
      baseURL: 'https://offline.invalid/v1',
      fetch: async (url, init) => {
        const body = JSON.parse(init.body);
        calls.push(body);
        expect(body.response_format.json_schema.schema).toEqual(
          simple.readerSummaryJsonSchema
        );
        expect(
          Object.keys(body.response_format.json_schema.schema.properties)
        ).toEqual(['answer', 'references', 'gaps']);
        return new Response(
          JSON.stringify({
            id: 'offline',
            object: 'chat.completion',
            created: 0,
            model: body.model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify(output(fixture)),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    },
  });
  const raw = await model
    .withStructuredOutput(simple.readerSummaryJsonSchema)
    .invoke(input.prompt);
  expect(calls).toHaveLength(1);
  expect(calls[0].max_tokens).toBe(1200);
  expect(simple.compileReaderSummary(input, raw).summary).toBe(fixture.answer);
});
