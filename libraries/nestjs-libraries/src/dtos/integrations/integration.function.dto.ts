import { Allow, IsDefined, IsString } from 'class-validator';

export class IntegrationFunctionDto {
  @IsString()
  @IsDefined()
  name: string;

  @IsString()
  @IsDefined()
  id: string;

  @Allow()
  data: any;
}
