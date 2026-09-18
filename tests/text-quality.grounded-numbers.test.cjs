'use strict';

/**
 * Точное число из источников — не размытое количество.
 *
 * `content-factory-next-97dq.10`, живая адаптация 18.09.2026 (cnt-05,
 * telegram): вердикт чистый, а две находки `vague-quantity` показывали «свыше
 * 9» и «более 6» — начала точных чисел «свыше 90 дней» и «более 620 000
 * бизнесов». Решение владельца того же вечера: «Если есть точные числа из
 * источников, то их, конечно, можно пропускать».
 *
 * Отсюда два обещания, и оба проверяются здесь:
 *
 *  - сработавшая находка показывает число ЦЕЛИКОМ — с разрядами, долей,
 *    процентом и простым словом порядка;
 *  - число, которое стоит в опорах человека, находкой не становится, а без
 *    опор правило работает как работало: «более 20 моделей» с пустыми руками
 *    по-прежнему штамп.
 *
 * Отдельная строка про десятичную запятую: эта волна уже заплатила за неё
 * однажды. «2,5» — одно число, «620 000» — одно число, а «90» не стоит ни в
 * «1990», ни в «90,5», и ни одно из трёх нельзя проверить сравнением подстрок.
 *
 * Модели здесь нет ни одной, сети — тоже.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const QUALITY = 'libraries/nestjs-libraries/src/content-intelligence/text-quality';
const PIECES = 'libraries/nestjs-libraries/src/content-intelligence/pieces';

const { slopCheck, verdictFor } = loadTypeScriptModule(
  `${QUALITY}/slop-check.ts`
);
const { numberAt, numberKeysOf } = loadTypeScriptModule(`${QUALITY}/numbers.ts`);
const { RU_RULES } = loadTypeScriptModule(`${QUALITY}/slop-rules.ru.ts`);

/** Отрывки находок правила о размытом количестве. */
const vague = (text, options) =>
  slopCheck(text, options || {})
    .findings.filter((finding) => finding.ruleId === 'vague-quantity')
    .map((finding) => finding.excerpt);

/** Живые строки стенда 18.09.2026 и их опоры. */
const NINETY = 'Компания работает свыше 90 дней подряд.';
const BUSINESSES = 'Сервис помог более 620 000 бизнесов вырасти за год.';

describe('vague-quantity: число целиком и опоры человека', () => {
  test('без опор правило остаётся правилом', () => {
    expect(vague('В прогоне участвовало более 20 моделей.')).toEqual([
      'более 20',
    ]);
    expect(
      vague('В прогоне участвовало более 20 моделей.', {
        grounded: 'Про числа в опорах не сказано ни слова.',
      })
    ).toEqual(['более 20']);
  });

  test('отрывок показывает число целиком, а не первую цифру', () => {
    expect(vague(NINETY)).toEqual(['свыше 90']);
    expect(vague(BUSINESSES)).toEqual(['более 620 000']);
    expect(vague('Выросли более 2,5% за квартал.')).toEqual(['более 2,5%']);
    expect(vague('Около 5 тысяч человек пришло на встречу.')).toEqual([
      'Около 5 тысяч',
    ]);
  });

  test('отрывок — ровно та подстрока текста, на которую указывает находка', () => {
    const [finding] = slopCheck(BUSINESSES).findings.filter(
      (item) => item.ruleId === 'vague-quantity'
    );

    expect(BUSINESSES.slice(finding.start, finding.end)).toBe(finding.excerpt);
  });

  test('число из опор находкой не становится — обе строки стенда', () => {
    expect(vague(NINETY, { grounded: 'Срок хранения — 90 дней.' })).toEqual([]);
    expect(
      vague(BUSINESSES, {
        grounded: ['По данным отчёта, 620 000 компаний выросли.'],
      })
    ).toEqual([]);
  });

  test('опора строкой и опора списком читаются одинаково', () => {
    expect(vague(NINETY, { grounded: '90 дней' })).toEqual([]);
    expect(vague(NINETY, { grounded: ['пусто', '90 дней'] })).toEqual([]);
    expect(vague(NINETY, { grounded: [] })).toEqual(['свыше 90']);
    expect(vague(NINETY, { grounded: '' })).toEqual(['свыше 90']);
  });

  test('«90» не стоит ни в «1990», ни в «90,5»', () => {
    expect(vague(NINETY, { grounded: 'Это было в 1990 году.' })).toEqual([
      'свыше 90',
    ]);
    expect(vague(NINETY, { grounded: 'Доля выросла до 90,5 процента.' })).toEqual(
      ['свыше 90']
    );
    expect(vague(NINETY, { grounded: 'Ровно 90 дней и ни днём больше.' })).toEqual(
      []
    );
  });

  test('неразрывный пробел внутри числа — тот же разряд', () => {
    // Разделитель записан escape-последовательностью намеренно: неразрывный
    // пробел в исходнике теста не отличить глазом от обычного, а разница
    // между ними — ровно то, что здесь проверяется.
    const nbsp = 'Сервис помог более 620\u00A0000 бизнесов вырасти за год.';
    const thin = '620\u202F000 компаний';

    expect(vague(nbsp)).toEqual(['более 620\u00A0000']);
    expect(vague(nbsp, { grounded: '620\u00A0000 компаний' })).toEqual([]);
    // Текст и опора могут разделять разряды по-разному: число одно и то же.
    expect(vague(nbsp, { grounded: '620 000 компаний' })).toEqual([]);
    expect(vague(nbsp, { grounded: thin })).toEqual([]);
    expect(vague(BUSINESSES, { grounded: '620\u00A0000 компаний' })).toEqual([]);
  });

  test('счёт и вердикт считаются по выжившим находкам', () => {
    const text = `${NINETY}\n\n${BUSINESSES}`;
    const loud = slopCheck(text);
    const grounded = slopCheck(text, {
      grounded: ['Срок хранения — 90 дней.', '620 000 компаний в базе.'],
    });

    expect(loud.findings.length - grounded.findings.length).toBe(2);
    expect(grounded.score).toBe(loud.score - 2);
    expect(grounded.verdict).toBe(verdictFor(grounded.score));
    expect(grounded.findings.some((f) => f.ruleId === 'vague-quantity')).toBe(
      false
    );
  });

  test('опоры читает только правило, которое о них просило', () => {
    const grounded = ['3', 'надёжный', 'Мы собрали 3 конвейера.'];
    const evaluation = 'Мы собрали надёжный и эффективный конвейер.';

    // Оценка вместо факта опорами не лечится: опора говорит о числе.
    expect(
      slopCheck(evaluation, { grounded }).findings.map((f) => f.ruleId)
    ).toEqual(slopCheck(evaluation).findings.map((f) => f.ruleId));
  });

  test('свойство правила, а не его имя', () => {
    const rule = RU_RULES.find((item) => item.id === 'vague-quantity');

    expect(rule.passWhenGrounded).toBe(true);
    // Один разбор каталога — одно правило о числах. Появится второе — оно
    // получит это же свойство, а не вторую ветку в исполнителе.
    expect(
      RU_RULES.filter((item) => item.passWhenGrounded === true).map(
        (item) => item.id
      )
    ).toEqual(['vague-quantity']);
  });
});

describe('разбор числа: одна мерка для отрывка и для опор', () => {
  test('ключ числа — цифры без разделителей, доля через точку', () => {
    expect(numberAt('620 000 бизнесов', 0)).toMatchObject({
      end: 7,
      key: '620000',
    });
    expect(numberAt('2,5% за год', 0)).toMatchObject({ end: 4, key: '2.5%' });
    expect(numberAt('90 дней', 0)).toMatchObject({ end: 2, key: '90' });
    expect(numberAt('90,5 процента', 0)).toMatchObject({ key: '90.5' });
    expect(numberAt('1990 год', 0)).toMatchObject({ key: '1990' });
    expect(numberAt('нет цифры', 0)).toBeNull();
  });

  test('точка в конце предложения десятичной частью не становится', () => {
    expect(numberAt('90.', 0)).toMatchObject({ end: 2, key: '90' });
  });

  test('разрядным пробелом считается только группа из трёх цифр', () => {
    expect(numberAt('5 3 набора', 0)).toMatchObject({ end: 1, key: '5' });
    expect(numberAt('2 500 000 рублей', 0)).toMatchObject({ key: '2500000' });
  });

  test('слово порядка входит в число и в ключ', () => {
    expect(numberAt('5 тысяч человек', 0)).toMatchObject({ key: '5k' });
    expect(numberAt('5 млн человек', 0)).toMatchObject({ key: '5m' });
    // Порядок в ключе значим: «5 млн» не обоснованы опорой «5».
    expect(numberKeysOf('Их было 5 штук.').has('5m')).toBe(false);
  });

  test('доля не отдаёт отдельного ключа своей второй половине', () => {
    // «1990» здесь стоит в дате и опорой не становится вовсе (P2-1 ниже);
    // проверяется другое: у доли «90,5» нет отдельного ключа «5».
    const keys = numberKeysOf('Доля выросла до 90,5 процента за квартал.');

    expect([...keys].sort()).toEqual(['90.5']);
  });

  test('пустые опоры дают пустой набор', () => {
    expect(numberKeysOf(null).size).toBe(0);
    expect(numberKeysOf(undefined).size).toBe(0);
    expect(numberKeysOf(['', null]).size).toBe(0);
  });
});

/**
 * Не всякая цифра в материале — количество.
 *
 * Разбор корректности второго выпуска, P2-1: ключом были одни цифры, и «20» из
 * «Встреча 20 сентября» обосновывало «В продукте более 20 моделей». Опасны
 * именно маленькие числа — 1, 4, 10, 20 стоят в каждом втором тексте, — но
 * лечится это разбором МЕСТА, а не порогом величины: порог выбросил бы и
 * настоящую опору «20 моделей» вместе с датой.
 *
 * Каждая пара ниже читается в обе стороны: число в служебном месте опорой не
 * становится, а оно же, названное количеством, становится. Иначе правка
 * доказывала бы только то, что опоры сломаны.
 */
describe('число из служебного места опорой не становится (P2-1)', () => {
  const CASES = [
    [
      'дата словом месяца',
      'Встреча 20 сентября, обсудили план.',
      'В команде 20 моделей на прогоне.',
      'В продукте более 20 моделей.',
    ],
    [
      'год',
      'Компания основана в 1990 году.',
      'В базе 1990 записей о клиентах.',
      'Загружено более 1990 записей.',
    ],
    [
      'дата цифрами',
      'Выпуск назначен на 18.09.2026.',
      'Осталось 18 задач до выпуска.',
      'Осталось более 18 задач.',
    ],
    [
      'время',
      'Вебинар в 10:30 по Москве.',
      'В наборе 10 инструментов.',
      'Более 10 инструментов в наборе.',
    ],
    [
      'минуты времени',
      'Вебинар в 10:30 по Москве.',
      'В наборе 30 инструментов.',
      'Более 30 инструментов в наборе.',
    ],
    [
      'номер пункта',
      '1. Первый пункт\n2. Второй пункт',
      'Есть 1 способ сделать это.',
      'Свыше 1 способа сделать это.',
    ],
    [
      'имя через дефис',
      'Мы используем GPT-4 для разбора.',
      'У нас 4 причины купить.',
      'Более 4 причин купить.',
    ],
    [
      'имя заготовки',
      'Заготовка cnt-05 ушла в телеграм.',
      'Каналов у нас 5 штук.',
      'Более 5 каналов в работе.',
    ],
    [
      'число, приклеенное к букве',
      'Версия v2 вышла вчера.',
      'Всего 2 версии продукта.',
      'Более 2 версий продукта.',
    ],
    [
      'хвост ссылки',
      'Ссылка https://site.ru/page/100 в брифе.',
      'Собрано 100 отзывов клиентов.',
      'Более 100 отзывов.',
    ],
  ];

  test.each(CASES)('%s', (_name, service, quantity, text) => {
    // Служебное место опорой не становится: находка остаётся.
    expect(vague(text, { grounded: service }).length).toBe(1);
    // То же число, названное количеством, опорой становится.
    expect(vague(text, { grounded: quantity })).toEqual([]);
    // И вместе: настоящая опора в том же материале работает.
    expect(vague(text, { grounded: [service, quantity] })).toEqual([]);
  });

  test('живые опоры волны служебными местами не задеты', () => {
    const material = [
      'Срок хранения — 90 дней.',
      '620 000 компаний в базе.',
      'Рост составил 2,5% за квартал.',
      'Пришло 5 тысяч гостей.',
      'Доля рынка 40%.',
    ];

    expect(vague('Компания работает свыше 90 дней подряд.', { grounded: material })).toEqual([]);
    expect(vague('Сервис помог более 620 000 бизнесов.', { grounded: material })).toEqual([]);
    expect(vague('Выросли более 2,5% за квартал.', { grounded: material })).toEqual([]);
    expect(vague('Около 5 тысяч человек пришло.', { grounded: material })).toEqual([]);
    expect(vague('Около 40% рынка у нас.', { grounded: material })).toEqual([]);
  });

  test('ключи служебных чисел не собираются вовсе', () => {
    expect([...numberKeysOf('Встреча 20 сентября.')]).toEqual([]);
    expect([...numberKeysOf('Вебинар в 10:30.')]).toEqual([]);
    expect([...numberKeysOf('1. Пункт\n2) Второй')]).toEqual([]);
    expect([...numberKeysOf('Модель GPT-4 и версия v2.')]).toEqual([]);
    expect([...numberKeysOf('https://site.ru/page/100')]).toEqual([]);
    expect([...numberKeysOf('Выпуск 18.09.2026 состоялся.')]).toEqual([]);
    // А обычное количество собирается как собиралось.
    expect([...numberKeysOf('В базе 620 000 компаний и 90 дней истории.')].sort()).toEqual(
      ['620000', '90']
    );
  });
});

describe('опоры доезжают до каталога через швы', () => {
  const { adaptationChecksOf, adaptationChecksMany } = loadTypeScriptModule(
    `${PIECES}/adaptation-checks.ts`
  );

  /** Порт каталога, который только запоминает, о чём его спросили. */
  const recordingPort = () => {
    const calls = [];
    return {
      calls,
      slopCheck: (text, platform, locale, grounded) => {
        calls.push({ text, platform, locale, grounded });
        return { findings: [], score: 0, verdict: 'clean' };
      },
    };
  };

  test('квитанция одной адаптации передаёт опоры каталогу', async () => {
    const port = recordingPort();
    await adaptationChecksOf(
      {
        organizationId: 'org',
        text: BUSINESSES,
        platform: 'telegram',
        language: 'ru',
        grounded: ['620 000 компаний'],
      },
      { slopCheck: port.slopCheck, voiceCheck: null }
    );

    expect(port.calls).toEqual([
      {
        text: BUSINESSES,
        platform: 'telegram',
        locale: 'ru',
        grounded: ['620 000 компаний'],
      },
    ]);
  });

  test('пакетная квитанция страницы отдаёт те же опоры каждой строке', async () => {
    const port = recordingPort();
    await adaptationChecksMany(
      { organizationId: 'org', language: 'ru', grounded: ['90 дней'] },
      [
        { text: NINETY, platform: 'telegram' },
        { text: BUSINESSES, platform: 'default' },
      ],
      { slopCheck: port.slopCheck, voiceCheck: null }
    );

    expect(port.calls.map((call) => call.grounded)).toEqual([
      ['90 дней'],
      ['90 дней'],
    ]);
  });

  test('порт старой формы продолжает работать: опоры — последний довод', async () => {
    const seen = [];
    const checks = await adaptationChecksOf(
      {
        organizationId: 'org',
        text: NINETY,
        platform: 'telegram',
        language: 'ru',
        grounded: ['90 дней'],
      },
      {
        // Ровно тот порт, что жил в наборах до этой волны: три довода.
        slopCheck: (text, platform, locale) => {
          seen.push([text, platform, locale]);
          return null;
        },
        voiceCheck: null,
      }
    );

    expect(seen).toEqual([[NINETY, 'telegram', 'ru']]);
    expect(checks.slop).toBeNull();
  });
});

describe('опоры сути и проверки: собраны из того же материала', () => {
  test('суть стоит на словах человека, его ответах и опорах брифа', () => {
    const { coreGrounded } = loadTypeScriptModule(`${PIECES}/core-write.ts`, {
      '@contentfactory/nestjs-libraries/openai/ai.clients': {},
      '../../openai/ai.usage.service': {},
    });

    const grounded = coreGrounded({
      organizationId: 'org',
      language: 'ru',
      personText: 'Мы держим данные 90 дней.',
      answers: [
        { key: 'facts', text: 'Выросли на 2,5% за квартал.', origin: 'person' },
        { key: 'facts', text: 'Число от модели: 777.', origin: 'model' },
      ],
      questionTextByKey: {},
      brief: {
        facts: [
          {
            statement: '620 000 компаний в базе.',
            verified: true,
            origin: 'search',
          },
          {
            statement: 'Чужое непроверенное про 12 345.',
            verified: false,
            origin: 'search',
            kind: 'external',
          },
        ],
      },
      borrowed: null,
      foreignShingles: [],
    });

    expect(grounded).toEqual([
      'Мы держим данные 90 дней.',
      'Выросли на 2,5% за квартал.',
      '620 000 компаний в базе.',
    ]);
    // Число модели и чужое непроверенное опорой не становятся.
    expect(vague('Модель насчитала более 777 случаев.', { grounded })).toEqual([
      'более 777',
    ]);
    expect(vague('Свыше 12 345 записей найдено.', { grounded })).toEqual([
      'Свыше 12 345',
    ]);
    expect(vague('Хранится более 90 дней.', { grounded })).toEqual([]);
  });

  test('проверка адаптации: «было» и «стало» стоят на одних опорах', () => {
    const { catalogFindingsOf, reviewGroundedOf } = loadTypeScriptModule(
      `${PIECES}/review-prompt.v5.ts`
    );

    const input = {
      text: BUSINESSES,
      title: '',
      core: 'Суть про рост рынка.',
      personText: 'Мы считали сами.',
      facts: [{ statement: '620 000 компаний в базе.' }, 'чужая форма', null],
      language: 'ru',
      platform: 'telegram',
    };
    const grounded = reviewGroundedOf(input);

    expect(grounded).toEqual([
      'Суть про рост рынка.',
      'Мы считали сами.',
      '620 000 компаний в базе.',
    ]);

    const before = catalogFindingsOf(
      input.text,
      input.language,
      input.platform,
      grounded
    );
    const after = catalogFindingsOf(
      'Сервис помог 620 000 бизнесов вырасти за год.',
      input.language,
      input.platform,
      grounded
    );

    expect(before.filter((f) => f.ruleId === 'vague-quantity')).toEqual([]);
    expect(after.filter((f) => f.ruleId === 'vague-quantity')).toEqual([]);
    // Без опор та же пара разошлась бы на единицу — и разница назвала бы
    // убранной находку, которой правка не касалась.
    expect(
      catalogFindingsOf(input.text, input.language, input.platform).filter(
        (f) => f.ruleId === 'vague-quantity'
      )
    ).toEqual([
      expect.objectContaining({
        ruleId: 'vague-quantity',
        excerpt: 'более 620 000',
      }),
    ]);
  });
});
