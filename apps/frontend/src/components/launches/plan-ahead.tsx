'use client';

import { Panel } from '@contentfactory/react/layout';
import { FC, useCallback, useEffect, useRef } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Hint } from '@contentfactory/react/layout/hint';
import { ControlButton } from '@contentfactory/react/choice/control.button';
import { Popover } from '@contentfactory/frontend/components/ui/layers';
import { SectionLabel } from '@contentfactory/frontend/components/ui/section-label';
import { calendarPlanningCopy } from './calendar-planning.copy';
import { PLAN_STATES_IN_LEGEND } from './calendar-plan';
import { PLAN_STATE_CLASS, PlanStatePill } from './post-card.parts';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { EmptyState, ErrorState, SkeletonRows } from '../ui/surface';
import { Table, Td, Th, Tr } from '../ui/table';
import { usePopoverTrigger } from '../ui/use-popover-trigger';
import { Metric } from '../ui/metric';

/**
 * The plan ahead (`content-factory-next-97dq.59`, counts since `97dq.73`).
 *
 * The thirteenth walk (C3) could not read the streak: «0 дней впереди» and
 * «14 дней закрашено» meant nothing. The owner asked how many posts are
 * planned, how many are ahead, and how far the plan reaches. So both places
 * now speak in counts, counted on the server (`GET /analytics/ahead`,
 * `calculatePlanAhead`, `plan-ahead/v2`) in the reader's time zone:
 *
 * - the calendar chip: «В плане 3 поста · до чт 24.09» or «План пуст»;
 *   reserved and queued posts both count; hover or focus lists channels;
 * - «Аналитика → Производство»: four numbers, the next 14 days with a count
 *   per day, and a table per channel.
 */

export type PlanAheadStreak = {
  days: number;
  until: string | null;
  emptyFrom: string;
};

export type PlanAheadCounts = {
  reserved: number;
  queued: number;
  planned: number;
  planUntil: string | null;
  published7d: number;
};

export type PlanAheadDay = {
  date: string;
  filled: boolean;
  reserved: number;
  queued: number;
  published: number;
};

export type PlanAhead = PlanAheadStreak &
  PlanAheadCounts & {
    version: 'plan-ahead/v2';
    today: string;
    horizon: number;
    daysWithPosts: number;
    strip: PlanAheadDay[];
    channels: Array<
      PlanAheadStreak & PlanAheadCounts & { integrationId: string; name: string }
    >;
  };

type Locale = 'ru' | 'en';

export const planAheadUrl = (integrationIds: readonly string[], timeZone: string) => {
  const params = new URLSearchParams();
  if (integrationIds.length) {
    params.set('integrationIds', [...integrationIds].sort().join(','));
  }
  if (timeZone) params.set('timeZone', timeZone);
  const query = params.toString();
  return `/analytics/ahead${query ? `?${query}` : ''}`;
};

/** `YYYY-MM-DD` as «вт 29.09» (or «29.09» without the weekday). */
export const aheadDay = (key: string, locale: Locale, weekday = false) => {
  const [year, month, day] = key.split('-').map(Number);
  const at = new Date(Date.UTC(year, month - 1, day));
  const two = (value: number) => String(value).padStart(2, '0');
  const date = `${two(day)}.${two(month)}`;
  if (!weekday) return date;
  const name = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  })
    .format(at)
    .replace('.', '');
  return `${name} ${date}`;
};

/** The chip's words: «В плане 3 поста · до чт 24.09» or «План пуст». */
export const aheadLabel = (ahead: PlanAheadCounts, locale: Locale) =>
  calendarPlanningCopy[locale].aheadChip(
    ahead.planned,
    ahead.planUntil ? aheadDay(ahead.planUntil, locale, true) : ''
  );

/** One channel's line in the hover list: «2 поста · до 29.09» or «пусто». */
export const aheadChannelLine = (channel: PlanAheadCounts, locale: Locale) =>
  calendarPlanningCopy[locale].aheadChannel(
    channel.planned,
    channel.planUntil ? aheadDay(channel.planUntil, locale) : ''
  );

export function usePlanAhead(
  integrationIds: readonly string[],
  timeZone: string,
  /** Anything that changes when the calendar reloads: the count follows. */
  revision?: unknown,
  /** `false` asks nothing at all. */
  enabled = true
) {
  const request = useFetch();
  const url = planAheadUrl(integrationIds, timeZone);
  const load = useCallback(async () => {
    const response = await request(url);
    if (!response.ok) throw new Error('plan ahead unavailable');
    const body = await response.json();
    if (body?.version !== 'plan-ahead/v2') throw new Error('unsupported');
    return body as PlanAhead;
  }, [request, url]);
  const swr = useSWR(enabled ? url : null, load, { revalidateOnFocus: false });
  const { mutate } = swr;
  // The first fingerprint is the load SWR already made; later ones refetch.
  const seen = useRef<unknown>(undefined);
  useEffect(() => {
    if (revision === undefined) return;
    if (seen.current !== undefined && seen.current !== revision) void mutate();
    seen.current = revision;
  }, [revision, mutate]);
  return swr;
}

const CalendarGlyph = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

/** What the chip shows when the calendar has no channel to count. */
const NO_CHANNELS_AHEAD: PlanAheadCounts & Pick<PlanAhead, 'channels'> = {
  reserved: 0,
  queued: 0,
  planned: 0,
  planUntil: null,
  published7d: 0,
  channels: [],
};

/**
 * The header chip, always on the calendar toolbar. Hover, focus or a press
 * opens the channel list; Escape, leaving it, or a press outside closes it.
 * The «?» beside it says what the number counts — and, with `withLegend`
 * (`97dq.82`, header direction A), what the state pills on the calendar mean:
 * the separate legend row left the header, its words live here.
 */
export const PlanAheadChip: FC<{
  locale: Locale;
  integrationIds: readonly string[];
  timeZone: string;
  revision?: unknown;
  withLegend?: boolean;
}> = ({ locale, integrationIds, timeZone, revision, withLegend = false }) => {
  const copy = calendarPlanningCopy[locale];
  const hint = withLegend ? (
    <Hint label={copy.aheadLegendHintLabel}>
      <PlanLegendNote locale={locale} />
    </Hint>
  ) : (
    <Hint label={copy.aheadHintLabel}>{copy.aheadHint}</Hint>
  );
  /*
    No channel in view (a customer with none, or every one disabled) is an
    empty plan, not «the whole organisation»: an empty id list means the
    latter to the server, so the chip asks nothing and says «План пуст»
    (second review, item 4).
  */
  const noChannels = integrationIds.length === 0;
  const ahead = usePlanAhead(integrationIds, timeZone, revision, !noChannels);
  const data = noChannels ? NO_CHANNELS_AHEAD : ahead.data;
  const error = noChannels ? undefined : ahead.error;
  const { open, setOpen, holder } = usePopoverTrigger<HTMLSpanElement>();

  if (error || !data) {
    // Loading keeps the place; a failure says so quietly and nothing else.
    return (
      <span
        data-plan-ahead={error ? 'error' : 'loading'}
        className="inline-flex h-[40px] items-center gap-[4px]"
      >
        <span
          title={error ? copy.aheadError : undefined}
          className="inline-flex h-[32px] min-w-[160px] max-w-[280px] items-center gap-[8px] rounded-[8px] border border-cf-border px-[8px] cf-caption text-cf-ink-muted"
        >
          <CalendarGlyph />
          <span className="min-w-0 truncate">{error ? copy.aheadError : '…'}</span>
        </span>
        {withLegend ? hint : null}
      </span>
    );
  }

  return (
    <span
      ref={holder}
      data-plan-ahead={data.planned}
      className="relative inline-flex h-[40px] items-center gap-[4px]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <ControlButton
        density="dense"
        aria-expanded={open}
        className={clsx(
          'inline-flex items-center gap-[8px] rounded-[8px] border px-[8px] cf-label-md tabular-nums whitespace-nowrap',
          data.planned
            ? 'border-cf-border bg-cf-surface text-cf-ink'
            : 'border-dashed border-cf-border-strong bg-transparent text-cf-ink-muted'
        )}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // Opens only: a mouse press lands after the hover and the focus that
        // already opened it, and a toggle would shut it in the same gesture.
        onClick={() => setOpen(true)}
      >
        <CalendarGlyph />
        {aheadLabel(data, locale)}
      </ControlButton>
      {hint}
      {open && data.channels.length > 0 && (
        <Popover
          role="dialog"
          className="absolute top-[calc(100%+4px)] end-0 z-[60] w-[min(360px,calc(100vw-32px))] p-[12px]"
        >
          <SectionLabel as="p" className="pb-[8px]">
            {copy.aheadByChannel}
          </SectionLabel>
          <dl
            data-plan-ahead-channels="true"
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-[16px] gap-y-[8px] cf-body-sm"
          >
            {data.channels.map((channel) => (
              <div key={channel.integrationId} className="contents">
                <dt className="min-w-0 truncate text-cf-ink">{channel.name}</dt>
                <dd
                  className={clsx(
                    'tabular-nums whitespace-nowrap',
                    channel.planned ? 'text-cf-ink' : 'text-cf-ink-muted'
                  )}
                >
                  {aheadChannelLine(channel, locale)}
                </dd>
              </div>
            ))}
          </dl>
        </Popover>
      )}
    </span>
  );
};

/**
 * The legend of the state pills, now inside the plan chip's «?» (`97dq.82`):
 * what the count means, then each pill as the calendar draws it, then what
 * «в плане» and «в очереди» mean. It is the tooltip's text, so a screen
 * reader hears it through the trigger's `aria-describedby`.
 */
export const PlanLegendNote: FC<{ locale: Locale }> = ({ locale }) => {
  const copy = calendarPlanningCopy[locale];
  const words = {
    reserved: copy.slotReserved,
    queued: copy.slotQueued,
    draft: copy.stateDraft,
    published: copy.statePublished,
    error: copy.stateError,
  } as const;
  return (
    <span className="flex flex-col gap-[8px]">
      <span>{copy.aheadHint}</span>
      <span className="cf-label-md text-cf-ink">{copy.aheadLegendTitle}</span>
      <span data-plan-legend="true" className="flex flex-wrap items-center gap-[4px]">
        {PLAN_STATES_IN_LEGEND.map((state) => (
          <PlanStatePill key={state} state={state} label={words[state]} />
        ))}
      </span>
      <span>{copy.legendHint}</span>
    </span>
  );
};

/** One number with its name and its «?» — the shared `Metric` (`97dq.76`). */
const AheadMetric: FC<{
  label: string;
  hintLabel: string;
  hint: string;
  value: string;
  note?: string;
  metric: string;
}> = ({ label, hintLabel, hint, value, note, metric }) => (
  <Metric
    data-plan-ahead-metric={metric}
    label={label}
    hint={hint}
    hintLabel={hintLabel}
    value={value}
    note={note}
  />
);

/** A strip cell takes the tone of the calendar pill of its strongest state. */
const dayTone = (day: PlanAheadDay) =>
  day.queued
    ? PLAN_STATE_CLASS.queued
    : day.reserved
    ? PLAN_STATE_CLASS.reserved
    : day.published
    ? PLAN_STATE_CLASS.published
    : 'border-dashed border-cf-border text-cf-ink-muted bg-transparent';

/**
 * «Аналитика → Производство», the part about the days to come (`97dq.73`):
 * four numbers, the next 14 days with a count per day, and one row per
 * channel. It follows neither the period nor the channel filter of the
 * section: the future is not a period of the past.
 */
export const PlanAheadOverview: FC<{
  locale: Locale;
  timeZone: string;
}> = ({ locale, timeZone }) => {
  const copy = calendarPlanningCopy[locale];
  const { data, error, isLoading, mutate } = usePlanAhead([], timeZone);
  const hintFor = copy.aheadHintFor;
  const heading = (
    <div className="flex min-w-0 flex-col gap-[4px]">
      <div className="flex items-center gap-[4px]">
        <h3 className="cf-heading-md text-cf-ink">{copy.aheadTitle}</h3>
        <Hint label={copy.aheadHintLabel}>{copy.aheadHint}</Hint>
      </div>
      <p className="cf-body-sm max-w-[70ch] text-cf-ink-muted [text-wrap:pretty]">
        {copy.aheadDescription}
      </p>
    </div>
  );
  if (isLoading) {
    return (
      <section data-plan-ahead-overview="loading" className="flex min-w-0 flex-col gap-[12px]">
        {heading}
        <SkeletonRows rows={3} label={copy.aheadLoading} />
      </section>
    );
  }
  if (error || !data) {
    return (
      <section data-plan-ahead-overview="error" className="flex min-w-0 flex-col gap-[12px]">
        {heading}
        <ErrorState
          title={copy.aheadError}
          action={
            <Button variant="secondary" onClick={() => void mutate()}>
              {copy.retry}
            </Button>
          }
        />
      </section>
    );
  }
  const emptyDay =
    data.emptyFrom === data.today
      ? `${copy.today} · ${aheadDay(data.emptyFrom, locale, true)}`
      : aheadDay(data.emptyFrom, locale, true);
  const words = {
    reserved: copy.slotReserved,
    queued: copy.slotQueued,
    published: copy.statePublished,
  } as const;
  return (
    <section data-plan-ahead-overview="default" className="flex min-w-0 flex-col gap-[12px]">
      {heading}
      <div className="grid grid-cols-4 gap-[12px] tablet:grid-cols-2 mobile:grid-cols-1">
        <AheadMetric
          metric="planned"
          label={copy.kpiAhead}
          hintLabel={hintFor(copy.kpiAhead)}
          hint={copy.kpiAheadHint}
          value={String(data.planned)}
          note={copy.kpiAheadSplit(data.reserved, data.queued)}
        />
        <AheadMetric
          metric="days"
          label={copy.kpiDays}
          hintLabel={hintFor(copy.kpiDays)}
          hint={copy.kpiDaysHint}
          value={copy.kpiDaysValue(data.daysWithPosts, data.strip.length)}
        />
        <AheadMetric
          metric="until"
          label={copy.kpiUntil}
          hintLabel={hintFor(copy.kpiUntil)}
          hint={copy.kpiUntilHint}
          value={data.planUntil ? aheadDay(data.planUntil, locale) : '—'}
          note={
            data.planUntil
              ? aheadDay(data.planUntil, locale, true)
              : copy.kpiUntilNone
          }
        />
        <AheadMetric
          metric="empty"
          label={copy.kpiEmpty}
          hintLabel={hintFor(copy.kpiEmpty)}
          hint={copy.kpiEmptyHint}
          value={aheadDay(data.emptyFrom, locale)}
          note={emptyDay}
        />
      </div>

      <Panel
        as="article"
        contentPadding="default"
        className="min-w-0"
        contentClassName="flex flex-col gap-[12px]"
      >
        <div className="flex items-center gap-[4px]">
          <h4 className="cf-label-md text-cf-ink">{copy.stripTitle}</h4>
          <Hint label={hintFor(copy.stripTitle)}>{copy.stripHint}</Hint>
        </div>
        {data.planned === 0 && data.daysWithPosts === 0 ? (
          <EmptyState
            title={copy.aheadEmptyTitle}
            description={copy.aheadEmptyBody}
            action={
              <ButtonLink href="/launches" variant="secondary">
                {copy.aheadEmptyAction}
              </ButtonLink>
            }
          />
        ) : null}
        <ol
          data-plan-ahead-strip="true"
          aria-label={copy.stripTitle}
          className="grid grid-cols-7 gap-[4px] md:grid-cols-[repeat(14,minmax(0,1fr))]"
        >
          {data.strip.map((day) => {
            const total = day.reserved + day.queued + day.published;
            return (
              <li
                key={day.date}
                data-filled={day.filled}
                data-count={total}
                title={copy.stripDay(
                  aheadDay(day.date, locale, true),
                  day.reserved,
                  day.queued,
                  day.published
                )}
                className="flex min-w-0 flex-col items-center gap-[4px]"
              >
                <span className="cf-caption whitespace-nowrap text-cf-ink-muted">
                  {aheadDay(day.date, locale, true)}
                </span>
                <span
                  aria-hidden="true"
                  className={clsx(
                    'flex h-[40px] w-full items-center justify-center rounded-[4px] border cf-label-sm tabular-nums',
                    dayTone(day)
                  )}
                >
                  {total || '·'}
                </span>
                <span className="sr-only">
                  {copy.stripDay('', day.reserved, day.queued, day.published)}
                </span>
              </li>
            );
          })}
        </ol>
        <p
          data-plan-ahead-legend="true"
          className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px] cf-body-sm text-cf-ink-muted"
        >
          {(['queued', 'reserved', 'published'] as const).map((state) => (
            <span key={state} className="inline-flex items-center gap-[8px]">
              <PlanStatePill state={state} label={words[state]} />
              {copy.stripLegend[state]}
            </span>
          ))}
          <span className="inline-flex items-center gap-[8px]">
            <span
              aria-hidden="true"
              className="inline-block h-[20px] w-[20px] rounded-[4px] border border-dashed border-cf-border"
            />
            {copy.stripLegend.empty}
          </span>
        </p>
      </Panel>

      <Panel
        as="article"
        contentPadding="default"
        className="min-w-0"
        contentClassName="flex flex-col gap-[12px]"
      >
        <div className="flex items-center gap-[4px]">
          <h4 className="cf-label-md text-cf-ink">{copy.tableTitle}</h4>
          <Hint label={hintFor(copy.tableTitle)}>{copy.tableHint}</Hint>
        </div>
        {data.channels.length ? (
          <div data-plan-ahead-table="true">
            <Table caption={copy.tableTitle}>
              <thead>
                <tr>
                  <Th banded>{copy.colChannel}</Th>
                  <Th banded numeric>{copy.colReserved}</Th>
                  <Th banded numeric>{copy.colQueued}</Th>
                  <Th banded numeric>{copy.colPublished}</Th>
                  <Th banded numeric>{copy.colUntil}</Th>
                  <Th banded numeric>{copy.colEmpty}</Th>
                </tr>
              </thead>
              <tbody>
                {data.channels.map((channel) => (
                  <Tr key={channel.integrationId}>
                    <Td className="max-w-[320px] truncate" title={channel.name}>
                      {channel.name}
                    </Td>
                    <Td numeric>{channel.reserved}</Td>
                    <Td numeric>{channel.queued}</Td>
                    <Td numeric>{channel.published7d}</Td>
                    <Td numeric>
                      {channel.planUntil
                        ? aheadDay(channel.planUntil, locale, true)
                        : '—'}
                    </Td>
                    <Td numeric>{aheadDay(channel.emptyFrom, locale, true)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <EmptyState title={copy.tableEmpty} />
        )}
      </Panel>
    </section>
  );
};
