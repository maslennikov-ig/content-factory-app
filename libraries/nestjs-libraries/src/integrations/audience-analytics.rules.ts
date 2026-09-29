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
const NINETY_DAYS = ['facebook', 'linkedin-page', 'pinterest', 'youtube', 'x', 'gmb'];

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

/**
 * The number a metric card shows: the sum of its points, or for a rate
 * (`average`) their mean, as a percentage with two decimals.
 */
export const audienceMetricValue = (metric: {
  data: readonly { total: number | string }[];
  average?: boolean;
}): number | string => {
  const total = metric.data.reduce((sum, point) => sum + Number(point.total || 0), 0);
  return metric.average && metric.data.length
    ? `${(total / metric.data.length).toFixed(2)}%`
    : total;
};
