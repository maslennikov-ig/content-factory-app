/**
 * The person's time zone and how a moment is said in it (`kcxz.15`).
 *
 * The screens read and write times in the browser's zone (`set.timezone.tsx`,
 * `newDayjs`); the chat does the same. The browser names its IANA zone in
 * `AGENT_TIMEZONE_HEADER`; the door takes it only when `Intl` knows it, else
 * the person's saved standard offset (`User.timezone`, minutes), else UTC.
 * The result is one primitive in the server-built identity. Offsets are read
 * from `Intl` per moment, so summer time is right on either side of a switch.
 */

const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$|^[+-]\d{2}:\d{2}$/;

/** The canonical zone `Intl` knows, or `null` for anything else. */
export const resolveTimeZone = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 64 || !ZONE_SHAPE.test(candidate)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

const two = (value: number) => String(value).padStart(2, '0');

/** `User.timezone` (standard offset in minutes) as an offset zone; `null` when unusable. */
export const timeZoneOfOffset = (minutes: unknown): string | null => {
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || Math.abs(minutes) > 840) {
    return null;
  }
  if (!minutes) return 'UTC';
  const sign = minutes < 0 ? '-' : '+';
  return `${sign}${two(Math.floor(Math.abs(minutes) / 60))}:${two(Math.abs(minutes) % 60)}`;
};

/**
 * The door's rule: the browser's zone, else the saved offset, else UTC.
 *
 * The saved offset is `User.timezone`, a standard offset in minutes: it knows
 * no summer time, and the profile keeps no zone name to recover it from, so a
 * DST zone read this way is an hour off half the year (review W2 F6). It is
 * the fallback only — the screen sends the zone its calendar uses — and the
 * conductor tells the model to confirm a firm time when it applies.
 */
export const agentTimeZone = (header: unknown, savedOffsetMinutes: unknown): string =>
  resolveTimeZone(header) ?? timeZoneOfOffset(savedOffsetMinutes) ?? 'UTC';

/** A zone that is not usable reads as UTC here: never a guess. */
const usable = (zone: string) => resolveTimeZone(zone) ?? 'UTC';

/** Minutes the zone is ahead of UTC at this moment (summer time included). */
export const zoneOffsetMinutes = (zone: string, at: Date): number => {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: usable(zone), timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '-' ? -minutes : minutes;
};

/** «UTC+3», «UTC+5:30», «UTC» — the offset at this moment. */
export const zoneLabel = (zone: string, at: Date): string => {
  const offset = zoneOffsetMinutes(zone, at);
  if (!offset) return 'UTC';
  const sign = offset < 0 ? '-' : '+';
  const rest = Math.abs(offset) % 60;
  return `UTC${sign}${Math.floor(Math.abs(offset) / 60)}${rest ? `:${two(rest)}` : ''}`;
};

/** «вт 29.09 10:00 (UTC+3)»: how the card and the model say a moment. */
export const localTime = (iso: unknown, zone: string, language: 'ru' | 'en'): string | null => {
  const moment = typeof iso === 'string' || iso instanceof Date ? new Date(iso) : null;
  if (!moment || Number.isNaN(moment.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
      timeZone: usable(zone),
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(moment)
      .map((part) => [part.type, part.value])
  );
  return `${parts.weekday} ${parts.day}.${parts.month} ${parts.hour}:${parts.minute} (${zoneLabel(zone, moment)})`;
};

/** The first instant of a `YYYY-MM-DD` day in the zone. */
export const localDayStart = (key: string, zone: string): Date => {
  const [year, month, date] = key.split('-').map(Number);
  const midnight = Date.UTC(year, month - 1, date);
  // The offset of the day's midnight, read twice so a switch at night lands right.
  const first = midnight - zoneOffsetMinutes(zone, new Date(midnight)) * 60_000;
  return new Date(midnight - zoneOffsetMinutes(zone, new Date(first)) * 60_000);
};

/** `YYYY-MM-DD HH:mm` of a moment in the zone. */
export const localClock = (at: Date, zone: string): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: usable(zone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};
