import type { ReactNode } from 'react';

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
}) {
  const ru = locale === 'ru';
  if (state === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-label={
          ru ? 'Загрузка аналитики аудитории' : 'Loading audience analytics'
        }
        className="grid grid-cols-[248px_1fr] gap-[12px] mobile:grid-cols-1"
      >
        <div className="h-[320px] rounded-[8px] bg-cf-surface-subtle" />
        <div className="h-[320px] rounded-[8px] bg-cf-surface-subtle" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div
        role="alert"
        className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[16px] cf-body-md text-cf-danger"
      >
        {ru
          ? 'Не удалось загрузить список каналов или их аналитику. Повторите запрос безопасно.'
          : 'Channels or their analytics could not be loaded. Retry safely.'}
      </div>
    );
  }

  const selected =
    channels.find((channel) => channel.id === selectedChannelId) ?? channels[0];
  const unavailable =
    state === 'empty' || metrics === null || metrics.length === 0;
  return (
    <section
      data-analytics-view="audience"
      className="grid min-w-0 grid-cols-[248px_minmax(0,1fr)] gap-[12px] bg-cf-canvas p-[24px] text-cf-ink tablet:grid-cols-[200px_minmax(0,1fr)] mobile:grid-cols-1 mobile:p-[16px]"
    >
      <aside className="rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
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
      <div className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[20px]">
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
          <div className="cf-body-md mt-[24px] rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[16px] text-cf-warning">
            {ru
              ? 'Канал отключён. Сначала восстановите подключение.'
              : 'Channel disabled. Restore the connection first.'}
          </div>
        ) : unavailable ? (
          <div className="cf-body-md mt-[24px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[20px] text-cf-ink-muted">
            {ru
              ? 'Метрики этого канала недоступны. Content Factory не придумывает значения показателей.'
              : 'Metrics are unavailable for this channel. Content Factory does not invent KPI values.'}
          </div>
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
                <article
                  key={metric.label}
                  className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[16px]"
                >
                  <h3 className="cf-label-md">{metric.label}</h3>
                  <div className="cf-heading-lg mt-[16px] tabular-nums">
                    {value}
                  </div>
                  <div className="cf-caption mt-[8px] text-cf-ink-muted">
                    {metric.data.length} {ru ? 'точек' : 'points'}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
