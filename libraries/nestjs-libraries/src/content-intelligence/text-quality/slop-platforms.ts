/**
 * Пороги площадок: сколько вопросов, эмодзи, жирного и списков ей идёт.
 *
 * `content-factory-next-tu3k.3`. Числа для Telegram — из исследования
 * площадки, которое владелец подтвердил своими материалами: короткий пост
 * держит один список на три пункта, не больше двух видов эмодзи и до двух
 * вопросов. Порог риторических вопросов взят из каталога владельца (A32:
 * telegram — больше двух за пост).
 *
 * Неизвестная площадка получает умолчания, а не отказ: проверка на штампы
 * никогда не должна быть причиной, по которой человек не увидел свой текст.
 */

export type SlopThresholdsV1 = {
  /** Предложений, оканчивающихся вопросом. */
  questions: number;
  /** Разных эмодзи (видов, а не штук). */
  emojiKinds: number;
  /** Жирных отрезков: `<b>`, `<strong>`, `**…**`. */
  boldSpans: number;
  /** Списков в посте. */
  lists: number;
  /** Пунктов в самом длинном списке. */
  listItems: number;
};

export type SlopPlatformKey =
  | 'telegram'
  | 'habr'
  | 'vc'
  | 'pikabu'
  | 'tenchat'
  | 'telegram-announcement'
  | 'default';

const KNOWN_PLATFORMS: readonly SlopPlatformKey[] = [
  'telegram',
  'habr',
  'vc',
  'pikabu',
  'tenchat',
  'telegram-announcement',
];

const TELEGRAM: SlopThresholdsV1 = {
  questions: 2,
  emojiKinds: 2,
  boldSpans: 2,
  lists: 1,
  listItems: 3,
};

/**
 * Умолчания. Жирное здесь считается от длины: один отрезок на две сотни слов
 * плюс один — норма из `lint.py` автора, единственный порог, который зависит
 * от размера текста.
 *
 * Ниже двух порог не опускается. У автора эта норма применяется только к
 * текстам от двухсот слов; без нижней границы формула объявляла бы перебором
 * одно-единственное выделение в коротком посте, а это обычный лид.
 */
const defaults = (words: number): SlopThresholdsV1 => ({
  questions: 3,
  emojiKinds: 3,
  boldSpans: Math.max(2, Math.floor(Math.max(0, words) / 200) + 1),
  lists: 2,
  listItems: 6,
});

/** Как называется площадка для порогов. Незнакомая — это `default`. */
export const slopPlatformKey = (platform?: string | null): SlopPlatformKey =>
  KNOWN_PLATFORMS.includes(
    String(platform ?? '')
      .trim()
      .toLowerCase() as SlopPlatformKey
  )
    ? (String(platform).trim().toLowerCase() as SlopPlatformKey)
    : 'default';

const mask = (line: string): string => line.replace(/[^\n]/g, ' ');

/**
 * Removes only structure prescribed by a platform from style metrics.
 * Content rules still inspect the original prose. The replacement keeps
 * length and newlines, so a later finding can still point into the input.
 */
export function maskSlopMetricStructures(
  text: string,
  platform?: string | null
): string {
  const key = slopPlatformKey(platform);
  let lines = text.split(/(?<=\n)/);

  if (['habr', 'vc', 'pikabu', 'tenchat'].includes(key)) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*#{1,6}\s*TL;?DR\s*:?\s*$/iu.test(lines[index].trimEnd())) {
        continue;
      }

      let cursor = index + 1;
      while (cursor < lines.length && /^\s*$/u.test(lines[cursor])) cursor += 1;
      const firstItem = cursor;
      while (
        cursor < lines.length &&
        /^\s*(?:[-+*]|\d+[.)])\s+\*\*[^*\n]+\*\*/u.test(lines[cursor])
      ) {
        cursor += 1;
      }
      const count = cursor - firstItem;
      const anotherItem =
        cursor < lines.length &&
        /^\s*(?:[-+*]|\d+[.)])\s+/u.test(lines[cursor]);

      if (count < 4 || count > 6 || anotherItem) continue;
      for (let row = index; row < cursor; row += 1)
        lines[row] = mask(lines[row]);
      index = cursor - 1;
    }
  }

  if (key === 'pikabu') {
    let anchors = 0;
    lines = lines.map((line) => {
      if (!/^\s*\p{Extended_Pictographic}\s+\S/u.test(line)) return line;
      anchors += 1;
      if (anchors > 6) return line;
      return line.replace(/\p{Extended_Pictographic}/u, ' ');
    });
  }

  return lines.join('');
}

export function slopThresholds(
  platform: string | null | undefined,
  words: number
): SlopThresholdsV1 {
  return slopPlatformKey(platform) === 'telegram' ? TELEGRAM : defaults(words);
}
