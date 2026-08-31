import { IsString, MaxLength, MinLength } from 'class-validator';

export class WebResearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  subject: string;
}
