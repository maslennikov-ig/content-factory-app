import type { ReactNode } from 'react';
import { Metric } from '../ui/metric';
import { Button } from '@contentfactory/react/form/button';
import {
  EmptyState,
  ErrorState,
  Panel,
  RestrictedState,
  SkeletonRows,
} from '../ui/surface';

export type AudienceMetric = Readonly<{
  label: string;
  data: readonly Readonly<{ total: number; date: string }>[];
  average?: boolean;
  percentageChange?: number;
}>;

export type AudienceChannel = Readonly<{
  id: string;
  name: string;
  identifier: string;
  disabled?: boolean;
}>;

export function resolveAudienceAnalyticsState({
  isLoading,
  error,
  metrics,
}: {
  isLoading: boolean;
  error?: unknown;
  metrics?: readonly AudienceMetric[] | null;
}) {
  if (isLoading) return 'loading' as const;
  if (error || metrics === undefined) return 'error' as const;
  if (metrics === null || metrics.length === 0) return 'empty' as const;
  return 'default' as const;
}

export function AudienceAnalyticsView({
  state,
  locale,
  channels,
  selectedChannelId,
  metrics,
  controls,
  channelControls,
  onRetry,
}: {
  state:
    | 'loading'
    | 'empty'
    | 'default'
    | 'selected'
    | 'error'
    | 'disabled'
    | 'long-content';
  locale: 'en' | 'ru';
  channels: readonly AudienceChannel[];
  selectedChannelId: string;
  metrics: readonly AudienceMetric[] | null;
  controls?: ReactNode;
  channelControls?: ReactNode;
  /** Reloads what failed; without it the error has no button. */
  onRetry?: () => void;
}) {
  const ru = locale === 'ru';
  // The shared states (`97dq.76`, audit §7.3), inside the page gutter like
  // the loaded view — a local skeleton and a red paragraph stood here.
  if (state === 'loading') {
    return (
      <section data-analytics-view="audience" className="bg-cf-canvas cf-page-pad">
        <SkeletonRows
          rows={4}
          label={ru ? 'Загрузка аналитики аудитории' : 'Loading audience analytics'}
        />
      </section>
    );
  }
  if (state === 'error') {
    return (
      <section data-analytics-view="audience" className="bg-cf-canvas cf-page-pad">
        <ErrorState
          title={
            ru
              ? 'Не удалось загрузить список каналов или их аналитику.'
              : 'Channels or their analytics could not be loaded.'
          }
          action={
            onRetry ? (
              <Button variant="secondary" onClick={onRetry}>
                {ru ? 'Повторить' : 'Try again'}
              </Button>
            ) : undefined
          }
        />
      </section>
    );
  }

  const selected =
    channels.find((channel) => channel.id === selectedChannelId) ?? channels[0];
  const unavailable =
    state === 'empty' || metrics === null || metrics.length === 0;
  return (
    <section
      data-analytics-view="audience"
      className="grid min-w-0 grid-cols-[248px_minmax(0,1fr)] gap-[12px] bg-cf-canvas cf-page-pad text-cf-ink tablet:grid-cols-[200px_minmax(0,1fr)] mobile:grid-cols-1"
    >
      <Panel as="div">
        <aside>
        <h2 className="cf-heading-md">{ru ? 'Каналы' : 'Channels'}</h2>
        {channelControls ?? (
          <div className="mt-[12px] space-y-[4px]">
            {channels.map((channel) => (
              <div
                key={channel.id}
                aria-current={channel.id === selected?.id ? 'true' : undefined}
                className={`rounded-[8px] border-s-[4px] px-[12px] py-[8px] ${
                  channel.id === selected?.id
                    ? 'border-cf-accent bg-cf-accent-soft'
                    : 'border-transparent'
                } ${channel.disabled ? 'opacity-50' : ''}`}
              >
                <div className="cf-label-md break-words">
                  {state === 'long-content'
                    ? `${channel.name} — synthetic workspace with a deliberately long localized channel name`
                    : channel.name}
                </div>
                <div className="cf-caption mt-[4px] text-cf-ink-muted">
                  {channel.identifier}
                </div>
              </div>
            ))}
          </div>
        )}
        </aside>
      </Panel>
      <Panel as="div" className="min-w-0">
        <div className="flex items-start justify-between gap-[16px] mobile:flex-col">
          <div>
            <h2 className="cf-heading-lg text-balance">{selected?.name}</h2>
            <p className="cf-body-sm mt-[4px] text-cf-ink-muted">
              {ru
                ? 'Метрики предоставляет подключённая платформа.'
                : 'Metrics are supplied by the connected platform.'}
            </p>
          </div>
          {controls}
        </div>
        {state === 'disabled' || selected?.disabled ? (
          <RestrictedState
            className="mt-[24px]"
            title={ru ? 'Канал отключён.' : 'Channel disabled.'}
            reason={
              ru
                ? 'Сначала восстановите подключение.'
                : 'Restore the connection first.'
            }
          />
        ) : unavailable ? (
          <EmptyState
            className="mt-[24px]"
            title={
              ru
                ? 'Метрики этого канала недоступны.'
                : 'Metrics are unavailable for this channel.'
            }
            description={
              ru
                ? 'Content Factory не придумывает значения показателей.'
                : 'Content Factory does not invent KPI values.'
            }
          />
        ) : (
          <div className="mt-[24px] grid grid-cols-3 gap-[12px] tablet:grid-cols-2 mobile:grid-cols-1">
            {metrics.map((metric) => {
              const total = metric.data.reduce(
                (sum, point) => sum + point.total,
                0
              );
              const value =
                metric.average && metric.data.length
                  ? `${(total / metric.data.length).toFixed(2)}%`
                  : total;
              return (
                // The shared metric card (`97dq.76`, audit §6.3): the
                // number is `cf-display-num`, as on Производство.
                <Metric
                  key={metric.label}
                  headingLevel={3}
                  tone="subtle"
                  label={metric.label}
                  value={value}
                  note={`${metric.data.length} ${ru ? 'точек' : 'points'}`}
                />
              );
            })}
          </div>
        )}
      </Panel>
    </section>
  );
}
