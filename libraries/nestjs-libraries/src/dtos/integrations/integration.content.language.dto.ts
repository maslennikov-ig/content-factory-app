import { IsIn, IsString } from 'class-validator';
import type { ContentLanguage } from '@contentfactory/nestjs-libraries/dtos/content.language';

export class IntegrationContentLanguageDto {
  @IsString()
  @IsIn(['en', 'ru'])
  contentLanguage: ContentLanguage;
}
