import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ProductionAnalyticsDto {
  @Type(() => Number)
  @IsIn([7, 30, 90])
  days = 30;

  @IsOptional()
  @IsString()
  integrationId?: string;
}

/**
 * `GET /analytics/ahead` (`97dq.59`). `integrationIds` — comma-separated, the
 * channels selected in the calendar; none means every live channel.
 * `timeZone` — the reader's IANA zone; an unknown one reads as UTC.
 */
export class PlanAheadDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  integrationIds?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;
}
