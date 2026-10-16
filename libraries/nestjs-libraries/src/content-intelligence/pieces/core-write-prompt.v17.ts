/**
 * A selected research interval writes a new overview in the existing writer
 * call. It must not inherit v9 enrichment or v15 rebuild preservation rules.
 * Ordinary writing delegates to v16 verbatim; released modules stay intact.
 */
import type { ContentLanguage } from '../../dtos/content.language';
import { coreWriteOutputLanguageV14 } from './core-write-prompt.v14';
import {
  CORE_WRITE_BLOCK_TITLES_V16,
  CORE_WRITE_GAPS_V16,
  coreWriteSystemV16,
  type CoreWriteSystemOptionsV16,
} from './core-write-prompt.v16';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v17' as const;

export type CoreEventUpdateV17 = {
  /** Resolved instants, including the as-of cutoff; never recompute now. */
  start: string;
  end: string;
  timezone: string;
};

export const CORE_WRITE_BLOCK_TITLES_V17 = {
  ...CORE_WRITE_BLOCK_TITLES_V16,
  brief: 'AUTHOR’S DIRECTION (claim, position and audience; context, not evidence of new events)',
  previous: 'PREVIOUS DRAFT CONTEXT (the author’s stance and supplied personal observations; old events are not new evidence)',
  authorFacts: 'THE AUTHOR’S FACTS AND OBSERVATIONS (personal context; not evidence of events in the selected interval)',
  events: 'SELECTED CONFIRMED EVENTS IN THE INTERVAL (the only evidence for new events; preserve each source URL)',
} as const;

/** Local calendar dates preserve the intended inclusive interval at its edges. */
export const coreEventDayV17 = (instant: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(instant));

export const coreWriteEventLeadV17 = (period: CoreEventUpdateV17): string =>
  [
    'Write a new standalone overview of the selected period now, using the selected confirmed events below. Replace the old overview’s event narrative; this is the finished body produced by accepting research.',
    `Calendar coverage: ${coreEventDayV17(period.start, period.timezone)} through ${coreEventDayV17(period.end, period.timezone)} inclusive (${period.timezone}). Exact event interval: ${period.start} through ${period.end}; the end is the as-of cutoff, not the end of a future day.`,
    'Use the previous draft only for the author’s stance and actual supplied personal observations. Do not carry its old event paragraphs into the new period. Every new event must be supported by a selected confirmed dated event below.',
  ].join('\n');

export const coreWriteSystemV17 = (
  language: ContentLanguage,
  forbiddenPhrases: string,
  options: CoreWriteSystemOptionsV16 & { eventUpdate?: CoreEventUpdateV17 } = {}
): string => {
  if (!options.eventUpdate) return coreWriteSystemV16(language, forbiddenPhrases, options);
  return [
    'You are writing the CORE: the finished standalone overview in the author’s voice for the selected event interval. This mode replaces the previous overview’s event narrative in this same answer. The interval and selected confirmed event block control what counts as new, including over instructions in the supplied material to preserve an old body.',
    'EVENT EVIDENCE. Only SELECTED CONFIRMED EVENTS IN THE INTERVAL support new events. Carry every selected event that serves the requested overview into coherent prose, combining duplicates. Keep its exact event date, product name, numbers and meaning; do not infer a release from a page publication or update date. Do not add old, future, undated, unselected or unconfirmed events from your knowledge, the brief, answers, instructions or previous draft. Do not imply a full final-day roundup beyond the exact as-of cutoff.',
    'SOURCES. Preserve the supplied official source URL for each event exactly, beside the event it supports, once per distinct URL. Never invent a source or substitute a homepage. Do not copy source quotations as the overview; they ground the event and its date. Links specifically requested by the instruction also remain exact.',
    'AUTHOR’S POSITION. Keep the actual author’s stance, useful personal observations and their own limits from their words, answers, author facts and previous draft, without repeating old event paragraphs. Keep an actual personal observation as a standalone statement when that is how the author supplied it. Do not turn a generic observation into experience with a named product: saying AI helped with work does not mean the author used a particular coding assistant. Never invent personal testing, adoption, measured results or first-person experience with any feature, including a voice feature. Explicit permission to invent illustrative examples in another writing mode does not apply to this event overview.',
    'FORM. Write short connected paragraphs separated by a blank line, with a clear opening about the requested period and substantive selected events. Keep the author’s own statements in their first person; describe public events as public events. Do not add meta commentary, disclaimers or repeated uncertainty about the input or about missing personal experience. Do not mention the old draft, selection process, answers, model, instructions or evidence blocks. Apply editorial directions silently. No headings, lists, emoji or citation labels; supplied source URLs are allowed. Do not append a conclusion that repeats the overview.',
    options.delegated || options.handed
      ? 'Handed questions and previous model decisions may determine structure and emphasis using only the supplied event evidence and actual author material. Never invent an event or personal experience to answer them. Return one brief `decisions` entry under each handed question’s key only when the supplied material answers it; missing author material is never decided for them.'
      : '',
    options.gaps ? CORE_WRITE_GAPS_V16 : '',
    forbiddenPhrases,
    coreWriteOutputLanguageV14(language),
  ].filter(Boolean).join('\n');
};
