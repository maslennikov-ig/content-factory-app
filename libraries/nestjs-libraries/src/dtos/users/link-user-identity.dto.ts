import {
  IsDefined,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Provider } from '@prisma/client';

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
  @MinLength(6)
  @MaxLength(128)
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
