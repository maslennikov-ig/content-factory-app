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
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GeneratorBrandProfileSelectionDto } from '@contentfactory/nestjs-libraries/dtos/generator/generator.dto';

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

/** Ключи вопросов интервью — те же девять, что `PieceQuestionKeyV1`. */
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
] as const;

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
  @IsIn(PIECE_QUESTION_KEYS)
  key: (typeof PIECE_QUESTION_KEYS)[number];

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

/** Две настройки адаптации из `IntakeOptionsV1`, которые к ней относятся. */
export class PieceAdaptOptionsDto {
  /** По умолчанию `false`: проверка на ИИ-штампы только по желанию. */
  @IsOptional()
  @IsBoolean()
  slopCheck?: boolean;

  @IsOptional()
  @IsBoolean()
  isPicture?: boolean;
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
  @ArrayMaxSize(PIECE_QUESTION_KEYS.length)
  @Type(() => PieceAnswerDto)
  @ValidateNested({ each: true })
  answers?: PieceAnswerDto[];

  /** Ключи, которые человек отдал модели («Реши сама»). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PIECE_QUESTION_KEYS.length)
  @IsIn(PIECE_QUESTION_KEYS, { each: true })
  decideKeys?: (typeof PIECE_QUESTION_KEYS)[number][];

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
  @ArrayMaxSize(PIECE_BRIEF_FIELDS.length)
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
