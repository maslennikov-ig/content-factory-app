'use strict';

/**
 * Holding a voice past the first paragraph.
 *
 * Every shipped brand-voice tool reports the same failure independently: the
 * profile goes in once as a prefix and the model drifts back to its defaults.
 * That is a property of the approach, not a bug in any one product, so this is
 * designed against rather than fixed once.
 *
 * The other half is honesty about the gate. No published constant activates a
 * voice profile, so what is asserted here is a conjunction of reasoned
 * conditions and the absence of a number pretending to be science.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { withCalibration } = require('./helpers/voice-calibration-fixture.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const retention = loadTypeScriptModule(`${base}/voice-retention.ts`);
const analyzer = loadTypeScriptModule(`${base}/analyzer.ts`);

const plain = (index) => `
Поставщика поменяли — старый срывал сроки третий месяц. Новый везёт из Челябинска, доставка на два дня дольше. Зато по графику.

Мы вчера догнали план. Правда, ценой субботней смены. У нас на участке это уже третий раз за квартал.

Сроки сдвинулись на два дня. Причина — поставка. Мастер смены предупредил заранее, и это правильно: лучше знать за неделю, чем узнать в пятницу.

Что делаем дальше? Ставим контрольную точку на среду. Проверяем остатки. Если подшипники придут, линию запускаем в четверг.

Отгрузка ${index} прошла по факту без лишних слов. Мы её приняли. Смена отработала ровно.
`;

const corpus = Array.from({ length: 14 }, (unused, index) => ({
  code: `smp-${String(index + 1).padStart(2, '0')}`,
  text: plain(index + 1),
  language: 'ru',
  contentHash: `hash-${String(index + 1).padStart(4, '0')}`,
}));

const raw = analyzer.analyzeBrandVoice(corpus);

/**
 * Тот же чиновничий язык, что и в проверках ниже, но за пределами корпуса.
 *
 * Служит отрицательными примерами для рабочей точки: с 27.08.2026 вердикт
 * читается против границ, снятых на самом авторе, и измерение без них честно
 * молчит вместо того, чтобы отвечать по константе, которая на трёх настоящих
 * корпусах отвергала до 71% собственных постов человека.
 */
const clericalSample = (index) => `
Проведение мероприятий ${index} по обеспечению выполнения плановых показателей осуществляется в соответствии с утверждённым регламентом организации предприятия.

Обеспечение соблюдения установленных требований возлагается на ответственных должностных лиц структурного подразделения в течение отчётного периода.

Организация обеспечивает предоставление необходимой документации в согласованные сроки при условии выполнения заявителем предусмотренных требований.

Осуществление отгрузки продукции производится согласно утверждённому графику поставок на текущий календарный период деятельности.
`;

const measurement = withCalibration(
  raw,
  Array.from({ length: 24 }, (unused, index) => plain(100 + index)),
  Array.from({ length: 24 }, (unused, index) => clericalSample(100 + index))
);

describe('the voice is restated at every boundary', () => {
  test('a thread of five items gets five injections, not one', () => {
    const block = retention.renderVoiceInjection({
      pointOfView: 'company_we',
      formality: 'neutral',
    });
    const plan = retention.planInjections(block, [
      'thread-item',
      'thread-item',
      'thread-item',
      'thread-item',
    ]);

    // The alternative costs the voice, which is the failure every comparable
    // product reports. Restating it costs tokens, which is the objection.
    expect(plan).toHaveLength(5);
    expect(plan[0].boundary).toBe('start');
    expect(new Set(plan.map((one) => one.text)).size).toBe(1);
  });

  test('the injection carries fields, prose and examples together', () => {
    const block = retention.renderVoiceInjection({
      pointOfView: 'company_we',
      formality: 'neutral',
      sentenceLength: { value: 14, low: 10, high: 18 },
      neverSay: ['мы рады сообщить'],
      prose: 'Спокойно и по делу.',
      examples: [{ text: 'Причина — поставка.' }],
    });

    // A combination rather than one of the three: fields for control, prose
    // for what a rule list cannot say, examples because concrete text teaches
    // voice better than adjectives.
    expect(block).toContain('company_we');
    expect(block).toContain('10–18');
    expect(block).toContain('мы рады сообщить');
    expect(block).toContain('Спокойно и по делу.');
    expect(block).toContain('example: Причина — поставка.');
  });

  test('no more than five examples travel, however many exist', () => {
    const block = retention.renderVoiceInjection({
      examples: Array.from({ length: 12 }, (unused, index) => ({
        text: `Пример ${index}.`,
      })),
    });

    expect(block.match(/example:/g)).toHaveLength(5);
  });
});

describe('checking a finished text against the author own corridors', () => {
  test('text written like the author sits inside', () => {
    const check = retention.checkText(plain(99), measurement);

    expect(check.total).toBeGreaterThan(0);
    // The line leads with the one answer a person wanted, not with the count
    // of scales. The count was an instrument reading dressed as a verdict, and
    // on the owner's real channel it separated his writing from a stranger's
    // in 48% of pairs — a coin.
    expect(check.summary).toMatch(/^Похоже на ваш обычный стиль/);
    expect(check.similarity.verdict).toBe('CLOSE');
  });

  test('a text unlike the author is told so as a remark, not as a refusal', () => {
    const clericalLine = `
Проведение мероприятий по обеспечению выполнения плановых показателей осуществляется в соответствии с утверждённым регламентом организации предприятия. Обеспечение соблюдения установленных требований возлагается на ответственных должностных лиц подразделения. Организация обеспечивает предоставление необходимой документации в согласованные сроки.
`;
    const check = retention.checkText(clericalLine, measurement);

    expect(check.similarity.verdict).toBe('FAR');
    // The wording matters: this is read over the post form while somebody is
    // writing. «Не прошёл проверку» is a verdict from an authority the product
    // does not have over a person's own writing.
    expect(check.summary).toMatch(/^На ваш обычный стиль это похоже мало/);
    expect(check.summary).not.toMatch(/ошибк|не прошёл|запрещ/i);
  });

  test('says it cannot tell for a measurement made before the measure existed', () => {
    const older = { ...measurement, voicePrint: null };
    const check = retention.checkText(plain(99), older);

    expect(check.similarity.verdict).toBe('UNKNOWN');
    expect(check.summary).toMatch(/^Сравнить не с чем/);
    // And it does not quietly fall back on the share of scales, which is the
    // number that could not answer this question in the first place.
    expect(check.summary).not.toMatch(/^\d+ шкал/);
  });

  test('text unlike the author is named, with the scale and the direction', () => {
    const clerical = `
Проведение мероприятий по обеспечению выполнения плановых показателей осуществляется в соответствии с утверждённым регламентом организации предприятия. Обеспечение соблюдения установленных требований возлагается на ответственных должностных лиц подразделения.

Компания информирует о следующем обстоятельстве. Предприятие осуществляет выполнение принятых обязательств в полном объёме, что подтверждается результатами проведения контрольных мероприятий.

Организация обеспечивает предоставление необходимой документации. Проведение проверки назначено на согласованную ранее дату заседания комиссии.
`.repeat(4);

    const check = retention.checkText(clerical, measurement);

    expect(check.outside.length).toBeGreaterThan(0);
    for (const verdict of check.outside) {
      expect(['above', 'below']).toContain(verdict.placement);
      expect(verdict.low).toBeLessThanOrEqual(verdict.high);
    }
    // Words, not a colour: the screen prints this line.
    expect(check.summary).toMatch(/выше коридора|ниже коридора/);
  });

  test('the remark fires outside the author corridor, not outside a norm', () => {
    const check = retention.checkText(plain(7), measurement);

    for (const verdict of check.outside) {
      // Every judgment is against this writer's own interval. There is no
      // general style rule anywhere in the result.
      expect(verdict).toHaveProperty('low');
      expect(verdict).toHaveProperty('high');
    }
    expect(JSON.stringify(check)).not.toMatch(/recommended|ideal|best/i);
  });

  test('the same analyser measures the samples and the output', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', base, 'voice-retention.ts'),
      'utf8'
    );

    // One set of formulas, shared with the module that set the corridors. A
    // second implementation would drift from it and the comparison would
    // quietly stop meaning anything. What differs is only the sufficiency
    // floors, which answer a question a single output cannot be asked.
    expect(source).toContain("from './style-scales'");
    expect(source).toContain('measureSingleText');
    expect(source).not.toMatch(/splitSentences\(|countWords\(/);
  });
});

describe('the activation gate', () => {
  const inside = { inCorridor: 8, total: 8, outside: [], summary: '' };
  const outside = {
    inCorridor: 7,
    total: 8,
    outside: [
      {
        key: 'listParagraphs',
        value: 26,
        low: 8,
        high: 20,
        placement: 'above',
      },
    ],
    summary: '',
  };

  test('everything inside and closer to this author than to others passes', () => {
    const check = retention.evaluateActivation({
      generatedChecks: [inside, inside],
      holdoutSimilarity: 0.62,
      otherAuthorSimilarity: 0.31,
    });

    expect(check.passed).toBe(true);
    expect(check.reasons).toEqual([]);
  });

  test('one scale outside the corridor blocks activation and says which', () => {
    const check = retention.evaluateActivation({
      generatedChecks: [inside, outside],
      holdoutSimilarity: 0.62,
      otherAuthorSimilarity: 0.31,
    });

    expect(check.passed).toBe(false);
    expect(check.reasons[0]).toContain('listParagraphs');
  });

  test('the similarity test is relative, because no threshold is published', () => {
    const check = retention.evaluateActivation({
      generatedChecks: [inside],
      holdoutSimilarity: 0.29,
      otherAuthorSimilarity: 0.31,
    });

    // Inventing an absolute cut-off would present a guess as a measurement.
    expect(check.passed).toBe(false);
    expect(check.relativeFit).toBe(false);
  });

  test('reference mode adds the leakage gates to the conjunction', () => {
    expect(
      retention.evaluateActivation({
        generatedChecks: [inside],
        holdoutSimilarity: 0.62,
        otherAuthorSimilarity: 0.31,
        leakageGates: false,
      }).passed
    ).toBe(false);
  });

  test('there is no model judge among the gates', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs
      .readFileSync(path.resolve(__dirname, '..', base, 'voice-retention.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

    // Judge reliability drops outside English, this product is Russian-first,
    // and calibrating one needs a few hundred human-labelled Russian pairs
    // that do not exist. A gate that cannot be trusted is worse than one
    // fewer gate.
    expect(source).not.toMatch(/judge|llmScore|modelVerdict/i);
  });
});

/**
 * Чего стоит вердикт, и что делать, когда его нет.
 *
 * Обе половины отвечают на один и тот же счёт: один процент похожести прячет
 * размен между двумя ошибками, а одно слово «не могу сказать» прячет четыре
 * разных положения, из которых человеку нужны четыре разных выхода.
 */
describe('вердикт называет цену и не молчит одинаково', () => {
  test('обе доли ошибок приходят со знаменателями, а не процентом', () => {
    const check = retention.checkText(plain(99), measurement);

    // Настоящие счётчики: «5%» на выборке в двадцать текстов это одно
    // наблюдение, и человек, читающий процент, прочитает надёжность неверно.
    expect(check.calibrationErrors.falseAccept.of).toBe(
      measurement.calibration.falseAccept.of
    );
    expect(check.calibrationErrors.falseAccept.wrong).toBe(
      measurement.calibration.falseAccept.wrong
    );
    expect(check.calibrationErrors.falseReject.of).toBe(
      measurement.calibration.falseReject.of
    );
    expect(check.calibrationErrors.falseReject.wrong).toBe(
      measurement.calibration.falseReject.wrong
    );

    // И обе, а не одна: назвать только ложно принятых значит показать ту
    // половину размена, которая продукту льстит.
    for (const line of [
      check.calibrationErrors.falseAccept.text,
      check.calibrationErrors.falseReject.text,
    ]) {
      expect(line).toContain(String(measurement.calibration.falseAccept.of));
      expect(line).not.toMatch(/%/);
    }
    expect(check.calibrationErrors.falseAccept.text).toMatch(/не писали/);
    expect(check.calibrationErrors.falseReject.text).toMatch(/отклонила/);
  });

  test('счётчики берутся с той калибровки, которой вынесен вердикт', () => {
    // Не с последней снятой и не с чужой: обещание относится ровно к тем
    // границам, против которых посчитан этот голос.
    const other = {
      ...measurement,
      calibration: {
        ...measurement.calibration,
        falseAccept: { of: 31, wrong: 2 },
        falseReject: { of: 29, wrong: 3 },
      },
    };
    const check = retention.checkText(plain(99), other);

    expect(check.calibrationErrors.falseAccept.text).toContain('31');
    expect(check.calibrationErrors.falseAccept.text).toContain('2');
    expect(check.calibrationErrors.falseReject.text).toContain('29');
    expect(check.calibrationErrors.falseReject.text).toContain('3');
  });

  test('без калибровки долей ошибок нет, а не ноль', () => {
    const check = retention.checkText(plain(99), {
      ...measurement,
      calibration: null,
    });

    // Ноль прочитался бы как «ни разу не ошиблась», а правда — «никто не
    // мерил». Это разные вещи, и вторая обязана выглядеть как отсутствие.
    expect(check.calibrationErrors).toBeNull();
    expect(check.similarity.verdict).toBe('UNKNOWN');
    expect(check.similarity.reason).toBe('UNCALIBRATED');
  });

  test('русский счёт согласован с числом по всей группе', () => {
    const at = (of) =>
      retention.checkText(plain(99), {
        ...measurement,
        calibration: {
          ...measurement.calibration,
          falseAccept: { of, wrong: 1 },
          falseReject: { of, wrong: 1 },
        },
      }).calibrationErrors;

    // Единственное число, малое и большое: склонять одно существительное
    // мало — «из 21 текстов» и «из 22 вашего поста» ломаются по-разному.
    expect(at(21).falseAccept.text).toContain('21 текста, который вы не писали');
    expect(at(21).falseReject.text).toContain('21 вашего настоящего поста');
    expect(at(22).falseAccept.text).toContain('22 текстов, которых вы не писали');
    expect(at(22).falseReject.text).toContain('22 ваших настоящих постов');
    expect(at(25).falseAccept.text).toContain('25 текстов, которых вы не писали');
    expect(at(25).falseReject.text).toContain('25 ваших настоящих постов');
  });

  test('каждое молчание предлагает своё, и предложения разные', () => {
    const hints = {
      TOO_SHORT: retention.checkText(plain(99).slice(0, 160), measurement),
      UNCALIBRATED: retention.checkText(plain(99), {
        ...measurement,
        calibration: null,
      }),
      NO_PROFILE: retention.checkText(plain(99), {
        ...measurement,
        voicePrint: null,
      }),
    };

    for (const [reason, check] of Object.entries(hints)) {
      expect(check.similarity.verdict).toBe('UNKNOWN');
      expect(check.similarity.reason).toBe(reason);
      expect(typeof check.silenceHint).toBe('string');
      expect(check.silenceHint.length).toBeGreaterThan(0);
    }

    // Одна фраза на все случаи заставляет человека гадать, что он сделал не
    // так, — а чаще всего он не сделал ничего.
    const lines = Object.values(hints).map((one) => one.silenceHint);
    expect(new Set(lines).size).toBe(lines.length);

    // Короткому тексту предлагают дописать; голосу, чей разбор старше самой
    // мерки, — нажать бесплатную кнопку, потому что сама она не появится.
    expect(hints.TOO_SHORT.silenceHint).toMatch(/допиш/i);
    expect(hints.UNCALIBRATED.silenceHint).toMatch(/заново/i);
    expect(hints.NO_PROFILE.silenceHint).toMatch(/заново/i);
  });

  test('«границ нет» звучит по-разному, когда их не снимали и когда не смогли', () => {
    // Разбор старше мерки: ключа калибровки в нём нет вовсе. Сам он не
    // пересчитается — в продукте ничто не пересчитывает чужие разборы по
    // расписанию, — поэтому человеку названо место, куда идти, и сказано,
    // что это бесплатно.
    const neverTaken = retention.checkText(plain(99), {
      ...measurement,
      calibration: null,
    });

    // Мерку снимали и не смогли: материала не хватило. Вот это действительно
    // пройдёт само, и нажимать человеку нечего.
    const tooFew = retention.checkText(plain(99), {
      ...measurement,
      calibration: {
        ...measurement.calibration,
        low: null,
        high: null,
        falseAccept: null,
        falseReject: null,
        reason: 'TOO_FEW_FOREIGN',
      },
    });

    for (const check of [neverTaken, tooFew]) {
      expect(check.similarity.verdict).toBe('UNKNOWN');
      expect(check.similarity.reason).toBe('UNCALIBRATED');
    }

    // Одна причина на две разные судьбы. Если эти строки совпадут, продукт
    // пообещает первому то, чего для него не произойдёт.
    expect(neverTaken.silenceHint).not.toBe(tooFew.silenceHint);
    expect(neverTaken.summary).not.toBe(tooFew.summary);

    expect(neverTaken.silenceHint).toMatch(/заново/i);
    expect(neverTaken.summary).toMatch(/не снимались/i);

    expect(tooFew.silenceHint).toMatch(/сам/i);
    expect(tooFew.silenceHint).not.toMatch(/заново/i);
  });

  test('вынесенный вердикт ничего не предлагает', () => {
    // Подсказка существует ровно для молчания. Строка «попробуйте другой
    // текст» под уверенным «похоже» читалась бы как сомнение в нём.
    expect(retention.checkText(plain(99), measurement).silenceHint).toBeNull();
  });

  test('доли ошибок не превращают замечание в разрешение', () => {
    const check = retention.checkText(plain(99), measurement);

    // Владелец решил 24.08.2026: продукт не отказывает человеку в его
    // собственном тексте. Числа рядом с вердиктом — это цена вердикта, а не
    // основание чему-либо помешать.
    expect(check.summary).not.toMatch(/не прошёл|запрещ|нельзя отправ/i);
    expect(check.calibrationErrors.falseAccept.text).not.toMatch(
      /запрещ|нельзя|отказ/i
    );
  });
});

describe('a bilingual author gets two profiles, never an average', () => {
  test('the corpus splits by language before anything is measured', () => {
    const mixed = [
      ...corpus.slice(0, 3),
      {
        code: 'smp-en',
        text: 'We changed the supplier. The old one kept missing dates.',
        language: 'en',
        contentHash: 'hash-en',
      },
    ];

    const split = retention.splitByLanguage(mixed);

    // Function-word inventories are language-specific and cross-linguistic
    // interference is real, so a merged corpus measures neither writer.
    expect(Object.keys(split).sort()).toEqual(['en', 'ru']);
    expect(split.ru).toHaveLength(3);
    expect(split.en).toHaveLength(1);
  });
});
