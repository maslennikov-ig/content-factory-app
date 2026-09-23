/**
 * The author's link for a post (`content-factory-next-97dq.75`, thirteenth
 * walk, E1).
 *
 * Owner: «если человек выбирает не больше одной ссылки… на этапе вопроса
 * спрашивать, какие ссылки вы хотели бы вставить… детерминированный вопрос…
 * там же он может и передумать». So the piece asks one fixed question —
 * «Какую ссылку поставить в пост?» — whenever a channel it goes to allows
 * links, and the answer is the only link the adaptation may add on its own
 * account. Links already in the author's material and sources stay allowed;
 * an invented one never is.
 *
 * Storage without a schema change: the answer lives in `ContentPiece.brief`
 * next to the core (`ZagotovkaCoreV1.postLink`, origin `author`), and a post
 * can override it in its own settings (`tags.postSettings[id].options.link`,
 * `post-settings.ts`).
 */

import type {
  PiecePostLinkV1,
  ZagotovkaCoreV1,
} from '../brand-voice/voice-wiring.contract';

/** The longest address the product stores. */
export const POST_LINK_MAX = 2048;

/** The post override that means «no link in this post». */
export const POST_LINK_NONE = 'none';

/** `none` in any case (`97dq.75` review P3-11): the door accepts `None` too. */
export const isPostLinkNone = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().toLowerCase() === POST_LINK_NONE;

/** What a door accepts for a post link: empty, `none` or an http(s) address. */
export const POST_LINK_PATTERN = /^(|none|https?:\/\/\S+)$/i;

/**
 * An http(s) address as the product stores it, or `null`. A bare host
 * (`example.com/x`) gets `https://`; anything with credentials, whitespace or
 * another scheme is not a link for a post.
 */
export function normalizePostLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > POST_LINK_MAX || /\s/u.test(trimmed)) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed) && !/^https?:\/\//iu.test(trimmed))
    return null;
  const candidate = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (!url.hostname.includes('.')) return null;
    // The parsed form (`97dq.75` review P3-9): what the browser and the
    // channel will actually open, with spaces and quotes encoded.
    return url.href.length <= POST_LINK_MAX ? url.href : null;
  } catch {
    return null;
  }
}

/** The stored answer, read defensively: `brief` is JSON of older builds. */
export function readPostLink(value: unknown): PiecePostLinkV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.origin !== 'author') return null;
  const answeredAt =
    typeof record.answeredAt === 'string' && record.answeredAt.trim()
      ? record.answeredAt
      : new Date(0).toISOString();
  if (record.url === null) return { url: null, origin: 'author', answeredAt };
  const url = normalizePostLink(record.url);
  return url ? { url, origin: 'author', answeredAt } : null;
}

/** The answer to write: an address, or `null` for «Без ссылки». */
export function postLinkAnswer(url: string | null, answeredAt: string): PiecePostLinkV1 {
  return { url, origin: 'author', answeredAt };
}

/**
 * A post's own link, as its settings hold it: `''` — as the piece's answer,
 * `none` — no link in this post, otherwise an http(s) address. Junk reads as
 * `''`, the absence of an override.
 */
export function readPostLinkOverride(value: unknown): string {
  if (isPostLinkNone(value)) return POST_LINK_NONE;
  return normalizePostLink(value) ?? '';
}

/**
 * The link that decides for this post: the post's own, else the piece's
 * answer. `undefined` — nobody said anything, and the writer keeps its
 * general rule; `{ url: null }` — no link of its own; `{ url }` — this one.
 */
export function effectivePostLink(
  core: Pick<ZagotovkaCoreV1, 'postLink'> | null | undefined,
  override: unknown
): { url: string | null; from: 'post' | 'piece' } | undefined {
  if (isPostLinkNone(override)) return { url: null, from: 'post' };
  const own = normalizePostLink(override);
  if (own) return { url: own, from: 'post' };
  const answer = core?.postLink;
  if (!answer) return undefined;
  return { url: answer.url, from: 'piece' };
}

/** Whether a link policy lets a post carry a link at all. */
export const policyAllowsLinks = (policy: unknown): boolean =>
  typeof policy === 'string' && policy !== 'none';

/**
 * Whether to ask the question: the piece has a core, nobody answered yet,
 * and at least one of the channels it goes to allows links. The caller picks
 * the channels: those with an adaptation, or every connected one while the
 * piece has none.
 */
export function linkQuestionOpen(
  core: Pick<ZagotovkaCoreV1, 'postLink'> | null | undefined,
  policies: readonly unknown[]
): boolean {
  if (!core) return false;
  if (core.postLink !== undefined && core.postLink !== null) return false;
  return policies.some(policyAllowsLinks);
}
