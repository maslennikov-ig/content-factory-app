/**
 * How a sign-in method is named to a person.
 *
 * `Provider` is a Prisma enum, so what the backend hands over is `LOCAL`,
 * `GOOGLE`, `TELEGRAM` — shouted Latin identifiers that mean something to the
 * database and nothing to a reader. The profile's «Sign-in methods» screen has
 * always turned them into words; the administrator's account list printed the
 * enum value raw, so a Russian table carried a column of `LOCAL`
 * (`content-factory-next-fn33.124`).
 *
 * Two kinds of name meet here, and only one of them is translated. `LOCAL` is
 * a description — «email and password» — and every locale says it its own way.
 * The rest are brands: GitHub is GitHub in all sixteen, and translating a
 * brand would be wrong rather than merely unnecessary. `GENERIC` is the one in
 * between: a deployment's own single sign-on, which carries the operator's
 * name when there is one and a translated «Single sign-on» when there is not.
 */

export type IdentityProvider =
  | 'LOCAL'
  | 'GITHUB'
  | 'GOOGLE'
  | 'FARCASTER'
  | 'WALLET'
  | 'GENERIC'
  | 'TELEGRAM';

export type ExternalIdentityProvider = Exclude<IdentityProvider, 'LOCAL'>;

/** Brand spellings. Not translated on purpose — see the note above. */
export const PROVIDER_NAMES: Record<ExternalIdentityProvider, string> = {
  GITHUB: 'GitHub',
  GOOGLE: 'Google',
  TELEGRAM: 'Telegram',
  FARCASTER: 'Farcaster',
  WALLET: 'Wallet',
  GENERIC: 'Single sign-on',
};

/**
 * Only the two shapes `useT()` is actually used with here, so this file stays
 * free of a React import and can be loaded by a plain Node test.
 */
export type TranslateLike = (key: string, fallback: string) => string;

/**
 * An unknown value — a provider added to the schema and not yet listed here,
 * or a row written before the enum existed — comes back as it arrived rather
 * than as an empty cell: an administrator reading `SOMETHING_NEW` at least
 * learns there is something new.
 */
export const providerLabel = (
  provider: IdentityProvider | string,
  genericName?: string,
  t?: TranslateLike
): string => {
  if (provider === 'LOCAL') {
    return t?.('email_and_password', 'Email and password') || 'Email and password';
  }
  if (provider === 'GENERIC') {
    if (genericName) return genericName;
    return t?.('sign_in_method_sso', 'Single sign-on') || PROVIDER_NAMES.GENERIC;
  }
  return (
    PROVIDER_NAMES[provider as ExternalIdentityProvider] || String(provider)
  );
};
