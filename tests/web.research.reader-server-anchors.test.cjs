'use strict';
const pure = require('./helpers/reader-source-review.cjs');

const pack = (text, subject = 'Что известно о Банк Альфа?', count = 1) =>
  pure.packReaderReview(
    subject,
    Array.from({ length: count }, (_, i) => ({
      url: `https://example.invalid/${i}`,
      title: 'Контекст',
      publishedAt: null,
    })),
    Array.from({ length: count }, (_, i) => ({
      sourceUrl: `https://example.invalid/${i}`,
      text,
    })),
    'Russian'
  );
const prepare = (text, subject, count) =>
  pure.prepareReaderReviewV5(pack(text, subject, count));
const wire = (input) => ({
  version: 'reader-source-review-wire/v5',
  catalogue: input.catalogue.binding,
  sources: input.evidence.sources.map(({ id }) => ({
    id,
    relevance: 'relevant',
  })),
  claims: [
    {
      text: 'Банк Альфа приведён в контексте.',
      kind: 'context',
      refs: [input.catalogue.anchors[0].id],
      dates: [],
    },
  ],
  coverage: [{ question: input.evidence.subject, status: 'partial' }],
  entities: [],
});

test('v5 uses deep-frozen exact server anchors while original v4 stays available', () => {
  const old = pack('Банк Альфа приведён в контексте.');
  const input = pure.prepareReaderReviewV5(old);
  expect(input).not.toBeNull();
  expect(input.evidence).toEqual(old.evidence);
  expect(input.evidence).not.toBe(old.evidence);
  expect(input.catalogue.view.sourceColumns).toEqual([
    'id',
    'title',
    'publishedAt',
    'clipped',
    'parts',
    'anchors',
  ]);
  expect(input.catalogue.view.sources[0][4].join('')).toBe(
    old.evidence.sources[0].excerpt
  );
  expect(Object.isFrozen(input)).toBe(true);
  expect(Object.isFrozen(input.evidence.sources[0])).toBe(true);
  expect(Object.isFrozen(input.catalogue.anchors[0])).toBe(true);
  const compiled = pure.compileReaderReviewV5(input, wire(input));
  expect(
    pure.validateReaderReview(input, compiled).assessment.claims
  ).toHaveLength(1);
  expect(pure.READER_REVIEW_WIRE_VERSION).toBe('reader-source-review-wire/v4');
});

test('v5 prompt states literal entity and same-source date grounding within its existing bound', () => {
  const input = prepare('Банк Альфа действует с 1 октября 2026.');
  expect(input).not.toBeNull();
  const marker = 'Untrusted reader evidence:\n';
  const rules = input.prompt.slice(0, input.prompt.indexOf(marker) + marker.length);
  expect(rules).toContain("listed 'd' K ID containing exactly one distinct complete civil date");
  expect(rules).toContain("source must also occur in the same claim's refs");
  expect(rules).toContain('full exact requested name, unique in subject');
  expect(rules).toContain('supported_claim, ref is non-null');
  expect(rules).toContain('claim.text includes subjectQuote verbatim');
  expect(rules).toContain('same source as entity.ref');
  expect(rules).toContain('later retrospectives remain eligible');
  expect(pure.serializedReaderV5InputBytes(rules)).toBeLessThanOrEqual(4000);
});

test.each([
  'unknownId',
  'missingId',
  'freeQuote',
  'staleBinding',
  'missingBinding',
  'oldFreeWire',
  'extraField',
])('v5 rejects the whole wire for %s', (failure) => {
  const input = prepare('Банк Альфа приведён в контексте.');
  const raw = wire(input);
  if (failure === 'unknownId') raw.claims[0].refs = ['Kzz'];
  if (failure === 'missingId') raw.claims[0].refs = [];
  if (failure === 'freeQuote')
    raw.claims[0].refs = [{ source: 'S1', quote: 'Банк Альфа' }];
  if (failure === 'staleBinding') raw.catalogue = 'f'.repeat(32);
  if (failure === 'missingBinding') delete raw.catalogue;
  if (failure === 'oldFreeWire') raw.version = pure.READER_REVIEW_WIRE_VERSION;
  if (failure === 'extraField') raw.private = 'SYNTHETIC_PRIVATE';
  expect(pure.compileReaderReviewV5(input, raw)).toBeNull();
});

test.each(['evidence', 'anchors', 'view', 'digest'])(
  'v5 rejects cloned or mutated %s before source lookup',
  (field) => {
    const input = prepare('Банк Альфа приведён в контексте.');
    const copy = structuredClone(input);
    if (field === 'evidence')
      copy.evidence.sources[0].excerpt += ' SYNTHETIC_PRIVATE';
    if (field === 'anchors')
      copy.catalogue.anchors[0].quote += ' SYNTHETIC_PRIVATE';
    if (field === 'view')
      copy.catalogue.view.sources[0][4][0] += ' SYNTHETIC_PRIVATE';
    if (field === 'digest') copy.catalogue.digest = '0'.repeat(64);
    expect(pure.compileReaderReviewV5(copy, wire(input))).toBeNull();
  }
);

test.each([
  ['1 October 2026 2 October 2026 1 October 2026', 3],
  ['1 октября 2026 2 октября 2026 1 октября 2026', 3],
  ['\t1 October 2026\r\n2 October 2026\t1 October 2026 ', 3],
  ['😀'.repeat(205) + '1 October 2026 😀2 October 2026 😀1 October 2026', 3],
])(
  'v5 represents every complete date without changing source %s',
  (text, count) => {
    const input = prepare(text);
    expect(input).not.toBeNull();
    expect(input.evidence.sources[0].excerpt).toBe(text);
    expect(input.catalogue.work.completeDateSpans).toBe(count);
    expect(input.catalogue.work.anchoredDateSpans).toBe(count);
    const source = input.catalogue.view.sources[0];
    expect(source[4].join('')).toBe(text);
    for (const a of input.catalogue.anchors) {
      expect(text.slice(a.start, a.end)).toBe(a.quote);
      expect(text.indexOf(a.quote)).toBe(a.start);
      expect(text.indexOf(a.quote, a.start + 1)).toBe(-1);
      expect(/[\uDC00-\uDFFF]/.test(text[a.start])).toBe(false);
      expect(/[\uD800-\uDBFF]/.test(text[a.end - 1])).toBe(false);
    }
  }
);

test('v5 declines the entire impossible mandatory-date preparation', () => {
  const text =
    '2 October 2026 1 October 2026 2 October 2026 1 October 2026 2 October 2026';
  const seen = [];
  expect(
    pure.prepareReaderReviewV5(pack(text), (code) => seen.push(code))
  ).toBeNull();
  expect(seen).toEqual(['catalogue_date_anchor']);
});

test('v5 finite preparation diagnostics expose no ID, quote, binding or private field', () => {
  const assessment = pure.unavailableReaderReview(pack('Контекст.'));
  assessment.status = 'review_unavailable';
  const failure = {
    stage: 'prepare_catalogue_v5',
    predicate: 'catalogue_date_anchor',
    failure: 'validation_rejected',
    termination: null,
    providerCode: 'unobserved',
    contentUtf8Bytes: null,
    toolArgumentsUtf8Bytes: null,
  };
  assessment.failureDiagnostic = failure;
  expect(pure.projectReaderAssessment(assessment).failureDiagnostic).toEqual(
    failure
  );
  for (const patch of [
    { quote: 'SYNTHETIC_PRIVATE' },
    { catalogue: 'f'.repeat(32) },
    { id: 'K1' },
  ]) {
    assessment.failureDiagnostic = { ...failure, ...patch };
    expect(
      pure.projectReaderAssessment(assessment).failureDiagnostic
    ).toBeUndefined();
  }
});

test('v5 work stays explicitly bounded on eight dense repeated-date sources', () => {
  const input = prepare('1 October 2026 '.repeat(150), 'Что известно?', 8);
  expect(input).not.toBeNull();
  expect(input.evidence.sources).toHaveLength(8);
  expect(input.catalogue.anchors.length).toBeLessThanOrEqual(96);
  expect(input.catalogue.work.dateScanUnits).toBeLessThanOrEqual(
    pure.READER_CATALOGUE_MAX_SCAN_UNITS
  );
  expect(input.catalogue.work.suffixUnits).toBeLessThanOrEqual(8 * 3000 * 100);
  expect(input.catalogue.work.completeDateSpans).toBe(
    input.catalogue.work.anchoredDateSpans
  );
  expect(input.inputBytes).toBeLessThanOrEqual(25000);
});

test('one invalid v5 claim prevents admission of the valid claim beside it', () => {
  const input = prepare('Банк Альфа приведён в контексте.');
  const raw = wire(input);
  raw.claims.push({ ...raw.claims[0], refs: ['Kzz'] });
  expect(pure.compileReaderReviewV5(input, raw)).toBeNull();
});
test('a prior catalogue cannot be used for a different source/subject request', () => {
  const old = prepare('Банк Альфа приведён в контексте.');
  const current = prepare(
    'Банк Альфа приведён в другом контексте.',
    'Иной вопрос'
  );
  const seen = [];
  expect(
    pure.compileReaderReviewV5(current, wire(old), (code) => seen.push(code))
  ).toBeNull();
  expect(seen).toEqual(['catalogue_binding']);
});
test.each(['DATE 12026-10-01', 'DATE 1 October 20260', 'DATE 1 October 2026x'])(
  'invalid token boundaries do not invent a mandatory complete date: %s',
  (text) => {
    const input = prepare(text);
    expect(input).not.toBeNull();
    expect(input.catalogue.work.completeDateSpans).toBe(0);
  }
);
test.each(['\udc00 invalid beginning', 'invalid ending \ud800'])(
  'a catalogue never offers an anchor rejected by the original surrogate guard: %j',
  (text) => {
    const original = pack('valid source');
    original.evidence.sources[0].excerpt = text;
    original.evidence.sources[0].excerptSha256 = require('node:crypto')
      .createHash('sha256')
      .update(text)
      .digest('hex');
    const input = pure.prepareReaderReviewV5(original);
    expect(input).toBeNull();
  }
);
test('the source-bound CPU/memory index handles exact eight by 3000 UTF16 units', () => {
  const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
  const catalogue = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/reader-anchored-catalogue.ts'
  );
  const text = '1 October 2026 '.repeat(200);
  expect(text.length).toBe(3000);
  const sources = Array.from({ length: 8 }, (_, i) => ({
    id: `S${i + 1}`,
    title: 'Stress',
    publishedAt: null,
    clipped: false,
    excerpt: text,
    excerptSha256: catalogue.catalogueHash(text),
  }));
  // Fixed accepted-date tool isolates index work; production grammar tests
  // above and service proofs continue through the original date parser.
  const data = catalogue.buildReaderCatalogue(
    { subject: 'Stress', requestedDate: null, sources, bounds: {} },
    {
      datesIn: (value) =>
        value.includes('1 October 2026') ? ['2026-10-01'] : [],
      dateContext: (value, start, end) => value.slice(start, end),
    },
    () => true
  );
  expect(data.work.completeDateSpans).toBe(1600);
  expect(data.work.anchoredDateSpans).toBe(1600);
  expect(data.work.dateScanUnits).toBeLessThanOrEqual(
    pure.READER_CATALOGUE_MAX_SCAN_UNITS
  );
  expect(data.work.suffixUnits).toBeLessThanOrEqual(8 * 3000 * 100);
  expect(data.work.windowUnits).toBeLessThanOrEqual(4_000_000);
  expect(data.anchors.length).toBeLessThanOrEqual(96);
  expect(data.view.sources.every((row) => row[4].join('') === text)).toBe(true);
  // Those full excerpts exceed the unchanged application byte budget; the
  // actual preparation refuses instead of trimming them for catalogue fit.
  expect(
    pure.prepareReaderReviewV5({
      evidence: { subject: 'Stress', requestedDate: null, sources, bounds: {} },
      language: 'Russian',
      prompt: '',
      inputBytes: 0,
    })
  ).toBeNull();
});

test('all wire IDs pass membership before any selected source quotation lookup', () => {
  const input = prepare('Банк Альфа приведён в контексте.');
  const raw = wire(input);
  raw.claims.push({ ...raw.claims[0], refs: ['Kzz'] });
  const originalFind = Array.prototype.find;
  let selectedSourceLookups = 0;
  const spy = jest
    .spyOn(Array.prototype, 'find')
    .mockImplementation(function (callback, receiver) {
      if (this === input.evidence.sources) selectedSourceLookups++;
      return originalFind.call(this, callback, receiver);
    });
  try {
    expect(pure.compileReaderReviewV5(input, raw)).toBeNull();
  } finally {
    spy.mockRestore();
  }
  expect(selectedSourceLookups).toBe(0);
});

const generationSchema = (input) =>
  pure.readerReviewV5GenerationSchema?.(input) ?? pure.readerReviewWireV5JsonSchema;
const referencedDefinition = (schema, ref) =>
  schema.$defs[ref.$ref.split('/').at(-1)];
const schemaAllowsId = (definition, id) =>
  definition.type === 'string' &&
  (!definition.pattern || new RegExp(definition.pattern).test(id)) &&
  (!definition.enum || definition.enum.includes(id));

test('the provider date-reference schema excludes an available non-date anchor', () => {
  const input = prepare('Банк Альфа представлен в контексте. ' + Array.from({ length: 24 }, (_, i) => `Контекст раздела ${i}. `).join('') + 'Действует с 1 октября 2026.');
  const table = input.catalogue.view.sources.flatMap(row => row[5]);
  const date = table.find(row => row[3] === 'd')[0];
  const nonDate = table.find(row => row[3] !== 'd')[0];
  const schema = generationSchema(input);
  const claims = schema.properties.claims.items.properties;
  const dateDefinition = referencedDefinition(schema, claims.dates.items.properties.ref);
  const ordinaryDefinition = referencedDefinition(schema, claims.refs.items);
  expect(schemaAllowsId(dateDefinition, date)).toBe(true);
  expect(schemaAllowsId(dateDefinition, nonDate)).toBe(false);
  expect(schemaAllowsId(ordinaryDefinition, nonDate)).toBe(true);
  expect(schemaAllowsId(dateDefinition, 'Kzz')).toBe(false);
  expect(ordinaryDefinition).toEqual(pure.readerReviewWireV5JsonSchema.$defs.a);
  expect(schema.properties.entities).toEqual(pure.readerReviewWireV5JsonSchema.properties.entities);
});

test('a catalogue without civil dates permits only an empty dates array at generation', () => {
  const input = prepare('Банк Альфа представлен в контексте.');
  const schema = generationSchema(input);
  expect(schema.properties.claims.items.properties.dates.maxItems).toBe(0);
  expect(JSON.stringify(schema)).not.toContain('"enum":[]');
  expect(schema.properties.claims.items.properties.refs.maxItems).toBe(2);
  expect(schema.properties.claims.maxItems).toBe(8);
});

test('the prepared byte bound includes the exact generation schema and cannot be supplied by a clone', () => {
  const input = prepare('Банк Альфа действует с 1 октября 2026.');
  const schema = generationSchema(input);
  const { HumanMessage } = require('@langchain/core/messages');
  expect(input.inputBytes).toBe(Buffer.byteLength(JSON.stringify({
    messages: [new HumanMessage(input.prompt)], schema,
  }), 'utf8'));
  expect(input.inputBytes).toBeLessThanOrEqual(25000);
  expect(pure.readerReviewV5GenerationSchema?.(structuredClone(input))).toBeNull();
  expect(Object.isFrozen(schema)).toBe(true);
  expect(input.prompt).toContain('Each date ref selects a listed');
});

test('near-cap escaped multibyte evidence prunes only optional bridges with the dynamic schema charged', () => {
  const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
  const actual = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/reader-anchored-catalogue.ts');
  let baseline, rejectedFits = 0;
  const guarded = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/reader-source-review.ts', {
    './reader-anchored-catalogue': { ...actual,
      buildReaderCatalogue(evidence, tools, fits) {
        baseline = actual.buildReaderCatalogue(evidence, tools, () => true);
        return actual.buildReaderCatalogue(evidence, tools, view => {
          const allowed = fits(view);
          if (!allowed) rejectedFits++;
          return allowed;
        });
      },
    },
  });
  const text = 'Событие действует с 1 октября 2026. ' + Array.from({ length: 40 }, (_, i) =>
    `Раздел ${i}: нейтральное пояснение без дополнительной даты. `).join('');
  const original = guarded.packReaderReview('Как действуют общие правила?',
    Array.from({ length: 4 }, (_, i) => ({ url: `https://example.invalid/${i}`, title: 'Контекст', publishedAt: null })),
    Array.from({ length: 4 }, (_, i) => ({ sourceUrl: `https://example.invalid/${i}`, text })), 'Russian');
  // Exercise the preparation port's hard limit while keeping every source
  // unchanged and the full escaped subject within its existing character cap.
  original.evidence.subject += 'Ж😀\\"'.repeat(198);
  const input = guarded.prepareReaderReviewV5(original);
  expect(input).not.toBeNull();
  expect(rejectedFits).toBeGreaterThan(0);
  expect(input.evidence).toEqual(original.evidence);
  expect(baseline.anchors.filter(a => a.role !== 'bridge')).toEqual(input.catalogue.anchors.filter(a => a.role !== 'bridge'));
  expect(input.catalogue.anchors.length).toBeLessThan(baseline.anchors.length);
  const marker = 'Untrusted reader evidence:\n';
  const ruleText = input.prompt.slice(0, input.prompt.indexOf(marker) + marker.length);
  expect(guarded.serializedReaderV5InputBytes(ruleText + JSON.stringify(baseline.view))).toBeLessThanOrEqual(25000);
  const schema = guarded.readerReviewV5GenerationSchema(input);
  const { HumanMessage } = require('@langchain/core/messages');
  expect(input.inputBytes).toBe(Buffer.byteLength(JSON.stringify({ messages: [new HumanMessage(input.prompt)], schema }), 'utf8'));
  expect(input.inputBytes).toBeLessThanOrEqual(25000);
  expect(guarded.serializedReaderV5InputBytes(input.prompt, schema)).toBeGreaterThan(guarded.serializedReaderV5InputBytes(input.prompt));
  expect(input.catalogue.work.anchoredDateSpans).toBe(input.catalogue.work.completeDateSpans);
});
