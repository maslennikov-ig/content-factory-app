'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Select } from '@contentfactory/react/form/select';
import { LoadingComponent } from '@contentfactory/frontend/components/layout/loading';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import {
  ProductionAnalyticsView,
  resolveProductionAnalyticsState,
} from './production.analytics.view';

type IntegrationOption = {
  id: string;
  name: string;
  identifier: string;
};

type ProductionAnalyticsResponse = {
  summary: {
    publishedVolume: number;
    failureCount: number;
    failureRate: number;
    averageLeadTimeHours: number;
  };
  originMix: Array<{ origin: string; count: number; percentage: number }>;
  failureReasons: Array<{ reason: string; count: number }>;
};

export const ProductionAnalytics = () => {
  const fetch = useFetch();
  const t = useT();
  const [days, setDays] = useState(30);
  const [integrationId, setIntegrationId] = useState('all');

  const loadIntegrations = useCallback(async () => {
    const response = await fetch('/integrations/list');
    if (!response.ok) throw new Error('integrations');
    const result = await response.json();
    return result.integrations as IntegrationOption[];
  }, [fetch]);

  const loadAnalytics = useCallback(async () => {
    const query = new URLSearchParams({ days: String(days) });
    if (integrationId !== 'all') {
      query.set('integrationId', integrationId);
    }
    const response = await fetch('/analytics/production?' + query.toString());
    if (!response.ok) throw new Error('production analytics');
    return (await response.json()) as ProductionAnalyticsResponse;
  }, [days, fetch, integrationId]);

  const { data: integrations = [] } = useSWR(
    'production-analytics-integrations',
    loadIntegrations,
    { revalidateOnFocus: false }
  );
  const { data, error, isLoading } = useSWR(
    ['production-analytics', days, integrationId],
    loadAnalytics,
    { revalidateOnFocus: false }
  );

  const originLabel = (origin: string) => {
    const labels: Record<string, string> = {
      UNKNOWN: t('production_origin_unknown', 'Unknown'),
      WEB: t('production_origin_web', 'Editor'),
      MCP: t('production_origin_mcp', 'Agent via MCP'),
      API: t('production_origin_api', 'API'),
      AUTOPOST: t('production_origin_autopost', 'Autopost'),
      CLI: t('production_origin_cli', 'CLI'),
    };
    return labels[origin] || origin;
  };

  const resolvedState = resolveProductionAnalyticsState({
    isLoading,
    error,
    data,
  });
  const state =
    resolvedState === 'default' &&
    data &&
    data.summary.publishedVolume === 0 &&
    data.summary.failureCount === 0
      ? 'empty'
      : resolvedState;
  const emptyModel: ProductionAnalyticsResponse = {
    summary: {
      publishedVolume: 0,
      failureCount: 0,
      failureRate: 0,
      averageLeadTimeHours: 0,
    },
    originMix: [],
    failureReasons: [],
  };
  const selectedChannel =
    integrationId === 'all'
      ? t('production_analytics_all_channels', 'All channels')
      : integrations.find((item) => item.id === integrationId)?.name ||
        t('production_analytics_channel', 'Channel');

  return (
    <ProductionAnalyticsView
      state={state}
      locale="en"
      labels={{
        title: t('production_analytics_title', 'Publishing operations'),
        description: t(
          'production_analytics_description',
          'Local publishing health from Content Factory records. No platform analytics API is used.'
        ),
        published: t(
          'production_analytics_published_volume',
          'Published volume'
        ),
        failed: t('production_analytics_failed_posts', 'Failed posts'),
        rate: t('production_analytics_failure_rate', 'Failure rate'),
        lead: t('production_analytics_lead_time', 'Average lead time'),
        origins: t('production_analytics_origin_mix', 'Origin mix'),
        reasons: t('production_analytics_failure_reasons', 'Failure reasons'),
        empty: t(
          'production_analytics_empty',
          'No publishing attempts in this period.'
        ),
        noFailures: t(
          'production_analytics_no_failures',
          'No publication failures in this period.'
        ),
        error: t(
          'production_analytics_load_error',
          'Publishing analytics could not be loaded.'
        ),
      }}
      model={{
        days,
        channelName: selectedChannel,
        ...(data ?? emptyModel),
        originMix: (data ?? emptyModel).originMix.map((origin) => ({
          ...origin,
          origin: originLabel(origin.origin),
        })),
      }}
      controls={
        <div className="flex min-w-[390px] gap-[12px] mobile:min-w-0 mobile:flex-col">
          <div className="min-w-[150px] flex-1">
            <Select
              label={t('production_analytics_period', 'Period')}
              name="production-days"
              disableForm={true}
              hideErrors={true}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={7}>{t('7_days', '7 Days')}</option>
              <option value={30}>{t('30_days', '30 Days')}</option>
              <option value={90}>{t('90_days', '90 Days')}</option>
            </Select>
          </div>
          <div className="min-w-[220px] flex-[1.4]">
            <Select
              label={t('production_analytics_channel', 'Channel')}
              name="production-channel"
              disableForm={true}
              hideErrors={true}
              value={integrationId}
              onChange={(event) => setIntegrationId(event.target.value)}
            >
              <option value="all">
                {t('production_analytics_all_channels', 'All channels')}
              </option>
              {integrations.map((integration) => (
                <option key={integration.id} value={integration.id}>
                  {integration.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      }
    />
  );
};
