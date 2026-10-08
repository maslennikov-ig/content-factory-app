// The active endpoint uses reader-summary/v1. Legacy pure validator tests below
// retain their original bodies; obsolete V6 endpoint expectations are replaced
// by the source/provenance/cache/transport acceptance at the end of this file.
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
    `'@contentfactory/nestjs-libraries/content-intelligence/research/reader-summary': {
       ...require('./helpers/reader-summary.cjs'),
       compileReaderSummary(input, raw) {
         if (reviewPhaseError?.phase === 'validation') throw reviewPhaseError.error;
         return require('./helpers/reader-summary.cjs').compileReaderSummary(input, raw);
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
      summaryOutput=output;
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


// Current v6 model ports select server IDs; production never converts legacy output.
const currentWireFromRequest = (request) => {
  const view = JSON.parse(request.split('Untrusted reader evidence:\n')[1]);
  const subject = view.catalogue.version === 'v6'
    ? view.subjectParts.map((part) => part.slice(part.indexOf(':') + 1)).join('')
    : view.subject;
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

const simpleReader = require('./helpers/reader-summary.cjs');
const simpleOutput = (input = sample(), gaps = []) => ({
  answer: 'Версия 2 действовала на указанную дату.',
  references: input.sources.map((_, i) => ({ id: `S${i + 1}`, relevance: 'relevant' })),
  gaps,
});

test('active reader uses the simple schema, one synthesis, the original usage ledger and transport options', async () => {
  const input = sample();
  h.set(input, 'Непроверенный ответ провайдера.', simpleOutput(input));
  const result = await h.search(input.subject);
  expect(result.summary).toBe('Версия 2 действовала на указанную дату.');
  expect(result.facts).toHaveLength(1);
  expect(result.readerAssessment.status).toBe('supported');
  expect(result.readerAssessment.claims).toEqual([]);
  expect(result.readerAssessment.entities).toEqual([]);
  expect(h.calls.model.map(({ role }) => role)).toEqual(['classify', 'classify']);
  expect(h.calls.model[1]).toMatchObject({ temperature: 0, maxTokens: 1200, schema: simpleReader.readerSummaryJsonSchema });
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.rows).toHaveLength(1);
  expect(h.calls.rows[0]).toMatchObject({ succeeded: true, operation: 'web_research' });
  expect(h.calls.modelLedgers).toEqual([h.calls.rows[0].ledger, h.calls.rows[0].ledger]);
  expect(h.calls.rows[0].columns.promptTokens).toBe(200);
  const request = h.summaryPrompts()[0].input.reviewRequest;
  expect(result.readerAssessment.inputBytes).toBe(await actualInputBytes(request, simpleReader.readerSummaryJsonSchema));
  expect(result.readerAssessment.inputBytes).toBeLessThanOrEqual(25000);
  expect(request).not.toMatch(/coverage\.ref|subjectParts|sourceColumns/);
});

test('recorded off-topic 1C references are never takeable; readable refusal and original provenance remain', async () => {
  const input = fixture['1c'];
  h.set(input, input.summary, { answer: '', references: input.sources.map((_, i) => ({ id: `S${i + 1}`, relevance: 'irrelevant' })), gaps: ['Найденные материалы не отвечают на вопрос о 1С.'] });
  const result = await h.search(input.subject);
  expect(result.facts).toEqual([]);
  expect(result.readerAssessment.status).toBe('insufficient_evidence');
  expect(result.summary).toContain('не отвечают на вопрос');
  expect(result.sources).toHaveLength(input.sources.length);
  expect(result.readerAssessment.evidence).toHaveLength(input.sources.length);
});

test.each(['telegram-labeling', 'rate-summary', '1c-cloud'])('retained %s prose stays useful through the real endpoint with honest gaps, no auxiliary-name arithmetic', async (name) => {
  const input = require('./fixtures/reader-summary-retained-public.json')[name];
  h.set(input, 'Не использовать ответ провайдера.', {
    answer: input.answer,
    references: input.sources.map((_, i) => ({ id: `S${i + 1}`, relevance: 'relevant' })),
    gaps: [name === 'rate-summary' ? 'Дата действующего решения в этом ответе не установлена.' : 'Некоторые детали требуют проверки по полным источникам.'],
    entities: [{ subjectQuote: name === 'rate-summary' ? 'Банк России' : 'erid' }],
  });
  const result = await h.search(input.subject);
  expect(result.summary.startsWith(input.answer)).toBe(true);
  expect(result.readerAssessment.status).toBe('partial');
  expect(result.facts.length).toBeGreaterThan(0);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.rows).toHaveLength(1);
});

test.each(['tavily', 'exa'])('historical as-of reader keeps general retrieval and accepts later retrospective evidence for %s', async (provider) => {
  const input = sample();
  h.set(input, 'Не использовать.', simpleOutput(input), true);
  h.searchProvider(provider);
  const result = await h.search(input.subject, { language: 'ru', readerResponse: true, windowDays: 30 });
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.search[0]).toMatchObject({ provider, options: { topic: 'general', freshnessRequired: false } });
  expect(result.facts).toHaveLength(1);
  expect(result.sources[0].publishedAt).toBe('2026-10-02');
  expect(result.readerAssessment.requestedDate).toBe('2026-10-01');
});

test('new cache identity preserves assessment and isolates reader, consumer and organization results', async () => {
  const input = sample();
  h.set(input, 'Ответ провайдера.', simpleOutput(input));
  const service = new h.WebResearchService(h.aiUsage);
  const keys = [];
  const originalGet = service.cache.get.bind(service.cache);
  service.cache.get = key => { keys.push(key); return originalGet(key); };
  const options = { language: 'ru', readerResponse: true };
  const first = await service.research('fixture-organization', input.subject, options);
  const cached = await service.research('fixture-organization', input.subject, options);
  expect(keys[0]).toContain(simpleReader.READER_SUMMARY_CACHE_VERSION);
  expect(cached.fromCache).toBe(true);
  expect(cached.readerAssessment).toEqual(first.readerAssessment);
  expect(h.calls.rows).toHaveLength(1);
  const consumer = await service.research('fixture-organization', input.subject, { language: 'ru' });
  expect(consumer.readerAssessment).toBeUndefined();
  expect(consumer.summary).toBe('Ответ провайдера.');
  await service.research('other-organization', input.subject, options);
  expect(h.calls.search).toHaveLength(3);
});

test.each(['model-resolution', 'structured-output', 'invocation', 'validation'])('reader failure at %s keeps one paid operation and no internal retry', async (phase) => {
  h.set(sample(), 'Не возвращать непроверенный ответ.', simpleOutput());
  const error = new Error('SENSITIVE_READER_OUTPUT'); error.name = 'SyntaxError';
  h.failPhase(phase, error);
  const result = await h.search(subject);
  expect(result.readerAssessment.status).toBe('review_unavailable');
  expect(result.summary).toBe('');
  expect(result.facts).toEqual([]);
  expect(h.calls.search).toHaveLength(1);
  expect(h.calls.model).toHaveLength(2);
  expect(h.calls.rows).toHaveLength(1);
  expect(JSON.stringify(result.readerAssessment.failureDiagnostic)).not.toContain('SENSITIVE');
  expect(JSON.stringify(h.calls.warnings)).not.toContain('SENSITIVE');
});

test.each(['transport', 'schema'])('a %s failure retries only on a new outer request and then caches the useful result', async (kind) => {
  const input = sample();
  h.set(input, 'Не возвращать.', kind === 'schema' ? { invalid: true } : simpleOutput(input));
  if (kind === 'transport') h.failPhase('invocation', Object.assign(new Error('synthetic timeout'), { name: 'APIConnectionTimeoutError' }));
  const service = new h.WebResearchService(h.aiUsage);
  const options = { language: 'ru', readerResponse: true };
  expect((await service.research('fixture-organization', input.subject, options)).readerAssessment.status).toBe('review_unavailable');
  h.resetDiagnostics(); h.set(input, '', simpleOutput(input));
  const second = await service.research('fixture-organization', input.subject, options);
  expect(second.readerAssessment.status).toBe('supported');
  expect((await service.research('fixture-organization', input.subject, options)).fromCache).toBe(true);
  expect(h.calls.search).toHaveLength(2);
  expect(h.calls.rows).toHaveLength(2);
});

test('material unsupported literals keep useful prose marked partial but cannot qualify takeable facts', async () => {
  const input = sample();
  h.set(input, '', { ...simpleOutput(input), answer: 'Версия 999 действует с 31 декабря 2026 года.' });
  const result = await h.search(input.subject);
  expect(result.summary).toContain('Версия 999');
  expect(result.summary).toContain('не найдены числа: 999');
  expect(result.readerAssessment.status).toBe('partial');
  expect(result.facts).toEqual([]);
});

test('ambiguous requested date buys no reader synthesis and cannot become an undated answer', async () => {
  const input = sample(article, 'По состоянию на 31 февраля 2026 года: версия?');
  h.set(input, 'Непроверенный ответ.', simpleOutput(input));
  const result = await h.search(input.subject);
  expect(result.readerAssessment.status).toBe('review_unavailable');
  expect(result.summary).toBe('');
  expect(h.calls.model).toHaveLength(1);
});
