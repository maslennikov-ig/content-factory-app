export const statisticsEmptyState = (data: {
  hasPostAnalytics?: boolean;
  clicks?: unknown[];
}) => {
  if (data.clicks?.length) return null;
  return data.hasPostAnalytics === false ? 'platform-unavailable' : 'no-data';
};
