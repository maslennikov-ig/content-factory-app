export type AnalyticsSeries = {
  label: string;
  data: Array<{ total: string; date: string }>;
  percentageChange: number;
  average?: boolean;
};

export type StoredAnalyticsSnapshot = {
  metric: string;
  value: number;
  bucket: Date;
};

export const utcAnalyticsDay = (date = new Date()) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Growth from nothing has no defined percentage. The missing base is read as
 * one unit, so 0 -> 1 is +100% and 0 -> 5 is +500%; a flat 100 would report the
 * same figure for every gain, however large. The result is capped because the
 * first snapshot of an existing channel starts from zero by construction, and
 * an uncapped ratio would print "+1200000%" next to a perfectly ordinary
 * audience.
 */
const MAXIMUM_PERCENTAGE_CHANGE = 9_999;

const percentageChange = (first: number, last: number) => {
  if (first === 0) {
    return last === 0 ? 0 : Math.min(last * 100, MAXIMUM_PERCENTAGE_CHANGE);
  }
  return (
    Math.round(
      (((last - first) / Math.abs(first)) * 100 + Number.EPSILON) * 100
    ) / 100
  );
};

export function mergeAnalyticsSnapshots(
  live: AnalyticsSeries[],
  snapshots: StoredAnalyticsSnapshot[],
  days: number,
  now = new Date()
): AnalyticsSeries[] {
  const end = utcAnalyticsDay(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days) + 1);

  const snapshotsByMetric = new Map<string, Map<string, number>>();
  for (const snapshot of snapshots) {
    const bucket = utcAnalyticsDay(snapshot.bucket);
    if (bucket < start || bucket > end) continue;
    const values = snapshotsByMetric.get(snapshot.metric) || new Map();
    values.set(dateKey(bucket), snapshot.value);
    snapshotsByMetric.set(snapshot.metric, values);
  }

  const liveByMetric = new Map(live.map((series) => [series.label, series]));
  const metrics = new Set([
    ...liveByMetric.keys(),
    ...snapshotsByMetric.keys(),
  ]);

  return [...metrics].map((metric) => {
    const liveSeries = liveByMetric.get(metric);
    const stored = snapshotsByMetric.get(metric);
    if (!stored?.size) {
      return liveSeries!;
    }

    const values = new Map(stored);
    // A provider that answers with a date this code cannot read is a provider
    // bug. It is counted rather than merged: a point with no usable date has
    // no place on a time axis, and passing it through would put a literal
    // "Invalid Date" at the edge of the chart and fold its total into the
    // headline figure. Excluding it also keeps it from becoming the first or
    // last value the percentage is measured between.
    for (const point of liveSeries?.data || []) {
      const parsed = new Date(`${point.date}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) {
        continue;
      }

      const pointDate = utcAnalyticsDay(parsed);
      if (pointDate >= start && pointDate <= end) {
        values.set(dateKey(pointDate), Number(point.total) || 0);
      }
    }

    const data = [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, total]) => ({ date, total: String(total) }));
    const first = Number(data[0]?.total) || 0;
    const last = Number(data[data.length - 1]?.total) || 0;

    return {
      ...(liveSeries?.average ? { average: true } : {}),
      label: metric,
      percentageChange: data.length > 1 ? percentageChange(first, last) : 0,
      data,
    };
  });
}
