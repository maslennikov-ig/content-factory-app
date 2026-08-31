import { IsDefined, IsString, Validate } from 'class-validator';
import { ValidUrlExtension } from '@contentfactory/helpers/utils/valid.url.path';
import { IsSafeWebhookUrl } from '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator';

export class UploadDto {
  @IsString()
  @IsDefined()
  @Validate(ValidUrlExtension)
  @IsSafeWebhookUrl({
    message:
      'URL must be a public HTTPS URL and cannot point to internal network addresses',
  })
  url: string;
}
