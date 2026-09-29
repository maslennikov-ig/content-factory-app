/**
 * «Свежо до» — the last day a fact holds, whole (`content-factory-next-kcxz.43`).
 *
 * One rule for the fact form (`buildFactCreatePayload`) and the chat's
 * `facts.add` (`kcxz.24`, review W4-24 F4): the named day is the last day
 * the fact still holds, that day included, in the person's time zone. It is
 * stored as that day's last moment there, so a fact typed «до 31.12» leaves
 * the brief when the 31st is over where the person lives — not at 00:00 UTC
 * of the 31st, which is what the form stored before (owner, 28.09.2026).
 *
 * The zone is the one the screens read and write times in: `getTimezone()`
 * on the screen, the same zone the chat is sent as `x-agent-timezone`.
 * Rows the form wrote before keep 00:00 UTC of their day and are not
 * migrated (owner, 28.09.2026): they leave the brief at that moment — early on
 * the named day in a zone ahead of UTC (shown as that day), the evening before
 * in a zone behind it (shown as the day before). A day already over is
 * refused on both paths (`factDayProblem`). The zone's fallback is the
 * screens' one (`firstKnownZone` in `person-time.ts`).
 *
 * Only `person-time.ts` (import-free) is imported, so the frontend can load
 * this file as it loads `fact-claim-key.ts`.
 */
import { localClock, localDayStart } from '../../chat/capabilities/person-time';

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-02-30` and `2026-13-01` are not days. */
export const isFactCalendarDay = (day: string): boolean => {
  if (!DAY_SHAPE.test(day)) return false;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
};

const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);

/** Today (`YYYY-MM-DD`) in the zone. */
export const factToday = (zone: string, now: Date = new Date()): string =>
  localClock(now, zone).slice(0, 10);

/**
 * The named last day as the moment stored in `freshUntil`: the last
 * millisecond of that day in the zone. `null` for anything that is not a
 * calendar day.
 */
export const factValidUntilMoment = (day: string, zone: string): string | null => {
  const key = day.trim();
  if (!isFactCalendarDay(key)) return null;
  return new Date(localDayStart(nextDay(key), zone).getTime() - 1).toISOString();
};

/** Why a named «Свежо до» day cannot be stored: not a day, or already over. */
export type FactDayProblem = 'invalid' | 'past';

/**
 * The one check before a «Свежо до» day is stored, for the form and the chat
 * (`kcxz.43` review F4): a day that is not a calendar day, or one already
 * over in the zone (the fact would be out of date at once). `null` when the
 * day may be stored; today is allowed — it holds until today is over.
 */
export const factDayProblem = (
  day: string,
  zone: string,
  now: Date = new Date()
): FactDayProblem | null => {
  const key = day.trim();
  if (!isFactCalendarDay(key)) return 'invalid';
  return key < factToday(zone, now) ? 'past' : null;
};

/**
 * The door's half of the same rule (W4 live walk 29.09.2026, P3-D): a
 * `freshUntil` moment that is already over — the last moment of a day that
 * has ended wherever it was named — would store a fact out of date at once.
 * The form and the chat refuse the day before they build the moment; the
 * service refuses the moment, whoever sends it.
 */
export const factMomentOver = (moment: Date, now: Date = new Date()): boolean =>
  moment.getTime() < now.getTime();

/**
 * A stored `freshUntil` read back as the day the person named
 * (`YYYY-MM-DD`), or `null`. The day's last moment reads as that day, so
 * what was stored from a day shows that same day again.
 */
export const factValidUntilDay = (value: unknown, zone: string): string | null => {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isFinite(date.getTime()) ? localClock(date, zone).slice(0, 10) : null;
};
