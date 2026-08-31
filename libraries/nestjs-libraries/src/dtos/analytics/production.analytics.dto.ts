import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ProductionAnalyticsDto {
  @Type(() => Number)
  @IsIn([7, 30, 90])
  days = 30;

  @IsOptional()
  @IsString()
  integrationId?: string;
}
