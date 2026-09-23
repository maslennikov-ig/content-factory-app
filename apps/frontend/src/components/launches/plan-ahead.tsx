'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Hint } from '@contentfactory/react/layout/hint';
import { ControlButton } from '@contentfactory/react/choice/control.button';
import { Popover } from '@contentfactory/frontend/components/ui/layers';
import { SectionLabel } from '@contentfactory/frontend/components/ui/section-label';
import { calendarPlanningCopy } from './calendar-planning.copy';
import { PLAN_STATES_IN_LEGEND } from './calendar-plan';
import { PlanStatePill } from './post-card.parts';

/**
 * «Впереди N дней» (`content-factory-next-97dq.59`, owner pick 23.09.2026).
 *
 * How many days in a row, starting today, each hold a post «в плане» or
 * «в очереди» in the selected channels. The number is counted on the server
 * (`GET /analytics/ahead`, `calculatePlanAhead`) in the reader's time zone:
 * the calendar only ever holds the range on screen, and a day view cannot
 * know about next Tuesday.
 *
 * Two places read it: a chip in the calendar header on every view — hover
 * or focus lists the channels, «N дней · до DD.MM» or «пусто с DD.MM» — and a
 * card in «Аналитика → Производство» with the big number and a 14-day strip.
 */

export type PlanAheadStreak = {
  days: number;
  until: string | null;
  emptyFrom: string;
};

export type PlanAhead = PlanAheadStreak & {
  version: 'plan-ahead/v1';
  today: string;
  horizon: number;
  strip: Array<{ date: string; filled: boolean }>;
  channels: Array<PlanAheadStreak & { integrationId: string; name: string }>;
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

/** The chip's words: «впереди 6 дней · до вт 29.09» or «впереди пусто». */
export const aheadLabel = (ahead: PlanAheadStreak, locale: Locale) =>
  calendarPlanningCopy[locale].ahead(
    ahead.days,
    ahead.until ? aheadDay(ahead.until, locale, true) : ''
  );

/** One channel's line in the hover list. */
export const aheadChannelLine = (channel: PlanAheadStreak, locale: Locale) =>
  channel.days && channel.until
    ? calendarPlanningCopy[locale].aheadChannel(
        channel.days,
        aheadDay(channel.until, locale)
      )
    : calendarPlanningCopy[locale].aheadEmptyFrom(
        aheadDay(channel.emptyFrom, locale)
      );

export function usePlanAhead(
  integrationIds: readonly string[],
  timeZone: string,
  /** Anything that changes when the calendar reloads: the count follows. */
  revision?: unknown
) {
  const request = useFetch();
  const url = planAheadUrl(integrationIds, timeZone);
  const load = useCallback(async () => {
    const response = await request(url);
    if (!response.ok) throw new Error('plan ahead unavailable');
    const body = await response.json();
    if (body?.version !== 'plan-ahead/v1') throw new Error('unsupported');
    return body as PlanAhead;
  }, [request, url]);
  const swr = useSWR(url, load, { revalidateOnFocus: false });
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

/**
 * The header chip. Hover, focus or a press opens the channel list; Escape,
 * leaving it, or a press outside closes it. The «?» beside it says what the
 * number counts.
 */
export const PlanAheadChip: FC<{
  locale: Locale;
  integrationIds: readonly string[];
  timeZone: string;
  revision?: unknown;
}> = ({ locale, integrationIds, timeZone, revision }) => {
  const copy = calendarPlanningCopy[locale];
  const { data, error } = usePlanAhead(integrationIds, timeZone, revision);
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const outside = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('mousedown', outside);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('mousedown', outside);
    };
  }, [open]);

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
      </span>
    );
  }

  return (
    <span
      ref={holder}
      data-plan-ahead={data.days}
      className="relative inline-flex h-[40px] items-center gap-[4px]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <ControlButton
        density="dense"
        aria-expanded={open}
        className={clsx(
          'inline-flex items-center gap-[8px] rounded-[8px] border px-[8px] cf-label-md tabular-nums whitespace-nowrap',
          data.days
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
      <Hint label={copy.aheadHintLabel}>{copy.aheadHint}</Hint>
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
                    channel.days ? 'text-cf-ink' : 'text-cf-ink-muted'
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

/** The legend of the state pills, with the «?» that says what they mean. */
export const PlanLegend: FC<{ locale: Locale }> = ({ locale }) => {
  const copy = calendarPlanningCopy[locale];
  const words = {
    reserved: copy.slotReserved,
    queued: copy.slotQueued,
    draft: copy.stateDraft,
    published: copy.statePublished,
    error: copy.stateError,
  } as const;
  return (
    <span
      data-plan-legend="true"
      className="hidden items-center gap-[4px] lg:inline-flex"
    >
      {PLAN_STATES_IN_LEGEND.map((state) => (
        <PlanStatePill key={state} state={state} label={words[state]} />
      ))}
      <Hint label={copy.legendLabel}>{copy.legendHint}</Hint>
    </span>
  );
};

/** «Аналитика → Производство»: the number, big, and the next 14 days. */
export const PlanAheadCard: FC<{
  locale: Locale;
  timeZone: string;
}> = ({ locale, timeZone }) => {
  const copy = calendarPlanningCopy[locale];
  const { data, error, isLoading } = usePlanAhead([], timeZone);
  return (
    <article
      data-plan-ahead-card="true"
      className="flex min-w-0 flex-col gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
    >
      <div className="flex items-center gap-[4px]">
        <SectionLabel as="h3">{copy.aheadCardTitle}</SectionLabel>
        <Hint label={copy.aheadHintLabel}>{copy.aheadCardHint}</Hint>
      </div>
      {isLoading ? (
        <div className="h-[56px] rounded-[8px] bg-cf-surface-subtle" aria-busy="true" />
      ) : error || !data ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {copy.aheadError}
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-[8px]">
            <span className="cf-heading-lg tabular-nums">{data.days}</span>
            <span className="cf-body-sm text-cf-ink">
              {copy.aheadCardDays(data.days)}
              {data.until ? ` · ${aheadDay(data.until, locale, true)}` : ''}
            </span>
          </div>
          <ol
            data-plan-ahead-strip="true"
            aria-label={copy.aheadCardStrip}
            className="flex gap-[4px]"
          >
            {data.strip.map((day) => (
              <li
                key={day.date}
                data-filled={day.filled}
                title={aheadDay(day.date, locale, true)}
                className={clsx(
                  'h-[16px] flex-1 rounded-[4px]',
                  day.filled ? 'bg-cf-accent' : 'bg-cf-surface-subtle'
                )}
              />
            ))}
          </ol>
          <p className="cf-caption text-cf-ink-muted">{copy.aheadCardStrip}</p>
        </>
      )}
    </article>
  );
};
