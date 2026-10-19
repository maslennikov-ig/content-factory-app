import type { IntakeTemporalConstraintV1 } from './request-understanding';

/** Shared, serializable event-time contract. Publication and crawl dates are not event dates. */
export const RESEARCH_INTENT_VERSION = 'research-intent/v1' as const;
export type ResearchEventDateV1 = {
  eventDate: string;
  eventDateQuote: string;
  precision: 'day';
  sourcePublishedAt: string | null;
};
export type ResearchIntentV1 = {
  version: typeof RESEARCH_INTENT_VERSION;
  task: string;
  priorExample: string | null;
  asOf: string;
  timezone: string;
  mode: 'general' | 'delta' | 'historical' | 'recent';
  eventInterval: { start: string; end: string } | null;
  priorCoverageEnd: string | null;
  exclusions: string[];
  clarification: string | null;
};

const MONTHS = [
  'январ|january|jan', 'феврал|february|feb', 'март|march|mar',
  'апрел|april|apr', 'ма[йя]|may', 'июн|june|jun',
  'июл|july|jul', 'август|august|aug', 'сентябр|september|sep',
  'октябр|october|oct', 'ноябр|november|nov', 'декабр|december|dec',
];
const monthPattern = MONTHS.join('|');
const DAY = 86_400_000;
export const researchTimezone = (value?: string): string => {
  try { new Intl.DateTimeFormat('en', { timeZone: value || 'UTC' }).format(); return value || 'UTC'; }
  catch { return 'UTC'; }
};
const localDate = (instant: Date, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);

/** Calendar midnight in the caller's zone, including DST rather than a fixed offset. */
export const researchDayStart = (day: string, timezone: string): string => {
  const desired = Date.parse(`${day}T00:00:00Z`);
  let candidate = desired;
  for (let i = 0; i < 4; i += 1) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(candidate);
    const get = (key: string) => parts.find(part => part.type === key)!.value;
    const shown = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);
    const adjustment = desired - shown;
    candidate += adjustment;
    if (!adjustment) break;
  }
  return new Date(candidate).toISOString();
};
const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const validDay = (year: number, month: number, day: number): string | null => {
  const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return Number.isFinite(Date.parse(result)) && new Date(result).toISOString().slice(0, 10) === result ? result : null;
};

type DateSpan = { start: string; end: string; index: number; text: string };
/** Calendar syntax for locating source spans; never request understanding. */
export const researchDateSpans = (text: string, defaultYear?: number): DateSpan[] => {
  const spans: DateSpan[] = [];
  const add = (start: string | null, end: string | null, match: RegExpMatchArray) => {
    if (start && end && end >= start) spans.push({ start, end, index: match.index!, text: match[0] });
  };
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})(?:\s*(?:–|—|to|through|до|по)\s*(20\d{2})-(\d{2})-(\d{2}))?\b/gi)) {
    add(validDay(+m[1], +m[2], +m[3]), validDay(+(m[4] || m[1]), +(m[5] || m[2]), +(m[6] || m[3])), m);
  }
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/g)) {
    add(validDay(+m[3], +m[2], +m[1]), validDay(+m[3], +m[2], +m[1]), m);
  }
  const named = new RegExp(`\\b(\\d{1,2})(?:\\s*(?:[-–—]|to|through|до|по)\\s*(\\d{1,2}))?\\s*(${monthPattern})[a-zа-я]*(?:[ ,]+(20\\d{2}))?`, 'giu');
  for (const m of text.matchAll(named)) {
    const year = m[4] ? +m[4] : defaultYear;
    if (!year) continue;
    const month = MONTHS.findIndex(pattern => new RegExp(`^(?:${pattern})`, 'iu').test(m[3])) + 1;
    add(validDay(year, month, +m[1]), validDay(year, month, +(m[2] || m[1])), m);
  }
  const english = new RegExp(`(${monthPattern})[a-z]*\\s+(\\d{1,2})(?!\\d)(?:\\s*[-–—]\\s*(\\d{1,2}))?(?:[ ,]+(20\\d{2}))?`, 'giu');
  for (const m of text.matchAll(english)) {
    const year = m[4] ? +m[4] : defaultYear;
    if (!year) continue;
    const month = MONTHS.findIndex(pattern => new RegExp(`^(?:${pattern})`, 'iu').test(m[1])) + 1;
    add(validDay(year, month, +m[2]), validDay(year, month, +(m[3] || m[2])), m);
  }
  return spans.sort((a, b) => a.index - b.index);
};

type ResearchIntentInput = {
  input: string; task?: string; priorExample?: string; timeZone?: string; now: Date;
  temporal?: IntakeTemporalConstraintV1 | null;
};

/** Calendar validation is shared; legacy callers retain their mode-boundary policy. */
const resolveResearchIntentWithPolicy = (input: ResearchIntentInput, requireModeBoundaries: boolean): ResearchIntentV1 => {
  const timezone = researchTimezone(input.timeZone);
  const temporal = input.temporal;
  const result: ResearchIntentV1 = {
    version: RESEARCH_INTENT_VERSION, task: input.task?.trim() || input.input,
    priorExample: input.priorExample || null, asOf: input.now.toISOString(), timezone,
    mode: temporal?.mode ?? 'general', eventInterval: null, priorCoverageEnd: null,
    exclusions: temporal?.exclusions ?? [], clarification: null,
  };
  const instant = (value: string, edge: 'start' | 'end'): string | null => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      if (!validDay(year, month, day)) return null;
      return edge === 'start' ? researchDayStart(value, timezone)
        : new Date(Date.parse(researchDayStart(shiftDay(value, 1), timezone)) - 1).toISOString();
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    if (!validDay(year, month, day) || !Number.isFinite(Date.parse(value))) return null;
    return new Date(value).toISOString();
  };
  if (temporal?.priorCoverageEnd) {
    result.priorCoverageEnd = instant(temporal.priorCoverageEnd, 'end');
    if (!result.priorCoverageEnd) result.clarification = 'Invalid structured prior-coverage boundary; resolve the requested boundary.';
  }
  if (temporal?.eventInterval) {
    const start = instant(temporal.eventInterval.start, 'start');
    const end = instant(temporal.eventInterval.end, 'end');
    if (!start || !end || start > end) {
      result.clarification = 'Invalid structured event interval; resolve the requested start and end.';
    } else {
      result.eventInterval = { start, end: new Date(Math.min(Date.parse(end), input.now.getTime())).toISOString() };
      if (requireModeBoundaries && result.mode === 'general') result.clarification = 'Structured general mode conflicts with the supplied event interval; resolve the intended scope.';
      if ((result.mode === 'delta' || !requireModeBoundaries) && result.priorCoverageEnd && start <= result.priorCoverageEnd) {
        result.clarification = 'The new-event interval overlaps the explicit prior-coverage boundary; resolve the intended scope.';
      }
      if (start > result.eventInterval.end) result.clarification = 'The requested event interval has not started.';
    }
  } else if ((result.mode === 'delta' || !requireModeBoundaries) && result.priorCoverageEnd) {
    result.eventInterval = { start: new Date(Date.parse(result.priorCoverageEnd) + 1).toISOString(), end: result.asOf };
    if (result.eventInterval.start > result.eventInterval.end) result.clarification = 'The requested event interval has not started.';
  } else if (requireModeBoundaries && result.mode !== 'general' && !result.clarification) {
    result.clarification = 'A temporal request needs a model-resolved interval or prior-coverage boundary.';
  }
  if (!requireModeBoundaries && !result.eventInterval && !result.clarification) result.mode = 'general';
  return result;
};

/** Frozen policy for existing callers and stored versioned workflows. */
export const resolveResearchIntent = (input: ResearchIntentInput): ResearchIntentV1 =>
  resolveResearchIntentWithPolicy(input, true);

/** The model's explicit boundaries constrain research; a descriptive mode cannot invent them. */
export const resolveResearchIntentV2 = (input: ResearchIntentInput): ResearchIntentV1 =>
  resolveResearchIntentWithPolicy(input, false);

export const admitResearchEvent = (intent: ResearchIntentV1 | undefined,
  evidence: { quote: string; eventDate?: string | null; eventDateQuote?: string | null; material: string }
): 'admitted' | 'unknown_date' | 'outside_period' | 'clarification' => {
  if (!intent?.eventInterval) return intent?.clarification ? 'clarification' : 'admitted';
  const date = evidence.eventDate;
  const dateQuote = evidence.eventDateQuote?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !dateQuote || dateQuote.length > 600 || !evidence.material.replace(/\s+/g, ' ').includes(dateQuote.replace(/\s+/g, ' '))) return 'unknown_date';
  // The model identifies the event/date relationship. Code checks only a
  // faithful source span, an explicit valid calendar value and the interval.
  // Neighbouring dates or future wording cannot veto an unrelated dated event.
  const [year, month, day] = date.split('-').map(Number);
  if (!validDay(year, month, day)) return 'unknown_date';
  const start = Date.parse(researchDayStart(date, intent.timezone));
  const end = Date.parse(researchDayStart(shiftDay(date, 1), intent.timezone)) - 1;
  return end < Date.parse(intent.eventInterval.start) || start > Date.parse(intent.eventInterval.end) ? 'outside_period' : 'admitted';
};

export const researchIntentQuery = (intent: ResearchIntentV1): string => [
  intent.task,
  ...(intent.eventInterval ? [`Event interval: ${intent.eventInterval.start} through ${intent.eventInterval.end} (${intent.timezone}). Find events in this interval, not page update dates.`] : []),
  ...(intent.priorCoverageEnd ? [`Previous coverage ends ${intent.priorCoverageEnd}; exclude previously covered events.`] : []),
].join('\n');
