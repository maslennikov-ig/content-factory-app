const assert = require('node:assert/strict');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice/';
const pipeline = loadTypeScriptModule(base + 'assist.pipeline.ts');
const contract = loadTypeScriptModule(base + 'assist.contract.ts');
// Exact neutral recorded text/quote; run/sample/tenant IDs are not retained.
const recordedTone =
  'Используйте самоиронию, превращая собственные привычки в персонажей или наглядные образы: «Я тоже люблю уверенно кивать на встречах. Потом открываю заметки и обнаруживаю, что кивал сразу двум несовместимым решениям»; «Мой личный эксперт по посмертным выводам работает без выходных, но доступ к протоколу ему теперь ограничен». Шутка направлена на собственную невнимательность, склонность усложнять и делать выводы задним числом, а не на читателя. Формулируйте методические правила прямо, но обозначайте границы проверки: «Условия проверки должны появляться раньше результатов, а не догонять их в отчё';
const recordedQuote =
  'Условия проверки должны появляться раньше результатов, а не догонять их в отчёте.';
const otherQuote = 'Мы проверяем условия до начала работы.';
const otherText = 'Пишите от лица участника проверки.';
const portrait = {
  text: 'Автор проверяет условия работы и обсуждает причины решений. '.repeat(
    5
  ),
  observationRefs: ['neutral#1', 'neutral#2'],
};
const measurement = { scales: {}, postHabits: null, postLayout: null };

async function run(text = recordedTone, extra = {}, version = 2) {
  const seen = [];
  const answers = [];
  const reduced = {
    fields: [
      { field: 'TONE', text, observationRefs: ['neutral#1'] },
      { field: 'WHO_SPEAKS', text: otherText, observationRefs: ['neutral#2'] },
    ],
    portrait,
    pointOfView: 'first_person',
    formality: 'neutral',
    emojiPolicy: 'none',
    hashtagPolicy: 'none',
    neverSay: [],
    ...extra,
  };
  const transport = {
    complete: async ({ stage }) => {
      seen.push(stage);
      if (stage === 'map')
        return {
          sampleCode: 'neutral',
          observations: [
            {
              field: 'TONE',
              metric: null,
              quote: recordedQuote,
              claim: 'Называет условия проверки заранее.',
            },
            {
              field: 'WHO_SPEAKS',
              metric: null,
              quote: otherQuote,
              claim: 'Говорит от лица участников проверки.',
            },
          ],
        };
      answers.push(structuredClone(reduced));
      return reduced;
    },
  };
  const result = await (version === 2
    ? pipeline.runAssistV2
    : pipeline.runAssist)({
    samples: [
      {
        code: 'neutral',
        text: recordedQuote + ' ' + otherQuote,
        language: 'ru',
        contentHash: 'offline',
      },
    ],
    measurement,
    transport,
    sampleLimit: 1,
  });
  return { result, seen, reduced, answers };
}

test('recorded600 cut quotation is omitted at prior complete sentence in new V2 generation without a retry', async () => {
  assert.equal(recordedTone.length, 600);
  const { result, seen, reduced } = await run();
  const tone = result.proposal.fields.find((f) => f.field === 'TONE');
  assert.ok(tone.text.endsWith('а не на читателя.'));
  assert.ok(recordedTone.startsWith(tone.text));
  assert.ok(tone.text.length < 600);
  assert.equal(
    (tone.text.match(/«/g) || []).length,
    (tone.text.match(/»/g) || []).length
  );
  contract.proposedFieldSchemaV2.parse(tone);
  assert.equal(reduced.fields[0].text, recordedTone);
  assert.deepEqual(tone.observationRefs, ['neutral#1']);
  assert.deepEqual(seen, ['map', 'reduce']);
  assert.deepEqual(result.calls, [
    { stage: 'map', attempt: 1, ok: true },
    { stage: 'reduce', attempt: 1, ok: true },
  ]);
  assert.deepEqual(
    result.proposal.fields.find((f) => f.field === 'WHO_SPEAKS'),
    reduced.fields[1]
  );
  assert.deepEqual(result.proposal.portrait, portrait);
  assert.equal(result.observations[0].quote, recordedQuote);
  assert.equal(result.observations[1].quote, otherQuote);
});

test('V1 generation and historical display keep the original600 text', async () => {
  const { result, seen } = await run(recordedTone, {}, 1);
  assert.equal(result.proposal.fields[0].text, recordedTone);
  assert.deepEqual(seen, ['map', 'reduce']);
  const words = loadTypeScriptModule(base + 'metric-words.ts');
  assert.equal(
    words.proposalInWords({ fields: [{ text: recordedTone }] }).fields[0].text,
    recordedTone
  );
});

test.each([
  ['complete quoted text', 'Правило: «' + recordedQuote + '»'],
  ['ordinary full prose', 'Пишите прямо и обозначайте границы проверки.'],
])('%s remains unchanged', async (_label, text) => {
  if (text.length > 600) text = text.slice(0, 600);
  const { result, seen } = await run(text);
  assert.equal(
    result.proposal.fields.find((f) => f.field === 'TONE').text,
    text
  );
  assert.deepEqual(seen, ['map', 'reduce']);
});

// The isolated quote guard still abstains; new final V2 cap policy omits
// these malformed quotations rather than accepting or completing them.
test.each([
  ['quoted word boundary', recordedTone.replace(/отчё$/u, 'отч') + ' '],
  [
    'missing source quotation',
    'А'.repeat(520) + ' Правило: «' + 'Б'.repeat(70),
  ],
])(
  '%s malformed cap quotation is omitted by final V2 policy',
  async (_label, text) => {
    if (text.length > 600) text = text.slice(0, 600);
    const { result, seen, reduced } = await run(text);
    assert.equal(
      result.proposal.fields.find((f) => f.field === 'TONE'),
      undefined
    );
    assert.equal(reduced.fields[0].text, text);
    assert.deepEqual(seen, ['map', 'reduce']);
    assert.equal(result.calls.length, 2);
    assert.ok(result.calls.every((one) => one.attempt === 1 && one.ok));
  }
);

test('malformed cap quotation without referenced TONE grounds is omitted even when another observation has the continuation', async () => {
  const fields = [
    { field: 'TONE', text: recordedTone, observationRefs: ['neutral#2'] },
    { field: 'WHO_SPEAKS', text: otherText, observationRefs: ['neutral#2'] },
  ];
  const { result, seen } = await run(recordedTone, { fields });
  assert.equal(
    result.proposal.fields.find((f) => f.field === 'TONE'),
    undefined
  );
  assert.equal(fields[0].text, recordedTone);
  assert.deepEqual(seen, ['map', 'reduce']);
  assert.equal(result.calls.length, 2);
});

const guard = loadTypeScriptModule(base + 'proposal-quotation-guard.ts');
const fragment = recordedTone.slice(recordedTone.lastIndexOf('«') + 1);
const quoteOnly = [{ ref: 'neutral#1', field: 'TONE', quote: recordedQuote }];
const paddedCut = (prefix) => {
  const gap = 600 - prefix.length - fragment.length - 1;
  return (
    prefix + 'дополнительные условия '.repeat(50).slice(0, gap) + '«' + fragment
  );
};
const fieldOf = (text) => ({
  field: 'TONE',
  text,
  observationRefs: ['neutral#1'],
});

test('no safe complete prefix omits only the new TONE field, keeping portrait/evidence and call count', async () => {
  const text = paddedCut('Условия проверки ');
  assert.equal(text.length, 600);
  const { result, seen } = await run(text);
  assert.deepEqual(result.proposal.fields, [
    { field: 'WHO_SPEAKS', text: otherText, observationRefs: ['neutral#2'] },
  ]);
  assert.deepEqual(result.proposal.portrait, portrait);
  assert.equal(result.observations[0].quote, recordedQuote);
  assert.deepEqual(seen, ['map', 'reduce']);
});

test.each([
  'Проверьте адрес г. Москва ',
  'Проверьте адрес корп. Москва ',
  'Ask Dr. Smith ',
  'Read approx. Date ',
  'Проверьте дату 23.10.2026 ',
  'Проверьте страницу example.com ',
])(
  'uncertain abbreviation/decimal/URL stop cannot become a partial retained claim: %s',
  (prefix) => {
    const field = fieldOf(paddedCut(prefix));
    assert.equal(field.text.length, 600);
    assert.equal(guard.omitIncompleteToneQuotation(field, quoteOnly), null);
  }
);

test('punctuation inside earlier quotations cannot become the retained boundary', () => {
  const prefix = 'Проверяйте «Первую мысль. Вторую мысль». Правило ';
  const field = fieldOf(paddedCut(prefix));
  const result = guard.omitIncompleteToneQuotation(field, quoteOnly);
  assert.equal(result.text, 'Проверяйте «Первую мысль. Вторую мысль».');
  assert.strictEqual(result.observationRefs, field.observationRefs);
});

test('Unicode complete prefix keeps emoji/code points without slicing a surrogate or adding words', () => {
  const field = fieldOf(paddedCut('Проверяйте 🧩 вместе. Правило '));
  const result = guard.omitIncompleteToneQuotation(field, quoteOnly);
  assert.equal(result.text, 'Проверяйте 🧩 вместе.');
  assert.ok(field.text.startsWith(result.text));
  assert.ok(Array.from(result.text).includes('🧩'));
});

test.each([
  ['two unmatched openers', recordedTone.slice(1).replace('«', '««')],
  ['ambiguous mixed quotes', '"Контекст". ' + recordedTone.slice(12)],
  [
    'balanced complete quotes at600',
    'А'.repeat(600 - recordedQuote.length - 2) + '«' + recordedQuote + '»',
  ],
  ['unmatched closer first', '»' + recordedTone.slice(1)],
])('%s abstains with unchanged text', (label, text) => {
  assert.equal(text.length, 600, label);
  const field = fieldOf(text);
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(field, quoteOnly),
    field
  );
});

test('quote must continue the partial word, not merely the sentence after a word boundary', () => {
  const field = fieldOf(recordedTone);
  const observations = quoteOnly.map((o) => ({
    ...o,
    quote: o.quote.replace('отчёте.', 'отчё те.'),
  }));
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(field, observations),
    field
  );
});


test('all unsafe fields omitted uses existing empty-proposal outcome without extra pipeline calls', async () => {
  const text = paddedCut('Условия проверки ');
  const { result, seen } = await run(text, { fields: [fieldOf(text)] });
  assert.deepEqual(result.proposal.fields, []);
  assert.equal(result.observations.length, 2);
  assert.deepEqual(seen, ['map', 'reduce']);
  assert.deepEqual(result.proposal.portrait, portrait);
});


// Exact root-projected synthetic D5 tone and all referenced observations.
const interiorFixture = {
  tone: {
    key: 'TONE',
    text: 'Направляйте самоиронию на собственные привычки и выводы: «Мой личный эксперт по посмертным выводам работает без выходных»; «Комиссию я однажды уже изображал в одиночку». Для образных шуток используйте неожиданные бытовые или рабочие образы, не делая читателя их мишенью: «Оптовый склад ясности пока закрыт». Разделяйте предположение и установленный результат, прямо обозначая границы вывода: «Если это только моя догадка, так и пишу»; «не стали превращать маленький пример в закон для всех случаев». Советы привязывайте к конкретному действию и критерию: «я выбираю одно, которое сильнее всего мешает',
    status: 'ACCEPTED',
    observationRefs: [
      'smp-04#1',
      'smp-08#1',
      'smp-05#2',
      'smp-08#4',
      'smp-04#2',
      'smp-05#5',
    ],
  },
  observations: [
    {
      ref: 'smp-04#1',
      index: 16,
      field: 'TONE',
      claim:
        'Автор шутит над собственной склонностью находить объяснение задним числом: мишень самоиронии — собственные выводы после получения результата.',
      quote:
        'Мой личный эксперт по посмертным выводам работает без выходных, но доступ к протоколу ему теперь ограничен.',
      sampleCode: 'smp-04',
    },
    {
      ref: 'smp-04#2',
      index: 17,
      field: 'TONE',
      claim:
        'Автор оговаривает границы вывода и не переносит результат небольшого наблюдения на все случаи.',
      quote:
        'Мы записали сами вопросы и не стали превращать маленький пример в закон для всех случаев.',
      sampleCode: 'smp-04',
    },
    {
      ref: 'smp-05#2',
      index: 22,
      field: 'TONE',
      claim:
        'Автор развивает образное противопоставление: расплывчатая «ясность» становится складом, а конкретные вопросы — мастерской. Шутка направлена на общие обещания ясности, а не на читателя.',
      quote:
        'Оптовый склад ясности пока закрыт. Зато небольшая мастерская конкретных вопросов уже иногда приносит пользу.',
      sampleCode: 'smp-05',
    },
    {
      ref: 'smp-05#5',
      index: 25,
      field: 'TONE',
      claim:
        'Советы подаются через конкретное действие и критерий выбора, а не как универсальные правила.',
      quote:
        'Если замечаний несколько, я выбираю одно, которое сильнее всего мешает понять материал.',
      sampleCode: 'smp-05',
    },
    {
      ref: 'smp-08#1',
      index: 36,
      field: 'TONE',
      claim:
        'Самоироничная шутка направлена на автора: он высмеивает собственную роль комиссии, которая без проверки одобряет его выводы.',
      quote:
        'Комиссию я однажды уже изображал в одиночку. Она подозрительно быстро соглашалась со всеми моими выводами.',
      sampleCode: 'smp-08',
    },
    {
      ref: 'smp-08#4',
      index: 39,
      field: 'TONE',
      claim:
        'Автор прямо отделяет собственное предположение от установленного результата.',
      quote: 'Если это только моя догадка, так и пишу.',
      sampleCode: 'smp-08',
    },
  ],
};

async function runInteriorFixture(version = 2) {
  const fixturesByRef = new Map(
    interiorFixture.observations.map((o) => [o.ref, o])
  );
  const samples = Array.from({ length: 8 }, (_, i) => {
    const code = `smp-${String(i + 1).padStart(2, '0')}`;
    const maxIndex = Math.max(
      1,
      ...interiorFixture.observations
        .filter((o) => o.sampleCode === code)
        .map((o) => Number(o.ref.split('#')[1]))
    );
    const observations = Array.from({ length: maxIndex }, (_, i) => {
      const original = fixturesByRef.get(`${code}#${i + 1}`);
      return original
        ? {
            field: original.field,
            metric: null,
            quote: original.quote,
            claim: original.claim,
          }
        : {
            field: 'WHO_SPEAKS',
            metric: null,
            quote: otherQuote,
            claim: `Описывает проверку в нейтральном примере ${code}, пункт ${
              i + 1
            }.`,
          };
    });
    return {
      code,
      observations,
      text: observations.map((o) => o.quote).join(' '),
      language: 'ru',
      contentHash: 'synthetic-offline',
    };
  });
  const seen = [];
  const tone = {
    field: 'TONE',
    text: interiorFixture.tone.text,
    observationRefs: interiorFixture.tone.observationRefs,
  };
  const intactField = {
    field: 'WHO_SPEAKS',
    text: otherText,
    observationRefs: ['smp-01#1'],
  };
  const intactPortrait = {
    ...portrait,
    observationRefs: interiorFixture.tone.observationRefs.slice(0, 2),
  };
  const reduced = {
    fields: [tone, intactField],
    portrait: intactPortrait,
    pointOfView: 'first_person',
    formality: 'neutral',
    emojiPolicy: 'none',
    hashtagPolicy: 'none',
    neverSay: [],
  };
  const before = JSON.stringify({ reduced, samples });
  const result = await (version === 2
    ? pipeline.runAssistV2
    : pipeline.runAssist)({
    samples,
    measurement,
    sampleLimit: 8,
    transport: {
      complete: async (input) => {
        seen.push(input.stage);
        if (input.stage === 'reduce') return reduced;
        const code = /smp-\d{2}/u.exec(input.prompt)[0];
        const sample = samples.find((s) => s.code === code);
        return { sampleCode: code, observations: sample.observations };
      },
    },
  });
  return {
    result,
    seen,
    reduced,
    before,
    after: JSON.stringify({ reduced, samples }),
  };
}

test('exact D5 interior excerpt ending at a word boundary gets a complete V2 prefix with all refs admitted and eight map/one reduce', async () => {
  assert.equal(interiorFixture.tone.text.length, 600);
  const { result, seen, reduced, before, after } = await runInteriorFixture();
  const tone = result.proposal.fields.find((f) => f.field === 'TONE');
  assert.ok(tone.text.endsWith('для всех случаев».'));
  assert.ok(interiorFixture.tone.text.startsWith(tone.text));
  assert.ok(tone.text.length < 600);
  assert.equal(
    (tone.text.match(/«/g) || []).length,
    (tone.text.match(/»/g) || []).length
  );
  assert.deepEqual(tone.observationRefs, interiorFixture.tone.observationRefs);
  assert.deepEqual(
    result.proposal.fields.find((f) => f.field === 'WHO_SPEAKS'),
    reduced.fields[1]
  );
  assert.deepEqual(result.proposal.portrait, reduced.portrait);
  for (const original of interiorFixture.observations) {
    const kept = result.observations.find((o) => o.ref === original.ref);
    assert.ok(kept, original.ref);
    assert.equal(kept.field, 'TONE');
    assert.equal(kept.quote, original.quote);
  }
  assert.deepEqual(seen, [...Array(8).fill('map'), 'reduce']);
  assert.equal(result.calls.length, 9);
  assert.equal(
    result.calls.every((c) => c.attempt === 1 && c.ok),
    true
  );
  assert.equal(before, after);
});

const interiorFragment = interiorFixture.tone.text.slice(
  interiorFixture.tone.text.lastIndexOf('«') + 1
);
const interiorField = {
  field: 'TONE',
  text: interiorFixture.tone.text,
  observationRefs: interiorFixture.tone.observationRefs,
};
const interiorObservation = interiorFixture.observations.find(
  (o) => o.ref === 'smp-05#5'
);
const oneInteriorQuote = [interiorObservation];
const interiorCut = (fragment, prefix = 'Проверяйте условия. Правило ') =>
  prefix +
  'дополнительные условия '
    .repeat(50)
    .slice(0, 600 - prefix.length - fragment.length - 1) +
  '«' +
  fragment;

test('interior literal ending inside a word keeps the old continuation path without inventing its ending', () => {
  const cut = interiorFragment.slice(0, -2);
  const field = { ...interiorField, text: interiorCut(cut) };
  assert.equal(field.text.length, 600);
  const result = guard.omitIncompleteToneQuotation(field, oneInteriorQuote);
  assert.equal(result.text, 'Проверяйте условия.');
  assert.ok(field.text.startsWith(result.text));
});

test.each([
  [
    'same quote repeats',
    [
      {
        ...interiorObservation,
        quote: interiorObservation.quote + ' ' + interiorObservation.quote,
      },
    ],
  ],
  [
    'two admitted referenced quotes',
    [interiorObservation, { ...interiorObservation, ref: 'smp-04#1' }],
  ],
  [
    'unreferenced continuation',
    [{ ...interiorObservation, ref: 'not-admitted#1' }],
  ],
  [
    'wrong observation field',
    [{ ...interiorObservation, field: 'WHO_SPEAKS' }],
  ],
  [
    'incomplete observation',
    [{ ...interiorObservation, quote: interiorObservation.quote.slice(0, -1) }],
  ],
  [
    'punctuation-only remainder',
    [
      {
        ...interiorObservation,
        quote: 'Если несколько, ' + interiorFragment + '...',
      },
    ],
  ],
  [
    'short-word-only remainder',
    [
      {
        ...interiorObservation,
        quote: 'Если несколько, ' + interiorFragment + ' бы.',
      },
    ],
  ],
  [
    'numeric-only remainder',
    [
      {
        ...interiorObservation,
        quote: 'Если несколько, ' + interiorFragment + ' 123.',
      },
    ],
  ],
  [
    'exact quote body',
    [{ ...interiorObservation, quote: interiorFragment + '.' }],
  ],
])('interior %s abstains with the original object', (_label, observations) => {
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(interiorField, observations),
    interiorField
  );
});

test.each(['а', 'Z', '7', '\u0301', '-', '—', '_', '’', "'"])(
  'excerpt starting after word/identifier/compound character %s abstains',
  (previous) => {
    const observations = [
      {
        ...interiorObservation,
        quote: previous + interiorFragment + ' понять материал.',
      },
    ];
    assert.strictEqual(
      guard.omitIncompleteToneQuotation(interiorField, observations),
      interiorField
    );
  }
);

test('ambiguity is not resolved by choosing the only position with enough remaining prose', () => {
  const observations = [
    {
      ...interiorObservation,
      quote: interiorFragment + ' понять материал. ' + interiorFragment + '.',
    },
  ];
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(interiorField, observations),
    interiorField
  );
});

test.each([
  ['601', 'А' + interiorFixture.tone.text],
  [
    'whole complete quote',
    'А'.repeat(600 - interiorObservation.quote.length - 2) +
      '«' +
      interiorObservation.quote +
      '»',
  ],
  [
    'exact full quote as unclosed fragment',
    interiorCut(interiorObservation.quote),
  ],
  ['mixed quote form', '"' + interiorFixture.tone.text.slice(1)],
  [
    'two unclosed quotes',
    interiorFixture.tone.text.slice(1).replace(/«(?=[^«»]*$)/u, '««'),
  ],
])('interior %s remains untouched', (_label, text) => {
  const field = { ...interiorField, text };
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(field, oneInteriorQuote),
    field
  );
});

test('interior TONE evidence cannot transform another proposal field', () => {
  const field = { ...interiorField, field: 'WHO_SPEAKS' };
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(field, oneInteriorQuote),
    field
  );
});

test('source-confirmed interior cut with uncertain abbreviation prefix omits the field instead of keeping a partial claim', () => {
  const field = {
    ...interiorField,
    text: interiorCut(interiorFragment, 'Проверьте адрес г. Москва Правило '),
  };
  assert.equal(field.text.length, 600);
  assert.equal(
    guard.omitIncompleteToneQuotation(field, oneInteriorQuote),
    null
  );
});

test('interior source match after Unicode punctuation keeps exact complete emoji prefix', () => {
  const field = {
    ...interiorField,
    text: interiorCut(interiorFragment, 'Проверяйте 🧩 вместе. Правило '),
  };
  const observations = [
    {
      ...interiorObservation,
      quote: 'Проверка 🧩: ' + interiorFragment + ' понять материал.',
    },
  ];
  const result = guard.omitIncompleteToneQuotation(field, observations);
  assert.equal(result.text, 'Проверяйте 🧩 вместе.');
  assert.ok(field.text.startsWith(result.text));
});

test('exact D5 V1 generation and historical word display preserve all600 without any new transport call', async () => {
  const { result, seen, reduced, before, after } = await runInteriorFixture(1);
  assert.deepEqual(result.proposal.fields, reduced.fields);
  assert.deepEqual(seen, [...Array(8).fill('map'), 'reduce']);
  assert.equal(result.calls.length, 9);
  assert.equal(before, after);
  const words = loadTypeScriptModule(base + 'metric-words.ts');
  assert.equal(
    words.proposalInWords({ fields: [{ text: interiorFixture.tone.text }] })
      .fields[0].text,
    interiorFixture.tone.text
  );
});


// The structural contract supersedes ONLY the two old length-only599
// abstentions; their literal fixture strings remain unchanged.
test('source-supported old shorter599 now retains its exact complete prefix under the structural range contract', async () => {
  const text = recordedTone.slice(0, -1);
  const { result, seen } = await run(text);
  const kept = result.proposal.fields.find((f) => f.field === 'TONE');
  assert.equal(text.length, 599);
  assert.equal(
    kept.text,
    recordedTone.slice(
      0,
      recordedTone.indexOf('а не на читателя.') + 'а не на читателя.'.length
    )
  );
  assert.deepEqual(seen, ['map', 'reduce']);
});

test('source-supported old interior599 now keeps the same complete prefix as600', () => {
  const field = {
    ...interiorField,
    text: interiorFixture.tone.text.slice(0, -1),
  };
  const expected = guard.omitIncompleteToneQuotation(
    interiorField,
    oneInteriorQuote
  );
  assert.equal(field.text.length, 599);
  assert.deepEqual(guard.omitIncompleteToneQuotation(field, oneInteriorQuote), {
    ...field,
    text: expected.text,
  });
});

const tone599Fixture = require('./fixtures/avatar-tone599-neutral.json');
const tone599Field = {
  field: 'TONE',
  text: tone599Fixture.tone.text,
  observationRefs: tone599Fixture.tone.observationRefs,
};
const tone599Prefix =
  'Используйте самоиронию, направляя шутку на собственные привычки и промахи, а не на читателя.';
const tone599SourceRef = 'smp-04#4';
const tone599Fragment = tone599Field.text.slice(
  tone599Field.text.lastIndexOf('«') + 1
);

function tone599Harness({
  unionOnly = false,
  onlyUnsafe = false,
  text = tone599Field.text,
} = {}) {
  const byRef = new Map(
    tone599Fixture.observations.map((one) => [one.ref, one])
  );
  const samples = Array.from({ length: 8 }, (_, index) => {
    const code = `smp-${String(index + 1).padStart(2, '0')}`;
    const maxIndex = Math.max(
      1,
      ...tone599Fixture.observations
        .filter((one) => one.ref.startsWith(code + '#'))
        .map((one) => Number(one.ref.split('#')[1]))
    );
    const observations = Array.from({ length: maxIndex }, (_, at) => {
      const original = byRef.get(`${code}#${at + 1}`);
      return original
        ? {
            field: original.field,
            metric: null,
            quote: original.quote,
            claim: `Нейтральное наблюдение по допущенной цитате ${original.ref}.`,
          }
        : {
            field: 'WHO_SPEAKS',
            metric: null,
            quote: otherQuote,
            claim: `Нейтральная проверка ${code}, позиция ${at + 1}.`,
          };
    });
    return {
      code,
      observations,
      text: observations.map((one) => one.quote).join(' '),
      language: 'ru',
      contentHash: 'neutral-offline-fixture',
    };
  });
  const winnerRefs = unionOnly
    ? tone599Field.observationRefs.filter((ref) => ref !== tone599SourceRef)
    : tone599Field.observationRefs;
  const winner = { ...tone599Field, text, observationRefs: winnerRefs };
  const other = {
    field: 'WHO_SPEAKS',
    text: otherText,
    observationRefs: ['smp-03#1'],
  };
  // Stand-in for UNKNOWN raw winner refs: only a losing same-field line supplies
  // the admitted target ref. This is a pipeline case, not a claimed raw answer.
  const loser = {
    field: 'TONE',
    text: 'Проверяйте действия и критерии выбора.',
    observationRefs: [tone599SourceRef],
  };
  const reduced = {
    fields: [
      winner,
      ...(unionOnly ? [loser] : []),
      ...(onlyUnsafe ? [] : [other]),
    ],
    portrait: {
      ...portrait,
      observationRefs: tone599Field.observationRefs.slice(0, 2),
    },
    pointOfView: 'first_person',
    formality: 'neutral',
    emojiPolicy: 'none',
    hashtagPolicy: 'none',
    neverSay: [],
  };
  const before = JSON.stringify({ reduced, samples });
  const seen = [];
  const transport = {
    complete: async (input) => {
      seen.push(input.stage);
      if (input.stage === 'reduce') return reduced;
      const code = /smp-\d{2}/u.exec(input.prompt)[0];
      return {
        sampleCode: code,
        observations: samples.find((sample) => sample.code === code)
          .observations,
      };
    },
  };
  return {
    samples,
    reduced,
    winner,
    loser,
    other,
    before,
    seen,
    transport,
    after: () => JSON.stringify({ reduced, samples }),
  };
}

for (const unionOnly of [false, true]) {
  test(`exact actual599 V2 retains accepted92 prefix with eight maps/one reduce (unionOnly=${unionOnly})`, async () => {
    const run = tone599Harness({ unionOnly });
    if (unionOnly)
      assert.strictEqual(
        guard.omitIncompleteToneQuotation(
          run.winner,
          tone599Fixture.observations
        ),
        run.winner
      );
    const result = await pipeline.runAssistV2({
      samples: run.samples,
      measurement,
      transport: run.transport,
      sampleLimit: 8,
    });
    const kept = result.proposal.fields.find((field) => field.field === 'TONE');
    assert.equal(tone599Field.text.length, 599);
    assert.equal(kept.text, tone599Prefix);
    assert.equal(kept.text.length, 92);
    assert.equal(tone599Field.text.length - kept.text.length, 507);
    assert.ok(tone599Field.text.startsWith(kept.text));
    assert.deepEqual(
      kept.observationRefs,
      unionOnly
        ? [...run.winner.observationRefs, tone599SourceRef]
        : tone599Field.observationRefs
    );
    assert.deepEqual(
      result.proposal.fields.find((field) => field.field === 'WHO_SPEAKS'),
      run.other
    );
    assert.deepEqual(result.proposal.portrait, run.reduced.portrait);
    assert.equal(
      result.proposal.fields.filter((field) => field.field === 'TONE').length,
      1
    );
    for (const original of tone599Fixture.observations) {
      const keptObservation = result.observations.find(
        (one) => one.ref === original.ref
      );
      assert.equal(keptObservation.quote, original.quote);
      assert.equal(keptObservation.field, original.field);
    }
    assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
    assert.equal(result.calls.length, 9);
    assert.equal(
      result.calls.every((call) => call.attempt === 1 && call.ok),
      true
    );
    assert.equal(run.after(), run.before);
  });
}

function cut599AtLength(length, prefix = 'Проверяйте вместе. Правило ') {
  const padding = 'А'.repeat(
    length - prefix.length - 1 - tone599Fragment.length
  );
  return prefix + padding + '«' + tone599Fragment;
}

test.each([100, 250, 598, 599, 600])(
  'structural source-supported %i accepts only the exact complete prefix and is idempotent',
  (length) => {
    const field = { ...tone599Field, text: cut599AtLength(length) };
    const kept = guard.omitIncompleteToneQuotation(
      field,
      tone599Fixture.observations
    );
    assert.equal(field.text.length, length);
    assert.equal(kept.text, 'Проверяйте вместе.');
    assert.ok(field.text.startsWith(kept.text));
    assert.strictEqual(
      guard.omitIncompleteToneQuotation(kept, tone599Fixture.observations),
      kept
    );
  }
);

test('actual599 helper is idempotent and leaves the admitted source and input field immutable', () => {
  const before = JSON.stringify({
    tone599Field,
    observations: tone599Fixture.observations,
  });
  const kept = guard.omitIncompleteToneQuotation(
    tone599Field,
    tone599Fixture.observations
  );
  assert.equal(kept.text, tone599Prefix);
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(kept, tone599Fixture.observations),
    kept
  );
  assert.equal(
    JSON.stringify({ tone599Field, observations: tone599Fixture.observations }),
    before
  );
});

test.each([
  ['below schema minimum', 'А'],
  ['valid minimum without incomplete quote', 'А.'],
  ['above600', tone599Field.text + 'АА'],
  ['mixed quote form', '“' + tone599Field.text.slice(1)],
  [
    'two open quotes',
    tone599Field.text.slice(1).replace(/«(?=[^«»]*$)/u, '««'),
  ],
  [
    'balanced complete quote below600',
    'Проверяйте вместе. «' +
      tone599Fixture.observations.find((one) => one.ref === tone599SourceRef)
        .quote +
      '»',
  ],
  [
    'full quote without closing angle below600',
    'Проверяйте вместе. «' +
      tone599Fixture.observations.find((one) => one.ref === tone599SourceRef)
        .quote,
  ],
])('structural range still abstains for %s', (_label, text) => {
  const field = { ...tone599Field, text };
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(field, tone599Fixture.observations),
    field
  );
});

test.each([
  'unreferenced',
  'wrong field',
  'ambiguous duplicate',
  'mid-word start',
  'no remaining prose',
])('actual599 grounding still abstains for %s', (kind) => {
  const target = tone599Fixture.observations.find(
    (one) => one.ref === tone599SourceRef
  );
  const observations = tone599Fixture.observations.filter(
    (one) => one.ref !== tone599SourceRef
  );
  const altered = { ...target };
  if (kind === 'unreferenced') altered.ref = 'not-referenced#1';
  if (kind === 'wrong field') altered.field = 'WHO_SPEAKS';
  if (kind === 'mid-word start') altered.quote = 'а' + target.quote;
  if (kind === 'no remaining prose') altered.quote = tone599Fragment + '.';
  observations.push(altered);
  if (kind === 'ambiguous duplicate') observations.push({ ...target });
  assert.strictEqual(
    guard.omitIncompleteToneQuotation(tone599Field, observations),
    tone599Field
  );
});

for (const unionOnly of [false, true]) {
  test(`599 no safe complete prefix omits all fields after V2 pass (unionOnly=${unionOnly}) without additional calls`, async () => {
    const text = cut599AtLength(599, 'Проверьте адрес г. Москва Правило ');
    const run = tone599Harness({ unionOnly, onlyUnsafe: true, text });
    assert.equal(text.length, 599);
    const result = await pipeline.runAssistV2({
      samples: run.samples,
      measurement,
      transport: run.transport,
      sampleLimit: 8,
    });
    assert.deepEqual(result.proposal.fields, []);
    assert.deepEqual(result.proposal.portrait, run.reduced.portrait);
    for (const original of tone599Fixture.observations)
      assert.equal(
        result.observations.find((one) => one.ref === original.ref).quote,
        original.quote
      );
    assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
    assert.equal(result.calls.length, 9);
    assert.equal(run.after(), run.before);

    const service = loadTypeScriptModule(base + 'voice-assist.service.ts', {
      '@nestjs/common': { Injectable: () => (target) => target },
      'openai/helpers/zod': {
        zodResponseFormat: () => {
          throw new Error('real transport is forbidden');
        },
      },
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        getOpenAiClient: () => {
          throw new Error('provider client is forbidden');
        },
        getModelForRole: () => {
          throw new Error('provider role lookup is forbidden');
        },
      },
      '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
        AiUsageService: class {},
      },
    });
    const unavailable = tone599Harness({ unionOnly, onlyUnsafe: true, text });
    await assert.rejects(
      service.runVoiceAssistV2(unavailable.transport, {
        samples: unavailable.samples,
        measurement,
      }),
      { code: 'VOICE_ASSIST_UNAVAILABLE' }
    );
    assert.deepEqual(unavailable.seen, [...Array(8).fill('map'), 'reduce']);
    assert.equal(unavailable.after(), unavailable.before);
  });
}

test('actual599 final ref union with two referenced matching quotes keeps only a certified complete V2 prefix', async () => {
  const run = tone599Harness({ unionOnly: true });
  const duplicateSample = run.samples[0];
  duplicateSample.observations[0] = {
    ...run.samples[3].observations[3],
    claim: 'Отдельная нейтральная проверка того же допущенного условия.',
  };
  duplicateSample.text = duplicateSample.observations
    .map((one) => one.quote)
    .join(' ');
  run.loser.observationRefs.push('smp-01#1');
  const before = JSON.stringify({ samples: run.samples, reduced: run.reduced });
  const result = await pipeline.runAssistV2({
    samples: run.samples,
    measurement,
    transport: run.transport,
    sampleLimit: 8,
  });
  const kept = result.proposal.fields.find((one) => one.field === 'TONE');
  assert.equal(
    kept.text,
    'Используйте самоиронию, направляя шутку на собственные привычки и промахи, а не на читателя.'
  );
  assert.ok(tone599Field.text.startsWith(kept.text));
  assert.equal(kept.text.includes('«'), false);
  assert.equal(
    result.observations.filter(
      (one) => one.quote === run.samples[3].observations[3].quote
    ).length,
    2
  );
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  assert.equal(result.calls.length, 9);
  assert.equal(
    JSON.stringify({ samples: run.samples, reduced: run.reduced }),
    before
  );
});

test('actual599 V1 and historical display remain exact with eight maps and one reduce', async () => {
  const run = tone599Harness();
  const result = await pipeline.runAssist({
    samples: run.samples,
    measurement,
    transport: run.transport,
    sampleLimit: 8,
  });
  assert.deepEqual(result.proposal.fields, run.reduced.fields);
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  assert.equal(result.calls.length, 9);
  assert.equal(run.after(), run.before);
  const words = loadTypeScriptModule(base + 'metric-words.ts');
  assert.equal(
    words.proposalInWords({ fields: [{ text: tone599Field.text }] }).fields[0]
      .text,
    tone599Field.text
  );
});

test('below600 Unicode punctuation preserves only the exact complete emoji prefix', () => {
  const field = {
    ...tone599Field,
    text: cut599AtLength(250, 'Проверяйте 🧩 вместе. Правило '),
  };
  const kept = guard.omitIncompleteToneQuotation(
    field,
    tone599Fixture.observations
  );
  assert.equal(field.text.length, 250);
  assert.equal(kept.text, 'Проверяйте 🧩 вместе.');
  assert.ok(field.text.startsWith(kept.text));
});

test.each(['unreferenced target', 'wrong observation field'])(
  'V2 final ref union keeps only a certified complete prefix for %s with nine calls',
  async (kind) => {
    const run = tone599Harness({ unionOnly: true });
    if (kind === 'unreferenced target')
      run.loser.observationRefs = ['smp-03#1'];
    else run.samples[3].observations[3].field = 'WHO_SPEAKS';
    const before = JSON.stringify({
      samples: run.samples,
      reduced: run.reduced,
    });
    const result = await pipeline.runAssistV2({
      samples: run.samples,
      measurement,
      transport: run.transport,
      sampleLimit: 8,
    });
    const kept = result.proposal.fields.find((one) => one.field === 'TONE');
    assert.equal(
      kept.text,
      'Используйте самоиронию, направляя шутку на собственные привычки и промахи, а не на читателя.'
    );
    assert.ok(tone599Field.text.startsWith(kept.text));
    assert.equal(kept.text.includes('«'), false);
    assert.deepEqual(
      result.proposal.fields.find((one) => one.field === 'WHO_SPEAKS'),
      run.other
    );
    assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
    assert.equal(result.calls.length, 9);
    assert.equal(
      JSON.stringify({ samples: run.samples, reduced: run.reduced }),
      before
    );
  }
);
