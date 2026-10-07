'use strict';

// Real complete service and existing metering ports. Provider/model outputs are
// synthetic projections, never a replay or claim about the historical LLM.
const fs = require('node:fs');
const path = require('node:path');
const fixture =
  require('./fixtures/search-reader-recorded5818-neutral.json').cases;
const harnessText = fs.readFileSync(
  path.join(__dirname, 'web.research.source-admission.test.cjs'),
  'utf8'
);
const prefix = harnessText
  .slice(
    0,
    harnessText.indexOf(
      "describe('Russian advertising-labeling reader admission'"
    )
  )
  .replace(
    'let summaryError;',
    'let summaryError; let reviewPhaseError; let reviewTermination;'
  )
  .replace('  modelLedgers: [],', '  modelLedgers: [], warnings: [],')
  .replace('warn() {}', 'warn(message) { calls.warnings.push(message); }')
  .replace(
    'const { WebResearchService } = loadTypeScriptModule(',
    'const { WebResearchService, readerReviewOutputObservation } = loadTypeScriptModule('
  )
  .replace(
    'getWebSearchClient: async (_organizationId, provider) =>',
    'getWebSearchClient: async (_organizationId, provider, options) =>'
  )
  .replace(
    'calls.search.push({ provider, input });',
    'calls.search.push({ provider, input, options });'
  )
  .replace(
    "'@contentfactory/nestjs-libraries/openai/ai.usage.service': {",
    `'@contentfactory/nestjs-libraries/openai/reader-source-review': {
       ...require('./helpers/reader-source-review.cjs'),
       validateReaderReview(input, raw, onReject) {
         if (reviewPhaseError?.phase === 'validation') throw reviewPhaseError.error;
         return require('./helpers/reader-source-review.cjs').validateReaderReview(input, raw, onReject);
       },
     },
     '@contentfactory/nestjs-libraries/openai/ai.usage.service': {`
  )
  .replace(
    'return { withStructuredOutput: () => ({}) };',
    `if (calls.model.length > 1 && reviewPhaseError?.phase === 'model-resolution') throw reviewPhaseError.error;
     return { withStructuredOutput: (schema) => {
       calls.model.at(-1).schema=schema;
       if (calls.model.length > 1 && reviewPhaseError?.phase === 'structured-output') throw reviewPhaseError.error;
       return {};
     } };`
  )
  .replace(
    '            invoke: async (input) => {',
    '            invoke: async (input, config) => {'
  )
  .replace(
    'if (isClassifier) return classification;',
    `if (isClassifier) return classification;
     if (reviewTermination !== undefined) {
       for (const callback of config?.callbacks || []) await callback.handleLLMEnd?.(reviewTermination);
     }
     if (reviewPhaseError?.phase === 'invocation') throw reviewPhaseError.error;`
  );
if (prefix.length < 5000)
  throw new Error('Existing real-service ports not found');
let resetPorts;
const h = new Function(
  'require',
  'beforeEach',
  prefix +
    `
  return {calls, WebResearchService, aiUsage, summaryPrompts, search, outputObservation: readerReviewOutputObservation,
    set(input, answer, output, freshnessRequired=false) {
      classification={scope:'local',subjectLanguage:'ru',englishQuery:'fixture query',subjectLanguageQuery:input.subject,freshnessRequired};
      responses={tavily:{answer,usage:{credits:2},results:input.sources.map(r=>({title:r.title,url:r.url,content:r.excerpt,published_date:r.publishedAt}))}};
      summaryOutput=typeof output === 'function' ? output : request => require('./helpers/reader-source-review.cjs').syntheticReaderV5Fixture(input,output,request);
    }, fail(error) {summaryError=error;},
    searchProvider(provider) {aiConfig.search.provider=provider;aiConfig.search.topic='news';aiConfig.search.apiKeys={[provider]:'fixture-search-key'};responses[provider]=responses.tavily;},
    failPhase(phase, error) {reviewPhaseError={phase,error};},
    endMetadata(payload) {reviewTermination=payload;},
    resetDiagnostics() {reviewPhaseError=undefined;reviewTermination=undefined;}
  };
`
)(require, (callback) => {
  resetPorts = callback;
});
beforeEach(() => {
  resetPorts();
  h.resetDiagnostics();
});
const rejected = (input) => ({
  sources: input.sources.map((_, i) => ({
    id: `S${i + 1}`,
    relevance: 'irrelevant',
  })),
  claims: [],
  coverage: [{ question: input.subject, status: 'unsupported' }],
  entities: [],
});
const evidence = () => {
  const input = h.summaryPrompts()[0].input;
  return input.evidence
    ? JSON.parse(input.evidence)
    : require('./helpers/reader-source-review.cjs').syntheticReaderModelEvidence(
        input.reviewRequest
      );
};

test('recorded off-topic 1C candidates never become takeable relevant facts', async () => {
  h.set(fixture['1c'], fixture['1c'].summary, rejected(fixture['1c']));
  const out = await h.search(fixture['1c'].subject);
  expect(out.facts).toHaveLength(0);
  expect(out.readerAssessment.status).toBe('insufficient_evidence');
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.rows).toHaveLength(1);
});

test('a complete Russian provider answer buys exactly one combined reader review', async () => {
  h.set(fixture.rate, fixture.rate.summary, rejected(fixture.rate));
  const out = await h.search(fixture.rate.subject);
  expect(h.summaryPrompts()).toHaveLength(1);
  expect(h.calls.model).toHaveLength(2);
  expect(out.summary).toBe('');
  expect(out.facts).toHaveLength(0);
});

test('the recorded VTB tail beyond1000 is actually presented and receipt-bound', async () => {
  h.set(fixture.rate, '', rejected(fixture.rate));
  const out = await h.search(fixture.rate.subject);
  const source = evidence().sources.find((r) => r.id === 'S2');
  expect(source.excerpt.indexOf('ВТБ')).toBe(1386);
  expect(source.excerpt.indexOf('ВТБ', 1387)).toBe(1461);
  expect(
    out.readerAssessment.evidence.find((r) => r.id === source.id).excerpt
  ).toBe(source.excerpt);
  expect(source.excerpt.length).toBeLessThanOrEqual(3000);
});

const pure = require('./helpers/reader-source-review.cjs');
const {
  ChatPromptTemplate: RealPromptTemplate,
} = require('@langchain/core/prompts');
const actualInputBytes = async (
  prompt,
  schema = pure.readerReviewWireJsonSchema
) =>
  Buffer.byteLength(
    JSON.stringify({
      messages: await RealPromptTemplate.fromTemplate(
        '{reviewRequest}'
      ).formatMessages({ reviewRequest: prompt }),
      schema,
    })
  );
const subject =
  'По состоянию на 1 октября 2026 года: укажи действующую версию и прогноз.';
const article =
  'Версия 2 действовала по состоянию на 1 октября 2026 года. Решение действует с 11 сентября 2026 года. Компания объявила прогноз 30 сентября 2026 года на 23 октября 2026 года. Следующая версия действует с 2 октября 2026 года.';
const sample = (text = article, request = subject) => ({
  subject: request,
  sources: [
    {
      url: 'https://example.org/version-history.pdf',
      title: 'История версии',
      publishedAt: '2026-10-02',
      excerpt: text,
    },
  ],
});
const pack = (input = sample()) =>
  pure.packReaderReview(
    input.subject,
    input.sources,
    input.sources.map((s) => ({ sourceUrl: s.url, text: s.excerpt })),
    'Russian'
  );
const ref = (text, phrase) => ({
  source: 'S1',
  start: text.indexOf(phrase),
  end: text.indexOf(phrase) + phrase.length,
});
const claim = (
  text = article,
  kind = 'observed',
  dates = [
    { kind: 'as_of', date: '2026-10-01', ref: ref(text, '1 октября 2026') },
  ]
) => ({
  text: 'Версия 2 действовала на указанную дату.',
  kind,
  refs: [{ source: 'S1', start: 0, end: text.length }],
  dates,
});
const review = (input, claims = [claim(input.sources[0].excerpt)]) => ({
  sources: [{ id: 'S1', relevance: 'relevant' }],
  claims,
  coverage: [{ question: input.subject, status: 'supported' }],
  entities: [],
});

test.each([false, true])(
  'current v10 real-service reader preserves one paid admission and no retry when entity source invalid=%s',
  async (invalid) => {
    const request = '😀 По состоянию на 1 октября 2026 года: версия Альфа?';
    const text =
      '😀 Альфа версия 2 действует по состоянию на 1 октября 2026 года. ' +
      Array.from({ length: 50 }, (_, i) => `Иная часть статьи ${i}. `).join('');
    const input = sample(text, request);
    input.sources.push({ ...input.sources[0], url: 'https://example.org/unrelated-entity', excerpt: 'На 1 октября 2026 действует иной синтетический документ без запрошенного имени.' });
    const output = review(input);
    output.sources.push({ id: 'S2', relevance: 'relevant' });
    output.claims[0].text = 'Альфа версия 2 действовала на указанную дату.';
    output.entities = [
      {
        name: 'Альфа',
        subjectStart: request.indexOf('Альфа'),
        subjectEnd: request.indexOf('Альфа') + 5,
        status: 'supported_claim',
        ref: ref(text, 'Альфа'),
      },
    ];
    const wire = pure.syntheticReaderDateQuoteWire(
      pure.syntheticReaderWire(input, output)
    );
    h.set(input, 'Не использовать ответ провайдера.', (request) => {
      const current = pure.syntheticReaderV5Fixture(input, wire, request);
      if (invalid) current.entities[0].proof = 591359;
      return current;
    });
    const result = await h.search(request);
    expect(h.calls.search).toHaveLength(1);
    expect(h.calls.model).toHaveLength(2);
    expect(h.calls.rows).toHaveLength(1);
    expect(h.calls.rows[0].succeeded).toBe(true);
    expect(h.calls.model[1].schema.properties.version.const).toBe(
      'reader-source-review-wire/v10'
    );
    if (invalid) {
      expect(result.facts).toHaveLength(0);
      expect(result.summary).toBe('');
      expect(result.readerAssessment.failureDiagnostic).toMatchObject({
        stage: 'compile_wire_v10',
        predicate: 'catalogue_unknown_id',
        failure: 'validation_rejected',
      });
    } else {
      expect(result.facts).toHaveLength(1);
      expect(result.readerAssessment.version).toBe('reader-source-review/v1');
      expect(result.readerAssessment.status).toBe('supported');
      expect(result.readerAssessment.entities[0]).toMatchObject({
        name: 'Альфа',
        subjectStart: request.indexOf('Альфа'),
        subjectEnd: request.indexOf('Альфа') + 5,
      });
      expect(result.readerAssessment.claims[0].dates[0].date).toBe(
        '2026-10-01'
      );
    }
  }
);

test.each(['tavily', 'exa'])(
  'historical as-of reader bypasses rolling news retrieval for %s',
  async (provider) => {
    const input = sample();
    h.set(input, 'Непроверенная сводка.', review(input), true);
    h.searchProvider(provider);
    const out = await h.search(input.subject, {
      language: 'ru',
      readerResponse: true,
      windowDays: 30,
    });
    expect(h.calls.search).toHaveLength(1);
    expect(h.calls.search[0]).toMatchObject({
      provider,
      options: { topic: 'general', freshnessRequired: false },
    });
    expect(h.calls.search[0].options).not.toHaveProperty('windowDays');
    expect(out.facts).toHaveLength(1);
    expect(out.sources[0].publishedAt).toBe('2026-10-02');
    expect(out.readerAssessment.requestedDate).toBe('2026-10-01');
    expect(evidence().subject).toBe(input.subject);
    expect(h.calls.rows).toHaveLength(1);
    expect(h.calls.model).toHaveLength(2);
  }
);

test('retrieval reuses the existing strict civil-date parser', () => {
  expect(pure.requestedDate(subject)).toEqual({
    date: '2026-10-01',
    ambiguous: false,
  });
  expect(
    pure.requestedDate('Which version was current as at October 1, 2026?')
  ).toEqual({ date: '2026-10-01', ambiguous: false });
  expect(pure.requestedDate('Latest current version')).toEqual({
    date: null,
    ambiguous: false,
  });
  expect(
    pure.requestedDate('Current version on 2026-10-01T14Z?').ambiguous
  ).toBe(true);
});

test('later publication remains eligible for a supported fact effective at the requested date', async () => {
  const input = sample();
  h.set(input, 'Непроверенный ответ движка.', review(input));
  const out = await h.search(input.subject);
  expect(out.facts).toHaveLength(1);
  expect(out.readerAssessment.requestedDate).toBe('2026-10-01');
  expect(out.readerAssessment.claims[0].dates[0].date).toBe('2026-10-01');
  expect(out.sources[0].publishedAt).toBe('2026-10-02');
  expect(h.calls.model[1].maxTokens).toBe(1200);
  const modelInputBytes = await actualInputBytes(
    h.summaryPrompts()[0].input.reviewRequest,
    h.calls.model[1].schema
  );
  expect(modelInputBytes).toBe(out.readerAssessment.inputBytes);
  expect(modelInputBytes).toBeLessThanOrEqual(25000);
});

test.each([
  [
    'future effective date',
    'observed',
    [
      {
        kind: 'effective_from',
        date: '2026-10-02',
        ref: ref(article, '2 октября 2026'),
      },
    ],
  ],
  ['unknown fact date', 'observed', []],
  [
    'forecast first announced later',
    'forecast',
    [
      {
        kind: 'announced',
        date: '2026-10-02',
        ref: ref(article, '2 октября 2026'),
      },
      {
        kind: 'target',
        date: '2026-10-23',
        ref: ref(article, '23 октября 2026'),
      },
    ],
  ],
  ['undated forecast', 'forecast', []],
])(
  '%s cannot become a current dated claim/card',
  async (_label, kind, dates) => {
    const input = sample();
    h.set(
      input,
      'Не возвращать этот сырой ответ.',
      review(input, [claim(article, kind, dates)])
    );
    const out = await h.search(input.subject);
    expect(out.facts).toEqual([]);
    expect(out.summary).toBe('');
    expect(out.readerAssessment.status).toBe('insufficient_evidence');
    expect(out.readerAssessment.coverage[0].status).toBe('unsupported');
    expect(h.calls.search).toHaveLength(1);
  }
);

test('forecast announced by the requested date keeps target/attribution distinct from observed facts', () => {
  const input = sample();
  const forecast = claim(article, 'forecast', [
    {
      kind: 'announced',
      date: '2026-09-30',
      ref: ref(article, '30 сентября 2026'),
    },
    {
      kind: 'target',
      date: '2026-10-23',
      ref: ref(article, '23 октября 2026'),
    },
  ]);
  forecast.text =
    'Компания прогнозировала следующую версию на 23 октября 2026 года.';
  const out = pure.validateReaderReview(pack(input), review(input, [forecast]));
  expect(out.assessment.claims[0].kind).toBe('forecast');
  expect(out.assessment.claims[0].dates.map((d) => d.date)).toEqual([
    '2026-09-30',
    '2026-10-23',
  ]);
});

test('mixed article is filtered by claim rather than publication or whole page', () => {
  const input = sample();
  const future = claim(article, 'observed', [
    {
      kind: 'effective_from',
      date: '2026-10-02',
      ref: ref(article, '2 октября 2026'),
    },
  ]);
  future.text = 'Следующая версия уже действует.';
  const out = pure.validateReaderReview(
    pack(input),
    review(input, [claim(), future])
  );
  expect(out.assessment.claims).toHaveLength(1);
  expect(out.assessment.status).toBe('partial');
  expect(out.summary).not.toContain('Следующая');
});

test.each([
  [
    'foreign source',
    (r) => {
      r.claims[0].refs[0].source = 'S9';
    },
  ],
  [
    'span outside presented evidence',
    (r) => {
      r.claims[0].refs[0].end = 100000;
    },
  ],
  [
    'wrong date evidence',
    (r) => {
      r.claims[0].dates[0].date = '2026-10-02';
    },
  ],
  [
    'untyped extra hash',
    (r) => {
      r.claims[0].refs[0].excerptSha256 = 'fabricated';
    },
  ],
  [
    'duplicate source verdict',
    (r) => {
      r.sources.push(r.sources[0]);
    },
  ],
])(
  '%s fails closed without a second review or provider retry',
  async (_label, mutate) => {
    const input = sample(),
      output = review(input);
    mutate(output);
    h.set(input, 'Не возвращать запасной ответ.', output);
    const out = await h.search(input.subject);
    expect(out.readerAssessment.status).toBe('review_unavailable');
    expect(out.summary).toBe('');
    expect(out.facts).toEqual([]);
    expect(h.summaryPrompts()).toHaveLength(1);
    expect(h.calls.search).toHaveLength(1);
    expect(h.calls.rows).toHaveLength(1);
  }
);

test.each([
  undefined,
  { claims: [] },
  { sources: [], claims: [], coverage: [], entities: [] },
])(
  'malformed/incomplete output keeps no unreviewed fallback',
  async (output) => {
    h.set(sample(), 'Не возвращать запасной ответ.', output);
    const out = await h.search(subject);
    expect(out.readerAssessment.status).toBe('review_unavailable');
    expect(out.summary).toBe('');
    expect(h.calls.model).toHaveLength(2);
  }
);

test('transport failure preserves completed search and both accounted attempts without retry', async () => {
  h.set(sample(), 'Не возвращать запасной ответ.', review(sample()));
  h.fail(new Error('Synthetic reader transport failure'));
  const out = await h.search(subject);
  expect(out.readerAssessment.status).toBe('review_unavailable');
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.rows).toHaveLength(1);
  expect(h.calls.rows[0].columns.promptTokens).toBe(200);
  expect(h.calls.rows[0].columns.costUsd).toBeCloseTo(0.0003);
});

const diagnostic = () => {
  expect(h.calls.warnings).toHaveLength(1);
  const prefix = 'Web research reader review unavailable. ';
  expect(h.calls.warnings[0].startsWith(prefix)).toBe(true);
  return JSON.parse(h.calls.warnings[0].slice(prefix.length));
};
const sensitiveReaderError = (
  name,
  status,
  error = new Error('SENSITIVE_READER_MESSAGE')
) => {
  const touched = [];
  error.name = name;
  if (status !== undefined) error.status = status;
  for (const field of [
    'message',
    'stack',
    'cause',
    'request',
    'response',
    'body',
    'error',
    'param',
  ]) {
    Object.defineProperty(error, field, {
      get() {
        touched.push(field);
        throw new Error('SENSITIVE_READER_PROPERTY_ACCESSED');
      },
    });
  }
  return { error, touched };
};

test.each([
  [
    'model-resolution',
    'AiUsageContextRequired',
    undefined,
    'usage_context_required',
  ],
  ['structured-output', 'SENSITIVE_READER_CLASS', undefined, 'unknown'],
  ['invocation', 'APIError', 400, 'provider_rejected'],
  ['validation', 'SyntaxError', undefined, 'json_parse'],
])(
  'reader %s exception logs only fixed diagnostics without sensitive fields',
  async (phase, name, status, failure) => {
    const input = sample();
    h.set(input, 'Не возвращать запасной ответ.', review(input));
    const { error, touched } = sensitiveReaderError(name, status);
    h.failPhase(phase, error);
    const out = await h.search(input.subject);
    expect(out.readerAssessment.status).toBe('review_unavailable');
    expect(out.summary).toBe('');
    expect(out.facts).toEqual([]);
    expect(diagnostic()).toEqual({
      phase,
      failure,
      termination: 'unobserved',
      providerCode: 'unobserved',
    });
    expect(touched).toEqual([]);
    expect(JSON.stringify(h.calls.warnings)).not.toContain('SENSITIVE_READER');
    expect(h.calls.search).toHaveLength(1);
    expect(h.calls.model).toHaveLength(2);
    expect(h.calls.model[1]).toMatchObject({
      role: 'classify',
      maxTokens: 1200,
    });
    expect(h.calls.rows).toHaveLength(1);
    expect(h.calls.rows[0].succeeded).toBe(true);
  }
);

test.each([
  [{}, 'unknown'],
  [
    {
      generations: [
        [{ generationInfo: { finish_reason: 'SENSITIVE_READER_TERMINATION' } }],
      ],
    },
    'unknown',
  ],
  [
    { generations: [[{ generationInfo: { finish_reason: 'length' } }]] },
    'length',
  ],
])(
  'reader token termination is bounded and missing generations are safe: %j',
  async (metadata, termination) => {
    h.set(sample(), 'Не возвращать запасной ответ.', review(sample()));
    h.endMetadata(metadata);
    const { error, touched } = sensitiveReaderError('OutputParserException');
    h.fail(error);
    const out = await h.search(subject);
    expect(out.readerAssessment.status).toBe('review_unavailable');
    expect(diagnostic()).toEqual({
      phase: 'invocation',
      failure: 'output_parse',
      termination,
      providerCode: 'unobserved',
    });
    expect(touched).toEqual([]);
    expect(JSON.stringify(h.calls.warnings)).not.toContain('SENSITIVE_READER');
    expect(h.calls.model).toHaveLength(2);
    expect(h.calls.search).toHaveLength(1);
  }
);

test('own reader failure distinguishes wire-schema rejection from v1 coverage rejection', async () => {
  const input = sample();
  const badQuote = review(input);
  badQuote.claims[0].refs[0].source = 'S9';
  h.set(input, 'Не возвращать запасной ответ.', (request) => {
    const wire = currentWireFromRequest(request);
    wire.claims[0].refs = [];
    return wire;
  });
  const compiler = await h.search(input.subject);
  expect(compiler.readerAssessment.failureDiagnostic).toMatchObject({
    stage: 'compile_wire_v10',
    predicate: 'wire_schema',
    failure: 'validation_rejected',
    wireIssueFamily: 'refs',
    wireIssueCode: 'too_small',
  });
  expect(compiler.summary).toBe('');
  expect(compiler.facts).toEqual([]);
  expect(diagnostic().phase).toBe('validation');
  h.resetDiagnostics();
  const badCoverage = review(input);
  badCoverage.coverage[0].question = 'SYNTHETIC_NOT_IN_SUBJECT';
  h.set(input, 'Не возвращать запасной ответ.', badCoverage);
  const validator = await h.search(input.subject + ' ');
  expect(validator.readerAssessment.failureDiagnostic).toMatchObject({
    stage: 'validate_api_v1',
    predicate: 'v1_coverage_subject',
    failure: 'validation_rejected',
  });
});

test('own reader failure exposes only safe parser class and observed UTF8 byte counts', async () => {
  const input = sample();
  h.set(input, 'Не возвращать запасной ответ.', review(input));
  const content = 'НЕ_ЭКСПОРТИРОВАТЬ🙂';
  const argumentsText = '{"нейтрально":"🙂"}';
  h.endMetadata({
    generations: [
      [
        {
          generationInfo: { finish_reason: 'stop' },
          message: {
            content,
            additional_kwargs: {
              tool_calls: [{ function: { arguments: argumentsText } }],
            },
          },
        },
      ],
    ],
  });
  h.failPhase('invocation', new SyntaxError('НЕ_ЭКСПОРТИРОВАТЬ_ОШИБКУ'));
  const out = await h.search(input.subject);
  expect(out.readerAssessment.failureDiagnostic).toEqual({
    stage: 'invocation',
    predicate: 'unobserved',
    failure: 'json_parse',
    termination: 'stop',
    providerCode: 'unobserved',
    contentUtf8Bytes: Buffer.byteLength(content),
    toolArgumentsUtf8Bytes: Buffer.byteLength(argumentsText),
  });
  expect(JSON.stringify(out.readerAssessment.failureDiagnostic)).not.toContain(
    'НЕ_ЭКСПОРТИРОВАТЬ'
  );
  expect(out.summary).toBe('');
  expect(out.facts).toEqual([]);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.rows).toHaveLength(1);
  expect(h.calls.rows[0].succeeded).toBe(true);
  expect(h.calls.search).toHaveLength(1);
});

test.each([
  ['entity_ref_missing', (output) => { output.entities[0].ref = null; }],
  ['entity_claim_missing', (output) => { output.claims = []; }],
  ['entity_name_missing', (output) => { output.claims[0].text = 'Ставка равна 14%.'; }],
  ['entity_source_mismatch', (output) => { output.entities[0].ref.source = 'S2'; }],
])('unchanged v1 entity grounding subreason %s survives safe projection', (reason, mutate) => {
  const text = 'Банк Альфа установил ставку 14%.';
  const input = sample(text, 'Банк Альфа: ставка?');
  input.sources.push({ ...input.sources[0], url: 'https://example.org/other' });
  const output = review(input, [{text, kind:'context', refs:[ref(text,text)], dates:[]}]);
  output.sources.push({id:'S2',relevance:'relevant'});
  output.entities=[{name:'Банк Альфа',subjectStart:0,subjectEnd:10,status:'supported_claim',ref:ref(text,'Банк Альфа')}];
  mutate(output); const seen=[];
  expect(pure.validateReaderReview(pack(input),output,(...args)=>seen.push(args))).toBeNull();
  expect(seen).toEqual([['v1_entity_supported_claim',undefined,undefined,reason]]);
  const assessment=pure.unavailableReaderReview(pack(input));assessment.status='review_unavailable';
  assessment.failureDiagnostic={stage:'validate_api_v1',predicate:seen[0][0],failure:'validation_rejected',groundingReason:seen[0][3],termination:null,providerCode:'unobserved',contentUtf8Bytes:null,toolArgumentsUtf8Bytes:null};
  expect(pure.projectReaderAssessment(assessment).failureDiagnostic).toEqual(assessment.failureDiagnostic);
  expect(JSON.stringify(assessment.failureDiagnostic)).not.toContain('Альфа');
});

test.each(['missing-claim','missing-name','different-source'])(
  'current candidate qualification %s keeps grounded context with one reader and no retry',async(kind)=>{
    const text='Банк Альфа установил ставку 14%.', input=sample(text,'Банк Альфа: ставка?');
    input.sources.push({...input.sources[0],url:'https://example.org/other'});
    const output=review(input,[{text,kind:'context',refs:[ref(text,text)],dates:[]}]);
    output.sources.push({id:'S2',relevance:'relevant'});
    output.entities=[{name:'Банк Альфа',subjectStart:0,subjectEnd:10,status:'supported_claim',ref:ref(text,'Банк Альфа')}];
    if(kind==='missing-claim') output.claims=[];
    if(kind==='missing-name') output.claims[0].text='Ставка равна 14%.';
    if(kind==='different-source') output.entities[0].ref.source='S2';
    h.set(input,'Не использовать непроверенный ответ.',output);
    const result=await h.search(input.subject);
    expect(result.readerAssessment.status).not.toBe('review_unavailable');
    expect(result.readerAssessment.entities[0].status).toBe('contextual_mention');
    expect(result.summary).toContain('Банк Альфа: упоминание в контексте источника');
    expect(result.readerAssessment.failureDiagnostic).toBeUndefined();
    expect(h.calls.search).toHaveLength(1);expect(h.calls.model).toHaveLength(2);
    expect(h.calls.rows).toHaveLength(1);expect(h.calls.rows[0].succeeded).toBe(true);
});

test('source-local date0 stays with its claim source in the real service without another request', async () => {
  const input = sample();
  input.sources.push({ ...input.sources[0], url: 'https://example.org/other', excerpt: input.sources[0].excerpt.replaceAll('1 октября', '2 октября') });
  const output = review(input);
  output.sources.push({ id: 'S2', relevance: 'relevant' });
  h.set(input, 'Не использовать непроверенный ответ.', (request) => {
    const raw = pure.syntheticReaderV5Fixture(input, output, request);
    const view = JSON.parse(request.split('Untrusted reader evidence:\n')[1]);
    const otherDate = view.sources[1][5].find(a => a.split(':')[2] === '0');
    expect(otherDate).toBeDefined();
    raw.claims[0].dates[4].ref = +otherDate.split(':')[2];
    return raw;
  });
  const result = await h.search(input.subject);
  expect(result.readerAssessment.status).toBe('supported');
  expect(result.readerAssessment.claims[0].dates[0]).toMatchObject({ date: '2026-10-01', ref: { source: 'S1' } });
  expect(result.summary).not.toBe('');
  expect(result.facts).toHaveLength(1);
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.rows).toHaveLength(1);
  expect(h.calls.rows[0].succeeded).toBe(true);
});

test.each([
  ['date_missing', 'compile_wire_v5', 'date_quote_grounding'],
  ['date_ambiguous', 'compile_wire_v4', 'date_quote_grounding'],
  ['date_source_mismatch', 'compile_wire_v5', 'date_quote_grounding'],
  ['date_token_boundary', 'compile_wire_v4', 'date_quote_grounding'],
  ['entity_ref_missing', 'validate_api_v1', 'v1_entity_supported_claim'],
  ['entity_claim_missing', 'validate_api_v1', 'v1_entity_supported_claim'],
  ['entity_name_missing', 'validate_api_v1', 'v1_entity_supported_claim'],
  ['entity_source_mismatch', 'validate_api_v1', 'v1_entity_supported_claim'],
])('grounding subreason %s is allowlisted only at its own validation boundary', (reason, stage, predicate) => {
  const out = pure.unavailableReaderReview(pack());
  out.status = 'review_unavailable';
  const failure = {
    stage, predicate, failure: 'validation_rejected', groundingReason: reason,
    termination: null, providerCode: 'unobserved', contentUtf8Bytes: null,
    toolArgumentsUtf8Bytes: null,
  };
  out.failureDiagnostic = failure;
  expect(pure.projectReaderAssessment(out).failureDiagnostic).toEqual(failure);
  for (const patch of [
    { groundingReason: 'SYNTHETIC_PRIVATE' }, { groundingReason: null },
    { groundingReason: 0 }, { failure: 'provider_failure' },
    { stage: 'invocation' }, { predicate: 'wire_schema' },
    { groundingReason: reason.startsWith('date_') ? 'entity_ref_missing' : 'date_missing' },
    { raw: 'SYNTHETIC_PRIVATE' },
  ]) {
    out.failureDiagnostic = { ...failure, ...patch };
    expect(pure.projectReaderAssessment(out).failureDiagnostic).toBeUndefined();
  }
  let touched = false;
  out.failureDiagnostic = { ...failure };
  Object.defineProperty(out.failureDiagnostic, 'groundingReason', {
    enumerable: true,
    get() { touched = true; throw Error('SYNTHETIC_PRIVATE_GETTER'); },
  });
  expect(pure.projectReaderAssessment(out).failureDiagnostic).toBeUndefined();
  expect(touched).toBe(false);
});

test('reader reject observer reports first nested source gate without changing compiler outcome', () => {
  const input = pack();
  const raw = pure.syntheticReaderWire(input.evidence, review(sample()));
  raw.claims[0].refs[0].source = 'S9';
  const seen = [];
  expect(pure.compileReaderReview(input, raw, (code) => seen.push(code))).toBe(
    null
  );
  expect(seen[0]).toBe('quote_source');
  expect(
    pure.compileReaderReview(input, raw, () => {
      throw Error('SYNTHETIC_OBSERVER_ERROR');
    })
  ).toBe(null);
});

test.each([
  ['claim', 'absent', 'SYNTHETIC_PRIVATE_QUOTE'],
  ['claim', 'repeated', 'Альфа версия 2'],
  ['claim', 'repeated', 'aa'],
  ['date', 'absent', '2 октября 2026'],
  ['date', 'repeated', '1 октября 2026'],
  ['entity', 'absent', 'SYNTHETIC_PRIVATE_ENTITY'],
  ['entity', 'repeated', 'Альфа'],
])(
  'quote match observer classifies %s/%s without exposing a reference',
  (kind, quoteMatch, quote) => {
    const source =
      'Альфа версия 2. Альфа версия 2. aaa. 1 октября 2026. 1 октября 2026.';
    const input = pack(sample(source, 'Что известно об Альфа?'));
    const wire = pure.syntheticReaderDateQuoteWire(
      pure.syntheticReaderWire(
        input.evidence,
        review(sample(source), [claim(source, 'context', [])])
      )
    );
    const reference = { source: 'S1', quote };
    if (kind === 'claim') wire.claims[0].refs = [reference];
    else if (kind === 'date')
      wire.claims[0].dates = [{ kind: 'as_of', ref: reference }];
    else
      wire.entities = [
        { subjectQuote: 'Альфа', status: 'contextual_mention', ref: reference },
      ];
    const original = structuredClone(wire),
      seen = [];
    expect(
      pure.compileReaderReview(input, wire, (predicate, issue, match) =>
        seen.push({ predicate, issue, quoteMatch: match })
      )
    ).toBeNull();
    expect(seen).toEqual([
      { predicate: 'quote_unique_match', issue: undefined, quoteMatch },
    ]);
    expect(wire).toEqual(original);
    expect(JSON.stringify(seen)).not.toMatch(
      /SYNTHETIC_PRIVATE|S1|Альфа|октября/
    );
    let calls = 0;
    expect(
      pure.compileReaderReview(input, wire, () => {
        calls++;
        throw Error('SYNTHETIC_PRIVATE_OBSERVER');
      })
    ).toBeNull();
    expect(calls).toBe(1);
  }
);

test.each(['absent', 'repeated'])(
  'current service rejects legacy free quote=%s wholly without retry; legacy observer remains pure',
  async (quoteMatch) => {
    const input = sample(article + ' Повторная дата: 1 октября 2026.');
    const wire = pure.syntheticReaderDateQuoteWire(
      pure.syntheticReaderWire(input, review(input))
    );
    wire.claims[0].refs[0].quote =
      quoteMatch === 'absent' ? 'SYNTHETIC_PRIVATE_QUOTE' : '1 октября 2026';
    h.set(input, 'Не возвращать запасной ответ.', wire);
    h.endMetadata({
      generations: [
        [
          {
            generationInfo: { finish_reason: 'stop' },
            message: { content: 'SYNTHETIC_PRIVATE_MODEL_OUTPUT' },
          },
        ],
      ],
    });
    const result = await h.search(input.subject);
    const diagnostic = result.readerAssessment.failureDiagnostic;
    expect(diagnostic).toMatchObject({
      stage: 'compile_wire_v10',
      predicate: 'wire_schema',
    });
    expect(diagnostic).not.toHaveProperty('quoteMatch');
    expect(
      pure.projectReaderAssessment(result.readerAssessment).failureDiagnostic
    ).toEqual(diagnostic);
    expect(result.readerAssessment.status).toBe('review_unavailable');
    expect(result.summary).toBe('');
    expect(result.facts).toEqual([]);
    expect(h.calls.model).toHaveLength(2);
    expect(h.calls.search).toHaveLength(1);
    expect(h.calls.rows).toHaveLength(1);
    expect(h.calls.rows[0].succeeded).toBe(true);
    expect(JSON.stringify(diagnostic)).not.toMatch(
      /SYNTHETIC_PRIVATE|S1|октября/
    );
    expect(JSON.stringify(h.calls.warnings)).not.toContain('SYNTHETIC_PRIVATE');
  }
);

test.each(['compile_wire_v2', 'compile_wire_v3', 'compile_wire_v4'])(
  'quoteMatch public projection permits only its matching rejection stage %s',
  (stage) => {
    const out = pure.unavailableReaderReview(pack());
    out.status = 'review_unavailable';
    const failure = {
      stage,
      predicate: 'quote_unique_match',
      failure: 'validation_rejected',
      termination: null,
      providerCode: 'unobserved',
      contentUtf8Bytes: null,
      toolArgumentsUtf8Bytes: null,
      quoteMatch: 'absent',
    };
    for (const quoteMatch of ['absent', 'repeated']) {
      out.failureDiagnostic = { ...failure, quoteMatch };
      expect(pure.projectReaderAssessment(out).failureDiagnostic).toEqual(
        out.failureDiagnostic
      );
    }
    for (const patch of [
      { quoteMatch: 'SYNTHETIC_PRIVATE' },
      { quoteMatch: 'unique' },
      { quoteMatch: null },
      { quoteMatch: 0 },
      { stage: 'validate_api_v1' },
      { predicate: 'wire_schema' },
      { failure: 'provider_failure' },
      { rawQuote: 'SYNTHETIC_PRIVATE' },
      { source: 'S1' },
    ]) {
      out.failureDiagnostic = { ...failure, ...patch };
      expect(
        pure.projectReaderAssessment(out).failureDiagnostic
      ).toBeUndefined();
    }
    let touched = false;
    out.failureDiagnostic = { ...failure };
    Object.defineProperty(out.failureDiagnostic, 'quoteMatch', {
      enumerable: true,
      get() {
        touched = true;
        throw Error('SYNTHETIC_PRIVATE_GETTER');
      },
    });
    expect(pure.projectReaderAssessment(out).failureDiagnostic).toBeUndefined();
    expect(touched).toBe(false);
  }
);

test('wire issue diagnostics expose only first fixed field family and Zod code', () => {
  const input = pack();
  const wire = pure.syntheticReaderWire(input.evidence, review(sample()));
  wire.claims[0].refs[0].quote = '';
  const seen = [];
  expect(
    pure.compileReaderReview(input, wire, (predicate, issue) =>
      seen.push({ predicate, issue })
    )
  ).toBe(null);
  expect(seen).toEqual([
    { predicate: 'wire_schema', issue: { family: 'refs', code: 'too_small' } },
  ]);
  expect(JSON.stringify(seen)).not.toContain('quote');
});

test.each([
  [
    'version',
    'invalid_literal',
    (wire) => {
      wire.version = 'SYNTHETIC_PRIVATE';
    },
  ],
  [
    'sources',
    'invalid_enum_value',
    (wire) => {
      wire.sources[0].relevance = 'SYNTHETIC_PRIVATE';
    },
  ],
  [
    'claims',
    'invalid_enum_value',
    (wire) => {
      wire.claims[0].kind = 'SYNTHETIC_PRIVATE';
    },
  ],
  [
    'dates',
    'invalid_string',
    (wire) => {
      wire.claims[0].dates = [
        { kind: 'as_of', date: 'bad', ref: wire.claims[0].refs[0] },
      ];
    },
  ],
  [
    'coverage',
    'invalid_enum_value',
    (wire) => {
      wire.coverage[0].status = 'SYNTHETIC_PRIVATE';
    },
  ],
  [
    'entities',
    'invalid_type',
    (wire) => {
      wire.entities = [
        {
          name: 1,
          subjectStart: 0,
          subjectEnd: 1,
          status: 'unknown_due_to_bounds',
          ref: null,
        },
      ];
    },
  ],
  [
    'root',
    'unrecognized_keys',
    (wire) => {
      wire.SYNTHETIC_PRIVATE = 'SYNTHETIC_PRIVATE';
    },
  ],
])(
  'wire issue family %s never exports messages, paths or rejected values',
  (family, code, mutate) => {
    const input = pack();
    const wire = pure.syntheticReaderWire(input.evidence, review(sample()));
    mutate(wire);
    const seen = [];
    expect(
      pure.compileReaderReview(input, wire, (predicate, issue) =>
        seen.push({ predicate, issue })
      )
    ).toBe(null);
    expect(seen).toEqual([
      { predicate: 'wire_schema', issue: { family, code } },
    ]);
    expect(JSON.stringify(seen)).not.toContain('SYNTHETIC_PRIVATE');
  }
);

test('wire issue diagnostics project both optional fixed scalars only at the wire-schema failure', () => {
  const unavailable = pure.unavailableReaderReview(pack());
  unavailable.status = 'review_unavailable';
  const failure = {
    stage: 'compile_wire_v2',
    predicate: 'wire_schema',
    failure: 'validation_rejected',
    termination: null,
    providerCode: 'unobserved',
    contentUtf8Bytes: null,
    toolArgumentsUtf8Bytes: null,
    wireIssueFamily: 'refs',
    wireIssueCode: 'too_small',
  };
  unavailable.failureDiagnostic = failure;
  expect(pure.projectReaderAssessment(unavailable).failureDiagnostic).toEqual(
    failure
  );
  for (const patch of [
    { wireIssueFamily: 'SYNTHETIC_PRIVATE' },
    { wireIssueCode: 'SYNTHETIC_PRIVATE' },
    { stage: 'invocation' },
    { predicate: 'v1_schema' },
    { wireIssueCode: undefined },
  ]) {
    unavailable.failureDiagnostic = { ...failure, ...patch };
    expect(
      pure.projectReaderAssessment(unavailable).failureDiagnostic
    ).toBeUndefined();
  }
  let touched = false;
  unavailable.failureDiagnostic = { ...failure };
  Object.defineProperty(unavailable.failureDiagnostic, 'wireIssueCode', {
    enumerable: true,
    get() {
      touched = true;
      throw Error('SYNTHETIC_PRIVATE');
    },
  });
  expect(
    pure.projectReaderAssessment(unavailable).failureDiagnostic
  ).toBeUndefined();
  expect(touched).toBe(false);
});

test('reader unavailable diagnostic projection is strict and never invokes diagnostic getters', () => {
  const out = pure.unavailableReaderReview(pack());
  out.status = 'review_unavailable';
  const safe = {
    stage: 'invocation',
    predicate: 'unobserved',
    failure: 'json_parse',
    termination: null,
    providerCode: 'unobserved',
    contentUtf8Bytes: null,
    toolArgumentsUtf8Bytes: null,
  };
  out.failureDiagnostic = safe;
  expect(pure.projectReaderAssessment(out).failureDiagnostic).toEqual(safe);
  out.failureDiagnostic = { ...safe, raw: 'SYNTHETIC_PRIVATE' };
  expect(pure.projectReaderAssessment(out).failureDiagnostic).toBeUndefined();
  let touched = false;
  out.failureDiagnostic = { ...safe };
  Object.defineProperty(out.failureDiagnostic, 'failure', {
    enumerable: true,
    get() {
      touched = true;
      throw Error('SYNTHETIC_PRIVATE');
    },
  });
  expect(pure.projectReaderAssessment(out).failureDiagnostic).toBeUndefined();
  expect(touched).toBe(false);
});

test('valid review and v1 projection are unchanged with an observer; throwing observers do not change rejection', () => {
  const input = pack();
  const wire = pure.syntheticReaderWire(input.evidence, review(sample()));
  const compiled = pure.compileReaderReview(input, wire);
  const compileEvents = [],
    validationEvents = [];
  expect(
    pure.compileReaderReview(input, wire, (code) => compileEvents.push(code))
  ).toEqual(compiled);
  const valid = pure.validateReaderReview(input, compiled);
  expect(
    pure.validateReaderReview(input, compiled, (code) =>
      validationEvents.push(code)
    )
  ).toEqual(valid);
  expect(compileEvents).toEqual([]);
  expect(validationEvents).toEqual([]);
  expect(
    pure.projectReaderAssessment(valid.assessment).failureDiagnostic
  ).toBeUndefined();
  compiled.coverage[0].question = 'SYNTHETIC_NOT_IN_SUBJECT';
  const seen = [];
  expect(
    pure.validateReaderReview(input, compiled, (code) => seen.push(code))
  ).toBe(null);
  expect(seen).toEqual(['v1_coverage_subject']);
  expect(
    pure.validateReaderReview(input, compiled, () => {
      throw Error('SYNTHETIC_PRIVATE');
    })
  ).toBe(null);
});

test.each([
  { stage: 'SYNTHETIC_PRIVATE' },
  { predicate: 'SYNTHETIC_PRIVATE' },
  { failure: 'SYNTHETIC_PRIVATE' },
  { termination: 'SYNTHETIC_PRIVATE' },
  { providerCode: 'SYNTHETIC_PRIVATE' },
  { contentUtf8Bytes: 1_048_577 },
  { contentUtf8Bytes: -1 },
  { toolArgumentsUtf8Bytes: 0.5 },
])('reader diagnostic refuses unknown enum or counter values: %j', (patch) => {
  const out = pure.unavailableReaderReview(pack());
  out.status = 'review_unavailable';
  out.failureDiagnostic = {
    stage: 'invocation',
    predicate: 'unobserved',
    failure: 'json_parse',
    termination: null,
    providerCode: 'unobserved',
    contentUtf8Bytes: null,
    toolArgumentsUtf8Bytes: null,
    ...patch,
  };
  expect(pure.projectReaderAssessment(out).failureDiagnostic).toBeUndefined();
});

test('diagnostic getter on assessment and diagnostics on successful review stay absent', () => {
  const unavailable = pure.unavailableReaderReview(pack());
  unavailable.status = 'review_unavailable';
  let touched = false;
  Object.defineProperty(unavailable, 'failureDiagnostic', {
    get() {
      touched = true;
      throw Error('SYNTHETIC_PRIVATE');
    },
  });
  expect(
    pure.projectReaderAssessment(unavailable).failureDiagnostic
  ).toBeUndefined();
  expect(touched).toBe(false);
  const successful = pure.validateReaderReview(
    pack(),
    review(sample())
  ).assessment;
  successful.failureDiagnostic = {
    stage: 'invocation',
    predicate: 'unobserved',
    failure: 'json_parse',
    termination: null,
    providerCode: 'unobserved',
    contentUtf8Bytes: null,
    toolArgumentsUtf8Bytes: null,
  };
  expect(
    pure.projectReaderAssessment(successful).failureDiagnostic
  ).toBeUndefined();
});

test('output observation ignores content getters and absent callbacks without changing a successful review', async () => {
  const message = {};
  let touched = false;
  Object.defineProperty(message, 'content', {
    enumerable: true,
    get() {
      touched = true;
      throw Error('SYNTHETIC_PRIVATE');
    },
  });
  h.set(sample(), 'Готовый ответ.', review(sample()));
  h.endMetadata({
    generations: [[{ generationInfo: { finish_reason: 'stop' }, message }]],
  });
  const out = await h.search(subject);
  expect(out.readerAssessment.status).toBe('supported');
  expect(out.readerAssessment.failureDiagnostic).toBeUndefined();
  expect(touched).toBe(false);
  expect(h.calls.warnings).toHaveLength(0);
});

test('missing reader completion metadata stays nullable in own unavailable diagnostic', async () => {
  h.set(sample(), 'Не возвращать запасной ответ.', review(sample()));
  h.failPhase('invocation', new SyntaxError('SYNTHETIC_PRIVATE'));
  const out = await h.search(subject);
  expect(out.readerAssessment.failureDiagnostic).toMatchObject({
    stage: 'invocation',
    predicate: 'unobserved',
    failure: 'json_parse',
    termination: null,
    contentUtf8Bytes: null,
    toolArgumentsUtf8Bytes: null,
  });
  expect(diagnostic().termination).toBe('unobserved');
});

test('output observer counts multibyte content blocks and arguments with strict size and accessor boundaries', () => {
  const blocks = [{ text: 'Нейтрально' }, { text: '🙂' }];
  const payload = {
    generations: [
      [
        {
          message: {
            content: blocks,
            response_metadata: { finish_reason: 'length' },
            additional_kwargs: {
              tool_calls: [
                { function: { arguments: '{"a":1}' } },
                { function: { arguments: '{}' } },
              ],
            },
          },
        },
      ],
    ],
  };
  expect(h.outputObservation(payload)).toEqual({
    termination: 'length',
    contentUtf8Bytes: Buffer.byteLength('Нейтрально🙂'),
    toolArgumentsUtf8Bytes: 9,
  });
  expect(
    h.outputObservation({
      generations: [[{ message: { content: 'x'.repeat(1_048_577) } }]],
    }).contentUtf8Bytes
  ).toBe(null);
  let touched = false;
  const block = {};
  Object.defineProperty(block, 'text', {
    get() {
      touched = true;
      throw Error('SYNTHETIC_PRIVATE');
    },
  });
  expect(
    h.outputObservation({ generations: [[{ message: { content: [block] } }]] })
      .contentUtf8Bytes
  ).toBe(null);
  expect(touched).toBe(false);
  const { proxy, revoke } = Proxy.revocable([], {});
  revoke();
  expect(
    h.outputObservation({ generations: [[{ message: { content: proxy } }]] })
  ).toEqual({
    termination: null,
    contentUtf8Bytes: null,
    toolArgumentsUtf8Bytes: null,
  });
});

test('reader validation rejection logs its fixed code without the rejected model payload', async () => {
  const input = sample(),
    output = review(input);
  output.claims[0].text = 'SENSITIVE_READER_OUTPUT';
  output.claims[0].refs[0].source = 'S9';
  h.set(input, 'Не возвращать запасной ответ.', output);
  const out = await h.search(input.subject);
  expect(out.readerAssessment.status).toBe('review_unavailable');
  expect(diagnostic()).toEqual({
    phase: 'validation',
    failure: 'validation_rejected',
    termination: 'unobserved',
    providerCode: 'unobserved',
  });
  expect(JSON.stringify(h.calls.warnings)).not.toContain(
    'SENSITIVE_READER_OUTPUT'
  );
  expect(out.summary).toBe('');
  expect(out.facts).toEqual([]);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.search).toHaveLength(1);
});

test('reader success is unchanged when callback metadata omits generations', async () => {
  const input = sample();
  h.set(input, 'Готовый ответ.', review(input));
  h.endMetadata({});
  const out = await h.search(input.subject);
  expect(out.readerAssessment.status).toBe('supported');
  expect(out.facts).toHaveLength(1);
  expect(out.summary).toBe('Версия 2 действовала на указанную дату.');
  expect(h.calls.warnings).toEqual([]);
  expect(h.calls.model).toHaveLength(2);
});

test.each([
  [
    'official SDK code',
    'invalid_json_schema',
    'invalid_request_error',
    'invalid_json_schema',
  ],
  ['official SDK type', null, 'insufficient_quota', 'insufficient_quota'],
  [
    'untrusted code',
    'SENSITIVE_READER_PROVIDER_CODE',
    'invalid_request_error',
    'unknown',
  ],
  ['nonexact code', ' invalid_schema ', undefined, 'unknown'],
  ['missing code/type', undefined, undefined, 'unobserved'],
])(
  'reader provider code is exact and bounded: %s',
  async (_label, code, type, providerCode) => {
    const { APIError } = require('openai');
    const apiError = new APIError(
      400,
      { code, type, message: 'SENSITIVE_READER_PROVIDER_MESSAGE' },
      undefined,
      undefined
    );
    const { error, touched } = sensitiveReaderError(
      apiError.name,
      400,
      apiError
    );
    h.set(sample(), 'Не возвращать запасной ответ.', review(sample()));
    h.fail(error);
    const out = await h.search(subject);
    expect(out.readerAssessment.status).toBe('review_unavailable');
    expect(diagnostic()).toEqual({
      phase: 'invocation',
      failure: 'provider_rejected',
      termination: 'unobserved',
      providerCode,
    });
    expect(touched).toEqual([]);
    expect(JSON.stringify(h.calls.warnings)).not.toContain('SENSITIVE_READER');
    expect(h.calls.model).toHaveLength(2);
    expect(h.calls.search).toHaveLength(1);
  }
);

test.each(['code', 'type'])(
  'reader provider code accessor %s is never evaluated or logged',
  async (field) => {
    const { error, touched } = sensitiveReaderError('APIError', 400);
    Object.defineProperty(error, field, {
      get() {
        touched.push(field);
        throw new Error('SENSITIVE_READER_CODE_GETTER');
      },
    });
    h.set(sample(), 'Не возвращать запасной ответ.', review(sample()));
    h.fail(error);
    const out = await h.search(subject);
    expect(out.readerAssessment.status).toBe('review_unavailable');
    expect(diagnostic().providerCode).toBe('unknown');
    expect(touched).toEqual([]);
    expect(JSON.stringify(h.calls.warnings)).not.toContain('SENSITIVE_READER');
  }
);

test('reader provider code object is never coerced into an observable string', async () => {
  const { error, touched } = sensitiveReaderError('APIError', 400);
  error.code = {
    toString() {
      touched.push('toString');
      return 'invalid_schema';
    },
  };
  h.set(sample(), 'Не возвращать запасной ответ.', review(sample()));
  h.fail(error);
  const out = await h.search(subject);
  expect(out.readerAssessment.status).toBe('review_unavailable');
  expect(diagnostic().providerCode).toBe('unknown');
  expect(touched).toEqual([]);
});

test('generic requested VTB mention stays contextual, exact and grounded beyond1000', async () => {
  const output = rejected(fixture.rate);
  const start = fixture.rate.subject.indexOf('ВТБ');
  output.entities = [
    {
      name: 'ВТБ',
      subjectStart: start,
      subjectEnd: start + 3,
      status: 'contextual_mention',
      // Include the unique surrounding context instead of the repeated name.
      ref: { source: 'S2', start: 1386, end: 1464 },
    },
  ];
  h.set(fixture.rate, fixture.rate.summary, output);
  const out = await h.search(fixture.rate.subject);
  expect(out.summary).toContain('ВТБ:');
  expect(out.summary).toContain('не подтверждено');
  expect(out.summary).not.toMatch(/13,5|VTBS/);
  expect(out.readerAssessment.claims).toEqual([]);
  expect(out.readerAssessment.entities[0].status).toBe('contextual_mention');
  const stored = out.readerAssessment.evidence.find((s) => s.id === 'S2');
  expect(stored.excerpt.slice(1386, 1389)).toBe('ВТБ');
  expect(stored.excerptSha256).toBe(
    require('node:crypto')
      .createHash('sha256')
      .update(stored.excerpt)
      .digest('hex')
  );
});

test('generic contextual name requires exact subject and source span, not an invented substitution', () => {
  const input = sample(
    'Компания «Альфа» упомянута в связанном заголовке.',
    'Укажи Альфа, если упоминается.'
  );
  const output = review(input, []);
  output.entities = [
    {
      name: 'Альфа',
      subjectStart: 6,
      subjectEnd: 11,
      status: 'contextual_mention',
      ref: ref(input.sources[0].excerpt, 'Альфа'),
    },
  ];
  expect(pure.validateReaderReview(pack(input), output)).not.toBeNull();
  output.entities[0].name = 'Alpha';
  expect(pure.validateReaderReview(pack(input), output)).toBeNull();
});

test('missing name beyond clipped evidence is unknown, never whole-source absence', () => {
  const input = sample(
    'Пояснение. '.repeat(700) + 'Альфа',
    'Альфа, если упоминается.'
  );
  const output = review(input, []);
  output.entities = [
    {
      name: 'Альфа',
      subjectStart: 0,
      subjectEnd: 5,
      status: 'not_observed_in_presented_evidence',
      ref: null,
    },
  ];
  const out = pure.validateReaderReview(pack(input), output);
  expect(out.assessment.entities[0].status).toBe('unknown_due_to_bounds');
});

test('relevant explanatory unfamiliar PDF can pass without literal subject keyword', async () => {
  const input = sample(
    'Используйте дистанционный доступ к общей базе и проверьте условия аренды.',
    'Миграция прикладной системы в облачную среду.'
  );
  const output = review(input, [
    claim(input.sources[0].excerpt, 'context', []),
  ]);
  output.claims[0].text = input.sources[0].excerpt;
  h.set(input, 'Готовый ответ.', output);
  expect((await h.search(input.subject)).facts).toHaveLength(1);
});

test('full5000 subject plus escaped Unicode sources/schema/rules stay within actual aggregate cap', async () => {
  const request = 'я'.repeat(5000);
  const sources = Array.from({ length: 8 }, (_, i) => ({
    url: `https://example.org/${i}`,
    title: 'слово'.repeat(100),
    publishedAt: '2026-10-02',
  }));
  const facts = sources.map((s) => ({
    sourceUrl: s.url,
    text: '😀\\"\n'.repeat(1000),
  }));
  const original = structuredClone(facts);
  const out = pure.packReaderReview(request, sources, facts, 'Russian');
  expect(out.evidence.subject).toBe(request);
  expect(out.evidence.sources).toHaveLength(8);
  expect(
    out.evidence.sources.every(
      (s) => s.excerpt.length <= 3000 && !/[\uD800-\uDBFF]$/.test(s.excerpt)
    )
  ).toBe(true);
  expect(out.inputBytes).toBe(await actualInputBytes(out.prompt));
  expect(out.inputBytes).toBeLessThanOrEqual(25000);
  expect(out.inputBytes).toBeGreaterThan(24500);
  expect(Buffer.byteLength(JSON.stringify(out.evidence))).toBeLessThanOrEqual(
    21000
  );
  expect(facts).toEqual(original);
});

test.each([
  'По состоянию на 31 февраля 2026 года: версия?',
  'По состоянию на 1 октября 2026 года и 2 октября 2026 года: версия?',
  'По состоянию на 1 октября 2026 года 14:00 UTC: версия?',
])(
  'ambiguous/invalid/time-qualified request is not silently reduced to a convenient day: %s',
  (request) => {
    expect(pack(sample(article, request))).toBeNull();
  }
);

test.each([
  { language: 'ru' },
  { language: 'ru', readerResponse: false },
  { readerResponse: true },
  { language: 'ru', readerResponse: true, queries: ['migration'] },
  { language: 'ru', readerResponse: true, task: 'discovery' },
])(
  'legacy/explicit-query/discovery paths retain their answer/admission and never invoke review: %j',
  async (options) => {
    h.set(fixture['1c'], fixture['1c'].summary, rejected(fixture['1c']));
    const out = await h.search(fixture['1c'].subject, options);
    expect(out.summary).toBe(fixture['1c'].summary);
    expect(out.facts).toHaveLength(3);
    expect(out.readerAssessment).toBeUndefined();
    expect(h.summaryPrompts()).toHaveLength(0);
    expect(h.calls.search).toHaveLength(1);
  }
);

test('new reader cache retains assessment without extra spend and stays separate from consumer', async () => {
  h.set(fixture['1c'], fixture['1c'].summary, rejected(fixture['1c']));
  const service = new h.WebResearchService(h.aiUsage),
    opts = { language: 'ru', readerResponse: true };
  const first = await service.research(
    'fixture-organization',
    fixture['1c'].subject,
    opts
  );
  const cached = await service.research(
    'fixture-organization',
    fixture['1c'].subject,
    opts
  );
  expect(cached.readerAssessment).toEqual(first.readerAssessment);
  expect(cached.fromCache).toBe(true);
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.rows).toHaveLength(1);
  const consumer = await service.research(
    'fixture-organization',
    fixture['1c'].subject,
    { language: 'ru' }
  );
  expect(consumer.readerAssessment).toBeUndefined();
  expect(consumer.facts).toHaveLength(3);
  expect(h.calls.model).toHaveLength(3);
});

test('an over-bound URL is excluded rather than rewritten into a different identity', () => {
  const input = sample();
  const original = 'https://example.org/' + 'x'.repeat(500);
  input.sources[0].url = original;
  const packed = pack(input);
  expect(packed.evidence.sources).toEqual([]);
  expect(packed.evidence.bounds).toMatchObject({
    candidateCount: 1,
    presentedCount: 0,
    omittedCount: 1,
    excludedUrlCount: 1,
  });
  expect(input.sources[0].url).toBe(original);
});

test.each(['more than8 candidates', 'excluded URL'])(
  '%s makes unseen entity coverage unknown even without clipped excerpts',
  (reason) => {
    const input = sample('Короткое пояснение.', 'Альфа, если упоминается.');
    input.sources = Array.from(
      { length: reason === 'more than8 candidates' ? 9 : 2 },
      (_, i) => ({
        ...input.sources[0],
        url:
          'https://example.org/' +
          (reason === 'excluded URL' && i === 1 ? 'x'.repeat(500) : i),
      })
    );
    const packed = pack(input);
    const output = review(input, []);
    output.sources = packed.evidence.sources.map((s) => ({
      id: s.id,
      relevance: 'relevant',
    }));
    output.entities = [
      {
        name: 'Альфа',
        subjectStart: 0,
        subjectEnd: 5,
        status: 'not_observed_in_presented_evidence',
        ref: null,
      },
    ];
    expect(packed.evidence.sources.every((s) => !s.clipped)).toBe(true);
    const out = pure.validateReaderReview(packed, output);
    expect(out.assessment.entities[0].status).toBe('unknown_due_to_bounds');
    expect(out.assessment.bounds.omittedCount).toBe(1);
  }
);

test('only a source-grounded closed interval covers a dated observed claim', () => {
  const text =
    'Версия действует с 11 сентября 2026 года до 2 октября 2026 года.';
  const input = sample(text);
  const dates = [
    {
      kind: 'effective_from',
      date: '2026-09-11',
      ref: ref(text, '11 сентября 2026'),
    },
    {
      kind: 'effective_until',
      date: '2026-10-02',
      ref: ref(text, '2 октября 2026'),
    },
  ];
  expect(
    pure.validateReaderReview(
      pack(input),
      review(input, [claim(text, 'observed', dates)])
    ).facts
  ).toHaveLength(1);
  const noEnd = pure.validateReaderReview(
    pack(input),
    review(input, [claim(text, 'observed', dates.slice(0, 1))])
  );
  expect(noEnd.assessment.status).toBe('insufficient_evidence');
  expect(noEnd.facts).toEqual([]);
});

test.each(['reversed interval', 'reversed forecast'])(
  '%s with individually grounded dates fails closed',
  (kind) => {
    const input = sample();
    const dates =
      kind === 'reversed interval'
        ? [
            {
              kind: 'effective_from',
              date: '2026-10-02',
              ref: ref(article, '2 октября 2026'),
            },
            {
              kind: 'effective_until',
              date: '2026-09-11',
              ref: ref(article, '11 сентября 2026'),
            },
          ]
        : [
            {
              kind: 'announced',
              date: '2026-10-23',
              ref: ref(article, '23 октября 2026'),
            },
            {
              kind: 'target',
              date: '2026-09-30',
              ref: ref(article, '30 сентября 2026'),
            },
          ];
    expect(
      pure.validateReaderReview(
        pack(input),
        review(input, [
          claim(
            article,
            kind === 'reversed interval' ? 'observed' : 'forecast',
            dates
          ),
        ])
      )
    ).toBeNull();
  }
);

test('authenticated assessment projection includes only declared fields and exact URL identities', () => {
  const input = sample(),
    result = pure.validateReaderReview(pack(input), review(input));
  const projected = pure.projectReaderAssessment({
    ...result.assessment,
    extra: 'untrusted',
  });
  expect(projected.extra).toBeUndefined();
  expect(projected.evidence[0].url).toBe(input.sources[0].url);
  expect(projected.bounds).toEqual(pack(input).evidence.bounds);
});

// V2: reviewer-proven temporal/cache boundaries; V1 cases above stay intact.
test.each([
  'Действующая версия на 1 октября 2026 года?',
  'Which version was current as at October 1, 2026?',
  'Current version on 2026-10-01?',
  'Действующая версия на 01.10.2026?',
])(
  'an explicit RU/EN civil-date request cannot become undated: %s',
  (request) => {
    const input = sample(article, request);
    const packed = pack(input);
    expect(packed.evidence.requestedDate).toBe('2026-10-01');
    expect(packed.evidence.subject).toBe(request);
    const out = pure.validateReaderReview(
      packed,
      review(input, [claim(article, 'observed', [])])
    );
    expect(out.facts).toEqual([]);
    expect(out.assessment.status).toBe('insufficient_evidence');
  }
);

test.each([
  'По состоянию на 1 октября 2026 года в 14 часов МСК: действующая версия?',
  'По состоянию на 1 октября 2026 года в14часовМСК: действующая версия?',
  'По состоянию на 1 октября 20260 года: действующая версия?',
  'Действующая версия на 10/01/2026?',
  'Действующая версия на 1 октября 2026 года и 2 октября 2026 года?',
  'Which version was current as at October 1, 2026 at 2 PM EST?',
  'По состоянию на 1 октября 2026 года: ' +
    'дополнительный контекст '.repeat(10) +
    'в 14 часов по московскому времени?',
])(
  'unsupported/malformed precision fails before review instead of discarding its constraint: %s',
  (request) => {
    expect(pack(sample(article, request))).toBeNull();
  }
);

test('a five-digit grounded source year cannot certify its four-digit prefix', () => {
  const text = 'Версия действует по состоянию на 1 октября 20260 года.';
  const input = sample(text);
  const output = review(input, [
    claim(text, 'observed', [
      { kind: 'as_of', date: '2026-10-01', ref: ref(text, '1 октября 20260') },
    ]),
  ]);
  expect(pure.validateReaderReview(pack(input), output)).toBeNull();
});

test.each(['transport', 'schema'])(
  'a %s review failure is retried only by a new explicit outer request, then valid results cache normally',
  async (failure) => {
    const input = sample();
    h.set(
      input,
      'Не использовать запасной ответ.',
      failure === 'schema'
        ? { sources: [], claims: [], coverage: [], entities: [] }
        : review(input)
    );
    if (failure === 'transport') h.fail(new Error('Synthetic review failure'));
    const service = new h.WebResearchService(h.aiUsage),
      options = { language: 'ru', readerResponse: true };
    const first = await service.research(
      'fixture-organization',
      input.subject,
      options
    );
    expect(first.readerAssessment.status).toBe('review_unavailable');
    expect(first.fromCache).toBeUndefined();
    expect(h.calls.search).toHaveLength(1);
    expect(h.summaryPrompts()).toHaveLength(1);
    expect(h.calls.rows).toHaveLength(1);
    h.fail(undefined);
    h.set(input, 'Не использовать запасной ответ.', review(input));
    const second = await service.research(
      'fixture-organization',
      input.subject,
      options
    );
    expect(second.readerAssessment.status).toBe('supported');
    expect(second.fromCache).toBeUndefined();
    expect(h.calls.search).toHaveLength(2);
    expect(h.summaryPrompts()).toHaveLength(2);
    expect(h.calls.model).toHaveLength(4);
    expect(h.calls.rows).toHaveLength(2);
    expect(
      h.calls.rows.every((r) => r.succeeded && r.operation === 'web_research')
    ).toBe(true);
    const cached = await service.research(
      'fixture-organization',
      input.subject,
      options
    );
    expect(cached.fromCache).toBe(true);
    expect(cached.readerAssessment).toEqual(second.readerAssessment);
    expect(h.calls.search).toHaveLength(2);
    expect(h.calls.rows).toHaveLength(2);
  }
);

test('a non-reader summary failure keeps its existing fallback/cache behavior', async () => {
  const input = sample(article, 'Объясни миграцию прикладной системы.');
  const answer =
    'Cloud migration reduces infrastructure costs and requires careful preparation.';
  h.set(input, answer, review(input));
  h.fail(new Error('Synthetic legacy summary failure'));
  const service = new h.WebResearchService(h.aiUsage),
    options = { language: 'ru' };
  const first = await service.research(
    'fixture-organization',
    input.subject,
    options
  );
  const second = await service.research(
    'fixture-organization',
    input.subject,
    options
  );
  expect(first.summary).toBe(answer);
  expect(first.readerAssessment).toBeUndefined();
  expect(second.fromCache).toBe(true);
  expect(second.summary).toBe(answer);
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.rows).toHaveLength(1);
});

test.each([
  'Действующая версия для участников на 1 октября 2026 года?',
  'Which runtime version was current as at October 1, 2026?',
  'Which version was current as at October1,2026?',
  'Действующая версия на1октября2026?',
])(
  'date-word boundaries preserve a civil request without inventing time precision: %s',
  (request) => {
    expect(pack(sample(article, request)).evidence.requestedDate).toBe(
      '2026-10-01'
    );
  }
);

test.each([
  'Current version on 2026-10-01T14Z?',
  'Which version was current as at October 1, 2026 at 14?',
])(
  'an abbreviated instant cannot silently become a civil day: %s',
  (request) => {
    expect(pack(sample(article, request))).toBeNull();
  }
);

test('a date ref ending inside a five-digit source year cannot certify a prefix', () => {
  const text = 'Версия действует по состоянию на 1 октября 20260 года.';
  const input = sample(text);
  const output = review(input, [
    claim(text, 'observed', [
      { kind: 'as_of', date: '2026-10-01', ref: ref(text, '1 октября 2026') },
    ]),
  ]);
  expect(pure.validateReaderReview(pack(input), output)).toBeNull();
});

// V3: ordinal constraints stay unsupported; neighboring context never repairs
// an incomplete original date reference.
test.each([
  'Действующая версия на 1-го октября 2026 года?',
  'Which version was current on 1st October 2026?',
])(
  'an unsupported ordinal date must not become an undated request: %s',
  (request) => {
    expect(pack(sample(article, request))).toBeNull();
  }
);

test.each(['missing last year digit', 'missing first day digit'])(
  'adjacent source characters cannot complete a ref with %s',
  (missing) => {
    const input = sample();
    const dateRef = ref(article, '1 октября 2026');
    if (missing === 'missing last year digit') dateRef.end--;
    else dateRef.start++;
    const output = review(input, [
      claim(article, 'observed', [
        { kind: 'as_of', date: '2026-10-01', ref: dateRef },
      ]),
    ]);
    expect(pure.validateReaderReview(pack(input), output)).toBeNull();
  }
);

// Current v10 model ports select source-local indices; production never converts legacy output.
const currentWireFromRequest = (request) => {
  const view = JSON.parse(request.split('Untrusted reader evidence:\n')[1]);
  if (view.catalogue.version === 'v10') return require('./helpers/reader-proof-review-v10.cjs').syntheticReaderV10Review(view, {summary:'Article context is available.'});
  const subject = ['v6', 'v9'].includes(view.catalogue.version)
    ? view.subjectParts.map((part) => part.slice(part.indexOf(':') + 1)).join('')
    : view.subject;
  if (view.catalogue.version === 'v9') return {
    version: 'reader-source-review-wire/v9', catalogue: view.catalogue.binding,
    sources: view.sources.map((row) => ({ id: row[0], relevance: 'relevant' })),
    claims: [{ text: 'Article context is available.', kind: 'context', refs: [{ source: view.sources[0][0], ref: 0 }], dates: [] }],
    coverage: [{ question: subject.slice(0, 500), status: 'supported' }], entities: [],
  };
  return {
    version: view.catalogue.version === 'v6' ? 'reader-source-review-wire/v6' : 'reader-source-review-wire/v5',
    catalogue: view.catalogue.binding,
    sources: view.sources.map((row) => ({ id: row[0], relevance: 'relevant' })),
    claims: [
      {
        text: 'Article context is available.',
        kind: 'context',
        refs: [view.sources[0][5][0][0]],
        dates: [],
      },
    ],
    coverage: [{ question: subject.slice(0, 500), status: 'supported' }],
    entities: [],
  };
};
test('current service uses v10 schema, exact serializer, one existing reader and scoped cache', async () => {
  const input = sample('Article context is available.', 'What is known?');
  h.set(input, 'Ignore provider summary.', currentWireFromRequest);
  const service = new h.WebResearchService(h.aiUsage);
  const seenKeys = [],
    originalGet = service.cache.get.bind(service.cache);
  service.cache.get = (key) => {
    seenKeys.push(key);
    return originalGet(key);
  };
  const first = await service.research('org', input.subject, {
    language: 'ru',
    readerResponse: true,
  });
  expect(first.readerAssessment.status).toBe('supported');
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.model[1]).toMatchObject({ role: 'classify', maxTokens: 1200 });
  const current = require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/openai/reader-proof-review-v10.ts');
  const prepared = current.prepareReaderReviewV10(pack(input));
  const expectedGenerationSchema = current.readerReviewV10GenerationSchema(prepared);
  expect(h.calls.model[1].schema).toEqual(expectedGenerationSchema);
  expect(first.readerAssessment.inputBytes).toBe(
    await actualInputBytes(
      h.summaryPrompts()[0].input.reviewRequest,
      h.calls.model[1].schema
    )
  );
  expect(seenKeys[0]).toContain(current.READER_REVIEW_CACHE_V10_VERSION);
  const cached = await service.research('org', input.subject, {
    language: 'ru',
    readerResponse: true,
  });
  expect(cached.fromCache).toBe(true);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.rows).toHaveLength(1);
});
test('large query chooses v5 before the single reader invocation, retains full subject and never retries', async () => {
  const input = sample('Article context is available.', 'я '.repeat(2499));
  h.set(input, 'Ignore provider summary.', currentWireFromRequest);
  const result = await h.search(input.subject);
  expect(result.readerAssessment.status).toBe('supported');
  expect(evidence().subject).toBe(input.subject);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.model[1].schema.properties.version.const).toBe(
    pure.READER_REVIEW_WIRE_V5_VERSION
  );
  expect(result.readerAssessment.inputBytes).toBeLessThanOrEqual(25000);
  expect(h.summaryPrompts()).toHaveLength(1);
  expect(h.calls.rows).toHaveLength(1);
});
test('invalid subject ID rejects the complete review with safe v10 diagnostics and one model call', async () => {
  const input = sample(
    'Обзор Банка России доступен.',
    'Что известно о Банка России?'
  );
  h.set(input, 'Ignore provider summary.', (request) => {
    const output = currentWireFromRequest(request);
    output.entities = [
      {
        subjectRef: [383, 383],
        mode: 'unknown_due_to_bounds',
      },
    ];
    return output;
  });
  const result = await h.search(input.subject);
  expect(result.summary).toBe('');
  expect(result.facts).toEqual([]);
  expect(result.readerAssessment.failureDiagnostic).toMatchObject({
    stage: 'compile_wire_v10',
    predicate: 'entity_subject_quote',
    failure: 'validation_rejected',
  });
  expect(
    pure.projectReaderAssessment(result.readerAssessment).failureDiagnostic
  ).toEqual(result.readerAssessment.failureDiagnostic);
  expect(
    JSON.stringify(result.readerAssessment.failureDiagnostic)
  ).not.toContain('Qzzz');
  expect(h.calls.model).toHaveLength(2);
  expect(h.summaryPrompts()).toHaveLength(1);
  expect(h.calls.rows).toHaveLength(1);
});
test.each(['unknown', 'stale', 'free-quote'])(
  'current service rejects %s IDs/wire wholly with finite public diagnostics and no retry',
  async (kind) => {
    const input = sample('Article context is available.', 'What is known?');
    h.set(input, 'Ignore provider summary.', (request) => {
      const wire = currentWireFromRequest(request);
      if (kind === 'unknown') wire.claims[0].refs = [{source:'S1',ref:95}];
      if (kind === 'stale') wire.catalogue = '0'.repeat(32);
      if (kind === 'free-quote')
        wire.claims[0].refs = [
          { source: 'S1', quote: 'SYNTHETIC_PRIVATE_QUOTE' },
        ];
      return wire;
    });
    const result = await h.search(input.subject);
    expect(result.readerAssessment.status).toBe('review_unavailable');
    expect(result.facts).toEqual([]);
    expect(result.summary).toBe('');
    expect(result.readerAssessment.failureDiagnostic).toMatchObject({
      stage: 'compile_wire_v10',
      predicate: {
        unknown: 'catalogue_unknown_id',
        stale: 'catalogue_binding',
        'free-quote': 'wire_schema',
      }[kind],
    });
    expect(
      pure.projectReaderAssessment(result.readerAssessment).failureDiagnostic
    ).toEqual(result.readerAssessment.failureDiagnostic);
    expect(
      JSON.stringify(result.readerAssessment.failureDiagnostic)
    ).not.toMatch(/Kzz|SYNTHETIC_PRIVATE|S1/);
    expect(h.calls.model).toHaveLength(2);
    expect(h.calls.search).toHaveLength(1);
    expect(h.calls.rows).toHaveLength(1);
  }
);
test('mandatory date catalogue failure ends before the reader model and keeps source evidence', async () => {
  const input = sample(
    '1 October 2026 2 October 2026 1 October 2026 2 October 2026',
    'What happened?'
  );
  h.set(input, 'Ignore provider summary.', currentWireFromRequest);
  const result = await h.search(input.subject);
  expect(result.readerAssessment.status).toBe('review_unavailable');
  expect(result.readerAssessment.failureDiagnostic).toMatchObject({
    stage: 'prepare_catalogue_v10',
    predicate: 'catalogue_date_anchor',
  });
  expect(result.readerAssessment.evidence[0].excerpt).toBe(
    input.sources[0].excerpt
  );
  expect(h.calls.model).toHaveLength(1);
  expect(h.summaryPrompts()).toHaveLength(0);
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.rows).toHaveLength(1);
});

test('a missing date-via slot has a safe distinct current-service predicate and no retry', async () => {
  const input=sample();
  h.set(input,'Ignore provider summary.',request=>{
    const wire=currentWireFromRequest(request);
    wire.claims[0].dates=[null,null,null,null,{via:1,ref:0}];return wire;
  });
  const result=await h.search(input.subject);
  expect(result.summary).toBe('');expect(result.facts).toEqual([]);
  expect(result.readerAssessment.failureDiagnostic).toMatchObject({stage:'compile_wire_v10',predicate:'date_reference_slot',failure:'validation_rejected'});
  expect(pure.projectReaderAssessment(result.readerAssessment).failureDiagnostic).toEqual(result.readerAssessment.failureDiagnostic);
  expect(h.calls.model).toHaveLength(2);expect(h.calls.search).toHaveLength(1);expect(h.calls.rows).toHaveLength(1);
});

test('a foreign source date spelling fails current wire validation without another request', async () => {
  const input = sample();
  h.set(input, 'Ignore provider summary.', (request) => {
    const wire = currentWireFromRequest(request);
    wire.claims[0].dates = [null,null,null,null,{via:0, ref: 'S2:0'}];
    return wire;
  });
  const result = await h.search(input.subject);
  expect(result.summary).toBe('');
  expect(result.facts).toEqual([]);
  expect(result.readerAssessment.failureDiagnostic).toMatchObject({
    stage: 'compile_wire_v10', predicate: 'wire_schema',
    wireIssueFamily: 'dates', wireIssueCode: 'invalid_type',
  });
  expect(pure.projectReaderAssessment(result.readerAssessment).failureDiagnostic)
    .toEqual(result.readerAssessment.failureDiagnostic);
  expect(JSON.stringify(result.readerAssessment.failureDiagnostic)).not.toContain('S2:0');
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.rows).toHaveLength(1);
});
