import type { ReactNode } from 'react';
import { Hint } from '@contentfactory/react/layout/hint';
import { Button } from '@contentfactory/react/form/button';
import { EmptyState, ErrorState, SkeletonRows } from '../ui/surface';

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

/**
 * The «?» of every card and the words around the period block (`97dq.73`).
 * The `labels` prop overrides names only; what a name means stays here, in
 * both languages.
 */
type ProductionAnalyticsExplain = Readonly<{
  hintFor: (subject: string) => string;
  period: string;
  periodHint: string;
  publishedHint: string;
  failedHint: string;
  rateHint: string;
  leadHint: string;
  originsHint: string;
  reasonsHint: string;
  loading: string;
  longContent: string;
  daysUnit: string;
}>;

const copy: Record<
  'en' | 'ru',
  ProductionAnalyticsLabels & ProductionAnalyticsExplain
> = {
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
    retry: 'Try again',
    hintFor: (subject) => `Hint: ${subject.toLocaleLowerCase('en')}`,
    period: 'In the selected period',
    periodHint:
      'What already happened: posts that went out or failed in the period and channel chosen above.',
    publishedHint: 'Posts that went out in the period.',
    failedHint: 'Posts the platform did not accept in the period.',
    rateHint: 'Failed posts out of every publishing attempt, in percent.',
    leadHint:
      'From the moment a post was created to the slot it went out in, averaged over published posts.',
    originsHint:
      'Where the published and failed posts came from: the editor, the agent, the API, autopost.',
    reasonsHint:
      'The platform’s own words for each failure, most frequent first.',
    loading: 'Loading publishing analytics',
    daysUnit: 'days',
    longContent:
      'Filters preserve the selected period and channel even when workspace and channel names are unusually long.',
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
    retry: 'Повторить',
    hintFor: (subject) => `Подсказка: ${subject.toLocaleLowerCase('ru')}`,
    period: 'За выбранный период',
    periodHint:
      'Что уже случилось: посты, которые вышли или не ушли за период и в канале, выбранных выше.',
    publishedHint: 'Посты, которые вышли за период.',
    failedHint: 'Посты, которые площадка не приняла за период.',
    rateHint: 'Доля неудачных попыток публикации среди всех попыток, в процентах.',
    leadHint:
      'От создания поста до слота, в который он вышел, — в среднем по вышедшим постам.',
    originsHint:
      'Откуда взялись вышедшие и неудачные посты: редактор, агент, API, автопостинг.',
    reasonsHint:
      'Слова самой площадки о каждой неудаче, частые сверху.',
    loading: 'Загружаем производственную аналитику',
    daysUnit: 'дн.',
    longContent:
      'Фильтры сохраняют выбранный период и канал даже при длинных названиях рабочих пространств и каналов.',
  },
};

const Titled = ({
  as: Tag,
  title,
  hintLabel,
  hint,
  className,
}: {
  as: 'h3' | 'h4';
  title: string;
  hintLabel: string;
  hint: string;
  className: string;
}) => (
  <div className="flex min-w-0 items-center gap-[4px]">
    <Tag className={className}>{title}</Tag>
    <Hint label={hintLabel}>{hint}</Hint>
  </div>
);

/**
 * «Аналитика → Производство».
 *
 * `97dq.73` (thirteenth walk C3): the section fills its width like Content
 * and Audience — the centred 1180px column left the right side empty — and
 * opens with the plan ahead (`ahead`), which is about the days to come and so
 * follows neither the period nor its emptiness. Below it, the period's
 * numbers, each card with its «?». Loading, error and empty are the shared
 * states; the retry is a real button.
 */
export function ProductionAnalyticsView({
  state,
  locale,
  model,
  controls,
  labels,
  ahead,
  onRetry,
}: {
  state: AnalyticsSurfaceState;
  locale: 'en' | 'ru';
  model: ProductionAnalyticsModel;
  controls?: ReactNode;
  labels?: Partial<ProductionAnalyticsLabels>;
  /** The plan ahead (`97dq.59`, `97dq.73`): full width, above the period. */
  ahead?: ReactNode;
  /** Reloads the period's numbers; without it the error has no button. */
  onRetry?: () => void;
}) {
  const t = { ...copy[locale], ...labels };

  const period =
    state === 'loading' ? (
      <SkeletonRows rows={4} label={t.loading} />
    ) : state === 'error' ? (
      <ErrorState
        title={t.error}
        action={
          onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              {t.retry}
            </Button>
          ) : undefined
        }
      />
    ) : state === 'empty' ? (
      <div className="rounded-[8px] border border-cf-border bg-cf-surface">
        <EmptyState title={t.empty} />
      </div>
    ) : (
      <>
        <div className="grid grid-cols-4 gap-[12px] tablet:grid-cols-2 mobile:grid-cols-1">
          {(
            [
              [t.published, t.publishedHint, model.summary.publishedVolume],
              [t.failed, t.failedHint, model.summary.failureCount],
              [t.rate, t.rateHint, `${model.summary.failureRate}%`],
              [
                t.lead,
                t.leadHint,
                `${model.summary.averageLeadTimeHours} ${t.hours}`,
              ],
            ] as const
          ).map(([label, hint, value]) => (
            <article
              key={label}
              className="flex min-w-0 flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
            >
              <Titled
                as="h4"
                title={label}
                hintLabel={t.hintFor(label)}
                hint={hint}
                className="cf-label-md min-w-0 text-cf-ink-muted"
              />
              <div className="cf-display-num tabular-nums">{value}</div>
            </article>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-[12px] tablet:grid-cols-1">
          <section className="rounded-[8px] border border-cf-border bg-cf-surface p-[20px]">
            <Titled
              as="h4"
              title={t.origins}
              hintLabel={t.hintFor(t.origins)}
              hint={t.originsHint}
              className="cf-heading-md"
            />
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
            <Titled
              as="h4"
              title={t.reasons}
              hintLabel={t.hintFor(t.reasons)}
              hint={t.reasonsHint}
              className="cf-heading-md"
            />
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
    );

  return (
    <section
      data-analytics-view="production"
      data-analytics-state={state}
      className="flex min-w-0 flex-col gap-[24px] bg-cf-canvas p-[20px] text-cf-ink md:p-[24px]"
    >
      <div className="flex items-end justify-between gap-[24px] tablet:flex-col tablet:items-stretch">
        <div className="min-w-0">
          <h2 className="cf-heading-lg text-balance">{t.title}</h2>
          <p className="cf-body-md mt-[8px] max-w-[70ch] text-cf-ink-muted text-pretty">
            {state === 'long-content'
              ? `${t.description} ${t.longContent}`
              : t.description}
          </p>
        </div>
        {controls ?? (
          <div className="cf-caption rounded-[4px] border border-cf-border px-[12px] py-[8px] text-cf-ink-muted">
            {model.days} {t.daysUnit} · {model.channelName}
          </div>
        )}
      </div>

      {ahead ?? null}

      <section
        data-production-period={state}
        className="flex min-w-0 flex-col gap-[12px]"
      >
        <Titled
          as="h3"
          title={t.period}
          hintLabel={t.hintFor(t.period)}
          hint={t.periodHint}
          className="cf-heading-md"
        />
        {period}
      </section>
    </section>
  );
}
