import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsString,
  ValidateIf,
} from 'class-validator';
import { ASSIGNABLE_ORGANIZATION_ROLES } from '@contentfactory/nestjs-libraries/user/organization.roles';

export class AddTeamMemberDto {
  @IsDefined()
  @IsEmail()
  @ValidateIf((o) => o.sendEmail)
  email: string;

  @IsString()
  @IsIn([...ASSIGNABLE_ORGANIZATION_ROLES])
  role: string;

  @IsDefined()
  @IsBoolean()
  sendEmail: boolean;
}
