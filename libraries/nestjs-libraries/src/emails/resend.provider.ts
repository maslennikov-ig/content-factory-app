import { Resend } from 'resend';
import {
  EmailInterface,
  EmailSendError,
} from '@contentfactory/nestjs-libraries/emails/email.interface';

/**
 * Resend's documented API error codes and the HTTP status each maps to
 * (https://resend.com/docs/api-reference/errors). Only these three describe
 * a transient condition worth retrying (rate limiting, or the provider's own
 * 5xx); everything else — a bad API key, a rejected "from"/"to" address, a
 * malformed payload — describes a request that will fail again unchanged.
 */
const RETRYABLE_RESEND_ERROR_NAMES = new Set([
  'rate_limit_exceeded',
  'application_error',
  'internal_server_error',
]);

export class ResendProvider implements EmailInterface {
  name = 'resend';
  validateEnvKeys = ['RESEND_API_KEY'];

  private client: Resend | undefined;

  /**
   * Built on first use, not on module import. Importing this file must never
   * fail: `EmailService` imports every provider unconditionally, whichever
   * one is actually configured. Reading the key lazily also means an
   * operator who fixes `RESEND_API_KEY` and restarts the process gets the
   * new value — a client built once at import time never would, restart or
   * not.
   */
  private getClient(): Resend {
    if (!this.client) {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        throw new EmailSendError(
          'RESEND_API_KEY is not set; cannot send email through Resend.',
          false
        );
      }
      this.client = new Resend(apiKey);
    }

    return this.client;
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string,
    replyTo?: string
  ) {
    const { data, error } = await this.getClient().emails.send({
      from: `${emailFromName} <${emailFromAddress}>`,
      to,
      subject,
      html,
      ...(replyTo && { reply_to: replyTo }),
    });

    // The Resend SDK does not throw on an API-level failure: it resolves
    // with `{ data: null, error }`. Treating that as delivered only because
    // nothing threw is exactly how a revoked key, an expired key, or a
    // rejected domain look identical to a successful send.
    if (error) {
      throw new EmailSendError(
        `Resend rejected the email ("${error.name}"): ${error.message}`,
        RETRYABLE_RESEND_ERROR_NAMES.has(error.name)
      );
    }

    return data;
  }
}
