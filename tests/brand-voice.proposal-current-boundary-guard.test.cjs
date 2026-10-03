const assert = require('node:assert/strict');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice/';
const pipeline = loadTypeScriptModule(base + 'assist.pipeline.ts');
const contract = loadTypeScriptModule(base + 'assist.contract.ts');
// Exact root-projected public-safe fresh output; upstream corruption cause UNKNOWN.
// Input file SHA-256 fad02248ff8450077bf9a33ad3340b966b4acf8a3cc1e16b0927bf0a6efedc69.
// Only two actual field texts and admitted observation literals are retained.
const recorded = {
  fields: [
    {
      field: 'TONE',
      text: 'Показывай собственные ошибки и привычки через самоироничные образы, направляя шутку на себя: «Я снова оказался главным поставщиком тумана»; «Мой специалист по оптимистичным прогнозам опять работал без согласования с реальностью». Иногда развивай шутку сравнением или воображаемым персонажем: «Будто мы не выполнили норму разговоров и теперь должны добрать её у двери». Не выдавай частный опыт за универсальное правило: «Я не обещаю, что этот порядок подходит каждой команде». Проверяй ясность с позиции читателя, например вопросом: «Есть ли место, где читателю приходится угадывать участника или time',
      observationRefs: [
        'smp-02#2',
        'smp-02#5',
        'smp-03#1',
        'smp-04#2',
        'smp-04#3',
        'smp-06#1',
        'smp-06#4',
        'smp-08#1',
        'smp-08#4',
      ],
    },
    {
      field: 'TOPICS',
      text: 'Пиши о планировании задач и встреч: «Для каждой задачи я записал человека, которому нужен результат, и признак готовности»; о рабочих заметках и ходе принятия решений: «Именно этого я хочу от рабочего текста: он должен удерживать ход мысли, а не изображать победную речь»; о проверке способов объяснения: «Мы собирались сравнить два способа объяснить одну рабочую задачу»; о конкретной обратной связи и редактировании: «Если комментарий можно оставить под любым абзацем, он ещё слишком общий»; о понятных инструкциях для новых участников команды: «Мы поставили этот вопрос в начало. Затем показали一个」',
      observationRefs: [
        'smp-01#6',
        'smp-02#6',
        'smp-03#4',
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
      ref: 'smp-01#1',
      field: 'TONE',
      quote: 'мой внутренний министр порядка уже просил отдельный кабинет',
    },
    {
      ref: 'smp-01#2',
      field: 'TONE',
      quote:
        'Я тоже люблю уверенно кивать на встречах. Потом открываю заметки и обнаруживаю, что кивал сразу двум несовместимым решениям. Удивительный талант, но в рабочий профиль его пока не включаю.',
    },
    {
      ref: 'smp-01#3',
      field: 'TONE',
      quote: 'словно календарь выдавал награду за плотную парковку',
    },
    {
      ref: 'smp-01#4',
      field: 'WHO_SPEAKS',
      quote: 'Я тоже люблю уверенно кивать на встречах.',
    },
    {
      ref: 'smp-01#5',
      field: 'SENTENCE_LENGTH',
      quote: 'Цвета объяснялись гораздо лучше.',
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
      quote: 'Я снова оказался главным поставщиком тумана',
    },
    {
      ref: 'smp-02#3',
      field: 'WHO_SPEAKS',
      quote: 'Я закончил встречу раньше, чем обычно',
    },
    {
      ref: 'smp-02#4',
      field: 'SENTENCE_LENGTH',
      quote: 'Мне нужно понять, какую работу запускают наши слова.',
    },
    {
      ref: 'smp-02#5',
      field: 'TONE',
      quote:
        'Будто мы не выполнили норму разговоров и теперь должны добрать её у двери.',
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
      ref: 'smp-03#2',
      field: 'WHO_SPEAKS',
      quote:
        'Я хотел придумать удобный порядок для рабочих заметок и начал с новой папки.',
    },
    {
      ref: 'smp-03#3',
      field: 'SENTENCE_LENGTH',
      quote:
        'Если новый порядок не помогает найти это решение, количество папок не спасёт дело.',
    },
    {
      ref: 'smp-03#4',
      field: 'TOPICS',
      quote:
        'Именно этого я хочу от рабочего текста: он должен удерживать ход мысли, а не изображать победную речь.',
    },
    {
      ref: 'smp-04#1',
      field: 'WHO_SPEAKS',
      quote:
        'Я следил, чтобы разница не пряталась одновременно в длине, терминологии и количестве шагов.',
    },
    {
      ref: 'smp-04#2',
      field: 'TONE',
      quote:
        'Я, конечно, умею найти красивое объяснение почти любому исходу. Именно поэтому стараюсь заранее записать, на что будем смотреть. Мой личный эксперт по посмертным выводам работает без выходных, но доступ к протоколу ему теперь ограничен.',
    },
    {
      ref: 'smp-04#3',
      field: 'TONE',
      quote:
        'Мы записали сами вопросы и не стали превращать маленький пример в закон для всех случаев.',
    },
    {
      ref: 'smp-04#4',
      field: 'SENTENCE_LENGTH',
      quote:
        'Условия проверки должны появляться раньше результатов, а не догонять их в отчёте.',
    },
    {
      ref: 'smp-04#5',
      field: 'TOPICS',
      quote:
        'Мы собирались сравнить два способа объяснить одну рабочую задачу.',
    },
    {
      ref: 'smp-05#1',
      field: 'WHO_SPEAKS',
      quote:
        'Я решил пересмотреть привычку давать обратную связь и начал с собственного комментария к черновику.',
    },
    {
      ref: 'smp-05#2',
      field: 'TONE',
      quote:
        'У меня есть такая склонность: навожу порядок так решительно, что потом приходится искать смысл среди аккуратно подписанных коробок.',
    },
    {
      ref: 'smp-05#3',
      field: 'TONE',
      quote:
        'Оптовый склад ясности пока закрыт. Зато небольшая мастерская конкретных вопросов уже иногда приносит пользу.',
    },
    {
      ref: 'smp-05#4',
      field: 'TONE',
      quote:
        'Вопрос занимает немного времени, но делает дальнейший разговор предметным.',
    },
    {
      ref: 'smp-05#5',
      field: 'TONE',
      quote:
        'Это конкретное изменение, а не доказательство моего безупречного вкуса.',
    },
    {
      ref: 'smp-05#6',
      field: 'TOPICS',
      quote:
        'Если комментарий можно оставить под любым абзацем, он ещё слишком общий.',
    },
    {
      ref: 'smp-06#1',
      field: 'TONE',
      quote:
        'Мой специалист по оптимистичным прогнозам опять работал без согласования с реальностью.',
    },
    {
      ref: 'smp-06#2',
      field: 'WHO_SPEAKS',
      quote:
        'Я спросил, какая часть работы уже понятна, а какая зависит от неизвестного.',
    },
    {
      ref: 'smp-06#3',
      field: 'SENTENCE_LENGTH',
      quote: 'Красивой даты для этого оказалось мало.',
    },
    {
      ref: 'smp-06#4',
      field: 'TONE',
      quote: 'Я не обещаю, что этот порядок подходит каждой команде.',
    },
    {
      ref: 'smp-06#5',
      field: 'TOPICS',
      quote: 'В календаре я оставил видимыми зависимости.',
    },
    {
      ref: 'smp-07#1',
      field: 'TONE',
      quote:
        'Опытный сотрудник внутри меня слегка обижен: его выступление сократили.',
    },
    {
      ref: 'smp-07#2',
      field: 'TONE',
      quote:
        'Мне нравится профессиональная лексика, особенно когда она скрывает пропущенную мысль.',
    },
    {
      ref: 'smp-07#3',
      field: 'AUDIENCE',
      quote:
        'Лучше предложить короткую первую попытку и возможность задать вопрос.',
    },
    {
      ref: 'smp-07#4',
      field: 'WHO_SPEAKS',
      quote: 'Я готовил объяснение для нового участника вымышленной команды',
    },
    {
      ref: 'smp-07#5',
      field: 'SENTENCE_LENGTH',
      quote:
        'Удобная инструкция не отменяет разговор. Она делает разговор точнее: вместо общего замешательства можно назвать конкретный шаг, на котором возникло затруднение.',
    },
    {
      ref: 'smp-07#6',
      field: 'TOPICS',
      quote:
        'Мы поставили этот вопрос в начало. Затем показали один законченный образец и рядом небольшой незаконченный.',
    },
    {
      ref: 'smp-08#1',
      field: 'TONE',
      quote:
        'Комиссию я однажды уже изображал в одиночку. Она подозрительно быстро соглашалась со всеми моими выводами.',
    },
    {
      ref: 'smp-08#2',
      field: 'WHO_SPEAKS',
      quote:
        'Я разделил заметку на наблюдение, предположение и следующий опыт.',
    },
    {
      ref: 'smp-08#3',
      field: 'TONE',
      quote: 'Для меня это хороший признак.',
    },
    {
      ref: 'smp-08#4',
      field: 'TONE',
      quote:
        'Есть ли место, где читателю приходится угадывать участника или время?',
    },
    {
      ref: 'smp-08#5',
      field: 'TOPICS',
      quote:
        'Я разделил заметку на наблюдение, предположение и следующий опыт.',
    },
  ],
};
const measurement = { scales: {}, postHabits: null, postLayout: null };
const ordinary = {
  field: 'WHO_SPEAKS',
  text: 'Пишите от лица участника проверки.',
  observationRefs: ['smp-01#4'],
};
const expectedTone = recorded.fields[0].text.slice(
  0,
  recorded.fields[0].text.indexOf(' Проверяй ясность')
);

function harness(fields = recorded.fields) {
  const samples = Array.from({ length: 8 }, (_, at) => {
    const code = `smp-${String(at + 1).padStart(2, '0')}`;
    const admitted = recorded.observations.filter((one) =>
      one.ref.startsWith(code + '#')
    );
    const observations = admitted.map((one) => ({
      field: one.field,
      metric: null,
      quote: one.quote,
      claim: `Нейтральное наблюдение по допущенной цитате ${one.ref}.`,
    }));
    return {
      code,
      text: observations.map((one) => one.quote).join(' '),
      observations,
      language: 'ru',
      contentHash: 'neutral-offline-current-boundary-fixture',
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
const execute = (run) =>
  pipeline.runAssistV2({
    samples: run.samples,
    measurement,
    transport: run.transport,
    sampleLimit: 8,
  });

for (const original of recorded.fields) {
  test(`actual current ${original.field}600 malformed angle quote cannot survive full final V2 policy with nine calls`, async () => {
    assert.equal(original.text.length, 600);
    const run = harness();
    const before = JSON.stringify({
      samples: run.samples,
      reduced: run.reduced,
    });
    const result = await execute(run);
    const kept = result.proposal.fields.find(
      (one) => one.field === original.field
    );
    if (original.field === 'TONE') {
      assert.equal(kept?.text, expectedTone);
      assert.ok(original.text.startsWith(kept.text));
      assert.deepEqual(kept.observationRefs, original.observationRefs);
      contract.proposedFieldSchemaV2.parse(kept);
    } else {
      assert.equal(kept, undefined);
    }
    assert.deepEqual(
      result.proposal.fields.find((one) => one.field === ordinary.field),
      ordinary
    );
    assert.deepEqual(result.proposal.portrait, run.reduced.portrait);
    assert.deepEqual(result.proposal.neverSay, []);
    for (const admitted of recorded.observations) {
      const one = result.observations.find(
        (candidate) => candidate.ref === admitted.ref
      );
      assert.equal(one.quote, admitted.quote);
      assert.equal(one.field, admitted.field);
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

const guard = loadTypeScriptModule(base + 'proposal-quotation-guard.ts');
const capQuotation = (
  prefix = 'Проверяйте условия вместе. ',
  ending = '«Незавершённый пример time',
  length = 600
) =>
  prefix +
  'Правило ' +
  'условия '
    .repeat(100)
    .slice(0, length - prefix.length - 'Правило '.length - ending.length) +
  ending;
const fieldOf = (text, field = 'TONE') => ({
  field,
  text,
  observationRefs: ['same#1'],
});
const admitted = ['TONE', 'TOPICS'].map((field) => ({
  ref: 'same#1',
  field,
  quote: 'Сначала проверяем условия. Затем сохраняем результат.',
}));
const apply = (field, observations = admitted) =>
  guard.omitIncompleteBoundaryQuotation(field, observations);

for (const field of recorded.fields) {
  test(`actual direct ${field.field} policy is immutable, idempotent and never completes the source`, () => {
    const before = JSON.stringify({
      field,
      observations: recorded.observations,
    });
    const kept = apply(field, recorded.observations);
    if (field.field === 'TONE') {
      assert.equal(kept.text, expectedTone);
      assert.strictEqual(kept.observationRefs, field.observationRefs);
      assert.strictEqual(apply(kept, recorded.observations), kept);
      assert.equal(kept.text.includes('time'), false);
      assert.equal(kept.text.includes('время?'), false);
    } else assert.equal(kept, null);
    assert.equal(
      JSON.stringify({ field, observations: recorded.observations }),
      before
    );
  });
}

test.each([599, 600])(
  'malformed quote at supported cap %i retains an exact complete prefix without a source continuation match',
  (length) => {
    const field = fieldOf(capQuotation(undefined, undefined, length));
    assert.equal(field.text.length, length);
    assert.equal(apply(field).text, 'Проверяйте условия вместе.');
  }
);

test('one terminal whitespace unit admits meaningful599; two do not admit598', () => {
  const atCap = fieldOf(capQuotation(undefined, undefined, 599) + ' ');
  assert.equal(atCap.text.length, 600);
  assert.equal(apply(atCap).text, 'Проверяйте условия вместе.');
  const below = fieldOf(capQuotation(undefined, undefined, 598) + '  ');
  assert.strictEqual(apply(below), below);
});

test.each([100, 250, 598, 601])(
  'malformed quotation at length %i stays outside this additive cap policy',
  (length) => {
    const field = fieldOf(capQuotation(undefined, undefined, length));
    assert.equal(field.text.length, length);
    assert.strictEqual(apply(field), field);
  }
);

test.each([
  'WHO_SPEAKS',
  'AUDIENCE',
  'SENTENCE_LENGTH',
  'NEVER_SAY',
  undefined,
])('field %s stays outside the new quotation policy', (name) => {
  const field = {
    field: name,
    text: capQuotation(),
    observationRefs: ['same#1'],
  };
  assert.strictEqual(apply(field), field);
});

test.each([599, 600])(
  'a complete balanced source quotation stays exact at %i even with no terminal stop',
  (length) => {
    const field = fieldOf(
      capQuotation(undefined, '«Сначала проверяем условия»', length)
    );
    assert.equal(field.text.length, length);
    assert.strictEqual(apply(field), field);
  }
);

test.each([
  ['ordinary complete prose', 'Проверяйте условия вместе.'],
  ['balanced nested quotation', '«Внешняя «внутренняя» цитата»'],
  ['straight quote convention without angle quotes', '"Проверяйте условия"'],
])('%s does not enter the malformed angle policy', (_label, ending) => {
  const field = fieldOf(capQuotation(undefined, ending));
  assert.strictEqual(apply(field), field);
});

test.each([
  ['no prior complete sentence', 'Проверяйте условия вместе '],
  ['abbreviation', 'Проверьте адрес г. Москва '],
  ['long abbreviation', 'Проверьте адрес корп. Москва '],
  ['English abbreviation', 'Read approx. Date '],
  ['capitalized name', 'Ask Professor. Smith '],
  ['URL', 'Проверьте страницу https://example.com/path '],
  ['numeric marker', 'Прочитайте пункт 1. Далее '],
  ['ellipsis', 'Проверяйте условия... Далее '],
  ['mixed quotation', 'Проверяйте “условия”. Далее '],
  ['unmatched closer', 'Проверяйте »условия. Далее '],
  ['nested unmatched opener', 'Проверяйте ««условия. Далее '],
  ['format control', 'Проверяйте \u200b условия. Далее '],
  ['broken surrogate', 'Проверяйте \ud83d условия. Далее '],
])(
  '%s cannot certify a prefix for malformed cap quotes; the field is omitted',
  (_label, prefix) => {
    const field = fieldOf(capQuotation(prefix));
    assert.equal(field.text.length, 600);
    assert.equal(apply(field), null);
  }
);

test('a differently styled closer cannot turn an unfinished quote into an accepted field', () => {
  const field = fieldOf(capQuotation(undefined, '«Затем показали一个」'));
  assert.equal(apply(field), null);
});

test('a sole unmatched closer at the cap also fails closed', () => {
  const field = fieldOf(capQuotation(undefined, 'условия»'));
  assert.equal(apply(field), null);
});

test('complete source-grounded earlier quotations survive without splitting sentences inside them', () => {
  const prefix =
    'Проверяйте «Сначала проверяем условия. Затем сохраняем результат». ';
  const field = fieldOf(capQuotation(prefix));
  assert.equal(apply(field).text, prefix.trimEnd());
});

test('an unsupported earlier quoted claim cannot survive as a purported grounded prefix', () => {
  const field = fieldOf(
    capQuotation('Проверяйте «Другое неподтверждённое утверждение». ')
  );
  assert.equal(apply(field), null);
});

test.each(
  [
    [],
    [
      {
        ref: 'different#1',
        field: 'TONE',
        quote: 'Сначала проверяем условия.',
      },
    ],
    [
      {
        ref: 'same#1',
        field: 'WHO_SPEAKS',
        quote: 'Сначала проверяем условия.',
      },
    ],
  ].map((observations) => [observations])
)(
  'missing same-field referenced ground omits a malformed cap field: %j',
  (observations) => {
    assert.equal(apply(fieldOf(capQuotation()), observations), null);
  }
);

test('Unicode emoji and combining marks remain byte-exact in a certified prefix', () => {
  const prefix = 'Проверяйте 🧩 и\u0301 вместе. ';
  const field = fieldOf(capQuotation(prefix));
  assert.equal(apply(field).text, prefix.trimEnd());
  assert.ok(field.text.startsWith(apply(field).text));
});

test('final reference union supplies prefix quotation grounds before new V2 cap policy', async () => {
  const crossFieldRefs = recorded.observations
    .filter((one) => one.field !== 'TONE')
    .slice(0, 10)
    .map((one) => one.ref);
  const winner = { ...recorded.fields[0], observationRefs: crossFieldRefs };
  const loser = {
    field: 'TONE',
    text: 'Проверяйте ясность рабочих объяснений.',
    observationRefs: recorded.fields[0].observationRefs,
  };
  const run = harness([winner, loser]);
  const result = await execute(run);
  const kept = result.proposal.fields.find((one) => one.field === 'TONE');
  assert.equal(kept.text, expectedTone);
  assert.deepEqual(kept.observationRefs, [
    ...crossFieldRefs,
    ...loser.observationRefs,
  ]);
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  assert.equal(result.calls.length, 9);
});

test('critic rejection of an earlier prefix quotation makes the new cap field unavailable without a retry', async () => {
  const run = harness();
  const absent = recorded.observations.find((one) => one.ref === 'smp-06#1');
  run.samples[5].text = run.samples[5].text.replace(absent.quote, '');
  const result = await execute(run);
  assert.equal(
    result.proposal.fields.find((one) => one.field === 'TONE'),
    undefined
  );
  assert.equal(
    result.observations.some(
      (one) => one.ref === absent.ref && one.quote === absent.quote
    ),
    false
  );
  assert.ok(
    result.rejected.some(
      (one) =>
        one.reason === 'QUOTE_NOT_GROUNDED' && one.sampleCode === 'smp-06'
    )
  );
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  assert.equal(result.calls.length, 9);
});

test('all omitted malformed cap fields use the existing unavailable service outcome with nine calls', async () => {
  const run = harness(
    recorded.fields.map((one) => ({
      ...one,
      text: capQuotation('Проверяйте условия вместе '),
    }))
  );
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

test('V1 generation and historical word display preserve the exact fresh600 output', async () => {
  const run = harness([recorded.fields[0]]);
  for (const sample of run.samples)
    for (const observation of sample.observations)
      if (observation.field === 'TOPICS') observation.field = 'WHO_SPEAKS';
  const result = await pipeline.runAssist({
    samples: run.samples,
    measurement,
    transport: run.transport,
    sampleLimit: 8,
  });
  assert.deepEqual(result.proposal.fields, run.reduced.fields);
  assert.deepEqual(run.seen, [...Array(8).fill('map'), 'reduce']);
  const words = loadTypeScriptModule(base + 'metric-words.ts');
  for (const field of recorded.fields)
    assert.equal(
      words.proposalInWords({ fields: [{ text: field.text }] }).fields[0].text,
      field.text
    );
});
