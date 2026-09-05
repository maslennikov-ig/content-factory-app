import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ARCHIVE_PLATFORM_VALUES,
  IMPORTABLE_ARCHIVE_LAYERS,
} from '@contentfactory/nestjs-libraries/content-intelligence/materials/archive-presentation';
import { MAX_SEARCH_QUERY_LENGTH } from '@contentfactory/nestjs-libraries/content-intelligence/search-terms';

/**
 * What the material routes accept.
 *
 * The platform list is written out rather than imported as a type, because a
 * validator has to exist at runtime and a type does not. `RECUT_PLATFORMS` in
 * `materials/material-presentation.ts` is the same list read from
 * `PLATFORM_SHAPES`, and `tests/content-material.routes.test.cjs` holds the two
 * against each other.
 */
export const RECUT_PLATFORM_VALUES = [
  'site',
  'telegram',
  'vk',
  'newsletter',
] as const;

export class MaterialRecutDto {
  @IsIn(RECUT_PLATFORM_VALUES)
  platform: (typeof RECUT_PLATFORM_VALUES)[number];
}

export class MaterialDraftDto {
  @IsIn(RECUT_PLATFORM_VALUES)
  platform: (typeof RECUT_PLATFORM_VALUES)[number];

  /**
   * Which channel the draft belongs to. Omitted, the workspace's own channel
   * for that platform is used — and a workspace with none is told so by name
   * rather than handed a draft attached to whatever was first in the list.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  integrationId?: string;
}

/**
 * «Занесение своего прежнего» (`content-factory-next-odb8.4`): a text this
 * workspace already owns, entered by hand rather than written by the
 * factory. Its own door, not the source registry's — the registry exists to
 * turn a fetched page into evidence and a style corpus, with rights, freshness
 * and sync runs behind it; this is a person pasting a text that is already
 * theirs, with none of that machinery earned or needed.
 *
 * `title` and `body` share `MaterialDraftDto`'s absence of a hard content
 * shape: the factory's own pieces are not schema-checked prose either, and a
 * pasted article should not be held to a stricter bar than a generated one.
 */
export class ImportArchiveMaterialDto {
  @IsIn(IMPORTABLE_ARCHIVE_LAYERS)
  origin: (typeof IMPORTABLE_ARCHIVE_LAYERS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200000)
  body: string;

  @IsIn(['ru', 'en'])
  language: 'ru' | 'en';

  /** Where it first ran. Optional: a person may not know or the text may predate any platform at all. */
  @IsOptional()
  @IsIn(ARCHIVE_PLATFORM_VALUES)
  platform?: (typeof ARCHIVE_PLATFORM_VALUES)[number];

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  publishedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * Отбор и поиск на `GET /content-intelligence/materials`
 * (`content-factory-next-odb8.4`).
 *
 * Слой, площадка, даты и страницы намеренно остаются свободными строками без
 * `@IsIn`: маршрут с самого начала читает нераспознанное значение как «фильтра
 * нет», а не отказывает — старая закладка или подправленный вручную адрес
 * должны показать архив целиком, а не 400 про значение, которого человек не
 * видел. Проверяется здесь одно `q`, и проверяется по-настоящему: это
 * единственный параметр, который уходит в базу как текст.
 */
export class ArchiveListQueryDto {
  @IsOptional()
  @IsString()
  layer?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  /**
   * Поиск по словам. Потолок — та же константа, по которой поиск режет
   * запрос, чтобы граница была одна и не разъехалась на два числа
   * (`content-intelligence/search-terms.ts`).
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_QUERY_LENGTH)
  q?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
