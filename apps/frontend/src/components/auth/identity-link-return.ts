/**
 * Telegram knows one address to send a person back to, `/auth?provider=TELEGRAM`,
 * because BotFather holds one Allowed URL and a second one is a setting nobody
 * can see is missing until somebody tries to use it. Connecting Telegram to an
 * existing account starts in Settings, so its callback now lands on the sign-in
 * page and has to be walked the rest of the way home.
 *
 * The tab that started the connection left a note in `sessionStorage`; this is
 * what reads it. Settings still owns writing that note and spending it.
 */
export const IDENTITY_LINK_INTENT_KEY = 'content-factory:identity-link-intent';

/** Fixed, never taken from the stored note: a callback cannot choose a target. */
export const IDENTITY_LINK_RETURN_PATH = '/settings';

type StoredIntent = {
  provider?: string;
  state?: string;
  expiresAt?: number;
};

/**
 * Where a Telegram callback that arrived on the sign-in page has to continue,
 * or `null` when this is an ordinary sign-in and the page should carry on.
 */
export function identityLinkReturnUrl({
  search,
  rawIntent,
  now = Date.now(),
}: {
  search: string;
  rawIntent: string | null;
  now?: number;
}): string | null {
  const query = new URLSearchParams(search);
  const code = query.get('code');
  const state = query.get('state');
  if (!code || !state || !rawIntent) return null;

  let intent: StoredIntent;
  try {
    intent = JSON.parse(rawIntent) as StoredIntent;
  } catch {
    return null;
  }

  // Only Telegram comes back here; every other provider is registered against
  // the settings address itself and never passes through this page.
  if (!intent || intent.provider !== 'TELEGRAM') return null;
  if (typeof intent.expiresAt !== 'number' || intent.expiresAt <= now) {
    return null;
  }
  // A note from a different attempt must not carry this callback anywhere.
  if (intent.state !== state) return null;

  return `${IDENTITY_LINK_RETURN_PATH}?${new URLSearchParams({
    code,
    state,
  }).toString()}`;
}
