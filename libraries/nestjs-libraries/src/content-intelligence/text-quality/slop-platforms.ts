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

export type SlopPlatformKey = 'telegram' | 'default';

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
  String(platform ?? '').trim().toLowerCase() === 'telegram'
    ? 'telegram'
    : 'default';

export function slopThresholds(
  platform: string | null | undefined,
  words: number
): SlopThresholdsV1 {
  return slopPlatformKey(platform) === 'telegram' ? TELEGRAM : defaults(words);
}
