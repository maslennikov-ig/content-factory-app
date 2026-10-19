import { researchDateSpans } from '../content-intelligence/intake/research-intent';

type EventMaterialIntent = {
  eventInterval: { start: string; end: string } | null;
  timezone: string;
};

/**
 * Retrieval only: select an existing contiguous source span around an explicit
 * date in the event interval. This is not event admission and never supplies a
 * missing year, date, or claim. The reader still validates the selected quotes.
 */
export const researchEventMaterial = (
  text: string | undefined,
  intent: EventMaterialIntent,
  scanLimit: number
): string | undefined => {
  if (!text || !intent.eventInterval) return undefined;
  const bounded = text.slice(0, scanLimit);
  const day = (instant: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: intent.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(instant));
  const start = day(intent.eventInterval.start);
  const end = day(intent.eventInterval.end);
  // No defaultYear: an undated/yearless heading remains unknown.
  const dates = researchDateSpans(bounded);
  // Date syntax is a retrieval anchor only. The semantic reader decides
  // which date belongs to which event; no metadata/future phrase dictionary.
  const within = dates.filter(date => date.start <= end && date.end >= start);
  const headingDate = (index: number) => /^\s*(?:#{1,6}\s*)?$/.test(
    bounded.slice(bounded.lastIndexOf('\n', index) + 1, index));
  // Prefer a dated section on a long page; otherwise retain the provider's
  // query-selected snippet. This is a layout/size choice, not event admission.
  const relevant = within.find(date => headingDate(date.index)) ??
    (bounded.length <= 1_600 ? within[0] : undefined);
  if (!relevant) return undefined;
  const paragraphStart = bounded.lastIndexOf('\n\n', relevant.index);
  const lineStart = bounded.lastIndexOf('\n', relevant.index);
  // Prefer the heading's own line; prose retains its full paragraph.
  const headingPrefix = bounded.slice(lineStart + 1, relevant.index);
  const from = /^\s*(?:#{1,6}\s*)?$/.test(headingPrefix)
    ? lineStart + 1
    : paragraphStart < 0
    ? 0
    : paragraphStart + 2;
  // Stop before a different dated section outside the interval. Dates within
  // prose are retained as context, never spliced into a synthetic quotation.
  const nextSection = dates.find((date) => {
    if (
      date.index <= relevant.index ||
      (date.start <= end && date.end >= start)
    )
      return false;
    const previousLine = bounded.lastIndexOf('\n', date.index);
    return /^\s*(?:#{1,6}\s*)?$/.test(
      bounded.slice(previousLine + 1, date.index)
    );
  });
  const to = nextSection
    ? bounded.lastIndexOf('\n', nextSection.index) + 1
    : bounded.length;
  return bounded.slice(from, to).trimEnd() || undefined;
};
