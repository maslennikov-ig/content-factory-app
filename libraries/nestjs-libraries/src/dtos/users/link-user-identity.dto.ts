import {
  IsDefined,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { Provider } from '@prisma/client';
import {
  isPasswordPolicyCompliant,
  PASSWORD_POLICY_ERROR_MESSAGE,
} from '../auth/password.policy';

const localPasswordPolicy = ValidateBy({
  name: 'localPasswordPolicy',
  validator: {
    validate: isPasswordPolicyCompliant,
    defaultMessage: () => PASSWORD_POLICY_ERROR_MESSAGE,
  },
});

export class LinkUserIdentityDto {
  @IsEnum(Provider)
  @IsDefined()
  provider: Provider;

  @IsString()
  @IsDefined()
  @ValidateIf((body) => body.provider !== Provider.LOCAL)
  code?: string;

  @IsString()
  @IsOptional()
  redirectUri?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsEmail()
  @MaxLength(320)
  @IsDefined()
  @ValidateIf((body) => body.provider === Provider.LOCAL)
  email?: string;

  @IsString()
  @localPasswordPolicy
  @IsDefined()
  @ValidateIf((body) => body.provider === Provider.LOCAL)
  password?: string;
}

export class ConfirmUserIdentityDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  @IsDefined()
  token: string;
}

export class UnlinkUserIdentityDto {
  @IsEnum(Provider)
  @IsDefined()
  provider: Provider;

  @IsString()
  @IsDefined()
  providerIdentifier: string;
}
