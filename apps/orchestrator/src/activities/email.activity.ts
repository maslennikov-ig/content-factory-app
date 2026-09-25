import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { EmailService } from '@contentfactory/nestjs-libraries/services/email.service';
import { OrganizationService } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@contentfactory/nestjs-libraries/database/prisma/users/users.service';
import { resolveBackendLocale } from '@contentfactory/nestjs-libraries/locale/backend-strings';
import {
  translateNotificationBody,
  translateNotificationSubject,
} from '@contentfactory/nestjs-libraries/locale/notification-email-text';

@Injectable()
@Activity()
export class EmailActivity {
  constructor(
    private _emailService: EmailService,
    private _organizationService: OrganizationService,
    private _usersService: UsersService
  ) {}

  @ActivityMethod()
  async sendEmail(to: string, subject: string, html: string, replyTo?: string) {
    return this._emailService.sendEmailSync(to, subject, html, replyTo);
  }

  @ActivityMethod()
  async sendEmailAsync(to: string, subject: string, html: string, sendTo: 'top' | 'bottom', replyTo?: string) {
    // The digest and streak workflows write English and know only the
    // address; the recipient's language is looked up here, in the activity,
    // so the workflow code stays as it is.
    const locale = resolveBackendLocale(
      await this._usersService.getLanguageByEmail(to).catch(() => null)
    );
    return await this._emailService.sendEmail(
      to,
      translateNotificationSubject(subject, locale),
      translateNotificationBody(html, locale),
      sendTo,
      replyTo,
      locale
    );
  }

  @ActivityMethod()
  async getUserOrgs(id: string) {
    return this._organizationService.getTeam(id);
  }

  @ActivityMethod()
  async setStreak(organizationId: string, type: 'start' | 'end') {
    return this._organizationService.setStreak(organizationId, type);
  }
}
