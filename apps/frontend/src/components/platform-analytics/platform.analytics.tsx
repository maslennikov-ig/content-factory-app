'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { orderBy } from 'lodash';
import i18next from 'i18next';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Select } from '@contentfactory/react/form/select';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import {
  AudienceAnalyticsView,
  resolveAudienceAnalyticsState,
  type AudienceMetric,
} from './audience.analytics.view';

const allowedIntegrations = [
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

type AnalyticsIntegration = {
  id: string;
  name: string;
  identifier: string;
  type?: string;
  disabled?: boolean;
  refreshNeeded?: boolean;
  inBetweenSteps?: boolean;
};

export const PlatformAnalytics = () => {
  const fetch = useFetch();
  const t = useT();
  const { disableXAnalytics } = useVariables();
  const periodLabels: Record<number, string> = {
    7: t('7_days', '7 Days'),
    30: t('30_days', '30 Days'),
    90: t('90_days', '90 Days'),
  };
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const loadIntegrations = useCallback(async () => {
    const response = await fetch('/integrations/list');
    if (!response.ok) throw new Error('analytics integrations');
    const result = await response.json();
    return (result.integrations as AnalyticsIntegration[]).filter(
      (integration) =>
        allowedIntegrations.includes(
          integration.identifier as (typeof allowedIntegrations)[number]
        ) && !(integration.identifier === 'x' && disableXAnalytics)
    );
  }, [fetch, disableXAnalytics]);

  const {
    data: integrations,
    error: integrationsError,
    isLoading: integrationsLoading,
  } = useSWR('analytics-list', loadIntegrations, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const sortedIntegrations = useMemo(
    () =>
      orderBy(
        integrations ?? [],
        ['type', 'disabled', 'identifier'],
        ['desc', 'asc', 'asc']
      ),
    [integrations]
  );
  const currentIntegration =
    sortedIntegrations.find((integration) => integration.id === currentId) ??
    sortedIntegrations[0];

  const options = useMemo(() => {
    if (!currentIntegration) return [];
    const supported = [7];
    if (currentIntegration.identifier !== 'telegram') supported.push(30);
    if (
      [
        'facebook',
        'linkedin-page',
        'pinterest',
        'youtube',
        'x',
        'gmb',
      ].includes(currentIntegration.identifier)
    ) {
      supported.push(90);
    }
    return supported;
  }, [currentIntegration]);
  const selectedDays = options.includes(days) ? days : options[0] ?? 7;

  const loadMetrics = useCallback(async () => {
    const response = await fetch(
      `/analytics/${currentIntegration.id}?date=${selectedDays}`
    );
    if (!response.ok) throw new Error('platform analytics');
    return (await response.json()) as AudienceMetric[];
  }, [fetch, currentIntegration?.id, selectedDays]);

  const {
    data: metrics,
    error: metricsError,
    isLoading: metricsLoading,
  } = useSWR(
    currentIntegration
      ? ['platform-analytics', currentIntegration.id, selectedDays]
      : null,
    loadMetrics,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  const locale = i18next.resolvedLanguage?.startsWith('ru') ? 'ru' : 'en';
  const state = integrationsLoading
    ? 'loading'
    : integrationsError
    ? 'error'
    : !currentIntegration
    ? 'empty'
    : currentIntegration.disabled || currentIntegration.refreshNeeded
    ? 'disabled'
    : resolveAudienceAnalyticsState({
        isLoading: metricsLoading,
        error: metricsError,
        metrics,
      });

  return (
    <AudienceAnalyticsView
      state={state}
      locale={locale}
      channels={sortedIntegrations}
      selectedChannelId={currentIntegration?.id ?? ''}
      metrics={metrics ?? null}
      channelControls={
        <div className="mt-[12px] space-y-[4px]">
          {sortedIntegrations.map((integration) => {
            const selected = integration.id === currentIntegration?.id;
            return (
              <Button
                key={integration.id}
                variant="quiet"
                layout="content"
                aria-current={selected ? 'true' : undefined}
                onClick={() => setCurrentId(integration.id)}
                className={`w-full justify-start border-s-[3px] px-[12px] py-[10px] text-start ${
                  selected
                    ? 'border-cf-accent bg-cf-accent-soft'
                    : 'border-transparent'
                } ${integration.disabled ? 'opacity-50' : ''}`}
              >
                <span className="min-w-0">
                  <span className="cf-label-md block truncate">
                    {integration.name}
                  </span>
                  <span className="cf-caption mt-[4px] block text-cf-ink-muted">
                    {integration.identifier}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      }
      controls={
        currentIntegration && options.length ? (
          <div className="w-[180px] mobile:w-full">
            <Select
              label={t('production_analytics_period', 'Period')}
              name="audience-days"
              disableForm={true}
              hideErrors={true}
              value={selectedDays}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {periodLabels[option]}
                </option>
              ))}
            </Select>
          </div>
        ) : null
      }
    />
  );
};
