/**
 * «Аналитика» of a channel's audience — which channels have it, for which
 * periods, and the one number a metric shows (`kcxz.24`).
 *
 * Import-free on purpose: the analytics screen (`platform.analytics.tsx`,
 * `audience.analytics.view.tsx`) and the chat's `analytics.channel` read one
 * rule. They used to be the screen's own lines; a second copy in the chat
 * would have drifted the first time a platform gained a longer period.
 */

/** Platforms whose provider answers audience analytics. */
export const AUDIENCE_ANALYTICS_PLATFORMS = [
  'facebook',
  'instagram',
  'instagram-standalone',
  'linkedin-page',
  'tiktok',
  'youtube',
  'gmb',
  'pinterest',
  'telegram',
  'threads',
  'x',
] as const;

/** Platforms that also answer 90 days. */
const NINETY_DAYS = [
  'facebook',
  'linkedin-page',
  'pinterest',
  'youtube',
  'x',
  'gmb',
];

/**
 * Whether a channel of this platform shows audience analytics. X can be
 * switched off by the server (`DISABLE_X_ANALYTICS`).
 */
export const hasAudienceAnalytics = (
  platform: string,
  options: { disableX?: boolean } = {}
): boolean =>
  (AUDIENCE_ANALYTICS_PLATFORMS as readonly string[]).includes(platform) &&
  !(platform === 'x' && options.disableX);

/** The periods, in days, a platform answers: 7 always, 30 but Telegram, 90 for some. */
export const audiencePeriodsOf = (platform: string): number[] => {
  const periods = [7];
  if (platform !== 'telegram') periods.push(30);
  if (NINETY_DAYS.includes(platform)) periods.push(90);
  return periods;
};

// Exact labels emitted by Telegram's audience snapshot and TikTok's current
// account/video counters. Daily follower gains (LinkedIn Organic/Paid Followers,
// YouTube Subscribers Gained/Lost) are not stocks.
const SNAPSHOT_METRICS = new Set([
  'Subscribers',
  'Followers',
  'Following',
  'Total Likes',
  'Videos',
  'Recent Views',
  'Recent Likes',
  'Recent Comments',
  'Recent Shares',
]);

export const audienceMetricAggregation = (metric: {
  label: string;
  average?: boolean;
}): 'latest' | 'mean' | 'sum' =>
  SNAPSHOT_METRICS.has(metric.label)
    ? 'latest'
    : metric.average
    ? 'mean'
    : 'sum';

/** Last observed stock, summed flows, or the mean of observed average points. */
export const audienceMetricValue = (metric: {
  label: string;
  data: readonly { total: number | string; date?: string }[];
  average?: boolean;
}): number | string | null => {
  const points = metric.data.flatMap((point) => {
    if (
      typeof point.total !== 'number' &&
      (typeof point.total !== 'string' || point.total.trim() === '')
    )
      return [];
    const total = Number(point.total);
    return Number.isFinite(total) ? [{ ...point, total }] : [];
  });
  if (!points.length) return null;

  const aggregation = audienceMetricAggregation(metric);
  if (aggregation === 'latest') {
    const dated = points.filter((point) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date || '')) return false;
      const parsed = new Date(`${point.date}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === point.date
      );
    });
    return dated.length
      ? dated.reduce((last, point) => (point.date >= last.date ? point : last))
          .total
      : null;
  }

  const total = points.reduce((sum, point) => sum + point.total, 0);
  if (!Number.isFinite(total)) return null;
  if (aggregation === 'sum') return total;
  const mean = total / points.length;
  // `average` describes aggregation, not a unit. YouTube's duration is seconds;
  // only its explicitly named percentage metric has a confirmed percent unit.
  // https://developers.google.com/youtube/analytics/metrics#averageViewPercentage
  return metric.label === 'Average View Percentage'
    ? `${mean.toFixed(2)}%`
    : mean;
};
