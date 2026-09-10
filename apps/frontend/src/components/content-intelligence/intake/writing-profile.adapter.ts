/**
 * Карточка канала «Как пишем сюда» — со стороны экрана.
 *
 * `content-factory-next-tu3k.4`. Дверь и умолчания принадлежат серверу (поток
 * «канал и граф»), здесь только чтение ответа, сборка тела `PUT` и одно
 * решение интерфейса: длина канала выбирается не тремя числами, а одним из
 * четырёх готовых значений.
 *
 * Почему готовыми: `ChannelLengthPolicyV1` — это `{idealMin, idealMax,
 * hardMax}`, и человек, ведущий канал, не знает, чем «идеальный максимум»
 * отличается от «жёсткого». Он знает «покороче» и «подлиннее». Числа за
 * пресетами взяты из исследования по Telegram, на которое опирается вся
 * волна; произвольная тройка при этом не ломается — карточка, пришедшая с
 * сервера с другими числами, читается ближайшим пресетом и не переписывается,
 * пока человек сам не выберет другой.
 */

import { type IntakeFormatV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { CHANNEL_WRITING_PROFILE_VERSION, type ChannelLengthPolicyV2 as ChannelLengthPolicyV1, type ChannelWritingProfileResponseV2 as ChannelWritingProfileResponseV1, type ChannelWritingProfileV2 as ChannelWritingProfileV1 } from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile.v2.contract';
import { INTAKE_API } from './intake.adapter';

export type {
  ChannelLengthPolicyV1,
  ChannelWritingProfileResponseV1,
  ChannelWritingProfileV1,
};

export const writingProfileUrl = (integrationId: string) =>
  INTAKE_API.writingProfile(integrationId);

export const PROFILE_NOTES_MAX = 500;

export type LengthPreset = 'auto' | 'short' | 'ideal' | 'long' | 'max';

export const LENGTH_PRESETS: Record<
  Exclude<LengthPreset, 'auto'>,
  { idealMin: number; idealMax: number; hardMax: number }
> = {
  short: { idealMin: 200, idealMax: 500, hardMax: 500 },
  // Умолчание Telegram: 500–1000 знаков, потолок 1500.
  ideal: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
  long: { idealMin: 800, idealMax: 1500, hardMax: 1500 },
  max: { idealMin: 1200, idealMax: 2500, hardMax: 2500 },
};

export const LENGTH_PRESET_ORDER: readonly LengthPreset[] = [
  'auto',
  'short',
  'ideal',
  'long',
  'max',
];

/** Тройку чисел — в одно понятное слово, ближайшее по идеальному максимуму. */
export function lengthPresetOf(policy: ChannelLengthPolicyV1): LengthPreset {
  if (policy === 'auto') return 'auto';
  if (policy === 'provider_max') return 'auto';
  let best: LengthPreset = 'ideal';
  let distance = Number.POSITIVE_INFINITY;
  for (const preset of LENGTH_PRESET_ORDER) {
    if (preset === 'auto') continue;
    const candidate = Math.abs(LENGTH_PRESETS[preset].idealMax - policy.idealMax);
    if (candidate < distance) {
      distance = candidate;
      best = preset;
    }
  }
  return best;
}

export const EMOJI_LEVELS = ['none', 'few', 'many', 'auto'] as const;
export const LINK_POLICIES = ['none', 'end', 'inline', 'auto'] as const;
export const HASHTAG_POLICIES = ['none', 'end_1_3', 'free', 'auto'] as const;
export const CTA_KINDS = [
  'auto',
  'none',
  'question',
  'comment',
  'link',
  'subscribe',
  'reply',
] as const;
export const FORMAT_PREFERENCES: readonly IntakeFormatV1[] = [
  'auto',
  'opinion',
  'announcement',
  'list',
  'expert',
  'case',
  'story',
];

/**
 * Умолчания, когда сервер ещё не ответил.
 *
 * Не второй источник правды: ответ сервера всегда несёт свои значения и
 * перекрывает эти. Они нужны форме, которая рисуется до ответа и не должна
 * показывать шесть пустых полей.
 */
export const DEFAULT_WRITING_PROFILE: ChannelWritingProfileV1 = {
  version: CHANNEL_WRITING_PROFILE_VERSION,
  lengthPolicy: LENGTH_PRESETS.ideal,
  emojiLevel: 'few',
  linkPolicy: 'end',
  hashtagPolicy: 'none',
  ctaKind: 'question',
  formatPreference: 'auto',
  notes: null,
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T => (allowed.includes(value as T) ? (value as T) : fallback);

export function readWritingProfile(value: unknown): ChannelWritingProfileV1 {
  const record = asRecord(value);
  if (!record) return DEFAULT_WRITING_PROFILE;
  const length = record.lengthPolicy;
  // Дверь отвечает союзом контракта, но то же чтение принимает и форму тела
  // запроса (`lengthPolicy: 'range'` плюс отдельное `length`) — иначе
  // сохранённое и прочитанное расходились бы на одном поле.
  const lengthRecord =
    length === 'range' ? asRecord(record.length) : asRecord(length);
  return {
    version: CHANNEL_WRITING_PROFILE_VERSION,
    lengthPolicy:
      (length === 'provider_max' || length === 'auto')
        ? length
        : lengthRecord && typeof lengthRecord.idealMax === 'number'
        ? {
            idealMin: Number(lengthRecord.idealMin) || 0,
            idealMax: Number(lengthRecord.idealMax),
            hardMax:
              typeof lengthRecord.hardMax === 'number'
                ? lengthRecord.hardMax
                : null,
          }
        : DEFAULT_WRITING_PROFILE.lengthPolicy,
    emojiLevel: oneOf(record.emojiLevel === 'free' ? 'many' : record.emojiLevel, EMOJI_LEVELS, 'few'),
    linkPolicy: oneOf(record.linkPolicy, LINK_POLICIES, 'end'),
    hashtagPolicy: oneOf(record.hashtagPolicy, HASHTAG_POLICIES, 'none'),
    ctaKind: oneOf(record.ctaKind, CTA_KINDS, 'question'),
    formatPreference: oneOf(record.formatPreference, FORMAT_PREFERENCES, 'auto'),
    notes:
      typeof record.notes === 'string'
        ? record.notes.slice(0, PROFILE_NOTES_MAX)
        : null,
  };
}

export function readWritingProfileResponse(
  value: unknown,
  integrationId: string
): ChannelWritingProfileResponseV1 {
  const record = asRecord(value) ?? {};
  const provider = asRecord(record.provider) ?? {};
  return {
    integrationId:
      typeof record.integrationId === 'string'
        ? record.integrationId
        : integrationId,
    providerIdentifier:
      typeof record.providerIdentifier === 'string'
        ? record.providerIdentifier
        : '',
    provider: {
      name: typeof provider.name === 'string' ? provider.name : '',
      maxLength: Number(provider.maxLength) || 0,
      maxCaptionLength:
        typeof provider.maxCaptionLength === 'number'
          ? provider.maxCaptionLength
          : null,
      editor:
        provider.editor === 'normal' ||
        provider.editor === 'markdown' ||
        provider.editor === 'html'
          ? provider.editor
          : 'none',
    },
    profile: readWritingProfile(record.profile),
    // `stored: false` — карточку никто не сохранял, показанные значения
    // пришли из умолчаний провайдера, и подпись обязана это сказать.
    stored: record.stored === true,
  };
}

/**
 * Тело `PUT`, как его ждёт дверь.
 *
 * `content-factory-next-m2eg.12`. Это не тот же объект, что показан в форме, и
 * различие здесь ровно одно: длина. В ответе двери длина — союз «строка или
 * тройка чисел» (`ChannelLengthPolicyV1`), а в теле запроса —
 * `IntegrationWritingProfileDto`: слово `provider_max` либо `range`, и тройка
 * отдельным полем `length`. Причина названа в самом DTO: приложение включает
 * `transform: true`, и `@Type(() => …)` на поле, которому законно прийти
 * строкой, превратил бы «длину держит площадка» в пустой диапазон ещё до
 * проверки.
 *
 * Пока карточка отправляла форму ответа, дверь отвечала `400` на КАЖДОМ
 * сохранении: `lengthPolicy` приезжал объектом, а `@IsIn(['provider_max',
 * 'range'])` объект не принимает.
 */
export type WritingProfileLengthRangePayload = {
  idealMin: number;
  idealMax: number;
  hardMax?: number;
};

export type WritingProfilePayload = {
  lengthPolicy: 'provider_max' | 'range' | 'auto';
  length?: WritingProfileLengthRangePayload;
  emojiLevel: ChannelWritingProfileV1['emojiLevel'];
  linkPolicy: ChannelWritingProfileV1['linkPolicy'];
  hashtagPolicy: ChannelWritingProfileV1['hashtagPolicy'];
  ctaKind: ChannelWritingProfileV1['ctaKind'];
  formatPreference: IntakeFormatV1;
  notes?: string;
};

export function buildWritingProfilePayload(
  profile: ChannelWritingProfileV1
): WritingProfilePayload {
  const notes = (profile.notes ?? '').trim().slice(0, PROFILE_NOTES_MAX);
  // Пустые заметки не отправляются вовсе: у двери поле необязательное, а
  // `notes: null` — это не «нет заметок», это значение, которое @IsString
  // разбирал бы отдельной веткой.
  const common = {
    emojiLevel: profile.emojiLevel,
    linkPolicy: profile.linkPolicy,
    hashtagPolicy: profile.hashtagPolicy,
    ctaKind: profile.ctaKind,
    formatPreference: profile.formatPreference,
    ...(notes ? { notes } : {}),
  };

  if (typeof profile.lengthPolicy === 'string') {
    return { lengthPolicy: profile.lengthPolicy, ...common };
  }

  const { idealMin, idealMax, hardMax } = profile.lengthPolicy;
  return {
    lengthPolicy: 'range',
    length: {
      idealMin,
      idealMax,
      // `hardMax` необязателен, и `null` для него — не значение: потолок
      // карточки либо назван числом, либо не назван.
      ...(typeof hardMax === 'number' ? { hardMax } : {}),
    },
    ...common,
  };
}
