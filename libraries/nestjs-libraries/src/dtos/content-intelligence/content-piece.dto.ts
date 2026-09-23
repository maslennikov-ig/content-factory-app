/**
 * Что двери заготовок принимают снаружи.
 *
 * `content-factory-next-tu3k.9.4`, форма — `PiecesQueryV1`,
 * `PieceAdaptRequestV1` и `PieceArchiveRequestV1` из
 * `voice-wiring.contract.ts`. Организации здесь нет и быть не может: она
 * приходит из запроса (`@GetOrgFromRequest`), а тело запроса не решает, чьи
 * заготовки открывать.
 *
 * У каждой двери с телом есть класс отсюда. Это не форма ради формы:
 * 04.09.2026 (`content-factory-next-fn33.90.3`) дверь без DTO приняла пустое
 * тело как «все» и стёрла все посты области стенда. Поэтому же удаление
 * адаптации тела не принимает вовсе — оба идентификатора оно берёт из пути.
 */

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { GeneratorBrandProfileSelectionDto } from '@contentfactory/nestjs-libraries/dtos/generator/generator.dto';
import {
  READY_ADAPTATIONS_DEFAULT_LIMIT,
  READY_ADAPTATIONS_MAX_LIMIT,
} from '@contentfactory/nestjs-libraries/content-intelligence/pieces/ready-adaptations.contract';
import { ADAPTATION_EDIT_BODY_MAX_CHARS } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-workspace.contract';
import {
  INTERVIEW_ASK_KEYS,
  INTERVIEW_QUESTION_MAX_CHARS,
  PIECE_INTERVIEW_MAX_QUESTIONS,
  type InterviewAskKeyV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { ChannelLengthRangeDto } from '@contentfactory/nestjs-libraries/dtos/integrations/integration.writing.profile.dto';

/** «Пожелание» и «что унести» — одна строка, а не второй бриф. */
export const PIECE_OVERRIDE_TEXT_MAX = 500;

/** Bounded calendar chooser read; the organization always comes from session. */
export class ReadyAdaptationsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  integrationIds?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(READY_ADAPTATIONS_MAX_LIMIT)
  limit: number = READY_ADAPTATIONS_DEFAULT_LIMIT;
}

/**
 * Виды адаптации — те же шесть, что `AdaptationKindV1`.
 *
 * Список написан здесь заново, потому что тип из контракта в проверяющий не
 * попадает: `IsIn` нужна строка во время выполнения. Что оба списка совпадают,
 * стережёт `tests/content-piece.routes.test.cjs` — сравнением с
 * `KINDS_BY_PROVIDER` и `ADAPTATION_KINDS_LATER`.
 */
export const PIECE_ADAPTATION_KINDS = [
  'post',
  'caption',
  'article',
  'newsletter',
  'video',
  'audio',
] as const;

/**
 * Поля брифа — те же пять, что `BriefField`.
 *
 * Список написан здесь заново по той же причине, что и виды адаптации: тип из
 * ворот брифа в проверяющий не попадает, `IsIn` нужна строка во время
 * выполнения. Что оба списка совпадают, стережёт
 * `tests/content-piece.routes.test.cjs`.
 */
export const PIECE_BRIEF_FIELDS = [
  'thesis',
  'facts',
  'position',
  'disagreement',
  'audience',
] as const;

/** Ключи вопросов интервью — те же десять, что `PieceQuestionKeyV1`. */
export const PIECE_QUESTION_KEYS = [
  'key_idea',
  'personal_detail',
  'position',
  'hook',
  'cta',
  'format',
  'own_number',
  'screenshot',
  'log',
  'takeaway',
] as const;

/**
 * Ключи, которые дверь адаптации принимает: шаблонные и вопросы модели
 * (`content-factory-next-97dq.44`, `ask-1` … `ask-8`). Список вопросов модели
 * берётся из контракта, а не пишется здесь второй раз.
 */
export const PIECE_ANSWER_KEYS: readonly string[] = [
  ...PIECE_QUESTION_KEYS,
  ...INTERVIEW_ASK_KEYS,
];

/** Состояния фильтра списка — те же четыре, что `AdaptationStateV1`. */
export const PIECE_FILTER_STATES = [
  'published',
  'queued',
  'error',
  'draft',
] as const;

/**
 * `?includeArchived=true` приходит строкой, а контракт объявляет булево.
 *
 * Разбор стоит здесь, а не в маршруте: ошибиться в нём можно один раз, и это
 * место — то самое, где сказано, что значит «да».
 */
const asBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1' ? true
  : value === false || value === 'false' || value === '0' ? false
  : value;

export class PiecesQueryDto {
  /** Слова человека: заголовок, суть, бриф. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  /** «Ещё нет в…»: `providerIdentifier` площадки без адаптации. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  missingOn?: string;

  @IsOptional()
  @IsIn(PIECE_FILTER_STATES)
  state?: (typeof PIECE_FILTER_STATES)[number];

  @IsOptional()
  @Transform(asBoolean)
  @IsBoolean()
  includeArchived?: boolean;
}

/**
 * Ответ человека на вопрос под канал.
 *
 * `origin` принимает два значения из трёх: `person` — написал сам,
 * `confirmed` — нажал «Так и есть». Третье, `model`, дверь не принимает
 * никогда: «Реши сама» — это `decideKeys`, и позволить клиенту прислать чужие
 * слова как ответ человека значило бы дать модели цитировать саму себя от
 * имени автора.
 */
export class PieceAnswerDto {
  @IsIn(PIECE_ANSWER_KEYS)
  key: (typeof PIECE_QUESTION_KEYS)[number] | InterviewAskKeyV1;

  /**
   * Текст вопроса модели, на который это ответ (`97dq.44`): круг адаптации
   * сервер не помнит, а ответ без вопроса — это «ask-2: да».
   */
  @IsOptional()
  @IsString()
  @MaxLength(INTERVIEW_QUESTION_MAX_CHARS)
  question?: string;

  /**
   * Дословно, без нижней границы: короткий ответ — это ответ, а не ошибка
   * ввода.
   */
  @IsString()
  @MaxLength(2_000)
  text: string;

  @IsIn(['person', 'confirmed'])
  origin: 'person' | 'confirmed';
}

/**
 * Настройка адаптации из `IntakeOptionsV1`, которая к ней относится.
 *
 * Проверки на ИИ-штампы здесь нет с 07.09.2026
 * (`content-factory-next-k879.1`): она считается сама на каждой адаптации.
 * Старый клиент, который всё ещё шлёт `slopCheck`, отказа не получает —
 * `whitelist: true` снимает незнакомое поле молча.
 */
export class PieceAdaptOptionsDto {
  @IsOptional()
  @IsBoolean()
  isPicture?: boolean;
}

/**
 * «Для этого поста» (`content-factory-next-97dq.38`), форма —
 * `PieceAdaptOverridesV1`. Сохраняется только в вышедшем варианте.
 */
export class PieceAdaptOverridesDto {
  @IsOptional()
  @IsIn(['shorter', 'channel', 'longer'])
  length?: 'shorter' | 'channel' | 'longer';

  /** Принимается ради старых клиентов и ни на что не влияет (`97dq.45`). */
  @IsOptional()
  @IsIn(['avatar', 'ty', 'vy'])
  addressForm?: 'avatar' | 'ty' | 'vy';

  /** Аватар области; чей он, проверяет сервис (`PIECE_AVATAR_UNKNOWN`). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  brandProfileId?: string;

  /** «Пожелание» — одна строка человека. */
  @IsOptional()
  @IsString()
  @MaxLength(PIECE_OVERRIDE_TEXT_MAX)
  wish?: string;

  /** Что читатели должны унести — ответ на вопрос перед первой адаптацией. */
  @IsOptional()
  @IsString()
  @MaxLength(PIECE_OVERRIDE_TEXT_MAX)
  takeaway?: string;

  /*
    Поля карточки канала на одну адаптацию (`97dq.48`). Значения и форма
    длины — те же, что у двери карточки (`IntegrationWritingProfileDto`):
    дискриминатор и диапазон тем же `ChannelLengthRangeDto`, поэтому «до
    500» поста и «до 500» канала значат одно. `provider_max` сюда не
    входит: предел площадки и так действует всегда.
  */
  @IsOptional()
  @IsIn(['auto', 'range'])
  lengthPolicy?: 'auto' | 'range';

  @ValidateIf((dto: PieceAdaptOverridesDto) => dto.lengthPolicy === 'range')
  @ValidateNested()
  @Type(() => ChannelLengthRangeDto)
  lengthRange?: ChannelLengthRangeDto;

  @IsOptional()
  @IsIn(['none', 'few', 'many', 'auto'])
  emojiLevel?: 'none' | 'few' | 'many' | 'auto';

  @IsOptional()
  @IsIn(['none', 'end', 'inline', 'auto'])
  linkPolicy?: 'none' | 'end' | 'inline' | 'auto';

  @IsOptional()
  @IsIn(['none', 'end_1_3', 'free', 'auto'])
  hashtagPolicy?: 'none' | 'end_1_3' | 'free' | 'auto';

  @IsOptional()
  @IsIn(['auto', 'none', 'question', 'comment', 'link', 'subscribe', 'reply'])
  ctaKind?:
    | 'auto'
    | 'none'
    | 'question'
    | 'comment'
    | 'link'
    | 'subscribe'
    | 'reply';
}

export class PieceAdaptDto {
  /**
   * Канал обязателен: адаптация без площадки — это заготовка, которая уже
   * есть. Пустая строка сюда не проходит, и `PIECE_CHANNEL_REQUIRED` остаётся
   * отказом сервиса, а не проверяющего.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  integrationId: string;

  /** По умолчанию — первый вид, который умеет площадка канала. */
  @IsOptional()
  @IsIn(PIECE_ADAPTATION_KINDS)
  kind?: (typeof PIECE_ADAPTATION_KINDS)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PIECE_ANSWER_KEYS.length)
  @Type(() => PieceAnswerDto)
  @ValidateNested({ each: true })
  answers?: PieceAnswerDto[];

  /** Ключи, которые человек отдал модели («Реши сама»). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PIECE_ANSWER_KEYS.length)
  @IsIn(PIECE_ANSWER_KEYS, { each: true })
  decideKeys?: Array<(typeof PIECE_QUESTION_KEYS)[number] | InterviewAskKeyV1>;

  /** Пропустить интервью целиком одной кнопкой. */
  @IsOptional()
  @IsBoolean()
  skipInterview?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PieceAdaptOptionsDto)
  options?: PieceAdaptOptionsDto;

  /**
   * Тем же вложенным классом, что и у генератора и у входа: выбор аватара —
   * одно решение продукта, и второе его описание разошлось бы с первым.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => GeneratorBrandProfileSelectionDto)
  brandProfileSelection?: GeneratorBrandProfileSelectionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PieceAdaptOverridesDto)
  overrides?: PieceAdaptOverridesDto;
}

/** Картинка поста — одна, из медиатеки области; путь сервер берёт сам. */
export class PieceAdaptationImageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id: string;
}

/**
 * Ручная правка черновика (`97dq.37`), форма —
 * `PieceAdaptationEditRequestV1`. Пустое тело — отказ сервиса
 * `ADAPTATION_EDIT_EMPTY`, а не «ничего не менять молча».
 */
export class PieceAdaptationEditDto {
  @IsOptional()
  @IsString()
  @MaxLength(ADAPTATION_EDIT_BODY_MAX_CHARS)
  body?: string;

  /** `null` снимает картинку; отсутствие поля — не трогать. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PieceAdaptationImageDto)
  image?: PieceAdaptationImageDto | null;
}

/** «Поставить на ЧЧ:ММ» (`97dq.57`), форма — `PieceAdaptationPlaceRequestV1`. */
export class PieceAdaptationPlaceDto {
  @IsISO8601({ strict: true })
  date: string;
}

/** Выход в календарь (`97dq.37`), форма — `PieceAdaptationScheduleRequestV1`. */
export class PieceAdaptationScheduleDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  date?: string;

  @IsOptional()
  @IsBoolean()
  now?: boolean;
}

/**
 * Ответ человека на открытый вопрос заготовки.
 *
 * Опознаётся полем брифа, а не ключом вопроса: с волны
 * `content-factory-next-m2eg` вопрос ворот и вопрос интервью — это один
 * вопрос про одно поле, и второе имя для него было бы вторым способом
 * спросить то же самое.
 */
export class PieceFieldAnswerDto {
  @IsIn(PIECE_BRIEF_FIELDS)
  field: (typeof PIECE_BRIEF_FIELDS)[number];

  /**
   * Ключ вопроса о материале (`97dq.44`): таких вопросов на поле `facts`
   * может быть несколько, и поле их не различает.
   */
  @IsOptional()
  @IsIn(INTERVIEW_ASK_KEYS)
  key?: InterviewAskKeyV1;

  /**
   * Дословно, без нижней границы: короткий ответ — это ответ, а не ошибка
   * ввода. Пустой отбрасывает сервис — «не знаю» говорится кнопкой «Реши
   * сама», а не пустым полем.
   */
  @IsString()
  @MaxLength(2_000)
  text: string;
}

export class PieceAnswerDoorDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PIECE_BRIEF_FIELDS.length + PIECE_INTERVIEW_MAX_QUESTIONS)
  @Type(() => PieceFieldAnswerDto)
  @ValidateNested({ each: true })
  answers?: PieceFieldAnswerDto[];

  /** Поля, которые человек отдал модели («Реши сама»): о них не спрашивают. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PIECE_BRIEF_FIELDS.length)
  @IsIn(PIECE_BRIEF_FIELDS, { each: true })
  decide?: (typeof PIECE_BRIEF_FIELDS)[number][];
}

export class PieceArchiveDto {
  /**
   * Одно поле и без значения по умолчанию: дверь и убирает из списка, и
   * возвращает обратно, и «пустое тело значит убрать» — ровно та ошибка,
   * которой эта волна не повторяет.
   */
  @IsBoolean()
  archived: boolean;
}

export class PieceTitleDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;
}

export class PieceFactSelectionDto {
  @ValidateIf((body: PieceFactSelectionDto) => !body.factKey)
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  statement?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  factKey?: string;

  @IsBoolean()
  selected: boolean;
}
