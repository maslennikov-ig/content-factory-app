'use strict';

/**
 * The author's own posts, in the field that was built for them.
 *
 * `content.examples` existed, was drawn on screen, and since 2026-08-25 goes
 * into the prompt as an instruction — and the analysis never filled it. A
 * workspace holding 153 of the owner's posts sent the model none of them, while
 * both answers of the research put demonstrations first by a distance: DITTO
 * reports +19 percentage points over few-shot prompting at fewer than ten
 * demonstrations.
 *
 * Two rules are held here because both are measured rather than felt.
 *
 * Never by closeness to the topic: the one answer that brought numbers measured
 * that picking the five posts nearest the topic makes authorship similarity
 * worse (Enron 95.44 → 81.28, Reddit 68.07 → 53.10, Blog 19.40 → 10.33). The
 * selector takes no topic — and a test says so, because a parameter that exists
 * is a parameter somebody wires up later.
 *
 * Never from the holdout half: that half is what the profile is checked
 * against, and an example drawn from it turns the check into a formality.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const examples = loadTypeScriptModule(`${base}/voice-examples.ts`);
const directives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/voice-directives.ts'
);

/**
 * Тридцать РАЗНЫХ постов в одной манере и два «странных».
 *
 * До 26.08.2026 здесь лежали три текста, размноженные до тридцати подстановкой
 * номера. Это была не модель корпуса, а модель дубликата: непохожесть внутри
 * такой пары — 0,035…0,050, тогда как у двух настоящих постов одного автора
 * минимум 0,716 при медиане 0,980. Фикстура доказывала свойства на данных,
 * которых не бывает, и заодно скрывала, что в обучающей части остаются всего
 * три различных текста.
 *
 * Теперь посты собираются из общего запаса фраз так, что любые два делят не
 * больше одной, а длина меняется от двух фраз до шести — иначе предпочтение
 * средней половине корпуса по длине нечем проверить.
 */
const SENTENCES = [
  'Сел разбирать прогон и посчитал руками, потому что глазами такое не ловится.',
  'Вышло хуже, чем я ждал: цифра не держится между двумя прогонами подряд.',
  'Записал сюда, чтобы не забыть, — своей памяти я в этом месте уже не верю.',
  'Собрал стенд за вечер и сразу об него обжёгся, причём дважды за один день.',
  'Две правки выглядели верными, а числа сказали обратное, и одна уже платная.',
  'Пока нет мерки, любое «стало лучше» — это ощущение, а не результат работы.',
  'Померил задержку поиска по распределению, а не по среднему, и удивился.',
  'Среднее врало ровно там, где больно: хвост оказался длиннее вдвое.',
  'Оставляю здесь оба числа, чтобы через месяц не спорить об этом с собой.',
  'Выкинул половину настроек и не заметил разницы ни в одном из прогонов.',
  'Проверять гипотезу дешевле, чем её обсуждать, и это выяснилось не сразу.',
  'Отложил половину корпуса заранее, иначе проверка ничего бы не проверяла.',
  'Порог подбирали под данные, поэтому он и держался только на них одних.',
  'Третий заход показал то же самое, и вот теперь я готов этому верить.',
  'Пересчитал вручную двадцать строк и нашёл ошибку в двенадцатой по счёту.',
  'Логи писались в два места сразу, а читал я всё это время не то место.',
  'Оценка «примерно вдвое» на поверку оказалась «в семь раз», и это меняет план.',
  'Убрал кэш, и стало медленнее ровно настолько, насколько он и обещал.',
  'Сначала померил, потом починил, потом померил снова — иначе не считается.',
  'Половина находок оказалась одной находкой, названной четырьмя способами.',
  'Откатил и повторил с нуля: воспроизводимость важнее скорости на этом шаге.',
  'Договорились считать по медиане, потому что среднее здесь ни о чём не говорит.',
  'Заметка на будущее: сначала спросить, чем это будет измерено, потом делать.',
  'Цена ошибки тут — оплаченный прогон, поэтому проверка идёт до, а не после.',
];

const ODDITIES = [
  'ВНИМАНИЕ!!! РАСПРОДАЖА КУРСОВ ТОЛЬКО СЕГОДНЯ!!! Успей купить со скидкой семьдесят процентов, количество мест ограничено, торопись, потом будет дороже, а мы не обещаем повторить это предложение никогда больше в этом году!!!',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute.',
];

/**
 * Пост номер `index`: три-шесть фраз из общего запаса, взятых с шагом, взаимно
 * простым с его размером. Два поста делят не больше одной фразы.
 */
const postOf = (index) => {
  // Шаг 5 взаимно прост с 24, длина меняется с периодом 5: период пары — 120,
  // поэтому все тридцать постов различны. Шаг, кратный числу фраз, давал бы
  // точные повторы через каждые двадцать четыре поста.
  const count = 3 + (index % 5);
  const parts = [];
  for (let step = 0; step < count; step += 1) {
    parts.push(SENTENCES[(index * 5 + step * 7) % SENTENCES.length]);
  }
  return parts.join(' ');
};

const corpus = () => {
  const rows = [];
  for (let index = 0; index < 30; index += 1) {
    rows.push({
      code: `smp-${String(index + 1).padStart(3, '0')}`,
      text: postOf(index),
      language: 'ru',
      contentHash: `hash-${index}`,
    });
  }
  ODDITIES.forEach((text, index) => {
    rows.push({
      code: `smp-9${index}`,
      text,
      language: 'ru',
      contentHash: `odd-${index}`,
    });
  });
  return rows;
};

/** Каждый третий — в отложенную часть, как это делает анализатор по хешу. */
const splitOf = (rows) =>
  Object.fromEntries(
    rows.map((one, index) => [one.code, index % 3 === 0 ? 'HOLDOUT' : 'TRAIN'])
  );

describe('примеры автора отбираются из обучающей части', () => {
  const rows = corpus();
  const split = splitOf(rows);
  const chosen = examples.selectVoiceExamples(rows, split);

  it('их от четырёх до шести', () => {
    expect(chosen.length).toBeGreaterThanOrEqual(examples.MIN_VOICE_EXAMPLES);
    expect(chosen.length).toBeLessThanOrEqual(examples.MAX_VOICE_EXAMPLES);
  });

  it('ни один не взят из отложенной части', () => {
    const holdout = new Set(
      Object.entries(split)
        .filter(([, side]) => side === 'HOLDOUT')
        .map(([code]) => code)
    );

    chosen.forEach((one) => expect(holdout.has(one.sourceCode)).toBe(false));
  });

  it('все помечены как образец манеры, а не как антипример', () => {
    chosen.forEach((one) => expect(one.kind).toBe('on_brand'));
  });

  it('ни один не длиннее потолка, до которого режет промпт', () => {
    chosen.forEach((one) =>
      expect(one.text.length).toBeLessThanOrEqual(examples.MAX_EXAMPLE_CHARS)
    );
  });

  it('потолок тот же самый, что у сборщика промпта', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(
        __dirname,
        '..',
        'libraries/nestjs-libraries/src/agent/voice-directives.ts'
      ),
      'utf8'
    );

    expect(source).toContain(
      `const MAX_EXAMPLE_CHARS = ${examples.MAX_EXAMPLE_CHARS};`
    );
    expect(typeof directives.voiceInstructionLines).toBe('function');
  });

  it('одинаковые тексты не приходят дважды', () => {
    const texts = chosen.map((one) => one.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('тот же корпус даёт тот же отбор', () => {
    expect(examples.selectVoiceExamples(rows, split)).toEqual(chosen);
  });
});

describe('один и тот же пост не цитируется дважды', () => {
  /**
   * Настоящие два поста одного автора расходятся на 0,716 и выше при медиане
   * 0,980 — метрика насыщена и «похожий пост» от «другого поста» не отличает.
   * Единственное, что она различает уверенно, — повтор: тот же текст с
   * изменённой цифрой лежит на 0,035…0,050. Порог отбора стоит между этими
   * полосами, поэтому проверяется он тоже повтором, а не похожестью.
   */
  const withDuplicates = () => {
    const rows = corpus();
    const original = rows[0].text;
    for (let copy = 0; copy < 6; copy += 1) {
      rows.push({
        code: `smp-dup-${copy}`,
        text: `${original} Прогон номер ${copy + 41}.`,
        language: 'ru',
        contentHash: `dup-${copy}`,
      });
    }
    return rows;
  };

  it('из шести копий одного текста в цитаты попадает не больше одной', () => {
    const rows = withDuplicates();
    const split = Object.fromEntries(rows.map((one) => [one.code, 'TRAIN']));
    const chosen = examples.selectVoiceExamples(rows, split);

    const fromDuplicateFamily = chosen.filter(
      (one) => one.sourceCode === 'smp-001' || one.sourceCode.startsWith('smp-dup-')
    );

    expect(fromDuplicateFamily.length).toBeLessThanOrEqual(1);
  });

  it('порог стоит между полосой повторов и полосой настоящих постов', () => {
    expect(examples.MIN_EXAMPLE_UNLIKENESS).toBeGreaterThan(0.05);
    expect(examples.MIN_EXAMPLE_UNLIKENESS).toBeLessThan(0.716);
  });

  it('корпус из трёх различных текстов отдаёт три примера, а не четыре повтора', () => {
    const rows = [];
    for (let index = 0; index < 3; index += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        rows.push({
          code: `smp-${index}-${copy}`,
          text: `${postOf(index)} Прогон номер ${copy + 1}.`,
          language: 'ru',
          contentHash: `hash-${index}-${copy}`,
        });
      }
    }
    const split = Object.fromEntries(rows.map((one) => [one.code, 'TRAIN']));

    expect(examples.selectVoiceExamples(rows, split)).toHaveLength(3);
  });
});

describe('цитаты берутся из середины корпуса по длине', () => {
  /**
   * В блоке аватара нет строки о длине — по решению владельца 25.08.2026 голос
   * это человек и его тексты, а не свод правил. Значит, длине модель учится
   * только по цитатам, и цитировать самые длинные посты автора значит учить
   * писать длиннее, чем он пишет.
   *
   * На корпусе владельца до этой правки медиана тройки, доходящей до промпта,
   * была 1003 знака при медиане корпуса 823; чистая представительность делала
   * хуже — 1210.
   */
  const rows = corpus();
  const split = splitOf(rows);
  const chosen = examples.selectVoiceExamples(rows, split);
  const lengthOf = new Map(rows.map((one) => [one.code, one.text.length]));
  const trainLengths = rows
    .filter((one) => split[one.code] === 'TRAIN')
    .map((one) => one.text.length)
    .sort((left, right) => left - right);
  const at = (share) =>
    trainLengths[Math.floor((trainLengths.length - 1) * share)];

  it('ни один пример не длиннее верхней границы средней половины', () => {
    chosen.forEach((one) =>
      expect(lengthOf.get(one.sourceCode)).toBeLessThanOrEqual(at(0.75))
    );
  });

  it('самый длинный пост корпуса не цитируется', () => {
    const longest = rows
      .filter((one) => split[one.code] === 'TRAIN')
      .sort((left, right) => right.text.length - left.text.length)[0];

    expect(chosen.map((one) => one.sourceCode)).not.toContain(longest.code);
  });

  /**
   * Полоса длин спасает только там, где она узкая.
   *
   * У владельца средняя половина корпуса — 629…992 знака, и внутри неё
   * смещение ранжирования по длине уже равно нулю (ρ = −0,01): обрезка там не
   * зарабатывает ничего. На корпусе длинной формы та же средняя половина —
   * 944…2288, внутри неё ρ = −0,39 без обрезки и −0,25 с ней. Поэтому корпус
   * этой проверки собран длинным: без обрезки ранжирование снова становится
   * состязанием в длине, и цитаты уезжают к верхнему краю полосы.
   */
  describe('длину нельзя обменять на место в ранжировании', () => {
    /**
     * Спрашивается у самого ранжирования, потому что полоса длин прячет ответ.
     *
     * У владельца средняя половина корпуса — 629…992 знака, и внутри неё
     * смещение уже равно нулю (ρ = −0,01): там обрезка не зарабатывает ничего,
     * и отбор целиком выглядит одинаково с ней и без неё. На корпусе длинной
     * формы та же средняя половина — 944…2288, внутри неё ρ = −0,39 без
     * обрезки и −0,25 с ней. Проверка ставит вопрос прямо: пост, к которому
     * дописали его же текст, стал вдвое длиннее и ни на слово не изменился по
     * манере — значит, подниматься ему не за что.
     */
    const pool = () =>
      Array.from({ length: 20 }, (_, index) => ({
        code: `rank-${String(index + 1).padStart(3, '0')}`,
        text: postOf(index),
      }));

    it('повтор собственного текста не поднимает пост в ранжировании', () => {
      const before = examples.rankByTypicality(pool());
      /**
       * Мишень длиннее обрезки, и это не удобство, а граница правила: обрезка
       * равняет только то, что длиннее её самой. Пост короче обрезки, дописанный
       * собой же, становится другим текстом — длиннее и с большим числом окон, —
       * и подняться ему есть за что. Правило звучит так: длина СВЕРХ обрезки не
       * покупает ничего.
       */
      const longest = [...pool()].sort(
        (left, right) => right.text.length - left.text.length
      )[0];
      const target = longest.code;
      const positionBefore = before.findIndex((one) => one.code === target);

      const doubled = pool().map((one) =>
        one.code === target ? { ...one, text: `${one.text} ${one.text}` } : one
      );
      const positionAfter = examples
        .rankByTypicality(doubled)
        .findIndex((one) => one.code === target);

      expect(positionAfter).toBeGreaterThanOrEqual(positionBefore);
    });
  });

  it('обрезка ранжирования не уходит ниже того, что мерка вообще считает', () => {
    expect(examples.MAX_RANKING_CROP).toBeGreaterThan(0);

    const short = Array.from({ length: 12 }, (_, index) => ({
      code: `tiny-${index}`,
      text: postOf(index).slice(0, 260),
      language: 'ru',
      contentHash: `tiny-${index}`,
    }));
    const split = Object.fromEntries(short.map((one) => [one.code, 'TRAIN']));

    // Корпус короче обрезки не должен ронять отбор в пустоту.
    expect(
      examples.selectVoiceExamples(short, split).length
    ).toBeGreaterThanOrEqual(examples.MIN_VOICE_EXAMPLES);
  });
});

describe('то, что отбор отдаёт в профиль, профиль принимает', () => {
  /**
   * Дефект, найденный 26.08.2026 через продуктовую дверь «подобрать примеры
   * заново». Отбор возвращает `sourceCode` — свою ручку на пост, — а валидатор
   * содержимого профиля знает у примера ровно два ключа. Путь активации поле
   * снимал, путь `setExamples` — нет, и кнопка отказывала с
   * `VOICE_FIELDS_INCOMPLETE` и шестью `sourceCode:unknown_field`, сообщая при
   * этом о НЕХВАТКЕ обязательных полей.
   *
   * Проверяется настоящим валидатором, а не списком ключей рядом: список,
   * переписанный в тест, разойдётся с кодом ровно так же, как разошлись два
   * пути.
   */
  const validation = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.validation.ts'
  );

  it('примеры из отбора не несут в профиль ни одного лишнего ключа', () => {
    const rows = corpus();
    const chosen = examples.selectVoiceExamples(rows, splitOf(rows));
    expect(chosen.length).toBeGreaterThan(0);

    const issues = [];
    examples.toProfileExamples(chosen).forEach((one, index) => {
      Object.keys(one).forEach((key) => {
        if (!['kind', 'text'].includes(key)) {
          issues.push(`examples.${index}.${key}`);
        }
      });
    });

    expect(issues).toEqual([]);
  });

  it('содержимое профиля с этими примерами проходит валидацию', () => {
    const rows = corpus();
    const chosen = examples.selectVoiceExamples(rows, splitOf(rows));
    const content = {
      schemaVersion: 1,
      voice: {
        pointOfView: 'first_person',
        formality: 'conversational',
        defaultLanguage: 'ru',
        allowedLanguages: ['ru'],
      },
      examples: examples.toProfileExamples(chosen),
    };

    const result = validation.validateBrandProfileContent(content, {
      forActivation: true,
    });
    // Остальное содержимое здесь намеренно неполное: проверяются примеры, и
    // претензии к ним валидатор называет путём `examples.<n>.<ключ>`.
    const named = (result.issues ?? []).filter((one) =>
      String(one).startsWith('examples')
    );

    expect(named).toEqual([]);
  });

  it('исходный отбор действительно несёт ручку, которую снимает граница', () => {
    // Иначе оба теста выше зеленели бы и на отборе, который её не отдаёт вовсе,
    // и дефект вернулся бы вместе с полем.
    const rows = corpus();
    const chosen = examples.selectVoiceExamples(rows, splitOf(rows));

    chosen.forEach((one) => expect(typeof one.sourceCode).toBe('string'));
  });
});

describe('отбор по близости к теме запрещён', () => {
  /**
   * Проверяется подписью, а не намерением: у функции два параметра — корпус и
   * разбиение. Третьего, куда можно было бы передать тему, нет.
   */
  it('у отбора нет параметра темы', () => {
    expect(examples.selectVoiceExamples.length).toBe(2);
  });

  it('отбор не меняется от того, о чём написан следующий пост', () => {
    const rows = corpus();
    const split = splitOf(rows);
    const first = examples.selectVoiceExamples(rows, split);
    const second = examples.selectVoiceExamples([...rows].reverse(), split);

    // Порядок постов в корпусе — не сигнал о теме и не должен двигать отбор.
    expect(new Set(second.map((one) => one.sourceCode))).toEqual(
      new Set(first.map((one) => one.sourceCode))
    );
  });
});

/**
 * Цитаты берутся из свежих постов, а числа — из всего корпуса.
 *
 * Решение владельца 26.08.2026. Замер, который его вызвал: на корпусе владельца
 * центроид опирается на один период — ρ(расстояние, позиция в канале) = +0,67,
 * девять из десяти самых типичных постов лежат в первых 30% канала, где автор
 * писал в более рекламной манере (медиана эмодзи 8,7 на тысячу против 4,1 в
 * свежей половине). Под аватаром цитаты — единственное, что учит манере, и
 * учили они манере, от которой автор ушёл.
 *
 * Разделение намеренное и составляет всю суть решения: статистике нужны все
 * посты, потому что на тридцати коридор шумит, а цитатам — нынешняя манера.
 */
describe('окно свежести для цитат', () => {
  /** Корпус на `count` постов; `ref(index)` решает, чем помечен каждый. */
  const dated = (count, ref) => {
    const rows = [];
    for (let index = 0; index < count; index += 1) {
      rows.push({
        code: `smp-${String(index + 1).padStart(3, '0')}`,
        text: postOf(index),
        language: 'ru',
        contentHash: `hash-${index}`,
        externalRef: ref(index),
      });
    }
    return rows;
  };

  const allTrain = (rows) =>
    Object.fromEntries(rows.map((one) => [one.code, 'TRAIN']));

  const indexOfCode = (code) => Number(code.slice(4)) - 1;

  it('на выгрузке Telegram цитируются только последние сорок постов', () => {
    // Идентификаторы растут вместе с индексом, как их пишет parseTelegramExport.
    const rows = dated(120, (index) => String(1000 + index));
    const chosen = examples.selectVoiceExamples(rows, allTrain(rows));

    expect(chosen.length).toBeGreaterThanOrEqual(examples.MIN_VOICE_EXAMPLES);
    chosen.forEach((one) => {
      expect(indexOfCode(one.sourceCode)).toBeGreaterThanOrEqual(
        120 - examples.RECENT_WINDOW
      );
    });
  });

  it('окно считает по идентификатору сообщения, а не по порядку в списке', () => {
    // Тот же корпус, идентификаторы против порядка: свежие посты стоят первыми.
    const rows = dated(120, (index) => String(1000 + (119 - index)));
    const chosen = examples.selectVoiceExamples(rows, allTrain(rows));

    chosen.forEach((one) => {
      expect(indexOfCode(one.sourceCode)).toBeLessThan(examples.RECENT_WINDOW);
    });
  });

  /**
   * Один пост без идентификатора — это один пост неизвестного возраста, и
   * «свежий» тогда не значит ничего, что одновременно включало бы его и
   * исключало. Такой корпус целиком остаётся на прежнем поведении.
   */
  it('один пост без идентификатора отменяет окно для всего корпуса', () => {
    const rows = dated(120, (index) =>
      index === 7 ? undefined : String(1000 + index)
    );
    const chosen = examples.selectVoiceExamples(rows, allTrain(rows));
    const oldest = Math.min(...chosen.map((one) => indexOfCode(one.sourceCode)));

    expect(oldest).toBeLessThan(120 - examples.RECENT_WINDOW);
  });

  it('имя файла в externalRef окном не считается', () => {
    // FILE и PASTE кладут сюда имя или ничего; порядка во времени в них нет.
    const rows = dated(120, (index) => `corpus-${index}.txt`);
    const chosen = examples.selectVoiceExamples(rows, allTrain(rows));
    const oldest = Math.min(...chosen.map((one) => indexOfCode(one.sourceCode)));

    expect(oldest).toBeLessThan(120 - examples.RECENT_WINDOW);
  });

  it('корпус короче окна остаётся собой целиком', () => {
    const rows = dated(20, (index) => String(1000 + index));
    const chosen = examples.selectVoiceExamples(rows, allTrain(rows));

    expect(chosen.length).toBeGreaterThanOrEqual(examples.MIN_VOICE_EXAMPLES);
  });

  /**
   * Внутри окна порядок — по типичности, а не по свежести. Иначе отбор молча
   * стал бы «шесть последних постов», и обе меры — типичность и непохожесть —
   * перестали бы на что-либо влиять.
   */
  it('внутри окна выбираются не просто последние шесть', () => {
    const rows = dated(120, (index) => String(1000 + index));
    const chosen = examples.selectVoiceExamples(rows, allTrain(rows));
    const newest = [...chosen]
      .map((one) => indexOfCode(one.sourceCode))
      .sort((left, right) => right - left)
      .slice(0, chosen.length);

    expect(newest).not.toEqual(
      Array.from({ length: chosen.length }, (_, step) => 119 - step)
    );
  });
});

describe('корпус, из которого выбирать нечего', () => {
  it('пустой корпус даёт пустой список, а не ошибку', () => {
    expect(examples.selectVoiceExamples([], {})).toEqual([]);
  });

  it('корпус целиком в отложенной части ничего не отдаёт', () => {
    const rows = corpus();
    const split = Object.fromEntries(
      rows.map((one) => [one.code, 'HOLDOUT'])
    );

    expect(examples.selectVoiceExamples(rows, split)).toEqual([]);
  });
});
