const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const old = require('./helpers/reader-source-review.cjs');
const current = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-proof-review-v8.ts'
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
        return input.catalogue.view.catalogue.version === 'v8'
          ? [+rows[i][0], +rows[j][0]]
          : { first: rows[i][0], last: rows[j][0] };
    }
  }
  throw new Error('Missing synthetic query span');
};
const output = (input) => {
  const rows = decode(input);
  return {
    version: current.READER_REVIEW_WIRE_V8_VERSION,
    catalogue: input.catalogue.binding,
    sources: rows.map((r) => ({ id: r[0], relevance: 'relevant' })),
    claims: [
      {
        text: 'Telegram описан в синтетическом обзоре.',
        kind: rows[0][5].some((a) => a[3] === 'd') ? 'observed' : 'context',
        proofs: [{
          source: 'S1',
          refs: [0],
          dates: rows[0][5].some((a) => a[3] === 'd')
            ? [{ kind: 'as_of', ref: 0 }] : [],
        }],
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

test('v8 retains complete v7 source/query catalogues and exact legacy name/date proof', () => {
  const input = current.prepareReaderReviewV8(packed());
  const v7 = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/reader-proof-review.ts');
  const previous = v7.prepareReaderReviewV7(packed());
  expect(input.catalogue.view.sources).toEqual(previous.catalogue.view.sources);
  expect(input.catalogue.view.subjectParts).toEqual(previous.catalogue.view.subjectParts);
  expect(input.catalogue.binding).not.toBe(previous.catalogue.binding);
  const compiled = current.compileReaderReviewV8(input, output(input));
  expect(compiled).not.toBeNull();
  expect(old.validateReaderReview(input, compiled)).not.toBeNull();
});

test('v8 preserves a valid two-source proof and its source-local date', () => {
  const input = current.prepareReaderReviewV8(packed());
  const raw = output(input);
  raw.claims[0].proofs[0].dates = [];
  raw.claims[0].proofs.push({ source: 'S2', refs: [0], dates: [{ kind: 'as_of', ref: 0 }] });
  const compiled = current.compileReaderReviewV8(input, raw);
  expect(compiled).not.toBeNull();
  expect(compiled.claims[0].refs).toHaveLength(2);
  expect(old.validateReaderReview(input, compiled)).not.toBeNull();
});

test.each([
  ['duplicate-source', 'wire_schema'],
  ['unknown-source', 'quote_source'],
  ['unknown-local', 'catalogue_unknown_id'],
  ['foreign-date', 'wire_schema'],
  ['too-many-groups', 'wire_schema'],
  ['too-many-refs', 'wire_schema'],
  ['too-many-dates', 'wire_schema'],
  ['empty', 'wire_schema'],
  ['free-quote', 'wire_schema'],
  ['stale', 'catalogue_binding'],
  ['wrong-entity-source', 'entity_source_quote'],
])('v8 rejects %s without repairing proof or changing legacy acceptance', (kind, reason) => {
  const input = current.prepareReaderReviewV8(packed());
  const raw = output(input), proof = raw.claims[0].proofs[0];
  if (kind === 'duplicate-source') raw.claims[0].proofs.push({ ...proof });
  if (kind === 'unknown-source') proof.source = 'S8';
  if (kind === 'unknown-local') proof.refs = [95];
  if (kind === 'foreign-date') proof.dates[0].ref = 'S2:0';
  if (kind === 'too-many-groups') raw.claims[0].proofs.push({ ...proof, source: 'S2' }, { ...proof, source: 'S3' });
  if (kind === 'too-many-refs') raw.claims[0].proofs.push({ source: 'S2', refs: [0, 0], dates: [] });
  if (kind === 'too-many-dates') raw.claims[0].proofs.push({ source: 'S2', refs: [0], dates: Array.from({ length: 5 }, () => ({ kind: 'as_of', ref: 0 })) });
  if (kind === 'empty') raw.claims[0].proofs = [];
  if (kind === 'free-quote') proof.quote = 'SYNTHETIC_PRIVATE';
  if (kind === 'stale') raw.catalogue = '0'.repeat(32);
  if (kind === 'wrong-entity-source') raw.entities[0].source = 'S2';
  const seen = [];
  expect(current.compileReaderReviewV8(input, raw, (code) => seen.push(code))).toBeNull();
  expect(seen).toEqual([reason]);
});

test('a source without a date cannot select a different source date index', () => {
  const input = current.prepareReaderReviewV8(packed(query, [
    'Telegram описан в синтетическом обзоре.', texts[1],
  ]));
  const raw = output(input);
  raw.claims[0].proofs[0].dates = [{ kind: 'as_of', ref: 0 }];
  const seen = [];
  expect(current.compileReaderReviewV8(input, raw, (code) => seen.push(code))).toBeNull();
  expect(seen).toEqual(['catalogue_unknown_id']);
});

test('all-date-free schema retains complete items and a working context review', () => {
  const input = current.prepareReaderReviewV8(packed('Что известно о Telegram?', [
    'Telegram описан в синтетическом обзоре.',
  ]));
  const schema = current.readerReviewV8GenerationSchema(input);
  expect(schema.$defs.g.properties.dates.maxItems).toBe(0);
  expect(schema.$defs.g.properties.dates.items).toBeDefined();
  expect(old.validateReaderReview(input, current.compileReaderReviewV8(input, output(input)))).not.toBeNull();
});

test('v8 rejects a cloned catalogue input before consuming model proof', () => {
  const input = current.prepareReaderReviewV8(packed());
  const seen = [];
  expect(current.compileReaderReviewV8(JSON.parse(JSON.stringify(input)), output(input), (code) => seen.push(code))).toBeNull();
  expect(seen).toEqual(['catalogue_integrity']);
});

test.each([true, false])('installed SDK sends a provider-compatible v8 schema once (date=%s)', async (hasDate) => {
  const { ChatOpenAI } = require('@langchain/openai');
  const input = current.prepareReaderReviewV8(packed('Что известно о Telegram?', [
    hasDate ? texts[0] : 'Telegram описан в синтетическом обзоре.',
  ]));
  const schema = current.readerReviewV8GenerationSchema(input), raw = output(input), calls = [];
  const check = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      expect(node.additionalProperties).toBe(false);
      expect([...(node.required ?? [])].sort()).toEqual(Object.keys(node.properties ?? {}).sort());
    }
    if (node.$ref) expect(schema.$defs[node.$ref.slice('#/$defs/'.length)]).toBeDefined();
    if (node.type === 'array') expect(node.items).toBeDefined();
    Object.values(node).forEach(check);
  };
  const model = new ChatOpenAI({
    apiKey: 'offline-no-secret', model: 'openai/gpt-6-luna', maxTokens: 1200,
    maxRetries: 0, disableStreaming: true,
    configuration: { baseURL: 'https://offline.invalid/v1', fetch: async (url, init) => {
      expect(String(url)).toBe('https://offline.invalid/v1/chat/completions');
      const sent = JSON.parse(init.body); calls.push(sent);
      expect(sent.response_format.json_schema.schema).toEqual(schema);
      check(sent.response_format.json_schema.schema);
      expect(sent.max_tokens).toBe(1200);
      return new Response(JSON.stringify({ id: 'offline', object: 'chat.completion', created: 0,
        model: sent.model, choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(raw) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  const actual = await model.withStructuredOutput(schema).invoke(input.prompt);
  expect(calls).toHaveLength(1);
  expect(actual).toEqual(raw);
  expect(old.validateReaderReview(input, current.compileReaderReviewV8(input, actual))).not.toBeNull();
  expect(input.inputBytes).toBe(old.serializedReaderV5InputBytes(input.prompt, schema));
  expect(input.inputBytes).toBeLessThanOrEqual(25000);
});

test.each(['Russian', 'English', 'Haitian Creole'])('v8 preserves the fixed 4000-byte allowance in %s', (language) => {
  const input = current.prepareReaderReviewV8(packed(query, texts, language));
  expect(input).not.toBeNull();
  const rules = input.prompt.split('Untrusted reader evidence:\n')[0] + 'Untrusted reader evidence:\n';
  expect(old.serializedReaderV5InputBytes(rules, current.readerReviewWireV8JsonSchema)).toBeLessThanOrEqual(4000);
  expect(input.inputBytes).toBeLessThanOrEqual(25000);
});
