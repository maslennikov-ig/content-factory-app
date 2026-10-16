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
/** Bounded explicit calendar grammar; unsupported/ambiguous wording stays unknown. */
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
  const named = new RegExp(`\\b(\\d{1,2})(?:\\s*(?:[-–—]|to|through|до|по)\\s*(\\d{1,2}))?\\s+(${monthPattern})[a-zа-я]*(?:[ ,]+(20\\d{2}))?`, 'giu');
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

export const resolveResearchIntent = (input: {
  input: string; task?: string; priorExample?: string; timeZone?: string; now: Date;
}): ResearchIntentV1 => {
  const timezone = researchTimezone(input.timeZone);
  const today = localDate(input.now, timezone);
  const year = +today.slice(0, 4);
  let task = input.task?.trim() || input.input.trim();
  let prior = input.priorExample?.trim() || null;
  // Separate labelled old material; never let its historical range override the new task.
  if (!prior) {
    const marker = /(?:старый|предыдущий|прошлый)\s+(?:пост|обзор|текст)|(?:old|previous)\s+(?:post|overview|example)/iu.exec(task);
    const next = /(?:новое\s+задание|новая\s+задача|теперь|new\s+task)\s*[:：]?/iu.exec(task);
    if (marker && next && next.index > marker.index) {
      prior = task.slice(marker.index, next.index).trim();
      task = `${task.slice(0, marker.index)} ${task.slice(next.index + next[0].length)}`.trim();
    }
  }
  if (!prior && /(?:последний|предыдущий|старый)\s+(?:пост|обзор)|(?:previous|last)\s+(?:post|overview)/iu.test(task)) {
    const lines = task.split('\n');
    const heading = lines.findIndex((line, index) => index > 0 && researchDateSpans(line, year).some(span => span.start !== span.end));
    if (heading > 0) { prior = lines.slice(heading).join('\n'); task = lines.slice(0, heading).join('\n').trim(); }
  }
  const result: ResearchIntentV1 = { version: RESEARCH_INTENT_VERSION, task, priorExample: prior,
    asOf: input.now.toISOString(), timezone, mode: 'general', eventInterval: null,
    priorCoverageEnd: null, exclusions: [], clarification: null };
  const delta = /после\s+\d|since\s+\d|after\s+\d|(?:новый\s+пост|новый\s+обзор|new\s+post).*после|что\s+(?:произошло|изменилось|нового).*после|после\s+(?:этого|обзора|поста|предыдущ|прошл)|с\s+тех\s+пор|не\s+повтор|новости.*после|what.*(?:changed|happened).*since|since\s+(?:then|the|my)|after\s+(?:that|the|previous)/iu.test(task);
  const dates = researchDateSpans(task, year);
  // A labelled old/excluded range is data, just like priorExample. Inspect
  // its own clause rather than letting an earlier exclusion taint later dates.
  const requestedDates = dates.filter(span => {
    const clause = task.slice(0, span.index).split(/[.!?;,\n]/u).at(-1) || '';
    const direction = clause.split(/(?:найд(?:и|ите)|ищ(?:и|ите)|\bfind\b|\bsearch\b)/iu).at(-1) || '';
    return !/(?:не\s+повтор|исключ|\bexclude\b|(?:предыдущ|прежн|стар|прошл)[а-яё]*\s+(?:пост|обзор|текст|материал|событ|новост)|(?:previous|old)\s+(?:post|overview|text|material|example|event|news))/iu.test(direction);
  });
  if (dates.length && !requestedDates.length) {
    result.clarification = 'Какой период должен охватывать новый обзор? / Which period should the new overview cover?';
    return result;
  }
  // Explicit historical interval in the NEW task is authoritative.
  let range = requestedDates.find(span => span.start !== span.end);
  if (!range && requestedDates.length === 1 && /(?:\b(?:on|as of)|за|на|события|events)/iu.test(task)) range = requestedDates[0];
  if (!range && requestedDates.length === 2 && /(?:\bfrom|\bbetween|с\s+\d)/iu.test(task) && /(?:\bto\b|\bthrough\b|\band\b|(?:^|\s)по\s+|до\s+\d)/iu.test(task)) {
    range = { ...requestedDates[0], end: requestedDates[1].end };
  }
  // «Do not repeat» excludes old events; it does not replace an explicit
  // requested interval with a guessed prior-coverage boundary. «After 6–8»
  // itself names that boundary and still follows the delta path below.
  const rangeIsPriorBoundary = range && /(?:после|since|after)\s*$/iu.test(task.slice(0, range.index));
  if (range && !rangeIsPriorBoundary) {
    if (requestedDates.some(span =>
      (span.start !== span.end && (span.start !== range!.start || span.end !== range!.end)) ||
      span.start < range!.start || span.end > range!.end)) {
      result.clarification = 'Какой один период должен охватывать новый обзор? / Which single period should the new overview cover?';
      return result;
    }
    result.mode = 'historical';
    const calendarEnd = Date.parse(researchDayStart(shiftDay(range.end, 1), timezone)) - 1;
    result.eventInterval = { start: researchDayStart(range.start, timezone), end: new Date(Math.min(calendarEnd, input.now.getTime())).toISOString() };
    if (delta || requestedDates.length < dates.length) result.exclusions = ['events already covered in the previous example', 'publication or crawl time used as event time'];
    if (result.eventInterval.start > result.eventInterval.end) result.clarification = 'Указанный период ещё не наступил. / The requested period is in the future.';
    return result;
  }
  if (delta) {
    result.mode = 'delta';
    const coverage = prior ? researchDateSpans(prior, year) : dates;
    const ends = [...new Set(coverage.map(span => span.end))];
    if (!coverage.length || (coverage.length > 1 && !coverage.some(span => span.start !== span.end && coverage.every(other => other.start >= span.start && other.end <= span.end)))) {
      result.clarification = 'Какой последний день охвачен предыдущим обзором? / What is the last day covered by the previous overview?';
      return result;
    }
    ends.sort();
    const end = ends[ends.length - 1];
    result.priorCoverageEnd = new Date(Date.parse(researchDayStart(shiftDay(end, 1), timezone)) - 1).toISOString();
    result.eventInterval = { start: researchDayStart(shiftDay(end, 1), timezone), end: result.asOf };
    result.exclusions = ['events already covered in the previous example', 'publication or crawl time used as event time'];
    if (result.eventInterval.start > result.eventInterval.end) result.clarification = 'Уточните границу предыдущего обзора: она позже текущего момента. / Previous coverage ends in the future.';
    return result;
  }
  const rolling = /(?:последни[ехй]\s+(\d+)\s+дн|last\s+(\d+)\s+days)/iu.exec(task);
  const week = /(?:последн\S*\s+недел|last\s+week)/iu.test(task);
  if (rolling || week) {
    const days = rolling ? +(rolling[1] || rolling[2]) : 7;
    if (days > 0 && days <= 3660) {
      result.mode = 'recent';
      result.eventInterval = { start: new Date(input.now.getTime() - days * DAY).toISOString(), end: result.asOf };
    }
  }
  return result;
};

/** Date must appear in event evidence, never inferred from page metadata or a recent crawl. */
export const admitResearchEvent = (intent: ResearchIntentV1 | undefined,
  evidence: { quote: string; eventDate?: string | null; eventDateQuote?: string | null; material: string }
): 'admitted' | 'unknown_date' | 'outside_period' | 'clarification' => {
  if (!intent?.eventInterval) return intent?.clarification ? 'clarification' : 'admitted';
  const date = evidence.eventDate;
  const dateQuote = evidence.eventDateQuote?.trim();
  if (!date || !/^20\d{2}-\d{2}-\d{2}$/.test(date) || !dateQuote || dateQuote.length > 600 || !evidence.material.replace(/\s+/g, ' ').includes(dateQuote.replace(/\s+/g, ' '))) return 'unknown_date';
  if (/^(?:(?:page|article|document|last|страница|статья|документ)\s+)*(?:published|updated|retrieved|crawled|modified|publication date|date published|опубликован|обновлен|обновлён|дата публикации|дата обновления)/iu.test(dateQuote)) return 'unknown_date';
  if (/\bwill\s+(?:launch|release|be|start|roll|introduce)|scheduled\s+to|planned\s+for|запланирован|планируется|состоится|появится|выйдет|будет\s+(?:выпущ|доступ|запущ)/iu.test(evidence.quote)) return 'unknown_date';
  if (!dateQuote.replace(/\s+/g, ' ').includes(evidence.quote.replace(/\s+/g, ' '))) return 'unknown_date';
  const spans = researchDateSpans(dateQuote);
  if (!spans.length || spans.some(span => span.start !== date || span.end !== date)) return 'unknown_date';
  // Keep the date tied to the quoted event, not an unrelated heading on a rolling page.
  const normalized = evidence.material.replace(/\s+/g, ' ');
  const eventAt = normalized.indexOf(evidence.quote.replace(/\s+/g, ' '));
  const dateAt = normalized.indexOf(dateQuote.replace(/\s+/g, ' '));
  if (eventAt < 0 || Math.abs(eventAt - dateAt) > 350) return 'unknown_date';
  const start = Date.parse(researchDayStart(date, intent.timezone));
  const end = Date.parse(researchDayStart(shiftDay(date, 1), intent.timezone)) - 1;
  return end < Date.parse(intent.eventInterval.start) || start > Date.parse(intent.eventInterval.end) ? 'outside_period' : 'admitted';
};

export const researchIntentQuery = (intent: ResearchIntentV1): string => [
  intent.task,
  ...(intent.eventInterval ? [`Event interval: ${intent.eventInterval.start} through ${intent.eventInterval.end} (${intent.timezone}). Find events in this interval, not page update dates.`] : []),
  ...(intent.priorCoverageEnd ? [`Previous coverage ends ${intent.priorCoverageEnd}; exclude previously covered events.`] : []),
].join('\n');
