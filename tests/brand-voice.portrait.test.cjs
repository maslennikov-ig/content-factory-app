'use strict';

/**
 * The portrait, and the two ways it fails.
 *
 * It is prose, so the grounding check that protects every other field — is this
 * quote really in the sample it names — cannot be applied to it word for word.
 * Two weaker checks stand in, and they catch different failures.
 *
 * The first is the same one: a portrait citing no observation the corpus
 * contains is a portrait of nobody, and it is dropped rather than shown.
 *
 * The second exists because prose has a failure quotes do not. Asked to
 * describe an author, a model writes the same paragraph about everybody —
 * engaging, professional, a vibrant style, deep expertise. That paragraph is
 * worse than an empty field, because it looks like an answer and occupies the
 * place the real portrait was meant to fill. One such word is a coincidence;
 * two are a genre.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const contract = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/assist.contract.ts'
);
const pipeline = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/assist.pipeline.ts'
);

const GOOD =
  'Он ведёт участок и пишет о том, что сам чинил на этой неделе. Считает ' +
  'очевидным, что цифру без прогона показывать нельзя, и не объясняет этого. ' +
  'Раздражается на слова «оптимизация» и «синергия» и говорит вместо них, что ' +
  'именно сломалось. С читателем разговаривает как с коллегой.';

describe('клише ловятся списком, а не на глаз', () => {
  it('портрет без оценок манеры проходит', () => {
    expect(contract.portraitCliches(GOOD)).toEqual([]);
  });

  it('одно слово — не приговор', () => {
    const one = `${GOOD} Пишет о глубоких ямах в расписании.`;

    expect(contract.portraitCliches(one).length).toBeLessThan(
      contract.PORTRAIT_CLICHE_LIMIT
    );
  });

  it('типовая похвала ловится целиком', () => {
    const bland =
      'Автор обладает уникальным и увлекательным стилем, демонстрирует ' +
      'глубокую экспертизу и профессиональный подход к каждой теме.';

    expect(contract.portraitCliches(bland).length).toBeGreaterThanOrEqual(
      contract.PORTRAIT_CLICHE_LIMIT
    );
  });

  it('английская похвала ловится тем же списком', () => {
    const bland =
      'An engaging and professional writer with a compelling, insightful voice.';

    expect(contract.portraitCliches(bland).length).toBeGreaterThanOrEqual(
      contract.PORTRAIT_CLICHE_LIMIT
    );
  });

  it('окончание слова не спасает от проверки', () => {
    expect(contract.portraitCliches('Стиль увлекательная и профессиональная'))
      .toHaveLength(2);
  });
});

describe('схема портрета не пускает ни ярлык, ни сочинение', () => {
  const valid = { text: GOOD, observationRefs: ['smp-01#1', 'smp-02#3'] };

  it('нормальный портрет проходит', () => {
    expect(contract.portraitSchema.parse(valid)).toEqual(valid);
  });

  it('ярлык в две строки — это снова восемь шкал', () => {
    expect(() =>
      contract.portraitSchema.parse({ ...valid, text: 'Инженер, пишет коротко.' })
    ).toThrow();
  });

  it('портрет длиннее самой задачи отвергается', () => {
    expect(() =>
      contract.portraitSchema.parse({ ...valid, text: 'а'.repeat(1201) })
    ).toThrow();
  });

  it('одной ссылки мало: портрет опирается на корпус, а не на один текст', () => {
    expect(() =>
      contract.portraitSchema.parse({ ...valid, observationRefs: ['smp-01#1'] })
    ).toThrow();
  });
});

describe('приём портрета в предложение', () => {
  const known = new Set(['smp-01#1', 'smp-02#3']);
  const withPortrait = (portrait) => ({ portrait, fields: [] });

  it('обоснованный портрет доходит', () => {
    const portrait = { text: GOOD, observationRefs: ['smp-01#1'] };

    expect(pipeline.keptPortrait(withPortrait(portrait), known)).toBe(portrait);
  });

  it('портрет, ссылающийся в пустоту, отбрасывается', () => {
    const portrait = { text: GOOD, observationRefs: ['smp-09#7'] };

    expect(pipeline.keptPortrait(withPortrait(portrait), known)).toBeNull();
  });

  it('портрет из похвал отбрасывается, хотя ссылки настоящие', () => {
    const portrait = {
      text:
        'Автор обладает уникальным и увлекательным стилем и профессиональным ' +
        'подходом к каждой теме, что делает его тексты заметными.',
      observationRefs: ['smp-01#1'],
    };

    expect(pipeline.keptPortrait(withPortrait(portrait), known)).toBeNull();
  });

  it('отсутствие портрета — не ошибка разбора', () => {
    expect(pipeline.keptPortrait(withPortrait(null), known)).toBeNull();
    expect(pipeline.keptPortrait({ fields: [] }, known)).toBeNull();
  });
});

describe('промпт просит портрет и называет запрет', () => {
  const ru = pipeline.reducePrompt(
    [
      {
        ref: 'smp-01#1',
        sampleCode: 'smp-01',
        field: 'TONE',
        metric: null,
        quote: 'цифру без прогона не покажу',
        claim: 'не доверяет числам без проверки',
      },
    ],
    'ru'
  );

  it('вопросы с фактическими ответами, а не «опишите автора»', () => {
    expect(ru).toContain('чем он занят и что делает руками');
    expect(ru).toContain('что его раздражает');
    expect(ru).toContain('в третьем лице');
  });

  it('запрет назван словами, которые модель и напишет', () => {
    expect(ru).toContain('увлекательный');
    expect(ru).toContain('профессиональный');
    expect(ru).toContain('будет отвергнут');
  });

  it('английский просит то же самое', () => {
    const en = pipeline.reducePrompt([], 'en');

    expect(en).toContain('PORTRAIT');
    expect(en).toContain('what irritates them');
    expect(en).toContain('"engaging"');
  });
});

/**
 * The half that was never checked: a portrait the pipeline kept and the
 * profile could not hold.
 *
 * Every case above tests whether the model's portrait survives — grounding,
 * clichés, the schema, the prompt. None of them tested whether the surviving
 * portrait can be switched on, and it could not: `persona` was added to
 * `BrandProfileContentV1` on 2026-08-25 and to the validator's list of known
 * content fields never, so `assertActivatable` refused every activation
 * carrying one with `content.persona:unknown_field`. The feature the epic
 * turned to after obedience failed to produce resemblance was unreachable in
 * the product, and the wizard's own suites did not notice because they stop at
 * the proposal.
 *
 * It cost a paid assist run to find, on 2026-08-25, while rebuilding the
 * owner's voice for `pl1.20`.
 */
describe('портрет доходит до профиля, а не только до предложения', () => {
  const validation = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.validation.ts'
  );

  /** The shape `contentFrom` builds, minus everything this case is not about. */
  const contentWith = (persona) => ({
    ...(persona === undefined ? {} : { persona }),
    project: {
      name: 'Пространство',
      oneLineDescription: 'Профиль голоса, собранный по образцам.',
      offerings: [],
      audiences: [{ name: 'Читатели канала' }],
      contentGoals: ['Публикации в голосе этого профиля'],
    },
    voice: {
      defaultLanguage: 'ru',
      allowedLanguages: ['ru', 'en'],
      traits: [
        { name: 'Кто говорит', guidance: 'Автор говорит от первого лица.' },
        { name: 'Тон', guidance: 'Разговорный и прямой.' },
      ],
      pointOfView: 'first_person',
      formality: 'conversational',
      emojiPolicy: 'restrained',
      hashtagPolicy: 'none',
      postLength: { median: 823, low: 400, high: 1400 },
    },
    lexicon: { preferred: [], avoid: [] },
    guardrails: {
      prohibitedTopics: [],
      prohibitedClaims: [],
      requiredPhrases: [],
    },
    examples: [{ kind: 'on_brand', text: 'Собственный пост автора.' }],
    platformOverrides: [],
  });

  const issuesOf = (content) => {
    const result = validation.validateBrandProfileContent(content, {
      forActivation: true,
    });
    return 'issues' in result ? result.issues : [];
  };

  it('профиль с принятым портретом можно включить', () => {
    expect(
      issuesOf(
        contentWith({
          kind: 'PERSON',
          portrait: GOOD,
          portraitRefs: ['smp-02#1', 'smp-05#3'],
        })
      )
    ).toEqual([]);
  });

  it('бренд — то же самое поле с другим значением', () => {
    expect(
      issuesOf(contentWith({ kind: 'BRAND', portrait: GOOD, portraitRefs: ['smp-01#1'] }))
    ).toEqual([]);
  });

  it('профиль без портрета остаётся читаемым', () => {
    // Каждый профиль, разобранный до 25.08.2026, — такой. Обязательное поле
    // сделало бы их не старыми, а нечитаемыми.
    expect(issuesOf(contentWith(undefined))).toEqual([]);
  });

  it('поле разрешено, но не бесконтрольно: вид проверяется', () => {
    expect(
      issuesOf(contentWith({ kind: 'ЧЕЛОВЕК', portrait: GOOD, portraitRefs: [] }))
    ).toContain('persona.kind:invalid');
  });

  it('портрет длиннее того, что модели разрешено написать, отвергается', () => {
    // Тот же потолок 1200, который стоит в схеме предложения: портрет,
    // который модели позволено написать, профиль обязан суметь сохранить.
    expect(
      issuesOf(
        contentWith({
          kind: 'PERSON',
          portrait: 'а'.repeat(1_201),
          portraitRefs: [],
        })
      )
    ).toContain('persona.portrait:too_long');
  });

  it('лишнее поле внутри портрета не проходит молча', () => {
    expect(
      issuesOf(
        contentWith({ kind: 'PERSON', portrait: GOOD, mood: 'весёлый' })
      )
    ).toContain('persona.mood:unknown_field');
  });
});
