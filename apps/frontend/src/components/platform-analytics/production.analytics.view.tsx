import type { ReactNode } from 'react';

export type ProductionAnalyticsModel = Readonly<{
  days: number;
  channelName: string;
  summary: Readonly<{
    publishedVolume: number;
    failureCount: number;
    failureRate: number;
    averageLeadTimeHours: number;
  }>;
  originMix: readonly Readonly<{
    origin: string;
    count: number;
    percentage: number;
  }>[];
  failureReasons: readonly Readonly<{ reason: string; count: number }>[];
}>;

export type AnalyticsSurfaceState =
  | 'loading'
  | 'empty'
  | 'default'
  | 'selected'
  | 'error'
  | 'long-content';

export function resolveProductionAnalyticsState({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error?: unknown;
  data?: unknown;
}): AnalyticsSurfaceState {
  if (isLoading) return 'loading';
  if (error || data === undefined || data === null) return 'error';
  return 'default';
}

export type ProductionAnalyticsLabels = Readonly<{
  title: string;
  description: string;
  published: string;
  failed: string;
  rate: string;
  lead: string;
  hours: string;
  origins: string;
  reasons: string;
  empty: string;
  noFailures: string;
  error: string;
  retry: string;
}>;

const copy: Record<'en' | 'ru', ProductionAnalyticsLabels> = {
  en: {
    title: 'Publishing operations',
    description:
      'Local publishing health from Content Factory records. No platform analytics API is used.',
    published: 'Published volume',
    failed: 'Failed posts',
    rate: 'Failure rate',
    lead: 'Average lead time',
    hours: 'hours',
    origins: 'Origin mix',
    reasons: 'Failure reasons',
    empty: 'No publishing attempts in this period.',
    noFailures: 'No publication failures in this period.',
    error: 'Publishing analytics could not be loaded.',
    retry: 'Retry safely',
  },
  ru: {
    title: 'Производственная аналитика',
    description:
      'Локальная статистика публикаций из записей Content Factory. API аналитики платформ не используется.',
    published: 'Опубликовано',
    failed: 'Ошибки публикации',
    rate: 'Доля ошибок',
    lead: 'Среднее время до публикации',
    hours: 'ч',
    origins: 'Источники создания',
    reasons: 'Причины ошибок',
    empty: 'За этот период попыток публикации не было.',
    noFailures: 'За этот период ошибок публикации не было.',
    error: 'Не удалось загрузить производственную аналитику.',
    retry: 'Повторить безопасно',
  },
} as const;

const Skeleton = () => (
  <div
    aria-busy="true"
    aria-label="Loading production analytics"
    className="space-y-[16px]"
  >
    <div className="h-[32px] w-[240px] rounded-[8px] bg-cf-surface-subtle" />
    <div className="grid grid-cols-4 gap-[12px] tablet:grid-cols-2 mobile:grid-cols-1">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-[112px] rounded-[8px] bg-cf-surface-subtle"
        />
      ))}
    </div>
  </div>
);

export function ProductionAnalyticsView({
  state,
  locale,
  model,
  controls,
  labels,
}: {
  state: AnalyticsSurfaceState;
  locale: 'en' | 'ru';
  model: ProductionAnalyticsModel;
  controls?: ReactNode;
  labels?: Partial<ProductionAnalyticsLabels>;
}) {
  const t = { ...copy[locale], ...labels };
  if (state === 'loading') return <Skeleton />;
  if (state === 'error') {
    return (
      <div
        role="alert"
        className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[16px] text-cf-danger"
      >
        <p className="cf-body-md">{t.error}</p>
        <p className="cf-label-md mt-[8px]">{t.retry}</p>
      </div>
    );
  }

  const isEmpty = state === 'empty';
  return (
    <section
      data-analytics-view="production"
      className="min-w-0 bg-cf-canvas p-[24px] text-cf-ink mobile:p-[16px]"
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="flex items-end justify-between gap-[24px] tablet:flex-col tablet:items-stretch">
          <div>
            <h2 className="cf-heading-lg text-balance">{t.title}</h2>
            <p className="cf-body-md mt-[8px] max-w-[70ch] text-cf-ink-muted text-pretty">
              {state === 'long-content'
                ? `${t.description} ${
                    locale === 'ru'
                      ? 'Фильтры сохраняют выбранный период и канал даже при длинных локализованных названиях рабочих пространств.'
                      : 'Filters preserve the selected period and channel even when workspace and channel names are unusually long.'
                  }`
                : t.description}
            </p>
          </div>
          {controls ?? (
            <div className="cf-caption rounded-[4px] border border-cf-border px-[12px] py-[8px] text-cf-ink-muted">
              {model.days} days · {model.channelName}
            </div>
          )}
        </div>

        {isEmpty ? (
          <div className="cf-body-md mt-[24px] rounded-[8px] border border-cf-border bg-cf-surface p-[20px] text-cf-ink-muted">
            {t.empty}
          </div>
        ) : (
          <>
            <div className="mt-[24px] grid grid-cols-4 gap-[12px] tablet:grid-cols-2 mobile:grid-cols-1">
              {[
                [t.published, model.summary.publishedVolume],
                [t.failed, model.summary.failureCount],
                [t.rate, `${model.summary.failureRate}%`],
                [t.lead, `${model.summary.averageLeadTimeHours} ${t.hours}`],
              ].map(([label, value]) => (
                <article
                  key={label}
                  className="rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
                >
                  <div className="cf-label-sm text-cf-ink-muted">{label}</div>
                  <div className="cf-heading-lg mt-[12px] tabular-nums">
                    {value}
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-[12px] grid grid-cols-2 gap-[12px] tablet:grid-cols-1">
              <section className="rounded-[8px] border border-cf-border bg-cf-surface p-[20px]">
                <h3 className="cf-heading-md">{t.origins}</h3>
                <div className="mt-[12px] divide-y divide-cf-border">
                  {model.originMix.map((origin) => (
                    <div
                      key={origin.origin}
                      className="flex justify-between gap-[16px] py-[8px]"
                    >
                      <span className="cf-body-sm">{origin.origin}</span>
                      <span className="cf-caption tabular-nums text-cf-ink-muted">
                        {origin.count} · {origin.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-[8px] border border-cf-border bg-cf-surface p-[20px]">
                <h3 className="cf-heading-md">{t.reasons}</h3>
                {model.failureReasons.length ? (
                  <ol className="mt-[12px] space-y-[8px]">
                    {model.failureReasons.map((failure) => (
                      <li
                        key={failure.reason}
                        className="flex justify-between gap-[16px] rounded-[8px] bg-cf-danger-soft p-[12px] text-cf-danger"
                      >
                        <span className="cf-body-sm break-words">
                          {failure.reason}
                        </span>
                        <span className="cf-caption tabular-nums">
                          {failure.count}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="cf-body-sm mt-[12px] rounded-[8px] bg-cf-accent-soft p-[12px] text-cf-accent">
                    {t.noFailures}
                  </p>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
