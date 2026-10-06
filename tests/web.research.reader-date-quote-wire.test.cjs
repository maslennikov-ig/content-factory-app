'use strict';

const pure = require('./helpers/reader-source-review.cjs');
const subject = 'По состоянию на 1 октября 2026 года: версия Альфа?';
const article = (date) => `😀 Отчёт: Альфа версия 2 действует по состоянию на ${date}.`;
const pack = (text = article('1 октября 2026 года'), request = subject) =>
  pure.packReaderReview(request,
    [{ url: 'https://example.org/history', title: 'История версии', publishedAt: '2026-10-02' }],
    [{ sourceUrl: 'https://example.org/history', text }], 'Russian');
const wire = (quote = '1 октября 2026') => ({
  version: 'reader-source-review-wire/v4',
  sources: [{ id: 'S1', relevance: 'relevant' }],
  claims: [{
    text: 'Альфа версия 2 действовала на указанную дату.', kind: 'observed',
    refs: [{ source: 'S1', quote: 'Альфа версия 2 действует' }],
    dates: [{ kind: 'as_of', ref: { source: 'S1', quote } }],
  }],
  coverage: [{ question: subject, status: 'supported' }],
  entities: [{ subjectQuote: 'Альфа', status: 'supported_claim', ref: { source: 'S1', quote: 'Альфа' } }],
});

test.each(['2026-10-01', '01.10.2026', '1 октября 2026', '1 October 2026', 'October 1, 2026'])(
  'v4 derives the original civil date from the exact unique %s quote and returns v1', (quote) => {
    const text = article(quote), input = pack(text), output = wire(quote), original = structuredClone(output);
    const compiled = pure.compileReaderReview(input, output);
    expect(compiled).not.toBeNull();
    expect(compiled.claims[0].dates[0]).toEqual({ kind: 'as_of', date: '2026-10-01',
      ref: { source: 'S1', start: text.indexOf(quote), end: text.indexOf(quote) + quote.length } });
    expect(pure.validateReaderReview(input, compiled).assessment).toMatchObject({
      version: 'reader-source-review/v1', status: 'supported', requestedDate: '2026-10-01',
    });
    expect(output).toEqual(original);
    expect(output.claims[0].dates[0]).not.toHaveProperty('date');
    expect(output.claims[0].dates[0]).not.toHaveProperty('dateLiteral');
  }
);

test('removing only the redundant v3 dateLiteral avoids a demonstrated disagreement, not a historical cause claim', () => {
  const input = pack(), legacy = { ...wire(), version: 'reader-source-review-wire/v3' };
  legacy.claims[0].dates[0].dateLiteral = '2026-10-01';
  const reasons = [];
  expect(pure.compileReaderReview(input, legacy, reason => reasons.push(reason))).toBeNull();
  expect(reasons).toEqual(['date_literal_grounding']);
  const current = wire();
  const compiled = pure.compileReaderReview(input, current);
  expect(compiled).not.toBeNull();
  expect(pure.validateReaderReview(input, compiled).assessment.status).toBe('supported');
});

test.each([
  ['missing quote', output => { delete output.claims[0].dates[0].ref.quote; }],
  ['extra canonical date', output => { output.claims[0].dates[0].date = '2026-10-01'; }],
  ['extra literal', output => { output.claims[0].dates[0].dateLiteral = '1 октября 2026'; }],
  ['unknown source', output => { output.claims[0].dates[0].ref.source = 'S9'; }],
  ['absent quote', output => { output.claims[0].dates[0].ref.quote = '2 октября 2026'; }],
  ['partial date', output => { output.claims[0].dates[0].ref.quote = 'октября 2026'; }],
  ['high surrogate', output => { output.claims[0].dates[0].ref.quote = '\uD83D'; }],
  ['low surrogate', output => { output.claims[0].dates[0].ref.quote = '\uDE00'; }],
])('v4 %s fails closed without filling or discarding the annotation', (_label, mutate) => {
  const output = wire(); mutate(output);
  expect(pure.compileReaderReview(pack(), output)).toBeNull();
});

test.each([
  ['multiple distinct dates', '1 октября 2026 до 2 октября 2026', '1 октября 2026 до 2 октября 2026', 'date_ambiguous'],
  ['invalid civil date', '31 февраля 2026', '31 февраля 2026', 'date_missing'],
  ['adjacent day prefix', '21 октября 2026', '1 октября 2026', 'date_token_boundary'],
  ['adjacent year suffix', '1 октября 20261', '1 октября 2026', 'date_token_boundary'],
])('v4 %s rejects at the fixed quote-grounding boundary', (_label, sourceDate, quote, groundingReason) => {
  const reasons = [];
  expect(pure.compileReaderReview(pack(article(sourceDate)), wire(quote), (predicate, _issue, _match, reason) => reasons.push({ predicate, reason }))).toBeNull();
  expect(reasons).toEqual([{ predicate: 'date_quote_grounding', reason: groundingReason }]);
});

test('v4 repeated exact quote refuses an arbitrary occurrence; one unique context quote can repeat the same civil date', () => {
  const text = article('1 октября 2026') + ' Примечание на 1 октября 2026.';
  expect(pure.compileReaderReview(pack(text), wire())).toBeNull();
  const quote = '1 октября 2026, также 01.10.2026';
  const compiled = pure.compileReaderReview(pack(article(quote)), wire(quote));
  expect(compiled).not.toBeNull();
  expect(compiled.claims[0].dates[0].date).toBe('2026-10-01');
  expect(pure.validateReaderReview(pack(article(quote)), compiled).assessment.status).toBe('supported');
});

test('v4 cannot borrow an exact date from another presented source absent from the claim refs', () => {
  const input = pure.packReaderReview(subject,
    [{url:'https://example.org/claim',title:'Версия',publishedAt:'2026-10-02'},
     {url:'https://example.org/other',title:'Другая дата',publishedAt:'2026-10-02'}],
    [{sourceUrl:'https://example.org/claim',text:article('1 октября 2026')},
     {sourceUrl:'https://example.org/other',text:'Другой отчёт на 1 октября 2026.'}], 'Russian');
  const output = wire(); output.sources.push({id:'S2',relevance:'relevant'});
  output.claims[0].dates[0].ref.source = 'S2';
  const reasons = [];
  expect(pure.compileReaderReview(input, output, (predicate, _issue, _match, reason) => reasons.push({ predicate, reason }))).toBeNull();
  expect(reasons).toEqual([{ predicate: 'date_quote_grounding', reason: 'date_source_mismatch' }]);
});

test('v4 preserves final v1 date ordering and literal requested names instead of repairing claims', () => {
  const text = 'Альфа версия 2 действует с 1 октября 2026 до 2 октября 2026.';
  const output = wire();
  output.claims[0].dates = [
    {kind:'effective_from',ref:{source:'S1',quote:'2 октября 2026'}},
    {kind:'effective_until',ref:{source:'S1',quote:'1 октября 2026'}},
  ];
  const compiled = pure.compileReaderReview(pack(text), output);
  expect(compiled).not.toBeNull();
  expect(pure.validateReaderReview(pack(text), compiled)).toBeNull();
  const translated = wire(); translated.entities[0].subjectQuote = 'Alpha';
  expect(pure.compileReaderReview(pack(), translated)).toBeNull();
  const omittedName = wire(); omittedName.claims[0].text = 'Версия 2 действовала.';
  const missingName = pure.compileReaderReview(pack(), omittedName);
  expect(missingName).not.toBeNull();
  expect(pure.validateReaderReview(pack(), missingName)).toBeNull();
});

test('v4 bounded diagnostics project only the new fixed stage/predicate and preserve legacy vocabulary', () => {
  const input = pack();
  const failure = { stage:'compile_wire_v4',predicate:'date_quote_grounding',failure:'validation_rejected',
    providerCode:'unobserved',termination:'stop',contentUtf8Bytes:90,toolArgumentsUtf8Bytes:null };
  const unavailable = pure.unavailableReaderReview(input);
  unavailable.status = 'review_unavailable';
  unavailable.failureDiagnostic = failure;
  expect(pure.projectReaderAssessment(unavailable).failureDiagnostic).toEqual(failure);
  unavailable.failureDiagnostic = { ...failure, rawQuote: 'do not expose' };
  expect(pure.projectReaderAssessment(unavailable)).not.toHaveProperty('failureDiagnostic');
  for (const [stage, predicate] of [['compile_wire_v2', 'wire_schema'], ['compile_wire_v3', 'date_literal_grounding']]) {
    unavailable.failureDiagnostic = { ...failure, stage, predicate };
    expect(pure.projectReaderAssessment(unavailable).failureDiagnostic).toEqual(unavailable.failureDiagnostic);
  }
});

// Exercise each real wire compiler and a crafted API-v1 annotation independently.
const dateBoundaryFixture = (version, text) => {
  const output = wire();
  if (version === 3) {
    output.version = 'reader-source-review-wire/v3';
    output.claims[0].dates[0].dateLiteral = '1 октября 2026';
  }
  if (version === 1 || version === 2) {
    output.entities = [{ name: 'Альфа', subjectStart: subject.indexOf('Альфа'),
      subjectEnd: subject.indexOf('Альфа') + 5, status: 'supported_claim',
      ref: { source: 'S1', quote: 'Альфа' } }];
    output.claims[0].dates[0].date = '2026-10-01';
    output.version = 'reader-source-review-wire/v2';
  }
  if (version === 1) {
    delete output.version;
    const span = ({ source, quote }) => ({ source, start: text.indexOf(quote), end: text.indexOf(quote) + quote.length });
    output.claims[0].refs = output.claims[0].refs.map(span);
    output.claims[0].dates[0].ref = span(output.claims[0].dates[0].ref);
    output.entities[0].ref = span(output.entities[0].ref);
  }
  return output;
};

const badUnicodeNeighbors = [
  ['astral digit left', '\u{1D7DA}1 октября 2026'],
  ['astral letter left', '\u{1D49C}1 октября 2026'],
  ['astral digit right', '1 октября 2026\u{1D7DA}'],
  ['astral letter right', '1 октября 2026\u{1D49C}'],
];
test.each([1, 2, 3, 4].flatMap(version => badUnicodeNeighbors.map(([label, date]) => [version, label, date])))(
  'v%s rejects a complete-looking date carved beside an %s code point', (version, _label, date) => {
    const text = article(date), input = pack(text), output = dateBoundaryFixture(version, text), reasons = [];
    const compiled = version === 1 ? output : pure.compileReaderReview(input, output, reason => reasons.push(reason));
    const accepted = compiled && pure.validateReaderReview(input, compiled, reason => reasons.push(reason));
    expect(accepted).toBeNull();
    expect(reasons).toEqual([version < 3 ? 'v1_date_reference_grounding'
      : version === 3 ? 'date_literal_grounding' : 'date_quote_grounding']);
  }
);

const validDateContexts = [
  ['emoji neighbors', article('😀1 октября 2026🚀')],
  ['ASCII punctuation neighbors', article('(1 октября 2026)')],
  ['left source boundary', '1 октября 2026: Альфа версия 2 действует.'],
  ['right source boundary', 'Альфа версия 2 действует по состоянию на 1 октября 2026'],
];
test.each([1, 2, 3, 4].flatMap(version => validDateContexts.map(([label, text]) => [version, label, text])))(
  'v%s preserves a complete date with %s and its UTF16 span', (version, _label, text) => {
    const input = pack(text), output = dateBoundaryFixture(version, text);
    const compiled = version === 1 ? output : pure.compileReaderReview(input, output);
    expect(compiled).not.toBeNull();
    expect(compiled.claims[0].dates[0].ref).toEqual({ source: 'S1',
      start: text.indexOf('1 октября 2026'), end: text.indexOf('1 октября 2026') + '1 октября 2026'.length });
    expect(pure.validateReaderReview(input, compiled).assessment.status).toBe('supported');
  }
);
