export interface EmailInterface {
  name: string;
  validateEnvKeys: string[];
  sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string,
    replyTo?: string
  ): Promise<any>;
}

/**
 * Thrown by an `EmailInterface` implementation (or by `EmailService` itself,
 * before a provider is ever reached) when a send did not happen.
 *
 * `retryable` is the only thing that matters to a caller: a transient
 * problem (network failure, a provider's own 5xx, a rate limit) is worth
 * trying again; a structural one (a malformed recipient address, a rejected
 * sender domain, a missing API key) will fail again unchanged, so retrying
 * it only delays the moment the failure becomes visible.
 * `EmailActivityV2` (apps/orchestrator/src/activities/email.activity.v2.ts)
 * reads this flag to decide whether Temporal should keep retrying the
 * activity at all.
 */
export class EmailSendError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'EmailSendError';
    this.retryable = retryable;
  }
}
