import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  EmailInterface,
  EmailSendError,
} from '@contentfactory/nestjs-libraries/emails/email.interface';
import { ResendProvider } from '@contentfactory/nestjs-libraries/emails/resend.provider';
import { EmptyProvider } from '@contentfactory/nestjs-libraries/emails/empty.provider';
import { NodeMailerProvider } from '@contentfactory/nestjs-libraries/emails/node.mailer.provider';
import { TemporalService } from 'nestjs-temporal-core';
import { timer } from '@contentfactory/helpers/utils/timer';
import {
  resolveBackendLocale,
  translateBackendString,
} from '@contentfactory/nestjs-libraries/locale/backend-strings';
import {
  emailDirection,
  renderEmailDocument,
  wrapLooseBody,
} from '@contentfactory/nestjs-libraries/emails/email.template';

@Injectable()
export class EmailService {
  emailService: EmailInterface;
  constructor(private _temporalService: TemporalService) {
    this.emailService = this.selectProvider(process.env.EMAIL_PROVIDER);
    console.log('Email service provider:', this.emailService.name);
    for (const key of this.emailService.validateEnvKeys) {
      if (!process.env[key]) {
        console.error(`Missing environment variable: ${key}`);
      }
    }
  }

  hasProvider() {
    return !(this.emailService instanceof EmptyProvider);
  }

  selectProvider(provider: string | undefined) {
    switch (provider) {
      case 'resend':
        return new ResendProvider();
      case 'nodemailer':
        return new NodeMailerProvider();
      // Unset is a deliberate, ordinary choice (local dev, an install that
      // never wired email up) — nothing was ever going to be sent, so
      // there's nothing to warn about.
      case undefined:
      case '':
        return new EmptyProvider();
      // Anything else is a typo or a provider name nobody wired up: email is
      // silently disabled either way, but only this case is a misconfiguration
      // worth being loud about.
      default:
        console.error(
          'EMAIL_PROVIDER is not a known email provider ' +
            '("resend" or "nodemailer"). Falling back to no email provider: ' +
            'email sending is disabled until this is fixed.'
        );
        return new EmptyProvider();
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    addTo: 'top' | 'bottom',
    replyTo?: string,
    language?: string
  ) {
    return this._temporalService.client
      .getRawClient()
      ?.workflow.signalWithStart('sendEmailWorkflowV3', {
        taskQueue: 'main',
        workflowId: 'send_email_v2',
        signal: 'sendEmail',
        args: [{ queue: [] }],
        signalArgs: [{ to, subject, html, replyTo, addTo, language }],
        workflowIdConflictPolicy: 'USE_EXISTING',
      });
  }

  async sendEmailSync(
    to: string,
    subject: string,
    html: string,
    replyTo?: string,
    language?: string
  ) {
    // Random per-operation correlation carries no recipient/content/provider data.
    const correlationId = randomUUID();
    if (to.indexOf('@') === -1) {
      // With no real provider configured, nothing was ever going to be sent
      // — this is "email is off", which is legitimate and quiet.
      if (!this.hasProvider()) {
        return;
      }
      // A real provider IS configured, so this is a caller handing a
      // structurally broken address to a system that is supposed to work.
      // That is "email is broken", and it must not look like nothing
      // happened.
      const err = new EmailSendError(
        'Refusing to send: recipient is not a valid email address.',
        false
      );
      console.error('email.failed', { correlationId, code: 'invalid_recipient' });
      throw err;
    }

    if (!process.env.EMAIL_FROM_ADDRESS || !process.env.EMAIL_FROM_NAME) {
      if (!this.hasProvider()) {
        console.log('email.skipped', {
          correlationId,
          code: 'sender_not_configured',
        });
        return;
      }
      const err = new EmailSendError(
        'EMAIL_FROM_ADDRESS/EMAIL_FROM_NAME is not set while an email provider is configured.',
        false
      );
      console.error('email.failed', {
        correlationId,
        code: 'sender_not_configured',
      });
      throw err;
    }

    const locale = resolveBackendLocale(language);
    const modifiedHtml = renderEmailDocument({
      locale,
      subject,
      // A caller that builds its body from `emails/email.template.ts` hands
      // over finished table rows and they drop straight into the card. A
      // caller that hands over a loose fragment — a digest message, a
      // notification, anything not yet moved over — gets that fragment put
      // into one body row, so it lands inside the card with the card's colour
      // and measure instead of escaping the table.
      bodyHtml: /^\s*<tr[\s>]/i.test(html)
        ? html
        : wrapLooseBody(html, emailDirection(locale)),
      senderName: process.env.EMAIL_FROM_NAME,
      footerHtml: translateBackendString(
        'email_footer_notification_preferences',
        locale,
        { link: `${process.env.FRONTEND_URL}/settings` }
      ),
    });

    let lastErr: unknown;
    let attempts = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      attempts = attempt + 1;
      try {
        await this.emailService.sendEmail(
          to,
          subject,
          modifiedHtml,
          process.env.EMAIL_FROM_NAME,
          process.env.EMAIL_FROM_ADDRESS,
          replyTo
        );
        if (this.hasProvider()) {
          console.log('email.sent', { correlationId, attempt: attempts });
        } else {
          console.log('email.skipped', {
            correlationId,
            code: 'provider_not_configured',
          });
        }
        return;
      } catch (err) {
        lastErr = err;
        const retryable = !(err instanceof EmailSendError && !err.retryable);
        console.log('email.attempt_failed', {
          correlationId,
          attempt: attempts,
          code: retryable ? 'provider_failure' : 'non_retryable_failure',
          retryable,
        });
        // A non-retryable failure (bad recipient, rejected domain, missing
        // key) will fail again unchanged — stop hammering it and surface it
        // now instead of burning the remaining attempts.
        if (err instanceof EmailSendError && !err.retryable) {
          break;
        }
        if (attempt < 2) {
          await timer(700);
        }
      }
    }
    // The loop above used to end here with a `console.log` and a normal
    // return — the provider failed, the caller (and Temporal, for the
    // activity that calls this) never found out. A revoked key, an expired
    // key, a rate limit: all of it looked exactly like a successful send.
    // Throwing (instead of swallowing) is what actually surfaces this: the
    // activity that called `sendEmailSync` fails visibly in Temporal's own
    // execution history, instead of a `console.error` line nobody reads.
    const retryable = !(lastErr instanceof EmailSendError && !lastErr.retryable);
    console.error('email.failed', {
      correlationId,
      attempts,
      code: retryable ? 'provider_failure' : 'non_retryable_failure',
      retryable,
    });
    throw lastErr;
  }
}
