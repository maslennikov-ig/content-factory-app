import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { Provider } from '@prisma/client';
import { STARTER_TEMPLATES } from './starter-template';
import type { StarterTemplate } from './starter-template';

export {
  CONTENT_WORKFLOW_TAGS,
  isStarterTemplate,
  STARTER_TEMPLATES,
} from './starter-template';
export type { StarterTemplate } from './starter-template';

const localPasswordLength = ValidateBy({
  name: 'localPasswordLength',
  validator: {
    validate(value, { object }) {
      const registration = object as Pick<CreateOrgUserDto, 'provider'>;
      return (
        registration.provider !== Provider.LOCAL ||
        (typeof value === 'string' && value.length >= 12)
      );
    },
    defaultMessage: () =>
      'password must be longer than or equal to 12 characters',
  },
});

export class CreateOrgUserDto {
  @IsString()
  @MinLength(3)
  @localPasswordLength
  @MaxLength(64)
  @IsDefined()
  @ValidateIf((o) => o.provider === Provider.LOCAL || !o.providerToken)
  password: string;

  @IsString()
  @IsDefined()
  provider: Provider;

  @IsString()
  @IsDefined()
  @ValidateIf((o) => !o.password)
  providerToken: string;

  @IsEmail()
  @IsDefined()
  @ValidateIf((o) => !o.providerToken)
  email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(128)
  @ValidateIf((_object, value) => value !== undefined)
  company?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(128)
  @ValidateIf((_object, value) => value !== undefined)
  workspaceName?: string;

  @IsString()
  @IsIn(STARTER_TEMPLATES)
  @ValidateIf((_object, value) => value !== undefined)
  starterTemplate?: StarterTemplate;

  @IsBoolean()
  @ValidateIf((_object, value) => value !== undefined)
  subscribeToNewsletter?: boolean;
}
