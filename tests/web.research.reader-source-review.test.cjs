'use strict';

// Real complete service and existing metering ports. Provider/model outputs are
// synthetic projections, never a replay or claim about the historical LLM.
const fs = require('node:fs');
const path = require('node:path');
const fixture =
  require('./fixtures/search-reader-recorded5818-neutral.json').cases;
const harnessText = fs.readFileSync(
  path.join(__dirname, 'web.research.source-admission.test.cjs'),
  'utf8'
);
const prefix = harnessText
  .slice(
    0,
    harnessText.indexOf(
      "describe('Russian advertising-labeling reader admission'"
    )
  )
  .replace(
    'return { withStructuredOutput: () => ({}) };',
    'return { withStructuredOutput: (schema) => {calls.model.at(-1).schema=schema; return {}; } };'
  );
if (prefix.length < 5000)
  throw new Error('Existing real-service ports not found');
let resetPorts;
const h = new Function(
  'require',
  'beforeEach',
  prefix +
    `
  return {calls, WebResearchService, aiUsage, summaryPrompts, search,
    set(input, answer, output) {
      classification={scope:'local',subjectLanguage:'ru',englishQuery:'fixture query',subjectLanguageQuery:input.subject,freshnessRequired:false};
      responses={tavily:{answer,usage:{credits:2},results:input.sources.map(r=>({title:r.title,url:r.url,content:r.excerpt,published_date:r.publishedAt}))}};
      summaryOutput=output;
    }, fail(error) {summaryError=error;}
  };
`
)(require, (callback) => {
  resetPorts = callback;
});
beforeEach(() => resetPorts());
const rejected = (input) => ({
  sources: input.sources.map((_, i) => ({
    id: `S${i + 1}`,
    relevance: 'irrelevant',
  })),
  claims: [],
  coverage: [{ question: input.subject, status: 'unsupported' }],
  entities: [],
});
const evidence = () => {
  const input = h.summaryPrompts()[0].input;
  return input.evidence
    ? JSON.parse(input.evidence)
    : JSON.parse(input.reviewRequest.split('Untrusted reader evidence:\n')[1]);
};

test('recorded off-topic 1C candidates never become takeable relevant facts', async () => {
  h.set(fixture['1c'], fixture['1c'].summary, rejected(fixture['1c']));
  const out = await h.search(fixture['1c'].subject);
  expect(out.facts).toHaveLength(0);
  expect(out.readerAssessment.status).toBe('insufficient_evidence');
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.rows).toHaveLength(1);
});

test('a complete Russian provider answer buys exactly one combined reader review', async () => {
  h.set(fixture.rate, fixture.rate.summary, rejected(fixture.rate));
  const out = await h.search(fixture.rate.subject);
  expect(h.summaryPrompts()).toHaveLength(1);
  expect(h.calls.model).toHaveLength(2);
  expect(out.summary).toBe('');
  expect(out.facts).toHaveLength(0);
});

test('the recorded VTB tail beyond1000 is actually presented and receipt-bound', async () => {
  h.set(fixture.rate, '', rejected(fixture.rate));
  const out = await h.search(fixture.rate.subject);
  const source = evidence().sources.find(
    (r) => r.url === fixture.rate.sources[1].url
  );
  expect(source.excerpt.indexOf('ВТБ')).toBe(1386);
  expect(source.excerpt.indexOf('ВТБ', 1387)).toBe(1461);
  expect(
    out.readerAssessment.evidence.find((r) => r.url === source.url).excerpt
  ).toBe(source.excerpt);
  expect(source.excerpt.length).toBeLessThanOrEqual(3000);
});

const pure = require('./helpers/reader-source-review.cjs');
const {
  ChatPromptTemplate: RealPromptTemplate,
} = require('@langchain/core/prompts');
const actualInputBytes = async (prompt, schema = pure.readerReviewJsonSchema) =>
  Buffer.byteLength(
    JSON.stringify({
      messages: await RealPromptTemplate.fromTemplate(
        '{reviewRequest}'
      ).formatMessages({ reviewRequest: prompt }),
      schema,
    })
  );
const subject =
  'По состоянию на 1 октября 2026 года: укажи действующую версию и прогноз.';
const article =
  'Версия 2 действовала по состоянию на 1 октября 2026 года. Решение действует с 11 сентября 2026 года. Компания объявила прогноз 30 сентября 2026 года на 23 октября 2026 года. Следующая версия действует с 2 октября 2026 года.';
const sample = (text = article, request = subject) => ({
  subject: request,
  sources: [
    {
      url: 'https://example.org/version-history.pdf',
      title: 'История версии',
      publishedAt: '2026-10-02',
      excerpt: text,
    },
  ],
});
const pack = (input = sample()) =>
  pure.packReaderReview(
    input.subject,
    input.sources,
    input.sources.map((s) => ({ sourceUrl: s.url, text: s.excerpt })),
    'Russian'
  );
const ref = (text, phrase) => ({
  source: 'S1',
  start: text.indexOf(phrase),
  end: text.indexOf(phrase) + phrase.length,
});
const claim = (
  text = article,
  kind = 'observed',
  dates = [
    { kind: 'as_of', date: '2026-10-01', ref: ref(text, '1 октября 2026') },
  ]
) => ({
  text: 'Версия 2 действовала на указанную дату.',
  kind,
  refs: [{ source: 'S1', start: 0, end: text.length }],
  dates,
});
const review = (input, claims = [claim(input.sources[0].excerpt)]) => ({
  sources: [{ id: 'S1', relevance: 'relevant' }],
  claims,
  coverage: [{ question: input.subject, status: 'supported' }],
  entities: [],
});

test('later publication remains eligible for a supported fact effective at the requested date', async () => {
  const input = sample();
  h.set(input, 'Непроверенный ответ движка.', review(input));
  const out = await h.search(input.subject);
  expect(out.facts).toHaveLength(1);
  expect(out.readerAssessment.requestedDate).toBe('2026-10-01');
  expect(out.readerAssessment.claims[0].dates[0].date).toBe('2026-10-01');
  expect(out.sources[0].publishedAt).toBe('2026-10-02');
  expect(h.calls.model[1].maxTokens).toBe(1200);
  const modelInputBytes = await actualInputBytes(
    h.summaryPrompts()[0].input.reviewRequest,
    h.calls.model[1].schema
  );
  expect(modelInputBytes).toBe(out.readerAssessment.inputBytes);
  expect(modelInputBytes).toBeLessThanOrEqual(25000);
});

test.each([
  [
    'future effective date',
    'observed',
    [
      {
        kind: 'effective_from',
        date: '2026-10-02',
        ref: ref(article, '2 октября 2026'),
      },
    ],
  ],
  ['unknown fact date', 'observed', []],
  [
    'forecast first announced later',
    'forecast',
    [
      {
        kind: 'announced',
        date: '2026-10-02',
        ref: ref(article, '2 октября 2026'),
      },
      {
        kind: 'target',
        date: '2026-10-23',
        ref: ref(article, '23 октября 2026'),
      },
    ],
  ],
  ['undated forecast', 'forecast', []],
])(
  '%s cannot become a current dated claim/card',
  async (_label, kind, dates) => {
    const input = sample();
    h.set(
      input,
      'Не возвращать этот сырой ответ.',
      review(input, [claim(article, kind, dates)])
    );
    const out = await h.search(input.subject);
    expect(out.facts).toEqual([]);
    expect(out.summary).toBe('');
    expect(out.readerAssessment.status).toBe('insufficient_evidence');
    expect(out.readerAssessment.coverage[0].status).toBe('unsupported');
    expect(h.calls.search).toHaveLength(1);
  }
);

test('forecast announced by the requested date keeps target/attribution distinct from observed facts', () => {
  const input = sample();
  const forecast = claim(article, 'forecast', [
    {
      kind: 'announced',
      date: '2026-09-30',
      ref: ref(article, '30 сентября 2026'),
    },
    {
      kind: 'target',
      date: '2026-10-23',
      ref: ref(article, '23 октября 2026'),
    },
  ]);
  forecast.text =
    'Компания прогнозировала следующую версию на 23 октября 2026 года.';
  const out = pure.validateReaderReview(pack(input), review(input, [forecast]));
  expect(out.assessment.claims[0].kind).toBe('forecast');
  expect(out.assessment.claims[0].dates.map((d) => d.date)).toEqual([
    '2026-09-30',
    '2026-10-23',
  ]);
});

test('mixed article is filtered by claim rather than publication or whole page', () => {
  const input = sample();
  const future = claim(article, 'observed', [
    {
      kind: 'effective_from',
      date: '2026-10-02',
      ref: ref(article, '2 октября 2026'),
    },
  ]);
  future.text = 'Следующая версия уже действует.';
  const out = pure.validateReaderReview(
    pack(input),
    review(input, [claim(), future])
  );
  expect(out.assessment.claims).toHaveLength(1);
  expect(out.assessment.status).toBe('partial');
  expect(out.summary).not.toContain('Следующая');
});

test.each([
  [
    'foreign source',
    (r) => {
      r.claims[0].refs[0].source = 'S9';
    },
  ],
  [
    'span outside presented evidence',
    (r) => {
      r.claims[0].refs[0].end = 100000;
    },
  ],
  [
    'wrong date evidence',
    (r) => {
      r.claims[0].dates[0].date = '2026-10-02';
    },
  ],
  [
    'untyped extra hash',
    (r) => {
      r.claims[0].refs[0].excerptSha256 = 'fabricated';
    },
  ],
  [
    'duplicate source verdict',
    (r) => {
      r.sources.push(r.sources[0]);
    },
  ],
])(
  '%s fails closed without a second review or provider retry',
  async (_label, mutate) => {
    const input = sample(),
      output = review(input);
    mutate(output);
    h.set(input, 'Не возвращать запасной ответ.', output);
    const out = await h.search(input.subject);
    expect(out.readerAssessment.status).toBe('review_unavailable');
    expect(out.summary).toBe('');
    expect(out.facts).toEqual([]);
    expect(h.summaryPrompts()).toHaveLength(1);
    expect(h.calls.search).toHaveLength(1);
    expect(h.calls.rows).toHaveLength(1);
  }
);

test.each([
  undefined,
  { claims: [] },
  { sources: [], claims: [], coverage: [], entities: [] },
])(
  'malformed/incomplete output keeps no unreviewed fallback',
  async (output) => {
    h.set(sample(), 'Не возвращать запасной ответ.', output);
    const out = await h.search(subject);
    expect(out.readerAssessment.status).toBe('review_unavailable');
    expect(out.summary).toBe('');
    expect(h.calls.model).toHaveLength(2);
  }
);

test('transport failure preserves completed search and both accounted attempts without retry', async () => {
  h.set(sample(), 'Не возвращать запасной ответ.', review(sample()));
  h.fail(new Error('Synthetic reader transport failure'));
  const out = await h.search(subject);
  expect(out.readerAssessment.status).toBe('review_unavailable');
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.rows).toHaveLength(1);
  expect(h.calls.rows[0].columns.promptTokens).toBe(200);
  expect(h.calls.rows[0].columns.costUsd).toBeCloseTo(0.0003);
});

test('generic requested VTB mention stays contextual, exact and grounded beyond1000', async () => {
  const output = rejected(fixture.rate);
  const start = fixture.rate.subject.indexOf('ВТБ');
  output.entities = [
    {
      name: 'ВТБ',
      subjectStart: start,
      subjectEnd: start + 3,
      status: 'contextual_mention',
      ref: { source: 'S2', start: 1386, end: 1389 },
    },
  ];
  h.set(fixture.rate, fixture.rate.summary, output);
  const out = await h.search(fixture.rate.subject);
  expect(out.summary).toContain('ВТБ:');
  expect(out.summary).toContain('не подтверждено');
  expect(out.summary).not.toMatch(/13,5|VTBS/);
  expect(out.readerAssessment.claims).toEqual([]);
  expect(out.readerAssessment.entities[0].status).toBe('contextual_mention');
  const stored = out.readerAssessment.evidence.find((s) => s.id === 'S2');
  expect(stored.excerpt.slice(1386, 1389)).toBe('ВТБ');
  expect(stored.excerptSha256).toBe(
    require('node:crypto')
      .createHash('sha256')
      .update(stored.excerpt)
      .digest('hex')
  );
});

test('generic contextual name requires exact subject and source span, not an invented substitution', () => {
  const input = sample(
    'Компания «Альфа» упомянута в связанном заголовке.',
    'Укажи Альфа, если упоминается.'
  );
  const output = review(input, []);
  output.entities = [
    {
      name: 'Альфа',
      subjectStart: 6,
      subjectEnd: 11,
      status: 'contextual_mention',
      ref: ref(input.sources[0].excerpt, 'Альфа'),
    },
  ];
  expect(pure.validateReaderReview(pack(input), output)).not.toBeNull();
  output.entities[0].name = 'Alpha';
  expect(pure.validateReaderReview(pack(input), output)).toBeNull();
});

test('missing name beyond clipped evidence is unknown, never whole-source absence', () => {
  const input = sample(
    'Пояснение. '.repeat(700) + 'Альфа',
    'Альфа, если упоминается.'
  );
  const output = review(input, []);
  output.entities = [
    {
      name: 'Альфа',
      subjectStart: 0,
      subjectEnd: 5,
      status: 'not_observed_in_presented_evidence',
      ref: null,
    },
  ];
  const out = pure.validateReaderReview(pack(input), output);
  expect(out.assessment.entities[0].status).toBe('unknown_due_to_bounds');
});

test('relevant explanatory unfamiliar PDF can pass without literal subject keyword', async () => {
  const input = sample(
    'Используйте дистанционный доступ к общей базе и проверьте условия аренды.',
    'Миграция прикладной системы в облачную среду.'
  );
  const output = review(input, [
    claim(input.sources[0].excerpt, 'context', []),
  ]);
  output.claims[0].text = input.sources[0].excerpt;
  h.set(input, 'Готовый ответ.', output);
  expect((await h.search(input.subject)).facts).toHaveLength(1);
});

test('full5000 subject plus escaped Unicode sources/schema/rules stay within actual aggregate cap', async () => {
  const request = 'я'.repeat(5000);
  const sources = Array.from({ length: 8 }, (_, i) => ({
    url: `https://example.org/${i}`,
    title: 'слово'.repeat(100),
    publishedAt: '2026-10-02',
  }));
  const facts = sources.map((s) => ({
    sourceUrl: s.url,
    text: '😀\\"\n'.repeat(1000),
  }));
  const original = structuredClone(facts);
  const out = pure.packReaderReview(request, sources, facts, 'Russian');
  expect(out.evidence.subject).toBe(request);
  expect(out.evidence.sources).toHaveLength(8);
  expect(
    out.evidence.sources.every(
      (s) => s.excerpt.length <= 3000 && !/[\uD800-\uDBFF]$/.test(s.excerpt)
    )
  ).toBe(true);
  expect(out.inputBytes).toBe(await actualInputBytes(out.prompt));
  expect(out.inputBytes).toBeLessThanOrEqual(25000);
  expect(out.inputBytes).toBeGreaterThan(24500);
  expect(Buffer.byteLength(JSON.stringify(out.evidence))).toBeLessThanOrEqual(
    21000
  );
  expect(facts).toEqual(original);
});

test.each([
  'По состоянию на 31 февраля 2026 года: версия?',
  'По состоянию на 1 октября 2026 года и 2 октября 2026 года: версия?',
  'По состоянию на 1 октября 2026 года 14:00 UTC: версия?',
])(
  'ambiguous/invalid/time-qualified request is not silently reduced to a convenient day: %s',
  (request) => {
    expect(pack(sample(article, request))).toBeNull();
  }
);

test.each([
  { language: 'ru' },
  { language: 'ru', readerResponse: false },
  { readerResponse: true },
  { language: 'ru', readerResponse: true, queries: ['migration'] },
  { language: 'ru', readerResponse: true, task: 'discovery' },
])(
  'legacy/explicit-query/discovery paths retain their answer/admission and never invoke review: %j',
  async (options) => {
    h.set(fixture['1c'], fixture['1c'].summary, rejected(fixture['1c']));
    const out = await h.search(fixture['1c'].subject, options);
    expect(out.summary).toBe(fixture['1c'].summary);
    expect(out.facts).toHaveLength(3);
    expect(out.readerAssessment).toBeUndefined();
    expect(h.summaryPrompts()).toHaveLength(0);
    expect(h.calls.search).toHaveLength(1);
  }
);

test('new reader cache retains assessment without extra spend and stays separate from consumer', async () => {
  h.set(fixture['1c'], fixture['1c'].summary, rejected(fixture['1c']));
  const service = new h.WebResearchService(h.aiUsage),
    opts = { language: 'ru', readerResponse: true };
  const first = await service.research(
    'fixture-organization',
    fixture['1c'].subject,
    opts
  );
  const cached = await service.research(
    'fixture-organization',
    fixture['1c'].subject,
    opts
  );
  expect(cached.readerAssessment).toEqual(first.readerAssessment);
  expect(cached.fromCache).toBe(true);
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.rows).toHaveLength(1);
  const consumer = await service.research(
    'fixture-organization',
    fixture['1c'].subject,
    { language: 'ru' }
  );
  expect(consumer.readerAssessment).toBeUndefined();
  expect(consumer.facts).toHaveLength(3);
  expect(h.calls.model).toHaveLength(3);
});

test('an over-bound URL is excluded rather than rewritten into a different identity', () => {
  const input = sample();
  const original = 'https://example.org/' + 'x'.repeat(500);
  input.sources[0].url = original;
  const packed = pack(input);
  expect(packed.evidence.sources).toEqual([]);
  expect(packed.evidence.bounds).toMatchObject({
    candidateCount: 1,
    presentedCount: 0,
    omittedCount: 1,
    excludedUrlCount: 1,
  });
  expect(input.sources[0].url).toBe(original);
});

test.each(['more than8 candidates', 'excluded URL'])(
  '%s makes unseen entity coverage unknown even without clipped excerpts',
  (reason) => {
    const input = sample('Короткое пояснение.', 'Альфа, если упоминается.');
    input.sources = Array.from(
      { length: reason === 'more than8 candidates' ? 9 : 2 },
      (_, i) => ({
        ...input.sources[0],
        url:
          'https://example.org/' +
          (reason === 'excluded URL' && i === 1 ? 'x'.repeat(500) : i),
      })
    );
    const packed = pack(input);
    const output = review(input, []);
    output.sources = packed.evidence.sources.map((s) => ({
      id: s.id,
      relevance: 'relevant',
    }));
    output.entities = [
      {
        name: 'Альфа',
        subjectStart: 0,
        subjectEnd: 5,
        status: 'not_observed_in_presented_evidence',
        ref: null,
      },
    ];
    expect(packed.evidence.sources.every((s) => !s.clipped)).toBe(true);
    const out = pure.validateReaderReview(packed, output);
    expect(out.assessment.entities[0].status).toBe('unknown_due_to_bounds');
    expect(out.assessment.bounds.omittedCount).toBe(1);
  }
);

test('only a source-grounded closed interval covers a dated observed claim', () => {
  const text =
    'Версия действует с 11 сентября 2026 года до 2 октября 2026 года.';
  const input = sample(text);
  const dates = [
    {
      kind: 'effective_from',
      date: '2026-09-11',
      ref: ref(text, '11 сентября 2026'),
    },
    {
      kind: 'effective_until',
      date: '2026-10-02',
      ref: ref(text, '2 октября 2026'),
    },
  ];
  expect(
    pure.validateReaderReview(
      pack(input),
      review(input, [claim(text, 'observed', dates)])
    ).facts
  ).toHaveLength(1);
  const noEnd = pure.validateReaderReview(
    pack(input),
    review(input, [claim(text, 'observed', dates.slice(0, 1))])
  );
  expect(noEnd.assessment.status).toBe('insufficient_evidence');
  expect(noEnd.facts).toEqual([]);
});

test.each(['reversed interval', 'reversed forecast'])(
  '%s with individually grounded dates fails closed',
  (kind) => {
    const input = sample();
    const dates =
      kind === 'reversed interval'
        ? [
            {
              kind: 'effective_from',
              date: '2026-10-02',
              ref: ref(article, '2 октября 2026'),
            },
            {
              kind: 'effective_until',
              date: '2026-09-11',
              ref: ref(article, '11 сентября 2026'),
            },
          ]
        : [
            {
              kind: 'announced',
              date: '2026-10-23',
              ref: ref(article, '23 октября 2026'),
            },
            {
              kind: 'target',
              date: '2026-09-30',
              ref: ref(article, '30 сентября 2026'),
            },
          ];
    expect(
      pure.validateReaderReview(
        pack(input),
        review(input, [
          claim(
            article,
            kind === 'reversed interval' ? 'observed' : 'forecast',
            dates
          ),
        ])
      )
    ).toBeNull();
  }
);

test('authenticated assessment projection includes only declared fields and exact URL identities', () => {
  const input = sample(),
    result = pure.validateReaderReview(pack(input), review(input));
  const projected = pure.projectReaderAssessment({
    ...result.assessment,
    extra: 'untrusted',
  });
  expect(projected.extra).toBeUndefined();
  expect(projected.evidence[0].url).toBe(input.sources[0].url);
  expect(projected.bounds).toEqual(pack(input).evidence.bounds);
});

// V2: reviewer-proven temporal/cache boundaries; V1 cases above stay intact.
test.each([
  'Действующая версия на 1 октября 2026 года?',
  'Which version was current as at October 1, 2026?',
  'Current version on 2026-10-01?',
  'Действующая версия на 01.10.2026?',
])(
  'an explicit RU/EN civil-date request cannot become undated: %s',
  (request) => {
    const input = sample(article, request);
    const packed = pack(input);
    expect(packed.evidence.requestedDate).toBe('2026-10-01');
    expect(packed.evidence.subject).toBe(request);
    const out = pure.validateReaderReview(
      packed,
      review(input, [claim(article, 'observed', [])])
    );
    expect(out.facts).toEqual([]);
    expect(out.assessment.status).toBe('insufficient_evidence');
  }
);

test.each([
  'По состоянию на 1 октября 2026 года в 14 часов МСК: действующая версия?',
  'По состоянию на 1 октября 2026 года в14часовМСК: действующая версия?',
  'По состоянию на 1 октября 20260 года: действующая версия?',
  'Действующая версия на 10/01/2026?',
  'Действующая версия на 1 октября 2026 года и 2 октября 2026 года?',
  'Which version was current as at October 1, 2026 at 2 PM EST?',
  'По состоянию на 1 октября 2026 года: ' +
    'дополнительный контекст '.repeat(10) +
    'в 14 часов по московскому времени?',
])(
  'unsupported/malformed precision fails before review instead of discarding its constraint: %s',
  (request) => {
    expect(pack(sample(article, request))).toBeNull();
  }
);

test('a five-digit grounded source year cannot certify its four-digit prefix', () => {
  const text = 'Версия действует по состоянию на 1 октября 20260 года.';
  const input = sample(text);
  const output = review(input, [
    claim(text, 'observed', [
      { kind: 'as_of', date: '2026-10-01', ref: ref(text, '1 октября 20260') },
    ]),
  ]);
  expect(pure.validateReaderReview(pack(input), output)).toBeNull();
});

test.each(['transport', 'schema'])(
  'a %s review failure is retried only by a new explicit outer request, then valid results cache normally',
  async (failure) => {
    const input = sample();
    h.set(
      input,
      'Не использовать запасной ответ.',
      failure === 'schema'
        ? { sources: [], claims: [], coverage: [], entities: [] }
        : review(input)
    );
    if (failure === 'transport') h.fail(new Error('Synthetic review failure'));
    const service = new h.WebResearchService(h.aiUsage),
      options = { language: 'ru', readerResponse: true };
    const first = await service.research(
      'fixture-organization',
      input.subject,
      options
    );
    expect(first.readerAssessment.status).toBe('review_unavailable');
    expect(first.fromCache).toBeUndefined();
    expect(h.calls.search).toHaveLength(1);
    expect(h.summaryPrompts()).toHaveLength(1);
    expect(h.calls.rows).toHaveLength(1);
    h.fail(undefined);
    h.set(input, 'Не использовать запасной ответ.', review(input));
    const second = await service.research(
      'fixture-organization',
      input.subject,
      options
    );
    expect(second.readerAssessment.status).toBe('supported');
    expect(second.fromCache).toBeUndefined();
    expect(h.calls.search).toHaveLength(2);
    expect(h.summaryPrompts()).toHaveLength(2);
    expect(h.calls.model).toHaveLength(4);
    expect(h.calls.rows).toHaveLength(2);
    expect(
      h.calls.rows.every((r) => r.succeeded && r.operation === 'web_research')
    ).toBe(true);
    const cached = await service.research(
      'fixture-organization',
      input.subject,
      options
    );
    expect(cached.fromCache).toBe(true);
    expect(cached.readerAssessment).toEqual(second.readerAssessment);
    expect(h.calls.search).toHaveLength(2);
    expect(h.calls.rows).toHaveLength(2);
  }
);

test('a non-reader summary failure keeps its existing fallback/cache behavior', async () => {
  const input = sample(article, 'Объясни миграцию прикладной системы.');
  const answer =
    'Cloud migration reduces infrastructure costs and requires careful preparation.';
  h.set(input, answer, review(input));
  h.fail(new Error('Synthetic legacy summary failure'));
  const service = new h.WebResearchService(h.aiUsage),
    options = { language: 'ru' };
  const first = await service.research(
    'fixture-organization',
    input.subject,
    options
  );
  const second = await service.research(
    'fixture-organization',
    input.subject,
    options
  );
  expect(first.summary).toBe(answer);
  expect(first.readerAssessment).toBeUndefined();
  expect(second.fromCache).toBe(true);
  expect(second.summary).toBe(answer);
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.rows).toHaveLength(1);
});

test.each([
  'Действующая версия для участников на 1 октября 2026 года?',
  'Which runtime version was current as at October 1, 2026?',
  'Which version was current as at October1,2026?',
  'Действующая версия на1октября2026?',
])(
  'date-word boundaries preserve a civil request without inventing time precision: %s',
  (request) => {
    expect(pack(sample(article, request)).evidence.requestedDate).toBe(
      '2026-10-01'
    );
  }
);

test.each([
  'Current version on 2026-10-01T14Z?',
  'Which version was current as at October 1, 2026 at 14?',
])(
  'an abbreviated instant cannot silently become a civil day: %s',
  (request) => {
    expect(pack(sample(article, request))).toBeNull();
  }
);

test('a date ref ending inside a five-digit source year cannot certify a prefix', () => {
  const text = 'Версия действует по состоянию на 1 октября 20260 года.';
  const input = sample(text);
  const output = review(input, [
    claim(text, 'observed', [
      { kind: 'as_of', date: '2026-10-01', ref: ref(text, '1 октября 2026') },
    ]),
  ]);
  expect(pure.validateReaderReview(pack(input), output)).toBeNull();
});

// V3: ordinal constraints stay unsupported; neighboring context never repairs
// an incomplete original date reference.
test.each([
  'Действующая версия на 1-го октября 2026 года?',
  'Which version was current on 1st October 2026?',
])(
  'an unsupported ordinal date must not become an undated request: %s',
  (request) => {
    expect(pack(sample(article, request))).toBeNull();
  }
);

test.each(['missing last year digit', 'missing first day digit'])(
  'adjacent source characters cannot complete a ref with %s',
  (missing) => {
    const input = sample();
    const dateRef = ref(article, '1 октября 2026');
    if (missing === 'missing last year digit') dateRef.end--;
    else dateRef.start++;
    const output = review(input, [
      claim(article, 'observed', [
        { kind: 'as_of', date: '2026-10-01', ref: dateRef },
      ]),
    ]);
    expect(pure.validateReaderReview(pack(input), output)).toBeNull();
  }
);
