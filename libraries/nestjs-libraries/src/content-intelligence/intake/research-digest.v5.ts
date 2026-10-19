import { z } from 'zod';
import {
  digestSourcesForV4, exactResearchSourceSpan, researchDigestPromptV4,
  researchDigestSchemaV4, settleResearchDigestV4, type ResearchDigestInputV4,
} from './research-digest.v4';
import { bareKey, normalizeForMatch, type ResearchDigestSource } from './research-digest';
import { resolveResearchIntentV2 } from './research-intent';
import { parseModelIntakeTemporal } from './request-understanding';

export const RESEARCH_DIGEST_PROMPT_VERSION_V5 = 'research-digest/v5' as const;
export const researchDigestSchemaV5 = researchDigestSchemaV4;
export const digestSourcesForV5 = digestSourcesForV4;

export const researchDigestPromptV5 = (input: ResearchDigestInputV4,
  sources: ReadonlyArray<ResearchDigestSource & { material: string }>): string => [
  researchDigestPromptV4(input, sources).replace('research-digest/v4', RESEARCH_DIGEST_PROMPT_VERSION_V5),
  '',
  'DATE ROLES AND SOURCE STRUCTURE. A release/document date identifying the subject is not by itself a requested event interval. For a stable comparison, specification or account of a named version, retain general scope unless the actual task selects events by time. Do not turn an identifying date into a one-day reporting period.',
  'When event time matters, interpret the source structure yourself. A dated heading can govern the documented items in its section. eventDateQuote may be the exact dated heading, while quote is the exact supported item elsewhere in that same section. They are separate faithful source spans: do not splice them, do not require them to be adjacent, and never borrow a heading from another section. The release/launch itself is an occurred event; the date on its explicit release heading is event evidence, unlike an unrelated page update or crawl date.',
  'Report dateBasis event and eventStatus occurred when that relationship is supported; otherwise keep the uncertainty. For a general task eventDate and eventDateQuote may be null without invalidating a substantive supported finding.',
  'Assess the requested bounded result. An authoritative statement that an item was added or changed in a named version can support what is new in that version. Do not require exhaustive negative evidence from every earlier version unless that exhaustive comparison is actually requested. Describe a material remaining limitation without discarding independently supported findings.',
].join('\n');

/** Expose model date decisions separately from source-span failures, without changing admission. */
export const settleResearchDigestV5 = (answer: z.infer<typeof researchDigestSchemaV5> | null,
  input: ResearchDigestInputV4) => {
  const temporal = parseModelIntakeTemporal(answer?.temporalConstraint);
  const researchIntent = input.researchIntent ?? (temporal && input.researchClock
    ? resolveResearchIntentV2({ input: input.subject, task: input.subject,
      now: new Date(input.researchClock.asOf), timeZone: input.researchClock.timezone,
      priorExample: input.priorExample, temporal }) : undefined);
  const settled = settleResearchDigestV4(answer, { ...input, ...(researchIntent ? { researchIntent } : {}) });
  if (!settled.periodDiagnostics) return settled;
  const shown = digestSourcesForV5(input.sources);
  const assessment = {
    basis: { event: 0, publication: 0, unknown: 0 },
    eventStatus: { occurred: 0, scheduled: 0, unknown: 0 },
    quote: { matched: 0, missing: 0, not_in_source: 0, too_long: 0 },
  };
  const excludePrior = (settled.resolvedIntent ?? input.researchIntent)?.mode === 'delta';
  for (const row of answer?.findings ?? []) {
    if (row.relevance !== 'substantive' || (excludePrior && row.alreadyCovered)) continue;
    assessment.basis[row.dateBasis ?? 'unknown'] += 1;
    assessment.eventStatus[row.eventStatus ?? 'unknown'] += 1;
    const dateQuote = row.eventDateQuote?.trim();
    if (!dateQuote) { assessment.quote.missing += 1; continue; }
    if (dateQuote.length > 600) { assessment.quote.too_long += 1; continue; }
    const key = bareKey(row.evidenceId);
    const source = shown.find(item => item.evidenceId === key ||
      normalizeForMatch(item.url) === normalizeForMatch(key));
    const matched = source && (exactResearchSourceSpan(dateQuote, source.excerpt) ??
      exactResearchSourceSpan(dateQuote, source.text ?? ''));
    assessment.quote[matched ? 'matched' : 'not_in_source'] += 1;
  }
  settled.periodDiagnostics.modelDateAssessment = assessment;
  return settled;
};
