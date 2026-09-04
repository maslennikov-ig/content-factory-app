import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `content-factory-next-fn33.36`: the body of `POST /user/organizations`.
 *
 * A workspace needs a name a person can tell apart from the others in the
 * switcher, so the empty string is refused here rather than quietly turned
 * into the fallback registration uses.
 */
export class CreateOrganizationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}
