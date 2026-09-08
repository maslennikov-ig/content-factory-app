/**
 * Что человек вставил: мысль, ссылку или чужой пост.
 *
 * `content-factory-next-tu3k.1`, решение владельца 06.09.2026. Разбор
 * детерминированный и без единого вызова модели — по трём причинам. Первая:
 * определение вида решает, будет ли платный разбор чужого текста, и платить за
 * то, чтобы узнать, надо ли платить, — это счёт вдвое. Вторая: клиент узнаёт
 * ссылку сам и подписывает поле «Похоже на ссылку…» ещё до отправки, а две
 * половины одного правила расходятся, если одну из них считает модель. Третья:
 * ошибка здесь ничего не ломает — вид входа выбирает подсказки, а не результат,
 * и человек вправе прислать свой `inputKind`, который сервер принимает как есть.
 *
 * Файл чистый: ни одного обращения к базе, к сети и к Nest. Единственный
 * импорт — разбор адреса из веб-поиска, чтобы «ссылка» здесь и «ссылка» там
 * значили одно и то же (порт, IP-литерал, AMP-копия — всё уже решено).
 */

import type { IntakeInputKindV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { usableHttpsUrl } from '@contentfactory/nestjs-libraries/openai/web.research.service';

/**
 * Короче этого чужой пост не бывает.
 *
 * 400 знаков — примерно три абзаца в мессенджере: ниже этой границы стоят
 * собственные мысли и подписи, а не перепечатанный пост. Число выбрано под
 * телеграм-исследование (обычный пост 500–1000 знаков) с запасом вниз.
 */
export const FOREIGN_POST_MIN_CHARS = 400;

/**
 * Сколько текста рядом со ссылкой ещё считается «ссылка с комментарием».
 *
 * Сорок знаков — это «вот, посмотри» и не больше. Длиннее — человек уже
 * написал свою мысль, и брать её как ссылку значило бы выбросить его слова и
 * пересказать чужую страницу.
 */
export const LINK_COMMENT_MAX_CHARS = 40;

/**
 * Шапки пересылки. Мессенджер ставит их сам, и это самый честный признак
 * чужого текста, какой вообще бывает: его написал не человек, а его клиент.
 */
const FORWARD_HEADERS =
  /^\s*(переслано\s+(от|из|сообщение)|пересланное\s+сообщение|forwarded\s+(from|message)|-+\s*forwarded message)/iu;

/**
 * Пробелы, которые встречаются внутри числа: обычный, неразрывный, узкий
 * неразрывный и тонкий. Их ставит любой редактор, и без них «4 200» распалось
 * бы надвое.
 */
const NUMBER_SPACES = '\\u0020\\u00a0\\u202f\\u2009';

/**
 * Число с единицей, процентом или валютой.
 *
 * Не «любая цифра»: дата в подписи и номер дома есть в каждом втором тексте.
 * Считается число, за которым стоит знак процента, знак валюты или слово, —
 * «на 37%», «4,2 млрд», «12 стран».
 */
const NUMBER_WITH_UNIT = new RegExp(
  `(?:[$€£₽¥][${NUMBER_SPACES}]?\\d|\\d[\\d${NUMBER_SPACES}.,]*[${NUMBER_SPACES}]?(?:%|[$€£₽¥]|\\p{L}{2,}))`,
  'gu'
);

/** Кто говорит. Чужой пост почти всегда написан от первого лица. */
const FIRST_PERSON =
  /(?:^|[^\p{L}])(я|мы|мне|нам|нас|меня|мой|моя|моё|мои|моего|наш|наша|наше|наши|нашего|i|we|my|our|me|us)(?=$|[^\p{L}])/iu;

/** Границы предложений, общие для обоих языков продукта. */
const SENTENCE_SPLIT = /(?<=[.!?…])\s+|\n+/u;

const trimmed = (value: string | null | undefined) => (value || '').trim();

/**
 * Адреса, которые в этом тексте являются настоящими https-ссылками.
 *
 * Разбивка по пробелам, а не поиск регуляркой внутри строки: точка в конце
 * предложения и скобка вокруг ссылки — самые частые способы получить адрес,
 * которого нет. Хвостовая пунктуация снимается, всё остальное решает
 * `usableHttpsUrl`.
 */
const httpsTokens = (text: string): Array<{ raw: string; url: string }> => {
  const found: Array<{ raw: string; url: string }> = [];
  for (const raw of text.split(/\s+/u)) {
    if (!raw) continue;
    const cleaned = raw
      .replace(/^[(«"'<]+/u, '')
      .replace(/[)»"'>.,;:!?]+$/u, '');
    const url = usableHttpsUrl(cleaned);
    if (url) found.push({ raw, url });
  }
  return found;
};

/** Every usable URL, deduplicated; fetching still goes through the safe gateway. */
export const linksOf = (input: string): string[] => [...new Set(httpsTokens(input).map(({ url }) => url))];

/**
 * Ссылка, если ссылка здесь — единственное содержимое.
 *
 * Один адрес и не больше сорока знаков всего остального, где бы они ни стояли:
 * «вот https://…» и «https://… интересно» — один и тот же случай, и делить их
 * по месту комментария значило бы объяснять человеку, с какой стороны писать.
 */
export const singleLinkOf = (input: string): string | null => {
  const text = trimmed(input);
  const links = httpsTokens(text);
  if (links.length !== 1) return null;
  const rest = text.replace(links[0].raw, ' ').replace(/\s+/gu, ' ').trim();
  return rest.length <= LINK_COMMENT_MAX_CHARS ? links[0].url : null;
};

/** Сколько чисел с единицей стоит в тексте. */
export const numberWithUnitCount = (text: string): number =>
  (text.match(NUMBER_WITH_UNIT) || []).length;

/** В скольких предложениях текста говорят от первого лица. */
export const firstPersonSentenceCount = (text: string): number =>
  text
    .split(SENTENCE_SPLIT)
    .filter((sentence) => FIRST_PERSON.test(sentence)).length;

/**
 * Вид входа. Порядок проверок — от самого надёжного признака к самому шаткому.
 *
 * Шапка пересылки решает сразу: её поставил клиент мессенджера. Затем ссылка —
 * признак структурный, ошибиться в нём нельзя. Чужой пост определяется длиной
 * и двумя приметами: числа с единицами (перепечатанная новость) или речь от
 * первого лица в двух и более предложениях (перепечатанный пост). Всё
 * остальное — мысль, и это правильный отказ по умолчанию: мысль обрабатывается
 * дешевле всего и ничего у человека не забирает.
 */
export const detectInputKind = (input: string): IntakeInputKindV1 => {
  const text = trimmed(input);
  if (!text) return 'thought';
  if (FORWARD_HEADERS.test(text)) return 'foreign_post';
  if (singleLinkOf(text)) return 'link';
  if (text.length < FOREIGN_POST_MIN_CHARS) return 'thought';
  if (numberWithUnitCount(text) >= 2) return 'foreign_post';
  if (firstPersonSentenceCount(text) >= 2) return 'foreign_post';
  return 'thought';
};

/** Длина отрезка, который считается заимствованным дословно. */
export const ANTI_COPY_MIN_WORDS = 8;

/**
 * Отпечатки в восемь слов — общий счёт волны, живёт в
 * `content-intelligence/text-quality/anti-copy.ts` (поток S3). Здесь только
 * реэкспорт, чтобы вход не знал, где именно считают.
 */
export { wordShingles } from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/anti-copy';
