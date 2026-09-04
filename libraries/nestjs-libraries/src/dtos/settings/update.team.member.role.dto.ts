import { IsIn, IsString } from 'class-validator';
import { ASSIGNABLE_ORGANIZATION_ROLES } from '@contentfactory/nestjs-libraries/user/organization.roles';

/**
 * `content-factory-next-fn33.17`. The body of `PUT /settings/team/:id`.
 *
 * The list is the same one the invitation form offers, so `SUPERADMIN` — the
 * instance's own role — cannot be reached through this door even before the
 * service weighs the caller against the person they are changing.
 */
export class UpdateTeamMemberRoleDto {
  @IsString()
  @IsIn([...ASSIGNABLE_ORGANIZATION_ROLES])
  role: string;
}
