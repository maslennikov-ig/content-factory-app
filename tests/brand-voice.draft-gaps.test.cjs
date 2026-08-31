'use strict';

/**
 * Чего черновику не хватает — предложение, а не вопрос вместо текста.
 *
 * Задача `content-factory-next-pl1.25` и уточнение владельца 28.08.2026.
 * Проверяется не арифметика доли, а четыре обещания, нарушение каждого из
 * которых превращает генерацию в анкету или в ложь:
 *
 * 1. Текст не трогается. Пост выдаётся целым и отправляется как есть, если
 *    человек ничего не ответит.
 * 2. Предложение появляется только там, где пробел ИЗМЕРИМ: привычка автора
 *    читается из профиля, отсутствие фактов — из слоя фактов.
 * 3. Пример показывает форму и берётся из собственного поста автора. Продукт
 *    не знает его цифр и не имеет права их сочинять.
 * 4. Молчание — обычный исход, а не отсутствие ответа.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const {
  draftGap,
  measurementExample,
  HABITUAL_SHARE,
  MIN_HABIT_POSTS,
  DRAFT_GAP_VERSION,
} = loadTypeScriptModule(`${BASE}/draft-gaps.ts`);
const { RU_LOCALE_PACK } = loadTypeScriptModule(`${BASE}/locale-pack.ru.ts`);

/** Привычка владельца по замеру 26.08.2026: 54% его постов несут своё число. */
const HABIT = { share: 54, of: 153 };

/** Черновик без единого своего числа — ровно то, что даёт модель без фактов. */
const FLAT =
  'Если задача повторяется каждую неделю, я не начинаю с вопроса о том, ' +
  'какой инструмент сейчас популярен. Сначала смотрю, сколько времени он ' +
  'экономит и где ломается. Только после этого решаю, внедрять или оставить ' +
  'всё как есть.';

/** Тот же черновик, но со своим измерением. */
const WITH_NUMBER =
  'Прогнал шесть релизов через свой стенд: сборка упала с 14 минут до 4. ' +
  'Считаю не подписку, а время команды.';

/** Настоящие посты автора — источник примера и ничего больше. */
const OWN_POSTS = [
  'Разбирался, почему цены расходятся. Сел и померил: 460 запросов, восемь ' +
    'с половиной центов, оплата по факту.',
  'Кэш промпта срезал цену вызова в 3.9 раза, но включился только с третьего ' +
    'запроса.',
];

describe('пробел черновика называется, а текст остаётся целым', () => {
  it('предлагает, когда привычка есть, а числа в черновике нет', () => {
    const gap = draftGap(FLAT, HABIT, OWN_POSTS, false, RU_LOCALE_PACK);

    expect(gap).not.toBeNull();
    expect(gap.metric).toBe('carriesOwnMeasurement');
    expect(gap.version).toBe(DRAFT_GAP_VERSION);
    // Числа человек может проверить: доля и знаменатель, а не «часто».
    expect(gap.authorShare).toBe(54);
    expect(gap.authorOf).toBe(153);
  });

  it('пример — настоящее предложение автора, а не выдуманное число', () => {
    const gap = draftGap(FLAT, HABIT, OWN_POSTS, false, RU_LOCALE_PACK);

    expect(typeof gap.example).toBe('string');
    // Каждое слово примера обязано найтись в постах автора: продукт не знает
    // его цифр и сочинить их не вправе.
    const corpus = OWN_POSTS.join(' ');
    expect(corpus).toContain(gap.example);
  });

  it('молчит, когда число в черновике уже есть', () => {
    expect(
      draftGap(WITH_NUMBER, HABIT, OWN_POSTS, false, RU_LOCALE_PACK)
    ).toBeNull();
  });

  it('молчит, когда человек уже дал факты', () => {
    /**
     * Материал приложен, а числа в черновике нет — это другой дефект: модель
     * не воспользовалась тем, что ей дали. Просить у человека второй раз то,
     * что он уже принёс, — ровно та анкета, которую задача запрещает.
     */
    expect(draftGap(FLAT, HABIT, OWN_POSTS, true, RU_LOCALE_PACK)).toBeNull();
  });

  it('молчит, когда это не привычка автора', () => {
    const rare = { share: HABITUAL_SHARE - 1, of: 153 };

    expect(draftGap(FLAT, rare, OWN_POSTS, false, RU_LOCALE_PACK)).toBeNull();
  });

  it('молчит, когда доля посчитана на горстке постов', () => {
    const few = { share: 100, of: MIN_HABIT_POSTS - 1 };

    expect(draftGap(FLAT, few, OWN_POSTS, false, RU_LOCALE_PACK)).toBeNull();
  });

  it('молчит, когда привычки не измеряли вовсе', () => {
    expect(draftGap(FLAT, null, OWN_POSTS, false, RU_LOCALE_PACK)).toBeNull();
    expect(
      draftGap(FLAT, undefined, OWN_POSTS, false, RU_LOCALE_PACK)
    ).toBeNull();
  });

  it('предлагает и без примера, когда показывать нечего', () => {
    /**
     * Пример выдумать нельзя, а предложение без примера всё ещё осмысленно:
     * «здесь обычно стоит ваше число» — правда о тексте, даже когда показать
     * форму не на чем.
     */
    const gap = draftGap(FLAT, HABIT, ['Просто текст без чисел.'], false, RU_LOCALE_PACK);

    expect(gap).not.toBeNull();
    expect(gap.example).toBeNull();
  });

  it('из нескольких примеров берёт самый короткий', () => {
    // Пример читается мельком, рядом с готовым текстом. Абзац в этой роли —
    // не пример, а второй пост.
    const short = 'Собрал 7 моделей за 3 дня.';
    const long =
      'Померил всё это подробно и обстоятельно, потратив на замеры около ' +
      '14 часов чистого времени и ещё сколько-то на разбор результатов.';

    expect(measurementExample([long, short], RU_LOCALE_PACK)).toBe(short);
  });
});

describe('файл не умеет менять текст', () => {
  it('не экспортирует ничего, что возвращало бы черновик', () => {
    const fs = require('node:fs');
    const source = fs.readFileSync(`${BASE}/draft-gaps.ts`, 'utf8');

    /**
     * Главная проверка файла. Решение владельца: пост выдаётся готовым и
     * целым, а предложение идёт рядом. В тот день, когда здесь появится
     * функция, дописывающая в черновик «вставьте сюда число», это покраснеет
     * раньше, чем такой пост увидит человек.
     */
    expect(source).not.toMatch(/\breplace\(|\bconcat\(|\+= *text|\${text}/);
  });
});

/**
 * Новое поле на содержимом профиля обязано пройти валидатор.
 *
 * Это не гигиена, а самая дорогая ошибка этого раздела, повторённая дважды:
 * `persona` добавили в содержимое и не добавили в список известных полей, и два
 * месяца КАЖДАЯ активация с портретом отвергалась с `content.persona:
 * unknown_field`; `sourceCode` у примеров сделал то же самое с кнопкой
 * «подобрать заново». Поле приходит в валидатор тем же коммитом, что и в
 * содержимое, — или не приходит.
 */
describe('привычка приносить свои числа доходит до активации', () => {
  const validation = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.validation.ts'
  );

  /** Форма, которую строит `contentFrom`, минус всё, к чему этот случай не относится. */
  const contentWith = (bringsOwnMeasurements) => ({
    persona: { kind: 'PERSON' },
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
      ...(bringsOwnMeasurements ? { bringsOwnMeasurements } : {}),
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

  it('профиль с измеренной привычкой включается', () => {
    expect(issuesOf(contentWith({ share: 54, of: 153 }))).toEqual([]);
  });

  it('профиль без неё включается так же — поле необязательное', () => {
    expect(issuesOf(contentWith(null))).toEqual([]);
  });

  it('доля вне нуля-ста и знаменатель ниже единицы отвергаются', () => {
    expect(issuesOf(contentWith({ share: 154, of: 153 }))).toContain(
      'voice.bringsOwnMeasurements.share:invalid'
    );
    expect(issuesOf(contentWith({ share: 54, of: 0 }))).toContain(
      'voice.bringsOwnMeasurements.of:invalid'
    );
  });

  it('доля без знаменателя не проходит: «54%» на скольких постах', () => {
    expect(issuesOf(contentWith({ share: 54 }))).toContain(
      'voice.bringsOwnMeasurements.of:invalid'
    );
  });
});
