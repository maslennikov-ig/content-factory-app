'use strict';
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const old = require('./helpers/reader-source-review.cjs');
const v10 = require('./helpers/reader-proof-review-v10.cjs');
const current = () =>
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/reader-proof-review-v11.ts'
  );
const pack = (subject = 'Что известно о Telegram?') =>
  old.packReaderReview(
    subject,
    [
      {
        url: 'https://example.test/coverage',
        title: 'Synthetic coverage',
        publishedAt: null,
      },
    ],
    [
      {
        sourceUrl: 'https://example.test/coverage',
        text: 'Telegram описан в учебном обзоре.',
      },
    ],
    'Russian'
  );
const wire = (api, input, coverage) => ({
  version: api.READER_REVIEW_WIRE_V11_VERSION,
  catalogue: input.catalogue.binding,
  sources: input.evidence.sources.map((s) => ({
    id: s.id,
    relevance: 'insufficient_context',
  })),
  claims: [],
  coverage,
  entities: [],
});

test('confirmed v10 free-form coverage can pass its schema then fail unchanged substring validation; lost raw response stays unknown', () => {
  const input = v10.prepareReaderReviewV10(pack());
  const raw = {
    ...wire(v10, input, [
      { question: 'Какие новости про этот мессенджер?', status: 'unsupported' },
    ]),
    version: v10.READER_REVIEW_WIRE_V10_VERSION,
  };
  expect(v10.readerReviewWireV10Schema.safeParse(raw).success).toBe(true);
  const compiled = v10.compileReaderReviewV10(input, raw),
    rejected = [];
  expect(compiled).not.toBeNull();
  expect(
    v10.validateReaderReviewV10(input, compiled, (code) => rejected.push(code))
  ).toBeNull();
  expect(rejected).toEqual(['v1_coverage_subject']);
});

test.each(['aba', ' a  a ', '!?..', 'A😀B', '~^`|='])(
  'v11 every ID preserves every eligible literal substring including repeated UTF16 spans: %p',
  (subject) => {
    const api = current(),
      input = api.prepareReaderReviewV11(pack(subject));
    expect(input).not.toBeNull();
    const expected = [];
    for (let start = 0; start < subject.length; start++)
      for (
        let length = 1;
        length <= Math.min(500, subject.length - start);
        length++
      )
        expected.push(subject.slice(start, start + length));
    const schema = api.readerReviewV11GenerationSchema(input);
    expect(schema.properties.coverage.items.properties.ref.maximum + 1).toBe(
      expected.length
    );
    expect(
      expected.map((_, id) => api.readerReviewV11CoverageRef(input, id))
    ).toEqual(expected);
    const rows = [0, expected.length - 1, 0].map((ref, i) => ({
      ref,
      status: ['supported', 'partial', 'unsupported'][i],
    }));
    const compiled = api.compileReaderReviewV11(input, wire(api, input, rows));
    expect(compiled.coverage).toEqual(
      rows.map(({ ref, status }) => ({ question: expected[ref], status }))
    );
    expect(api.validateReaderReviewV11(input, compiled)).not.toBeNull();
  }
);

test('v11 all accepted IDs have length1..500; whole query remains an available option and long queries retain all starts', () => {
  const api = current();
  for (const subject of ['Telegram', 'x'.repeat(520)]) {
    const input = api.prepareReaderReviewV11(pack(subject));
    expect(input).not.toBeNull();
    const max =
      api.readerReviewV11GenerationSchema(input).properties.coverage.items
        .properties.ref.maximum;
    const count = Array.from({ length: subject.length }, (_, start) =>
      Math.min(500, subject.length - start)
    ).reduce((a, b) => a + b, 0);
    expect(max + 1).toBe(count);
    expect(api.readerReviewV11CoverageRef(input, 0)).toBe(subject.slice(0, 1));
    expect(
      api.readerReviewV11CoverageRef(input, Math.min(500, subject.length) - 1)
    ).toBe(subject.slice(0, 500));
    expect(api.readerReviewV11CoverageRef(input, max)).toBe(subject.slice(-1));
  }
});

test('v11 rejects free-form questions, invalid IDs, stale bindings, cloned inputs and cloned compiled output', () => {
  const api = current(),
    input = api.prepareReaderReviewV11(pack()),
    max =
      api.readerReviewV11GenerationSchema(input).properties.coverage.items
        .properties.ref.maximum;
  for (const ref of [-1, 0.5, max + 1, NaN, Infinity]) {
    expect(api.readerReviewV11CoverageRef(input, ref)).toBeNull();
    expect(
      api.compileReaderReviewV11(
        input,
        wire(api, input, [{ ref, status: 'unsupported' }])
      )
    ).toBeNull();
  }
  expect(
    api.compileReaderReviewV11(
      input,
      wire(api, input, [{ question: 'Telegram', status: 'unsupported' }])
    )
  ).toBeNull();
  const raw = wire(api, input, [{ ref: 0, status: 'unsupported' }]),
    compiled = api.compileReaderReviewV11(input, raw);
  expect(
    api.readerReviewV11GenerationSchema(JSON.parse(JSON.stringify(input)))
  ).toBeNull();
  expect(
    api.compileReaderReviewV11(input, { ...raw, catalogue: 'foreign' })
  ).toBeNull();
  expect(
    api.validateReaderReviewV11(input, JSON.parse(JSON.stringify(compiled)))
  ).toBeNull();
  const foreign = api.prepareReaderReviewV11(pack('Что известно о WhatsApp?'));
  expect(api.compileReaderReviewV11(foreign, raw)).toBeNull();
  expect(api.validateReaderReviewV11(foreign, compiled)).toBeNull();
});

test('v11 both unchanged validator callbacks attest the actual serialized v11 request', () => {
  const api = current(),
    input = api.prepareReaderReviewV11(pack()),
    compiled = api.compileReaderReviewV11(
      input,
      wire(api, input, [{ ref: 0, status: 'unsupported' }])
    );
  const sizes = [];
  expect(
    api.validateReaderReviewV11(
      input,
      compiled,
      undefined,
      (actual, raw, onReject) => {
        sizes.push(actual.inputBytes);
        return old.validateReaderReview(actual, raw, onReject);
      }
    )
  ).not.toBeNull();
  expect(sizes.length).toBeGreaterThanOrEqual(1);
  expect(sizes.every((n) => n === input.inputBytes)).toBe(true);
});

test('unpaired surrogate input keeps the existing v10 preparation rejection', () => {
  const input = pack('x\ud800y\udc00z'),
    older = [],
    newer = [];
  expect(
    v10.prepareReaderReviewV10(input, (code) => older.push(code))
  ).toBeNull();
  expect(
    current().prepareReaderReviewV11(input, (code) => newer.push(code))
  ).toBeNull();
  expect(newer).toEqual(older);
});
