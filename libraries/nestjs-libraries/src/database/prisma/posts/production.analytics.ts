export type ProductionAnalyticsPost = {
  state: string;
  creationMethod: string;
  createdAt: Date;
  publishDate: Date;
  error: string | null;
  errors: Array<{ message: string }>;
};

const roundOne = (value: number) => Math.round(value * 10) / 10;

const failureReason = (post: ProductionAnalyticsPost) => {
  const raw = post.error || post.errors[0]?.message || 'unknown';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim().slice(0, 160);
    }
  } catch {}
  return raw.trim().slice(0, 160) || 'unknown';
};

export const productionAnalyticsWindow = (days: number, now = new Date()) => {
  const to = new Date(now);
  const from = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) -
      (days - 1) * 24 * 60 * 60 * 1000
  );
  return { from, to };
};

export const calculateProductionAnalytics = (
  posts: ProductionAnalyticsPost[]
) => {
  const attempted = posts.filter(
    (post) => post.state === 'PUBLISHED' || post.state === 'ERROR'
  );
  const published = attempted.filter((post) => post.state === 'PUBLISHED');
  const failed = attempted.filter((post) => post.state === 'ERROR');
  const attempts = published.length + failed.length;
  // From drafting to the slot the post was published into, not to the last
  // edit: `updatedAt` moves every time someone corrects a published post,
  // which reported the correction as the time it took to publish. `publishDate`
  // is the scheduled slot rather than the moment of delivery, so a post
  // planned far ahead still reports that whole wait — stable and explainable,
  // which `updatedAt` was not.
  const leadTimeHours = published.map(
    (post) =>
      Math.max(0, post.publishDate.getTime() - post.createdAt.getTime()) /
      (60 * 60 * 1000)
  );

  const origins = new Map<string, number>();
  for (const post of attempted) {
    origins.set(
      post.creationMethod,
      (origins.get(post.creationMethod) || 0) + 1
    );
  }

  const reasons = new Map<string, number>();
  for (const post of failed) {
    const reason = failureReason(post);
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }

  return {
    summary: {
      publishedVolume: published.length,
      failureCount: failed.length,
      failureRate: attempts ? roundOne((failed.length / attempts) * 100) : 0,
      averageLeadTimeHours: leadTimeHours.length
        ? roundOne(
            leadTimeHours.reduce((total, value) => total + value, 0) /
              leadTimeHours.length
          )
        : 0,
    },
    originMix: [...origins.entries()]
      .map(([origin, count]) => ({
        origin,
        count,
        percentage: attempts ? roundOne((count / attempts) * 100) : 0,
      }))
      .sort((left, right) => left.origin.localeCompare(right.origin)),
    failureReasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.reason.localeCompare(right.reason)
      ),
  };
};

/* -------------------------------------------------------------------------
 * «Впереди N дней» (`content-factory-next-97dq.59`, owner pick 23.09.2026)
 * ---------------------------------------------------------------------- */

/**
 * One post as the plan-ahead count reads it. `plan` is the channel plan mode
 * the version was placed with (`97dq.57`): a DRAFT with `reserve` or
 * `autopilot` is a held time — «в плане».
 */
export type PlanAheadPost = {
  integrationId: string;
  publishDate: Date;
  state: string;
  plan: string | null;
};

export type PlanAheadChannel = { id: string; name: string };

export type PlanAheadStreak = {
  /** Consecutive days from today, today included, each holding a post. */
  days: number;
  /** `YYYY-MM-DD` — the last day of the run; `null` when there is none. */
  until: string | null;
  /** `YYYY-MM-DD` — the first day without a post (today when `days` is 0). */
  emptyFrom: string;
};

export type PlanAheadV1 = PlanAheadStreak & {
  version: 'plan-ahead/v1';
  /** `YYYY-MM-DD` in `timeZone`. */
  today: string;
  timeZone: string;
  /** How far the count looks; a run this long is reported as this long. */
  horizon: number;
  /** The next `STRIP_DAYS` days, today first: does the day hold a post? */
  strip: Array<{ date: string; filled: boolean }>;
  channels: Array<PlanAheadStreak & { integrationId: string; name: string }>;
};

export const PLAN_AHEAD_HORIZON_DAYS = 60;
export const PLAN_AHEAD_STRIP_DAYS = 14;

/** An IANA zone the runtime knows, else UTC — a bad query is not a 500. */
export const planAheadTimeZone = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 64) {
    return 'UTC';
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value.trim() });
    return value.trim();
  } catch {
    return 'UTC';
  }
};

/** `YYYY-MM-DD` of a moment in a zone. */
export const dayKeyIn = (at: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: string) =>
    parts.find((one) => one.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

/** A calendar day `offset` days after `key`; calendar arithmetic, no zone. */
export const addDayKey = (key: string, offset: number): string => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset))
    .toISOString()
    .slice(0, 10);
};

/**
 * Does this post hold its day? A queued post or a reserved draft does. A
 * published post holds only today — the day it covered is not «ahead», but
 * the evening after this morning's post is not an empty day either. An error
 * or an unplanned draft holds nothing: neither will go out by itself.
 */
export const holdsPlanDay = (post: PlanAheadPost, today: string, day: string) => {
  const state = String(post.state || '').toUpperCase();
  if (state === 'QUEUE') return true;
  if (state === 'DRAFT') return post.plan === 'reserve' || post.plan === 'autopilot';
  if (state === 'PUBLISHED') return day === today;
  return false;
};

const streakOf = (
  filled: ReadonlySet<string>,
  today: string,
  horizon: number
): PlanAheadStreak => {
  let days = 0;
  while (days < horizon && filled.has(addDayKey(today, days))) days += 1;
  return {
    days,
    until: days ? addDayKey(today, days - 1) : null,
    emptyFrom: addDayKey(today, days),
  };
};

/**
 * How many days ahead the plan is covered, without a gap, starting today.
 *
 * Counted in the reader's zone: a 00:30 Moscow post is 21:30 UTC of the day
 * before, and a UTC count would move it. Per channel for the hover list, and
 * for the selection as a whole — a day is covered when any selected channel
 * holds a post on it.
 */
export const calculatePlanAhead = ({
  posts,
  channels,
  now,
  timeZone,
  horizon = PLAN_AHEAD_HORIZON_DAYS,
  stripDays = PLAN_AHEAD_STRIP_DAYS,
}: {
  posts: readonly PlanAheadPost[];
  channels: readonly PlanAheadChannel[];
  now: Date;
  timeZone: string;
  horizon?: number;
  stripDays?: number;
}): PlanAheadV1 => {
  const zone = planAheadTimeZone(timeZone);
  const today = dayKeyIn(now, zone);
  const all = new Set<string>();
  const byChannel = new Map<string, Set<string>>();
  for (const post of posts) {
    const day = dayKeyIn(new Date(post.publishDate), zone);
    if (day < today || !holdsPlanDay(post, today, day)) continue;
    all.add(day);
    if (!byChannel.has(post.integrationId)) {
      byChannel.set(post.integrationId, new Set());
    }
    byChannel.get(post.integrationId)!.add(day);
  }
  return {
    version: 'plan-ahead/v1',
    today,
    timeZone: zone,
    horizon,
    ...streakOf(all, today, horizon),
    strip: Array.from({ length: stripDays }, (_, index) => {
      const date = addDayKey(today, index);
      return { date, filled: all.has(date) };
    }),
    channels: channels.map((channel) => ({
      integrationId: channel.id,
      name: channel.name,
      ...streakOf(byChannel.get(channel.id) ?? new Set(), today, horizon),
    })),
  };
};
