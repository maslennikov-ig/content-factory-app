'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const old = require('./helpers/reader-source-review.cjs');
const v9 = require('./helpers/reader-proof-review-v9.cjs');
const subjectModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-subject-anchors.ts'
);
const current = () =>
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/reader-proof-review-v10.ts'
  );
const kinds = [
  'effective_from',
  'effective_until',
  'announced',
  'target',
  'as_of',
];
const dates = () => kinds.map(() => null);
const parts = (input) =>
  Array.isArray(input.catalogue.view.subjectParts)
    ? input.catalogue.view.subjectParts
    : input.catalogue.view.subjectParts.split(
        input.catalogue.view.partSeparator
      );
const pack = (
  subject = 'Что известно о Telegram на 1 октября 2026?',
  excerpts = [
    'Telegram описан в учебном обзоре. На 1 октября 2026 доступен обзор.',
    'Другой учебный источник не содержит нужного имени. На 1 октября 2026 доступен обзор.',
  ],
  language = 'Russian'
) =>
  old.packReaderReview(
    subject,
    excerpts.map((_, i) => ({
      url: `https://example.test/v10-${i}`,
      title: `Synthetic ${i}`,
      publishedAt: null,
    })),
    excerpts.map((text, i) => ({
      sourceUrl: `https://example.test/v10-${i}`,
      text,
    })),
    language
  );
const proof = (api, input, name, source = 'S1') => {
  const schema = api.readerReviewV10GenerationSchema(input);
  for (let id = 0; id <= schema.$defs.p.maximum; id++) {
    const selected = api.readerReviewV10EntityProof(input, id);
    if (
      selected?.source === source &&
      parts(input)
        .slice(selected.subjectRef[0], selected.subjectRef[1] + 1)
        .join('') === name
    )
      return id;
  }
  throw Error('SYNTHETIC_JOINT_PROOF_MISSING');
};
const output = (api, input) => ({
  version: api.READER_REVIEW_WIRE_V10_VERSION,
  catalogue: input.catalogue.binding,
  sources: input.evidence.sources.map((s) => ({
    id: s.id,
    relevance: 'relevant',
  })),
  claims: [
    {
      text: 'Telegram описан в учебном обзоре.',
      kind: 'observed',
      refs: [{ source: 'S1', ref: 0 }],
      dates: [null, null, null, null, { via: 0, ref: 0 }],
    },
  ],
  coverage: [{ question: 'Что известно о Telegram', status: 'partial' }],
  entities: [{ mode: 'claim_candidate', proof: proof(api, input, 'Telegram') }],
});
const review = (api, input, raw = output(api, input), observer) => {
  const compiled = api.compileReaderReviewV10(input, raw, observer);
  return compiled && api.validateReaderReviewV10(input, compiled, observer);
};

test('v9 permits independently mismatched query/source choices and repeated date kinds; actual rejected wire stays unknown', () => {
  const input = v9.prepareReaderReviewV9(pack()),
    raw = {
      version: v9.READER_REVIEW_WIRE_V9_VERSION,
      catalogue: input.catalogue.binding,
      sources: input.evidence.sources.map((s) => ({
        id: s.id,
        relevance: 'relevant',
      })),
      claims: [
        {
          text: 'Telegram описан в учебном обзоре.',
          kind: 'observed',
          refs: [{ source: 'S1', ref: 0 }],
          dates: [
            { kind: 'as_of', via: 0, ref: 0 },
            { kind: 'as_of', via: 0, ref: 0 },
          ],
        },
      ],
      coverage: [{ question: 'Что известно о Telegram', status: 'partial' }],
      entities: [],
    };
  expect(v9.readerReviewWireV9Schema.safeParse(raw).success).toBe(true);
  const compiled = v9.compileReaderReviewV9(input, raw),
    seen = [];
  expect(compiled).not.toBeNull();
  expect(
    v9.validateReaderReviewV9(input, compiled, (...args) => seen.push(args))
  ).toBeNull();
  expect(seen[0][0]).toBe('v1_date_kind_unique');
  raw.claims[0].dates.pop();
  const parts = input.catalogue.view.subjectParts.map((p) =>
    p.slice(p.indexOf(':') + 1)
  );
  raw.entities = [
    {
      mode: 'claim_candidate',
      subjectRef: [parts.indexOf('Telegram'), parts.indexOf('Telegram')],
      source: 'S2',
    },
  ];
  expect(v9.readerReviewWireV9Schema.safeParse(raw).success).toBe(true);
  const mismatch = [];
  expect(
    v9.compileReaderReviewV9(input, raw, (...args) => mismatch.push(args))
  ).toBeNull();
  expect(mismatch[0][0]).toBe('entity_source_quote');
});

test('v10 binds present names and sources jointly; independent mismatched fields are unrepresentable', () => {
  const api = current(),
    input = api.prepareReaderReviewV10(pack()),
    raw = output(api, input);
  expect(review(api, input, raw).assessment.entities[0].status).toBe(
    'supported_claim'
  );
  expect(review(api, input, raw).assessment.inputBytes).toBe(input.inputBytes);
  expect(
    api.readerReviewWireV10Schema.safeParse({
      ...raw,
      entities: [{ ...raw.entities[0], source: 'S2', subjectRef: [0, 0] }],
    }).success
  ).toBe(false);
  const max = api.readerReviewV10GenerationSchema(input).$defs.p.maximum;
  expect(
    api.compileReaderReviewV10(input, {
      ...raw,
      entities: [{ mode: 'claim_candidate', proof: max + 1 }],
    })
  ).toBeNull();
  expect(
    api.readerReviewV10EntityProof(JSON.parse(JSON.stringify(input)), 0)
  ).toBeNull();
});

test('five nullable slots decode once per date role; duplicate/foreign roles and absent via still reject', () => {
  const api = current(),
    input = api.prepareReaderReviewV10(pack()),
    raw = output(api, input);
  const slot =
    api.readerReviewV10GenerationSchema(input).properties.claims.items
      .properties.dates;
  expect(slot.minItems).toBe(5);
  expect(slot.maxItems).toBe(5);
  expect(slot.items).toEqual({ $ref: '#/$defs/j' });
  const compiled = api.compileReaderReviewV10(input, raw);
  expect(compiled.claims[0].dates).toHaveLength(1);
  expect(compiled.claims[0].dates[0].kind).toBe('as_of');
  expect(
    api.readerReviewWireV10Schema.safeParse({
      ...raw,
      claims: [
        {
          ...raw.claims[0],
          dates: [
            { kind: 'as_of', via: 0, ref: 0 },
            { kind: 'as_of', via: 0, ref: 0 },
          ],
        },
      ],
    }).success
  ).toBe(false);
  const bad = structuredClone(raw);
  bad.claims[0].dates[4].via = 1;
  const seen = [];
  expect(
    api.compileReaderReviewV10(input, bad, (...args) => seen.push(args))
  ).toBeNull();
  expect(seen[0][0]).toBe('date_reference_slot');
  bad.claims[0].dates = [
    null,
    null,
    null,
    null,
    { via: 0, ref: 0, kind: 'foreign' },
  ];
  expect(api.compileReaderReviewV10(input, bad)).toBeNull();
});

test.each(['source', 'proof'])(
  'absence/unknown branches reject extra %s without stripping or repair',
  (field) => {
    const api = current(),
      input = api.prepareReaderReviewV10(pack()),
      raw = output(api, input);
    raw.entities = [
      {
        mode: 'unknown_due_to_bounds',
        subjectRef: [0, 0],
        [field]: field === 'source' ? 'S1' : 0,
      },
    ];
    expect(api.readerReviewWireV10Schema.safeParse(raw).success).toBe(false);
    const seen = [];
    expect(
      api.compileReaderReviewV10(input, raw, (...args) => seen.push(args))
    ).toBeNull();
    expect(seen[0][0]).toBe('wire_schema');
  }
);

test.each([
  ' Telegram, 1С! ',
  'что что? Telegram что',
  '🙂Telegram / телеграм🙂',
])(
  'joint proof expansion equals every legacy-valid containing query/source pair, including whitespace/punctuation: %s',
  (query) => {
    const api = current(),
      packed = pack(query, [
        query + ' Контекст учебного источника.',
        'Telegram: учебный источник.',
      ]);
    const base = old.prepareReaderReviewV5(packed),
      input = api.prepareReaderReviewV10(packed);
    const table = subjectModule.prepareReaderSubjectAnchors(query),
      expected = [];
    for (const s of base.evidence.sources)
      for (let first = 0; first < table.parts.length; first++)
        for (let last = first; last < table.parts.length; last++) {
          const selected = subjectModule.resolveReaderSubjectAnchor(table, {
            first: table.parts[first][0],
            last: table.parts[last][0],
          });
          if (
            selected &&
            base.catalogue.anchors.some(
              (a) => a.source === s.id && a.quote.includes(selected.quote)
            )
          )
            expected.push(
              JSON.stringify({ source: s.id, subjectRef: [first, last] })
            );
        }
    const max = api.readerReviewV10GenerationSchema(input).$defs.p.maximum,
      actual = [];
    for (let id = 0; id <= max; id++)
      actual.push(JSON.stringify(api.readerReviewV10EntityProof(input, id)));
    expect(actual.sort()).toEqual(expected.sort());
    expect(new Set(actual).size).toBe(actual.length);
    expect(parts(input).join('')).toBe(query);
  }
);

test('candidate qualification, contextual modes and temporal filtering remain unchanged', () => {
  const api = current(),
    input = api.prepareReaderReviewV10(pack()),
    raw = output(api, input);
  raw.claims[0].text = 'Учебный обзор доступен.';
  raw.coverage[0].status = 'supported';
  const reviewed = review(api, input, raw);
  expect(reviewed.assessment.entities[0].status).toBe('contextual_mention');
  expect(reviewed.assessment.coverage[0].status).toBe('partial');
  raw.entities[0].mode = 'contextual_mention';
  expect(review(api, input, raw).assessment.entities[0].status).toBe(
    'contextual_mention'
  );
  const future = api.prepareReaderReviewV10(
    pack(undefined, [
      'Telegram описан в учебном обзоре. На 2 октября 2026 доступен обзор.',
    ])
  );
  const filtered = review(api, future);
  expect(filtered.assessment.claims).toHaveLength(0);
  expect(filtered.assessment.entities[0].status).toBe('contextual_mention');
  expect(filtered.assessment.status).toBe('insufficient_evidence');
});

test.each(['Russian', 'English', 'Haitian Creole'])(
  'all-clause citation rule, prices/bundles and fixed/input budgets hold in %s',
  (language) => {
    const api = current(),
      input = api.prepareReaderReviewV10(pack(undefined, undefined, language));
    expect(input.prompt).toMatch(/every clause/i);
    expect(input.prompt).toMatch(/selected spans/i);
    expect(input.prompt).toMatch(/prices/);
    expect(input.prompt).toMatch(/bundles/);
    const rules =
      input.prompt.split('Untrusted reader evidence:\n')[0] +
      'Untrusted reader evidence:\n';
    expect(
      old.serializedReaderV5InputBytes(rules, api.readerReviewWireV10JsonSchema)
    ).toBeLessThanOrEqual(4000);
    expect(input.inputBytes).toBe(
      old.serializedReaderV5InputBytes(
        input.prompt,
        api.readerReviewV10GenerationSchema(input)
      )
    );
    expect(input.inputBytes).toBeLessThanOrEqual(25000);
  }
);
