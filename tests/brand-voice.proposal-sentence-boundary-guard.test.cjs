const assert = require('node:assert/strict');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice/';
const pipeline = loadTypeScriptModule(base + 'assist.pipeline.ts');
const contract = loadTypeScriptModule(base + 'assist.contract.ts');
const guard = loadTypeScriptModule(base + 'proposal-quotation-guard.ts');
// Exact root-owned neutral projection ff105801...; raw reduce origin is UNKNOWN.
// No tenant, account, run, token or provider identifiers are retained.
const recorded = {
  fields: [
    {
      field: 'TONE',
      text: 'Рассказывая о своих ошибках и привычках, направляйте самоиронию на себя: «Я снова оказался главным поставщиком тумана»; бытовые склонности можно представить как внутреннего персонажа — «мой внутренний архивариус явно рассчитывал на премию за строительство полок». Иногда шутка направлена на расплывчатую формулировку, как в образе «оптового склада» ясности. Объясняя рабочий подход, обозначайте его границы и не выдавайте небольшой пример за правило для всех случаев: «Мы записали сами вопросы и не стали превращать маленький пример в закон для всех случаев». Совет можно подать как условие для разм',
      observationRefs: [
        'smp-01#3',
        'smp-01#4',
        'smp-01#5',
        'smp-02#1',
        'smp-02#2',
        'smp-03#1',
        'smp-04#1',
        'smp-04#4',
        'smp-05#1',
        'smp-06#3',
        'smp-07#3',
        'smp-08#1',
        'smp-08#4',
      ],
    },
    {
      field: 'TOPICS',
      text: 'Пишет о планировании задач и признаках готовности — «Для каждой задачи я записал человека, которому нужен результат, и признак готовности»; о встречах, договорённостях и следующем шаге — «Мы оставили только один результат: выбрать, какой из двух небольших примеров проверяем первым»; о рабочих заметках и фиксации решений — «В заметке я оставил три части: вопрос, выбранный вариант и причину выбора». Также рассматривает небольшие проверки и осторожное толкование их результатов, сроки и проверку рабочих задач, редакторскую обратную связь и правки, понятные инструкции для новых участников. Важно не',
      observationRefs: [
        'smp-01#6',
        'smp-02#6',
        'smp-03#5',
        'smp-04#5',
        'smp-05#6',
        'smp-06#5',
        'smp-07#6',
        'smp-08#5',
      ],
    },
  ],
  observations: [
    {
      ref: 'smp-01#3',
      field: 'TONE',
      quote:
        'Потом открываю заметки и обнаруживаю, что кивал сразу двум несовместимым решениям. Удивительный талант, но в рабочий профиль его пока не включаю.',
    },
    {
      ref: 'smp-01#4',
      field: 'TONE',
      quote: 'мой внутренний министр порядка уже просил отдельный кабинет.',
    },
    {
      ref: 'smp-01#5',
      field: 'TONE',
      quote:
        'Если план приходится защищать длинной речью, возможно, сначала стоит поправить сам план.',
    },
    {
      ref: 'smp-01#6',
      field: 'TOPICS',
      quote:
        'Для каждой задачи я записал человека, которому нужен результат, и признак готовности.',
    },
    {
      ref: 'smp-02#1',
      field: 'TONE',
      quote:
        'Я люблю рассказывать, как важно договариваться заранее. Особенно выразительно это звучит после того, как я сам забыл задать очевидный вопрос.',
    },
    {
      ref: 'smp-02#2',
      field: 'TONE',
      quote:
        'Я снова оказался главным поставщиком тумана, хотя собирался его разогнать.',
    },
    {
      ref: 'smp-02#6',
      field: 'TOPICS',
      quote:
        'Мы оставили только один результат: выбрать, какой из двух небольших примеров проверяем первым.',
    },
    {
      ref: 'smp-03#1',
      field: 'TONE',
      quote:
        'Мой внутренний архивариус явно рассчитывал на премию за строительство полок.',
    },
    {
      ref: 'smp-03#5',
      field: 'TOPICS',
      quote:
        'В заметке я оставил три части: вопрос, выбранный вариант и причину выбора.',
    },
    {
      ref: 'smp-04#1',
      field: 'TONE',
      quote:
        'Мой личный эксперт по посмертным выводам работает без выходных, но доступ к протоколу ему теперь ограничен.',
    },
    {
      ref: 'smp-04#4',
      field: 'TONE',
      quote:
        'Мы записали сами вопросы и не стали превращать маленький пример в закон для всех случаев.',
    },
    {
      ref: 'smp-04#5',
      field: 'TOPICS',
      quote:
        'Условия проверки должны появляться раньше результатов, а не догонять их в отчёте.',
    },
    {
      ref: 'smp-05#1',
      field: 'TONE',
      quote:
        'Если бы ясность можно было заказать одной этой фразой, я давно открыл бы её оптовый склад.',
    },
    {
      ref: 'smp-05#6',
      field: 'TOPICS',
      quote:
        'Поэтому сначала выясняю задачу текста и только затем предлагаю изменение.',
    },
    {
      ref: 'smp-06#3',
      field: 'TONE',
      quote:
        'Это обычная договорённость, а не магический способ исключить задержки.',
    },
    {
      ref: 'smp-06#5',
      field: 'TOPICS',
      quote:
        'Мы разделили срок для первого черновика и срок окончательной проверки.',
    },
    {
      ref: 'smp-07#3',
      field: 'TONE',
      quote:
        'Мой внутренний опытный сотрудник был доволен собой. Новый читатель, к счастью, не разделял его уверенности',
    },
    {
      ref: 'smp-07#6',
      field: 'TOPICS',
      quote:
        'В конце мы добавили небольшой список признаков готовности первой работы.',
    },
    {
      ref: 'smp-08#1',
      field: 'TONE',
      quote:
        'Комиссию я однажды уже изображал в одиночку. Она подозрительно быстро соглашалась со всеми моими выводами.',
    },
    {
      ref: 'smp-08#4',
      field: 'TONE',
      quote:
        'Про весь порядок работы и все возможные команды мы ничего не узнали.',
    },
    {
      ref: 'smp-08#5',
      field: 'TOPICS',
      quote:
        'Рабочий текст должен выдерживать возвращение к вопросу, а не только эффектное первое чтение.',
    },
  ],
};
const endings = {
  TONE: ' Совет можно подать как условие для разм',
  TOPICS: ' Важно не',
};
const expected = Object.fromEntries(
  recorded.fields.map((one) => [
    one.field,
    one.text.slice(0, -endings[one.field].length),
  ])
);
const measurement = { scales: {}, postHabits: null, postLayout: null };
const ordinary = {
  field: 'WHO_SPEAKS',
  text: 'Пишите от лица участника проверки.',
  observationRefs: ['smp-01#1'],
};

function harness({ fields = recorded.fields, v1 = false } = {}) {
  const byRef = new Map(recorded.observations.map((one) => [one.ref, one]));
  const samples = Array.from({ length: 8 }, (_, at) => {
    const code = `smp-${String(at + 1).padStart(2, '0')}`;
    const count = Math.max(
      ...recorded.observations
        .filter((one) => one.ref.startsWith(code + '#'))
        .map((one) => Number(one.ref.split('#')[1]))
    );
    const observations = Array.from({ length: count }, (_, index) => {
      const ref = `${code}#${index + 1}`;
      const original = byRef.get(ref);
      return {
        field:
          original && (!v1 || original.field !== 'TOPICS')
            ? original.field
            : 'WHO_SPEAKS',
        metric: null,
        quote:
          original?.quote ?? `Проверяем условие ${code}, позиция ${index + 1}.`,
        claim: `Нейтральное наблюдение по допущенной цитате ${ref}.`,
      };
    });
    return {
      code,
      text: observations.map((one) => one.quote).join(' '),
      observations,
      language: 'ru',
      contentHash: 'neutral-offline-boundary-fixture',
    };
  });
  const reduced = {
    fields: [...fields, ordinary].map((one) => ({
      ...one,
      observationRefs: [...one.observationRefs],
    })),
    portrait: {
      text: 'Автор обсуждает условия проверки, выбор действий и причины решений. '.repeat(
        5
      ),
      observationRefs: ['smp-01#1', 'smp-02#1'],
    },
    pointOfView: 'first_person',
    formality: 'neutral',
    emojiPolicy: 'none',
    hashtagPolicy: 'none',
    neverSay: [],
  };
  const seen = [];
  const transport = {
    complete: async ({ stage, prompt }) => {
      seen.push(stage);
      if (stage === 'reduce') return reduced;
      const code = /smp-\d{2}/u.exec(prompt)[0];
      return {
        sampleCode: code,
        observations: samples.find((one) => one.code === code).observations,
      };
    },
  };
  return { samples, reduced, seen, transport };
}

const execute = (run, v1 = false) =>
  (v1 ? pipeline.runAssist : pipeline.runAssistV2)({
    samples: run.samples,
    measurement,
    transport: run.transport,
    sampleLimit: 8,
  });

for (const field of recorded.fields) {
  test(`actual48f6 ${field.field}${field.text.length} keeps exact prior complete prefix in new V2 with nine calls`, async () => {
    assert.equal(field.text.length, field.field === 'TONE' ? 599 : 600);
    assert.ok(field.text.endsWith(endings[field.field]));
    // The old quote-only policy intentionally has no source-confirmed open quote.
    assert.strictEqual(
      guard.omitIncompleteToneQuotation(field, recorded.observations),
      field
    );
    const run = harness();
    const before = JSON.stringify({
      samples: run.samples,
      reduced: run.reduced,
    });
    const result = await execute(run);
    const kept = result.proposal.fields.find(
      (one) => one.field === field.field
    );
    assert.equal(kept.text, expected[field.field]);
    assert.ok(field.text.startsWith(kept.text));
    assert.deepEqual(kept.observationRefs, field.observationRefs);
    contract.proposedFieldSchemaV2.parse(kept);
    assert.deepEqual(
      result.proposal.fields.find((one) => one.field === ordinary.field),
      ordinary
    );
    assert.deepEqual(result.proposal.portrait, run.reduced.portrait);
    for (const original of recorded.observations) {
      const one = result.observations.find(
        (candidate) => candidate.ref === original.ref
      );
      assert.equal(one.quote, original.quote);
      assert.equal(one.field, original.field);
    }
    assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
    assert.equal(result.calls.length, 9);
    assert.ok(result.calls.every((one) => one.attempt === 1 && one.ok));
    assert.deepEqual(result.rejected, []);
    assert.equal(
      JSON.stringify({ samples: run.samples, reduced: run.reduced }),
      before
    );
  });
}

const nearText = (
  prefix = 'Проверяйте условия вместе. ',
  length = 600,
  ending = 'для разм'
) => {
  const lead = prefix + 'Совет ';
  return (
    lead +
    'условия '.repeat(100).slice(0, length - lead.length - ending.length) +
    ending
  );
};
const fieldOf = (text, field = 'TONE') => ({
  field,
  text,
  observationRefs: ['same#1'],
});
const admitted = [
  {
    ref: 'same#1',
    field: 'TONE',
    quote: 'Мы проверяем условия до начала работы.',
  },
  {
    ref: 'same#1',
    field: 'TOPICS',
    quote: 'Мы проверяем условия до начала работы.',
  },
];
const apply = (field, observations = admitted) =>
  guard.omitIncompleteBoundaryProse(field, observations);

for (const field of recorded.fields) {
  test(`actual direct ${field.field} prefix is idempotent, immutable and never adds an ending`, () => {
    const before = JSON.stringify({
      field,
      observations: recorded.observations,
    });
    const kept = apply(field, recorded.observations);
    assert.equal(kept.text, expected[field.field]);
    assert.strictEqual(kept.observationRefs, field.observationRefs);
    assert.strictEqual(apply(kept, recorded.observations), kept);
    assert.equal(
      JSON.stringify({ field, observations: recorded.observations }),
      before
    );
  });
}

test.each([599, 600])(
  'trimmed %i UTF16 boundary keeps the exact complete sentence',
  (length) => {
    const field = fieldOf(nearText(undefined, length));
    assert.equal(field.text.length, length);
    assert.equal(apply(field).text, 'Проверяйте условия вместе.');
  }
);

test('one terminal whitespace unit may explain599, without rewriting the input', () => {
  const field = fieldOf(nearText(undefined, 599) + ' ');
  assert.equal(field.text.length, 600);
  assert.equal(apply(field).text, 'Проверяйте условия вместе.');
});

test.each([2, 100, 250, 598, 601])(
  'length %i abstains outside the new near-limit policy',
  (length) => {
    const text = length < 40 ? 'А'.repeat(length) : nearText(undefined, length);
    const field = fieldOf(text);
    assert.equal(text.length, length);
    assert.strictEqual(apply(field), field);
  }
);

test('padding to600 with two whitespace units does not admit a meaningful598 tail', () => {
  const field = fieldOf(nearText(undefined, 598) + '  ');
  assert.strictEqual(apply(field), field);
});

test.each([
  'WHO_SPEAKS',
  'AUDIENCE',
  'SENTENCE_LENGTH',
  'NEVER_SAY',
  'OTHER',
  undefined,
])('field %s remains outside this policy', (name) => {
  const field = { field: name, text: nearText(), observationRefs: ['same#1'] };
  assert.strictEqual(apply(field), field);
});

test.each(
  [
    [],
    [{ ref: 'different#1', field: 'TONE', quote: 'Мы проверяем условия.' }],
    [{ ref: 'same#1', field: 'WHO_SPEAKS', quote: 'Мы проверяем условия.' }],
  ].map((observations) => [observations])
)('referenced admitted same-field evidence is required: %j', (observations) => {
  const field = fieldOf(nearText());
  assert.strictEqual(apply(field, observations), field);
});

test.each([undefined, null, 600, {}, 'А'])(
  'unsupported text %j is unchanged',
  (text) => {
    const field = fieldOf(text);
    assert.strictEqual(apply(field), field);
  }
);

test.each(['.', '!', '?', '…', '»', ':', ';', ','])(
  'terminal punctuation %s stays exact, including at600',
  (stop) => {
    const field = fieldOf(nearText(undefined, 599) + stop);
    assert.equal(field.text.length, 600);
    assert.strictEqual(apply(field), field);
  }
);

test.each([
  ['short abbreviation', 'Проверьте адрес г. Москва '],
  ['long known abbreviation', 'Проверьте адрес корп. Москва '],
  ['other abbreviation', 'Проверьте адрес наприм. Москва '],
  ['English abbreviation', 'Read approx. Date '],
  ['English lower-case abbreviation', 'Read incl. Dates '],
  ['capitalized name', 'Ask Professor. Smith '],
  ['initial', 'Проверьте И. Иванова '],
  ['decimal', 'Проверьте размер 3.14 '],
  ['URL', 'Проверьте страницу https://example.com/path '],
  ['URL stop', 'Проверьте страницу https://localhost/path! Далее '],
  ['email', 'Проверьте адрес example@localhost! Далее '],
  ['ellipsis', 'Проверяйте условия... Далее '],
  ['Unicode ellipsis', 'Проверяйте условия… Далее '],
  ['mixed punctuation run', 'Проверяйте условия?! Далее '],
  ['comma continuation', 'Проверяйте условия, Далее '],
  ['colon continuation', 'Проверяйте условия: Далее '],
  ['semicolon continuation', 'Проверяйте условия; Далее '],
  ['lowercase next sentence', 'Проверяйте условия. далее '],
  ['hyphen before dot', 'Проверяйте условия-. Далее '],
  ['numeric marker', 'Прочитайте пункт 1. Далее '],
  ['parentheses', 'Проверяйте (условия). Далее '],
  ['brackets', 'Проверяйте [условия]. Далее '],
  ['straight mixed quotes', 'Проверяйте "условия". Далее '],
  ['curly mixed quotes', 'Проверяйте “условия”. Далее '],
  ['single mixed quotes', 'Проверяйте ‘условия’. Далее '],
  ['unmatched closer', 'Проверяйте »условия. Далее '],
  ['unclosed quote', 'Проверяйте «условия. Далее '],
  ['nested quotes', 'Проверяйте ««условия»». Далее '],
  ['surrogate', 'Проверяйте \ud83d условия. Далее '],
  ['format control', 'Проверяйте \u200b условия. Далее '],
])('%s ambiguity abstains with the original object', (_label, prefix) => {
  const field = fieldOf(nearText(prefix));
  assert.equal(field.text.length, 600);
  assert.strictEqual(apply(field), field);
});

test('an ambiguous later dot does not become a retained partial claim after a safe earlier sentence', () => {
  const field = fieldOf(
    nearText('Проверяйте вместе. Проверьте адрес корп. Москва ')
  );
  assert.strictEqual(apply(field), field);
});

test('punctuation inside balanced ordinary quotes cannot become a sentence boundary', () => {
  const prefix = 'Проверяйте «Первую мысль. Вторую мысль». ';
  const field = fieldOf(nearText(prefix));
  assert.equal(apply(field).text, prefix.trimEnd());
});

test.each(['!', '?'])(
  'isolated complete %s sentence retains exactly its prefix',
  (stop) => {
    const prefix = `Проверяйте условия${stop} `;
    const field = fieldOf(nearText(prefix));
    assert.equal(apply(field).text, prefix.trimEnd());
  }
);

test('Unicode emoji and decomposed text stay intact inside the exact complete prefix', () => {
  const prefix = 'Проверяйте 🧩 и\u0301 вместе. ';
  const field = fieldOf(nearText(prefix));
  assert.equal(apply(field).text, prefix.trimEnd());
  assert.ok(field.text.startsWith(apply(field).text));
});

test('Unicode combining mark at terminal letter cluster never induces a partial code point', () => {
  const field = fieldOf(nearText(undefined, 599, 'слов') + '\u0301');
  assert.equal(field.text.length, 600);
  assert.equal(apply(field).text, 'Проверяйте условия вместе.');
});

test('a tail containing a quote or uncertain sentence start abstains', () => {
  for (const prefix of [
    'Проверяйте вместе. «Слова» ',
    'Проверяйте вместе. далее ',
  ]) {
    const field = fieldOf(nearText(prefix));
    assert.strictEqual(apply(field), field);
  }
});

for (const name of ['TONE', 'TOPICS']) {
  test(`${name} no certified complete sentence omits only the new field and leaves its input untouched`, () => {
    const field = fieldOf(nearText(''), name);
    const before = JSON.stringify(field);
    assert.equal(apply(field), null);
    assert.equal(JSON.stringify(field), before);
  });
}

test('no safe prefix drops the fields after final V2 pass and keeps portrait/evidence/nine calls', async () => {
  const unsafe = recorded.fields.map((field) => ({
    ...field,
    text: nearText(''),
  }));
  const run = harness({ fields: unsafe });
  const before = JSON.stringify({ samples: run.samples, reduced: run.reduced });
  const result = await execute(run);
  assert.deepEqual(result.proposal.fields, [ordinary]);
  assert.deepEqual(result.proposal.portrait, run.reduced.portrait);
  assert.equal(
    result.observations.length,
    run.samples.reduce((count, sample) => count + sample.observations.length, 0)
  );
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  assert.equal(result.calls.length, 9);
  assert.equal(
    JSON.stringify({ samples: run.samples, reduced: run.reduced }),
    before
  );
});

test('all omitted fields keep the existing unavailable failure and do not buy another run', async () => {
  const run = harness({
    fields: recorded.fields.map((field) => ({ ...field, text: nearText('') })),
  });
  run.reduced.fields.pop();
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
  const before = JSON.stringify({ samples: run.samples, reduced: run.reduced });
  await assert.rejects(
    service.runVoiceAssistV2(run.transport, {
      samples: run.samples,
      measurement,
    }),
    { code: 'VOICE_ASSIST_UNAVAILABLE' }
  );
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  assert.equal(
    JSON.stringify({ samples: run.samples, reduced: run.reduced }),
    before
  );
});

test('final reference union can supply the same-field ground before the boundary policy', async () => {
  const winner = { ...recorded.fields[0], observationRefs: ['smp-01#6'] };
  assert.strictEqual(apply(winner, recorded.observations), winner);
  const loser = {
    field: 'TONE',
    text: 'Проверяйте действия и причины выбора.',
    observationRefs: ['smp-01#3'],
  };
  const run = harness({ fields: [winner, loser] });
  const result = await execute(run);
  const kept = result.proposal.fields.find((one) => one.field === 'TONE');
  assert.equal(kept.text, expected.TONE);
  assert.deepEqual(kept.observationRefs, ['smp-01#6', 'smp-01#3']);
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
});

test('V1 generation and historical display preserve the exact current599 text', async () => {
  const run = harness({ fields: [recorded.fields[0]], v1: true });
  const result = await execute(run, true);
  assert.deepEqual(result.proposal.fields, run.reduced.fields);
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  const words = loadTypeScriptModule(base + 'metric-words.ts');
  for (const field of recorded.fields)
    assert.equal(
      words.proposalInWords({ fields: [{ text: field.text }] }).fields[0].text,
      field.text
    );
});

// Root-owned neutral618 projection: no tenant, run, account or provider IDs.
const plainCap618 = require('./fixtures/avatar-topics618-neutral.json');
const plainCap618Topics = plainCap618.fields.find(
  (field) => field.field === 'TOPICS'
);

function plainCap618Harness(fields = plainCap618.fields) {
  const groups = new Map();
  for (const observation of plainCap618.observations) {
    const group = groups.get(observation.sampleCode) ?? [];
    group.push({
      field: observation.field,
      metric: null,
      claim: observation.claim,
      quote: observation.quote,
    });
    groups.set(observation.sampleCode, group);
  }
  const samples = [...groups].map(([code, observations]) => ({
    code,
    text: observations.map((one) => one.quote).join(' '),
    observations,
    language: 'ru',
    contentHash: 'neutral-offline-plain-cap-fixture',
  }));
  const reduced = {
    fields: JSON.parse(JSON.stringify(fields)),
    portrait: JSON.parse(JSON.stringify(plainCap618.portrait)),
    pointOfView: 'first_person',
    formality: 'neutral',
    emojiPolicy: 'none',
    hashtagPolicy: 'none',
    neverSay: [],
  };
  const seen = [];
  const transport = {
    complete: async ({ stage, prompt }) => {
      seen.push(stage);
      if (stage === 'reduce') return reduced;
      const code = /smp-\d{2}/u.exec(prompt)[0];
      return {
        sampleCode: code,
        observations: samples.find((sample) => sample.code === code)
          .observations,
      };
    },
  };
  return { samples, reduced, seen, transport };
}

test('actual618 TOPICS600 balanced grounded quotes and unfinished plain tail omit only the field', () => {
  assert.equal(plainCap618Topics.text.length, 600);
  assert.ok(plainCap618Topics.text.endsWith('; об обратной связи и ред'));
  const quotes = [...plainCap618Topics.text.matchAll(/«([^«»]+)»/gu)];
  assert.equal(quotes.length, 4);
  for (const [, quote] of quotes)
    assert.ok(
      plainCap618.observations.some(
        (observation) =>
          plainCap618Topics.observationRefs.includes(observation.ref) &&
          observation.field === 'TOPICS' &&
          contract.quoteIsGrounded(quote, observation.quote)
      )
    );
  const before = JSON.stringify(plainCap618);
  assert.equal(apply(plainCap618Topics, plainCap618.observations), null);
  assert.equal(JSON.stringify(plainCap618), before);
});

test('actual618 V2 keeps all four completed fields, portrait and evidence with eight maps and one reduce', async () => {
  const run = plainCap618Harness();
  const before = JSON.stringify({ samples: run.samples, reduced: run.reduced });
  const result = await execute(run);
  assert.deepEqual(
    result.proposal.fields,
    run.reduced.fields.filter((field) => field.field !== 'TOPICS')
  );
  assert.equal(
    result.proposal.fields.find((field) => field.field === 'TONE').text.length,
    482
  );
  assert.deepEqual(result.proposal.portrait, run.reduced.portrait);
  assert.equal(result.observations.length, plainCap618.observations.length);
  for (const original of plainCap618.observations) {
    const kept = result.observations.find((one) => one.ref === original.ref);
    assert.equal(kept.quote, original.quote);
    assert.equal(kept.claim, original.claim);
    assert.equal(kept.field, original.field);
  }
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  assert.equal(result.calls.length, 9);
  assert.ok(result.calls.every((call) => call.ok && call.attempt === 1));
  assert.equal(
    JSON.stringify({ samples: run.samples, reduced: run.reduced }),
    before
  );
});

test('actual618 service keeps the remaining grounded proposal without a whole-analysis retry', async () => {
  const run = plainCap618Harness();
  const forbidden = () => {
    throw new Error('live provider call is forbidden');
  };
  const service = loadTypeScriptModule(base + 'voice-assist.service.ts', {
    '@nestjs/common': { Injectable: () => (target) => target },
    'openai/helpers/zod': { zodResponseFormat: forbidden },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      getOpenAiClient: forbidden,
      getModelForRole: forbidden,
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      AiUsageService: class {},
    },
  });
  const result = await service.runVoiceAssistV2(run.transport, {
    samples: run.samples,
    measurement,
  });
  assert.equal(result.proposal.fields.length, 4);
  assert.ok(result.proposal.fields.every((field) => field.field !== 'TOPICS'));
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  assert.equal(result.calls.length, 9);
});

test('balanced referenced quotation in an unfinished cap tail retains the exact previous complete sentence', () => {
  const prefix = 'Проверяйте 🧩 и\u0301 условия вместе. ';
  const quoted = /«[^«»]+»/u.exec(plainCap618Topics.text)[0];
  const tail = ('Пишите о планировании: ' + quoted + '; обсуждайте ').padEnd(
    600 - prefix.length,
    'а'
  );
  const field = { ...plainCap618Topics, text: prefix + tail };
  const before = JSON.stringify(field);
  const kept = apply(field, plainCap618.observations);
  assert.equal(kept.text, prefix.trimEnd());
  assert.ok(field.text.startsWith(kept.text));
  assert.equal(JSON.stringify(field), before);
  assert.deepEqual(kept.observationRefs, field.observationRefs);
  assert.strictEqual(apply(kept, plainCap618.observations), kept);
});

test('balanced cap quotes without referenced same-field bodies leave the original object exact', () => {
  for (const observations of [
    [],
    plainCap618.observations.map((one) => ({ ...one, field: 'TONE' })),
    plainCap618.observations.map((one) => ({ ...one, ref: 'foreign#1' })),
    plainCap618.observations.map((one) => ({
      ...one,
      quote: 'Совершенно другой текст.',
    })),
    plainCap618.observations.filter(
      (one) => one.ref !== plainCap618Topics.observationRefs[0]
    ),
  ])
    assert.strictEqual(
      apply(plainCap618Topics, observations),
      plainCap618Topics
    );
});

test('empty balanced quotation and a quote-starting ambiguous tail never create a complete prefix', () => {
  const quoted = /«[^«»]+»/u.exec(plainCap618Topics.text)[0];
  const empty = {
    ...plainCap618Topics,
    text: plainCap618Topics.text.replace(
      quoted,
      '«' + ' '.repeat(quoted.length - 2) + '»'
    ),
  };
  assert.equal(empty.text.length, 600);
  assert.strictEqual(apply(empty, plainCap618.observations), empty);
  const ambiguous = {
    ...plainCap618Topics,
    text: ('Проверяйте условия вместе. ' + quoted + ' Пишите ').padEnd(
      600,
      'а'
    ),
  };
  assert.strictEqual(apply(ambiguous, plainCap618.observations), ambiguous);
});

test('final ref union admits all four balanced quotation bodies before the cap policy without another call', async () => {
  const winner = {
    ...plainCap618Topics,
    observationRefs: plainCap618Topics.observationRefs.slice(1),
  };
  const loser = {
    field: 'TOPICS',
    text: 'Пишите о проверке задач.',
    observationRefs: [plainCap618Topics.observationRefs[0]],
  };
  assert.strictEqual(apply(winner, plainCap618.observations), winner);
  const run = plainCap618Harness([
    ...plainCap618.fields.filter((field) => field.field !== 'TOPICS'),
    winner,
    loser,
  ]);
  const result = await execute(run);
  assert.ok(result.proposal.fields.every((field) => field.field !== 'TOPICS'));
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
});

test('actual618 V1 and historical display preserve the exact600 text with no new calls', async () => {
  const run = plainCap618Harness([{ ...plainCap618Topics, field: 'TONE' }]);
  for (const sample of run.samples)
    for (const observation of sample.observations)
      if (observation.field === 'TOPICS') observation.field = 'TONE';
  const result = await execute(run, true);
  assert.deepEqual(result.proposal.fields, run.reduced.fields);
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  let cuts = 0;
  const words = loadTypeScriptModule(base + 'metric-words.ts', {
    './text-truncate': {
      truncateChars: () => {
        cuts++;
        throw new Error('unexpected display truncation');
      },
    },
  });
  assert.equal(
    words.proposalInWords({ fields: [plainCap618Topics] }).fields[0].text,
    plainCap618Topics.text
  );
  assert.equal(
    words.voiceLineInWords(plainCap618Topics.text),
    plainCap618Topics.text
  );
  assert.equal(cuts, 0);
});
