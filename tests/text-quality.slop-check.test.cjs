'use strict';

/**
 * Проверка на ИИ-штампы: пара примеров на каждое правило.
 *
 * `content-factory-next-tu3k.3`. Правило, которое срабатывает всегда, ничем не
 * лучше правила, которое молчит всегда: и то и другое человек перестаёт
 * читать через день. Поэтому у каждого правила здесь два примера — где оно
 * обязано сработать и где обязано промолчать. Молчаливые примеры — это и есть
 * известные границы ложных срабатываний из `lint_ru.py` владельца:
 * существительные на «-ость», одиночный усилитель, «я считаю», артефакт в
 * бэктиках, слово внутри «кавычек» и внутри ссылки.
 *
 * Предложения самопроверки владельца (`lint.py --self-test` и
 * `lint_ru.py --self-test`) взяты как есть: если наш набор расходится с его
 * набором, расходится продукт, а не тест.
 *
 * Модели здесь нет ни одной. Проверка — чистый разбор строки.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const DIR = 'libraries/nestjs-libraries/src/content-intelligence/text-quality';

const { slopCheck, verdictFor, SLOP_MAX_FINDINGS, rulesFor } =
  loadTypeScriptModule(`${DIR}/slop-check.ts`);
const { slopThresholds, slopPlatformKey } = loadTypeScriptModule(
  `${DIR}/slop-platforms.ts`
);

const report = (text, options) => slopCheck(text, options || {});
const ids = (text, options) =>
  report(text, options).findings.map((finding) => finding.ruleId);
const fires = (ruleId, text, options) => ids(text, options).includes(ruleId);

/** Предложение ровно из `count` слов, чтобы мерить ритм, а не словарь. */
const sentenceOf = (count) =>
  `Мы ${Array.from({ length: count - 2 }, (_, index) => `слово${index}`).join(
    ' '
  )} итог.`;

const TELEGRAM = { platform: 'telegram' };

/* --------------------------------------------------------------------------
 * Русские правила: по паре на каждое
 * ----------------------------------------------------------------------- */

const RU_PAIRS = [
  [
    'artefact',
    'Данные citeturn0search2 подтверждают вывод исследования.',
    'Статья разбирает метку `citeturn0search2` как признак машины.',
  ],
  [
    'zero-width',
    'Обычный текст с невидимым​символом внутри строки.',
    'Семья 👨‍👩‍👧 поехала на дачу в субботу.',
  ],
  [
    'negative-parallelism',
    'Это не просто курс, это экосистема.',
    'Это курс на три месяца с четырьмя защитами.',
  ],
  [
    'contrast-tail',
    'Поставщика поменяли ещё в марте, а не в апреле прошлого года.',
    'Пробовали поменять в марте, а не вышло.',
  ],
  [
    'chopped-drama',
    'Без кода. Без настроек. Всё поехало само.',
    'Без кода тут не обойтись, поэтому сели писать.',
  ],
  [
    'math-signs',
    'Скорость > идеальности.',
    'Скорость важнее идеальности.',
  ],
  [
    'participle-cliche',
    'Подчёркивая рост, компания открыла второй цех.',
    'Компания открыла второй цех и назвала выручку.',
  ],
  [
    'inflated-significance',
    'Релиз знаменует собой новую эру для отрасли.',
    'Релиз вышел в среду, через месяц после беты.',
  ],
  [
    'promo-words',
    'Сервис может похвастаться скоростью ответа.',
    'Сервис отвечает за двести миллисекунд.',
  ],
  [
    'weasel-attribution',
    'По мнению экспертов, рынок вырастет вдвое.',
    'Ведомство назвало срок в отчёте за март.',
  ],
  [
    'copula-avoidance',
    'Платформа представляет собой набор инструментов.',
    'Платформа собрана из четырёх инструментов.',
  ],
  [
    'template-transition',
    'Важно отметить, что склад работает с шести.',
    'Склад работает с шести утра.',
  ],
  [
    'chatbot-frame',
    'Отличный вопрос! Надеюсь, это поможет.',
    'Вопрос понятный, отвечаю по порядку.',
  ],
  [
    'stock-opening',
    'В современном мире остатки считают все.',
    'Остатки на складе считают все.',
  ],
  [
    'pseudo-depth',
    'Если копнуть глубже, все упускают главное.',
    'Остаток обновляется раз в час, вот и всё.',
  ],
  [
    'announcement',
    'Давайте разберёмся, как это работает.',
    'Работает так: заявка идёт в очередь.',
  ],
  [
    'bureaucratic',
    'Работа осуществляется в рамках проекта.',
    'Мы делаем это внутри проекта.',
  ],
  [
    'vvodnye',
    'Разумеется, прогон занял три часа.',
    'Прогон шёл собственно с утра до вечера.',
  ],
  [
    'evaluation-without-fact',
    'Мы собрали надёжный и эффективный конвейер.',
    // Граница из `lint_ru.py`: «-ость» — название измеряемого свойства.
    'Надёжность конвейера мы измеряли неделю.',
  ],
  [
    'intensifier',
    'Результат абсолютно предсказуемый для этой модели.',
    // Граница из `lint_ru.py`: одиночный усилитель — это голос человека.
    'Я считаю, что это плохая идея. Совершенно.',
  ],
  [
    'vague-quantity',
    'В прогоне участвовало более 20 моделей.',
    'В прогоне участвовало 20 моделей.',
  ],
  [
    'softener-cascade',
    'Возможно, в некоторых случаях это, скорее всего, сработает.',
    'Возможно, это сработает уже в четверг.',
  ],
  [
    'performative-honesty',
    'Честно говоря, я честно скажу: честнее не бывает.',
    'Честно говоря, цифр у меня нет.',
  ],
  [
    'forced-triad',
    'Нам нужны скорость, точность и надёжность.',
    'К обеду купил хлеб, молоко и сыр.',
  ],
  [
    'false-range',
    'Проект ведёт нас от эмоций до внедрения.',
    'Поезд идёт от Москвы до Казани.',
  ],
  [
    'template-positive-ending',
    'Будущее выглядит многообещающим.',
    'Следующий релиз назначен на 14 сентября.',
  ],
  [
    'abstract-wrapper',
    'В мире технологий всё меняется быстро.',
    'В мире романа герой остаётся один.',
  ],
  [
    'empty-image',
    'Рынок чует разворот.',
    'За три дня до отчёта объём торгов удвоился.',
  ],
  [
    'fact-run-up',
    'Метрика, за которой я слежу, выросла до 95.',
    'Важная метрика выросла до 95.',
  ],
];

describe('каждое русское правило и срабатывает, и молчит', () => {
  test.each(RU_PAIRS)('%s срабатывает', (ruleId, hit) => {
    expect(fires(ruleId, hit)).toBe(true);
  });

  test.each(RU_PAIRS)('%s молчит там, где не должно', (ruleId, _hit, quiet) => {
    expect(fires(ruleId, quiet)).toBe(false);
  });

  test('правил первой очереди не меньше двадцати пяти', () => {
    expect(rulesFor('ru').length).toBeGreaterThanOrEqual(25);
  });

  test('идентификаторы правил не повторяются', () => {
    const list = rulesFor('ru').map((rule) => rule.id);
    expect(new Set(list).size).toBe(list.length);
  });
});
/* --------------------------------------------------------------------------
 * Правила-счётчики
 * ----------------------------------------------------------------------- */

describe('счётчики считают текст, а не слова', () => {
  test('три рубленых предложения подряд — медитативный шаблон', () => {
    expect(
      fires('chopped-meditation', 'Коротко. Точно. Отдельно. Дальше факт.')
    ).toBe(true);
    expect(
      fires(
        'chopped-meditation',
        'Коротко. Затем подробно объясняем, что именно измерили.'
      )
    ).toBe(false);
  });

  test('три вопроса с короткими ответами образуют искусственный диалог', () => {
    const staged = 'Зачем? Ради роста. Кому? Нашей команде. Когда? Уже завтра.';
    const answered =
      'Зачем? Чтобы сократить приёмку с сорока минут до восемнадцати. Кому? Кладовщику второй смены.';

    expect(fires('question-answer-rhythm', staged)).toBe(true);
    expect(fires('question-answer-rhythm', answered)).toBe(false);
  });

  test('вопросов больше, чем держит Telegram', () => {
    const many = 'Зачем это? Кому это нужно? И что дальше?';
    const few = 'Зачем это? Кому это нужно?';

    expect(fires('rhetorical-questions', many, TELEGRAM)).toBe(true);
    expect(fires('rhetorical-questions', few, TELEGRAM)).toBe(false);
  });

  test('эмодзи как украшение', () => {
    const many = 'Первое 🔥 второе 🚀 третье ✨ и всё.';
    const few = 'Первое 🔥 второе 🚀 и всё.';

    expect(fires('emoji-decoration', many, TELEGRAM)).toBe(true);
    expect(fires('emoji-decoration', few, TELEGRAM)).toBe(false);
  });

  test('эмодзи в начале трёх строк — это маркеры списка', () => {
    const bullets = '🔥 Первое.\n🔥 Второе.\n🔥 Третье.';

    // Вид один, а находка есть: считается роль эмодзи, а не их разнообразие.
    expect(report(bullets, TELEGRAM).metrics.emojiKinds).toBe(1);
    expect(fires('emoji-decoration', bullets, TELEGRAM)).toBe(true);
  });

  test('жирного больше нормы', () => {
    const many = '**Раз** и **два**, а ещё **три** сверху.';
    const few = '**Раз** и **два**, дальше обычным текстом.';

    expect(fires('bold-overuse', many, TELEGRAM)).toBe(true);
    expect(fires('bold-overuse', few, TELEGRAM)).toBe(false);
  });

  test('списков больше, чем держит Telegram', () => {
    const two =
      'Первое:\n- раз\n- два\n\nВторое:\n- три\n- четыре\n\nНа этом всё.';
    const one = 'Итого:\n- раз\n- два\n- три\n\nНа этом всё.';

    expect(fires('list-overuse', two, TELEGRAM)).toBe(true);
    expect(fires('list-overuse', one, TELEGRAM)).toBe(false);
  });

  test('пунктов в списке больше, чем держит Telegram', () => {
    const long = 'Итого:\n- раз\n- два\n- три\n- четыре\n\nНа этом всё.';

    expect(report(long, TELEGRAM).metrics.listItemsMax).toBe(4);
    expect(fires('list-overuse', long, TELEGRAM)).toBe(true);
  });

  test('ровный ритм и отсутствие коротких фраз — разные находки', () => {
    const monotone = Array.from({ length: 12 }, () => sentenceOf(7)).join(' ');
    const long = [9, 15, 10, 17, 11, 16, 12, 18, 13, 14]
      .map(sentenceOf)
      .join(' ');

    expect(fires('monotone-rhythm', monotone)).toBe(true);
    expect(fires('no-short-sentences', monotone)).toBe(false);

    expect(fires('no-short-sentences', long)).toBe(true);
    expect(fires('monotone-rhythm', long)).toBe(false);
  });

  test('плотность тире: норма автора не находка, а вдвое чаще — находка', () => {
    // 4,6 на тысячу знаков — измеренная норма владельца, её правило не трогает.
    const norm = `${'Хабр — это сообщество, где пишут инженеры и читают инженеры каждый день.'.repeat(
      1
    )} ${'Обычная фраза без единого знака, чтобы набрать длину текста до нужной сотни знаков.'.repeat(
      2
    )}`;
    const dense = 'Раз — два. Три — четыре. Пять — шесть. Семь — восемь.';

    expect(report(norm).metrics.dashPer1k).toBeLessThanOrEqual(8);
    expect(fires('em-dash-density', norm)).toBe(false);
    expect(fires('em-dash-density', dense)).toBe(true);
  });

  test('одно тире в коротком посте частотой не считается', () => {
    const short = 'Платформа — это набор инструментов.';

    expect(report(short).metrics.dashPer1k).toBeGreaterThan(8);
    expect(fires('em-dash-density', short)).toBe(false);
  });

  test('счётчик несёт измеренное число', () => {
    const finding = report('Честно говоря, я честно скажу: честнее не бывает.')
      .findings.find((row) => row.ruleId === 'performative-honesty');

    expect(finding.count).toBe(3);
  });
});

/* --------------------------------------------------------------------------
 * Skip-зоны
 * ----------------------------------------------------------------------- */

describe('слово внутри кода, кавычек и ссылки — не находка', () => {
  test('штамп в «кавычках» цитируется, а не употребляется', () => {
    expect(fires('stock-opening', 'В современном мире мы живём давно.')).toBe(
      true
    );
    expect(
      fires('stock-opening', 'Автор написал «в современном мире» и ушёл.')
    ).toBe(false);
  });

  test('штамп внутри ссылки — часть адреса', () => {
    expect(
      fires(
        'stock-opening',
        'Разбор лежит тут: https://example.test/в-современном-мире-о-складе'
      )
    ).toBe(false);
  });

  test('цитатная строка чужая', () => {
    expect(fires('template-transition', '> важно отметить, что склад стоит')).toBe(
      false
    );
  });

  test('метка чат-бота в бэктиках — цитирование, а не копипаст', () => {
    expect(fires('artefact', 'Метка `turn0search0` разобрана в статье.')).toBe(
      false
    );
  });

  test('а внутри ссылки метка чат-бота видна: класс A читает адрес целиком', () => {
    expect(
      fires('artefact', 'Источник: https://example.com/x?utm_source=chatgpt.com')
    ).toBe(true);
  });
});

/* --------------------------------------------------------------------------
 * Отчёт целиком
 * ----------------------------------------------------------------------- */

const SLOP_PILE = `В современном мире важно отметить, что данный подход представляет собой не просто инструмент.
По мнению экспертов, аналитики отмечают эффективный и качественный результат.
Безусловно, очевидно, это абсолютно уникальное решение.
Давайте разберёмся: погружаемся в тему, вот что нужно знать.
Более 20 компаний, играет ключевую роль, знаменует собой новую эру.
Осуществляется в рамках, на данный момент, в целях и на основании.
Отличный вопрос, надеюсь, это поможет, буду рад помочь.
Может похвастаться, в самом сердце, раскрывает потенциал.
Подчёркивая и демонстрируя, свидетельствуя о росте.`;

const CLEAN_TELEGRAM = `Переписали приёмку заказов на складе.

Раньше кладовщик звонил в отдел продаж и уточнял остаток по каждой позиции вручную. Сейчас остаток видно в таблице, она обновляется каждые пять минут.

Что изменилось за месяц:
- срывов отгрузки стало 4 вместо 11
- приёмка одной машины занимает 18 минут вместо 40
- звонков в продажи почти не осталось

Сложность одна: старые карточки товара сводили руками, ушло две недели и три спорных ночи. Зато теперь сверка идёт сама, и кладовщик её не ждёт.

Если у вас остатки считают так же, напишите, как вы это решали. 🙂`;

describe('отчёт: порядок, кап, счёт и вердикт', () => {
  test('находок не больше пятнадцати, и обрезка названа', () => {
    const answer = report(SLOP_PILE, TELEGRAM);

    expect(answer.findings).toHaveLength(SLOP_MAX_FINDINGS);
    expect(answer.truncated).toBe(true);
    // Счёт считается по всем находкам, а не по показанным: вердикт обязан
    // говорить правду о тексте, даже когда список обрезан.
    expect(answer.score).toBeGreaterThan(SLOP_MAX_FINDINGS);
    expect(answer.verdict).toBe('rewrite');
  });

  test('сначала ошибки, потом по месту в тексте', () => {
    const answer = report(SLOP_PILE, TELEGRAM);
    const severities = answer.findings.map((finding) => finding.severity);
    const firstWarning = severities.indexOf('warn');

    expect(severities.slice(0, firstWarning).every((s) => s === 'error')).toBe(
      true
    );
    expect(severities.slice(firstWarning).includes('error')).toBe(false);
  });

  test('отрывок находки — это срез исходной строки по её же числам', () => {
    const answer = report(SLOP_PILE, TELEGRAM);
    const positioned = answer.findings.filter((finding) => finding.end > 0);

    expect(positioned.length).toBeGreaterThan(5);
    for (const finding of positioned) {
      expect(SLOP_PILE.slice(finding.start, finding.end)).toBe(finding.excerpt);
    }
  });

  test('чистый пост на шестьсот знаков проходит без находок', () => {
    const answer = report(CLEAN_TELEGRAM, TELEGRAM);

    expect(CLEAN_TELEGRAM.length).toBeGreaterThan(500);
    expect(answer.findings).toEqual([]);
    expect(answer.score).toBeLessThanOrEqual(3);
    expect(answer.verdict).toBe('clean');
    expect(answer.truncated).toBe(false);
  });

  test('пороги вердикта: 3 чисто, 10 посмотреть, 11 переписать', () => {
    expect(verdictFor(0)).toBe('clean');
    expect(verdictFor(3)).toBe('clean');
    expect(verdictFor(4)).toBe('review');
    expect(verdictFor(10)).toBe('review');
    expect(verdictFor(11)).toBe('rewrite');
  });

  test('счёт — это ошибки втрое плюс предупреждения', () => {
    const answer = report('Это не просто курс, это экосистема.');
    const errors = answer.findings.filter((f) => f.severity === 'error').length;
    const warnings = answer.findings.length - errors;

    expect(errors).toBeGreaterThan(0);
    expect(answer.score).toBe(errors * 3 + warnings);
  });

  test('версия, площадка и язык названы в отчёте', () => {
    const answer = report('Короткий текст.', { platform: 'vk', locale: 'en' });

    expect(answer.version).toBe('slop-check/1.0.0');
    // Незнакомая площадка получает умолчания, а не отказ.
    expect(answer.platform).toBe('default');
    expect(answer.locale).toBe('en');
  });

  test('пустой текст не ломает отчёт', () => {
    const answer = report('');

    expect(answer.findings).toEqual([]);
    expect(answer.metrics).toMatchObject({
      sentences: 0,
      words: 0,
      meanNeighbourDiff: null,
      dashPer1k: 0,
    });
    expect(answer.verdict).toBe('clean');
  });
});

/* --------------------------------------------------------------------------
 * Пороги площадок
 * ----------------------------------------------------------------------- */

describe('Telegram строже умолчаний', () => {
  test('пороги площадки', () => {
    expect(slopThresholds('telegram', 400)).toEqual({
      questions: 2,
      emojiKinds: 2,
      boldSpans: 2,
      lists: 1,
      listItems: 3,
    });
    expect(slopThresholds('linkedin', 400)).toEqual({
      questions: 3,
      emojiKinds: 3,
      boldSpans: 3,
      lists: 2,
      listItems: 6,
    });
  });

  test('незнакомая площадка — это умолчания', () => {
    expect(slopPlatformKey('mastodon')).toBe('default');
    expect(slopPlatformKey(undefined)).toBe('default');
    expect(slopPlatformKey('Telegram')).toBe('telegram');
  });

  test('три вопроса: для Telegram находка, для умолчаний нет', () => {
    const three = 'Зачем это? Кому это нужно? И что дальше?';

    expect(fires('rhetorical-questions', three, TELEGRAM)).toBe(true);
    expect(fires('rhetorical-questions', three, { platform: 'vk' })).toBe(false);
  });

  test('жирное считается от длины текста только выше двух', () => {
    // Норма автора применяется к текстам от двухсот слов; ниже неё порог
    // остаётся два, иначе одно выделение в коротком посте было бы перебором.
    expect(slopThresholds('vk', 10).boldSpans).toBe(2);
    expect(slopThresholds('vk', 600).boldSpans).toBe(4);
  });
});

describe('структура, которую требует площадка, не считается штампом', () => {
  const TLDR = `## TL;DR

- **Срок:** 14 сентября
- **Цена:** 350 ₽
- **Скорость:** 18 минут
- **Результат:** 4 срыва`;

  test.each(['habr', 'vc', 'pikabu', 'tenchat'])(
    '%s принимает TL;DR из 4–6 пунктов',
    (platform) => {
      const answer = report(TLDR, { platform });

      expect(answer.metrics.boldSpans).toBe(0);
      expect(answer.metrics.lists).toBe(0);
      expect(fires('bold-overuse', TLDR, { platform })).toBe(false);
      expect(fires('list-overuse', TLDR, { platform })).toBe(false);
    }
  );

  test('восьмипунктовый TL;DR снова считается обычным списком', () => {
    const tooLong = `${TLDR}\n- **Пятое:** факт\n- **Шестое:** факт\n- **Седьмое:** факт\n- **Восьмое:** факт`;

    expect(fires('list-overuse', tooLong, { platform: 'habr' })).toBe(true);
    expect(fires('bold-overuse', tooLong, { platform: 'habr' })).toBe(true);
  });

  test('Pikabu принимает шесть эмодзи-якорей, седьмой показывает находку', () => {
    const anchors = Array.from(
      { length: 6 },
      (_, index) => `🔥 Раздел ${index + 1}`
    ).join('\n');

    expect(fires('emoji-decoration', anchors, { platform: 'pikabu' })).toBe(false);
    expect(
      fires('emoji-decoration', `${anchors}\n🔥 Раздел 7`, {
        platform: 'pikabu',
      })
    ).toBe(true);
  });
});

/* --------------------------------------------------------------------------
 * HTML из редактора
 * ----------------------------------------------------------------------- */

describe('текст из редактора приходит разметкой', () => {
  const HTML =
    '<p>В современном мире всё считают.</p>' +
    '<p><b>Раз</b>, <strong>два</strong> и <b>три</b> подряд.</p>' +
    '<ul><li>первое</li><li>второе</li><li>третье</li><li>четвёртое</li></ul>';

  test('жирное в тегах считается жирным', () => {
    expect(report(HTML, { platform: 'telegram', html: true }).metrics.boldSpans).toBe(3);
    expect(fires('bold-overuse', HTML, { platform: 'telegram', html: true })).toBe(
      true
    );
  });

  test('список в тегах остаётся списком', () => {
    const answer = report(HTML, { platform: 'telegram', html: true });

    expect(answer.metrics.lists).toBe(1);
    expect(answer.metrics.listItemsMax).toBe(4);
  });

  test('теги словами не становятся, а штамп внутри абзаца находится', () => {
    const answer = report(HTML, { platform: 'telegram', html: true });
    const stock = answer.findings.find((f) => f.ruleId === 'stock-opening');

    expect(stock).toBeDefined();
    // Смещения остаются внутри переданной строки — иначе подсветить находку в
    // редакторе будет нечем.
    expect(HTML.slice(stock.start, stock.end)).toBe('В современном мире');
    for (const finding of answer.findings) {
      expect(finding.end).toBeLessThanOrEqual(HTML.length);
      expect(finding.start).toBeGreaterThanOrEqual(0);
    }
  });

  test('разметка распознаётся и без флага', () => {
    const withFlag = report(HTML, { platform: 'telegram', html: true });
    const without = report(HTML, { platform: 'telegram' });

    expect(without.metrics).toEqual(withFlag.metrics);
  });
});

/* --------------------------------------------------------------------------
 * Английский
 * ----------------------------------------------------------------------- */

const EN_PAIRS = [
  [
    'artefact',
    'The market grew :contentReference[oaicite:0]{index=0} last year.',
    'The article explains the `oaicite` marker in detail.',
  ],
  [
    'weasel-attribution',
    'Experts say the market will double.',
    'The ministry named the date in its March report.',
  ],
  [
    'template-transition',
    "It's important to note that the warehouse opens at six.",
    'The warehouse opens at six.',
  ],
  [
    'stock-opening',
    "In today's world everybody counts stock.",
    'Everybody counts stock these days.',
  ],
  [
    'ai-vocabulary',
    'Let us delve into the tapestry of the release.',
    'Let us look at what shipped in the release.',
  ],
  [
    'rule-of-three',
    'The tool is fast, cheap, and reliable.',
    'The tool is fast and cheap.',
  ],
  [
    'softener-cascade',
    'Perhaps, in some cases, this will possibly work.',
    'Perhaps this will work.',
  ],
];

describe('английский отчёт не бывает пустым по недосмотру', () => {
  test.each(EN_PAIRS)('%s срабатывает', (ruleId, hit) => {
    expect(fires(ruleId, hit, { locale: 'en' })).toBe(true);
  });

  test.each(EN_PAIRS)('%s молчит там, где не должно', (ruleId, _hit, quiet) => {
    expect(fires(ruleId, quiet, { locale: 'en' })).toBe(false);
  });

  test('русские правила по английскому тексту не гоняются', () => {
    expect(fires('vvodnye', 'Разумеется, прогон занял три часа.', {
      locale: 'en',
    })).toBe(false);
  });
});

/* --------------------------------------------------------------------------
 * Предложения самопроверки владельца
 * ----------------------------------------------------------------------- */

describe('предложения самопроверки владельца дают тот же ответ', () => {
  test('жёсткие запреты из lint.py --self-test', () => {
    const bad =
      'Это не просто курс — это экосистема. Скорость > идеальности. Без кода. Без настроек. Итог ≈ 5 часов, джуны vs сеньоры.';
    const found = ids(bad);

    expect(found).toContain('negative-parallelism');
    expect(found).toContain('math-signs');
    expect(found).toContain('chopped-drama');
  });

  test('голое «не только» и слово «данные» живого текста не шумят (tu3k.8)', () => {
    expect(fires('negative-parallelism', 'Не только я так думаю, спросите любого.')).toBe(false);
    expect(fires('negative-parallelism', 'Это не только цена, но и время.')).toBe(true);
    expect(fires('bureaucratic', 'Данные за август показали рост.')).toBe(false);
    expect(fires('bureaucratic', 'В рамках данной задачи.')).toBe(true);
  });

  test('чистая фраза из lint.py --self-test ошибок не даёт', () => {
    const ok =
      'Обычный текст - с коротким тире, без слопа. Цифры 12 и 87 на месте.\n> цитата\n+ пункт списка';

    expect(report(ok).findings.filter((f) => f.severity === 'error')).toEqual(
      []
    );
  });

  test('артефакты копипаста из lint.py --self-test, включая внутри ссылки', () => {
    const art =
      'Рынок вырос :contentReference[oaicite:0]{index=0}, детали turn0search3, ' +
      'см. https://example.com/?utm_source=chatgpt.com и [cite: 8].';
    const found = report(art).findings.filter((f) => f.ruleId === 'artefact');

    expect(found.length).toBeGreaterThanOrEqual(4);
    expect(found.every((f) => f.severity === 'error')).toBe(true);
  });

  test('местные правила из lint_ru.py --self-test', () => {
    const cases = {
      'evaluation-without-fact': 'Мы собрали надёжный и эффективный конвейер.',
      intensifier: 'Результат абсолютно предсказуемый для этой модели.',
      vvodnye: 'Разумеется, прогон занял три часа.',
      'vague-quantity': 'В прогоне участвовало более 20 моделей.',
      'contrast-tail':
        'Поставщика поменяли ещё в марте, а не в апреле прошлого года.',
    };

    for (const [ruleId, sample] of Object.entries(cases)) {
      expect([ruleId, fires(ruleId, sample)]).toEqual([ruleId, true]);
    }
  });

  test('голос владельца из lint_ru.py остаётся чистым', () => {
    const clean =
      'Я считаю, что это плохая идея. Совершенно.\nПрогнал 20 моделей, восемь из них отвалились.\n';

    expect(report(clean).findings).toEqual([]);
  });

  test('тире и разделитель «---» находками не считаются', () => {
    const dashes = 'Хабр — это сообщество.\n\n---\n\nВторой абзац про другое дело.\n';
    const found = ids(dashes);

    // Оба правила апстрима отключены владельцем осознанно: в русском тире
    // часто обязательно грамматически, а «---» — элемент структуры.
    expect(found).toEqual([]);
  });
});
