import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { ChartSocial } from '@contentfactory/frontend/components/analytics/chart-social';
import { Select } from '@contentfactory/react/form/select';
import { MissingReleaseModal } from '@contentfactory/frontend/components/launches/missing-release.modal';
import { statisticsEmptyState } from '@contentfactory/frontend/components/launches/statistics.empty.state';
import {
  EmptyState,
  RestrictedState,
  SkeletonRows,
} from '@contentfactory/frontend/components/ui/surface';
import {
  Section,
  Table,
  Td,
  Th,
  Tr,
} from '@contentfactory/frontend/components/ui/table';

interface AnalyticsData {
  label: string;
  data: Array<{ total: number; date: string }>;
  percentageChange: number;
  average?: boolean;
}

export const StatisticsModal: FC<{
  postId: string;
}> = (props) => {
  const { postId } = props;
  const t = useT();
  const fetch = useFetch();
  const [dateRange, setDateRange] = useState(7);

  const loadStatistics = useCallback(async () => {
    return (await fetch(`/posts/${postId}/statistics`)).json();
  }, [postId, fetch]);

  const loadPostAnalytics = useCallback(async () => {
    return (await fetch(`/analytics/post/${postId}?date=${dateRange}`)).json();
  }, [postId, dateRange, fetch]);

  const { data: statisticsData, isLoading: isLoadingStatistics } = useSWR(
    `/posts/${postId}/statistics`,
    loadStatistics
  );

  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
    mutate: mutateAnalytics,
  } = useSWR(`/analytics/post/${postId}?date=${dateRange}`, loadPostAnalytics, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });

  const isMissing =
    analyticsData && !Array.isArray(analyticsData) && analyticsData.missing;

  const dateOptions = useMemo(() => {
    return [
      { key: 7, value: t('7_days', '7 Days') },
      { key: 30, value: t('30_days', '30 Days') },
      { key: 90, value: t('90_days', '90 Days') },
    ];
  }, [t]);

  const totals = useMemo(() => {
    if (!analyticsData || !Array.isArray(analyticsData)) return [];
    return analyticsData.map((p: AnalyticsData) => {
      const value =
        (p?.data?.reduce(
          (acc: number, curr: any) => acc + Number(curr.total),
          0
        ) || 0) / (p.average ? p.data.length : 1);
      if (p.average) {
        return value.toFixed(2) + '%';
      }
      return Math.round(value);
    });
  }, [analyticsData]);

  const isLoading = isLoadingStatistics || isLoadingAnalytics;
  const emptyState = statisticsEmptyState({
    hasPostAnalytics: statisticsData?.hasPostAnalytics,
    clicks: statisticsData?.clicks,
  });

  return (
    <div className="relative min-h-[200px]">
      {isLoading ? (
        <SkeletonRows rows={4} label={t('loading', 'Loading')} />
      ) : isMissing ? (
        <MissingReleaseModal
          postId={postId}
          onSuccess={() => mutateAnalytics()}
        />
      ) : (
        <div className="flex flex-col gap-[24px]">
          {statisticsData?.hasPostAnalytics === false && (
            <RestrictedState
              title={
                statisticsData?.telegram
                  ? t(
                      'telegram_post_analytics_limited',
                      'Telegram does not provide views or forwards through the Bot API.'
                    )
                  : t(
                      'platform_post_analytics_unavailable',
                      'This channel does not provide per-post analytics.'
                    )
              }
              reason={
                statisticsData?.telegram
                  ? t(
                      'telegram_engagement_collected_from_updates',
                      'Reactions and linked discussion comments are collected from Bot API updates.'
                    )
                  : t(
                      'enable_short_links_for_clicks',
                      'Enable a short-link provider to measure link clicks from posts on this channel.'
                    )
              }
            />
          )}
          {statisticsData?.telegram && (
            <Section title={t('telegram_engagement', 'Telegram Engagement')}>
              <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
                <div className="rounded-[12px] border border-cf-border bg-cf-surface p-[16px]">
                  <div className="text-[13px] text-cf-ink-muted">
                    {t('telegram_reactions', 'Reactions')}
                  </div>
                  <div className="mt-[4px] text-[30px] font-[600] text-cf-ink">
                    {statisticsData.telegram.reactions}
                  </div>
                </div>
                <div className="rounded-[12px] border border-cf-border bg-cf-surface p-[16px]">
                  <div className="text-[13px] text-cf-ink-muted">
                    {t('telegram_comments', 'Discussion comments')}
                  </div>
                  <div className="mt-[4px] text-[30px] font-[600] text-cf-ink">
                    {statisticsData.telegram.comments}
                  </div>
                </div>
              </div>
            </Section>
          )}
          {/* Post Analytics Section */}
          {analyticsData &&
            Array.isArray(analyticsData) &&
            analyticsData.length > 0 && (
              <div className="flex flex-col gap-[14px]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[18px] font-[500]">
                    {t('post_analytics', 'Post Analytics')}
                  </h3>
                  <div className="max-w-[150px]">
                    <Select
                      label=""
                      name="date"
                      disableForm={true}
                      hideErrors={true}
                      value={dateRange}
                      onChange={(e) => setDateRange(+e.target.value)}
                    >
                      {dateOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.value}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[16px]">
                  {analyticsData.map((p: AnalyticsData, index: number) => {
                    const chartColors = ['purple', 'green', 'blue'] as const;
                    const markerTones = [
                      'bg-cf-signature',
                      'bg-cf-accent',
                      'bg-cf-info',
                    ] as const;
                    const color = chartColors[index % chartColors.length];
                    const markerTone = markerTones[index % markerTones.length];
                    return (
                      <div key={`analytics-${index}`} className="group">
                        <div className="flex flex-col h-full bg-newTableHeader border border-newTableBorder rounded-[12px] overflow-hidden transition-all duration-200 hover:border-cf-accent">
                          <div className="flex items-center justify-between px-[16px] pt-[14px] pb-[8px]">
                            <div className="flex items-center gap-[10px]">
                              <div
                                className={`w-[8px] h-[8px] rounded-full ${markerTone}`}
                              />
                              <span className="text-[15px] font-medium text-newTableText">
                                {p.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 px-[12px] py-[8px]">
                            <div className="h-[120px] relative">
                              <ChartSocial
                                data={p.data}
                                color={color}
                                key={`chart-${index}`}
                              />
                            </div>
                          </div>
                          <div className="px-[16px] pb-[14px]">
                            <div className="text-[36px] leading-[42px] font-semibold tracking-tight">
                              {totals[index]}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Short Links Statistics Section */}
          <Section
            title={t('short_links_statistics', 'Short Links Statistics')}
          >
            {statisticsData?.clicks?.length === 0 ? (
              <EmptyState
                title={t('no_short_link_results', 'No short link results')}
                description={t(
                  'enable_short_links_for_clicks',
                  'Enable a short-link provider to measure link clicks from posts on this channel.'
                )}
              />
            ) : (
              <Table
                caption={t('short_links_statistics', 'Short Links Statistics')}
              >
                <thead>
                  <Tr>
                    <Th>{t('short_link', 'Short Link')}</Th>
                    <Th>{t('original_link', 'Original Link')}</Th>
                    <Th numeric>{t('clicks', 'Clicks')}</Th>
                  </Tr>
                </thead>
                <tbody>
                  {statisticsData?.clicks?.map((p: any) => (
                    <Tr key={p.short}>
                      <Td>{p.short}</Td>
                      <Td>{p.original}</Td>
                      <Td numeric>{p.clicks}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Section>

          {/* No analytics available message */}
          {emptyState === 'no-data' &&
            (!analyticsData ||
              !Array.isArray(analyticsData) ||
              analyticsData.length === 0) && (
              <EmptyState
                title={t(
                  'no_statistics_available',
                  'No statistics available for this post'
                )}
              />
            )}
        </div>
      )}
    </div>
  );
};
