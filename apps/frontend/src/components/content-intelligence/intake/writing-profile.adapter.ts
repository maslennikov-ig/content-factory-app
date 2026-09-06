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

import {
  CHANNEL_WRITING_PROFILE_VERSION,
  type ChannelLengthPolicyV1,
  type ChannelWritingProfileResponseV1,
  type ChannelWritingProfileV1,
  type IntakeFormatV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { INTAKE_API } from './intake.adapter';

export type {
  ChannelLengthPolicyV1,
  ChannelWritingProfileResponseV1,
  ChannelWritingProfileV1,
};

export const writingProfileUrl = (integrationId: string) =>
  INTAKE_API.writingProfile(integrationId);

export const PROFILE_NOTES_MAX = 500;

export type LengthPreset = 'short' | 'ideal' | 'long' | 'max';

export const LENGTH_PRESETS: Record<
  LengthPreset,
  { idealMin: number; idealMax: number; hardMax: number }
> = {
  short: { idealMin: 200, idealMax: 500, hardMax: 500 },
  // Умолчание Telegram: 500–1000 знаков, потолок 1500.
  ideal: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
  long: { idealMin: 800, idealMax: 1500, hardMax: 1500 },
  max: { idealMin: 1200, idealMax: 2500, hardMax: 2500 },
};

export const LENGTH_PRESET_ORDER: readonly LengthPreset[] = [
  'short',
  'ideal',
  'long',
  'max',
];

/** Тройку чисел — в одно понятное слово, ближайшее по идеальному максимуму. */
export function lengthPresetOf(policy: ChannelLengthPolicyV1): LengthPreset {
  if (policy === 'provider_max') return 'max';
  let best: LengthPreset = 'ideal';
  let distance = Number.POSITIVE_INFINITY;
  for (const preset of LENGTH_PRESET_ORDER) {
    const candidate = Math.abs(LENGTH_PRESETS[preset].idealMax - policy.idealMax);
    if (candidate < distance) {
      distance = candidate;
      best = preset;
    }
  }
  return best;
}

export const EMOJI_LEVELS = ['none', 'few', 'free'] as const;
export const LINK_POLICIES = ['none', 'end', 'inline'] as const;
export const HASHTAG_POLICIES = ['none', 'end_1_3', 'free'] as const;
export const CTA_KINDS = [
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
  const lengthRecord = asRecord(length);
  return {
    version: CHANNEL_WRITING_PROFILE_VERSION,
    lengthPolicy:
      length === 'provider_max'
        ? 'provider_max'
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
    emojiLevel: oneOf(record.emojiLevel, EMOJI_LEVELS, 'few'),
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

export function buildWritingProfilePayload(
  profile: ChannelWritingProfileV1
): ChannelWritingProfileV1 {
  return {
    ...profile,
    version: CHANNEL_WRITING_PROFILE_VERSION,
    notes: profile.notes?.trim()
      ? profile.notes.trim().slice(0, PROFILE_NOTES_MAX)
      : null,
  };
}
