/**
 * 2q28.16: a browser that has been told «this account waits for approval»
 * remembers it, so the next app address it opens shows the waiting screen
 * instead of the sign-up form (which invited a second registration).
 *
 * The marker is not a credential and grants nothing: it only changes which
 * public auth page an unauthenticated visitor is sent to. A session clears it
 * (`apps/frontend/src/proxy.ts`), and the pending screen links to sign-in.
 *
 * The proxy cannot import this file — it runs ahead of the application bundle
 * and its tests load it with a fixed set of module stubs — so the name is held
 * equal to `AWAITING_APPROVAL_COOKIE` there by
 * `tests/proxy-awaiting-approval.test.cjs`.
 */
export const AWAITING_APPROVAL_COOKIE = 'cf-awaiting-approval';

const MARKER_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function rememberAwaitingApproval() {
  if (typeof document === 'undefined') return;
  document.cookie = `${AWAITING_APPROVAL_COOKIE}=1; path=/; max-age=${MARKER_MAX_AGE_SECONDS}; samesite=lax`;
}
