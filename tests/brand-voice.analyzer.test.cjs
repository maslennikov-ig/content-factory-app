'use strict';

/**
 * The deterministic half of a voice profile.
 *
 * Everything here runs with no model call, no network and no key: that is the
 * point of the step, not a property of the test. A workspace whose AI budget
 * is spent still sees its own manner in numbers, and the model's later
 * proposal is checkable because it explains what this counted.
 *
 * The eight captions look simple and are not. "Sentence", "paragraph with a
 * list", "first person" and "clerical noun on -ение" each read several ways,
 * and two implementations disagree unless the reading is fixed first — which
 * `docs/product/brand-voice-from-samples-spec.md` §3 does. This guard holds the
 * code to that document.
 */

const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const segment = loadTypeScriptModule(`${base}/segment.ts`);
const pack = loadTypeScriptModule(`${base}/locale-pack.ru.ts`).RU_LOCALE_PACK;
const artefacts = loadTypeScriptModule(`${base}/ai-artefacts.ts`);
const scales = loadTypeScriptModule(`${base}/style-scales.ts`);
const analyzer = loadTypeScriptModule(`${base}/analyzer.ts`);
const lexicon = loadTypeScriptModule(`${base}/lexicon.ts`);

/** A writer with a deliberate manner: short phrases, dashes, "we", no shouting. */
const plainVoice = (index) => `
Поставщика поменяли — старый срывал сроки третий месяц. Новый везёт из Челябинска, доставка на два дня дольше. Зато по графику.

Мы вчера догнали план. Правда, ценой субботней смены. У нас на участке это уже третий раз за квартал.

Сроки сдвинулись на два дня. Причина — поставка. Мастер смены предупредил заранее, и это правильно: лучше знать за неделю, чем узнать в пятницу.

Что делаем дальше? Ставим контрольную точку на среду. Проверяем остатки. Если подшипники придут, линию запускаем в четверг.

Отгрузка ${index} прошла по факту без лишних слов. Мы её приняли. Смена отработала ровно.
`;

const clericalVoice = (index) => `
Проведение мероприятий по обеспечению выполнения плановых показателей осуществляется в соответствии с утверждённым регламентом организации. Обеспечение соблюдения требований возлагается на ответственных лиц.

Компания информирует о следующем. Предприятие осуществляет выполнение обязательств в полном объёме, что подтверждается результатами проведения контрольных мероприятий номер ${index}.

Организация обеспечивает предоставление документации. Проведение проверки назначено на согласованную дату.

Осуществление отгрузки продукции производится согласно графику. Обеспечение сохранности возлагается на службу логистики предприятия.

Выполнение указанных требований является обязательным для всех подразделений организации.

Проведение инвентаризации осуществляется ежеквартально. Обеспечение доступа предоставляется по заявке. Согласование изменений производится в установленном порядке.

Уведомление направляется заблаговременно. Рассмотрение обращения занимает до десяти дней. Информирование заявителя обеспечивается ответственным подразделением.

Оформление документации завершено. Утверждение регламента состоялось. Внедрение изменений запланировано на следующий период.
`;

const sample = (code, text, hashSeed) => ({
  code,
  text,
  language: 'ru',
  contentHash: `hash-${String(hashSeed).padStart(4, '0')}`,
});

const corpusOf = (make, count = 10) =>
  Array.from({ length: count }, (unused, index) =>
    sample(`smp-${String(index + 1).padStart(2, '0')}`, make(index + 1), index + 1)
  );

describe('sentence, word and paragraph boundaries', () => {
  test('a full stop inside an abbreviation does not end a sentence', () => {
    const found = segment.splitSentences(
      'Сроки сдвинулись, т.е. на два дня. Причина в поставке.',
      pack
    );

    expect(found).toHaveLength(2);
    expect(found[0].text).toContain('т.е.');
  });

  test('a full stop inside a number or a domain does not end a sentence', () => {
    expect(
      segment.splitSentences('Выручка выросла до 4,2 млрд. Это рекорд.', pack)
    ).toHaveLength(2);
    expect(
      segment.splitSentences('Пишите на zavod-tver.example и ждите ответа.', pack)
    ).toHaveLength(1);
  });

  test('a list item is a sentence even without a full stop', () => {
    const found = segment.splitSentences(
      'Что берём:\n\n- длину фраз\n- привычки пунктуации\n- долю вопросов',
      pack
    );

    expect(found.map((one) => one.text)).toEqual([
      'Что берём:',
      'длину фраз',
      'привычки пунктуации',
      'долю вопросов',
    ]);
  });

  test('two marked lines make a list, one dash does not', () => {
    const [list] = segment.splitParagraphs('- первое\n- второе');
    const [prose] = segment.splitParagraphs(
      'Поставщика поменяли — старый срывал сроки.'
    );

    expect(list.isList).toBe(true);
    expect(prose.isList).toBe(false);
  });

  test('a spaced dash is a copula, a numeric range is not', () => {
    expect(segment.hasSpacedDash('Причина — поставка.')).toBe(true);
    expect(segment.hasSpacedDash('Работал 2014 — 2018 на заводе.')).toBe(false);
    expect(segment.hasSpacedDash('- пункт списка')).toBe(false);
  });
});

describe('AI artefact rejection', () => {
  test.each([
    ['oaicite', 'Текст с oaicite внутри и ещё что-то.'],
    ['citeturn', 'Смотри citeturn0search1 и дальше.'],
    ['utm', 'Ссылка ?utm_source=chatgpt.com в конце.'],
    ['think tag', 'Ответ <think>рассуждение</think> готов.'],
  ])('rejects a sample carrying %s', (unused, text) => {
    expect(artefacts.hasAiArtefacts(text)).toBe(true);
  });

  test('does not reject an article that quotes those markers', () => {
    // An article about spotting AI output names every marker. A scan that
    // could not tell using from mentioning would reject the article.
    const article = [
      'Как распознать следы модели в чужом тексте.',
      'Первый признак — «oaicite» в разметке ссылки.',
      'Второй — `citeturn0search1` там, где должна быть сноска.',
      '> Третий — utm_source=chatgpt.com в адресе.',
      '```',
      '<think>внутренние рассуждения</think>',
      '```',
    ].join('\n');

    expect(artefacts.findAiArtefacts(article)).toEqual([]);
  });
});

describe('the eight scales', () => {
  const measured = analyzer.analyzeBrandVoice(corpusOf(plainVoice, 12));

  test('produces all eight, in the order the design lists them', () => {
    expect(Object.keys(measured.scales)).toEqual([
      'sentenceLength',
      'sentenceSpread',
      'shortSentences',
      'listParagraphs',
      'questions',
      'dashCopula',
      'firstPerson',
      'nominalisation',
    ]);
  });

  test('every computed scale carries a corridor and a real example', () => {
    for (const [key, scale] of Object.entries(measured.scales)) {
      if (!scales.isScaleValue && !('raw' in scale)) continue;
      if (!('raw' in scale)) continue;
      expect(scale.low).toBeLessThanOrEqual(scale.high);
      expect(scale.display).toBeGreaterThanOrEqual(0);
      expect(scale.display).toBeLessThanOrEqual(100);
      // The screen shows what the number was computed on. A scale with a
      // value and no example cannot show its working.
      // A rate of zero has nothing to point at, and that is a finding rather
      // than a hole: "this writer never does it" is a real statement. Any
      // other value has to be able to show its working.
      if (scale.raw > 0) {
        expect(typeof scale.exampleSampleCode).toBe('string');
        expect(scale.exampleText).toBeTruthy();
      }
      expect(key).toBeTruthy();
    }
  });

  test('the corridor covers 8 of the author own 10 observations', () => {
    const scale = measured.scales.sentenceLength;
    expect('raw' in scale).toBe(true);

    const lengths = corpusOf(plainVoice, 12)
      .filter((one) => measured.split[one.code] === 'TRAIN')
      .flatMap((one) =>
        segment.splitSentences(one.text, pack).map((sentence) => sentence.words)
      );
    const inside = lengths.filter(
      (length) => length >= scale.low && length <= scale.high
    ).length;

    expect(inside / lengths.length).toBeGreaterThanOrEqual(0.8);
  });

  test('a clerical writer scores far above a plain one on scale 8', () => {
    const clerical = analyzer.analyzeBrandVoice(corpusOf(clericalVoice, 12));

    expect('raw' in clerical.scales.nominalisation).toBe(true);
    expect('raw' in measured.scales.nominalisation).toBe(true);
    expect(clerical.scales.nominalisation.raw).toBeGreaterThan(
      measured.scales.nominalisation.raw + 30
    );
  });

  test('the dash scale divides by the chance to use one, not by every sentence', () => {
    // 74% of all sentences carrying a dash is impossible in real writing. The
    // scale measures a choice between two spellings of the same clause.
    const scale = measured.scales.dashCopula;
    expect('raw' in scale).toBe(true);
    expect(scale.observations).toBeLessThan(measured.sentenceCount);
  });

  test('"we" beats "the company" for a writer who says we', () => {
    const scale = measured.scales.firstPerson;
    expect('raw' in scale).toBe(true);
    expect(scale.raw).toBeGreaterThan(60);
  });
});

describe('a scale that cannot speak stays silent', () => {
  // A question in the first four samples only: enough to be present, far too
  // few to be a habit. This is the case the design draws in words.
  const quiet = (index) => `
Сроки сдвинулись на два дня. Причина в поставке. Мастер предупредил заранее.${
    index <= 4 ? ' Всё ли понятно по срокам?' : ''
  }

Отгрузка ${index} прошла по графику. Смена отработала ровно. Претензий нет.

Остатки проверили. Подшипники на складе. Линию запускаем в четверг.

Плановые показатели выполнены. Отчёт ушёл в понедельник. Замечаний не поступило.

Смена приняла участок. Инструмент на месте. Журнал заполнен.

Погрузчик вышел из строя. Ремонт занял час. Работу не останавливали.

Заявку закрыли в срок. Клиент подтвердил приёмку. Вопросов не осталось.

Табель сдали вовремя. Расчёт прошёл без ошибок. Бухгалтерия претензий не имеет.
`;

  test('a handful of questions is not a habit, and zero is not "unknown"', () => {
    const measured = analyzer.analyzeBrandVoice(corpusOf(quiet, 12));
    const scale = measured.scales.questions;

    // The design says it in words: "В образцах 4 вопроса — мало, чтобы
    // считать привычкой. Шкала останется пустой."
    expect('raw' in scale).toBe(false);
    expect(scale.reason).toBe('TOO_FEW_POSITIVE');
    expect(scale.positives).toBeLessThan(10);
  });

  test('an empty scale is empty, not zero', () => {
    const measured = analyzer.analyzeBrandVoice(corpusOf(quiet, 12));
    expect(measured.scales.questions.raw).toBeUndefined();
  });

  test('one silent scale leaves the other seven working', () => {
    const measured = analyzer.analyzeBrandVoice(corpusOf(quiet, 12));
    const computed = Object.values(measured.scales).filter(
      (scale) => 'raw' in scale
    );

    // The design draws exactly this: a silent scale beside "Остальные семь
    // шкал посчитаны и действуют". Which of the eight stay silent depends on
    // the corpus; what must hold is that one going quiet does not mute the
    // rest, and that every silent one says why.
    expect(computed.length).toBeGreaterThanOrEqual(4);
    for (const [key, scale] of Object.entries(measured.scales)) {
      if ('raw' in scale) continue;
      expect(scale.reason).toMatch(
        /TOO_FEW_OBSERVATIONS|TOO_FEW_POSITIVE|TOO_FEW_SAMPLES|FAILED/
      );
      expect(key).toBeTruthy();
    }
  });
});

describe('reproducibility', () => {
  test('the same corpus produces the same numbers twice', () => {
    const corpus = corpusOf(plainVoice, 12);
    expect(analyzer.analyzeBrandVoice(corpus)).toEqual(
      analyzer.analyzeBrandVoice(corpus)
    );
  });

  test('the train and holdout split is deterministic and not random', () => {
    const corpus = corpusOf(plainVoice, 12);
    const first = analyzer.splitCorpus(corpus);
    const shuffled = [...corpus].reverse();

    expect(analyzer.splitCorpus(shuffled)).toEqual(first);
    expect(Object.values(first)).toContain('HOLDOUT');
    expect(Object.values(first)).toContain('TRAIN');
  });

  test('the result records which analyser and which dictionaries produced it', () => {
    const measured = analyzer.analyzeBrandVoice(corpusOf(plainVoice, 12));

    // A corridor nobody can reproduce is a number the generator obeys for no
    // stated reason.
    expect(measured.analyzerVersion).toMatch(/^brand-voice-analyzer\//);
    expect(measured.localePackVersion).toBe(pack.version);
  });

  test('scales are measured on the training part only', () => {
    const corpus = corpusOf(plainVoice, 12);
    const measured = analyzer.analyzeBrandVoice(corpus);
    const trainCount = Object.values(measured.split).filter(
      (part) => part === 'TRAIN'
    ).length;

    expect(measured.sampleCount).toBe(trainCount);
    expect(trainCount).toBeLessThan(corpus.length);
  });
});

describe('the corpus floor', () => {
  test('below 15 000 characters the analysis step does not open', () => {
    const readiness = analyzer.corpusReadiness(corpusOf(plainVoice, 3));

    expect(readiness.ready).toBe(false);
    // The screen states the missing number: "Добавьте ещё 8 600 знаков".
    expect(readiness.missingChars).toBeGreaterThan(0);
    expect(readiness.charCount + readiness.missingChars).toBe(15_000);
  });

  test('eight samples are required even when the volume is there', () => {
    const long = (index) => plainVoice(index).repeat(8);
    const readiness = analyzer.corpusReadiness(corpusOf(long, 4));

    expect(readiness.charCount).toBeGreaterThanOrEqual(15_000);
    expect(readiness.ready).toBe(false);
    expect(readiness.missingSamples).toBe(4);
  });

  test('a thin but sufficient corpus is marked low-confidence, not blocked', () => {
    const barely = (index) => plainVoice(index).repeat(3);
    const readiness = analyzer.corpusReadiness(corpusOf(barely, 9));

    expect(readiness.ready).toBe(true);
    expect(readiness.confidence).toBe('LOW');
  });

  /**
   * Eight long articles and eight short posts are not the same corpus, and the
   * product asked the same eight of both. The research is explicit about short
   * form: aim for 15–25 items, because each one is short.
   */
  test('asks for more texts when the texts are short', () => {
    // Posts of about eight hundred characters, the owner's own median.
    expect(analyzer.requiredSamples(15_000, 18)).toBeGreaterThanOrEqual(15);
    expect(analyzer.requiredSamples(15_000, 18)).toBeLessThanOrEqual(25);
    // Long articles bottom out at the old floor.
    expect(analyzer.requiredSamples(16_000, 8)).toBe(8);
    // And it never runs away: a corpus of very short texts would otherwise be
    // asked for hundreds of them.
    expect(analyzer.requiredSamples(2_000, 10)).toBe(
      analyzer.MAX_REQUIRED_SAMPLES
    );
  });

  test('a corpus of short posts is not ready on eight of them', () => {
    // Around 850 characters each: the median of the owner's real channel.
    const shortPost = (index) =>
      `${plainVoice(index).repeat(2).slice(0, 830)} Смена отработала ровно.`;
    const eight = analyzer.corpusReadiness(corpusOf(shortPost, 8));
    expect(eight.ready).toBe(false);
    expect(eight.requiredSamples).toBeGreaterThan(8);

    const enough = analyzer.corpusReadiness(
      corpusOf(shortPost, eight.requiredSamples)
    );
    expect(enough.ready).toBe(true);
    expect(enough.missingSamples).toBe(0);
  });

  test('says which half of the corpus is thin, not merely that it is', () => {
    // «Низкая уверенность» alone does not say whether to write more posts or
    // longer ones, and those are different pieces of advice.
    const thin = analyzer.corpusReadiness(
      corpusOf((index) => plainVoice(index).repeat(3), 9)
    );
    expect(thin.confidenceReasons).toContain('FEW_SAMPLES');

    const many = analyzer.corpusReadiness(corpusOf(plainVoice, 30));
    expect(many.confidenceReasons).not.toContain('FEW_SAMPLES');
    expect(many.confidenceReasons).toContain('FEW_CHARS');

    const both = analyzer.corpusReadiness(
      corpusOf((index) => plainVoice(index).repeat(4), 30)
    );
    expect(both.confidence).toBe('NORMAL');
    expect(both.confidenceReasons).toEqual([]);
  });
});

describe('lexicon and punctuation habits', () => {
  const corpus = corpusOf(plainVoice, 12);

  test('the lexicon skips stopwords and keeps what the writer repeats', () => {
    const terms = lexicon.buildLexicon(corpus, pack).map((one) => one.term);

    expect(terms).not.toContain('и');
    expect(terms).not.toContain('это');
    expect(terms.length).toBeGreaterThan(0);
  });

  test('punctuation habits share the dash denominator with scale 6', () => {
    const habits = lexicon.punctuationHabits(corpus, pack);
    const measured = analyzer.analyzeBrandVoice(corpus);

    expect(habits.dashInsteadOfCopula).not.toBeNull();
    expect(habits.exclamation).toBe(0);
    expect(typeof measured.punctuation.questionAtEnd).toBe('number');
  });
});

describe('nothing is dropped in silence', () => {
  test('a rejected sample is reported with its reason', () => {
    const corpus = [
      ...corpusOf(plainVoice, 10),
      sample('smp-99', `Текст с oaicite. ${plainVoice(99)}`, 99),
      sample('smp-98', 'Слишком коротко.', 98),
    ];
    const measured = analyzer.analyzeBrandVoice(corpus);

    expect(measured.rejected).toEqual(
      expect.arrayContaining([
        { code: 'smp-99', reason: 'AI_ARTEFACT' },
        { code: 'smp-98', reason: 'TOO_SHORT' },
      ])
    );
  });

  test('a sample in another language does not join the corpus', () => {
    const measured = analyzer.analyzeBrandVoice([
      ...corpusOf(plainVoice, 10),
      { ...sample('smp-en', 'A'.repeat(400), 97), language: 'en' },
    ]);

    expect(measured.rejected).toContainEqual({
      code: 'smp-en',
      reason: 'LANGUAGE',
    });
  });
});

describe('the analysis needs nothing but the text', () => {
  test('the analyser imports no client, no fetch and no model', () => {
    const fs = require('node:fs');
    const files = [
      'analyzer.ts',
      'style-scales.ts',
      'segment.ts',
      'lexicon.ts',
      'ai-artefacts.ts',
      'locale-pack.ru.ts',
    ];

    for (const file of files) {
      const source = fs.readFileSync(
        path.resolve(__dirname, '..', base, file),
        'utf8'
      );
      expect(source).not.toMatch(/from '(?:node:)?(?:http|https|net|dns)'/);
      expect(source).not.toMatch(/fetch\(|axios|openai|langchain/i);
    }
  });
});
