/**
 * What the product knows about a consent, in the form a provider can store.
 *
 * `consentedAt` is the value written to the account row, not a fresh clock
 * read: the subscriber record and the database record have to describe the same
 * moment, or neither can be used as evidence of the other.
 */
export interface NewsletterConsent {
  source: string;
  consentedAt: Date;
}

export interface NewsletterInterface {
  name: string;
  register(email: string, consent?: NewsletterConsent): Promise<void>;
}
