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
  /**
   * Optional on purpose (`content-factory-next-fn33.24`). The address is what
   * binds the invitation to one person: with it the link only works for that
   * mailbox, without it the link is open to whoever holds it — which is how an
   * invitation travels through Telegram or WhatsApp. It stops being optional
   * the moment the invitation is also sent by email, because then there is
   * nowhere to send it.
   */
  @ValidateIf((o) => o.sendEmail || !!o.email)
  @IsDefined()
  @IsEmail()
  email?: string;

  @IsString()
  @IsIn([...ASSIGNABLE_ORGANIZATION_ROLES])
  role: string;

  /**
   * «Also send it by email», not «this is an email invitation». The link is
   * shown on screen either way.
   */
  @IsDefined()
  @IsBoolean()
  sendEmail: boolean;
}
