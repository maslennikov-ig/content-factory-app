import { createHash } from 'node:crypto';
import type { PieceFactV2 } from '../pieces/piece-facts.v2';
import type { AcceptedEvidence } from './intake.service';
import { exactResearchSourceSpan } from './research-digest.v4';
import { retainedSourceText, retainedSourceRevision } from '../research/retained-source';

/** Private capture in IntakeSnapshotStore; accepted excerpts also live in the source registry. */
export type ResearchReuseSnapshot = {
  version: 'research-reuse/v1';
  snapshotKey: string;
  query: string;
  level: 'quick' | 'standard' | 'deep';
  summary: unknown;
  sources: any[];
  facts: Array<PieceFactV2 & { sourcePassage?: true }>;
  evidence: AcceptedEvidence[];
  /** Immediate parent is part of immutable capture identity. Root also fences writes/expiry. */
  parentSnapshotKey?: string;
  sourceSnapshotKey?: string;
  /** Immutable original capture references; continuation is owned by this bundle. */
  members?: Array<{ snapshotKey: string }>;
  continuation?: {
    choices: string;
    status: 'writing' | 'complete' | 'failed';
    events?: import('../brand-voice/intake-v2.contract').IntakeEventV2[];
  };
};

const REVISABLE_RESEARCH_INPUT_ERRORS = new Set([
  'INTAKE_RESEARCH_SELECTION_INVALID',
  'INTAKE_RESEARCH_SOURCE_STALE',
  'INTAKE_RESEARCH_INCOMPLETE',
]);

export const researchReuseError = (code: string, message: string) =>
  Object.assign(new Error(message), { code, status: 400,
    ...(REVISABLE_RESEARCH_INPUT_ERRORS.has(code) ? { canReviseInput: true as const } : {}) });

export type ResearchSourcePassage = { sourceUrl: string; revision: string; quote: string };

/** A source passage is evidence, not an automatically verified model paraphrase. */
export const selectedSourcePassages = (snapshot: ResearchReuseSnapshot, passages: ResearchSourcePassage[]) => {
  if (!Array.isArray(passages) || !passages.length || passages.length > 20) {
    throw researchReuseError('INTAKE_RESEARCH_SELECTION_INVALID', 'Select between one and twenty saved source passages.');
  }
  const seen = new Set<string>();
  return passages.map(passage => {
    const source = snapshot.sources.find(row => row.url === passage.sourceUrl);
    if (!source) throw researchReuseError('INTAKE_RESEARCH_SELECTION_INVALID', 'Choose a source URL from this owned research snapshot.');
    if (passage.revision !== retainedSourceRevision(source)) {
      throw researchReuseError('INTAKE_RESEARCH_SOURCE_STALE', 'Read the saved source again and use its current revision.');
    }
    const material = retainedSourceText(source);
    const quote = typeof passage.quote === 'string' && passage.quote.length <= 8_000
      ? material.includes(passage.quote) && passage.quote.trim() ? passage.quote : exactResearchSourceSpan(passage.quote, material) : null;
    if (!quote || quote.length > 8_000) {
      throw researchReuseError('INTAKE_RESEARCH_SELECTION_INVALID', 'Copy a contiguous supporting passage from that exact saved source.');
    }
    const identity = JSON.stringify({ sourceUrl: passage.sourceUrl, revision: passage.revision, quote });
    if (seen.has(identity)) throw researchReuseError('INTAKE_RESEARCH_SELECTION_INVALID', 'Select each source passage once.');
    seen.add(identity);
    return { ...passage, quote, factKey: `passage:${createHash('sha256').update(identity).digest('hex')}` };
  });
};

export const selectReusableResearch = (snapshot: ResearchReuseSnapshot, keys?: string[]): PieceFactV2[] => {
  const summary = snapshot.summary as { status?: string; scopeStatus?: string } | null;
  const status = summary?.status;
  // Insufficient or unavailable overall review is retained as a limitation;
  // it does not erase independently selected facts with their own source and
  // quote checks below. Person-owned clarification still blocks reuse.
  if (summary?.scopeStatus === 'needs_clarification' ||
      ['empty', 'failed', 'needs_clarification', 'unsupported'].includes(status ?? '')) {
    throw researchReuseError('INTAKE_RESEARCH_INCOMPLETE', 'The saved research has no assessed usable outcome; resolve its gaps before writing.');
  }
  const chosen = keys ?? snapshot.facts.filter(fact => fact.verified && fact.status === 'confirmed').map(fact => fact.factKey!);
  if (!chosen.length || chosen.length > 200 || new Set(chosen).size !== chosen.length) {
    throw researchReuseError('INTAKE_RESEARCH_SELECTION_INVALID', 'Select existing confirmed research fact keys once each.');
  }
  const facts = new Map(snapshot.facts.map(fact => [fact.factKey, fact]));
  return chosen.map(key => {
    const fact = facts.get(key);
    const evidence = snapshot.evidence.find(row => row.evidenceId === fact?.evidenceId && row.url === fact?.sourceUrl);
    if (!fact || (!fact.sourcePassage && (!fact.verified || fact.status !== 'confirmed')) || !fact.quote || !evidence ||
        !exactResearchSourceSpan(fact.quote, evidence.excerpt)) {
      throw researchReuseError('INTAKE_RESEARCH_SELECTION_INVALID', 'Each selected fact must have its own saved supporting source and quote.');
    }
    // An explicitly selected literal capture is source material. Its exact
    // statement/quote pairing is verified here, not an invented paraphrase.
    if (fact.sourcePassage && fact.statement !== fact.quote) {
      throw researchReuseError('INTAKE_RESEARCH_SELECTION_INVALID', 'A source-passage candidate must retain its actual literal text.');
    }
    return { ...fact, verified: true, status: 'confirmed', selected: true };
  });
};


export type ResearchCaptureReference = { snapshotKey: string; factKeys: string[] };
export const qualifiedResearchFactKey = (snapshotKey: string, factKey: string) =>
  `joined:${createHash('sha256').update(`${snapshotKey}\0${factKey}`).digest('hex')}`;

/** Compose authenticated captures, never model-provided facts or another bundle. */
export function mergeResearchCaptures(members: ResearchReuseSnapshot[]): ResearchReuseSnapshot {
  const ordered = [...members].sort((a, b) => a.snapshotKey.localeCompare(b.snapshotKey));
  const evidence = new Map<string, AcceptedEvidence>();
  for (const member of ordered) for (const row of member.evidence) {
    const previous = evidence.get(row.evidenceId);
    if (previous && (previous.url !== row.url || previous.excerpt !== row.excerpt))
      throw researchReuseError('INTAKE_RESEARCH_EVIDENCE_MISMATCH', 'One evidence id identifies different saved source content.');
    evidence.set(row.evidenceId, row);
  }
  return {
    version: 'research-reuse/v1',
    snapshotKey: `res_join_${createHash('sha256').update(ordered.map(m => m.snapshotKey).join('\0')).digest('hex')}`,
    query: '', level: ordered.some(m => m.level === 'deep') ? 'deep' : 'standard',
    // These are original assessments, not a newly manufactured semantic review.
    summary: { status: ordered.every(m => (m.summary as any)?.status === 'supported') ? 'supported' : 'partial',
      captures: ordered.map(m => ({ snapshotKey: m.snapshotKey, query: m.query, assessment: m.summary })) },
    members: ordered.map(m => ({ snapshotKey: m.snapshotKey })),
    sources: ordered.flatMap(m => m.sources.map(source => ({ ...source, researchSnapshotKey: m.snapshotKey }))),
    facts: ordered.flatMap(m => m.facts.map(fact => ({ ...fact,
      factKey: qualifiedResearchFactKey(m.snapshotKey, fact.factKey!),
      researchSnapshotKey: m.snapshotKey, researchFactKey: fact.factKey }))),
    evidence: [...evidence.values()],
  };
}
