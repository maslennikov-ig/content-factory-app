import {
  IsDefined,
  IsIn,
  IsString,
  MinLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import {
  isPasswordPolicyCompliant,
  PASSWORD_POLICY_ERROR_MESSAGE,
} from './password.policy';

const passwordPolicy = ValidateBy({
  name: 'passwordPolicy',
  validator: {
    validate: isPasswordPolicyCompliant,
    defaultMessage: () => PASSWORD_POLICY_ERROR_MESSAGE,
  },
});

export class ForgotReturnPasswordDto {
  /**
   * The same password policy `CreateOrgUserDto` applies to a LOCAL password,
   * unconditionally, because this route can only ever set a LOCAL one: `forgot`
   * refuses to issue a reset link to an account without a password sign-in, and
   * `updatePassword` refuses to write one inside its own transaction. There is
   * no non-LOCAL caller to lock out, and no stored hash is re-checked — the
   * rule applies to the password being chosen, not to the one being replaced.
   */
  @IsString()
  @IsDefined()
  @passwordPolicy
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
