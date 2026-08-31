import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * One fact offered to a brief.
 *
 * Neither field is required here, and that is on purpose: a fact with nothing
 * to check is a legitimate thing to send, because the answer to it is a
 * question a person can act on rather than a validation error they cannot.
 * `sourceUrl` is not validated as a URL for the same reason.
 */
export class BriefFactDto {
  @IsString()
  @MaxLength(2_000)
  statement: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_048)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  factId?: string;
}

export class EvaluateBriefDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  thesis?: string;

  /** The channel in the author's own words, or the id of one. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  format?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @Type(() => BriefFactDto)
  @ValidateNested({ each: true })
  facts?: BriefFactDto[];

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

  /**
   * The language of the questions and of the radar's reasons.
   *
   * Not part of `BriefRequestV1`; the surface has no language field and the
   * answers are sentences a person reads, so it is accepted here and defaults
   * to Russian.
   */
  @IsOptional()
  @IsIn(['ru', 'en'])
  language?: 'ru' | 'en';
}

/** The same brief, submitted for a draft rather than for an opinion. */
export class CreateBriefDraftDto extends EvaluateBriefDto {}
