import type { PieceFactV2 } from '../pieces/piece-facts.v2';
import type { AcceptedEvidence } from './intake.service';
import { exactResearchSourceSpan } from './research-digest.v4';

/** Private capture in IntakeSnapshotStore; accepted excerpts also live in the source registry. */
export type ResearchReuseSnapshot = {
  version: 'research-reuse/v1';
  snapshotKey: string;
  query: string;
  level: 'quick' | 'standard' | 'deep';
  summary: unknown;
  sources: any[];
  facts: PieceFactV2[];
  evidence: AcceptedEvidence[];
  continuation?: {
    choices: string;
    status: 'writing' | 'complete' | 'failed';
    events?: import('../brand-voice/intake-v2.contract').IntakeEventV2[];
  };
};

export const researchReuseError = (code: string, message: string) =>
  Object.assign(new Error(message), { code, status: 400, canReviseInput: true });

export const selectReusableResearch = (snapshot: ResearchReuseSnapshot, keys?: string[]): PieceFactV2[] => {
  const status = (snapshot.summary as { status?: string } | null)?.status;
  if (['empty', 'failed', 'needs_clarification', 'unsupported', 'review_unavailable'].includes(status ?? '')) {
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
    if (!fact || !fact.verified || fact.status !== 'confirmed' || !fact.quote || !evidence ||
        !exactResearchSourceSpan(fact.quote, evidence.excerpt)) {
      throw researchReuseError('INTAKE_RESEARCH_SELECTION_INVALID', 'Each selected fact must have its own saved supporting source and quote.');
    }
    return { ...fact, selected: true };
  });
};
