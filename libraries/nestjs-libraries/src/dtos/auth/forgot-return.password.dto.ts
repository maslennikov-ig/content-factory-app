import {
  IsDefined,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';

export class ForgotReturnPasswordDto {
  /**
   * The same 12..64 window `CreateOrgUserDto` applies to a LOCAL password,
   * unconditionally, because this route can only ever set a LOCAL one: `forgot`
   * refuses to issue a reset link to an account without a password sign-in, and
   * `updatePassword` refuses to write one inside its own transaction. There is
   * no non-LOCAL caller to lock out, and no stored hash is re-checked — the
   * rule applies to the password being chosen, not to the one being replaced.
   */
  @IsString()
  @IsDefined()
  @MinLength(12)
  @MaxLength(64)
  password: string;

  @IsString()
  @IsDefined()
  @IsIn([makeId(10)], {
    message: 'Passwords do not match',
  })
  @ValidateIf((o) => o.password !== o.repeatPassword)
  repeatPassword: string;

  @IsString()
  @IsDefined()
  @MinLength(5)
  token: string;
}
