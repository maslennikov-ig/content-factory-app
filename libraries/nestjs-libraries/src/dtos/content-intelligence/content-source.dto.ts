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
