'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { Input } from '@contentfactory/react/form/input';
import { PageHeader, Panel } from '@contentfactory/react/layout';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

export interface AdminStatsBlock {
  total: number;
  perSocial: { provider: string; count: number }[];
}

export interface AdminStatsResponse {
  from: string;
  to: string;
  errors: AdminStatsBlock;
  posts: AdminStatsBlock;
  connected: AdminStatsBlock;
}

export type AdminStatsPreset = Readonly<{
  label: string;
  from: string;
  to: string;
}>;

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <Panel as="div" contentPadding="snug">
      <div className="cf-label-sm text-cf-ink-muted">{label}</div>
      <div className="mt-[8px] cf-heading-lg text-cf-ink">
        {value.toLocaleString()}
      </div>
    </Panel>
  );
}

function ProviderTable({
  title,
  block,
}: {
  title: string;
  block: AdminStatsBlock;
}) {
  const t = useT();
  return (
    <section
      className="overflow-hidden rounded-[8px] border border-cf-border bg-cf-surface"
      aria-label={title}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_88px] gap-[12px] border-b border-cf-border bg-cf-surface-subtle px-[12px] py-[10px] cf-label-sm text-cf-ink-muted">
        <div>{title}</div>
        <div className="text-right">{t('count', 'Count')}</div>
      </header>
      {block.perSocial.length === 0 ? (
        <div className="px-[12px] py-[16px] cf-body-sm text-cf-ink-muted">
          {t('admin_stats_no_data', 'No data for this timeframe.')}
        </div>
      ) : (
        block.perSocial.map((row) => (
          <div
            key={row.provider}
            className="grid grid-cols-[minmax(0,1fr)_88px] gap-[12px] border-b border-cf-border px-[12px] py-[10px] last:border-b-0"
          >
            <div className="break-words cf-body-sm text-cf-ink">
              {row.provider}
            </div>
            <div className="text-right cf-label-sm text-cf-ink">
              {row.count.toLocaleString()}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

export function AdminStatsView({
  allowed,
  fromInput,
  toInput,
  today,
  presets,
  activePreset,
  unknownOnly,
  data,
  loading = false,
  error,
  onFromChange,
  onToChange,
  onApply,
  onPresetChange,
  onUnknownOnlyChange,
  onRetry,
}: {
  allowed: boolean;
  fromInput: string;
  toInput: string;
  today: string;
  presets: readonly AdminStatsPreset[];
  activePreset: string | null;
  unknownOnly: boolean;
  data?: AdminStatsResponse;
  loading?: boolean;
  error?: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onApply: () => void;
  onPresetChange: (label: string) => void;
  onUnknownOnlyChange: (value: boolean) => void;
  onRetry: () => void;
}) {
  const t = useT();
  if (!allowed) {
    return (
      <section
        data-production-surface="settings-admin/stats"
        className="rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[16px] cf-body-md text-cf-warning"
      >
        {t('no_access_to_page', 'You do not have access to this page.')}
      </section>
    );
  }
  const invalidRange = !fromInput || !toInput || fromInput > toInput;

  return (
    <section
      data-production-surface="settings-admin/stats"
      className="flex flex-col gap-[16px] text-cf-ink"
    >
      <PageHeader
        headingLevel={1}
        title={t('admin_stats_title', 'Admin statistics')}
        actions={
          data ? (
            <div className="cf-label-sm text-cf-ink-muted">
              {data.from} — {data.to}
            </div>
          ) : undefined
        }
      />
      <RadioGroup
        className="flex flex-wrap gap-[8px]"
        aria-label={t('product_events_date_range', 'Date range')}
        value={activePreset}
        onChange={onPresetChange}
      >
        {presets.map((preset) => (
          <RadioOption
            key={preset.label}
            value={preset.label}
            density="dense"
            className={`rounded-full border px-[12px] cf-label-md transition-colors duration-state ${
              activePreset === preset.label
                ? 'border-cf-accent bg-cf-accent-soft text-cf-accent'
                : 'border-cf-border-control bg-cf-surface text-cf-ink-muted hover:bg-cf-surface-subtle hover:text-cf-ink'
            }`}
          >
            {preset.label}
          </RadioOption>
        ))}
      </RadioGroup>
      <Panel as="div" contentPadding="compact">
        <div className="flex flex-col gap-[12px] lg:flex-row lg:items-end">
          <Input
            standalone
            name="admin-stats-from"
            label={t('admin_stats_from', 'From')}
            type="date"
            value={fromInput}
            max={toInput}
            onChange={(event) => onFromChange(event.target.value)}
          />
          <Input
            standalone
            name="admin-stats-to"
            label={t('admin_stats_to', 'To')}
            type="date"
            value={toInput}
            min={fromInput}
            max={today}
            onChange={(event) => onToChange(event.target.value)}
          />
          <Button onClick={onApply} disabled={invalidRange}>
            {t('apply', 'Apply')}
          </Button>
          <CheckboxField
            className="max-w-[320px]"
            title={t(
              'admin_stats_unknown_only_hint',
              'Only count errors whose message matches "message":"Unknown Error". This affects aggregate error statistics only.'
            )}
            checked={unknownOnly}
            onChange={(event) => onUnknownOnlyChange(event.target.checked)}
            label={t('admin_stats_unknown_only', 'Unknown errors only')}
          />
        </div>
      </Panel>
      {loading ? (
        <div
          aria-busy="true"
          aria-label={t('admin_stats_loading', 'Loading statistics')}
          className="grid grid-cols-1 gap-[12px] md:grid-cols-3"
        >
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-[96px] rounded-[8px] border border-cf-border bg-cf-surface-subtle motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : error || !data ? (
        <div
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-danger"
        >
          <p>
            {error ||
              t('admin_stats_load_failed', 'Failed to load statistics.')}
          </p>
          <Button
            variant="quiet"
            type="button"
            onClick={onRetry}
            className="mt-[8px] underline"
          >
            {t('try_again', 'Try again')}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-[12px] md:grid-cols-3">
            <Summary
              label={t('admin_stats_total_posts', 'Total posts published')}
              value={data.posts.total}
            />
            <Summary
              label={t(
                'admin_stats_total_connected',
                'Total connected accounts'
              )}
              value={data.connected.total}
            />
            <Summary
              label={
                unknownOnly
                  ? t(
                      'admin_stats_total_unknown_errors',
                      'Total unknown errors'
                    )
                  : t('admin_stats_total_errors', 'Total errors')
              }
              value={data.errors.total}
            />
          </div>
          <div className="grid grid-cols-1 gap-[12px] xl:grid-cols-3">
            <ProviderTable
              title={t(
                'admin_stats_posts_per_social',
                'Posts published per social'
              )}
              block={data.posts}
            />
            <ProviderTable
              title={t(
                'admin_stats_connected_per_social',
                'Connected accounts per social'
              )}
              block={data.connected}
            />
            <ProviderTable
              title={
                unknownOnly
                  ? t(
                      'admin_stats_unknown_errors_per_social',
                      'Unknown errors per social'
                    )
                  : t('admin_stats_errors_per_social', 'Errors per social')
              }
              block={data.errors}
            />
          </div>
        </>
      )}
    </section>
  );
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
};
const currentDate = () => isoDate(new Date());
const currentPresets = (t: ReturnType<typeof useT>): AdminStatsPreset[] => {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const month = new Date(now);
  month.setDate(1);
  return [
    { label: t('today', 'Today'), from: currentDate(), to: currentDate() },
    {
      label: t('admin_stats_this_week', 'This week'),
      from: isoDate(monday),
      to: currentDate(),
    },
    {
      label: t('admin_stats_this_month', 'This month'),
      from: isoDate(month),
      to: currentDate(),
    },
    {
      label: t('product_events_period_7', 'Last 7 days'),
      from: daysAgo(7),
      to: currentDate(),
    },
    {
      label: t('product_events_period_30', 'Last 30 days'),
      from: daysAgo(30),
      to: currentDate(),
    },
  ];
};

export const AdminStatsComponent = () => {
  const user = useUser();
  const fetch = useFetch();
  const t = useT();
  const presets = currentPresets(t);
  const [fromInput, setFromInput] = useState(currentDate());
  const [toInput, setToInput] = useState(currentDate());
  const [range, setRange] = useState({
    from: currentDate(),
    to: currentDate(),
  });
  const [unknownOnly, setUnknownOnly] = useState(false);
  const query = new URLSearchParams({
    from: range.from,
    to: range.to,
    ...(unknownOnly ? { unknownOnly: 'true' } : {}),
  });
  const { data, isLoading, error, mutate } = useSWR<AdminStatsResponse>(
    `/admin/stats?${query.toString()}`,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load stats');
      return response.json();
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );
  const applyRange = useCallback((next: { from: string; to: string }) => {
    setFromInput(next.from);
    setToInput(next.to);
    setRange(next);
  }, []);
  const activePreset =
    presets.find(
      (preset) => preset.from === range.from && preset.to === range.to
    )?.label || null;

  return (
    <AdminStatsView
      allowed={Boolean(user?.isSuperAdmin)}
      fromInput={fromInput}
      toInput={toInput}
      today={currentDate()}
      presets={presets}
      activePreset={activePreset}
      unknownOnly={unknownOnly}
      data={data}
      loading={isLoading}
      error={
        error
          ? t('admin_stats_load_failed', 'Failed to load statistics.')
          : undefined
      }
      onFromChange={setFromInput}
      onToChange={setToInput}
      onApply={() => setRange({ from: fromInput, to: toInput })}
      onPresetChange={(label) => {
        const preset = presets.find((entry) => entry.label === label);
        if (preset) applyRange({ from: preset.from, to: preset.to });
      }}
      onUnknownOnlyChange={setUnknownOnly}
      onRetry={() => void mutate()}
    />
  );
};
