'use strict';

const { ChatOpenAI } = require('@langchain/openai');
const { readerReviewJsonSchema, readerReviewSchema } = require('./helpers/reader-source-review.cjs');
const { readerReviewWireJsonSchema, readerReviewWireSchema, READER_REVIEW_WIRE_VERSION } = require('./helpers/reader-source-review.cjs');

// The actual installed SDK must send a provider-compatible, self-contained
// reader schema. Network transport is intercepted; no real model is called.
test('reader schema reaches the real SDK without property-path references rejected by the provider', async () => {
  const calls = [];
  const output = { sources: [], claims: [], coverage: [{ question: 'synthetic', status: 'unsupported' }], entities: [] };
  const model = new ChatOpenAI({
    apiKey: 'offline-no-secret', model: 'openai/gpt-6-luna', temperature: 0,
    maxTokens: 1200, maxRetries: 0, disableStreaming: true,
    configuration: { baseURL: 'https://offline.invalid/v1', fetch: async (url, init) => {
      expect(String(url)).toBe('https://offline.invalid/v1/chat/completions');
      const request = JSON.parse(init.body); calls.push(request);
      const schema = request.response_format.json_schema.schema;
      if (JSON.stringify(schema).includes('"$ref":"#/properties/')) {
        return new Response(JSON.stringify({ error: { message: 'Invalid schema: reference to component was not found.', type: 'invalid_request_error' } }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ id: 'offline', object: 'chat.completion', created: 0, model: request.model,
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(output) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  await expect(model.withStructuredOutput(readerReviewJsonSchema).invoke('Synthetic reader transport check.')).resolves.toEqual(output);
  expect(calls).toHaveLength(1);
  expect(calls[0].response_format.type).toBe('json_schema');
  expect(calls[0].max_tokens).toBe(1200);
  expect(JSON.stringify(calls[0].response_format.json_schema.schema)).not.toContain('#/properties/');
  expect(calls[0].response_format.json_schema.schema.$defs.r).toEqual(readerReviewJsonSchema.$defs.r);
  expect(readerReviewSchema.safeParse(output).success).toBe(true);
});

test('each reference retains the same strict bounds without changing validation', () => {
  const claims = readerReviewJsonSchema.properties.claims.items;
  const reference = readerReviewJsonSchema.$defs.r;
  expect(claims.properties.refs.items).toEqual({ $ref: '#/$defs/r' });
  expect(claims.properties.dates.items.properties.ref).toEqual({ $ref: '#/$defs/r' });
  expect(readerReviewJsonSchema.properties.entities.items.properties.ref.anyOf[0]).toEqual({ $ref: '#/$defs/r' });
  expect(reference).toEqual({ type: 'object', properties: { source: { type: 'string', maxLength: 3 }, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 } }, required: ['source', 'start', 'end'], additionalProperties: false });
  const valid = { sources: [{ id: 'S1', relevance: 'relevant' }], claims: [{ text: 'synthetic', kind: 'context', refs: [{ source: 'S1', start: 0, end: 1 }], dates: [] }], coverage: [{ question: 'synthetic', status: 'supported' }], entities: [] };
  expect(readerReviewSchema.safeParse(valid).success).toBe(true);
  expect(readerReviewSchema.safeParse({ ...valid, claims: [{ ...valid.claims[0], refs: [{ source: 'S1', start: -1, end: 1 }] }] }).success).toBe(false);
  expect(readerReviewSchema.safeParse({ ...valid, claims: [{ ...valid.claims[0], refs: [{ source: 'S1', start: 0, end: 1, extra: true }] }] }).success).toBe(false);
});

test('anchor wire v3 reaches the actual SDK with public named definitions and unchanged token limit', async () => {
  const output = {
    version: READER_REVIEW_WIRE_VERSION,
    sources: [{ id: 'S1', relevance: 'relevant' }],
    claims: [
      {
        text: 'Синтетический факт.',
        kind: 'context',
        refs: [{ source: 'S1', quote: '😀 точная цитата' }],
        dates: [{ kind: 'as_of', dateLiteral: '1 октября 2026', ref: { source: 'S1', quote: '1 октября 2026' } }],
      },
    ],
    coverage: [{ question: 'synthetic', status: 'supported' }],
    entities: [],
  };
  const requests = [];
  const model = new ChatOpenAI({
    apiKey: 'offline-no-secret',
    model: 'openai/gpt-6-luna',
    temperature: 0,
    maxTokens: 1200,
    maxRetries: 0,
    disableStreaming: true,
    configuration: {
      baseURL: 'https://offline.invalid/v1',
      fetch: async (url, init) => {
        expect(String(url)).toBe('https://offline.invalid/v1/chat/completions');
        const request = JSON.parse(init.body);
        requests.push(request);
        const schema = request.response_format.json_schema.schema;
        expect(JSON.stringify(schema)).not.toContain('#/properties/');
        expect(schema.$defs.q).toEqual(readerReviewWireJsonSchema.$defs.q);
        expect(schema.properties.claims.items.properties.dates.items.properties.dateLiteral).toEqual({
          type: 'string', minLength: 1, maxLength: 80,
        });
        expect(schema.properties.claims.items.properties.dates.items.properties).not.toHaveProperty('date');
        expect(schema.properties.entities.items.properties.subjectQuote).toEqual({
          type: 'string', minLength: 1, maxLength: 80,
        });
        for (const field of ['name', 'subjectStart', 'subjectEnd'])
          expect(schema.properties.entities.items.properties).not.toHaveProperty(field);
        return new Response(
          JSON.stringify({
            id: 'offline',
            object: 'chat.completion',
            created: 0,
            model: request.model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: JSON.stringify(output) },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    },
  });
  await expect(
    model
      .withStructuredOutput(readerReviewWireJsonSchema)
      .invoke('Synthetic quote transport.')
  ).resolves.toEqual(output);
  expect(requests).toHaveLength(1);
  expect(requests[0].max_tokens).toBe(1200);
  expect(readerReviewWireSchema.safeParse(output).success).toBe(true);
  const claims = readerReviewWireJsonSchema.properties.claims.items;
  expect(claims.properties.refs.items).toEqual({ $ref: '#/$defs/q' });
  expect(claims.properties.dates.items.properties.ref).toEqual({
    $ref: '#/$defs/q',
  });
  expect(
    readerReviewWireJsonSchema.properties.entities.items.properties.ref.anyOf[0]
  ).toEqual({ $ref: '#/$defs/q' });
  expect(readerReviewWireJsonSchema.$defs.q).toEqual({
    type: 'object',
    properties: {
      source: { type: 'string', maxLength: 3 },
      quote: { type: 'string', minLength: 1, maxLength: 3000 },
    },
    required: ['source', 'quote'],
    additionalProperties: false,
  });
});

test.each(['Russian', 'English', 'Haitian Creole'])(
  'literal anchor instruction and actual wire schema retain 4k rules and 25k aggregate for %s',
  (language) => {
    const { HumanMessage } = require('@langchain/core/messages');
    const { packReaderReview } = require('./helpers/reader-source-review.cjs');
    const sources = Array.from({ length: 8 }, (_, i) => ({
      url: `https://example.org/date-budget/${i}`, title: 'слово'.repeat(100), publishedAt: '2026-10-02',
    }));
    const facts = sources.map(source => ({ sourceUrl: source.url, text: '😀\\"\n'.repeat(1000) }));
    const input = packReaderReview('я'.repeat(5000), sources, facts, language);
    expect(input).not.toBeNull();
    const marker = 'Untrusted reader evidence:\n';
    const rules = input.prompt.slice(0, input.prompt.indexOf(marker) + marker.length);
    const actualBytes = prompt => Buffer.byteLength(JSON.stringify({
      messages: [new HumanMessage(prompt)], schema: readerReviewWireJsonSchema,
    }));
    expect(rules).toContain('dateLiteral copies a full verbatim date');
    expect(rules).toContain('within its claim-cited source quote');
    expect(rules).toContain('no conversion/inferred/requested/current substitutions');
    expect(rules).toContain('full requested name verbatim');
    expect(rules).toContain('included verbatim in its entity source quote');
    expect(actualBytes(rules)).toBeLessThanOrEqual(4000);
    expect(input.inputBytes).toBe(actualBytes(input.prompt));
    expect(input.inputBytes).toBeLessThanOrEqual(25000);
    expect(Buffer.byteLength(JSON.stringify(input.evidence))).toBeLessThanOrEqual(21000);
    expect(readerReviewJsonSchema.properties.claims.items.properties.dates.items.properties.date).toEqual({
      type: 'string', maxLength: 10,
    });
  }
);
