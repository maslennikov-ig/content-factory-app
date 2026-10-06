'use strict';

const { createHash } = require('node:crypto');
const pure = require('./helpers/reader-source-review.cjs');

// C18 retained Telegram claim/date mismatch, with only public source passages.
// The compact fixture layout is synthetic; it is not the historical model wire.
const telegramClaim =
  'ФАС объявила переходный период с 25 марта по 31 декабря 2026 года: меры ответственности за рекламу в Telegram в этот период не применяются.';
const telegramSource =
  '25 марта 2026 года ФАС объявила переходный период с 25 марта по 31 декабря 2026 года. Закон вступил в силу 1 сентября 2025 года. Ранее ФАС сообщала о нарушениях 5 марта 2026 года.';
const datedSubject =
  'По состоянию на 1 октября 2026 года: действующая версия и прогноз.';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const pack = (
  text,
  subject = 'Правила рекламы в Telegram в 2026 году',
  language = 'Russian',
  url = 'https://example.org/article'
) =>
  pure.packReaderReview(
    subject,
    [{ url, title: 'Источник', publishedAt: '2026-10-02' }],
    [{ sourceUrl: url, text }],
    language
  );
const ref = (input, quote) => {
  const text = input.evidence.sources[0].excerpt;
  const start = text.lastIndexOf(quote);
  expect(start).toBeGreaterThanOrEqual(0);
  return { source: 'S1', start, end: start + quote.length };
};
const claim = (input, text, dates = [], kind = 'observed') => ({
  text,
  kind,
  dates,
  refs: [
    { source: 'S1', start: 0, end: input.evidence.sources[0].excerpt.length },
  ],
});
const date = (input, kind, civil, quote) => ({
  kind,
  date: civil,
  ref: ref(input, quote),
});
const review = (input, claims, entities = []) => ({
  sources: [{ id: 'S1', relevance: 'relevant' }],
  claims,
  entities,
  coverage: [
    {
      question: input.evidence.subject,
      status: claims.length ? 'supported' : 'unsupported',
    },
  ],
});

test.each(['Russian', 'English'])(
  'undated %s entity qualification invents no requested date',
  (language) => {
    const input = pack(telegramSource + ' Telegram', undefined, language);
    const subjectStart = input.evidence.subject.indexOf('Telegram');
    const entity = {
      name: 'Telegram',
      subjectStart,
      subjectEnd: subjectStart + 8,
      status: 'contextual_mention',
      ref: ref(input, 'Telegram'),
    };
    const result = pure.validateReaderReview(
      input,
      review(
        input,
        [claim(input, 'В источнике приведены правила рекламы.')],
        [entity]
      )
    );
    expect(result).not.toBeNull();
    expect(result.assessment.requestedDate).toBeNull();
    expect(result.assessment.entities[0].status).toBe('contextual_mention');
    expect(result.summary).not.toMatch(/на запрошенную дату|requested date/);
  }
);

test.each(['Russian', 'English'])(
  'dated %s entity qualification preserves the original honest limitation',
  (language) => {
    const subject = 'По состоянию на 1 октября 2026 года: Telegram.';
    const input = pack(telegramSource + ' Telegram', subject, language);
    const start = subject.indexOf('Telegram');
    const entity = {
      name: 'Telegram',
      subjectStart: start,
      subjectEnd: start + 8,
      status: 'contextual_mention',
      ref: ref(input, 'Telegram'),
    };
    const result = pure.validateReaderReview(
      input,
      review(input, [], [entity])
    );
    expect(result.summary).toBe(
      language === 'Russian'
        ? 'Telegram: упоминание в контексте источника; утверждение на запрошенную дату не подтверждено.'
        : 'Telegram: a contextual mention; a claim applicable on the requested date is unconfirmed.'
    );
  }
);

test('retained TG explicit Dec31 boundary cannot keep unrelated Mar5 annotation', () => {
  const input = pack(telegramSource);
  const raw = review(input, [
    claim(input, telegramClaim, [
      date(input, 'announced', '2025-09-01', '1 сентября 2025'),
      date(input, 'effective_until', '2026-03-05', '5 марта 2026'),
    ]),
  ]);
  const result = pure.validateReaderReview(input, raw);
  expect(result).not.toBeNull();
  expect(result.assessment.claims).toHaveLength(1);
  expect(result.assessment.claims[0].text).toBe(telegramClaim);
  expect(
    result.assessment.claims[0].dates.some((d) => d.kind === 'effective_until')
  ).toBe(false);
  expect(result.assessment.claimDisposition.omittedContradictoryDates).toBe(1);
  expect(raw.claims[0].dates[1].date).toBe('2026-03-05');
});

test('correct explicit Dec31 boundary retains the separate same-source date quote', () => {
  const input = pack(telegramSource);
  const result = pure.validateReaderReview(
    input,
    review(input, [
      claim(input, telegramClaim, [
        date(input, 'effective_until', '2026-12-31', '31 декабря 2026'),
      ]),
    ])
  );
  expect(result.assessment.claims[0].dates[0].date).toBe('2026-12-31');
});

test('current v5 compilation keeps provenance before the final contradiction check', () => {
  const input = pure.prepareReaderReviewV5(pack(telegramSource));
  const context = input.catalogue.anchors.find((a) =>
    a.quote.includes('ФАС объявила переходный')
  );
  const unrelated = input.catalogue.anchors.find(
    (a) => a.role === 'date' && a.quote.trim() === '5 марта 2026'
  );
  expect(context).toBeDefined();
  expect(unrelated).toBeDefined();
  const compiled = pure.compileReaderReviewV5(input, {
    version: 'reader-source-review-wire/v5',
    catalogue: input.catalogue.binding,
    sources: [{ id: 'S1', relevance: 'relevant' }],
    claims: [
      {
        text: telegramClaim,
        kind: 'observed',
        refs: [context.id],
        dates: [{ kind: 'effective_until', ref: unrelated.id }],
      },
    ],
    coverage: [{ question: input.evidence.subject, status: 'supported' }],
    entities: [],
  });
  expect(compiled.claims[0].dates[0].date).toBe('2026-03-05');
  const result = pure.validateReaderReview(input, compiled);
  expect(result.assessment.claims[0].dates).toEqual([]);
  expect(result.assessment.status).toBe('partial');
  expect(result.assessment.claimDisposition.omittedContradictoryDates).toBe(1);
});

test('an unrelated grounded closed interval cannot prove the explicit claim interval', () => {
  const source =
    telegramSource +
    ' Другой срок действует с 1 февраля 2026 по 5 марта 2026 года.';
  const input = pack(
    source,
    'По состоянию на 15 февраля 2026 года: период действия правил.'
  );
  const result = pure.validateReaderReview(
    input,
    review(input, [
      claim(
        input,
        'Период действует с 25 марта 2026 по 31 декабря 2026 года.',
        [
          date(input, 'effective_from', '2026-02-01', '1 февраля 2026'),
          date(input, 'effective_until', '2026-03-05', '5 марта 2026'),
        ]
      ),
    ])
  );
  expect(result).not.toBeNull();
  expect(result.assessment.claims).toEqual([]);
  expect(result.summary).toBe('');
});

test('an as_of quote outside an explicit interval does not bypass its stated boundary', () => {
  const source =
    telegramSource +
    ' Отдельный отчёт составлен по состоянию на 1 января 2027 года.';
  const input = pack(
    source,
    'По состоянию на 1 января 2027 года: период действия правил.'
  );
  const result = pure.validateReaderReview(
    input,
    review(input, [
      claim(input, telegramClaim, [
        date(input, 'as_of', '2027-01-01', '1 января 2027'),
      ]),
    ])
  );
  expect(result.assessment.claims).toEqual([]);
});

test('legitimate concise claim dates need not be repeated in claim prose', () => {
  const source =
    'Версия 2 действует с 11 сентября 2026 по 23 октября 2026 года.';
  const input = pack(source, datedSubject);
  const result = pure.validateReaderReview(
    input,
    review(input, [
      claim(input, 'Действующая версия — 2.', [
        date(input, 'effective_from', '2026-09-11', '11 сентября 2026'),
        date(input, 'effective_until', '2026-10-23', '23 октября 2026'),
      ]),
    ])
  );
  expect(result.assessment.claims).toHaveLength(1);
  expect(result.assessment.claims[0].dates).toHaveLength(2);
});

test.each([
  ['Период действует с 2026-03-25 по 2026-12-31.', '2026-12-31', '2026-03-05'],
  ['Период действует с 25.03.2026 до 31.12.2026.', '31.12.2026', '05.03.2026'],
  [
    'The interval applies from March 25, 2026 through December 31, 2026.',
    'December 31, 2026',
    'March 5, 2026',
  ],
])(
  'explicit interval %s omits only the contradicted annotation',
  (text, right, wrong) => {
    const input = pack(text + ' Отдельная дата: ' + wrong + '.');
    const result = pure.validateReaderReview(
      input,
      review(input, [
        claim(input, text, [
          date(input, 'effective_until', '2026-03-05', wrong),
        ]),
      ])
    );
    expect(result.assessment.claims[0].dates).toEqual([]);
    expect(result.assessment.claims[0].text).toBe(text);
    expect(input.evidence.sources[0].excerpt).toContain(right);
  }
);

test('an unrelated non-interval date in prose does not reject separately cited validity', () => {
  const source =
    'Отчёт опубликован 5 марта 2026 года. Версия действовала по состоянию на 1 октября 2026 года.';
  const input = pack(source, datedSubject);
  const result = pure.validateReaderReview(
    input,
    review(input, [
      claim(
        input,
        'Отчёт опубликован 5 марта 2026 года; действующая версия — 2.',
        [date(input, 'as_of', '2026-10-01', '1 октября 2026')]
      ),
    ])
  );
  expect(result.assessment.claims).toHaveLength(1);
});

test('a past decision with no grounded interval end remains ineligible', () => {
  const source =
    '11 сентября 2026 года Банк России сохранил ключевую ставку на уровне 14%.';
  const input = pack(
    source,
    'По состоянию на 1 октября 2026 года: действующая ключевая ставка.'
  );
  const result = pure.validateReaderReview(
    input,
    review(input, [
      claim(input, source, [
        date(input, 'effective_from', '2026-09-11', '11 сентября 2026'),
      ]),
    ])
  );
  expect(result.assessment.status).toBe('insufficient_evidence');
  expect(result.summary).toBe('');
  expect(result.assessment.claimDisposition).toEqual({
    status: 'all_claims_temporally_filtered',
    providedClaims: 1,
    acceptedClaims: 0,
    temporallyFilteredClaims: 1,
    omittedContradictoryDates: 0,
  });
});

test('empty valid wire and provided temporal claims have distinct safe dispositions', () => {
  const input = pack('11 сентября 2026 года принято решение.', datedSubject);
  const result = pure.validateReaderReview(input, review(input, []));
  expect(result.assessment.status).toBe('insufficient_evidence');
  expect(
    pure.projectReaderAssessment(result.assessment).claimDisposition
  ).toEqual({
    status: 'empty_claims',
    providedClaims: 0,
    acceptedClaims: 0,
    temporallyFilteredClaims: 0,
    omittedContradictoryDates: 0,
  });
  expect(result.assessment.failureDiagnostic).toBeUndefined();
});

test('mixed dated evidence reports only aggregate temporal filtering counts', () => {
  const source =
    'Действующая версия подтверждена на 1 октября 2026 года. 11 сентября 2026 года принято отдельное решение.';
  const input = pack(source, datedSubject);
  const result = pure.validateReaderReview(
    input,
    review(input, [
      claim(input, 'Действующая версия подтверждена.', [
        date(input, 'as_of', '2026-10-01', '1 октября 2026'),
      ]),
      claim(input, 'Принято отдельное решение.', [
        date(input, 'effective_from', '2026-09-11', '11 сентября 2026'),
      ]),
    ])
  );
  expect(result.assessment.claims).toHaveLength(1);
  expect(result.assessment.status).toBe('partial');
  expect(
    pure.projectReaderAssessment(result.assessment).claimDisposition
  ).toEqual({
    status: 'some_claims_temporally_filtered',
    providedClaims: 2,
    acceptedClaims: 1,
    temporallyFilteredClaims: 1,
    omittedContradictoryDates: 0,
  });
});

test('invalid wire remains a validation failure rather than an empty valid disposition', () => {
  const input = pack(telegramSource);
  expect(
    pure.validateReaderReview(input, { secret: 'UNTRUSTED_RAW_BODY' })
  ).toBeNull();
  expect(
    pure.projectReaderAssessment(pure.unavailableReaderReview(input))
      .claimDisposition
  ).toBeUndefined();
});

test('disposition projection refuses unknown values, extra fields and poisoned getters', () => {
  const input = pack(telegramSource);
  const result = pure.validateReaderReview(input, review(input, []));
  const safe = {
    status: 'empty_claims',
    providedClaims: 0,
    acceptedClaims: 0,
    temporallyFilteredClaims: 0,
    omittedContradictoryDates: 0,
  };
  for (const value of [
    { ...safe, status: 'SENSITIVE_RAW_VALUE' },
    { ...safe, raw: 'SENSITIVE_RAW_VALUE' },
    { ...safe, providedClaims: 9 },
    { ...safe, omittedContradictoryDates: 1 },
  ]) {
    const out = pure.projectReaderAssessment({
      ...result.assessment,
      claimDisposition: value,
    });
    expect(out.claimDisposition).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('SENSITIVE_RAW_VALUE');
  }
  let reads = 0;
  const poisoned = { ...safe };
  Object.defineProperty(poisoned, 'providedClaims', {
    get() {
      reads++;
      throw new Error('SENSITIVE_RAW_VALUE');
    },
  });
  expect(
    pure.projectReaderAssessment({
      ...result.assessment,
      claimDisposition: poisoned,
    }).claimDisposition
  ).toBeUndefined();
  expect(reads).toBe(0);
});

test('late synthetic evidence is selected as one exact bounded window before catalogue', () => {
  // The suffix is explicitly synthetic; historical RATE source tails are unknown.
  const intro =
    '11 сентября 2026 года Банк России сохранил ключевую ставку на уровне 14%.\n\n';
  const noise = 'Постороннее описание навигации.\n\n'.repeat(150);
  const useful =
    'Действующая ключевая ставка на 1 октября 2026 года указана отдельно от прогноза следующего заседания. Решение действует с 11 сентября 2026 по 22 октября 2026 года. Прогноз следующего заседания объявлен 30 сентября 2026 года на 23 октября 2026 года.';
  const original = intro + noise + useful + '\n\n' + noise;
  const subject =
    'По состоянию на 1 октября 2026 года: действующая ключевая ставка, дата решения и прогноз следующего заседания.';
  const input = pack(original, subject);
  const source = input.evidence.sources[0];
  expect(original.indexOf(useful)).toBeGreaterThan(3000);
  expect(original.indexOf(source.excerpt)).toBeGreaterThan(0);
  expect(source.excerpt).toContain(useful);
  expect(source.excerpt.length).toBeLessThanOrEqual(3000);
  expect(source.excerptSha256).toBe(digest(source.excerpt));
  expect(source.sourceExcerptSha256).toBe(digest(original));
  expect(source.retainedChars).toBe(original.length);
  expect(source.clipped).toBe(true);
  const anchored = pure.prepareReaderReviewV5(input);
  expect(anchored).not.toBeNull();
  expect(anchored.inputBytes).toBeLessThanOrEqual(25000);
  expect(
    Buffer.byteLength(JSON.stringify(anchored.catalogue.view))
  ).toBeLessThanOrEqual(21000);
  for (const anchor of anchored.catalogue.anchors) {
    expect(source.excerpt.slice(anchor.start, anchor.end)).toBe(anchor.quote);
  }
});

test('window selection has a stable prefix fallback and no domain preference', () => {
  const original = 'Одинаковая навигация без ответа.\n\n'.repeat(150);
  const first = pack(
    original,
    'Уникальный неизвестный предмет',
    'Russian',
    'https://example.org/a'
  );
  const second = pack(
    original,
    'Уникальный неизвестный предмет',
    'Russian',
    'https://another.example/b'
  );
  expect(first.evidence.sources[0].excerpt).toBe(original.slice(0, 3000));
  expect(second.evidence.sources[0].excerpt).toBe(
    first.evidence.sources[0].excerpt
  );
});

test('selected window never stitches distant paragraphs or splits astral code points', () => {
  const original =
    '😀 Префикс.\n\n' +
    'Навигация.\n\n'.repeat(280) +
    '🧭 Уникальный предмет — доказанный контекст на 1 октября 2026 года.\n\n' +
    'Хвост.\n\n'.repeat(200);
  const input = pack(
    original,
    'По состоянию на 1 октября 2026 года: уникальный предмет.'
  );
  const text = input.evidence.sources[0].excerpt;
  expect(text).toContain('Уникальный предмет');
  expect(original.includes(text)).toBe(true);
  expect(text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
});

test('the bounded scan edge cannot hide a fifth year digit and certify its prefix', () => {
  const heading = 'Уникальный предмет ';
  const misleading = ' 01.10.2026';
  const original =
    'Н\n\n'.repeat(3000) +
    heading +
    'x'.repeat(3000 - heading.length - misleading.length) +
    misleading +
    '0';
  const input = pack(original, 'Уникальный предмет');
  const excerpt = input.evidence.sources[0].excerpt;
  expect(original.includes(excerpt)).toBe(true);
  const anchored = pure.prepareReaderReviewV5(input);
  expect(anchored).not.toBeNull();
  expect(anchored.catalogue.anchors.filter((a) => a.role === 'date')).toEqual(
    []
  );
  expect(anchored.catalogue.view.sources[0][5].some((a) => a[3] === 'd')).toBe(
    false
  );
});
