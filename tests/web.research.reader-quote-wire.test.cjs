'use strict';

const pure = require('./helpers/reader-source-review.cjs');
const subject = 'По состоянию на 1 октября 2026 года: версия Альфа?';
const article =
  '😀 Отчёт: Альфа версия 2 действует по состоянию на 1 октября 2026 года.';
const pack = (text = article, request = subject) =>
  pure.packReaderReview(
    request,
    [
      {
        url: 'https://example.org/retrospective',
        title: 'История версии',
        publishedAt: '2026-10-02',
      },
    ],
    [{ sourceUrl: 'https://example.org/retrospective', text }],
    'Russian'
  );
const wire = () => ({
  version: 'reader-source-review-wire/v2',
  sources: [{ id: 'S1', relevance: 'relevant' }],
  claims: [
    {
      text: 'Альфа версия 2 действовала на указанную дату.',
      kind: 'observed',
      refs: [{ source: 'S1', quote: 'Альфа версия 2 действует' }],
      dates: [
        {
          kind: 'as_of',
          date: '2026-10-01',
          ref: { source: 'S1', quote: '1 октября 2026' },
        },
      ],
    },
  ],
  coverage: [{ question: subject, status: 'supported' }],
  entities: [
    {
      name: 'Альфа',
      subjectStart: subject.indexOf('Альфа'),
      subjectEnd: subject.indexOf('Альфа') + 5,
      status: 'supported_claim',
      ref: { source: 'S1', quote: 'Альфа' },
    },
  ],
});
const validate = (input, output) => {
  const compiled = pure.compileReaderReview(input, output);
  return compiled === null ? null : pure.validateReaderReview(input, compiled);
};

test('unique Cyrillic and astral quotes become exact UTF-16 spans while legacy split coordinates remain rejected', () => {
  const input = pack();
  const output = wire(),
    original = structuredClone(output);
  const compiled = pure.compileReaderReview(input, output);
  expect(compiled.claims[0].refs[0]).toEqual({
    source: 'S1',
    start: article.indexOf('Альфа версия 2 действует'),
    end:
      article.indexOf('Альфа версия 2 действует') +
      'Альфа версия 2 действует'.length,
  });
  expect(output).toEqual(original);
  const accepted = pure.validateReaderReview(input, compiled);
  expect(accepted.assessment.version).toBe('reader-source-review/v1');
  expect(accepted.assessment.status).toBe('supported');
  expect(accepted.facts).toHaveLength(1);
  const wrong = structuredClone(compiled);
  wrong.claims[0].refs[0] = { source: 'S1', start: 0, end: 1 };
  expect(pure.validateReaderReview(input, wrong)).toBeNull();
  const astral = wire();
  astral.claims[0].refs[0].quote = '😀';
  expect(pure.compileReaderReview(input, astral).claims[0].refs[0]).toEqual({
    source: 'S1',
    start: 0,
    end: 2,
  });
});

test.each([
  ['empty', '', article],
  ['absent', 'Несуществующая цитата', article],
  ['different case', 'альфа версия 2 действует', article],
  ['normalized whitespace', 'Альфа  версия 2 действует', article],
  ['ambiguous', 'Альфа', article + ' Альфа'],
  ['overlapping occurrences', 'aa', 'aaa'],
  ['high surrogate only', '\uD83D', article],
  ['low surrogate only', '\uDE00', article],
  ['different Unicode normalization', 'é', 'e\u0301'],
])('%s source quote fails closed', (_label, quote, text) => {
  const output = wire();
  output.claims[0].refs[0].quote = quote;
  expect(pure.compileReaderReview(pack(text), output)).toBeNull();
});

test.each([
  [
    'foreign source',
    (r) => {
      r.claims[0].refs[0].source = 'S9';
    },
  ],
  [
    'missing quote',
    (r) => {
      delete r.claims[0].refs[0].quote;
    },
  ],
  [
    'legacy coordinates',
    (r) => {
      r.claims[0].refs[0] = { source: 'S1', start: 0, end: 2 };
    },
  ],
  [
    'extra coordinate',
    (r) => {
      r.claims[0].refs[0].start = 0;
    },
  ],
  [
    'wrong version',
    (r) => {
      r.version = 'reader-source-review-wire/v1';
    },
  ],
  [
    'missing version',
    (r) => {
      delete r.version;
    },
  ],
  [
    'missing date quote',
    (r) => {
      delete r.claims[0].dates[0].ref.quote;
    },
  ],
  [
    'foreign entity source',
    (r) => {
      r.entities[0].ref.source = 'S9';
    },
  ],
  [
    'extra entity reference field',
    (r) => {
      r.entities[0].ref.hash = 'invented';
    },
  ],
])(
  '%s wire is rejected without fallback to numeric references',
  (_label, mutate) => {
    const output = wire();
    mutate(output);
    expect(pure.compileReaderReview(pack(), output)).toBeNull();
  }
);

test.each([
  [
    'irrelevant verdict',
    (r) => {
      r.sources[0].relevance = 'irrelevant';
    },
  ],
  [
    'duplicate verdict',
    (r) => {
      r.sources.push(r.sources[0]);
    },
  ],
  [
    'wrong date literal',
    (r) => {
      r.claims[0].dates[0].date = '2026-10-02';
    },
  ],
  [
    'paraphrased coverage',
    (r) => {
      r.coverage[0].question = 'Действующая версия компании';
    },
  ],
  [
    'wrong subject span',
    (r) => {
      r.entities[0].subjectStart--;
    },
  ],
  [
    'unsupported named claim',
    (r) => {
      r.claims[0].text = 'Версия 2 действовала.';
    },
  ],
  [
    'name absent in entity quote',
    (r) => {
      r.entities[0].ref.quote = 'Отчёт';
    },
  ],
])(
  '%s original v1 guard remains authoritative after quote compilation',
  (_label, mutate) => {
    const output = wire();
    mutate(output);
    const compiled = pure.compileReaderReview(pack(), output);
    expect(compiled).not.toBeNull();
    expect(pure.validateReaderReview(pack(), compiled)).toBeNull();
  }
);

test('later retrospective remains supported; date-eligible forecast and unknown dates preserve original behavior', () => {
  const input = pack();
  expect(validate(input, wire()).assessment.status).toBe('supported');
  const undated = wire();
  undated.claims[0].dates = [];
  undated.entities = [];
  expect(validate(input, undated).assessment.status).toBe(
    'insufficient_evidence'
  );
  const future = wire();
  future.entities = [];
  future.claims[0].kind = 'forecast';
  future.claims[0].dates = [
    {
      kind: 'announced',
      date: '2026-10-01',
      ref: { source: 'S1', quote: '1 октября 2026' },
    },
    {
      kind: 'target',
      date: '2026-10-01',
      ref: { source: 'S1', quote: '1 октября 2026' },
    },
  ];
  expect(validate(input, future).assessment.claims[0].kind).toBe('forecast');
});

test('prompt requires exact contiguous subject coverage and unambiguous verbatim quotes', () => {
  const input = pack();
  expect(input.prompt).toContain('coverage.question');
  expect(input.prompt).toContain('contiguous substring');
  expect(input.prompt).toContain('exactly once');
});

test('a matching quote in another presented source never remaps the declared source', () => {
  const input = pack();
  input.evidence.sources.push({
    ...input.evidence.sources[0],
    id: 'S2',
    excerpt: 'Другой источник без требуемой цитаты.',
  });
  const output = wire();
  output.sources.push({ id: 'S2', relevance: 'relevant' });
  output.claims[0].refs[0].source = 'S2';
  expect(pure.compileReaderReview(input, output)).toBeNull();
});

test('closed intervals and forecast chronology retain original date guards after quote compilation', () => {
  const text =
    'Альфа версия 2 действует с 1 октября 2026 года до 2 октября 2026 года. Альфа объявила прогноз 30 сентября 2026 года на 23 октября 2026 года.';
  const input = pack(text),
    output = wire();
  output.entities = [];
  output.claims[0].dates = [
    {
      kind: 'effective_from',
      date: '2026-10-01',
      ref: { source: 'S1', quote: '1 октября 2026' },
    },
    {
      kind: 'effective_until',
      date: '2026-10-02',
      ref: { source: 'S1', quote: '2 октября 2026' },
    },
  ];
  expect(validate(input, output).assessment.status).toBe('supported');
  const reversed = structuredClone(output);
  reversed.claims[0].dates = output.claims[0].dates.map((date) => ({
    ...date,
    kind: date.kind === 'effective_from' ? 'effective_until' : 'effective_from',
  }));
  expect(validate(input, reversed)).toBeNull();
  const forecast = structuredClone(output);
  forecast.claims[0].kind = 'forecast';
  forecast.claims[0].refs[0].quote = 'Альфа объявила прогноз';
  forecast.claims[0].dates = [
    {
      kind: 'announced',
      date: '2026-09-30',
      ref: { source: 'S1', quote: '30 сентября 2026' },
    },
    {
      kind: 'target',
      date: '2026-10-23',
      ref: { source: 'S1', quote: '23 октября 2026' },
    },
  ];
  expect(validate(input, forecast).assessment.claims[0].kind).toBe('forecast');
  const reversedForecast = structuredClone(forecast);
  reversedForecast.claims[0].dates = forecast.claims[0].dates.map((date) => ({
    ...date,
    kind: date.kind === 'announced' ? 'target' : 'announced',
  }));
  expect(validate(input, reversedForecast)).toBeNull();
  forecast.claims[0].dates[0] = {
    kind: 'announced',
    date: '2026-10-02',
    ref: { source: 'S1', quote: '2 октября 2026' },
  };
  expect(validate(input, forecast).assessment.status).toBe(
    'insufficient_evidence'
  );
});
