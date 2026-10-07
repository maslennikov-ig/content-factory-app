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

test.each([true, false])('the actual SDK sends the catalogue-specific date schema (dates=%s)', async (hasDate) => {
  const pure = require('./helpers/reader-source-review.cjs');
  const input = pure.prepareReaderReviewV5(pure.packReaderReview('Что известно?',
    [{ url: 'https://example.invalid/article', title: 'Контекст', publishedAt: null }],
    [{ sourceUrl: 'https://example.invalid/article', text: hasDate ? 'Изменение действует с 1 октября 2026.' : 'Изменение описано в источнике.' }],
    'Russian'));
  const schema = pure.readerReviewV5GenerationSchema(input);
  const table = input.catalogue.view.sources[0][5];
  const selected = hasDate ? table.find(row => row[3] === 'd')[0] : table[0][0];
  const output = { version: 'reader-source-review-wire/v5', catalogue: input.catalogue.binding,
    sources: [{ id: 'S1', relevance: 'relevant' }],
    claims: [{ text: 'Изменение описано в источнике.', kind: 'observed', refs: [selected], dates: hasDate ? [{ kind: 'as_of', ref: selected }] : [] }],
    coverage: [{ question: 'Что известно?', status: 'partial' }], entities: [] };
  const calls = [];
  const model = new ChatOpenAI({ apiKey: 'offline-no-secret', model: 'openai/gpt-6-luna', maxTokens: 1200,
    maxRetries: 0, disableStreaming: true,
    configuration: { baseURL: 'https://offline.invalid/v1', fetch: async (url, init) => {
      expect(String(url)).toBe('https://offline.invalid/v1/chat/completions');
      const request = JSON.parse(init.body); calls.push(request);
      expect(request.response_format.json_schema.schema).toEqual(schema);
      const dates = request.response_format.json_schema.schema.properties.claims.items.properties.dates;
      if (hasDate) {
        expect(dates.items.properties.ref).toEqual({ $ref: '#/$defs/d' });
        expect(request.response_format.json_schema.schema.$defs.d.enum).toContain(selected);
      } else expect(dates.maxItems).toBe(0);
      return new Response(JSON.stringify({ id: 'offline', object: 'chat.completion', created: 0, model: request.model,
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(output) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    } } });
  const raw = await model.withStructuredOutput(schema).invoke(input.prompt);
  expect(calls).toHaveLength(1);
  expect(calls[0].max_tokens).toBe(1200);
  expect(JSON.stringify(calls[0].response_format.json_schema.schema)).not.toContain('#/properties/');
  expect(pure.compileReaderReviewV5(input, raw)).not.toBeNull();
});

test.each([true, false])(
  'v6 subject IDs and original date restrictions survive the actual SDK (dates=%s)',
  async (hasDate) => {
    const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
    const pure = require('./helpers/reader-source-review.cjs');
    const current = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/openai/reader-subject-review.ts'
    );
    const input = current.prepareReaderReviewV6(
      pure.packReaderReview(
        'Что известно о Банка России?',
        [
          {
            url: 'https://example.invalid/article',
            title: 'Synthetic context',
            publishedAt: null,
          },
        ],
        [
          {
            sourceUrl: 'https://example.invalid/article',
            text: hasDate
              ? 'Обзор Банка России действует с 1 октября 2026.'
              : 'Обзор Банка России описан в источнике.',
          },
        ],
        'Russian'
      )
    );
    const schema = current.readerReviewV6GenerationSchema(input);
    const row = input.catalogue.view.sources[0];
    const selected = row[5].find((a) =>
      row[4]
        .slice(a[1], a[2] + 1)
        .join('')
        .includes('Банка России')
    )[0];
    const parts = input.catalogue.view.subjectParts.map((part) => {
      const delimiter = part.indexOf(':');
      return [part.slice(0, delimiter), part.slice(delimiter + 1)];
    });
    const output = {
      version: current.READER_REVIEW_WIRE_V6_VERSION,
      catalogue: input.catalogue.binding,
      sources: [{ id: 'S1', relevance: 'relevant' }],
      claims: [
        {
          text: 'Обзор Банка России описан в источнике.',
          kind: hasDate ? 'observed' : 'context',
          refs: [selected],
          dates: hasDate
            ? [
                {
                  kind: 'effective_from',
                  ref: row[5].find((a) => a[3] === 'd')[0],
                },
              ]
            : [],
        },
      ],
      coverage: [{ question: 'Что известно', status: 'partial' }],
      entities: [
        {
          subjectRef: {
            first: parts.find((p) => p[1] === 'Банка')[0],
            last: parts.find((p) => p[1] === 'России')[0],
          },
          status: 'supported_claim',
          ref: selected,
        },
      ],
    };
    const calls = [];
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
          const request = JSON.parse(init.body);
          calls.push(request);
          const actual = request.response_format.json_schema.schema;
          expect(actual).toEqual(schema);
          expect(JSON.stringify(actual)).not.toContain('#/properties/');
          expect(
            actual.properties.entities.items.properties.subjectRef.properties
          ).toEqual({
            first: { $ref: '#/$defs/s' },
            last: { $ref: '#/$defs/s' },
          });
          expect(actual.$defs.s.enum).toEqual(parts.map((p) => p[0]));
          expect(
            actual.properties.entities.items.properties
          ).not.toHaveProperty('subjectQuote');
          return new Response(
            JSON.stringify({
              id: 'offline',
              object: 'chat.completion',
              created: 0,
              model: request.model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: JSON.stringify(output),
                  },
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
    const raw = await model.withStructuredOutput(schema).invoke(input.prompt);
    expect(calls).toHaveLength(1);
    expect(calls[0].max_tokens).toBe(1200);
    const compiled = current.compileReaderReviewV6(input, raw);
    expect(compiled.entities[0].name).toBe('Банка России');
    expect(pure.validateReaderReview(input, compiled)).not.toBeNull();
    expect(input.inputBytes).toBe(
      pure.serializedReaderV5InputBytes(
        input.prompt,
        calls[0].response_format.json_schema.schema
      )
    );
    expect(input.inputBytes).toBeLessThanOrEqual(25000);
  }
);

test('date quote wire v4 reaches the actual SDK with public named definitions and unchanged token limit', async () => {
  const output = {
    version: READER_REVIEW_WIRE_VERSION,
    sources: [{ id: 'S1', relevance: 'relevant' }],
    claims: [
      {
        text: 'Синтетический факт.',
        kind: 'context',
        refs: [{ source: 'S1', quote: '😀 точная цитата' }],
        dates: [{ kind: 'as_of', ref: { source: 'S1', quote: '1 октября 2026' } }],
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
        expect(Object.keys(schema.properties.claims.items.properties.dates.items.properties).sort()).toEqual(['kind', 'ref']);
        expect(schema.properties.claims.items.properties.dates.items.properties).not.toHaveProperty('dateLiteral');
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
  'quote-only date instruction and actual wire schema retain 4k rules and 25k aggregate for %s',
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
    expect(rules).toContain('Each date ref.quote contains exactly one complete civil date');
    expect(rules).toContain('from its claim-cited source');
    expect(rules).toContain('no inferred/requested/current substitutions');
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

describe('scoped reader deadline through the installed SDK and usage transport', () => {
  const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
  const chain = require('@contentfactory/nestjs-libraries/openai/ai.text-chain');
  const pure = require('./helpers/reader-source-review.cjs');
  const classification = {
    scope: 'global',
    subjectLanguage: 'en',
    englishQuery: 'synthetic context',
    subjectLanguageQuery: null,
    freshnessRequired: false,
  };
  const config = {
    usageMode: 'included',
    provider: 'openrouter',
    apiKey: 'offline-no-secret',
    search: {
      enabled: true,
      provider: 'exa',
      apiKeys: { exa: 'offline-search' },
      keySources: { exa: 'system' },
      topic: 'general',
      depth: 'advanced',
    },
  };
  const response = (output) =>
    new Response(
      JSON.stringify({
        id: 'offline',
        object: 'chat.completion',
        created: 0,
        model: 'openai/gpt-6-luna',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(output) },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const setup = ({
    classifierDelay = 0,
    stopAt = 'reader',
    readerFallback = false,
    usageMode = 'included',
    readerOutput,
  } = {}) => {
    const aiConfig = { ...config, usageMode, search: { ...config.search,
      keySources: { exa: usageMode === 'workspace_key' ? 'own' : 'system' } } };
    const calls = [];
    const invokeOptions = [];
    const rows = [];
    const events = [];
    let classifierCalls = 0;
    let readerCalls = 0;
    let searches = 0;
    let fallbackSearches = 0;
    const transport = async (_url, init) => {
      const body = JSON.parse(init.body);
      const reader = body.max_tokens === chain.withReasoningHeadroom(1200);
      const index = reader ? ++readerCalls : ++classifierCalls;
      calls.push({ reader, index, body, signal: init.signal });
      if (!reader && stopAt !== 'classifier') {
        if (classifierDelay)
          await new Promise((resolve) => setTimeout(resolve, classifierDelay));
        return response(classification);
      }
      if (reader && readerFallback && index === 1) {
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        return new Response(
          JSON.stringify({
            error: { code: 503, message: 'offline unavailable' },
          }),
          { status: 503 }
        );
      }
      if (reader && readerOutput) return response(readerOutput);
      return new Promise((_resolve, reject) => {
        const settle = () =>
          setTimeout(() => {
            events.push('transport-settled');
            reject(init.signal.reason);
          }, 5);
        if (init.signal.aborted) settle();
        else init.signal.addEventListener('abort', settle, { once: true });
      });
    };
    const getChatModel = async (_organization, _temperature, maxTokens) => {
      const model = new ChatOpenAI({
        apiKey: 'offline-no-secret',
        model: 'openai/gpt-6-luna',
        maxTokens,
        maxRetries: 0,
        disableStreaming: true,
        timeout: 1_085_000,
        configuration: {
          baseURL: 'https://offline.invalid/v1',
          fetch: chain.createTextChainFetch(
            {
              usageMode,
              provider: 'openrouter',
              textChain: chain.defaultTextChainSettings(),
            },
            transport
          ),
        },
      });
      const structured = model.withStructuredOutput.bind(model);
      model.withStructuredOutput = (...args) => {
        const writer = structured(...args);
        const invoke = writer.invoke.bind(writer);
        writer.invoke = (input, options) => {
          invokeOptions.push(options);
          return invoke(input, options);
        };
        return writer;
      };
      return model;
    };
    const aiUsage = {
      beginAiOperationWithConfig: async () => {
        const ledger = new chain.TextUsageLedger();
        const row = { finishCount: 0 };
        rows.push(row);
        return {
          run: (callback) => chain.runWithUsageLedger(ledger, callback),
          track: (callback) => chain.runWithUsageLedger(ledger, callback),
          finish: async (succeeded) => {
            events.push('usage-finished');
            row.finishCount++;
            row.succeeded = succeeded;
            row.columns = ledger.columns();
          },
        };
      },
    };
    const { WebResearchService } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/openai/web.research.service.ts',
      {
        '@nestjs/common': {
          Injectable: () => (target) => target,
          Optional: () => () => {},
          Inject: () => () => {},
          Logger: class {
            log() {}
            warn() {}
            debug() {}
          },
        },
        '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
          getActiveAiConfig: () => aiConfig,
          loadAiConfig: async () => aiConfig,
          requireActiveAiConfig: async () => aiConfig,
          withActiveAiConfig: (_organization, _config, callback) => callback(),
        },
        '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
          AiUsageService: class {},
        },
        '@contentfactory/nestjs-libraries/openai/ai.text-chain': chain,
        '@contentfactory/nestjs-libraries/openai/reader-source-review': pure,
        '@contentfactory/nestjs-libraries/openai/ai.clients': {
          WEB_SEARCH_PRIMARY_TIMEOUT_MS: 12_000,
          WEB_SEARCH_FALLBACK_TIMEOUT_MS: 8_000,
          WEB_SEARCH_MAX_SOURCE_CHARS: 8000,
          WEB_SEARCH_MAX_RESULT_CHARS: 32000,
          getChatModel,
          getWebSearchClient: async (_organization, provider) => ({
            invoke: async () => {
              searches++;
              if (provider === 'tavily') fallbackSearches++;
              return {
                results: [
                  {
                    url: 'https://example.invalid/context',
                    title: 'Context',
                    content: 'Synthetic context from the source.',
                  },
                ],
              };
            },
          }),
        },
      }
    );
    return {
      service: new WebResearchService(aiUsage),
      rows,
      calls,
      invokeOptions,
      events,
      counts: () => ({
        classifierCalls,
        readerCalls,
        searches,
        fallbackSearches,
      }),
    };
  };

  beforeEach(() =>
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    })
  );
  afterEach(() => jest.useRealTimers());

  test.each(['classifier', 'reader'])(
    'a slow %s settles its transport before the single failed usage finish',
    async (stopAt) => {
      const run = setup({
        stopAt,
        classifierDelay: 40_000,
        readerFallback: true,
      });
      let result;
      let failure;
      const pending = run.service
        .research('offline-organization', `slow ${stopAt}`, {
          readerResponse: true,
          language: 'en',
        })
        .then(
          (value) => {
            result = value;
          },
          (error) => {
            failure = error;
          }
        );
      await jest.advanceTimersByTimeAsync(170_000);
      expect(run.calls.at(-1).signal.aborted).toBe(true);
      expect(run.rows[0].finishCount).toBe(0);
      await jest.advanceTimersByTimeAsync(5);
      await pending;
      expect(failure).toBeUndefined();
      expect(result).toMatchObject({
        summary: '',
        facts: [],
        readerAssessment: { status: 'review_unavailable' },
      });
      expect(run.rows).toHaveLength(1);
      expect(run.rows[0]).toMatchObject({
        finishCount: 1,
        succeeded: false,
        columns: { possiblyBilled: true },
      });
      expect(run.rows[0].columns.costUsd).toBeNull();
      if (stopAt === 'reader') {
        expect(run.rows[0].columns).toMatchObject({ promptTokens: 10, completionTokens: 5 });
        expect(result.sources).toHaveLength(1);
        expect(result.readerAssessment.failureDiagnostic.failure).toBe('timeout');
      }
      expect(run.events.at(-2)).toBe('transport-settled');
      expect(run.events.at(-1)).toBe('usage-finished');
      expect(run.counts()).toEqual(
        stopAt === 'classifier'
          ? {
              classifierCalls: 3,
              readerCalls: 0,
              searches: 0,
              fallbackSearches: 0,
            }
          : {
              classifierCalls: 1,
              readerCalls: 3,
              searches: 1,
              fallbackSearches: 0,
            }
      );
      const signals = run.invokeOptions.map(
        (options) => options.options.signal
      );
      expect(signals.every((signal) => signal === signals[0])).toBe(true);
      expect(signals[0].aborted).toBe(true);
      expect(run.service.cache.size()).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  test('classification cannot dispatch search when its original 20 second window no longer fits', async () => {
    const run = setup({ classifierDelay: 151_000, usageMode: 'workspace_key' });
    let result;
    const pending = run.service
      .research('offline-organization', 'late classifier', {
        readerResponse: true,
        language: 'en',
      })
      .then((value) => {
        result = value;
      });
    await jest.advanceTimersByTimeAsync(151_000);
    expect(result).toBeDefined();
    await pending;
    expect(result.readerAssessment.status).toBe('review_unavailable');
    expect(run.counts().searches).toBe(0);
    expect(run.rows[0]).toMatchObject({ finishCount: 1, succeeded: false });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a fast grounded reader keeps its original two calls and cache hit without leaking a deadline', async () => {
    const current = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/reader-proof-review-v9.ts');
    const input = current.prepareReaderReviewV9(pure.packReaderReview('fast reader',
      [{ url: 'https://example.invalid/context', title: 'Context', publishedAt: null }],
      [{ sourceUrl: 'https://example.invalid/context', text: 'Synthetic context from the source.' }], 'English'));
    const output = { version: current.READER_REVIEW_WIRE_V9_VERSION, catalogue: input.catalogue.binding,
      sources: [{ id: 'S1', relevance: 'relevant' }],
      claims: [{ text: 'Synthetic context from the source.', kind: 'context', refs: [{ source: 'S1', ref: 0 }], dates: [] }],
      coverage: [{ question: 'fast reader', status: 'supported' }], entities: [] };
    const run = setup({ readerOutput: output });
    const result = await run.service.research('offline-organization', 'fast reader', { readerResponse: true, language: 'en' });
    expect(result.readerAssessment.status).toBe('supported');
    expect(result.facts).toEqual([{ text: 'Synthetic context from the source.', sourceUrl: 'https://example.invalid/context' }]);
    expect(run.counts()).toEqual({ classifierCalls: 1, readerCalls: 1, searches: 1, fallbackSearches: 0 });
    expect(run.rows[0]).toMatchObject({ finishCount: 1, succeeded: true, columns: { promptTokens: 20, completionTokens: 10 } });
    expect(run.rows[0].columns).not.toHaveProperty('possiblyBilled');
    expect(run.invokeOptions[0].options.signal).toBe(run.invokeOptions[1].options.signal);
    const cached = await run.service.research('offline-organization', 'fast reader', { readerResponse: true, language: 'en' });
    expect(cached).toEqual({ ...result, fromCache: true });
    expect(run.rows).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
