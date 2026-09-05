/**
 * The two ceilings «Откуда идеи» keeps (`content-factory-next-ni7x`).
 *
 * Their own file, with no imports, because the service, the tests and
 * anything that ever needs to print the number all read the same constant
 * instead of retyping it — and because a test can load it without standing
 * up NestJS around the service first.
 *
 * Neither number is a licence tier. The unique index on
 * `(organizationId, kind, canonicalUrl)` only stops the *same* address
 * twice: a workspace could hold any number of different feeds, and each one
 * is a perpetual Temporal workflow. The manual-check window is the same
 * reasoning one level down — `LEAD_FEED_CHECK_ENABLED` is a switch, not a
 * rate, so with checking on, "Проверить сейчас" was an outbound request per
 * click with nothing between it and the far side.
 */

/** How many live subscriptions one organisation may hold at once. */
export const MAX_LEAD_SUBSCRIPTIONS_PER_ORGANIZATION = 20;

/**
 * How long after a check a manual "Проверить сейчас" is refused. Only the
 * manual path is throttled: the periodic workflow's own tick already runs at
 * the interval the row was created with.
 */
export const MANUAL_CHECK_MIN_INTERVAL_MS = 60_000;
