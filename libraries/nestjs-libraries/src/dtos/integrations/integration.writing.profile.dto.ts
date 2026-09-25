import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CHANNEL_MIN_IDEAL_LENGTH,
  CHANNEL_NOTES_LIMIT,
} from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile';
import {
  CHANNEL_ADDRESS_FORMS,
  type ChannelAddressFormV2,
} from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile.v2.contract';
import {
  EMOJI_LEVEL_VALUES,
  type StoredEmojiLevel,
} from '@contentfactory/nestjs-libraries/content-intelligence/channels/emoji-ceiling';

/**
 * Карточка канала «Как пишем сюда», как она приходит с двери.
 *
 * `content-factory-next-tu3k.2`. Значения перечислений повторены списками, а не
 * выведены из `ChannelWritingProfileV1`: `class-validator` работает во время
 * выполнения, а тип до него не доживает.
 *
 * Длина названа двумя полями, а не союзом «строка или объект», как в контракте
 * ответа. Причина не в красоте: приложение включает `whitelist: true` и
 * `transform: true`, а `@Type(() => …)` на поле, которому законно прийти
 * строкой, превратит эту строку в пустой объект ещё до проверки — то есть
 * «длину держит площадка» молча станет «диапазон без границ». Дискриминатор
 * снимает эту ветку целиком. Ответ двери остаётся контрактным, а перевод одной
 * формы в другую делает сервис.
 */
export class ChannelLengthRangeDto {
  @IsInt()
  @Min(CHANNEL_MIN_IDEAL_LENGTH)
  idealMin: number;

  @IsInt()
  @Min(CHANNEL_MIN_IDEAL_LENGTH)
  idealMax: number;

  /** Потолок карточки. Против потолка площадки его сверяет сервис. */
  @IsOptional()
  @IsInt()
  @Min(CHANNEL_MIN_IDEAL_LENGTH)
  @Max(100_000)
  hardMax?: number;
}

export class IntegrationWritingProfileDto {
  @IsIn(['provider_max', 'range', 'auto'])
  lengthPolicy: 'provider_max' | 'range' | 'auto';

  @ValidateIf((dto: IntegrationWritingProfileDto) => dto.lengthPolicy === 'range')
  @ValidateNested()
  @Type(() => ChannelLengthRangeDto)
  length?: ChannelLengthRangeDto;

  // `free` — старейшее написание «много», читается как `many`; точные
  // потолки `97dq.61` — из `emoji-ceiling.ts`; при чтении они становятся
  // плотностями `97dq.96`.
  @IsIn([...EMOJI_LEVEL_VALUES, 'free'])
  emojiLevel: StoredEmojiLevel | 'free';

  @IsIn(['none', 'end', 'inline', 'auto'])
  linkPolicy: 'none' | 'end' | 'inline' | 'auto';

  @IsIn(['none', 'end_1_3', 'free', 'auto'])
  hashtagPolicy: 'none' | 'end_1_3' | 'free' | 'auto';

  @IsIn(['auto', 'none', 'question', 'comment', 'link', 'subscribe', 'reply'])
  ctaKind: 'auto' | 'none' | 'question' | 'comment' | 'link' | 'subscribe' | 'reply';

  @IsIn(['auto', 'opinion', 'announcement', 'list', 'expert', 'case', 'story'])
  formatPreference:
    | 'auto'
    | 'opinion'
    | 'announcement'
    | 'list'
    | 'expert'
    | 'case'
    | 'story';

  /** Слова человека. Столько же, сколько у выученного правила аватара. */
  @IsOptional()
  @IsString()
  @MaxLength(CHANNEL_NOTES_LIMIT)
  notes?: string;

  /**
   * Аватар канала (`content-factory-next-97dq.38`). Отсутствие поля — оставить
   * записанный, `null` или пустая строка — снять (аватар области по
   * умолчанию). Что аватар принадлежит этой области, проверяет сервис.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  brandProfileId?: string | null;

  /** Обращение в канале. Отсутствие поля — оставить записанное. */
  @IsOptional()
  @IsIn(CHANNEL_ADDRESS_FORMS)
  addressForm?: ChannelAddressFormV2;
}
