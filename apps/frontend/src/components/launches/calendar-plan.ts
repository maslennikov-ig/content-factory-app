/**
 * Many channels at one time (`content-factory-next-97dq.59`, canvas C2 A,
 * owner pick 23.09.2026).
 *
 * A time in the day is a group: «N каналов» and their marks above, then one
 * row per channel post — mark, name, state, the start of the text, the piece
 * code. The week draws one card per time and the month the marks and times.
 * Everything here is pure, so the grouping and the collapse can be read and
 * tested without a calendar around them.
 */

export type PlanState = 'reserved' | 'queued' | 'draft' | 'published' | 'error';

/** The four a person sees in the legend; `error` has its own red mark. */
export const PLAN_STATES_IN_LEGEND: readonly PlanState[] = [
  'reserved',
  'queued',
  'draft',
  'published',
];

const BY_POST_STATE: Record<string, PlanState> = {
  PUBLISHED: 'published',
  ERROR: 'error',
  QUEUE: 'queued',
};

/**
 * The state word of one calendar row. A DRAFT placed with the channel's
 * «Бронь» or «Автопилот» (`97dq.57`; autopilot falls back to a reserve when
 * the platform refuses) holds its time — «в плане»; any other draft is a
 * draft.
 */
export const planStateOf = (post: {
  state?: string | null;
  plan?: string | null;
}): PlanState => {
  const known = BY_POST_STATE[String(post?.state || '').toUpperCase()];
  if (known) return known;
  return post?.plan === 'reserve' || post?.plan === 'autopilot'
    ? 'reserved'
    : 'draft';
};

/** A queued post the channel's autopilot put there. */
export const isAutopilot = (post: { state?: string | null; plan?: string | null }) =>
  planStateOf(post) === 'queued' && post?.plan === 'autopilot';

/** Rows a day group shows before «ещё N». */
export const DAY_GROUP_LIMIT = 5;

export function collapseRows<T>(
  rows: readonly T[],
  expanded: boolean,
  limit = DAY_GROUP_LIMIT
): { shown: T[]; hidden: number; collapsible: boolean } {
  const collapsible = rows.length > limit;
  return {
    shown: collapsible && !expanded ? rows.slice(0, limit) : [...rows],
    hidden: collapsible && !expanded ? rows.length - limit : 0,
    collapsible,
  };
}

export type RowChannel = { id: string; name: string; picture?: string | null };

type RowLike = {
  id?: string;
  integration?: { id?: string; name?: string; picture?: string | null } | null;
};

/** Each channel once, in the order its first row came. */
export const channelsOf = (rows: readonly RowLike[]): RowChannel[] => {
  const seen = new Map<string, RowChannel>();
  for (const row of rows) {
    const id = row?.integration?.id;
    if (!id || seen.has(id)) continue;
    seen.set(id, {
      id,
      name: row.integration?.name || '',
      picture: row.integration?.picture ?? null,
    });
  }
  return [...seen.values()];
};

/** Channels whose schedule holds this time and that have no post at it yet. */
export const freeChannelsAt = <T extends { id: string }>(
  owners: readonly T[],
  rows: readonly RowLike[]
): T[] => {
  const busy = new Set(channelsOf(rows).map((channel) => channel.id));
  return owners.filter((owner) => !busy.has(owner.id));
};

/**
 * Rows of one cell split by their exact time (`HH:mm`), earliest first. The
 * week's hour cell holds several times; each becomes one card.
 */
export function groupRowsByTime<T>(
  rows: readonly T[],
  timeOf: (row: T) => string
): Array<{ time: string; rows: T[] }> {
  const bucket = new Map<string, T[]>();
  for (const row of rows) {
    const time = timeOf(row);
    if (!bucket.has(time)) bucket.set(time, []);
    bucket.get(time)!.push(row);
  }
  return [...bucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, list]) => ({ time, rows: list }));
}

/** Distinct `HH:mm` of a month cell, earliest first. */
export const timesOf = <T>(rows: readonly T[], timeOf: (row: T) => string) =>
  [...new Set(rows.map(timeOf))].sort();
