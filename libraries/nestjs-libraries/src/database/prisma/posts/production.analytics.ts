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
