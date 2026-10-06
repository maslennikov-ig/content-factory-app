const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const old = require('./helpers/reader-source-review.cjs');
const v6 = require('./helpers/reader-subject-review.cjs');
const current = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-proof-review.ts'
);
const query =
  'Что известно о Telegram и Банка России по состоянию на 1 октября 2026?';
const texts = [
  'Telegram описан в синтетическом обзоре. На 1 октября 2026 доступен этот обзор. ' +
    Array.from(
      { length: 30 },
      (_, i) => `Учебный абзац ${i}: другой самостоятельный контекст. `
    ).join(''),
  'Обзор Банка России действует с 1 октября 2026. Это синтетические сведения.',
];
const packed = (subject = query, excerpts = texts, language = 'Russian') =>
  old.packReaderReview(
    subject,
    excerpts.map((_, i) => ({
      url: `https://example.test/proof-${i}`,
      title: `Synthetic ${i}`,
      publishedAt: null,
    })),
    excerpts.map((text, i) => ({
      sourceUrl: `https://example.test/proof-${i}`,
      text,
    })),
    language
  );
const legacyInput = (input) =>
  old.prepareReaderReviewV5({
    evidence: input.evidence,
    language: input.language,
    prompt: '',
    inputBytes: 0,
  });
const decode = (input) => {
  const original = legacyInput(input);
  return input.catalogue.view.sources.map((row, sourceIndex) => [
    ...row.slice(0, 5),
    row[5].map((a, anchorIndex) => {
      const [local, first, last, marker] = a.split(':');
      const id =
        original.catalogue.view.sources[sourceIndex][5][anchorIndex][0];
      return marker !== undefined
        ? [id, +first, +last, 'd']
        : [id, +first, +last];
    }),
  ]);
};
const selectQ = (input, name) => {
  const rows = input.catalogue.view.subjectParts.map((r) => [
    r.slice(0, r.indexOf(':')),
    r.slice(r.indexOf(':') + 1),
  ]);
  for (let i = 0; i < rows.length; i++) {
    let literal = '';
    for (let j = i; j < rows.length; j++) {
      literal += rows[j][1];
      if (literal === name)
        return input.catalogue.view.catalogue.version === 'v7'
          ? [+rows[i][0], +rows[j][0]]
          : { first: rows[i][0], last: rows[j][0] };
    }
  }
  throw new Error('Missing synthetic query span');
};
const output = (input) => {
  const rows = decode(input);
  return {
    version: current.READER_REVIEW_WIRE_V7_VERSION,
    catalogue: input.catalogue.binding,
    sources: rows.map((r) => ({ id: r[0], relevance: 'relevant' })),
    claims: [
      {
        text: 'Telegram описан в синтетическом обзоре.',
        kind: rows[0][5].some((a) => a[3] === 'd') ? 'observed' : 'context',
        proofs: {
          S1: {
            refs: [0],
            dates: rows[0][5].some((a) => a[3] === 'd')
              ? [{ kind: 'as_of', ref: 0 }]
              : [],
          },
        },
      },
    ],
    coverage: [{ question: 'Что известно о Telegram', status: 'partial' }],
    entities: [
      {
        subjectRef: selectQ(input, 'Telegram'),
        status: 'supported_claim',
        source: 'S1',
      },
    ],
  };
};
test('v6 reproduces incompatible name/source-anchor and claim/date-source failures without inventing the actual rejected wire', () => {
  const input = v6.prepareReaderReviewV6(packed());
  const first = input.catalogue.view.sources[0];
  const second = input.catalogue.view.sources[1];
  const nameLess = first[5].find(
    (a) =>
      !first[4]
        .slice(a[1], a[2] + 1)
        .join('')
        .includes('Telegram')
  );
  expect(nameLess).toBeDefined();
  const base = {
    version: v6.READER_REVIEW_WIRE_V6_VERSION,
    catalogue: input.catalogue.binding,
    sources: [
      { id: 'S1', relevance: 'relevant' },
      { id: 'S2', relevance: 'relevant' },
    ],
    claims: [
      {
        text: 'Telegram описан в синтетическом обзоре.',
        kind: 'context',
        refs: [first[5][0][0]],
        dates: [],
      },
    ],
    coverage: [{ question: 'Что известно о Telegram', status: 'partial' }],
    entities: [
      {
        subjectRef: selectQ(input, 'Telegram'),
        status: 'supported_claim',
        ref: nameLess[0],
      },
    ],
  };
  const reasons = [];
  expect(
    v6.compileReaderReviewV6(input, base, (r, ...details) =>
      reasons.push([r, ...details])
    )
  ).toBeNull();
  expect(reasons[0][0]).toBe('entity_source_quote');
  base.entities = [];
  base.claims[0].dates = [
    { kind: 'as_of', ref: second[5].find((a) => a[3] === 'd')[0] },
  ];
  reasons.length = 0;
  expect(
    v6.compileReaderReviewV6(input, base, (r, ...details) =>
      reasons.push([r, ...details])
    )
  ).toBeNull();
  expect(reasons[0][0]).toBe('date_quote_grounding');
  expect(reasons[0][3]).toBe('date_source_mismatch');
});
test('v7 resolves exact name proof in the explicitly declared source, preserving the original selected claim', () => {
  const input = current.prepareReaderReviewV7(packed());
  const raw = output(input);
  const review = current.compileReaderReviewV7(input, raw);
  expect(review.entities[0]).toMatchObject({
    name: 'Telegram',
    subjectStart: query.indexOf('Telegram'),
    ref: { source: 'S1' },
  });
  const ref = review.entities[0].ref;
  expect(input.evidence.sources[0].excerpt.slice(ref.start, ref.end)).toContain(
    'Telegram'
  );
  expect(review.claims[0].text).toBe(raw.claims[0].text);
  expect(old.validateReaderReview(input, review)).not.toBeNull();
});
test('source groups and finite local references retain the entire source and date catalogue', () => {
  const original = packed();
  const legacy = old.prepareReaderReviewV5(original);
  const input = current.prepareReaderReviewV7(original);
  const schema = current.readerReviewV7GenerationSchema(input);
  expect(decode(input)).toEqual(legacy.catalogue.view.sources);
  expect(input.evidence).toEqual(legacy.evidence);
  const branches = schema.$defs.p.properties;
  for (const row of decode(input)) {
    const branch = branches[row[0]];
    const dateIds = row[5].filter((a) => a[3] === 'd').map((a) => a[0]);
    expect(branch).toEqual({
      $ref: dateIds.length ? '#/$defs/g' : '#/$defs/g0',
    });
    const encoded = input.catalogue.view.sources.find(
      (r) => r[0] === row[0]
    )[5];
    expect(encoded.map((a) => a.split(':')[0])).toEqual(
      row[5].map((_, i) => String(i))
    );
    expect(
      encoded
        .filter((a) => a.split(':')[3] !== undefined)
        .map((a) => a.split(':')[3])
    ).toEqual(dateIds.map((_, i) => String(i)));
  }
  expect(schema.$defs.r).toEqual({
    type: 'integer',
    minimum: 0,
    maximum: Math.max(...decode(input).map((r) => r[5].length)) - 1,
  });
  expect(schema.$defs.d).toEqual({
    type: 'integer',
    minimum: 0,
    maximum:
      Math.max(
        ...decode(input).map((r) => r[5].filter((a) => a[3] === 'd').length)
      ) - 1,
  });
  expect(input.inputBytes).toBe(
    old.serializedReaderV5InputBytes(input.prompt, schema)
  );
  expect(input.inputBytes).toBeLessThanOrEqual(25000);
});
test('v7 preserves both sources of a valid multi-source claim and dates after 1 October from retrospective evidence', () => {
  const input = current.prepareReaderReviewV7(packed());
  const raw = output(input);
  const rows = decode(input);
  raw.claims[0].kind = 'observed';
  raw.claims[0].proofs.S1.dates = [];
  raw.claims[0].proofs.S2 = { refs: [0], dates: [{ kind: 'as_of', ref: 0 }] };
  const compiled = current.compileReaderReviewV7(input, raw);
  expect(compiled.claims[0].refs.map((r) => r.source)).toEqual(['S1', 'S2']);
  expect(compiled.claims[0].dates[0]).toMatchObject({
    date: '2026-10-01',
    ref: { source: 'S2' },
  });
  expect(old.validateReaderReview(input, compiled)).not.toBeNull();
});
test.each([
  'foreign-date',
  'foreign-claim',
  'unknown-local-ref',
  'local-alias',
  'date-alias',
  'decimal-ref',
  'negative-ref',
  'unknown-source',
  'entity-name-absent',
  'empty-proofs',
  'three-source-groups',
  'three-refs',
  'six-dates',
  'stale',
  'cloned-input',
  'old-entity-ref',
])(
  'v7 rejects %s without fixing output or weakening original limits',
  (kind) => {
    let input = current.prepareReaderReviewV7(packed());
    const raw = output(input);
    const rows = decode(input);
    const group = raw.claims[0].proofs.S1;
    if (kind === 'foreign-date') group.dates = [{ kind: 'as_of', ref: 'S2:0' }];
    if (kind === 'foreign-claim') group.refs = ['S2:0'];
    if (kind === 'unknown-local-ref') group.refs = [95];
    if (kind === 'local-alias') group.refs = ['00'];
    if (kind === 'date-alias') group.dates = [{ kind: 'as_of', ref: '00' }];
    if (kind === 'decimal-ref') group.refs = [0.5];
    if (kind === 'negative-ref') group.refs = [-1];
    if (kind === 'unknown-source') raw.claims[0].proofs = { S8: group };
    if (kind === 'entity-name-absent') raw.entities[0].source = 'S2';
    if (kind === 'empty-proofs') raw.claims[0].proofs = {};
    if (kind === 'three-source-groups')
      raw.claims[0].proofs = { S1: group, S2: group, S3: group };
    if (kind === 'three-refs')
      raw.claims[0].proofs.S2 = { refs: [0, 0], dates: [] };
    if (kind === 'six-dates') {
      group.dates = Array(3).fill({ kind: 'as_of', ref: 0 });
      raw.claims[0].proofs.S2 = {
        refs: [0],
        dates: Array(3).fill({ kind: 'as_of', ref: 0 }),
      };
    }
    if (kind === 'stale') raw.catalogue = '0'.repeat(32);
    if (kind === 'cloned-input') input = structuredClone(input);
    if (kind === 'old-entity-ref') raw.entities[0].ref = rows[0][5][0][0];
    const reasons = [];
    expect(
      current.compileReaderReviewV7(input, raw, (r) => reasons.push(r))
    ).toBeNull();
    expect(reasons).toHaveLength(1);
  }
);
test('v7 retains v1 supported-name and absence-status validation', () => {
  const input = current.prepareReaderReviewV7(packed());
  const raw = output(input);
  raw.claims[0].text = 'Синтетический обзор.';
  expect(
    old.validateReaderReview(input, current.compileReaderReviewV7(input, raw))
  ).toBeNull();
  raw.entities[0].status = 'not_observed_in_presented_evidence';
  expect(
    old.validateReaderReview(input, current.compileReaderReviewV7(input, raw))
  ).toBeNull();
});
test('a source with no civil-date anchor exposes dates=[] and still supports undated context', () => {
  const input = current.prepareReaderReviewV7(
    packed('Что известно о Telegram?', [
      'Telegram описан в синтетическом обзоре.',
    ])
  );
  const schema = current.readerReviewV7GenerationSchema(input);
  expect(schema.$defs.p.properties.S1).toEqual({ $ref: '#/$defs/g0' });
  expect(schema.$defs.g0.properties.dates.maxItems).toBe(0);
  expect(
    old.validateReaderReview(
      input,
      current.compileReaderReviewV7(input, output(input))
    )
  ).not.toBeNull();
});
test('date index0 is local to its declared source even when another source has a different date0', () => {
  const input = current.prepareReaderReviewV7(
    packed(query, [texts[0], texts[1].replace('1 октября', '2 октября')])
  );
  const raw = output(input);
  const compiled = current.compileReaderReviewV7(input, raw);
  expect(compiled.claims[0].dates[0]).toMatchObject({
    date: '2026-10-01',
    ref: { source: 'S1' },
  });
  raw.claims[0].proofs = {
    S2: { refs: [0], dates: [{ kind: 'as_of', ref: 0 }] },
  };
  raw.entities = [];
  const other = current.compileReaderReviewV7(input, raw);
  expect(other.claims[0].dates[0]).toMatchObject({
    date: '2026-10-02',
    ref: { source: 'S2' },
  });
  expect(old.validateReaderReview(input, other).summary).toBe('');
});
test('every original K anchor and date span is preserved by its source-local numeric alias', () => {
  const input = current.prepareReaderReviewV7(packed());
  const legacy = legacyInput(input);
  for (const row of legacy.catalogue.view.sources) {
    for (let i = 0; i < row[5].length; i++) {
      const raw = output(input);
      raw.entities = [];
      raw.claims[0].proofs = { [row[0]]: { refs: [i], dates: [] } };
      const compiled = current.compileReaderReviewV7(input, raw);
      const anchor = legacy.catalogue.anchors.find(
        (a) => a.id === row[5][i][0]
      );
      expect(compiled.claims[0].refs[0]).toEqual({
        source: anchor.source,
        start: anchor.start,
        end: anchor.end,
      });
    }
    const dates = row[5].filter((a) => a[3] === 'd');
    for (let i = 0; i < dates.length; i++) {
      const raw = output(input);
      raw.entities = [];
      raw.claims[0].proofs = {
        [row[0]]: { refs: [0], dates: [{ kind: 'as_of', ref: i }] },
      };
      const compiled = current.compileReaderReviewV7(input, raw);
      const anchor = legacy.catalogue.anchors.find((a) => a.id === dates[i][0]);
      expect(compiled.claims[0].dates[0].ref).toEqual({
        source: anchor.source,
        start: anchor.start,
        end: anchor.end,
      });
    }
  }
});
test('numeric query rows keep Russian inflection, colons, quotes and supplementary Unicode literal', () => {
  const name = 'Банка России:😀';
  const subject = `Что известно о «${name}»?\nСохрани "имя" и \\ слеш.`;
  const input = current.prepareReaderReviewV7(
    packed(subject, [`Синтетический обзор «${name}».`])
  );
  expect(
    input.catalogue.view.subjectParts
      .map((r) => r.slice(r.indexOf(':') + 1))
      .join('')
  ).toBe(subject);
  const raw = {
    version: current.READER_REVIEW_WIRE_V7_VERSION,
    catalogue: input.catalogue.binding,
    sources: [{ id: 'S1', relevance: 'relevant' }],
    claims: [
      {
        text: `Синтетический обзор ${name}.`,
        kind: 'context',
        proofs: { S1: { refs: [0], dates: [] } },
      },
    ],
    coverage: [{ question: subject, status: 'partial' }],
    entities: [
      {
        subjectRef: selectQ(input, name),
        status: 'supported_claim',
        source: 'S1',
      },
    ],
  };
  const compiled = current.compileReaderReviewV7(input, raw);
  expect(compiled.entities[0]).toMatchObject({
    name,
    subjectStart: subject.indexOf(name),
    subjectEnd: subject.indexOf(name) + name.length,
  });
  expect(old.validateReaderReview(input, compiled)).not.toBeNull();
});
test('numeric query ranges still reject reversed, overlong and noninteger names without normalization', () => {
  const input = current.prepareReaderReviewV7(
    packed(query + ' Сохрани полное исходное имя без каких-либо изменений.')
  );
  for (const reference of [
    [5, 4],
    [0, input.catalogue.view.subjectParts.length - 1],
    [0.5, 1],
  ]) {
    const raw = output(input);
    raw.entities[0].subjectRef = reference;
    expect(current.compileReaderReviewV7(input, raw)).toBeNull();
  }
});
test('queries beyond the preserved 384-part bound reject before invocation while v5 remains available', () => {
  const original = packed('я '.repeat(2499));
  const reasons = [];
  expect(
    current.prepareReaderReviewV7(original, (r) => reasons.push(r))
  ).toBeNull();
  expect(reasons).toEqual(['catalogue_bounds']);
  expect(old.prepareReaderReviewV5(original)).not.toBeNull();
});
test('source-local date0 cannot be invented in a source without any date anchors', () => {
  const input = current.prepareReaderReviewV7(
    packed(query, [texts[0], 'Синтетический контекст без даты.'])
  );
  const raw = output(input);
  raw.entities = [];
  raw.claims[0].proofs = {
    S2: { refs: [0], dates: [{ kind: 'as_of', ref: 0 }] },
  };
  const reasons = [];
  expect(
    current.compileReaderReviewV7(input, raw, (r) => reasons.push(r))
  ).toBeNull();
  expect(reasons).toEqual(['catalogue_unknown_id']);
});
test.each([true, false])(
  'installed SDK sends the complete v7 schema and exactly one original-budget request (date=%s)',
  async (hasDate) => {
    const { ChatOpenAI } = require('@langchain/openai');
    const input = current.prepareReaderReviewV7(
      packed('Что известно о Telegram?', [
        hasDate ? texts[0] : 'Telegram описан в синтетическом обзоре.',
      ])
    );
    const schema = current.readerReviewV7GenerationSchema(input);
    const raw = output(input);
    const calls = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.$ref) {
        expect(node.$ref).toMatch(/^#\/\$defs\//);
        expect(schema.$defs[node.$ref.slice('#/$defs/'.length)]).toBeDefined();
      }
      if (node.type === 'array') expect(node.items).toBeDefined();
      Object.values(node).forEach(visit);
    };
    visit(schema);
    const model = new ChatOpenAI({
      apiKey: 'offline-no-secret',
      model: 'openai/gpt-6-luna',
      maxTokens: 1200,
      maxRetries: 0,
      disableStreaming: true,
      configuration: {
        baseURL: 'https://offline.invalid/v1',
        fetch: async (url, init) => {
          expect(String(url)).toBe(
            'https://offline.invalid/v1/chat/completions'
          );
          const sent = JSON.parse(init.body);
          calls.push(sent);
          expect(sent.response_format.json_schema.schema).toEqual(schema);
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
      .invoke(input.prompt);
    expect(calls).toHaveLength(1);
    expect(actual).toEqual(raw);
    const compiled = current.compileReaderReviewV7(input, actual);
    expect(old.validateReaderReview(input, compiled)).not.toBeNull();
    expect(input.inputBytes).toBe(
      old.serializedReaderV5InputBytes(
        input.prompt,
        calls[0].response_format.json_schema.schema
      )
    );
  }
);
test.each(['Russian', 'English', 'Haitian Creole'])(
  'v7 fixed schema/rules fit the unchanged 4000-byte allowance in %s',
  (language) => {
    const input = current.prepareReaderReviewV7(packed(query, texts, language));
    expect(input).not.toBeNull();
    const marker = 'Untrusted reader evidence:\n';
    const rules = input.prompt.slice(
      0,
      input.prompt.indexOf(marker) + marker.length
    );
    expect(
      old.serializedReaderV5InputBytes(
        rules,
        current.readerReviewWireV7JsonSchema
      )
    ).toBeLessThanOrEqual(4000);
  }
);
