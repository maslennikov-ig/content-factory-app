import {
  CHANNEL_WRITING_PROFILE_VERSION,
  type ChannelLengthPolicyV1,
  type ChannelWritingProfileV1,
  type IntakeFormatV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

export {
  CHANNEL_WRITING_PROFILE_VERSION,
  type ChannelLengthPolicyV1,
  type ChannelWritingProfileV1,
};

/**
 * Как пишут в этот канал — то, что знает продукт, пока человек не сказал сам.
 *
 * `content-factory-next-tu3k.2`, решение владельца 06.09.2026 (пункт 5):
 * карточка «Как пишем сюда» правится редактором и администратором, а в этой
 * волне заполнена только для Telegram. Всё остальное здесь — умолчания, и они
 * нужны ровно потому, что карточки у канала обычно нет: `NULL` в колонке
 * `Integration.writingProfile` означает «человек ничего не решал», и генератор
 * всё равно должен знать, какой длины пост уместен в этом канале.
 *
 * Числа для Telegram взяты из материалов владельца от 20.05.2026 (репозиторий
 * `/home/me/code/content-factory`, `docs/research/channel-playbooks/telegram/raw/`):
 * `compass-artifact-2026-05-telegram-playbook.md` и
 * `deep-research-report-2026-05-telegram-playbook.md`. Оттуда взяты именно
 * числа и границы, не текст: пуш-уведомление показывает первые 80–180 знаков;
 * абзац — 2–4 строки; эмодзи в русском канале 1–3 штуки не больше двух видов, в
 * английском обычно ноль; один главный призыв, а не три; хэштеги либо 1–3 в
 * конце, либо ни одного; из чужого материала нельзя повторять восемь слов
 * подряд. Границы длины по формату — там же, раздел о форматах постов.
 *
 * Лимит знаков площадки сюда не переносится и здесь его нет: его знает сам
 * провайдер (`maxLength`, `maxCaptionLength`), и третьего места, где живёт
 * число 4096, продукт заводить не будет.
 */

/** Слова человека в карточке — столько же, сколько у выученного правила аватара. */
export const CHANNEL_NOTES_LIMIT = 500;

/** Ниже этого «идеальный минимум» перестаёт быть постом. Держит и дверь. */
export const CHANNEL_MIN_IDEAL_LENGTH = 50;

/**
 * Сколько знаков занимает каждый формат в Telegram.
 *
 * Читают это карточка канала и экран входа — чтобы предложить человеку
 * диапазон под выбранный формат. В промпт таблица не идёт: там диапазон один,
 * тот, что человек в карточке оставил, иначе модель получит две длины сразу и
 * выберет третью. `auto` здесь нет намеренно: «формат решает модель» означает,
 * что диапазон берётся из самой карточки.
 */
export const FORMAT_LENGTHS_TELEGRAM: Record<
  Exclude<IntakeFormatV1, 'auto'>,
  { min: number; max: number }
> = {
  opinion: { min: 200, max: 500 },
  announcement: { min: 300, max: 800 },
  list: { min: 1000, max: 2500 },
  expert: { min: 1200, max: 2500 },
  case: { min: 1500, max: 3000 },
  story: { min: 1000, max: 2500 },
};

export const TELEGRAM_PROVIDER_IDENTIFIER = 'telegram';

/**
 * Telegram по умолчанию, в русском варианте.
 *
 * 500–1000 — не середина лимита площадки, а рабочий диапазон из исследования:
 * пост длиннее полутора тысяч знаков в ленте уже листают. `hardMax` — 1500, и
 * это потолок карточки, а не площадки: площадка разрешает 4096, но карточка
 * говорит, чего ждёт читатель канала.
 */
export const TELEGRAM_WRITING_DEFAULTS: ChannelWritingProfileV1 = {
  version: CHANNEL_WRITING_PROFILE_VERSION,
  lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
  emojiLevel: 'few',
  linkPolicy: 'end',
  hashtagPolicy: 'none',
  ctaKind: 'question',
  formatPreference: 'auto',
  notes: null,
  output: 'text',
};

/**
 * Всё остальное: карточка, которая не выдумывает того, чего никто не мерил.
 *
 * Исследование у продукта одно и оно про Telegram. Для VK, LinkedIn или
 * рассылки честный ответ — «длину держит сам провайдер», поэтому
 * `provider_max`, и ни одного числа сверх этого. Хэштеги и призыв оставлены
 * запрещёнными не из осторожности, а чтобы промпт для такого канала звучал
 * ровно как до этой волны: унаследованные строки «Don't add any hashtags» и
 * «Try to put some call to action» уходят, а заменяющие их строки карточки
 * говорят то же самое.
 */
export const GENERIC_WRITING_DEFAULTS: ChannelWritingProfileV1 = {
  version: CHANNEL_WRITING_PROFILE_VERSION,
  lengthPolicy: 'provider_max',
  emojiLevel: 'free',
  linkPolicy: 'inline',
  hashtagPolicy: 'none',
  ctaKind: 'none',
  formatPreference: 'auto',
  notes: null,
  output: 'text',
};

/**
 * Умолчания канала: провайдер решает какие, язык — сколько эмодзи.
 *
 * Язык берётся из `Integration.contentLanguage`, а не из запроса: карточка
 * описывает канал, а канал пишет всегда на одном языке. Английский Telegram в
 * исследовании держит ноль эмодзи, русский — один-три; это единственное, что
 * язык здесь меняет.
 */
export const defaultWritingProfileFor = (
  providerIdentifier: string,
  contentLanguage?: string | null
): ChannelWritingProfileV1 => {
  if (providerIdentifier !== TELEGRAM_PROVIDER_IDENTIFIER) {
    return { ...GENERIC_WRITING_DEFAULTS };
  }
  return {
    ...TELEGRAM_WRITING_DEFAULTS,
    emojiLevel: contentLanguage === 'ru' ? 'few' : 'none',
  };
};

const EMOJI_LEVELS = ['none', 'few', 'free'] as const;
const LINK_POLICIES = ['none', 'end', 'inline'] as const;
const HASHTAG_POLICIES = ['none', 'end_1_3', 'free'] as const;
const CTA_KINDS = [
  'none',
  'question',
  'comment',
  'link',
  'subscribe',
  'reply',
] as const;
const FORMATS = [
  'auto',
  'opinion',
  'announcement',
  'list',
  'expert',
  'case',
  'story',
] as const;

/**
 * Ответ на вопрос о форме текста превращается в значение генератора.
 *
 * В интерфейсе человек видит локализованное слово, а в карточке канала уже
 * хранится каноническое. Одно место разбора не даёт этим двум путям разойтись.
 */
const FORMAT_HINTS: Record<string, IntakeFormatV1> = {
  opinion: 'opinion',
  'мнение': 'opinion',
  announcement: 'announcement',
  'анонс': 'announcement',
  'объявление': 'announcement',
  list: 'list',
  'список': 'list',
  expert: 'expert',
  'разбор': 'expert',
  case: 'case',
  'случай': 'case',
  'кейс': 'case',
  story: 'story',
  'история': 'story',
};

export const channelFormatHint = (value: unknown): IntakeFormatV1 | null => {
  if (typeof value !== 'string') return null;
  return FORMAT_HINTS[value.trim().toLocaleLowerCase()] ?? null;
};

const oneOf = <T extends string>(
  allowed: readonly T[],
  value: unknown,
  fallback: T
): T => (allowed.includes(value as T) ? (value as T) : fallback);

const positiveInteger = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
};

/**
 * Разбор карточки из JSON-колонки — по образцу `parseRoleModels`.
 *
 * Колонка хранит то, что в неё записали: строку более старой сборки, строку
 * более новой, чью-то правку руками. Непригодное поле здесь отбрасывается, а не
 * чинится, и на его место встаёт умолчание провайдера — потому что умолчание
 * всегда рабочий ответ, а «починенное» значение молча меняет то, чего человек
 * не просил, и обнаруживается уже в тексте поста.
 *
 * `null` в колонке и мусор в колонке дают один и тот же результат — умолчания.
 * Различает их только `resolveChannelWritingProfile` ниже, потому что экрану
 * нужно знать, показывать ли карточку сохранённой.
 */
export const parseWritingProfile = (
  raw: unknown,
  providerIdentifier: string,
  contentLanguage?: string | null
): ChannelWritingProfileV1 => {
  const defaults = defaultWritingProfileFor(providerIdentifier, contentLanguage);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const stored = raw as Record<string, unknown>;

  return {
    version: CHANNEL_WRITING_PROFILE_VERSION,
    lengthPolicy: parseLengthPolicy(stored.lengthPolicy, defaults.lengthPolicy),
    emojiLevel: oneOf(EMOJI_LEVELS, stored.emojiLevel, defaults.emojiLevel),
    linkPolicy: oneOf(LINK_POLICIES, stored.linkPolicy, defaults.linkPolicy),
    hashtagPolicy: oneOf(
      HASHTAG_POLICIES,
      stored.hashtagPolicy,
      defaults.hashtagPolicy
    ),
    ctaKind: oneOf(CTA_KINDS, stored.ctaKind, defaults.ctaKind),
    formatPreference: oneOf(
      FORMATS,
      stored.formatPreference,
      defaults.formatPreference
    ),
    notes: parseNotes(stored.notes),
    output: 'text',
  };
};

const parseLengthPolicy = (
  value: unknown,
  fallback: ChannelLengthPolicyV1
): ChannelLengthPolicyV1 => {
  if (value === 'provider_max') return 'provider_max';
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }
  const stored = value as Record<string, unknown>;
  const idealMin = positiveInteger(stored.idealMin);
  const idealMax = positiveInteger(stored.idealMax);
  // Пара, а не два поля: диапазон с одной границей — не диапазон, а полчисла,
  // и промпт из него собрать нечего.
  if (!idealMin || !idealMax || idealMin > idealMax) return fallback;
  const hardMax = positiveInteger(stored.hardMax);
  return {
    idealMin,
    idealMax,
    // Потолок ниже идеального верха противоречит сам себе; такой отбрасывается
    // целиком, а диапазон остаётся.
    hardMax: hardMax && hardMax >= idealMax ? hardMax : null,
  };
};

const parseNotes = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.length <= CHANNEL_NOTES_LIMIT
    ? text
    : `${text.slice(0, CHANNEL_NOTES_LIMIT).trimEnd()}…`;
};

/**
 * Карточка и честный ответ, сохранял ли её кто-нибудь.
 *
 * Экрану эти два факта нужны врозь: умолчания показываются как предложение
 * продукта, а сохранённая карточка — как решение человека, и кнопка «Вернуть
 * умолчания» имеет смысл только во втором случае.
 */
export const resolveChannelWritingProfile = (
  raw: unknown,
  providerIdentifier: string,
  contentLanguage?: string | null
): { profile: ChannelWritingProfileV1; stored: boolean } => ({
  profile: parseWritingProfile(raw, providerIdentifier, contentLanguage),
  stored: isStoredWritingProfile(raw),
});

/**
 * Сохранял ли карточку человек — один ответ на два вопроса.
 *
 * Спрашивают в двух местах: дверь карточки отдаёт `stored`, а список каналов —
 * `writingProfileStored` для значка на экране входа. Пустая колонка, `null`,
 * строка и массив — это «нет карточки»; второе написание этой проверки
 * разошлось бы с первым при первом же изменении.
 */
export const isStoredWritingProfile = (raw: unknown): boolean =>
  Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
