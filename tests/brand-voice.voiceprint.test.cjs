'use strict';

/**
 * The ruler beside the eight scales: is this the same person.
 *
 * The scales answer what a habit is. Measured on the owner's real channel on
 * 2026-08-24 they turned out not to answer whose the text is, which is the
 * whole reason this file exists. The acceptance number lives on that channel
 * and is recorded in `.codex/stages/content-factory-next-e3y.1/evidence/`;
 * what is held here is the behaviour a later change must not quietly lose —
 * the print exists, it is calibrated on the author's own spread, it separates
 * two manners, and it never turns into a permission.
 *
 * The fixtures are two deliberately different manners rather than real
 * writing. They cannot prove a percentage on real posts and are not asked to:
 * they prove that the arithmetic still runs the way the measurement was taken.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const packModule = loadTypeScriptModule(`${base}/locale-pack.ru.ts`);
const pack = packModule.RU_LOCALE_PACK;
const functionWords = loadTypeScriptModule(`${base}/function-words.ts`);
const ngrams = loadTypeScriptModule(`${base}/character-ngrams.ts`);
const print = loadTypeScriptModule(`${base}/voiceprint.ts`);
const analyzer = loadTypeScriptModule(`${base}/analyzer.ts`);
const retention = loadTypeScriptModule(`${base}/voice-retention.ts`);
const calibration = loadTypeScriptModule(`${base}/voice-calibration.ts`);

/** Short phrases, a dash where a copula would go, "we", the odd particle. */
const PLAIN = [
  'Поставщика поменяли — старый срывал сроки третий месяц подряд.',
  'Новый возит из Челябинска, и это уже видно по журналу приёмки.',
  'Мы вчера догнали план. Правда, ценой субботней смены.',
  'А что дальше? Ставим контрольную точку на среду и смотрим остатки.',
  'Вот тут и вылезла разница: подшипники пришли, а крепёж нет.',
  'Смена отработала ровно. Без лишних слов, без геройства.',
  'Мастер предупредил заранее — это правильно, лучше знать за неделю.',
  'Я думал, что успеем к четвергу. Не успели, и врать тут незачем.',
  'Линию запускаем в четверг, если крепёж придёт во вторник.',
  'Мы считали дважды. Оба раза вышло одно и то же число.',
  'Ведь дело не в графике, а в том, кто его читает по утрам.',
  'Отгрузка прошла по факту. Приняли, пересчитали, подписали.',
];

/** Long clauses, clerical nouns, the organisation named from outside. */
const CLERICAL = [
  'Проведение мероприятий по обеспечению выполнения плановых показателей осуществляется в соответствии с утверждённым регламентом.',
  'Компания информирует о том, что предприятие осуществляет выполнение принятых обязательств в полном объёме.',
  'Организация обеспечивает предоставление документации при условии согласования сроков с ответственным подразделением.',
  'Осуществление отгрузки продукции производится согласно утверждённому графику поставок на текущий период.',
  'Выполнение указанных требований является обязательным для всех структурных подразделений организации.',
  'Проведение инвентаризации осуществляется ежеквартально при участии представителей заинтересованных служб.',
  'Уведомление направляется заблаговременно, а рассмотрение обращения занимает до десяти рабочих дней.',
  'Информирование заявителя обеспечивается ответственным подразделением после завершения проверки документов.',
  'Оформление документации завершено, утверждение регламента состоялось на заседании профильной комиссии.',
  'Внедрение изменений запланировано на следующий отчётный период при наличии соответствующего финансирования.',
  'Обеспечение сохранности возлагается на службу логистики предприятия в течение всего срока хранения.',
  'Согласование изменений производится в установленном порядке при участии руководителя направления.',
];

/** Samples that differ from each other, so a spread is a spread and not zero. */
const compose = (bank, index, length = 7) => {
  const lines = [];
  for (let step = 0; step < length; step += 1) {
    lines.push(bank[(index * 3 + step * 5) % bank.length]);
  }
  return lines.join(' ');
};

const corpus = (bank, count, offset = 0) =>
  Array.from({ length: count }, (_, index) => ({
    code: `smp-${String(index + 1 + offset).padStart(2, '0')}`,
    text: compose(bank, index + offset),
    language: 'ru',
    contentHash: `hash-${bank === PLAIN ? 'p' : 'c'}-${index + offset}`,
  }));

describe('the service-word dictionary', () => {
  it('is the eighty-six service words the measurement was taken with', () => {
    expect(pack.functionWords).toHaveLength(86);
    expect(new Set(pack.functionWords).size).toBe(86);
  });

  it('carries no `ё`, because the counter folds it away before matching', () => {
    for (const term of pack.functionWords) {
      expect(term).toBe(term.toLowerCase());
      expect(term).not.toMatch(/ё/);
    }
  });

  it('names the particles the research calls the Russian-specific signal', () => {
    for (const particle of ['же', 'ли', 'бы', 'вот', 'ведь']) {
      expect(pack.functionWords).toContain(particle);
    }
  });

  it('moves the pack version when the dictionary moves', () => {
    // A corridor and a print both travel with the version that produced them;
    // adding words without moving it makes an old measurement unreadable and
    // silently so.
    expect(pack.version).toMatch(/^ru-\d{4}-\d{2}-\d{2}$/);
    expect(pack.version >= 'ru-2026-08-24').toBe(true);
  });
});

describe('counting service words', () => {
  it('reports a rate per thousand words, not a count', () => {
    const text = `${'слово '.repeat(99)}не`;
    const { rates, wordCount } = functionWords.functionWordRates(text, pack);
    expect(wordCount).toBe(100);
    expect(rates.get('не')).toBeCloseTo(10, 5);
  });

  it('folds `ё` so one word is not counted as two', () => {
    const withYo = functionWords.functionWordRates(
      `причём ${'слово '.repeat(60)}`,
      pack
    );
    const withoutYo = functionWords.functionWordRates(
      `причем ${'слово '.repeat(60)}`,
      pack
    );
    expect(withYo.rates.get('причем')).toBeCloseTo(
      withoutYo.rates.get('причем'),
      5
    );
    expect(withYo.rates.get('причем')).toBeGreaterThan(0);
  });
});

describe('the profile a corpus produces', () => {
  const plain = corpus(PLAIN, 12);

  it('refuses to guess from fewer samples than a spread needs', () => {
    expect(functionWords.buildFunctionWordProfile(plain.slice(0, 2), pack)).toBeNull();
    expect(ngrams.buildCharacterNgramProfile(plain.slice(0, 1))).toBeNull();
  });

  it('keeps only the terms the author actually used, with a spread above zero', () => {
    const profile = functionWords.buildFunctionWordProfile(plain, pack);
    expect(profile.terms.length).toBeGreaterThan(0);
    expect(profile.terms.length).toBeLessThanOrEqual(86);
    for (const spread of profile.deviation) expect(spread).toBeGreaterThan(0);
    expect(profile.mean).toHaveLength(profile.terms.length);
  });

  it('calibrates its line on the author, not on a constant', () => {
    const profile = functionWords.buildFunctionWordProfile(plain, pack);
    // The threshold is the 95th percentile of this author's own distances, so
    // it sits at or above their middle and is not a number somebody chose.
    expect(profile.threshold).toBeGreaterThanOrEqual(profile.selfMedian);
    expect(profile.threshold).toBeGreaterThan(0);
  });

  it('keeps the n-gram profile inside the size it says it keeps', () => {
    const profile = ngrams.buildCharacterNgramProfile(plain);
    expect(profile.size).toBe(ngrams.NGRAM_SIZE);
    expect(profile.grams.length).toBeLessThanOrEqual(ngrams.NGRAM_PROFILE_SIZE);
    expect(profile.weight).toHaveLength(profile.grams.length);
    // Считается по символам, которые видит человек, а не по единицам UTF-16:
    // у граммы с эмодзи `.length` больше ширины окна, и это не поломка.
    for (const gram of profile.grams) {
      expect(Array.from(gram)).toHaveLength(profile.size);
    }
    expect(profile.threshold).toBeGreaterThan(0);
    expect(profile.threshold).toBeLessThan(1);
  });

  it('эмодзи не разрезается пополам, и профиль пригоден для базы', () => {
    /**
     * Обнаружено на боевой 28.08.2026: разбор корпуса с эмодзи падал с `500`,
     * а Prisma говорила `lone leading surrogate in hex escape`. Эмодзи — пара
     * единиц UTF-16, и окно шириной пять, нарезанное по индексам, разрывало её
     * пополам. Половина эмодзи уходила в профиль, профиль — в JSON, и такой
     * JSON Postgres не принимает вовсе.
     */
    const withEmoji = corpus(
      PLAIN.map((line, index) => (index % 2 ? `${line} 🙂` : `🚀 ${line}`)),
      12
    );
    const profile = ngrams.buildCharacterNgramProfile(withEmoji);

    // Одинокий суррогат — это код в диапазоне D800–DFFF без своей пары.
    const loneSurrogate = (value) =>
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        value
      );

    expect(profile.grams.some(loneSurrogate)).toBe(false);
    // Проверка настоящая, только если эмодзи в профиль вообще попал: файл
    // держит их намеренно, и грамма из целого эмодзи — законная привычка.
    expect(profile.grams.some((gram) => /[\u{1F300}-\u{1FAFF}]/u.test(gram))).toBe(
      true
    );

    // То, ради чего всё: такой профиль сериализуется и доезжает до базы.
    expect(() => JSON.parse(JSON.stringify(profile))).not.toThrow();
    expect(loneSurrogate(JSON.stringify(profile))).toBe(false);
  });

  it('measures its own spread without the sample it is measuring', () => {
    // A sample scored against a profile it helped build scores too well, and a
    // threshold taken from flattered distances calls the author's own next
    // post a stranger's. Leave-one-out is the difference, and it is visible:
    // the threshold stays above zero even when every sample shares a bank.
    const profile = ngrams.buildCharacterNgramProfile(corpus(PLAIN, 8));
    expect(profile.selfMedian).toBeGreaterThan(0);
  });
});

describe('the verdict on one text', () => {
  const plain = corpus(PLAIN, 12);
  const voicePrint = print.buildVoicePrint(plain, pack);

  it('reads the author\'s own held-out writing as close', () => {
    const holdout = corpus(PLAIN, 4, 40);
    for (const sample of holdout) {
      const answer = print.measureSimilarity(sample.text, voicePrint, pack);
      expect(answer.verdict).toBe('CLOSE');
    }
  });

  it('reads another manner as far', () => {
    const alien = corpus(CLERICAL, 4, 40);
    for (const sample of alien) {
      const answer = print.measureSimilarity(sample.text, voicePrint, pack);
      expect(answer.verdict).toBe('FAR');
    }
  });

  it('puts the author closer than the stranger in every pair', () => {
    const distance = (text) =>
      print.measureSimilarity(text, voicePrint, pack).distance;
    const ours = corpus(PLAIN, 6, 40).map((one) => distance(one.text));
    const theirs = corpus(CLERICAL, 6, 40).map((one) => distance(one.text));
    let won = 0;
    for (const mine of ours) for (const alien of theirs) if (mine < alien) won += 1;
    // The acceptance on the owner's real corpus is 85%; on two manners this
    // deliberately unlike each other, anything below all of them would mean
    // the arithmetic broke rather than that the corpus was hard.
    expect(won).toBe(ours.length * theirs.length);
  });

  it('says it cannot tell rather than guessing, and the two are not the same', () => {
    const short = print.measureSimilarity('Слишком коротко.', voicePrint, pack);
    expect(short.verdict).toBe('UNKNOWN');
    expect(short.reason).toBe('TOO_SHORT');

    const blind = print.measureSimilarity(PLAIN.join(' '), null, pack);
    expect(blind.verdict).toBe('UNKNOWN');
    expect(blind.reason).toBe('NO_PROFILE');
    expect(blind.distance).toBeNull();
  });

  it('names the service words that diverged, for a person to act on', () => {
    const answer = print.measureSimilarity(
      corpus(CLERICAL, 1, 40)[0].text,
      voicePrint,
      pack
    );
    expect(answer.divergingTerms.length).toBeGreaterThan(0);
    for (const term of answer.divergingTerms) {
      expect(pack.functionWords).toContain(term.term);
      expect(typeof term.z).toBe('number');
    }
  });
});

describe('where the print travels', () => {
  it('rides on the measurement, built on the training part only', () => {
    const measured = analyzer.analyzeBrandVoice(corpus(PLAIN, 14), {
      language: 'ru',
    });
    expect(measured.voicePrint).toBeTruthy();
    expect(measured.voicePrint.localePackVersion).toBe(pack.version);
    // Built on TRAIN, so it can face the held-out part as writing it has never
    // seen. A print built on the whole corpus could not be checked at all.
    expect(measured.voicePrint.ngrams.sampleCount).toBe(measured.sampleCount);
  });

  it('reaches the text check, beside the eight scales rather than instead of them', () => {
    const measured = analyzer.analyzeBrandVoice(corpus(PLAIN, 14), {
      language: 'ru',
    });
    /**
     * The working point rides on the measurement since 2026-08-27.
     *
     * Before it, `FAR` came out of a constant two thirds of the votes, and that
     * constant rejects between 41% and 71% of three real authors' own held-out
     * posts once the lineup stopped being technical documentation. The verdict
     * is now read against boundaries measured for this author, so the check has
     * to be handed some — and a measurement carrying none says «cannot tell»
     * rather than borrowing somebody else's.
     */
    /**
     * Две популяции, которые действительно расходятся.
     *
     * Прежние числа (свои 0.5…1.0, чужие 0…0.6) были подогнаны под допуск в
     * пять процентов и на пятнадцати ломались: верхний порог опускался ниже
     * нижнего, полоса переворачивалась, и «не похоже» становилось
     * недостижимым — правило `low < high` отрабатывало верно, а набор проверял
     * уже не то. Здесь автор отделён от шеренги с умеренным перекрытием, как
     * настоящий: канцелярский текст этого корпуса набирает 0.35 голоса, свой —
     * единицу, и обе границы ложатся между ними.
     */
    const calibrated = {
      ...measured,
      calibration: calibration.calibrate(
        Array.from({ length: 40 }, (_, index) => 0.4 + (index / 39) * 0.6),
        // Чужие не все на нуле: набор из одних нулей ставит верхний порог на
        // первое ненулевое наблюдение, и «похоже» получает кто угодно.
        Array.from({ length: 40 }, (_, index) => (index / 39) * 0.8)
      ),
    };
    expect(calibrated.calibration.low).toBeLessThan(
      calibrated.calibration.high
    );
    const check = retention.checkText(compose(CLERICAL, 3), calibrated, 'ru');
    expect(check.similarity.verdict).toBe('FAR');
    // The scales are still counted and still explain what diverged.
    expect(check.total).toBeGreaterThan(0);
    expect(typeof check.summary).toBe('string');
  });

  it('says «not calibrated» over a measurement with no working point, never «FAR»', () => {
    const measured = analyzer.analyzeBrandVoice(corpus(PLAIN, 14), {
      language: 'ru',
    });
    const check = retention.checkText(compose(CLERICAL, 3), measured, 'ru');

    expect(check.similarity.verdict).toBe('UNKNOWN');
    expect(check.similarity.reason).toBe('UNCALIBRATED');
    // The vote is still counted and still shown; only the verdict is withheld.
    expect(check.similarity.votes).not.toBeNull();
  });

  it('answers "cannot tell" for a measurement written before the print existed', () => {
    const measured = analyzer.analyzeBrandVoice(corpus(PLAIN, 14), {
      language: 'ru',
    });
    const older = { ...measured, voicePrint: null };
    const check = retention.checkText(compose(PLAIN, 2), older, 'ru');
    expect(check.similarity.verdict).toBe('UNKNOWN');
    expect(check.similarity.reason).toBe('NO_PROFILE');
  });

  it('is a warning and carries nothing anybody could gate on', () => {
    const measured = analyzer.analyzeBrandVoice(corpus(PLAIN, 14), {
      language: 'ru',
    });
    const check = retention.checkText(compose(CLERICAL, 5), measured, 'ru');
    // The owner decided on 2026-08-24 that a low similarity warns and never
    // refuses. No `passed`, no `blocked`, no `allowed` — a field with one of
    // those names is what a caller reaches for when it wants to say no.
    for (const forbidden of ['passed', 'blocked', 'allowed', 'ok', 'valid']) {
      expect(check.similarity).not.toHaveProperty(forbidden);
    }
  });
});
