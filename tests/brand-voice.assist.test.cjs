'use strict';

/**
 * The model's half of building a voice, and everything it is not allowed to do.
 *
 * The deterministic layer already produced the numbers. What the model adds is
 * an explanation of them, which is only worth having if it can be checked — so
 * every observation carries a verbatim quote and the sample it came from, and
 * a quote that is not really in that sample is dropped before it can reach a
 * profile. That check is a string comparison rather than a second opinion,
 * because inventing a sentence that reads exactly like the author is the thing
 * a model is best at and worst at noticing.
 *
 * Everything here runs on recorded answers, including malformed ones. No key,
 * no network, no cost.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const contract = loadTypeScriptModule(`${base}/assist.contract.ts`);
const pipeline = loadTypeScriptModule(`${base}/assist.pipeline.ts`);

const SAMPLE_TEXT =
  'Поставщика поменяли — старый срывал сроки третий месяц. Мы вчера догнали план. Правда, ценой субботней смены.';

const sample = (code) => ({
  code,
  text: SAMPLE_TEXT,
  language: 'ru',
  contentHash: `hash-${code}`,
});

const measurement = {
  analyzerVersion: 'brand-voice-analyzer/1.0.0',
  localePackVersion: 'ru-2026-08-22',
  language: 'ru',
  sampleCount: 3,
  charCount: 900,
  wordCount: 140,
  sentenceCount: 30,
  scales: {
    firstPerson: {
      raw: 71,
      display: 71,
      low: 60,
      high: 85,
      corridorSource: 'MEASURED',
      observations: 40,
      sampleCount: 3,
      exampleSampleCode: 'smp-01',
      exampleText: 'Мы вчера догнали план.',
    },
  },
  lexicon: [],
  punctuation: {
    dashInsteadOfCopula: 74,
    colonBeforeList: 12,
    questionAtEnd: 3,
    exclamation: 0,
  },
  rejected: [],
  split: {},
};

const observation = (over = {}) => ({
  field: 'WHO_SPEAKS',
  metric: 'firstPerson',
  quote: 'Мы вчера догнали план.',
  claim: 'Пишет от лица тех, кто внутри, а не от лица компании.',
  ...over,
});

/** A transport replaying scripted answers, one per call. */
const scripted = (answers) => {
  const queue = [...answers];
  const seen = [];
  return {
    transport: {
      complete: async (input) => {
        seen.push(input);
        const next = queue.shift();
        if (typeof next === 'function') return next(input);
        return next;
      },
    },
    seen,
  };
};

const mapAnswer = (code, observations = [observation()]) => ({
  sampleCode: code,
  observations,
});

const reduceAnswer = (over = {}) => ({
  fields: [
    {
      field: 'WHO_SPEAKS',
      text: 'Служба новостей завода — люди, которые сами стоят у линии.',
      observationRefs: ['smp-01#1'],
    },
  ],
  pointOfView: 'company_we',
  formality: 'neutral',
  emojiPolicy: 'none',
  hashtagPolicy: 'restrained',
  neverSay: ['мы рады сообщить'],
  ...over,
});

describe('an observation has to be checkable', () => {
  test('the schema refuses an adjective with no quote and no metric', () => {
    expect(() =>
      contract.observationSchema.parse({
        field: 'TONE',
        metric: null,
        quote: '',
        claim: 'Увлекательный и профессиональный тон.',
      })
    ).toThrow();
  });

  test('categorical fields are enumerations, not free text', () => {
    // A profile is read back by code that branches on these. "Fairly informal"
    // produces a profile nothing can apply.
    expect(() =>
      contract.reduceResultSchema.parse({
        ...reduceAnswer(),
        formality: 'довольно неформально',
      })
    ).toThrow();
  });

  test('a quote is grounded only if it is really in the sample', () => {
    expect(
      contract.quoteIsGrounded('Мы вчера догнали план.', SAMPLE_TEXT)
    ).toBe(true);
    // Reflowed whitespace and swapped quotation marks are the model copying,
    // not the model inventing.
    expect(
      contract.quoteIsGrounded('Мы  вчера\nдогнали план.', SAMPLE_TEXT)
    ).toBe(true);
    expect(
      contract.quoteIsGrounded(
        'Мы уверенно движемся к новым горизонтам.',
        SAMPLE_TEXT
      )
    ).toBe(false);
  });
});

describe('the pipeline', () => {
  test('maps per sample and reduces once', async () => {
    const { transport, seen } = scripted([
      mapAnswer('smp-01'),
      mapAnswer('smp-02'),
      reduceAnswer(),
    ]);

    const result = await pipeline.runAssist({
      samples: [sample('smp-01'), sample('smp-02')],
      measurement,
      transport,
    });

    expect(seen.map((one) => one.stage)).toEqual(['map', 'map', 'reduce']);
    expect(result.proposal).not.toBeNull();
    expect(result.calls.filter((one) => one.ok)).toHaveLength(3);
  });

  test('an invented quote never reaches the proposal', async () => {
    const { transport } = scripted([
      mapAnswer('smp-01', [
        observation({ quote: 'Мы уверенно движемся к новым горизонтам.' }),
      ]),
      reduceAnswer(),
    ]);

    const result = await pipeline.runAssist({
      samples: [sample('smp-01')],
      measurement,
      transport,
    });

    expect(result.observations).toEqual([]);
    expect(result.rejected).toEqual([
      { sampleCode: 'smp-01', reason: 'QUOTE_NOT_GROUNDED' },
    ]);
    // With nothing grounded there is nothing to reduce, and no second call is
    // spent finding that out.
    expect(result.proposal).toBeNull();
  });

  test('a malformed answer is retried once, with the violation attached', async () => {
    let prompts = [];
    const transport = {
      complete: async (input) => {
        prompts.push(input.prompt);
        if (prompts.length === 1) return { sampleCode: 'smp-01' };
        if (input.stage === 'map') return mapAnswer('smp-01');
        return reduceAnswer();
      },
    };

    const result = await pipeline.runAssist({
      samples: [sample('smp-01')],
      measurement,
      transport,
    });

    // Asking again in identical words usually produces the same invalid
    // answer, so the violation goes back with the retry.
    expect(prompts[1]).toContain('SCHEMA VIOLATION');
    expect(result.proposal).not.toBeNull();
  });

  test('a sample that fails twice is named and the rest continue', async () => {
    const { transport } = scripted([
      { nonsense: true },
      { nonsense: true },
      mapAnswer('smp-02'),
      reduceAnswer({
        fields: [
          {
            field: 'WHO_SPEAKS',
            text: 'Служба новостей завода.',
            observationRefs: ['smp-02#1'],
          },
        ],
      }),
    ]);

    const result = await pipeline.runAssist({
      samples: [sample('smp-01'), sample('smp-02')],
      measurement,
      transport,
    });

    expect(result.rejected[0]).toMatchObject({
      sampleCode: 'smp-01',
      reason: 'SCHEMA_INVALID',
    });
    expect(result.observations).toHaveLength(1);
    expect(result.proposal).not.toBeNull();
  });

  test('the reduce prompt names an observation by the ref it is stored under', async () => {
    // The prompt used to renumber observations across the whole list while the
    // stored ref counts within its own sample. The two agree only for the
    // first sample, so on a real corpus most references the model was shown
    // pointed at nothing and every field resting on them was dropped as
    // unfounded — one field out of five survived a corpus of eight texts
    // (`content-factory-next-vme.21.9`).
    const { transport, seen } = scripted([
      mapAnswer('smp-01', [
        observation(),
        observation({ field: 'TONE', claim: 'Короткие утверждения без оценок.' }),
      ]),
      mapAnswer('smp-02', [
        observation({ claim: 'Называет исполнителя, а не отдел.' }),
      ]),
      reduceAnswer({
        fields: [
          {
            field: 'WHO_SPEAKS',
            text: 'Люди, которые сами стоят у линии.',
            observationRefs: ['smp-02#1'],
          },
        ],
      }),
    ]);

    const result = await pipeline.runAssist({
      samples: [sample('smp-01'), sample('smp-02')],
      measurement,
      transport,
    });

    const reduce = seen[seen.length - 1].prompt;
    expect(reduce).toContain('[smp-02#1]');
    // The renumbering this replaced would have called it `smp-02#3`.
    expect(reduce).not.toContain('[smp-02#3]');
    expect(result.observations.map((one) => one.ref)).toEqual([
      'smp-01#1',
      'smp-01#2',
      'smp-02#1',
    ]);
    // And the field the model grounded in that ref survives.
    expect(result.proposal.fields).toHaveLength(1);
    expect(result.proposal.fields[0].observationRefs).toEqual(['smp-02#1']);
  });

  test('two lines about one field come back as one line, keeping both grounds', async () => {
    // A real corpus does produce two: the model finds two habits worth stating
    // about the same tone and states both. Everything downstream is keyed by
    // field name — `proposalField` takes the first match, so the second copy
    // could never be accepted and blocked activation, and the screen keyed two
    // rows as one (`content-factory-next-vme.21.10`).
    const { transport } = scripted([
      mapAnswer('smp-01', [
        observation({ field: 'TONE', claim: 'Через тире, без связки.' }),
        observation({ field: 'TONE', claim: 'Отглагольные существительные.' }),
      ]),
      reduceAnswer({
        fields: [
          {
            field: 'TONE',
            text: 'Через тире, без связки.',
            observationRefs: ['smp-01#1'],
          },
          {
            field: 'TONE',
            text: 'Процессы названы существительными.',
            observationRefs: ['smp-01#1', 'smp-01#2'],
          },
        ],
      }),
    ]);

    const result = await pipeline.runAssist({
      samples: [sample('smp-01')],
      measurement,
      transport,
    });

    expect(result.proposal.fields).toHaveLength(1);
    const [field] = result.proposal.fields;
    // The line resting on more grounded observations is the one kept.
    expect(field.text).toBe('Процессы названы существительными.');
    // And nothing that grounded the other line is thrown away.
    expect(new Set(field.observationRefs)).toEqual(
      new Set(['smp-01#1', 'smp-01#2'])
    );
  });

  test('the same habit found in every sample is proposed once', async () => {
    const { transport } = scripted([
      mapAnswer('smp-01'),
      mapAnswer('smp-02'),
      mapAnswer('smp-03'),
      reduceAnswer(),
    ]);

    const result = await pipeline.runAssist({
      samples: [sample('smp-01'), sample('smp-02'), sample('smp-03')],
      measurement,
      transport,
    });

    // Map-reduce duplicates by construction: a habit shows up in most
    // samples, and listing it three times tells the reader nothing three
    // times.
    expect(result.observations).toHaveLength(1);
  });

  test('a field whose grounds did not survive is dropped, not kept unfounded', async () => {
    const { transport } = scripted([
      mapAnswer('smp-01'),
      reduceAnswer({
        fields: [
          {
            field: 'WHO_SPEAKS',
            text: 'Служба новостей завода.',
            observationRefs: ['smp-01#1'],
          },
          {
            field: 'NEVER_SAY',
            text: 'Никогда не говорим «инновационный».',
            observationRefs: ['smp-99#7'],
          },
        ],
      }),
    ]);

    const result = await pipeline.runAssist({
      samples: [sample('smp-01')],
      measurement,
      transport,
    });

    expect(result.proposal.fields.map((one) => one.field)).toEqual([
      'WHO_SPEAKS',
    ]);
  });

  test('an answer naming a sample that was never sent is refused', async () => {
    const { transport } = scripted([mapAnswer('smp-99')]);

    const result = await pipeline.runAssist({
      samples: [sample('smp-01')],
      measurement,
      transport,
    });

    expect(result.rejected).toEqual([
      { sampleCode: 'smp-99', reason: 'UNKNOWN_SAMPLE' },
    ]);
  });
});

describe('what is sent, and what is recorded', () => {
  test('the prompt carries the numbers, so the model explains rather than invents', async () => {
    const { transport, seen } = scripted([mapAnswer('smp-01'), reduceAnswer()]);

    await pipeline.runAssist({
      samples: [sample('smp-01')],
      measurement,
      transport,
    });

    expect(seen[0].prompt).toContain('firstPerson: 71');
    expect(seen[0].prompt).toContain('коридор 60–85');
  });

  test('samples are chosen for spread, not taken from the top', async () => {
    // Randomly excerpted samples attribute better than consecutive passages
    // (Eder). Taking the head measures whatever the person wrote first.
    const many = Array.from({ length: 12 }, (unused, index) =>
      sample(`smp-${String(index + 1).padStart(2, '0')}`)
    );
    const chosen = pipeline.selectSamples(many, 4);

    expect(chosen).toHaveLength(4);
    expect(chosen.map((one) => one.code)).not.toEqual([
      'smp-01',
      'smp-02',
      'smp-03',
      'smp-04',
    ]);
  });

  test('the call log records what happened, never the prompt or the answer', async () => {
    const { transport } = scripted([mapAnswer('smp-01'), reduceAnswer()]);

    const result = await pipeline.runAssist({
      samples: [sample('smp-01')],
      measurement,
      transport,
    });

    // Samples are the customer's writing. The usage record says a call
    // happened; it does not keep a copy of their text.
    const serialised = JSON.stringify(result.calls);
    expect(serialised).not.toContain('Поставщика');
    expect(serialised).not.toContain('SAMPLE');
    expect(result.calls[0]).toEqual({ stage: 'map', attempt: 1, ok: true });
  });

  test('the pipeline imports no client of its own', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', base, 'assist.pipeline.ts'),
      'utf8'
    );

    // The transport is injected, which is what lets every branch above be
    // exercised on recorded answers rather than on a bill.
    expect(source).not.toMatch(/openai|langchain|anthropic|fetch\(/i);
  });
});

describe('the operation is declared', () => {
  test('brand_profile_assist exists as its own AiOperation', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '..',
        'libraries/nestjs-libraries/src/openai/ai.usage.service.ts'
      ),
      'utf8'
    );

    // Separate for observability, with no billing semantics of its own.
    expect(source).toContain("| 'brand_profile_assist'");
  });
});
