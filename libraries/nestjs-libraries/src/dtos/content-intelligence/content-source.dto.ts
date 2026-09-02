import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateContentSourceDto {
  @IsIn(['MANUAL', 'URL', 'RSS'])
  kind: 'MANUAL' | 'URL' | 'RSS';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  @ValidateIf((value) => value.kind === 'URL' || value.kind === 'RSS')
  @IsString()
  @MaxLength(4_096)
  canonicalUrl?: string;

  @ValidateIf((value) => value.kind === 'MANUAL')
  @IsString()
  @MaxLength(2_000_000)
  manualText?: string;
}

export class ConfirmContentSourceRightsDto {
  @IsBoolean()
  confirmed: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  note?: string;
}

export class SyncContentSourceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  runKey?: string;
}

/**
 * `content-factory-next-lh5s`: what a person accepts is one `fact`/`source`
 * pair out of `WebResearchService.research(...)` — the excerpt they read and
 * the URL it came from. Nothing here names a `ContentSource`; that is the
 * point, per the owner's decision on this task.
 */
export class AcceptSearchResultEvidenceDto {
  @IsString()
  @MaxLength(4_096)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8_000)
  excerpt: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  publishedAt?: string;

  @IsIn(['tavily', 'openrouter', 'mixed'])
  provider: 'tavily' | 'openrouter' | 'mixed';
}
