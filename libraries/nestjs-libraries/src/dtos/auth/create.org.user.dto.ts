import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { Provider } from '@prisma/client';
import {
  isPasswordPolicyCompliant,
  PASSWORD_POLICY_ERROR_MESSAGE,
} from './password.policy';

export { CONTENT_WORKFLOW_TAGS } from './starter-template';

const localPasswordPolicy = ValidateBy({
  name: 'localPasswordPolicy',
  validator: {
    validate(value, { object }) {
      const registration = object as Pick<CreateOrgUserDto, 'provider'>;
      return (
        registration.provider !== Provider.LOCAL ||
        isPasswordPolicyCompliant(value)
      );
    },
    defaultMessage: () => PASSWORD_POLICY_ERROR_MESSAGE,
  },
});

export class CreateOrgUserDto {
  @IsString()
  @localPasswordPolicy
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

  // `starterTemplate` no longer exists as a field: every workspace gets the
  // content-workflow tags now, there is nothing left to choose. A request
  // from a stale client that still sends the old field is not rejected —
  // the global `ValidationPipe`'s `whitelist: true` (apps/backend/src/main.ts)
  // silently strips any property this DTO does not declare, so an
  // unrecognised `starterTemplate` is dropped before it reaches the service
  // layer rather than turning a registration into a 400.

  /**
   * `content-factory-next-fn33.18`: the invitation this registration answers.
   *
   * Only the shape is checked here. Whether the token is signed by this
   * instance, still inside its two days and still unspent is decided where
   * the invitation lives, not by a validator: a stale or already-used link is
   * not a bad request, it is an ordinary registration with a note above the
   * form. Refusing it here would turn the most common mistake — an
   * invitation opened twice — into a 400 the form cannot explain.
   */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, {
    message: 'invitationToken is not an invitation',
  })
  @ValidateIf((_object, value) => value !== undefined)
  invitationToken?: string;

  @IsBoolean()
  @ValidateIf((_object, value) => value !== undefined)
  subscribeToNewsletter?: boolean;

  // The interface language the frontend already resolved (cookie/header), not
  // validated against the shipped locale list here: an unrecognised or absent
  // value is not a bad request, it is handled downstream by
  // `resolveBackendLocale`, which falls back to 'en'. Keeping that fallback
  // out of the DTO layer means a locale this deployment hasn't shipped yet
  // never turns a registration into a 400.
  @IsString()
  @ValidateIf((_object, value) => value !== undefined)
  language?: string;
}
