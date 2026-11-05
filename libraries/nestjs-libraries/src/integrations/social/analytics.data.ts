import type { AnalyticsData } from './social.integrations.interface';

/** Missing, redacted and malformed values are not measured zeroes. */
export function analyticsNumber(value: unknown): number | null {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || value.trim() === '')
  )
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A total is unavailable if any item contributing to it is unavailable. */
export function completeAnalyticsSum(values: unknown[]): number | null {
  if (!values.length) return null;
  const parsed = values.map(analyticsNumber);
  if (parsed.some((value) => value === null)) return null;
  const total = (parsed as number[]).reduce((sum, value) => sum + value, 0);
  return Number.isFinite(total) ? total : null;
}

export function normalizeAnalytics(
  series: Array<{
    label: string;
    data?: Array<{ total: unknown; date: string }>;
    percentageChange?: number | null;
    average?: boolean;
  }>
): AnalyticsData[] {
  return series.flatMap((metric) => {
    const data = (metric.data || []).flatMap((point) => {
      const total = analyticsNumber(point.total);
      return total === null ? [] : [{ ...point, total: String(total) }];
    });
    return data.length
      ? [
          {
            ...metric,
            data,
            percentageChange: analyticsNumber(metric.percentageChange),
          },
        ]
      : [];
  });
}
