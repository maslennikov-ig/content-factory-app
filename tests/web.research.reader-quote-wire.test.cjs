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

test.each(['01.10.2026', '2026/10/01', '2026-10-1', '1 октября'])(
  'v2 date wire rejects noncanonical %s before v1 validation',
  (date) => {
    const output = wire();
    output.claims[0].dates[0].date = date;
    expect(pure.readerReviewWireV2Schema.safeParse(output).success).toBe(false);
    expect(pure.compileReaderReview(pack(), output)).toBeNull();
  }
);

test.each(['01.10.2026', '1 октября 2026'])(
  'canonical v2 dates preserve exact %s source quotes and original v1 assessment',
  (dateQuote) => {
    const input = pack(`😀 Отчёт: Альфа версия 2 действует по состоянию на ${dateQuote}.`);
    const output = wire();
    output.claims[0].dates[0].ref.quote = dateQuote;
    const compiled = pure.compileReaderReview(input, output);
    expect(compiled.claims[0].dates[0].date).toBe('2026-10-01');
    expect(input.evidence.sources[0].excerpt.slice(
      compiled.claims[0].dates[0].ref.start, compiled.claims[0].dates[0].ref.end
    )).toBe(dateQuote);
    expect(pure.validateReaderReview(input, compiled).assessment.status).toBe('supported');
  }
);

test('a canonical date cannot borrow a quote from a source absent from its claim refs', () => {
  const input = pure.packReaderReview(subject,
    [
      { url: 'https://example.org/claim', title: 'Версия', publishedAt: '2026-10-02' },
      { url: 'https://example.org/other', title: 'Другая дата', publishedAt: '2026-10-02' },
    ],
    [
      { sourceUrl: 'https://example.org/claim', text: article },
      { sourceUrl: 'https://example.org/other', text: 'Другой отчёт на 1 октября 2026 года.' },
    ], 'Russian');
  const output = wire();
  output.sources.push({ id: 'S2', relevance: 'relevant' });
  output.claims[0].dates[0].ref.source = 'S2';
  const compiled = pure.compileReaderReview(input, output);
  expect(compiled).not.toBeNull();
  expect(pure.validateReaderReview(input, compiled)).toBeNull();
});

test('a requested canonical date cannot replace the different date actually quoted', () => {
  const input = pack('Альфа версия 2 действует по состоянию на 30.09.2026.');
  const output = wire();
  output.claims[0].dates[0].ref.quote = '30.09.2026';
  const compiled = pure.compileReaderReview(input, output);
  expect(compiled).not.toBeNull();
  expect(pure.validateReaderReview(input, compiled)).toBeNull();
});

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

const anchorWire = (output = wire()) => pure.syntheticReaderAnchorWire(output);

test.each(['01.10.2026', '1 октября 2026', 'October 1, 2026'])(
  'v3 derives exact subject UTF16 spans and canonical date from source %s',
  (dateLiteral) => {
    const request = '😀 ' + subject;
    const input = pack(`😀 Отчёт: Альфа версия 2 действует по состоянию на ${dateLiteral}.`, request);
    const output = anchorWire();
    output.coverage[0].question = request;
    output.claims[0].dates[0] = {
      kind: 'as_of', dateLiteral,
      ref: { source: 'S1', quote: dateLiteral },
    };
    const original = structuredClone(output);
    const compiled = pure.compileReaderReview(input, output);
    expect(compiled).not.toBeNull();
    expect(compiled.entities[0]).toMatchObject({
      name: 'Альфа', subjectStart: request.indexOf('Альфа'),
      subjectEnd: request.indexOf('Альфа') + 5,
    });
    expect(compiled.claims[0].dates[0].date).toBe('2026-10-01');
    expect(pure.validateReaderReview(input, compiled).assessment.status).toBe('supported');
    expect(output).toEqual(original);
    expect(output.entities[0]).not.toHaveProperty('name');
    expect(output.entities[0]).not.toHaveProperty('subjectStart');
    expect(output.claims[0].dates[0]).not.toHaveProperty('date');
  }
);

test.each([
  ['missing subject anchor', o => { delete o.entities[0].subjectQuote; }],
  ['foreign subject name', o => { o.entities[0].subjectQuote = 'Бета'; }],
  ['translated subject name', o => { o.entities[0].subjectQuote = 'Alpha'; }],
  ['different case', o => { o.entities[0].subjectQuote = 'альфа'; }],
  ['numeric offset added', o => { o.entities[0].subjectStart = 0; }],
  ['redundant name added', o => { o.entities[0].name = 'Альфа'; }],
  ['source quote omits name', o => { o.entities[0].ref.quote = 'версия 2'; }],
  ['foreign entity source', o => { o.entities[0].ref.source = 'S9'; }],
  ['date quote omits literal', o => { o.claims[0].dates[0].ref.quote = 'версия 2'; }],
  ['date literal incomplete', o => { o.claims[0].dates[0].dateLiteral = 'октября 2026'; }],
  ['requested canonical date is not a source literal', o => { o.claims[0].dates[0].dateLiteral = '2026-10-01'; }],
  ['canonical date field added', o => { o.claims[0].dates[0].date = '2026-10-01'; }],
])('v3 %s fails closed without repairing invalid annotations', (_label, mutate) => {
  const output = anchorWire(); mutate(output);
  expect(pure.compileReaderReview(pack(), output)).toBeNull();
});

test('v3 repeated subject name and surrogate split subject quotes fail closed', () => {
  expect(pure.compileReaderReview(pack(article, subject + ' Альфа'), anchorWire())).toBeNull();
  for (const subjectQuote of ['\uD83D', '\uDE00']) {
    const output = anchorWire(); output.entities[0].subjectQuote = subjectQuote;
    expect(pure.compileReaderReview(pack(article, '😀 ' + subject), output)).toBeNull();
  }
});

test('v3 a unique date proof can contextualize a repeated date literal without choosing another source', () => {
  const text = article + ' Примечание на 1 октября 2026 года.';
  const output = anchorWire();
  output.claims[0].dates[0].ref.quote = 'Примечание на 1 октября 2026 года';
  const compiled = pure.compileReaderReview(pack(text), output);
  expect(compiled).not.toBeNull();
  expect(compiled.claims[0].dates[0].date).toBe('2026-10-01');
  expect(pure.validateReaderReview(pack(text), compiled).assessment.status).toBe('supported');
});

test('v3 date literal cannot select two different dates, a split token or a foreign claim source', () => {
  const ambiguous = anchorWire();
  ambiguous.claims[0].dates[0] = {
    kind: 'as_of', dateLiteral: '1 октября 2026 до 2 октября 2026',
    ref: { source: 'S1', quote: '1 октября 2026 до 2 октября 2026' },
  };
  expect(pure.compileReaderReview(pack(article + ' Интервал 1 октября 2026 до 2 октября 2026.'), ambiguous)).toBeNull();
  const split = anchorWire(); split.claims[0].dates[0].dateLiteral = '1 октября 2026';
  split.claims[0].dates[0].ref.quote = '1 октября 2026';
  expect(pure.compileReaderReview(pack(article.replace('2026 года', '20261 года')), split)).toBeNull();
  const input = pure.packReaderReview(subject,
    [{url:'https://example.org/claim',title:'Версия',publishedAt:'2026-10-02'},
     {url:'https://example.org/other',title:'Другая дата',publishedAt:'2026-10-02'}],
    [{sourceUrl:'https://example.org/claim',text:article},
     {sourceUrl:'https://example.org/other',text:'Другой отчёт на 1 октября 2026 года.'}], 'Russian');
  const output = anchorWire(); output.sources.push({id:'S2',relevance:'relevant'});
  output.claims[0].dates[0].ref.source = 'S2';
  expect(pure.compileReaderReview(input, output)).toBeNull();
});

test('v3 compilation retains final v1 requested-name claim and date chronology guards', () => {
  const output = anchorWire(); output.claims[0].text = 'Версия 2 действовала.';
  const compiled = pure.compileReaderReview(pack(), output);
  expect(compiled).not.toBeNull();
  expect(pure.validateReaderReview(pack(), compiled)).toBeNull();
  const text = 'Альфа версия 2 действует с 1 октября 2026 до 2 октября 2026.';
  const reversed = anchorWire(); reversed.entities = [];
  reversed.claims[0].dates = [
    {kind:'effective_from',dateLiteral:'2 октября 2026',ref:{source:'S1',quote:'2 октября 2026'}},
    {kind:'effective_until',dateLiteral:'1 октября 2026',ref:{source:'S1',quote:'1 октября 2026'}},
  ];
  const intervals = pure.compileReaderReview(pack(text), reversed);
  expect(intervals).not.toBeNull();
  expect(pure.validateReaderReview(pack(text), intervals)).toBeNull();
});

test('v3 full multiword requested name is copied exactly without translation or a second name field', () => {
  const request = subject.replace('Альфа', 'Банк Альфа');
  const text = article.replace('Альфа', 'Банк Альфа');
  const output = anchorWire();
  output.entities[0].subjectQuote = 'Банк Альфа';
  output.entities[0].ref.quote = 'Банк Альфа';
  output.claims[0].refs[0].quote = 'Банк Альфа версия 2 действует';
  output.claims[0].text = output.claims[0].text.replace('Альфа', 'Банк Альфа');
  output.coverage[0].question = request;
  const compiled = pure.compileReaderReview(pack(text, request), output);
  expect(compiled.entities[0].name).toBe('Банк Альфа');
  expect(pure.validateReaderReview(pack(text, request), compiled).assessment.status).toBe('supported');
  output.entities[0].subjectQuote = 'Bank Alpha';
  expect(pure.compileReaderReview(pack(text, request), output)).toBeNull();
});

test('v3 duplicate source anchors and an adjacent day prefix are never normalized or silently repaired', () => {
  expect(pure.compileReaderReview(pack(article + ' Альфа'), anchorWire())).toBeNull();
  const output = anchorWire();
  expect(pure.compileReaderReview(pack(article.replace('1 октября 2026', '21 октября 2026')), output)).toBeNull();
});
