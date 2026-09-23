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
 * The plan ahead (`content-factory-next-97dq.59`; counts since `97dq.73`)
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

/**
 * Counts that sit beside the streak (`97dq.73`, thirteenth walk C3). The owner
 * could not read «0 дней впереди»; he asked how many posts are planned and how
 * far the plan reaches. `reserved` — a draft held in a slot («в плане»),
 * `queued` — a post that goes out by itself («в очереди»), both from today on.
 */
export type PlanAheadCounts = {
  reserved: number;
  queued: number;
  /** `reserved + queued`. */
  planned: number;
  /** `YYYY-MM-DD` of the last reserved or queued post; `null` when none. */
  planUntil: string | null;
  /** Published in the last 7 days, today included. */
  published7d: number;
};

export type PlanAheadDay = {
  date: string;
  /** Holds a post (the streak rule): planned, queued, or published today. */
  filled: boolean;
  reserved: number;
  queued: number;
  /** Published that day; only today can have any. */
  published: number;
};

/**
 * `plan-ahead/v2`: v1 plus the counts. The v1 names keep their meaning —
 * `emptyFrom` is the first empty day, `days`/`until` the unbroken run — so a
 * reader of v1 fields reads the same numbers.
 */
export type PlanAheadV2 = PlanAheadStreak &
  PlanAheadCounts & {
    version: 'plan-ahead/v2';
    /** `YYYY-MM-DD` in `timeZone`. */
    today: string;
    timeZone: string;
    /** How far the count looks; a run this long is reported as this long. */
    horizon: number;
    /** How many of the `strip` days hold a post. */
    daysWithPosts: number;
    /** The next `STRIP_DAYS` days, today first. */
    strip: PlanAheadDay[];
    channels: Array<
      PlanAheadStreak & PlanAheadCounts & { integrationId: string; name: string }
    >;
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

/** Which count a post adds to, if any, on its day. */
export const planAheadKind = (
  post: PlanAheadPost
): 'reserved' | 'queued' | 'published' | null => {
  const state = String(post.state || '').toUpperCase();
  if (state === 'QUEUE') return 'queued';
  if (state === 'DRAFT')
    return post.plan === 'reserve' || post.plan === 'autopilot' ? 'reserved' : null;
  if (state === 'PUBLISHED') return 'published';
  return null;
};

type Tally = {
  filled: Set<string>;
  reserved: number;
  queued: number;
  planUntil: string | null;
  published7d: number;
  perDay: Map<string, { reserved: number; queued: number; published: number }>;
};

const emptyTally = (): Tally => ({
  filled: new Set(),
  reserved: 0,
  queued: 0,
  planUntil: null,
  published7d: 0,
  perDay: new Map(),
});

const countsOf = (tally: Tally): PlanAheadCounts => ({
  reserved: tally.reserved,
  queued: tally.queued,
  planned: tally.reserved + tally.queued,
  planUntil: tally.planUntil,
  published7d: tally.published7d,
});

/**
 * The plan ahead: how many posts are planned or queued, how far the plan
 * reaches, the first empty day, and the unbroken run of covered days.
 *
 * Counted in the reader's zone: a 00:30 Moscow post is 21:30 UTC of the day
 * before, and a UTC count would move it. Per channel for the table and the
 * hover list, and for the selection as a whole — a day is covered when any
 * selected channel holds a post on it.
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
}): PlanAheadV2 => {
  const zone = planAheadTimeZone(timeZone);
  const today = dayKeyIn(now, zone);
  const weekStart = addDayKey(today, -6);
  const all = emptyTally();
  const byChannel = new Map<string, Tally>();
  for (const post of posts) {
    const day = dayKeyIn(new Date(post.publishDate), zone);
    const kind = planAheadKind(post);
    if (!kind) continue;
    const tallies = [all];
    if (!byChannel.has(post.integrationId)) {
      byChannel.set(post.integrationId, emptyTally());
    }
    tallies.push(byChannel.get(post.integrationId)!);
    for (const tally of tallies) {
      if (kind === 'published') {
        if (day >= weekStart && day <= today) tally.published7d += 1;
      } else if (day >= today) {
        // Uncapped: the horizon bounds only the streak, not the counts.
        tally[kind] += 1;
        if (!tally.planUntil || day > tally.planUntil) tally.planUntil = day;
      }
      if (day < today || !holdsPlanDay(post, today, day)) continue;
      tally.filled.add(day);
      const counts = tally.perDay.get(day) ?? {
        reserved: 0,
        queued: 0,
        published: 0,
      };
      counts[kind] += 1;
      tally.perDay.set(day, counts);
    }
  }
  const strip = Array.from({ length: stripDays }, (_, index) => {
    const date = addDayKey(today, index);
    const counts = all.perDay.get(date);
    return {
      date,
      filled: all.filled.has(date),
      reserved: counts?.reserved ?? 0,
      queued: counts?.queued ?? 0,
      published: counts?.published ?? 0,
    };
  });
  return {
    version: 'plan-ahead/v2',
    today,
    timeZone: zone,
    horizon,
    ...streakOf(all.filled, today, horizon),
    ...countsOf(all),
    daysWithPosts: strip.filter((day) => day.filled).length,
    strip,
    channels: channels.map((channel) => {
      const tally = byChannel.get(channel.id) ?? emptyTally();
      return {
        integrationId: channel.id,
        name: channel.name,
        ...streakOf(tally.filled, today, horizon),
        ...countsOf(tally),
      };
    }),
  };
};
