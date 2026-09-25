import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from '@contentfactory/nestjs-libraries/database/prisma/notifications/notifications.repository';
import { EmailService } from '@contentfactory/nestjs-libraries/services/email.service';
import { OrganizationRepository } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { organizationId } from '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute';
import { resolveBackendLocale } from '@contentfactory/nestjs-libraries/locale/backend-strings';
import {
  translateNotificationBody,
  translateNotificationSubject,
} from '@contentfactory/nestjs-libraries/locale/notification-email-text';

export type NotificationType = 'success' | 'fail' | 'info';

@Injectable()
export class NotificationService {
  constructor(
    private _notificationRepository: NotificationsRepository,
    private _emailService: EmailService,
    private _organizationRepository: OrganizationRepository,
    private _temporalService: TemporalService
  ) {}

  getMainPageCount(organizationId: string, userId: string) {
    return this._notificationRepository.getMainPageCount(
      organizationId,
      userId
    );
  }

  getNotificationsPaginated(organizationId: string, page: number) {
    return this._notificationRepository.getNotificationsPaginated(
      organizationId,
      page
    );
  }

  getNotifications(organizationId: string, userId: string) {
    return this._notificationRepository.getNotifications(
      organizationId,
      userId
    );
  }

  async inAppNotification(
    orgId: string,
    subject: string,
    message: string,
    sendEmail = false,
    digest = false,
    type: NotificationType = 'success'
  ) {
    await this._notificationRepository.createNotification(orgId, message);
    if (!sendEmail) {
      return;
    }

    if (digest) {
      try {
        await this._temporalService.client
          .getRawClient()
          ?.workflow.signalWithStart('digestEmailWorkflow', {
            workflowId: 'digest_email_workflow_' + orgId,
            signal: 'email',
            signalArgs: [
              [
                {
                  title: subject,
                  message,
                  type,
                },
              ],
            ],
            taskQueue: 'main',
            workflowIdConflictPolicy: 'USE_EXISTING',
            args: [{ organizationId: orgId }],
            typedSearchAttributes: new TypedSearchAttributes([
              {
                key: organizationId,
                value: orgId,
              },
            ]),
          });
      } catch (err) {}

      return;
    }

    await this.sendEmailsToOrg(orgId, subject, message, type);
  }

  async sendEmailsToOrg(
    orgId: string,
    subject: string,
    message: string,
    type?: NotificationType
  ) {
    const userOrg = await this._organizationRepository.getAllUsersOrgs(orgId);
    for (const user of userOrg?.users || []) {
      // 'info' type is always sent regardless of preferences
      if (type !== 'info') {
        // Filter users based on their email preferences
        if (type === 'success' && !user.user.sendSuccessEmails) {
          continue;
        }
        if (type === 'fail' && !user.user.sendFailureEmails) {
          continue;
        }
      }
      // The workflows write the notification in English; each member reads
      // it in the language their account carries.
      const locale = resolveBackendLocale(user.user.language);
      await this.sendEmail(
        user.user.email,
        translateNotificationSubject(subject, locale),
        translateNotificationBody(message, locale),
        undefined,
        locale
      );
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    replyTo?: string,
    language?: string
  ) {
    await this._emailService.sendEmail(to, subject, html, 'top', replyTo, language);
  }

  hasEmailProvider() {
    return this._emailService.hasProvider();
  }
}
