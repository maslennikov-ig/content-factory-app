import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ApplicationFailure } from '@temporalio/common';
import { EmailService } from '@contentfactory/nestjs-libraries/services/email.service';
import { EmailSendError } from '@contentfactory/nestjs-libraries/emails/email.interface';

/**
 * Versioned successor of `EmailActivity.sendEmail` (email.activity.ts). That
 * activity's contract is used by `sendEmailWorkflow` executions started
 * before this task and must stay exactly as Temporal already recorded it —
 * see `send.email.workflow.ts`'s header comment. `sendEmailV2` is where the
 * fifth argument, the recipient's language for the footer signature line,
 * lives instead.
 *
 * Only `sendEmail` gained a versioned twin. `EmailActivity`'s other methods
 * (`sendEmailAsync`, `getUserOrgs`, `setStreak`) are untouched by this task
 * and keep living on the original class.
 */
@Injectable()
@Activity()
export class EmailActivityV2 {
  constructor(private _emailService: EmailService) {}

  @ActivityMethod()
  async sendEmailV2(
    to: string,
    subject: string,
    html: string,
    replyTo?: string,
    language?: string
  ) {
    try {
      return await this._emailService.sendEmailSync(
        to,
        subject,
        html,
        replyTo,
        language
      );
    } catch (err) {
      // `EmailSendError.retryable === false` means the failure is
      // structural (bad recipient, rejected domain, missing key) and will
      // happen again unchanged. Left as a plain `Error`, Temporal's default
      // retry policy (unbounded, with backoff) would hammer it forever.
      // `ApplicationFailure.nonRetryable` tells Temporal to stop after this
      // one attempt while still recording the failure in the workflow's
      // history instead of a swallowed console.log.
      if (err instanceof EmailSendError && !err.retryable) {
        throw ApplicationFailure.nonRetryable(err.message, err.name, {
          to,
          subject,
        });
      }
      throw err;
    }
  }
}
