import { redactSecretShapes } from '../../conductor/secret-shapes';
import { wrapUntrusted } from '../untrusted-data';

/** Evidence for the model, in addition to the existing native human card. */
export const researchFacts = (value: unknown) => (Array.isArray(value) ? value : []).slice(0, 50)
  .map((fact: any) => ({
    factKey: typeof fact.factKey === 'string' ? fact.factKey : null,
    statement: redactSecretShapes(String(fact.statement ?? '')).slice(0, 2_000),
    sourceUrl: typeof fact.sourceUrl === 'string' ? fact.sourceUrl : null,
    evidenceId: typeof fact.evidenceId === 'string' ? fact.evidenceId : null,
    status: fact.status ?? (fact.verified === true ? 'confirmed' : 'unverified'),
    kind: fact.kind ?? fact.origin ?? null,
    selected: fact.selected === true,
    quote: typeof fact.quote === 'string' ? redactSecretShapes(fact.quote).slice(0, 2_000) : null,
    ...(fact.dateProvenance ? { dateProvenance: fact.dateProvenance } : {}),
    ...(fact.note ? { note: redactSecretShapes(String(fact.note)).slice(0, 1_000) } : {}),
  }));

export type ResearchReady = {
  outcome: 'research-ready';
  snapshotKey: string | null;
  level: 'quick' | 'standard' | 'deep';
  facts: ReturnType<typeof researchFacts>;
  summary: Record<string, any> | null;
  waitingOnCard: 0;
};

export const researchReady = (snapshotKey: string | null | undefined, level: ResearchReady['level'], facts: unknown, summary?: unknown): ResearchReady => ({
  outcome: 'research-ready', snapshotKey: snapshotKey ?? null, level,
  facts: researchFacts(facts), summary: summary && typeof summary === 'object' ? summary as Record<string, any> : null,
  waitingOnCard: 0,
});

/** Keep stable machine ids/counts separate from newly readable source text. */
export const researchModelView = (result: ResearchReady) => ({
  outcome: result.outcome,
  snapshotKey: result.snapshotKey,
  level: result.level,
  waitingOnCard: result.waitingOnCard,
  status: result.summary?.status ?? null,
  ...(result.summary?.periodStatus ? { periodStatus: result.summary.periodStatus } : {}),
  evidence: wrapUntrusted({ facts: result.facts, summary: result.summary }, ['search-result', 'fetched-page']),
});
