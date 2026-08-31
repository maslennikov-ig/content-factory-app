import { Allow, IsString } from 'class-validator';

export class VideoFunctionDto {
  @IsString()
  identifier: string;

  @IsString()
  functionName: string;

  @Allow()
  params: any;
}
