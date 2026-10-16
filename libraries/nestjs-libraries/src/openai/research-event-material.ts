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
  // A page dateline is evidence of publication/update time, never the
  // event anchor. Skipping it lets a later dated section (or the caller's
  // query-selected snippet) retain its own date and claim together.
  const metadataDate = (index: number) => {
    const lineStart = bounded.lastIndexOf('\n', index) + 1;
    const prefix = bounded
      .slice(lineStart, index)
      .replace(/^[\s#*>_]+/, '')
      .replace(/[\s*_]+$/, '');
    return /^(?:published(?:\s+(?:on|at))?|publication date|date published|posted(?:\s+(?:on|at))?|updated(?:\s+(?:on|at))?|last (?:updated|modified|revised)(?:\s+(?:on|at))?|created(?:\s+(?:on|at))?|опубликован[оа]?|обновл[её]н[оа]?|дата (?:публикации|обновления|создания))\s*[:：–—-]?\s*$/iu.test(
      prefix
    );
  };
  const relevant = dates.find(
    (date) =>
      date.start <= end && date.end >= start && !metadataDate(date.index)
  );
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
