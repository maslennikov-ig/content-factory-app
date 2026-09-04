import { IsDefined, IsString, MaxLength, ValidateBy } from 'class-validator';
import {
  isPasswordPolicyCompliant,
  PASSWORD_POLICY,
  PASSWORD_POLICY_ERROR_MESSAGE,
} from '../auth/password.policy';

const newPasswordPolicy = ValidateBy({
  name: 'newPasswordPolicy',
  validator: {
    validate: isPasswordPolicyCompliant,
    defaultMessage: () => PASSWORD_POLICY_ERROR_MESSAGE,
  },
});

/**
 * Changing a password from inside the product asks for the current one, so the
 * door needs both. Only the new password is measured against the policy: the
 * stored one was written under whatever rule held on the day it was chosen, and
 * refusing it here would lock out exactly the people who most need to replace
 * it. The same reasoning `ForgotReturnPasswordDto` writes down for its own
 * single field.
 *
 * `repeatPassword` is not part of this contract. The form asks twice so a typo
 * cannot be saved, and it compares the two itself; the server has nothing to
 * check that the person did not already tell it once.
 */
export class ChangePasswordDto {
  @IsString()
  @IsDefined()
  // Long enough for any password this product ever wrote, short enough that a
  // megabyte of text never reaches bcrypt.
  @MaxLength(PASSWORD_POLICY.maxLength * 4)
  currentPassword: string;

  @IsString()
  @IsDefined()
  @newPasswordPolicy
  newPassword: string;
}
