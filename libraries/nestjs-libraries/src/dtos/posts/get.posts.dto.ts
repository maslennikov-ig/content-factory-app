import { transformIntegrationIds } from '@contentfactory/nestjs-libraries/dtos/posts/integration-ids';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsString,
  IsDateString,
  IsIn,
} from 'class-validator';

// Kept in sync by hand with `EditorialStage` in `schema.prisma` — see that
// enum's comment for why there are exactly four values and why they must not
// drift from `CONTENT_WORKFLOW_TAG_KEYS`.
export const EDITORIAL_STAGE_VALUES = [
  'PLAN',
  'DRAFT',
  'REVIEW',
  'SCHEDULED',
] as const;

export class GetPostsDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  customer: string;

  @IsOptional()
  @IsString()
  integrationId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Transform(transformIntegrationIds)
  integrationIds?: string[];

  // Editorial process stage, NOT the post's delivery `state`. Optional: most
  // callers still filter only by date/customer, and unfiltered means "every
  // stage, including posts that have none recorded yet".
  @IsOptional()
  @IsIn(EDITORIAL_STAGE_VALUES)
  editorialStage?: (typeof EDITORIAL_STAGE_VALUES)[number];
}
