import { IsIn, IsString } from 'class-validator';
import {
  PLAN_MODES,
  type PlanModeV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-plan';

/** Режим плана канала (`content-factory-next-97dq.57`). */
export class IntegrationPlanModeDto {
  @IsString()
  @IsIn(PLAN_MODES as unknown as string[])
  planMode: PlanModeV1;
}
