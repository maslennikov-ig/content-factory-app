/**
 * Число целиком — одним разбором для отрывка и для опор.
 *
 * `content-factory-next-97dq.10`, живая адаптация 18.09.2026. Правило
 * `vague-quantity` кончается на `\s+\d`, и отрывок находки обрывался на первой
 * цифре: человек видел «свыше 9» там, где в тексте стоит «свыше 90 дней», и
 * «более 6» вместо «более 620 000 бизнесов». Решение владельца того же дня:
 * правило остаётся, но точное число, которое пришло из источников, находкой не
 * считается, а сработавшая находка показывает число целиком.
 *
 * Оба требования — об одном и том же: где кончается число. Поэтому здесь один
 * разбор, и он же читает опоры человека. Две мерки числа разъехались бы молча:
 * «620 000» в тексте и «620 000» в опоре — это одно число ровно до тех пор,
 * пока обе стороны считают его одинаково.
 *
 * Что считается одним числом:
 *
 *  - цифры с разрядным пробелом внутри — обычным, неразрывным или тонким, — но
 *    только когда за ним ровно три цифры: «620 000» одно число, а «более 5 3
 *    набора» — два;
 *  - десятичная часть через точку или запятую: «2,5» одно число. Точка в конце
 *    предложения десятичной не становится, за ней нет цифры;
 *  - процент сразу за числом: «на 20%»;
 *  - простое слово порядка следом: «тысяч», «млн», «млрд».
 *
 * Ключ числа — это цифры без разделителей, запятая приведена к точке, плюс
 * порядок и процент. Поэтому «90» не стоит ни в «1990», ни в «90,5»: у них
 * ключи «1990» и «90.5», а совпадение ищется по целому ключу, а не по подстроке.
 */

/** Разрядный разделитель: обычный, неразрывный, узкий неразрывный, тонкий. */
const GROUP_SPACE = /[\u0020\u00A0\u202F\u2009\u2007]/u;

const isDigit = (char: string | undefined): boolean =>
  char !== undefined && char >= '0' && char <= '9';

/**
 * Слова порядка, которые пишут рядом с числом. Список короткий намеренно:
 * «простое слово порядка» — это «тысяч», «млн», «млрд» и их родня, а не всякое
 * существительное после числа.
 */
const SCALE_WORDS: ReadonlyArray<{ pattern: RegExp; key: string }> = [
  { pattern: /^(?:тыс\.?|тысяч[а-я]*|thousand[s]?|k)(?![\p{L}\p{N}])/iu, key: 'k' },
  {
    pattern: /^(?:млн\.?|миллион[а-я]*|million[s]?)(?![\p{L}\p{N}])/iu,
    key: 'm',
  },
  {
    pattern: /^(?:млрд\.?|миллиард[а-я]*|billion[s]?|bn)(?![\p{L}\p{N}])/iu,
    key: 'g',
  },
  {
    pattern: /^(?:трлн\.?|триллион[а-я]*|trillion[s]?)(?![\p{L}\p{N}])/iu,
    key: 't',
  },
];

export type NumberSpanV1 = {
  /** Первая цифра числа в переданной строке. */
  start: number;
  /** Конец числа со всем, что к нему относится: разряды, доля, процент, порядок. */
  end: number;
  /** Ключ сравнения: цифры без разделителей, доля через точку, порядок, процент. */
  key: string;
};

/**
 * Число, начинающееся в `start`. `null`, если там не цифра.
 *
 * Читается строго вперёд: правило `vague-quantity` кончается ровно на первой
 * цифре числа, и расширять влево нечего.
 */
export const numberAt = (text: string, start: number): NumberSpanV1 | null => {
  if (!isDigit(text[start])) return null;
  let index = start;
  let digits = '';
  while (isDigit(text[index])) {
    digits += text[index];
    index += 1;
  }
  // Разрядные группы: разделитель и ровно три цифры за ним.
  for (;;) {
    const separator = text[index];
    if (!separator || !GROUP_SPACE.test(separator)) break;
    const group = text.slice(index + 1, index + 4);
    if (group.length !== 3 || !/^\d{3}$/u.test(group)) break;
    if (isDigit(text[index + 4])) break;
    digits += group;
    index += 4;
  }
  // Десятичная часть: точка или запятая и цифры за ней.
  let fraction = '';
  if ((text[index] === '.' || text[index] === ',') && isDigit(text[index + 1])) {
    let cursor = index + 1;
    while (isDigit(text[cursor])) {
      fraction += text[cursor];
      cursor += 1;
    }
    index = cursor;
  }
  // Процент — сразу за числом или через один пробел: «20%», «20 %».
  let percent = '';
  const beforePercent = index;
  if (GROUP_SPACE.test(text[index] ?? '')) index += 1;
  if (text[index] === '%') {
    percent = '%';
    index += 1;
  } else {
    index = beforePercent;
  }
  // Слово порядка следом.
  let scale = '';
  if (!percent) {
    const beforeScale = index;
    if (GROUP_SPACE.test(text[index] ?? '')) index += 1;
    const tail = text.slice(index);
    const word = SCALE_WORDS.find((item) => item.pattern.test(tail));
    if (word) {
      scale = word.key;
      index += tail.match(word.pattern)![0].length;
    } else {
      index = beforeScale;
    }
  }
  return {
    start,
    end: index,
    key: `${digits}${fraction ? `.${fraction}` : ''}${scale}${percent}`,
  };
};

/** Начало числа: цифра, перед которой не стоит ни цифра, ни точка с запятой. */
const startsNumber = (text: string, index: number): boolean => {
  if (!isDigit(text[index])) return false;
  const previous = text[index - 1];
  if (previous === undefined) return true;
  return !isDigit(previous) && previous !== '.' && previous !== ',';
};

/* -------------------------------------------------------------------------
 * Что числом-опорой не является
 * ---------------------------------------------------------------------- */

/**
 * Не всякая цифра в материале — количество, на которое человек опирается.
 *
 * `content-factory-next-97dq.10`, разбор корректности второго выпуска, P2-1.
 * Ключ сравнения — это цифры, и без разбора места «20» из «Встреча 20
 * сентября» обосновывало «В продукте более 20 моделей»: дата, время, номер
 * пункта, имя модели и хвост ссылки давали правилу молчание, которого человек
 * не просил. Опасны именно маленькие числа: 1, 4, 10, 20 стоят в каждом
 * втором тексте, — но лечится это местом, а не порогом величины. Порог
 * выбросил бы и настоящие «более 20 моделей» из опоры «20 моделей».
 *
 * Поэтому число не берётся в опоры, когда оно:
 *
 *  - стоит внутри адреса (`https://site.ru/page/100`);
 *  - приклеено к буквам или к имени через дефис (`GPT-4`, `v2`, `cnt-05`);
 *  - открывает строку номером пункта (`1.`, `2)`);
 *  - показывает время (`10:30`) — обе половины;
 *  - записано датой (`18.09`, `18.09.2026`) или стоит перед словом месяца
 *    либо года («20 сентября», «в 1990 году»).
 *
 * Пропущенная опора делает правило разговорчивее, а не тише: человек увидит
 * находку там, где число у него было только в дате. Это ошибка в безопасную
 * сторону — предупреждение можно прочитать и не согласиться, а молчание
 * прочитать нельзя.
 */
const URL_SPAN = /(?:https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}\/)\S*/giu;

/** Слово месяца или года следом: «20 сентября», «в 1990 году». */
const DATE_WORD =
  /^(?:янв(?:\.|ар[а-я]*)?|фев(?:\.|рал[а-я]*)?|мар(?:\.|т[а-я]*)?|апр(?:\.|ел[а-я]*)?|ма[йя][а-я]*|июн[а-я]*|июл[а-я]*|авг(?:\.|уст[а-я]*)?|сен(?:\.|тябр[а-я]*)?|окт(?:\.|ябр[а-я]*)?|ноя(?:\.|бр[а-я]*)?|дек(?:\.|абр[а-я]*)?|год[а-я]*|january|february|march|april|june|july|august|september|october|november|december)(?![\p{L}\p{N}])/iu;

/** Дата цифрами: «18.09», «18.09.2026», «18/09/26». */
const DATE_SHAPE = /^\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?(?![\p{N}])/u;

/** Часы и минуты: «10:30», «10:30:05». */
const CLOCK_AHEAD = /^:\d{2}(?![\p{N}])/u;

const LETTER = /\p{L}/u;
const HYPHEN = /[-‑–—_]/u;

/** Адреса строки: числа внутри них опорой не считаются. */
const urlSpansOf = (text: string): Array<[number, number]> => {
  const spans: Array<[number, number]> = [];
  URL_SPAN.lastIndex = 0;
  for (const match of text.matchAll(URL_SPAN)) {
    const start = match.index ?? 0;
    spans.push([start, start + match[0].length]);
  }
  return spans;
};

/** Номер пункта: число открывает строку и закрыто точкой или скобкой. */
const isListMarker = (text: string, span: NumberSpanV1): boolean => {
  const lineStart = text.lastIndexOf('\n', Math.max(0, span.start - 1)) + 1;
  if (text.slice(lineStart, span.start).trim() !== '') return false;
  const after = text.slice(span.end);
  return /^[.)](?:\s|$)/u.test(after);
};

const isDateOrClock = (text: string, span: NumberSpanV1): boolean => {
  const ahead = text.slice(span.end);
  if (CLOCK_AHEAD.test(ahead)) return true;
  // Вторая половина времени: «:30» в «10:30».
  if (text[span.start - 1] === ':' && isDigit(text[span.start - 2])) return true;
  if (DATE_SHAPE.test(text.slice(span.start))) return true;
  return DATE_WORD.test(ahead.replace(/^[     ]/u, ''));
};

/** Приклеено к буквам или к имени через дефис: `GPT-4`, `v2`, `cnt-05`. */
const isGluedToName = (text: string, span: NumberSpanV1): boolean => {
  const before = text[span.start - 1];
  const beforeThat = text[span.start - 2];
  if (before !== undefined && LETTER.test(before)) return true;
  if (
    before !== undefined &&
    HYPHEN.test(before) &&
    beforeThat !== undefined &&
    (LETTER.test(beforeThat) || isDigit(beforeThat))
  )
    return true;
  const after = text[span.end];
  return after !== undefined && LETTER.test(after);
};

/**
 * Ключи всех чисел строки — то, на чём человек уже стоит.
 *
 * Числа внутри уже разобранного пропускаются: иначе доля «90,5» отдала бы
 * отдельный ключ «5», и опора «90,5» сделала бы обоснованной «около 5».
 */
export const numberKeysOf = (
  texts: string | readonly string[] | null | undefined
): Set<string> => {
  const keys = new Set<string>();
  const list =
    texts === null || texts === undefined
      ? []
      : typeof texts === 'string'
      ? [texts]
      : texts;
  for (const text of list) {
    if (!text) continue;
    const urls = urlSpansOf(text);
    let index = 0;
    while (index < text.length) {
      if (!startsNumber(text, index)) {
        index += 1;
        continue;
      }
      const span = numberAt(text, index);
      if (!span) {
        index += 1;
        continue;
      }
      const inUrl = urls.some(
        ([start, end]) => span.start >= start && span.start < end
      );
      if (
        !inUrl &&
        !isGluedToName(text, span) &&
        !isListMarker(text, span) &&
        !isDateOrClock(text, span)
      ) {
        keys.add(span.key);
      }
      index = Math.max(span.end, index + 1);
    }
  }
  return keys;
};
