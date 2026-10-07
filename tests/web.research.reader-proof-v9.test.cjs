const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const old = require('./helpers/reader-source-review.cjs');
const v8 = require('./helpers/reader-proof-review-v8.cjs');
const current = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-proof-review-v9.ts'
);
const subject = 'Что известно о Telegram на 1 октября 2026?';
const texts = [
  'Telegram описан в учебном обзоре. На 1 октября 2026 доступен обзор. ' +
    'Отдельный учебный абзац описывает другой аспект этого же обзора.',
  'Telegram описан во втором учебном обзоре. На 1 октября 2026 доступен обзор.',
];
const packed = (query = subject, excerpts = texts, language = 'Russian') =>
  old.packReaderReview(
    query,
    excerpts.map((_, i) => ({
      url: `https://example.test/v9-${i}`,
      title: `Synthetic ${i}`,
      publishedAt: null,
    })),
    excerpts.map((text, i) => ({
      sourceUrl: `https://example.test/v9-${i}`,
      text,
    })),
    language
  );
const input = (...args) => current.prepareReaderReviewV9(packed(...args));
const selectQ = (value, name) => {
  const parts = value.catalogue.view.subjectParts.map((p) =>
    p.slice(p.indexOf(':') + 1)
  );
  for (let first = 0; first < parts.length; first++) {
    let literal = '';
    for (let last = first; last < parts.length; last++) {
      literal += parts[last];
      if (literal === name) return [first, last];
    }
  }
  throw Error('SYNTHETIC_QUERY_NAME_MISSING');
};
const output = (value) => ({
  version: current.READER_REVIEW_WIRE_V9_VERSION,
  catalogue: value.catalogue.binding,
  sources: value.catalogue.view.sources.map((row) => ({
    id: row[0],
    relevance: 'relevant',
  })),
  claims: [
    {
      text: 'Telegram описан в учебном обзоре.',
      kind: 'observed',
      refs: [{ source: 'S1', ref: 0 }],
      dates: [{ kind: 'as_of', via: 0, ref: 0 }],
    },
  ],
  coverage: [{ question: 'Что известно о Telegram', status: 'partial' }],
  entities: [
    {
      subjectRef: selectQ(value, 'Telegram'),
      mode: 'claim_candidate',
      source: 'S1',
    },
  ],
});
const review = (value, raw = output(value), observer) => {
  const compiled = current.compileReaderReviewV9(value, raw, observer);
  return compiled && current.validateReaderReviewV9(value, compiled, observer);
};

test('v8 permits aggregate proof sizes its compiler refuses; historical raw wire remains unknown', () => {
  const value = v8.prepareReaderReviewV8(packed());
  const raw = {
    ...output(value),
    version: v8.READER_REVIEW_WIRE_V8_VERSION,
    entities: [],
  };
  raw.claims = [
    {
      text: 'Учебный обзор.',
      kind: 'context',
      proofs: [
        { source: 'S1', refs: [0, 0], dates: [] },
        { source: 'S2', refs: [0, 0], dates: [] },
      ],
    },
  ];
  expect(v8.readerReviewWireV8Schema.safeParse(raw).success).toBe(true);
  const seen = [];
  expect(
    v8.compileReaderReviewV8(value, raw, (...args) => seen.push(args))
  ).toBeNull();
  expect(seen).toEqual([['wire_schema']]);
});

test('v9 retains complete source/query catalogues with a separate binding', () => {
  const value = input(),
    previous = v8.prepareReaderReviewV8(packed());
  expect(value.catalogue.view.sources).toEqual(previous.catalogue.view.sources);
  expect(value.catalogue.view.subjectParts).toEqual(
    previous.catalogue.view.subjectParts
  );
  expect(value.catalogue.binding).not.toBe(previous.catalogue.binding);
  expect(review(value).assessment.entities[0].status).toBe('supported_claim');
});

test('flat schema and decoder impose the same total two-ref/five-date limits', () => {
  const value = input(),
    schema = current.readerReviewV9GenerationSchema(value);
  expect(schema.properties.claims.items.properties.refs.maxItems).toBe(2);
  expect(schema.properties.claims.items.properties.dates.maxItems).toBe(5);
  for (const [field, count] of [
    ['refs', 3],
    ['dates', 6],
  ]) {
    const raw = output(value);
    raw.claims[0][field] = Array.from({ length: count }, () => ({
      ...raw.claims[0][field][0],
    }));
    const seen = [];
    expect(
      current.compileReaderReviewV9(value, raw, (...args) => seen.push(args))
    ).toBeNull();
    expect(seen[0]).toEqual([
      'wire_schema',
      { family: field, code: 'too_big' },
    ]);
  }
});

test.each(['same', 'different'])(
  'two %s-source refs are retained without grouping or deduplication',
  (kind) => {
    const value = input(),
      raw = output(value);
    raw.claims[0].refs.push({ source: kind === 'same' ? 'S1' : 'S2', ref: 0 });
    const compiled = current.compileReaderReviewV9(value, raw);
    expect(compiled.claims[0].refs).toHaveLength(2);
    expect(current.validateReaderReviewV9(value, compiled)).not.toBeNull();
  }
);

test('candidate without a named eligible claim is a proved contextual mention, not unsupported support', () => {
  const value = input(),
    raw = output(value);
  raw.claims[0].text = 'Учебный обзор доступен.';
  const compiled = current.compileReaderReviewV9(value, raw),
    qualified = current.validateReaderReviewV9(value, compiled);
  expect(qualified.assessment.entities[0].status).toBe('contextual_mention');
  expect(qualified.summary).toContain(
    'Telegram: упоминание в контексте источника'
  );
  const legacy = {
      ...compiled,
      entities: compiled.entities.map((e) => ({
        ...e,
        status: 'supported_claim',
      })),
    },
    seen = [];
  expect(
    old.validateReaderReview(value, legacy, (...args) => seen.push(args))
  ).toBeNull();
  expect(seen[0][0]).toBe('v1_entity_supported_claim');
  expect(seen[0][3]).toBe('entity_name_missing');
});

test('an unqualified candidate leaves a conservative coverage gap', () => {
  const value = input(),
    raw = output(value);
  raw.claims[0].text = 'Учебный обзор доступен.';
  raw.coverage[0].status = 'supported';
  const qualified = review(value, raw);
  expect(qualified.assessment.entities[0].status).toBe('contextual_mention');
  expect(qualified.assessment.coverage[0].status).toBe('partial');
  expect(qualified.assessment.status).toBe('partial');
});

test('explicit contextual mode never upgrades to a supported claim', () => {
  const value = input(),
    raw = output(value);
  raw.entities[0].mode = 'contextual_mention';
  expect(review(value, raw).assessment.entities[0].status).toBe(
    'contextual_mention'
  );
});

test('repeated literal names preserve each explicit entity mode', () => {
  const value = input(),
    raw = output(value);
  raw.entities.push({ ...raw.entities[0], mode: 'contextual_mention' });
  expect(review(value, raw).assessment.entities.map((e) => e.status)).toEqual([
    'supported_claim',
    'contextual_mention',
  ]);
});

test('a date cannot select a reference absent from this claim', () => {
  const value = input(),
    raw = output(value),
    seen = [];
  raw.claims[0].dates[0].via = 1;
  expect(
    current.compileReaderReviewV9(value, raw, (...args) => seen.push(args))
  ).toBeNull();
  expect(seen[0][0]).toBe('date_reference_slot');
});

test('support is derived only after unchanged v1 requested-date filtering', () => {
  const value = input(subject, [
    'Telegram описан в учебном обзоре. На 2 октября 2026 доступен обзор.',
  ]);
  const qualified = review(value);
  expect(qualified.assessment.claims).toHaveLength(0);
  expect(qualified.assessment.entities[0].status).toBe('contextual_mention');
  expect(qualified.assessment.status).toBe('insufficient_evidence');
  expect(qualified.summary).toContain(
    'утверждение на запрошенную дату не подтверждено'
  );
});

test('two qualification passes preserve original temporal disposition counts', () => {
  const value = input(subject, [
      texts[0],
      texts[1].replaceAll('1 октября', '2 октября'),
    ]),
    raw = output(value);
  raw.coverage[0].status = 'supported';
  raw.claims.push({
    ...raw.claims[0],
    refs: [{ source: 'S2', ref: 0 }],
    dates: [{ kind: 'as_of', via: 0, ref: 0 }],
  });
  const qualified = review(value, raw);
  expect(qualified.assessment.entities[0].status).toBe('supported_claim');
  expect(qualified.assessment.claims).toHaveLength(1);
  expect(qualified.assessment.coverage[0].status).toBe('partial');
  expect(qualified.assessment.claimDisposition).toMatchObject({
    status: 'some_claims_temporally_filtered',
    providedClaims: 2,
    acceptedClaims: 1,
    temporallyFilteredClaims: 1,
    omittedContradictoryDates: 0,
  });
});

test('candidate may qualify only from its exact source, not another source named claim', () => {
  const value = input(),
    raw = output(value);
  raw.claims[0].refs = [{ source: 'S2', ref: 0 }];
  raw.claims[0].dates = [{ kind: 'as_of', via: 0, ref: 0 }];
  expect(review(value, raw).assessment.entities[0].status).toBe(
    'contextual_mention'
  );
});

test.each([
  'unknown-source',
  'unknown-local',
  'foreign-date',
  'stale',
  'bad-query',
  'wrong-entity-source',
  'free-quote',
])(
  'v9 rejects %s while retaining exact legacy source/name/date proof',
  (kind) => {
    const value = input(
        subject,
        kind === 'wrong-entity-source'
          ? [texts[0], 'Другой учебный источник на 1 октября 2026.']
          : texts
      ),
      raw = output(value);
    if (kind === 'unknown-source') raw.claims[0].refs[0].source = 'S8';
    if (kind === 'unknown-local') raw.claims[0].refs[0].ref = 95;
    if (kind === 'foreign-date') raw.claims[0].dates[0].ref = 'S2:0';
    if (kind === 'stale') raw.catalogue = '0'.repeat(32);
    if (kind === 'bad-query') raw.entities[0].subjectRef = [383, 383];
    if (kind === 'wrong-entity-source') raw.entities[0].source = 'S2';
    if (kind === 'free-quote')
      raw.claims[0].refs[0].quote = 'PRIVATE_SYNTHETIC';
    const seen = [];
    expect(review(value, raw, (...args) => seen.push(args))).toBeNull();
    expect(seen).toHaveLength(1);
    expect(JSON.stringify(seen)).not.toContain('PRIVATE_SYNTHETIC');
  }
);

test('a source with no date cannot select another source date index', () => {
  const value = input(subject, ['Telegram описан в учебном обзоре.', texts[1]]),
    raw = output(value),
    seen = [];
  expect(
    current.compileReaderReviewV9(value, raw, (...args) => seen.push(args))
  ).toBeNull();
  expect(seen[0][0]).toBe('catalogue_unknown_id');
});

test('an unbound clone cannot compile or derive entity support', () => {
  const value = input(),
    compiled = current.compileReaderReviewV9(value, output(value));
  expect(
    current.compileReaderReviewV9(
      JSON.parse(JSON.stringify(value)),
      output(value)
    )
  ).toBeNull();
  expect(
    current.validateReaderReviewV9(value, JSON.parse(JSON.stringify(compiled)))
  ).toBeNull();
});

test.each(['Russian', 'English', 'Haitian Creole'])(
  'fixed/actual budgets hold in %s',
  (language) => {
    const value = input(subject, texts, language);
    expect(value).not.toBeNull();
    const rules =
      value.prompt.split('Untrusted reader evidence:\n')[0] +
      'Untrusted reader evidence:\n';
    expect(
      old.serializedReaderV5InputBytes(
        rules,
        current.readerReviewWireV9JsonSchema
      )
    ).toBeLessThanOrEqual(4000);
    expect(value.inputBytes).toBe(
      old.serializedReaderV5InputBytes(
        value.prompt,
        current.readerReviewV9GenerationSchema(value)
      )
    );
    expect(value.inputBytes).toBeLessThanOrEqual(25000);
  }
);

test.each([true, false])(
  'installed SDK transmits the exact fully required v9 schema and invokes once (dates=%s)',
  async (hasDates) => {
    const { ChatOpenAI } = require('@langchain/openai'),
      value = hasDates
        ? input()
        : input('Что известно о Telegram?', [
            'Telegram описан в учебном обзоре.',
          ]),
      raw = output(value),
      schema = current.readerReviewV9GenerationSchema(value),
      calls = [];
    if (!hasDates) {
      raw.claims[0].kind = 'context';
      raw.claims[0].dates = [];
      expect(schema.properties.claims.items.properties.dates.maxItems).toBe(0);
    }
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'object') {
        expect(node.additionalProperties).toBe(false);
        expect([...(node.required ?? [])].sort()).toEqual(
          Object.keys(node.properties ?? {}).sort()
        );
      }
      if (node.$ref)
        expect(schema.$defs[node.$ref.slice('#/$defs/'.length)]).toBeDefined();
      if (node.type === 'array') expect(node.items).toBeDefined();
      Object.values(node).forEach(visit);
    };
    const model = new ChatOpenAI({
      apiKey: 'offline-no-secret',
      model: 'openai/gpt-6-luna',
      maxTokens: 1200,
      maxRetries: 0,
      disableStreaming: true,
      configuration: {
        baseURL: 'https://offline.invalid/v1',
        fetch: async (url, init) => {
          const sent = JSON.parse(init.body);
          calls.push(sent);
          expect(sent.response_format.json_schema.schema).toEqual(schema);
          visit(schema);
          expect(sent.max_tokens).toBe(1200);
          return new Response(
            JSON.stringify({
              id: 'offline',
              object: 'chat.completion',
              created: 0,
              model: sent.model,
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: JSON.stringify(raw) },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        },
      },
    });
    const actual = await model
      .withStructuredOutput(schema)
      .invoke(value.prompt);
    expect(calls).toHaveLength(1);
    expect(review(value, actual)).not.toBeNull();
  }
);
