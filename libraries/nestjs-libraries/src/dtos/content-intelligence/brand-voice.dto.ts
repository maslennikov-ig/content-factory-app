import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PROFILE_FIELDS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/assist.contract';
import { STYLE_SCALE_KEYS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brand-voice.types';
import {
  MEASURABLE_LOCALES,
  type MeasurableLocale,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/locale-pack';
import { VOICE_SAMPLE_PASTE_LIMITS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * What the voice routes accept, and nothing else.
 *
 * The shapes are the contract's `*RequestV1` types with the rules a wire needs
 * that a type cannot carry: a ceiling on a pasted text, a closed vocabulary
 * for a field key, a real date for a retention deadline. `organizationId` is
 * absent from every class on this page on purpose — it comes from
 * `@GetOrgFromRequest`, and a body that could name a tenant is a body that
 * could name someone else's.
 */

const ORIGINS = [
  'OWN_POST',
  'TELEGRAM_EXPORT',
  'PASTE',
  'FILE',
  'SOURCE_SNAPSHOT',
] as const;

export class VoiceSampleItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(VOICE_SAMPLE_PASTE_LIMITS.maxCharsPerSample)
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  externalRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  postId?: string;
}

export class VoiceSampleIntakeDto {
  @IsIn(ORIGINS as unknown as string[])
  origin: (typeof ORIGINS)[number];

  @IsIn(['OWN_VOICE', 'STYLE_REFERENCE'])
  usagePurpose: 'OWN_VOICE' | 'STYLE_REFERENCE';

  /**
   * The languages a corpus may be uploaded in: the ones a pack exists for.
   *
   * Derived rather than written out, so the day a language gets word lists the
   * routes accept it without anybody remembering to widen this. Refusing a
   * corpus the product cannot measure is the honest half of the same decision
   * that made an unmeasurable scale answer `NO_DICTIONARY`: the alternative is
   * accepting a German corpus and reporting it in Russian words.
   */
  @IsOptional()
  @IsIn(MEASURABLE_LOCALES as unknown as string[])
  language?: MeasurableLocale;

  /**
   * `ArrayMaxSize` bounds how many items a batch may carry; it cannot bound
   * their combined length, because it looks at one property at a time. The
   * sum of `items[].text.length` against
   * `VOICE_SAMPLE_PASTE_LIMITS.maxCharsPerRequest` is checked in
   * `VoiceService.intake`, not here, for the same reason `retentionUntil`
   * below is: a `class-validator` failure is a shapeless 400, and this
   * refusal is a product rule with a code the screen shows.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(VOICE_SAMPLE_PASTE_LIMITS.maxSamplesPerRequest)
  @ValidateNested({ each: true })
  @Type(() => VoiceSampleItemDto)
  items: VoiceSampleItemDto[];

  /**
   * Mandatory for a reference in the service, not here: the refusal is a
   * product rule with a code the screen shows, and a validation error would
   * arrive as a shapeless 400.
   */
  @IsOptional()
  @IsISO8601()
  retentionUntil?: string;

  @IsOptional()
  @IsBoolean()
  rightsConfirmed?: boolean;
}

/**
 * The fields beside the files, which arrive as multipart text.
 *
 * Every value in a multipart body is a string, so `rightsConfirmed` lands here
 * as `'true'` and `@IsBoolean()` alone would refuse it with a shapeless 400 —
 * the wizard has nothing to branch on in one of those and shows «неизвестная
 * ошибка» over a checkbox that was ticked. The transform is what makes the
 * refusal a product rule again instead of a validation accident.
 *
 * `origin` is absent on purpose: a file's origin is `FILE`, the server knows
 * that, and a body that could say otherwise is a body that could file a
 * `.docx` under «мои опубликованные посты».
 */
export class VoiceSampleFileIntakeDto {
  @IsIn(['OWN_VOICE', 'STYLE_REFERENCE'])
  usagePurpose: 'OWN_VOICE' | 'STYLE_REFERENCE';

  /**
   * The languages a corpus may be uploaded in: the ones a pack exists for.
   *
   * Derived rather than written out, so the day a language gets word lists the
   * routes accept it without anybody remembering to widen this. Refusing a
   * corpus the product cannot measure is the honest half of the same decision
   * that made an unmeasurable scale answer `NO_DICTIONARY`: the alternative is
   * accepting a German corpus and reporting it in Russian words.
   */
  @IsOptional()
  @IsIn(MEASURABLE_LOCALES as unknown as string[])
  language?: MeasurableLocale;

  @IsOptional()
  @IsISO8601()
  retentionUntil?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value === 'true' : value
  )
  @IsBoolean()
  rightsConfirmed?: boolean;
}

export class VoiceSampleDeleteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  codes: string[];
}

export class VoiceAnalysisDto {
  /**
   * The languages a corpus may be uploaded in: the ones a pack exists for.
   *
   * Derived rather than written out, so the day a language gets word lists the
   * routes accept it without anybody remembering to widen this. Refusing a
   * corpus the product cannot measure is the honest half of the same decision
   * that made an unmeasurable scale answer `NO_DICTIONARY`: the alternative is
   * accepting a German corpus and reporting it in Russian words.
   */
  @IsOptional()
  @IsIn(MEASURABLE_LOCALES as unknown as string[])
  language?: MeasurableLocale;

  @IsOptional()
  @IsBoolean()
  withAssist?: boolean;
}

export class VoiceProposalFieldDto {
  @IsIn(PROFILE_FIELDS as unknown as string[])
  key: (typeof PROFILE_FIELDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(600)
  text?: string;

  @IsIn(['ACCEPT', 'EDIT', 'SAVE'])
  action: 'ACCEPT' | 'EDIT' | 'SAVE';
}

/**
 * The portrait, with the bounds the model was given rather than a field's.
 *
 * 1200 rather than 600: this is the one place in the voice where prose is the
 * point. The floor is deliberately absent here and present in the model's
 * schema — a person shortening their own portrait to two sentences is editing,
 * while a model returning two sentences has not answered the question.
 */
export class VoiceProposalPortraitDto {
  @IsOptional()
  @IsString()
  @MaxLength(1_200)
  text?: string;

  @IsIn(['ACCEPT', 'EDIT', 'SAVE'])
  action: 'ACCEPT' | 'EDIT' | 'SAVE';
}

/**
 * One hand-written line.
 *
 * `text` is required and non-empty here, unlike the model path's optional one:
 * there is no proposal to accept on this path, so a save with nothing in it is
 * not a decision about a field, it is a field still to fill.
 */
export class VoiceProposalManualFieldDto {
  @IsIn(PROFILE_FIELDS as unknown as string[])
  key: (typeof PROFILE_FIELDS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(600)
  text: string;
}

/**
 * One line of a voice already in force, edited on the card that shows it.
 *
 * The same shape as the manual field and deliberately a separate class: these
 * two writes land on different rows under different rules, and one DTO serving
 * both is how a bound loosened for the draft path quietly loosens for the live
 * one. The bounds match the manual path because the field is the same field.
 */
export class VoicePassportFieldDto {
  @IsIn(PROFILE_FIELDS as unknown as string[])
  key: (typeof PROFILE_FIELDS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(600)
  text: string;
}

export class VoiceProposalActivateDto {
  @IsBoolean()
  consentGiven: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  /** What this avatar is called (`content-factory-next-fn33.46`). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  avatarName?: string;

  /** Which of the two drafts is being activated. Absent means the model's. */
  @IsOptional()
  @IsIn(['assist', 'manual'])
  mode?: 'assist' | 'manual';
}

export class VoiceScaleCorridorDto {
  @IsIn(STYLE_SCALE_KEYS as unknown as string[])
  key: (typeof STYLE_SCALE_KEYS)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000)
  low?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000)
  high?: number;

  @IsOptional()
  @IsBoolean()
  manual?: boolean;

  @IsOptional()
  @IsBoolean()
  excluded?: boolean;
}

/**
 * The author's own posts in the profile: kept, removed, or picked again.
 *
 * `refresh` and an empty list are different requests. Emptying the list is
 * "these are not the ones"; `refresh` is "choose again from my corpus". Telling
 * them apart here rather than in the service keeps a person able to end up with
 * no examples at all if that is what they want.
 */
export class VoiceExamplesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(700, { each: true })
  texts?: string[];

  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}

export class VoiceVersionRestoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  versionId: string;
}

/**
 * The four avatar writes of screen 12.
 *
 * `name` is capped at 120 characters, which is the design's longest drawn case
 * («Пресс-служба объединения „Севмашэнергоремонт", Урал» is 51) with room for
 * a language that spells the same thing longer. An empty string is allowed and
 * means «Без имени» — the repository turns it into `null` rather than storing a
 * name that looks like one until somebody reads it.
 */
export class VoiceAvatarCreateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['PERSON', 'BRAND'])
  kind?: 'PERSON' | 'BRAND';
}

export class VoiceAvatarUpdateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  avatarId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['PERSON', 'BRAND'])
  kind?: 'PERSON' | 'BRAND';
}

export class VoiceAvatarDefaultDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  avatarId: string;
}

export class VoiceAvatarDeleteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  avatarId: string;

  /**
   * Who writes after this one is gone.
   *
   * Optional on the wire and required by the repository exactly when the
   * avatar being deleted is the default and another one could take over. The
   * rule is a fact about the space rather than about the request, so it is not
   * something `class-validator` can see.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  successorId?: string;
}

export class VoiceInjectionPlanDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsIn(['thread-item', 'section', 'continuation'], { each: true })
  boundaries: Array<'thread-item' | 'section' | 'continuation'>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  versionId?: string;
}

export class VoiceTextCheckDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  versionId?: string;
}

/**
 * One sentence to rewrite, and the text it stands in.
 *
 * The whole text travels because the server locates the sentence in it rather
 * than trusting an index: an index would be a promise that both sides split
 * sentences identically, and the day they disagree the wrong sentence is
 * rewritten. Only the sentence and its two neighbours reach the model.
 */
export class VoiceRepairDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  text: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2_000)
  sentence: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  versionId?: string;
}

/** Kept so a future paging request does not invent its own spelling. */
export class VoiceListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  take?: number;
}
