import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Bodies of the doors that used to read one field with `@Body('x')`
 * (`content-factory-next-fn33.90.13`).
 *
 * `@Body('id')` skips validation: a missing field reaches the service as
 * `undefined`, and Prisma reads `undefined` in a `where` as «no condition»
 * (`fn33.90.3`). Each door now declares its body, the global pipe validates it,
 * and a missing field is a 400 at the door instead of a widened query. The
 * global pipe runs with `whitelist`, so a client that sends more fields is
 * not refused, the extra fields are dropped.
 */

/** A row the caller names by id. */
export class BodyIdDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  id!: string;
}

/**
 * The account an instance administrator impersonates. An empty id is how the
 * screen stops impersonating, so it is a string, not a non-empty one.
 */
export class ImpersonateBodyDto {
  @IsDefined()
  @IsString()
  id!: string;
}

/** A plug or autopost switched on or off. */
export class StatusBodyDto {
  @IsDefined()
  @IsBoolean()
  status!: boolean;
}

export class ActiveBodyDto {
  @IsDefined()
  @IsBoolean()
  active!: boolean;
}

/** A channel's provider settings, as the JSON text the provider stores. */
export class AdditionalSettingsBodyDto {
  @IsDefined()
  @IsString()
  additionalSettings!: string;
}

/** A JWT signed by the instance secret, from the operator's own systems. */
export class SignedParamsBodyDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  params!: string;
}

/** The invitation token of a workspace the person joins or declines. */
export class InvitationOrgBodyDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  org!: string;
}

/** A third-party integration's API key. */
export class ThirdPartyApiKeyBodyDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  api!: string;
}

/** An activation code from the confirmation letter. */
export class ActivationCodeBodyDto {
  @IsDefined()
  @IsString()
  code!: string;
}

/**
 * What an OAuth provider handed back to the sign-in page. Which of the three a
 * provider sends differs, so each is optional here and the provider checks.
 */
export class OAuthExistsBodyDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @IsOptional()
  @IsString()
  state?: string;
}

/** A prompt for an image. */
export class ImagePromptBodyDto {
  @IsDefined()
  @IsString()
  prompt!: string;
}

/** A file already in storage, saved into the media library. */
export class SaveMediaBodyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  originalName?: string;
}

/** A multipart upload's one text field: `'true'` keeps it out of the library. */
export class UploadSimpleBodyDto {
  @IsOptional()
  @IsString()
  preventSave?: string;
}

/** The id the channel gave a post published outside the product. */
export class ReleaseIdBodyDto {
  @IsDefined()
  @IsString()
  releaseId!: string;
}

/** A calendar move: the new date, and whether it re-queues the post. */
export class ChangeDateBodyDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  date!: string;

  @IsOptional()
  @IsIn(['schedule', 'update'])
  action?: 'schedule' | 'update';
}
