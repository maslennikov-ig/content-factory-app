'use strict';

/**
 * Провод, а не измерение.
 *
 * `post-layout.ts` уже посчитан и проверен своим набором
 * (`tests/brand-voice.post-layout.test.cjs`) — этот файл не переизмеряет
 * четыре числа, он проверяет, что они доходят: до разбора, до промпта модели,
 * до хранения и до профиля, которым продукт правда пользуется.
 *
 * Эпик уже дважды обжигался ровно на последнем шаге: новое поле доходило до
 * содержимого профиля и не доходило до списка известных валидатору полей,
 * после чего КАЖДАЯ активация отвергалась `unknown_field`
 * (`content.persona`, затем `voice.directions`). Раздел «профиль» ниже
 * доказывает мутацией, что тест правда упал бы, а не тавтология.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const pack = loadTypeScriptModule(`${base}/locale-pack.ru.ts`).RU_LOCALE_PACK;
const layout = loadTypeScriptModule(`${base}/post-layout.ts`);
const analyzer = loadTypeScriptModule(`${base}/analyzer.ts`);
const pipeline = loadTypeScriptModule(`${base}/assist.pipeline.ts`);
const contract = loadTypeScriptModule(`${base}/assist.contract.ts`);
const repository = loadTypeScriptModule(`${base}/voice-sample.repository.ts`);
const validation = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.validation.ts'
);

const corpus = (count) =>
  Array.from({ length: count }, (unused, index) => ({
    code: `smp-${index}`,
    text:
      `Сел разбирать прогон номер ${index} и посчитал руками, потому что глазами такое не ловится.\n` +
      'Вышло чуть иначе, чем ждал: разница не держится между попытками.\n\n' +
      'Записал сюда, чтобы не забыть, — своей памяти в этом месте я уже не верю. Все замеры лежат в таблице.',
    language: 'ru',
    contentHash: `hash-${index}`,
  }));

describe('разбор считает раскладку рядом с привычками поста', () => {
  it('измерение из анализатора совпадает с прямым вызовом computePostLayout', () => {
    const samples = corpus(6);
    const measured = analyzer.analyzeBrandVoice(samples, { language: 'ru' });
    const direct = layout.computePostLayout(
      samples.map((one) => ({ text: one.text })),
      pack
    );

    expect(measured.postLayout).toEqual(direct);
    expect(measured.postLayout.softBreakRate).toBeGreaterThan(0);
    expect(measured.postLayout.blockBreakRate).toBeGreaterThan(0);
  });

  it('меньше пяти постов — раскладки нет вовсе, а не нули', () => {
    const measured = analyzer.analyzeBrandVoice(corpus(4), { language: 'ru' });
    expect(measured.postLayout).toBeNull();
  });
});

describe('модель может назвать метрику раскладки, а не только шкалу и привычку', () => {
  it.each(layout.POST_LAYOUT_METRIC_KEYS)('%s проходит схему наблюдения', (metric) => {
    const accepted = contract.observationSchema.parse({
      field: 'SENTENCE_LENGTH',
      metric,
      quote: 'мягкий перенос строки середина мысли',
      claim: 'Автор переносит строку мягко, не оставляя пустой.',
    });
    expect(accepted.metric).toBe(metric);
  });

  it('произвольная строка метрикой не становится', () => {
    expect(() =>
      contract.observationSchema.parse({
        field: 'TONE',
        metric: 'notARealMetric',
        quote: 'что угодно длиной больше восьми знаков',
        claim: 'Утверждение длиной больше восьми знаков.',
      })
    ).toThrow();
  });
});

describe('промпт показывает раскладку модели рядом с привычками поста', () => {
  const samples = corpus(6);
  const measured = analyzer.analyzeBrandVoice(samples, { language: 'ru' });

  it('map-промпт называет softBreakRate', () => {
    const prompt = pipeline.mapPrompt(samples[0], measured, 'ru');
    expect(prompt).toContain('softBreakRate ·');
    expect(prompt).toContain('oneSentenceBlockShare ·');
  });

  it('без раскладки (короткий корпус) промпт не показывает null', () => {
    const short = analyzer.analyzeBrandVoice(corpus(4), { language: 'ru' });
    expect(short.postLayout).toBeNull();
    const prompt = pipeline.mapPrompt(corpus(4)[0], short, 'ru');
    expect(prompt).not.toMatch(/null|undefined/);
    expect(prompt).not.toContain('softBreakRate');
  });

  it('reduce-промпт несёт раскладку по всему корпусу, когда она передана', () => {
    const withLayout = pipeline.reducePrompt(
      [
        {
          ref: 'smp-0#1',
          sampleCode: 'smp-0',
          field: 'SENTENCE_LENGTH',
          metric: 'blockBreakRate',
          quote: 'Записал числа в таблицу, чтобы не забыть',
          claim: 'Автор оставляет пустую строку между мыслями.',
        },
      ],
      'ru',
      measured.postHabits,
      measured.postLayout
    );
    expect(withLayout).toContain('blockBreakRate');
  });
});

describe('хранение: старый разбор читается без раскладки, а не нулями', () => {
  it('buildMeasurementMetrics хранит раскладку, когда она есть', () => {
    const samples = corpus(6);
    const measured = analyzer.analyzeBrandVoice(samples, { language: 'ru' });
    const metrics = repository.buildMeasurementMetrics(measured);
    expect(metrics.postLayout).toEqual(measured.postLayout);
  });

  it('короткий корпус — ключа postLayout в хранимых метриках нет вовсе', () => {
    // Тот же приём, что и у postHabits: отсутствие ключа, а не `null` и не
    // ноль. Так строка, посчитанная до 2026-08-30 (`brand-voice-analyzer/1.0.0`,
    // никогда не считавшая раскладку), и строка с коротким корпусом читаются
    // одинаково честно — «не измерено», а не «автор так не делает».
    const measured = analyzer.analyzeBrandVoice(corpus(4), { language: 'ru' });
    const metrics = repository.buildMeasurementMetrics(measured);
    expect('postLayout' in metrics).toBe(false);
  });

  it('чтение старой строки (без ключа postLayout вовсе) не роняет и не выдумывает нули', () => {
    // Строка, как она реально лежит в базе до этой задачи: JSON без ключа.
    const oldRow = { scales: {}, rejected: [] };
    // Тот же приём чтения, каким пользуется voice.service.ts в textCheck: `?? null`.
    expect(oldRow.postLayout ?? null).toBeNull();
    expect(layout.renderPostLayout(oldRow.postLayout ?? null, 'ru')).toBe('');
  });
});

describe('профиль: ключ раскладки объявлен в валидаторе содержимого, и мутация это доказывает', () => {
  const contentWith = (postLayout) => ({
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
      traits: [{ name: 'Тон', guidance: 'Разговорный и прямой.' }],
      pointOfView: 'first_person',
      formality: 'conversational',
      emojiPolicy: 'restrained',
      hashtagPolicy: 'none',
      ...(postLayout ? { postLayout } : {}),
    },
    lexicon: { preferred: [], avoid: [] },
    guardrails: { prohibitedTopics: [], prohibitedClaims: [], requiredPhrases: [] },
    examples: [{ kind: 'on_brand', text: 'Собственный пост автора.' }],
    platformOverrides: [],
  });

  const issuesOf = (validationModule, content) => {
    const result = validationModule.validateBrandProfileContent(content, {
      forActivation: true,
    });
    return 'issues' in result ? result.issues : [];
  };

  const VALID_LAYOUT = {
    softBreakRate: 12,
    blockBreakRate: 4,
    meanBlockChars: 180,
    oneSentenceBlockShare: 30,
  };

  it('профиль с раскладкой проходит валидатор целиком', () => {
    expect(issuesOf(validation, contentWith(VALID_LAYOUT))).toEqual([]);
  });

  it('профиль без раскладки остаётся читаемым (версии до этой задачи)', () => {
    expect(issuesOf(validation, contentWith(undefined))).toEqual([]);
  });

  it('лишний ключ внутри самой раскладки отклоняется', () => {
    expect(
      issuesOf(validation, contentWith({ ...VALID_LAYOUT, extra: 1 }))
    ).toContain('voice.postLayout.extra:unknown_field');
  });

  it('отрицательное число в раскладке отклоняется', () => {
    expect(
      issuesOf(
        validation,
        contentWith({ ...VALID_LAYOUT, softBreakRate: -1 })
      )
    ).toContain('voice.postLayout.softBreakRate:invalid');
  });

  /**
   * Мутационное доказательство.
   *
   * Загружает `brand-profile.validation.ts` заново, из текста, из которого
   * вырезана строка `'postLayout',` в списке известных полей `voice` — то
   * есть воспроизводит ровно ту регрессию, которая дважды стоила продукту
   * активации ("content.persona:unknown_field", затем
   * "voice.directions:unknown_field"). Если этот тест не различает такую
   * мутацию от рабочего кода, тест выше — тавтология, а не проверка.
   */
  function loadMutatedValidation() {
    const filePath = path.resolve(
      __dirname,
      '..',
      base,
      '..',
      'brand-profile',
      'brand-profile.validation.ts'
    );
    const source = fs.readFileSync(filePath, 'utf8');
    const needle = "'directions',\n      'postLayout',\n    ]);";
    expect(source).toContain(needle); // страхует от расхождения форматирования
    const mutated = source.replace(needle, "'directions',\n    ]);");
    expect(mutated).not.toBe(source);

    const compiled = ts.transpileModule(mutated, {
      fileName: filePath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
      },
    }).outputText;
    const mod = { exports: {} };
    new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(
      mod.exports,
      require,
      mod,
      filePath,
      path.dirname(filePath)
    );
    return mod.exports;
  }

  it('убери ключ из списка известных — и тот же профиль краснеет', () => {
    const mutated = loadMutatedValidation();
    const issues = issuesOf(mutated, contentWith(VALID_LAYOUT));
    expect(issues).toContain('voice.postLayout:unknown_field');
  });
});
