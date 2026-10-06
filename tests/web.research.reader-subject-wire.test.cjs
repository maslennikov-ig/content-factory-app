const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const old = require('./helpers/reader-source-review.cjs');
const current = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-subject-review.ts'
);
const subject =
  'По состоянию на 1 октября 2026 года: какова действующая ключевая ставка Банка России и чем она отличается от прогнозов на следующее заседание? Отдельно укажи дату действующего решения и прогнозы. Сохрани оригинальное название ВТБ, если этот банк упоминается в найденных источниках; если не упоминается, не добавляй его.';
const text =
  'На 1 октября 2026 года опубликован обзор ключевой ставки Банка России. ВТБ упоминается в контексте обсуждения решения.';
const packed = (query = subject, source = text) =>
  old.packReaderReview(
    query,
    [
      {
        url: 'https://example.test/article',
        title: 'Synthetic article',
        publishedAt: null,
      },
    ],
    [{ sourceUrl: 'https://example.test/article', text: source }],
    'Russian'
  );
const subjectParts = (input) => input.catalogue.view.subjectParts.map((row) => {
  const delimiter = row.indexOf(':');
  return [row.slice(0, delimiter), row.slice(delimiter + 1)];
});
const selectSubject = (input, name) => {
  const parts = subjectParts(input);
  for (let first = 0; first < parts.length; first++) {
    let quote = '';
    for (let last = first; last < parts.length; last++) {
      quote += parts[last][1];
      if (quote === name)
        return { first: parts[first][0], last: parts[last][0] };
    }
  }
  throw new Error('Synthetic subject span missing');
};
const wire = (input) => {
  const row = input.catalogue.view.sources[0];
  const anchor = row[5].find((a) =>
    row[4]
      .slice(a[1], a[2] + 1)
      .join('')
      .includes('Банка России')
  );
  return {
    version: current.READER_REVIEW_WIRE_V6_VERSION,
    catalogue: input.catalogue.binding,
    sources: [{ id: 'S1', relevance: 'relevant' }],
    claims: [
      {
        text: 'На 1 октября 2026 года опубликован обзор ключевой ставки Банка России.',
        kind: 'observed',
        refs: [anchor[0]],
        dates: [{ kind: 'as_of', ref: row[5].find((a) => a[3] === 'd')[0] }],
      },
    ],
    coverage: [
      {
        question: 'какова действующая ключевая ставка Банка России',
        status: 'partial',
      },
    ],
    entities: [
      {
        subjectRef: selectSubject(input, 'Банка России'),
        status: 'supported_claim',
        ref: anchor[0],
      },
    ],
  };
};
test('current rate-query names compile from literal query IDs, preserving inflection and exact UTF16 spans', () => {
  const input = current.prepareReaderReviewV6(packed());
  const review = current.compileReaderReviewV6(input, wire(input));
  expect(review.entities[0]).toMatchObject({
    name: 'Банка России',
    subjectStart: subject.indexOf('Банка России'),
    subjectEnd: subject.indexOf('Банка России') + 'Банка России'.length,
  });
  expect(old.validateReaderReview(input, review).assessment.status).toBe(
    'partial'
  );
});
test('v6 freezes and binds query parts, full prompt and actual generation schema under 25000 bytes', () => {
  const original = packed();
  const input = current.prepareReaderReviewV6(original);
  const schema = current.readerReviewV6GenerationSchema(input);
  expect(input.inputBytes).toBe(
    old.serializedReaderV5InputBytes(input.prompt, schema)
  );
  expect(input.inputBytes).toBeLessThanOrEqual(old.READER_REVIEW_INPUT_BYTES);
  expect(subjectParts(input).map((p) => p[1]).join('')).toBe(
    subject
  );
  expect(schema.$defs.s.enum).toEqual(
    subjectParts(input).map((p) => p[0])
  );
  expect(
    schema.properties.entities.items.properties.subjectRef.properties.first
  ).toEqual({ $ref: '#/$defs/s' });
  expect(
    schema.properties.claims.items.properties.dates.items.properties.ref
  ).toEqual({ $ref: '#/$defs/d' });
  expect(schema.$defs.d.enum).toEqual(
    input.catalogue.view.sources[0][5]
      .filter((a) => a[3] === 'd')
      .map((a) => a[0])
  );
  expect(Object.isFrozen(input.catalogue.view.subjectParts)).toBe(true);
  expect(input.catalogue.view).not.toHaveProperty('subject');
  original.evidence.subject = 'Different query';
  expect(current.compileReaderReviewV6(input, wire(input))).not.toBeNull();
});
test('compact query rows preserve colons, quotes, whitespace and supplementary Unicode literally', () => {
  const name = 'Банка России:😀';
  const query = `Что известно о «${name}»?\nСохрани "ВТБ" и \\ слеш.`;
  const input = current.prepareReaderReviewV6(packed(query, `В заметке упоминается «${name}».`));
  expect(subjectParts(input).map((part) => part[1]).join('')).toBe(query);
  const row = input.catalogue.view.sources[0];
  const reference = row[5].find((anchor) =>
    row[4].slice(anchor[1], anchor[2] + 1).join('').includes(name)
  )[0];
  const review = current.compileReaderReviewV6(input, {
    version: current.READER_REVIEW_WIRE_V6_VERSION,
    catalogue: input.catalogue.binding,
    sources: [{ id: 'S1', relevance: 'relevant' }],
    claims: [],
    coverage: [{ question: query, status: 'unsupported' }],
    entities: [{ subjectRef: selectSubject(input, name), status: 'contextual_mention', ref: reference }],
  });
  expect(review.entities[0]).toMatchObject({
    name,
    subjectStart: query.indexOf(name),
    subjectEnd: query.indexOf(name) + name.length,
  });
});
test.each([
  'unknown',
  'reverse',
  'overlong',
  'stale',
  'free-name',
  'legacy-version',
  'foreign-input',
])('v6 rejects %s without repairing a name or rebinding a request', (kind) => {
  let input = current.prepareReaderReviewV6(packed());
  const output = wire(input);
  if (kind === 'unknown') output.entities[0].subjectRef.first = 'Qzzz';
  if (kind === 'reverse')
    [output.entities[0].subjectRef.first, output.entities[0].subjectRef.last] =
      [output.entities[0].subjectRef.last, output.entities[0].subjectRef.first];
  if (kind === 'overlong')
    output.entities[0].subjectRef = {
      first: subjectParts(input)[0][0],
      last: subjectParts(input).at(-1)[0],
    };
  if (kind === 'stale') output.catalogue = '0'.repeat(32);
  if (kind === 'free-name') output.entities[0].subjectQuote = 'Банк России';
  if (kind === 'legacy-version')
    output.version = old.READER_REVIEW_WIRE_V5_VERSION;
  if (kind === 'foreign-input') input = structuredClone(input);
  const rejected = [];
  expect(
    current.compileReaderReviewV6(input, output, (code) => rejected.push(code))
  ).toBeNull();
  expect(rejected).toHaveLength(1);
});
test('query IDs cannot establish source support or bypass existing claim grounding', () => {
  const input = current.prepareReaderReviewV6(packed());
  const output = wire(input);
  output.entities[0].subjectRef = selectSubject(input, 'прогнозы');
  expect(current.compileReaderReviewV6(input, output)).toBeNull();
  const inconsistent = wire(input);
  inconsistent.claims[0].text = 'Обзор ключевой ставки.';
  const compiled = current.compileReaderReviewV6(input, inconsistent);
  expect(old.validateReaderReview(input, compiled)).toBeNull();
});
test('oversized subject catalogue refuses before invocation while unchanged v5 remains available', () => {
  const original = packed('я '.repeat(2499));
  expect(original).not.toBeNull();
  expect(current.prepareReaderReviewV6(original)).toBeNull();
  const legacy = old.prepareReaderReviewV5(original);
  expect(legacy).not.toBeNull();
  expect(legacy.inputBytes).toBeLessThanOrEqual(old.READER_REVIEW_INPUT_BYTES);
});
test('a long rate query retains a complete large source catalogue inside the existing provider limit', () => {
  const sources = Array.from({ length: 4 }, (_, index) => ({
    url: `https://example.test/article-${index}`,
    title: `Синтетический контекст ${index}`,
    publishedAt: null,
  }));
  const facts = sources.map((source, index) => ({
    sourceUrl: source.url,
    text: 'На 1 октября 2026 года опубликован синтетический обзор ключевой ставки Банка России. ' +
      Array.from({ length: 25 }, (_, paragraph) =>
        `Учебный абзац ${index}-${paragraph}: контекст помогает сверить дату и отличить описание решения от предположения. `
      ).join(''),
  }));
  const original = old.packReaderReview(subject, sources, facts, 'Russian');
  const legacy = old.prepareReaderReviewV5(original);
  expect(legacy.inputBytes).toBeGreaterThan(24_000);
  const input = current.prepareReaderReviewV6(original);
  expect(input).not.toBeNull();
  expect(input.inputBytes).toBeLessThanOrEqual(old.READER_REVIEW_INPUT_BYTES);
  expect(input.catalogue.view.sources).toEqual(legacy.catalogue.view.sources);
  expect(input.evidence).toEqual(legacy.evidence);
  expect(current.readerReviewV6GenerationSchema(input).$defs.d).toEqual(
    old.readerReviewV5GenerationSchema(legacy).$defs.d
  );
});
test.each(['Russian', 'English', 'Haitian Creole'])('fixed v6 rules/schema preserve the original 4000-byte allowance for %s', (language) => {
  const original = packed();
  original.language = language;
  const input = current.prepareReaderReviewV6(original);
  expect(input).not.toBeNull();
  const marker = 'Untrusted reader evidence:\n';
  const rules = input.prompt.slice(0, input.prompt.indexOf(marker) + marker.length);
  expect(old.serializedReaderV5InputBytes(rules, current.readerReviewWireV6JsonSchema)).toBeLessThanOrEqual(4000);
});
