/**
 * Who may be offered, and who may actually give, newsletter consent.
 *
 * Two callers share this file on purpose. The registration form uses it to
 * decide whether the checkbox appears at all, and the auth service uses it to
 * decide whether an incoming `subscribeToNewsletter` means anything. When the
 * rule lived only in the browser, `POST /auth/register` with
 * `{"provider":"TELEGRAM","subscribeToNewsletter":true}` walked straight past
 * it: the DTO declares the field, so validation keeps it.
 *
 * Nothing leaked when it did — Telegram and Farcaster identities are
 * `telegram_<sub>` and `farcaster_<fid>`, which no mail system accepts — but
 * the next federated provider that hands out `<id>@something.local` would be
 * subscribed silently, and the claim that synthetic identities are excluded
 * would still be written down as if it were enforced.
 */

/**
 * Sign-up routes that return an address the person actually reads.
 *
 * An allow list rather than a deny list: a provider added later is not
 * newsletter-eligible until somebody says so here, which is the direction the
 * mistake should point.
 */
export const NEWSLETTER_ELIGIBLE_PROVIDERS = [
  'LOCAL',
  'GOOGLE',
  'GITHUB',
  'GENERIC',
] as const;

/**
 * A deliverable address, judged by shape alone.
 *
 * This is not address validation — the mail server owns that. It is the one
 * property a synthetic provider identity fails: a local part, an `@`, and a
 * domain with a dot in it.
 */
export function isDeliverableAddress(email: string | undefined | null) {
  return typeof email === 'string' && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email);
}

export interface NewsletterConsentContext {
  /** What the registration request asked for. */
  requested: boolean | undefined;
  /** Sign-up route: `LOCAL` for email and password, otherwise the provider. */
  provider: string;
  /** The address the account is being created with, if there is one yet. */
  email: string | undefined | null;
}

/**
 * Whether this sign-up route can carry a newsletter subscription at all.
 *
 * The form calls this while the address is still being typed, so a `LOCAL`
 * sign-up is judged on the address and a federated one on the provider.
 */
export function canOfferNewsletterConsent({
  provider,
  email,
}: Omit<NewsletterConsentContext, 'requested'>) {
  if (!NEWSLETTER_ELIGIBLE_PROVIDERS.includes(provider as any)) {
    return false;
  }

  return provider === 'LOCAL' ? (email ?? '').includes('@') : true;
}

/**
 * The consent the account is actually created with.
 *
 * Strict on `true` because `subscribeToNewsletter` arrives from a request body:
 * anything else is an absence, and an absence is not consent.
 */
export function resolveNewsletterConsent({
  requested,
  provider,
  email,
}: NewsletterConsentContext) {
  if (requested !== true) {
    return false;
  }

  if (!NEWSLETTER_ELIGIBLE_PROVIDERS.includes(provider as any)) {
    return false;
  }

  return isDeliverableAddress(email);
}

/** Where a recorded consent came from. One value today, a column tomorrow. */
export const NEWSLETTER_CONSENT_SOURCE_REGISTRATION = 'registration';
