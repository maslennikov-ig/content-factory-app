/**
 * Settings of one post: a piece in one channel (`content-factory-next-97dq.70`).
 *
 * The owner's thirteenth walk: channel settings and post settings are one
 * component with the same fields; a post change saves by itself as an override
 * of the channel, and a plan-mode change applies to the written post at once.
 *
 * Storage without a schema change: `ContentPiece.tags` is already the piece's
 * key bag (`archive`, a declared `format`), written at creation and merged,
 * never replaced (`buildArchiveTags`). The overrides live under
 * `tags.postSettings[integrationId]`. `ContentPiece.brief` was rejected: it is
 * rewritten whole by the core paths and guarded by optimistic `equals`
 * checks, so a settings autosave would either be lost or break a review.
 *
 * `'channel'` (or an absent key) means «как в канале»: not a value, the lack
 * of an override. The plan-mode override is `null` in the same sense.
 */

import { isPlanMode, planModeOf, tagPlanModeOf, type PlanModeV1 } from './adaptation-plan';
import {
  isStoredEmojiLevel,
  type StoredEmojiLevel,
} from '../channels/emoji-ceiling';
import { normalizePostLinkText, readPostLinkOverride } from './post-link';

export const POST_SETTINGS_TAG = 'postSettings';

export const POST_LENGTH_PRESETS = ['auto', 'short', 'ideal', 'long', 'max'] as const;
export const POST_LINK_POLICIES = ['none', 'end', 'inline', 'auto'] as const;
export const POST_HASHTAG_POLICIES = ['none', 'end_1_3', 'free', 'auto'] as const;
export const POST_CTA_KINDS = [
  'auto',
  'none',
  'question',
  'comment',
  'link',
  'subscribe',
  'reply',
] as const;
export const POST_WISH_MAX = 500;

type Choice<Value extends string> = 'channel' | Value;

/** The same shape the tab's panel holds (`PostOptionsV1` on the screen). */
export type PostSettingsOptionsV1 = {
  length: Choice<(typeof POST_LENGTH_PRESETS)[number]>;
  emoji: Choice<StoredEmojiLevel>;
  hashtags: Choice<(typeof POST_HASHTAG_POLICIES)[number]>;
  links: Choice<(typeof POST_LINK_POLICIES)[number]>;
  cta: Choice<(typeof POST_CTA_KINDS)[number]>;
  brandProfileId: string | null;
  wish: string;
  /**
   * «Ссылка для поста» (`97dq.75`): `''` — as the piece's answer, `none` — no
   * link in this post, otherwise an http(s) address (`post-link.ts`).
   */
  link: string;
  /**
   * «Текст ссылки» (`97dq.79`): the words that carry the link; `''` — the
   * piece's words, else the writer picks them. Settings saved before the
   * field read as `''`.
   */
  linkText: string;
};

export type PiecePostSettingsV1 = {
  options: PostSettingsOptionsV1;
  /** `null` — as the channel decides. */
  planMode: PlanModeV1 | null;
  /** ISO time of the last save: the «Сохранено · ЧЧ:ММ» line. */
  savedAt: string | null;
  /**
   * ISO time of the last change to a field that changes the text. The screen
   * says «применится при переписывании» while the shown version is older.
   */
  textChangedAt: string | null;
};

export const DEFAULT_POST_SETTINGS_OPTIONS: PostSettingsOptionsV1 = {
  length: 'channel',
  emoji: 'channel',
  hashtags: 'channel',
  links: 'channel',
  cta: 'channel',
  brandProfileId: null,
  wish: '',
  link: '',
  linkText: '',
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const oneOf = <Value extends string>(
  values: readonly Value[],
  value: unknown
): Choice<Value> =>
  typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as Value)
    : 'channel';

const isoOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const at = new Date(value);
  return Number.isFinite(at.getTime()) ? at.toISOString() : null;
};

/** Anything the wire or the column holds, read as options; junk is «как в канале». */
export function readPostSettingsOptions(value: unknown): PostSettingsOptionsV1 {
  const record = asRecord(value);
  const brand =
    typeof record.brandProfileId === 'string' && record.brandProfileId.trim()
      ? record.brandProfileId.trim().slice(0, 128)
      : null;
  return {
    length: oneOf(POST_LENGTH_PRESETS, record.length),
    /*
      Kept as stored: an old «до N» is read as today's density by whoever
      uses it — the directive and the checks (`emoji-ceiling.ts`, `97dq.96`).
    */
    emoji: isStoredEmojiLevel(record.emoji) ? record.emoji : 'channel',
    hashtags: oneOf(POST_HASHTAG_POLICIES, record.hashtags),
    links: oneOf(POST_LINK_POLICIES, record.links),
    cta: oneOf(POST_CTA_KINDS, record.cta),
    brandProfileId: brand,
    wish: typeof record.wish === 'string' ? record.wish.slice(0, POST_WISH_MAX) : '',
    link: readPostLinkOverride(record.link),
    linkText: normalizePostLinkText(record.linkText),
  };
}

/** The settings of one (piece, channel) from the piece's `tags`; none — `null`. */
export function postSettingsOf(
  tags: unknown,
  integrationId: string
): PiecePostSettingsV1 | null {
  const all = asRecord(asRecord(tags)[POST_SETTINGS_TAG]);
  if (!Object.prototype.hasOwnProperty.call(all, integrationId)) return null;
  const entry = asRecord(all[integrationId]);
  return {
    options: readPostSettingsOptions(entry.options),
    planMode: isPlanMode(entry.planMode) ? entry.planMode : null,
    savedAt: isoOrNull(entry.savedAt),
    textChangedAt: isoOrNull(entry.textChangedAt),
  };
}

/**
 * The post's own plan mode, if it has one: the same reader the calendar
 * filter uses (`tagPlanModeOf`), so the pieces page and the calendar agree.
 */
export const postPlanModeOf: (tags: unknown, integrationId: string) => PlanModeV1 | null =
  tagPlanModeOf;

/** The mode that decides for this post: its own, else the channel's (I2 default). */
export const effectivePlanMode = (
  channelMode: unknown,
  tags: unknown,
  integrationId: string
): PlanModeV1 => postPlanModeOf(tags, integrationId) ?? planModeOf(channelMode);

/**
 * The post's own emoji level, when it has one (review P3-6 of `97dq.83`): the
 * adapt request's override, else the stored «Для этого поста», else nothing
 * (the channel card decides). The write path's directive and checks and the
 * detail/edit/review checks all read the level through this one function, so
 * a text is judged against the same ceiling it was written to.
 */
export const postEmojiLevelOf = (
  override: unknown,
  tags: unknown,
  integrationId: string
): StoredEmojiLevel | undefined => {
  if (isStoredEmojiLevel(override)) return override;
  const own = postSettingsOf(tags, integrationId)?.options.emoji;
  return own && own !== 'channel' ? own : undefined;
};

/** The level that decides for this post: its own, else the channel card's. */
export const effectiveEmojiLevel = (
  override: unknown,
  tags: unknown,
  integrationId: string,
  channelLevel: string | null | undefined
): string | undefined =>
  postEmojiLevelOf(override, tags, integrationId) ?? (channelLevel || undefined);

/** Fields whose change needs a rewrite to show in the text. */
const TEXT_FIELDS: readonly (keyof PostSettingsOptionsV1)[] = [
  'length',
  'emoji',
  'hashtags',
  'links',
  'cta',
  'brandProfileId',
  'wish',
  'link',
  'linkText',
];

export const textSettingsDiffer = (
  before: PostSettingsOptionsV1,
  after: PostSettingsOptionsV1
): boolean => TEXT_FIELDS.some((field) => before[field] !== after[field]);

/**
 * `tags` with this post's settings written in, every other key kept. An entry
 * that says nothing (all «как в канале», no mode) is removed rather than kept
 * as noise.
 */
export function withPostSettings(
  tags: unknown,
  integrationId: string,
  settings: PiecePostSettingsV1
): Record<string, unknown> {
  const bag = { ...asRecord(tags) };
  const all = { ...asRecord(bag[POST_SETTINGS_TAG]) };
  const empty =
    !settings.planMode &&
    !textSettingsDiffer(DEFAULT_POST_SETTINGS_OPTIONS, settings.options);
  if (empty) delete all[integrationId];
  else
    all[integrationId] = {
      options: settings.options,
      planMode: settings.planMode,
      savedAt: settings.savedAt,
      textChangedAt: settings.textChangedAt,
    };
  if (Object.keys(all).length) bag[POST_SETTINGS_TAG] = all;
  else delete bag[POST_SETTINGS_TAG];
  return bag;
}

/** What a request sends: only these fields are written (`97dq.70` review P1). */
export type PostSettingsPatchV1 = {
  options?: Partial<PostSettingsOptionsV1>;
  /** `null` — back to «как в канале»; absent — not touched. */
  planMode?: PlanModeV1 | null;
};

/**
 * The next settings of one post from the stored ones and a patch: options
 * merge field by field, the plan mode is replaced only when sent. Called
 * under the piece row lock, so a stale options autosave never reverts a plan
 * mode and two channels never drop each other.
 */
export function mergePostSettings(
  stored: PiecePostSettingsV1 | null,
  patch: PostSettingsPatchV1,
  now: string
): PiecePostSettingsV1 {
  const before = stored?.options ?? DEFAULT_POST_SETTINGS_OPTIONS;
  const options = patch.options
    ? readPostSettingsOptions({ ...before, ...patch.options })
    : before;
  const planMode =
    patch.planMode === undefined
      ? stored?.planMode ?? null
      : isPlanMode(patch.planMode)
      ? patch.planMode
      : null;
  return {
    options,
    planMode,
    savedAt: now,
    textChangedAt: textSettingsDiffer(before, options)
      ? now
      : stored?.textChangedAt ?? null,
  };
}

/**
 * Whether a mode would change this slot holder — the one predicate behind
 * «Ко всем N» and its count. A queue a person confirmed is theirs and is not
 * counted; a post already in the mode is not counted either.
 */
export function planWouldChange(
  holder: { plan?: string | null; state?: string | null } | null | undefined,
  mode: PlanModeV1
): boolean {
  if (!holder) return false;
  const state = String(holder.state || '').toUpperCase();
  if (state === 'QUEUE' || state === 'QUEUED')
    return mode !== 'autopilot' && holder.plan === 'autopilot';
  if (state !== 'DRAFT') return false;
  if (mode === 'autopilot') return true;
  // A draft placed before plan modes existed has no `plan`: it is a plain
  // draft, so «Без плана» does not change it (second review, item 5).
  return (holder.plan ?? 'draft') !== mode;
}
