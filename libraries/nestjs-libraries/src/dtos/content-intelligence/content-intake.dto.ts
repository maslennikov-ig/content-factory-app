/**
 * Что дверь входа одной мыслью принимает снаружи.
 *
 * Neutral intake uses `IntakeRequestV2` from `intake-v2.contract.ts`. Два поля контракта здесь намеренно отсутствуют, и
 * оба — те, которые сервер ставит сам: организация приходит из запроса
 * (`@GetOrgFromRequest`), а подсказки генератору (`intake`) собирает
 * `IntakeService`. Принимать их от клиента значило бы разрешить чужому телу
 * запроса решать, чьей памятью писать.
 *
 * Пределы длин повторяют контракт, а не изобретают свои: `input` ≤ 20 000
 * знаков, ответ на вопрос ≤ 2 000. Канал выбирается только при адаптации.
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GeneratorBrandProfileSelectionDto } from '@contentfactory/nestjs-libraries/dtos/generator/generator.dto';
import {
  INTAKE_INPUT_MAX_CHARS,
  PIECE_MAX_QUESTIONS,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { PieceQuestionKeyV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { BriefField } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';

/**
 * Ключи вопросов интервью — все девять из контракта.
 *
 * Общие ключи входа и двери адаптации. Канал выбирается на странице заготовки.
 */
export const PIECE_QUESTION_KEYS: PieceQuestionKeyV1[] = [
  'key_idea',
  'personal_detail',
  'position',
  'hook',
  'cta',
  'format',
  'own_number',
  'screenshot',
  'log',
];

export class PieceInterviewAnswerDto {
  @IsIn(PIECE_QUESTION_KEYS)
  key: PieceQuestionKeyV1;

  @IsString()
  @MaxLength(2_000)
  text: string;

  /** «Так и есть» — это `confirmed`; свои слова — `person`. */
  @IsOptional()
  @IsIn(['person', 'confirmed'])
  origin?: 'person' | 'confirmed';
}

/** Пять полей ворот брифа — единственные, о которых вход спрашивает. */
export const INTAKE_BRIEF_FIELDS: BriefField[] = [
  'thesis',
  'facts',
  'position',
  'disagreement',
  'audience',
];

/** Форматы материала из контракта. `auto` — «решай сама». */
const INTAKE_FORMATS = [
  'auto',
  'opinion',
  'announcement',
  'list',
  'expert',
  'case',
  'story',
] as const;

export class IntakeAnswerDto {
  @IsIn(INTAKE_BRIEF_FIELDS)
  field: BriefField;

  @IsString()
  @MaxLength(2_000)
  text: string;
}

/**
 * Правки квитанции перед пересборкой.
 *
 * Каждое поле — слово человека, и сервер обязан взять его дословно. Поэтому
 * здесь нет ни одного `MinLength`: короткий ответ — это ответ, а не ошибка
 * ввода, и ворота брифа сами решат, довольно ли его.
 */
export class IntakeBriefOverridesDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  thesis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  disagreement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  audience?: string;

  @IsOptional()
  @IsIn(INTAKE_FORMATS)
  format?: (typeof INTAKE_FORMATS)[number];
}

/**
 * Проверки на ИИ-штампы здесь нет с 07.09.2026 (`content-factory-next-k879.1`):
 * она считается сама. Старый клиент, который всё ещё шлёт `slopCheck`, отказа
 * не получает — `whitelist: true` снимает незнакомое поле молча.
 */
export class IntakeOptionsDto {
  /** По умолчанию `true`: числа и мысль без фактов проверяются поиском. */
  @IsOptional()
  @IsBoolean()
  searchEnrichment?: boolean;

  /** Paid research is opt-in and disabled when omitted. */
  @IsOptional()
  @IsBoolean()
  researchEnabled?: boolean;

  @IsOptional()
  @IsIn(['quick', 'standard', 'deep'])
  researchLevel?: 'quick' | 'standard' | 'deep';

  @IsOptional()
  @IsBoolean()
  isPicture?: boolean;
}

export class IntakeDto {
  /**
   * Мысль, ссылка или чужой пост.
   *
   * Нижней границы здесь нет намеренно: слишком короткий вход — это
   * `INTAKE_INPUT_TOO_SHORT` с человеческим предложением, а не «input must be
   * longer than or equal to 10 characters» из проверяющего.
   */
  @IsString()
  @MaxLength(INTAKE_INPUT_MAX_CHARS)
  input: string;

  /** Клиент распознаёт только ссылку; остальное решает сервер. */
  @IsOptional()
  @IsIn(['thought', 'link', 'foreign_post'])
  inputKind?: 'thought' | 'link' | 'foreign_post';

  @IsIn(['ru', 'en'])
  language: 'ru' | 'en';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @Type(() => IntakeAnswerDto)
  @ValidateNested({ each: true })
  answers?: IntakeAnswerDto[];

  /** Поля, которые человек отдал модели («Реши сама»). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(INTAKE_BRIEF_FIELDS, { each: true })
  decide?: BriefField[];

  @IsOptional()
  @ValidateNested()
  @Type(() => IntakeBriefOverridesDto)
  briefOverrides?: IntakeBriefOverridesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => IntakeOptionsDto)
  options?: IntakeOptionsDto;

  /** Selected statements when continuing a paused paid research intake. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  researchSelections?: string[];

  /**
   * Тем же вложенным классом, что и у генератора: выбор аватара — одно
   * решение продукта, и второе его описание разошлось бы с первым.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => GeneratorBrandProfileSelectionDto)
  brandProfileSelection?: GeneratorBrandProfileSelectionDto;

  /** Повод из «Откуда идеи», если текст пришёл оттуда. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  sourceLeadId?: string;

  /**
   * Ответы интервью заготовки — дословно, вместе с опечатками.
   *
   * `MinLength` здесь нет по той же причине, что и у правок квитанции:
   * короткий ответ — это ответ, а не ошибка ввода.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PIECE_MAX_QUESTIONS)
  @Type(() => PieceInterviewAnswerDto)
  @ValidateNested({ each: true })
  interview?: PieceInterviewAnswerDto[];

  /** Ключи вопросов заготовки, отданные модели («Реши сама»). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PIECE_MAX_QUESTIONS)
  @IsIn(PIECE_QUESTION_KEYS, { each: true })
  decideKeys?: PieceQuestionKeyV1[];

  /** Пропустить интервью целиком одной кнопкой. */
  @IsOptional()
  @IsBoolean()
  skipInterview?: boolean;
}
