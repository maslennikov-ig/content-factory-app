import { IsDefined, IsEmail, IsIn, IsString } from 'class-validator';
import { ASSIGNABLE_ORGANIZATION_ROLES } from '@contentfactory/nestjs-libraries/user/organization.roles';

export class AdminAddTeamMemberDto {
  @IsDefined()
  @IsEmail()
  email: string;

  @IsString()
  @IsIn([...ASSIGNABLE_ORGANIZATION_ROLES])
  role: string;
}
