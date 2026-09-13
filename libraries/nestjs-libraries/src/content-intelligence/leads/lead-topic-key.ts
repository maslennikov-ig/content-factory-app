/**
 * The key a topic subscription occupies (`content-factory-next-75xn.7`).
 *
 * `ContentLeadSubscription` is unique on `(organizationId, kind,
 * canonicalUrl)`, and that index is the only thing that has ever meant «one
 * subscription per thing watched». A topic has no address, so it needs a
 * value for that column anyway; the alternatives were a second index only one
 * kind would use, or a nullable column the index would stop guarding. Both
 * cost more than deriving a key from the topic itself.
 *
 * Normalisation is deliberately shallow — lower case and collapsed
 * whitespace, nothing else. It catches the mistake this exists to catch («ИИ
 * в медицине» typed twice with a stray space) without pretending to know that
 * two differently worded topics are the same question; that judgement belongs
 * to the person, not to a slug. `query` keeps the wording they typed, and
 * this key never rewords it back.
 *
 * No imports on purpose, the same reason `lead-limits.ts` has none: the
 * service, the repository and the tests all read one implementation of the
 * rule without standing up NestJS to reach it.
 */

/** The scheme that marks a synthetic, addressless subscription key. */
export const TOPIC_KEY_SCHEME = 'topic://';

/** How long a watched topic may be. The DTO repeats this number as a rule. */
export const MAX_TOPIC_QUERY_LENGTH = 200;

/** Lower case, collapsed whitespace, trimmed. Nothing is dropped or rewritten. */
export function normalizeTopicQuery(query: string): string {
  return (query || '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

/**
 * `topic://<normalised topic>` — what a `TOPIC` row stores in `canonicalUrl`.
 *
 * Returns an empty string for an empty topic rather than a bare `topic://`,
 * so a caller cannot accidentally store a key that means «any topic at all».
 */
export function topicSubscriptionKey(query: string): string {
  const normalized = normalizeTopicQuery(query);
  return normalized ? `${TOPIC_KEY_SCHEME}${normalized}` : '';
}

/** Whether a stored `canonicalUrl` is one of these synthetic keys. */
export const isTopicSubscriptionKey = (canonicalUrl: string): boolean =>
  typeof canonicalUrl === 'string' && canonicalUrl.startsWith(TOPIC_KEY_SCHEME);
