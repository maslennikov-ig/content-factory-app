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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { ContentLanguage } from '@contentfactory/nestjs-libraries/dtos/content.language';

export class GeneratorBrandProfileSelectionDto {
  @IsIn(['active', 'version', 'none'])
  mode: 'active' | 'version' | 'none';

  @ValidateIf((selection) => selection.mode === 'version')
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  versionId?: string;
}

export class GeneratorDto {
  @IsString()
  @MinLength(10)
  research: string;

  @IsBoolean()
  isPicture: boolean;

  @IsString()
  @IsIn(['one_short', 'one_long', 'thread_short', 'thread_long'])
  format: 'one_short' | 'one_long' | 'thread_short' | 'thread_long';

  /**
   * Inherited from upstream, kept for external callers, and no longer the
   * source of the point of view. When a brand profile resolves, its
   * `voice.pointOfView` decides and this is ignored — silently, because the
   * caller that still sends it is a machine and there is nobody to warn.
   */
  @IsOptional()
  @IsString()
  @IsIn(['personal', 'company'])
  tone?: 'personal' | 'company';

  @IsString()
  @IsIn(['en', 'ru'])
  language: ContentLanguage;

  @IsOptional()
  @IsIn(['REQUIRE_CURRENT', 'PREFER_FRESH', 'HISTORICAL'])
  freshnessMode?: 'REQUIRE_CURRENT' | 'PREFER_FRESH' | 'HISTORICAL';

  @IsOptional()
  @ValidateNested()
  @Type(() => GeneratorBrandProfileSelectionDto)
  brandProfileSelection?: GeneratorBrandProfileSelectionDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  sourceIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  factIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  userMaterialEvidenceIds?: string[];
}
