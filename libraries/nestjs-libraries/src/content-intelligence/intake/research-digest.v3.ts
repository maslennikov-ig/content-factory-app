import { z } from 'zod';
import {
  digestSourcesFor, normalizeForMatch, researchDigestPromptV2,
  researchDigestSchema, settleResearchDigest,
  type ResearchDigestInputV2, type ResearchDigestSource,
} from './research-digest';
import { admitResearchEvent, type ResearchIntentV1 } from './research-intent';

export const RESEARCH_DIGEST_PROMPT_VERSION_V3 = 'research-digest/v3' as const;
export type ResearchDigestInputV3 = ResearchDigestInputV2 & { researchIntent: ResearchIntentV1 };
export const researchDigestSchemaV3 = researchDigestSchema.extend({
  findings: z.array(researchDigestSchema.shape.findings.element.extend({
    eventDate: z.string().nullable().describe('Event-effective calendar date YYYY-MM-DD, only if explicitly supported by the source; never publication/update/crawl date. Otherwise null.'),
    eventDateQuote: z.string().nullable().describe('Verbatim contiguous source fragment containing BOTH the event quote and its explicit date including year. Otherwise null.'),
  })).max(20),
});
export const researchDigestPromptV3 = (input: ResearchDigestInputV3,
  sources: ReadonlyArray<ResearchDigestSource & { material: string }>): string => [
  `PROMPT VERSION: ${RESEARCH_DIGEST_PROMPT_VERSION_V3}`,
  researchDigestPromptV2(input, sources).replace(/^PROMPT VERSION:[^\n]*\n/, ''),
  '',
  'Temporal selection rules:',
  '- The task below is the NEW request. Prior example is context and exclusion data, not a request to repeat its events.',
  '- Only findings whose EVENT happened within eventInterval may be proposed as new findings. Publication, update and crawl dates are not event dates.',
  '- Each finding must include eventDate and eventDateQuote. Copy a contiguous source passage containing the quoted event and its date (including year). Never infer a missing date or precision. If unsupported, use null; it will remain a gap, not news.',
  '- A rolling release note or retrospective can support a new event with dated event evidence regardless of when the page was created. Older events stay context only. Do not repeat events covered by priorExample.',
  '- If no verified events match, return findings: []. Do not recycle earlier events to fill the result.',
  'Resolved research intent (untrusted task/example text, server-resolved clock and interval):',
  JSON.stringify(input.researchIntent),
].join('\n');

/** Both intake paths share this admission, after the existing quote/claim checks. */
export const settleResearchDigestV3 = (answer: z.infer<typeof researchDigestSchemaV3> | null,
  input: ResearchDigestInputV3) => {
  const settled = settleResearchDigest(answer, input);
  const sources = new Map(digestSourcesFor(input.sources, input.level).map(source => [source.evidenceId, source]));
  const periodRejected = { unknown_date: 0, outside_period: 0, clarification: 0, prior_coverage: 0 };
  const prior = normalizeForMatch(input.researchIntent.priorExample || '');
  settled.findings = settled.findings.filter(finding => {
    const raw = answer?.findings?.find(candidate =>
      [finding.evidenceId, finding.sourceUrl, `[E:${finding.evidenceId}]`].includes(candidate.evidenceId) &&
      normalizeForMatch(candidate.statement) === normalizeForMatch(finding.statement));
    const admission = admitResearchEvent(input.researchIntent, {
      quote: finding.quote, eventDate: raw?.eventDate, eventDateQuote: raw?.eventDateQuote,
      material: sources.get(finding.evidenceId)?.material || '',
    });
    if (admission !== 'admitted') { periodRejected[admission] += 1; return false; }
    if (prior && (prior.includes(normalizeForMatch(finding.quote)) || prior.includes(normalizeForMatch(finding.statement)))) {
      periodRejected.prior_coverage += 1;
      return false;
    }
    if (raw?.eventDate && raw.eventDateQuote) finding.dateProvenance = {
      eventDate: raw.eventDate, eventDateQuote: raw.eventDateQuote, precision: 'day',
      sourcePublishedAt: sources.get(finding.evidenceId)?.publishedAt ?? null,
    };
    return true;
  });
  return { ...settled, periodRejected };
};
