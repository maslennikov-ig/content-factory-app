import { Injectable } from '@nestjs/common';
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
          `EMAIL_PROVIDER="${provider}" is not a known email provider ` +
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
      ?.workflow.signalWithStart('sendEmailWorkflowV2', {
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
        `Refusing to send: "${to}" is not a valid email address.`,
        false
      );
      console.error(err.message);
      throw err;
    }

    if (!process.env.EMAIL_FROM_ADDRESS || !process.env.EMAIL_FROM_NAME) {
      if (!this.hasProvider()) {
        console.log(
          'Email sender information not found in environment variables'
        );
        return;
      }
      const err = new EmailSendError(
        'EMAIL_FROM_ADDRESS/EMAIL_FROM_NAME is not set while an email provider is configured.',
        false
      );
      console.error(err.message);
      throw err;
    }

    const modifiedHtml = `
    <div style="
        background: linear-gradient(to bottom right, #e6f2ff, #f0e6ff);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
    ">
        <div style="
            background-color: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(4px);
            border-radius: 0.5rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            max-width: 48rem;
            width: 100%;
            padding: 2rem;
        ">
            <h1 style="
                font-size: 1.875rem;
                font-weight: bold;
                margin-bottom: 1.5rem;
                text-align: left;
                color: #1f2937;
            ">${subject}</h1>
            
            <div style="
                margin-bottom: 2rem;
                color: #374151;
            ">
                ${html}
            </div>
            
            <div style="
                display: flex;
                align-items: center;
                border-top: 1px solid #e5e7eb;
                padding-top: 1.5rem;
            ">
                <div>
                    <h2 style="
                        font-size: 1.25rem;
                        font-weight: 600;
                        color: #1f2937;
                        margin: 0;
                    ">${process.env.EMAIL_FROM_NAME}</h2>
                    <div style="font-size: 12px">
                      ${translateBackendString(
                        'email_footer_notification_preferences',
                        resolveBackendLocale(language),
                        { link: `${process.env.FRONTEND_URL}/settings` }
                      )}
                     </div>
                </div>
            </div>
        </div>
    </div>
    `;

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const sends = await this.emailService.sendEmail(
          to,
          subject,
          modifiedHtml,
          process.env.EMAIL_FROM_NAME,
          process.env.EMAIL_FROM_ADDRESS,
          replyTo
        );
        console.log(sends);
        return;
      } catch (err) {
        lastErr = err;
        console.log(`Email attempt ${attempt + 1}/3 failed:`, err);
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
    console.error(`Email to ${to} failed after exhausting retries:`, lastErr);
    throw lastErr;
  }
}
