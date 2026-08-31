import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  BrandProfileContentV1,
  BrandProfileSelectionV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';

export class CreateBrandProfileDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsObject()
  content!: BrandProfileContentV1;
}

export class UpdateBrandProfileDraftDto extends CreateBrandProfileDraftDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class BrandProfileSelectionDto {
  @IsIn(['active', 'version', 'none'])
  mode!: BrandProfileSelectionV1['mode'];

  @ValidateIf(
    (selection: BrandProfileSelectionDto) => selection.mode === 'version'
  )
  @IsString()
  @MaxLength(128)
  versionId?: string;
}

export class ResolveBrandProfileContextDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BrandProfileSelectionDto)
  selection?: BrandProfileSelectionDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  provider?: string;
}
