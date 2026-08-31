import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class BrandProfileSelectionDto {
  @IsIn(['active', 'version', 'none'])
  mode: 'active' | 'version' | 'none';

  @ValidateIf((value) => value.mode === 'version')
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  versionId?: string;
}

export class BuildContentContextDto {
  @IsIn(['GENERATOR', 'EDITOR', 'AGENT', 'AUTOPOST'])
  consumer: 'GENERATOR' | 'EDITOR' | 'AGENT' | 'AUTOPOST';

  @IsIn(['DRAFT_CREATE', 'DRAFT_EDIT', 'DRAFT_ASSIST'])
  purpose: 'DRAFT_CREATE' | 'DRAFT_EDIT' | 'DRAFT_ASSIST';

  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  query: string;

  @IsIn(['ru', 'en'])
  language: 'ru' | 'en';

  @IsIn(['REQUIRE_CURRENT', 'PREFER_FRESH', 'HISTORICAL'])
  freshnessMode: 'REQUIRE_CURRENT' | 'PREFER_FRESH' | 'HISTORICAL';

  @ValidateNested()
  @Type(() => BrandProfileSelectionDto)
  brandProfileSelection: BrandProfileSelectionDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  provider?: string;

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

export class CreateContentFactDto {
  @IsString()
  @Matches(/^[\p{L}\p{N}_.:-]+\|[\p{L}\p{N}_.:-]+$/u)
  @MaxLength(240)
  claimKey: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  statement: string;

  @IsIn(['ru', 'en'])
  language: 'ru' | 'en';

  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  valueText: string;

  @IsIn(['CURRENT', 'DATED', 'TIMELESS'])
  temporalKind: 'CURRENT' | 'DATED' | 'TIMELESS';

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsDateString()
  freshUntil?: string;
}

export class LinkContentFactEvidenceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  evidenceId: string;

  @IsIn(['SUPPORTS', 'CONTRADICTS'])
  stance: 'SUPPORTS' | 'CONTRADICTS';
}

export class ReviewContentFactEvidenceDto {
  @IsIn(['ACCEPTED', 'REJECTED'])
  reviewStatus: 'ACCEPTED' | 'REJECTED';
}

export class AssessContentEvidenceDto {
  @IsIn(['OWNER_VERIFIED', 'OFFICIAL', 'CURATED', 'UNRATED', 'BLOCKED'])
  trustTier: 'OWNER_VERIFIED' | 'OFFICIAL' | 'CURATED' | 'UNRATED' | 'BLOCKED';

  @IsIn(['PROPOSED', 'ACCEPTED', 'REJECTED'])
  status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  note?: string;
}
