import {
  describePiece,
  PLATFORM_SHAPES,
  type RecutPlatform,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/recut';

/**
 * The pure half of the library: turning a stored piece into the row a person
 * reads.
 *
 * None of this touches the database and none of it reaches a platform. It is
 * separate from the service for the same reason `recut.ts` is separate from
 * everything: a number on a screen should be reproducible from its inputs
 * without a workspace, a session or a network.
 */

/** `cnt-01`, the short code the library prints beside a piece. */
export const materialCode = (index: number): string =>
  `cnt-${String(index + 1).padStart(2, '0')}`;

/**
 * A text no short-form surface carries whole is a long one.
 *
 * The threshold is a product judgement rather than a measurement, so it is
 * named once here instead of appearing as `1500` in three files.
 */
export const LONG_FORM_CHARS = 1_500;

/**
 * The word the table prints in the format column.
 *
 * `tags.format` wins when a piece carries one: an author who wrote "интервью"
 * meant it, and replacing that with "длинный" tells them less than they
 * already knew.
 */
export function materialFormat(
  body: string,
  tags: unknown,
  language = 'ru'
): string {
  const declared =
    tags && typeof tags === 'object' && !Array.isArray(tags)
      ? (tags as Record<string, unknown>).format
      : undefined;
  if (typeof declared === 'string' && declared.trim()) return declared.trim();

  const long = describePiece(body).chars >= LONG_FORM_CHARS;
  if (language === 'ru') return long ? 'длинный' : 'короткий';
  return long ? 'long' : 'short';
}

/**
 * The date as the library shows it: `05.08.26`.
 *
 * Formatted in UTC on purpose. A per-reader time zone is not carried by any
 * request on this surface, and a date that silently shifts by one day
 * depending on which machine rendered it is worse than one that does not shift
 * at all.
 */
export function materialDate(value: Date | string, language = 'ru'): string {
  const date = value instanceof Date ? value : new Date(value);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  if (language === 'ru') return `${day}.${month}.${year.slice(2)}`;
  return `${year}-${month}-${day}`;
}

/** `v3`, or the label the workspace gave the version instead. */
export function voiceVersionLabel(
  version: { versionNumber?: number | null; label?: string | null } | null
): string | undefined {
  if (!version) return undefined;
  if (version.label && version.label.trim()) return version.label.trim();
  return typeof version.versionNumber === 'number'
    ? `v${version.versionNumber}`
    : undefined;
}

/** How many pictures the piece carries, counted from the piece itself. */
export function countImages(body: string, tags: unknown): number {
  const declared =
    tags && typeof tags === 'object' && !Array.isArray(tags)
      ? (tags as Record<string, unknown>).images
      : undefined;
  if (Array.isArray(declared)) return declared.length;
  if (typeof declared === 'number' && Number.isFinite(declared)) {
    return Math.max(0, Math.trunc(declared));
  }
  return (body.match(/!\[[^\]]*\]\(|<img\b/gu) || []).length;
}

/** How many links it carries. Counted, never opened. */
export const countLinks = (body: string): number =>
  (body.match(/https?:\/\/\S/gu) || []).length;

export const RECUT_PLATFORMS = Object.keys(PLATFORM_SHAPES) as RecutPlatform[];

export const isRecutPlatform = (value: unknown): value is RecutPlatform =>
  typeof value === 'string' && RECUT_PLATFORMS.includes(value as RecutPlatform);

/**
 * Which of this workspace's channels a recut for a platform can be attached to.
 *
 * Identifiers, not providers. Choosing which channel a draft belongs to is a
 * question about the workspace's own rows; sending anything to that channel is
 * `PostsService` and the providers, and nothing here imports them.
 */
export const PLATFORM_PROVIDERS: Readonly<Record<RecutPlatform, string[]>> = {
  site: ['wordpress'],
  telegram: ['telegram'],
  vk: ['vk'],
  newsletter: ['listmonk'],
};

/** The three states the library reports, whatever the column happens to hold. */
export function derivationState(
  value: unknown
): 'DRAFT' | 'QUEUED' | 'PUBLISHED' {
  const state = String(value || '').toUpperCase();
  if (state === 'PUBLISHED') return 'PUBLISHED';
  if (state === 'QUEUED' || state === 'QUEUE') return 'QUEUED';
  return 'DRAFT';
}
