'use strict';

/**
 * Что человек вставил — решается без модели (`content-factory-next-tu3k.1`).
 *
 * Вид входа выбирает, будет ли платный разбор чужого текста. Спрашивать об
 * этом модель значило бы платить за то, чтобы узнать, надо ли платить. Здесь
 * проверяется, что разбор делает это сам и делает предсказуемо — на пяти
 * случаях, каждый из которых уже был в живом прогоне владельца.
 *
 * Ни одного вызова модели и ни одного обращения к сети: файл чистый, а
 * `usableHttpsUrl` берётся настоящий — «ссылка» здесь и «ссылка» в веб-поиске
 * обязаны значить одно и то же.
 */

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const KIND =
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake-kind.ts';

const {
  detectInputKind,
  singleLinkOf,
  wordShingles,
  ANTI_COPY_MIN_WORDS,
} = loadWithMocks(KIND);

/** Девятьсот знаков от первого лица с тремя числами — перепечатанный пост. */
const foreignPost = [
  'Мы закрыли половину продуктовой линейки в марте и до сих пор считаем это',
  'лучшим решением года. Выручка компании достигла 4,2 млрд рублей, и это на',
  '37% больше, чем годом раньше. Присутствие осталось в 12 странах вместо',
  'девятнадцати. Я помню, как мы спорили об этом три недели подряд, и помню',
  'аргумент, который всё решил: широкая линейка не защищает от просадки, она',
  'просто размазывает её по кварталам. Наша команда переехала на новую',
  'платформу за шесть недель, без единого простоя. Мне до сих пор пишут',
  'бывшие клиенты закрытых продуктов, и я каждому отвечаю сам. Это',
  'неприятная часть работы, и её нельзя делегировать. Если бы мы начинали',
  'заново, я резал бы ещё жёстче и ещё раньше, потому что боль от',
  'отказа короче боли от растянутого умирания продукта, который никому',
  'не нужен.',
].join(' ');

describe('вид входа виден по самому тексту', () => {
  test('один адрес и ничего больше — ссылка', () => {
    expect(detectInputKind('https://example.test/post')).toBe('link');
    expect(singleLinkOf('https://example.test/post')).toBe(
      'https://example.test/post'
    );
  });

  test('адрес с коротким комментарием — всё ещё ссылка', () => {
    expect(detectInputKind('вот это интересно https://example.test/post')).toBe(
      'link'
    );
    expect(
      detectInputKind('https://example.test/post — посмотри, это про нас')
    ).toBe('link');
  });

  test('адрес внутри длинной мысли ссылкой не считается', () => {
    const thought = [
      'Я неделю думал про то, как мы объясняем цену, и понял, что объясняем',
      'её не тем людям: https://example.test/post говорит ровно об этом, но',
      'мне важнее собственный вывод, а не чужая статья про него.',
    ].join(' ');

    expect(detectInputKind(thought)).toBe('thought');
    expect(singleLinkOf(thought)).toBeNull();
  });

  test('длинный текст от первого лица с числами — чужой пост', () => {
    expect(foreignPost.length).toBeGreaterThan(400);
    expect(detectInputKind(foreignPost)).toBe('foreign_post');
  });

  test('шапка пересылки решает сразу, какой бы короткой ни была запись', () => {
    expect(detectInputKind('Переслано от Ивана\nЗавтра всё меняется')).toBe(
      'foreign_post'
    );
    expect(
      detectInputKind('Forwarded from Some Channel\nTomorrow everything changes')
    ).toBe('foreign_post');
  });

  test('короткая мысль остаётся мыслью', () => {
    expect(detectInputKind('Надо больше писать про ИИ')).toBe('thought');
    expect(
      detectInputKind('Я думаю, что дедлайн работает только с клиентом.')
    ).toBe('thought');
  });

  test('пустой и почти пустой вход не притворяются чужим текстом', () => {
    expect(detectInputKind('')).toBe('thought');
    expect(detectInputKind('   ')).toBe('thought');
  });
});

describe('отрезки по восемь слов — мерка дословного заимствования', () => {
  test('текст короче мерки отрезков не даёт', () => {
    expect(wordShingles('одно два три')).toEqual([]);
    expect(ANTI_COPY_MIN_WORDS).toBe(8);
  });

  test('отрезки идут внахлёст и не повторяются', () => {
    const shingles = wordShingles(
      'один два три четыре пять шесть семь восемь девять'
    );

    expect(shingles).toEqual([
      'один два три четыре пять шесть семь восемь',
      'два три четыре пять шесть семь восемь девять',
    ]);
  });

  test('регистр и знаки препинания отрезок не меняют', () => {
    const left = wordShingles('Один, два. Три четыре пять шесть семь ВОСЕМЬ!');
    const right = wordShingles('один два три четыре пять шесть семь восемь');

    expect(left).toEqual(right);
  });
});
