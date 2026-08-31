'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { Button } from '@contentfactory/react/form/button';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

type ProductEventName =
  | 'register'
  | 'purchase'
  | 'channel_added'
  | 'lifetime_claimed'
  | 'cancel_subscription';

interface AdminProductEventsResponse {
  range: { from: string; to: string };
  activation: {
    registeredOrganizations: number;
    activatedOrganizations: number;
    ratePercentage: number;
  };
  events: Array<{
    name: ProductEventName;
    count: number;
    latestAt: string | null;
  }>;
  recent: Array<{
    id: string;
    name: ProductEventName;
    organizationId: string;
    userId: string;
    createdAt: string;
  }>;
}

const EVENT_NAMES: ProductEventName[] = [
  'register',
  'purchase',
  'channel_added',
  'lifetime_claimed',
  'cancel_subscription',
];

const dateDaysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

const today = () => new Date().toISOString().slice(0, 10);

const PERIODS = [
  { value: '7', label: 'Last 7 days', days: 6 },
  { value: '30', label: 'Last 30 days', days: 29 },
  { value: '90', label: 'Last 90 days', days: 89 },
] as const;

/**
 * One clock for the whole screen. The requested range is built from UTC dates
 * (`dateDaysAgo`, `today`), so the header was already printed in UTC while the
 * timestamps below it were printed in the reader's zone — two different times
 * for the same moment. Everything is UTC now, and the timestamps say so.
 */
const REPORT_TIME_ZONE = 'UTC';

const formatDateTime = (value: string | null, neverLabel: string) => {
  if (!value) return neverLabel;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: REPORT_TIME_ZONE,
    timeZoneName: 'short',
  }).format(new Date(value));
};

const formatCompactDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: REPORT_TIME_ZONE,
  }).format(new Date(value));

const SkeletonBlock: FC<{ className: string }> = ({ className }) => (
  <div
    className={`animate-pulse rounded-[4px] bg-cf-surface-subtle motion-reduce:animate-none ${className}`}
  />
);

const LoadingState: FC<{ label: string }> = ({ label }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label={label}
    className="overflow-hidden rounded-[8px] border border-cf-border bg-cf-surface"
  >
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">
      <section className="flex flex-col gap-[12px] p-[20px] sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-[8px]">
          <SkeletonBlock className="h-[20px] w-[40%]" />
          <SkeletonBlock className="h-[12px] w-[70%]" />
        </div>
        <div className="flex items-baseline gap-[12px]">
          <SkeletonBlock className="h-[28px] w-[72px]" />
          <SkeletonBlock className="h-[12px] w-[48px]" />
        </div>
      </section>

      <section className="border-t border-cf-border">
        <div className="px-[20px] py-[16px]">
          <SkeletonBlock className="h-[20px] w-[32%]" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y border-cf-border bg-cf-surface-subtle">
                {[0, 1, 2].map((cell) => (
                  <th key={cell} className="px-[20px] py-[8px]">
                    <SkeletonBlock className="h-[12px] w-full" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((row) => (
                <tr
                  key={row}
                  className="border-b border-cf-border last:border-b-0"
                >
                  {[0, 1, 2].map((cell) => (
                    <td key={cell} className="px-[20px] py-[8px]">
                      <SkeletonBlock className="h-[12px] w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-[12px] border-t border-cf-border p-[20px]">
        <SkeletonBlock className="h-[20px] w-[32%]" />
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="grid grid-cols-1 gap-[8px] border-t border-cf-border py-[12px] first:border-t-0 md:grid-cols-4 md:gap-[16px]"
          >
            {[0, 1, 2, 3].map((cell) => (
              <SkeletonBlock key={cell} className="h-[12px] w-full" />
            ))}
          </div>
        ))}
      </section>
    </div>
  </div>
);

export const AdminProductEventsComponent: FC = () => {
  const t = useT();
  const user = useUser();
  const fetch = useFetch();
  const [period, setPeriod] = useState('30');
  const selectedPeriod =
    PERIODS.find((entry) => entry.value === period) ?? PERIODS[1];
  const range = useMemo(
    () => ({ from: dateDaysAgo(selectedPeriod.days), to: today() }),
    [selectedPeriod.days]
  );
  const key = user?.isSuperAdmin
    ? `/admin/product-events?from=${range.from}&to=${range.to}`
    : null;
  const { data, error, isLoading, mutate } = useSWR<AdminProductEventsResponse>(
    key,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load product events');
      return response.json();
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );
  const retry = useCallback(() => void mutate(), [mutate]);

  if (!user?.isSuperAdmin) {
    return (
      <div
        role="alert"
        className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[20px] text-cf-ink"
      >
        <h1 className="cf-heading-md text-wrap-balance">
          {t('product_events_access_title', 'Product events are restricted')}
        </h1>
        <p className="cf-body-sm mt-[8px] max-w-[70ch] text-cf-ink-muted text-pretty">
          {t(
            'product_events_access_body',
            'You do not have access to this administrative page.'
          )}
        </p>
      </div>
    );
  }

  const eventRows = EVENT_NAMES.map((name) => {
    const event = data?.events.find((entry) => entry.name === name);
    return {
      name,
      count: event?.count ?? 0,
      latestAt: event?.latestAt ?? null,
    };
  });
  const isEmpty =
    !!data &&
    data.activation.registeredOrganizations === 0 &&
    eventRows.every((event) => event.count === 0) &&
    data.recent.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-[24px] text-cf-ink">
      <header className="flex flex-col gap-[8px] md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="cf-heading-lg text-wrap-balance">
            {t('product_events_title', 'Product events')}
          </h1>
          <p className="cf-body-sm mt-[4px] max-w-[70ch] text-cf-ink-muted text-pretty">
            {t(
              'product_events_description',
              'First-party activation and event volume, without names or email addresses.'
            )}
          </p>
        </div>
        {data && (
          <p className="cf-caption flex max-w-full flex-wrap items-center gap-x-[8px] gap-y-[4px] text-cf-ink-muted">
            <time className="whitespace-nowrap" dateTime={data.range.from}>
              {formatCompactDate(data.range.from)}
            </time>
            <span aria-hidden="true">—</span>
            <time className="whitespace-nowrap" dateTime={data.range.to}>
              {formatCompactDate(data.range.to)}
            </time>
          </p>
        )}
      </header>

      <RadioGroup
        aria-label={t('product_events_date_range', 'Date range')}
        value={period}
        onChange={setPeriod}
        className="flex flex-wrap gap-x-[8px] gap-y-[12px]"
      >
        {PERIODS.map((entry) => {
          const selected = entry.value === period;
          return (
            <RadioOption
              key={entry.value}
              value={entry.value}
              density="dense"
              className={`cf-label-md rounded-full border px-[12px] transition-colors duration-state motion-reduce:transition-none ${
                selected
                  ? 'border-cf-accent bg-cf-accent text-cf-accent-ink'
                  : 'border-cf-border-control bg-cf-surface text-cf-ink hover:bg-cf-surface-subtle'
              }`}
            >
              {t(`product_events_period_${entry.value}`, entry.label)}
            </RadioOption>
          );
        })}
      </RadioGroup>

      {isLoading ? (
        <LoadingState
          label={t('product_events_loading', 'Loading product events')}
        />
      ) : error || !data ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-[12px] rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[20px]"
        >
          <div>
            <h2 className="cf-heading-md">
              {t('product_events_error_title', 'Product events could not load')}
            </h2>
            <p className="cf-body-sm mt-[4px] max-w-[70ch] text-cf-ink-muted text-pretty">
              {t(
                'product_events_error_body',
                'The report is still available. Try the request again.'
              )}
            </p>
          </div>
          <Button variant="secondary" onClick={retry}>
            {t('try_again', 'Try again')}
          </Button>
        </div>
      ) : isEmpty ? (
        <div
          role="status"
          className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[20px]"
        >
          <h2 className="cf-heading-md">
            {t(
              'product_events_empty_title',
              'No product events in this period'
            )}
          </h2>
          <p className="cf-body-sm mt-[4px] max-w-[70ch] text-cf-ink-muted text-pretty">
            {t(
              'product_events_empty_body',
              'Choose a longer period to check earlier activity.'
            )}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-cf-border bg-cf-surface">
          <section aria-labelledby="activation-heading" className="p-[20px]">
            <div className="flex flex-col gap-[16px] sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  id="activation-heading"
                  className="cf-heading-md text-wrap-balance"
                >
                  {t(
                    'product_events_activation_title',
                    'Activation: first channel'
                  )}
                </h2>
                <p className="cf-body-sm mt-[4px] max-w-[70ch] text-cf-ink-muted text-pretty">
                  {t(
                    'product_events_activation_body',
                    'Among organizations registered in this period, how many connected their first channel?'
                  )}
                </p>
              </div>
              <div className="flex items-baseline gap-[12px] sm:text-right">
                <span className="cf-heading-lg tabular-nums">
                  {data.activation.ratePercentage.toLocaleString()}%
                </span>
                <span className="cf-caption text-cf-ink-muted">
                  {data.activation.activatedOrganizations.toLocaleString()} /{' '}
                  {data.activation.registeredOrganizations.toLocaleString()}
                </span>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="events-heading"
            className="border-t border-cf-border"
          >
            <h2
              id="events-heading"
              className="cf-heading-md px-[20px] pb-[8px] pt-[20px]"
            >
              {t('product_events_all_events', 'All events')}
            </h2>
            <div className="overflow-x-auto">
              <table
                aria-label={t(
                  'product_events_totals_table',
                  'Product event totals'
                )}
                className="w-full border-collapse"
              >
                <thead>
                  <tr className="border-y border-cf-border bg-cf-surface-subtle text-cf-ink-muted">
                    <th
                      scope="col"
                      className="cf-label-sm px-[20px] py-[8px] text-left"
                    >
                      {t('event', 'Event')}
                    </th>
                    <th
                      scope="col"
                      className="cf-label-sm px-[12px] py-[8px] text-right"
                    >
                      {t('count', 'Count')}
                    </th>
                    <th
                      scope="col"
                      className="cf-label-sm px-[20px] py-[8px] text-right"
                    >
                      {t('latest', 'Latest')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eventRows.map((event) => (
                    <tr
                      key={event.name}
                      className="border-b border-cf-border last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="cf-label-sm px-[20px] py-[8px] text-left"
                      >
                        {event.name}
                      </th>
                      <td className="cf-label-sm px-[12px] py-[8px] text-right tabular-nums">
                        {event.count.toLocaleString()}
                      </td>
                      <td className="cf-caption whitespace-nowrap px-[20px] py-[8px] text-right text-cf-ink-muted">
                        {formatDateTime(event.latestAt, t('never', 'Never'))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            aria-labelledby="recent-heading"
            className="border-t border-cf-border p-[20px]"
          >
            <h2 id="recent-heading" className="cf-heading-md">
              {t('product_events_latest', 'Latest events (up to 50)')}
            </h2>
            {data.recent.length === 0 ? (
              <p className="cf-body-sm mt-[8px] text-cf-ink-muted">
                {t(
                  'product_events_no_recent',
                  'No recent events in this period.'
                )}
              </p>
            ) : (
              <ol
                className="mt-[12px] divide-y divide-cf-border"
                aria-label={t(
                  'product_events_recent_list',
                  'Latest product events, up to 50'
                )}
              >
                {data.recent.map((event) => (
                  <li
                    key={event.id}
                    className="grid min-w-0 grid-cols-1 gap-[8px] py-[12px] first:pt-0 last:pb-0 md:grid-cols-[minmax(120px,0.7fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-[16px]"
                  >
                    <div>
                      <div className="cf-label-sm">{event.name}</div>
                      <div className="cf-caption mt-[4px] break-all text-cf-ink-muted">
                        {event.id}
                      </div>
                    </div>
                    <div>
                      <div className="cf-body-sm text-cf-ink-muted">
                        {t('organization', 'Organization')}
                      </div>
                      <div className="cf-caption mt-[4px] break-all">
                        {event.organizationId}
                      </div>
                    </div>
                    <div>
                      <div className="cf-body-sm text-cf-ink-muted">
                        {t('user', 'User')}
                      </div>
                      <div className="cf-caption mt-[4px] break-all">
                        {event.userId}
                      </div>
                    </div>
                    <time
                      dateTime={event.createdAt}
                      className="cf-caption whitespace-nowrap text-cf-ink-muted md:text-right"
                    >
                      {formatDateTime(event.createdAt, t('never', 'Never'))}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
