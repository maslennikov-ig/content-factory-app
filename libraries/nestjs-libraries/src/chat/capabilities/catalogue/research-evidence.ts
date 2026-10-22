import { createHash, randomUUID } from 'node:crypto';
import { redactSecretShapes } from '../../conductor/secret-shapes';
import { wrapUntrusted } from '../untrusted-data';
import { retainedSourceText, retainedSourceRevision } from '../../../content-intelligence/research/retained-source';

export const COMPACT_FACT_STATEMENT_MAX = 220;
export const COMPACT_FACT_QUOTE_MAX = 160;
export const COMPACT_SOURCE_EXCERPT_MAX = 140;
export const STORED_RESEARCH_FACT_MAX = 20_000;
const MAX_STORED_SNAPSHOTS = 250;

export type StoredResearchSource = {
  index: number;
  url: string | null;
  title: string | null;
  publishedAt: string | null;
  provider: string | null;
  evidenceId: string | null;
  text: string;
  excerpt: string;
  totalCharacters: number;
  revision: string;
};

export type StoredResearchFact = {
  index: number;
  factKey: string;
  statement: string;
  quote: string | null;
  sourceUrl: string | null;
  evidenceId: string | null;
  status: string;
  kind: string | null;
  verified: boolean;
  selected: boolean;
  dateProvenance?: unknown;
  note?: string;
  totalCharacters: number;
  revision: string;
};

export type StoredResearchEvidence = {
  organizationId: string;
  snapshotKey: string;
  query: string | null;
  level: 'quick' | 'standard' | 'deep';
  summary: unknown;
  sources: StoredResearchSource[];
  facts: StoredResearchFact[];
  createdAt: number;
};

const researchEvidenceStore = new Map<string, StoredResearchEvidence>();

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const normalizeStoredSource = (source: any, index: number): StoredResearchSource => {
  const text = redactSecretShapes(retainedSourceText(source));
  const rawExcerpt =
    typeof source?.excerpt === 'string' && source.excerpt.trim()
      ? source.excerpt
      : text;
  const excerpt = redactSecretShapes(String(rawExcerpt)).slice(0, COMPACT_SOURCE_EXCERPT_MAX);
  return {
    index,
    url: typeof source?.url === 'string' ? source.url : null,
    title: typeof source?.title === 'string' ? redactSecretShapes(source.title).slice(0, 300) : null,
    publishedAt: typeof source?.publishedAt === 'string' ? source.publishedAt : null,
    provider: typeof source?.provider === 'string' ? source.provider : null,
    evidenceId: typeof source?.evidenceId === 'string' ? source.evidenceId : null,
    text,
    excerpt,
    totalCharacters: text.length,
    revision: retainedSourceRevision(source),
  };
};

const normalizeStoredFact = (fact: any, index: number): StoredResearchFact => {
  const rawStatement = redactSecretShapes(String(fact?.statement ?? fact?.text ?? '')).slice(
    0,
    STORED_RESEARCH_FACT_MAX
  );
  const rawQuote =
    typeof fact?.quote === 'string'
      ? redactSecretShapes(fact.quote).slice(0, STORED_RESEARCH_FACT_MAX)
      : null;
  const status = fact?.status ?? (fact?.verified === true ? 'confirmed' : 'unverified');
  const factKey =
    typeof fact?.factKey === 'string' && fact.factKey.trim()
      ? fact.factKey.trim()
      : `fact-${index}-${sha256(`${fact?.sourceUrl ?? ''}:${rawStatement}`).slice(0, 12)}`;
  const fullPayload = JSON.stringify({
    factKey,
    statement: rawStatement,
    quote: rawQuote,
    sourceUrl: typeof fact?.sourceUrl === 'string' ? fact.sourceUrl : null,
    evidenceId: typeof fact?.evidenceId === 'string' ? fact.evidenceId : null,
    status,
  });
  return {
    index,
    factKey,
    statement: rawStatement,
    quote: rawQuote,
    sourceUrl: typeof fact?.sourceUrl === 'string' ? fact.sourceUrl : null,
    evidenceId: typeof fact?.evidenceId === 'string' ? fact.evidenceId : null,
    status,
    kind: fact?.kind ?? fact?.origin ?? 'found',
    verified: fact?.verified === true || status === 'confirmed',
    selected: fact?.selected === true,
    ...(fact?.dateProvenance ? { dateProvenance: fact.dateProvenance } : {}),
    ...(fact?.note ? { note: redactSecretShapes(String(fact.note)).slice(0, 1_000) } : {}),
    totalCharacters: rawStatement.length + (rawQuote ? rawQuote.length : 0),
    revision: sha256(fullPayload),
  };
};

export const recordResearchEvidence = (
  organizationId: string,
  input: {
    snapshotKey?: string | null;
    query?: string | null;
    level?: 'quick' | 'standard' | 'deep';
    summary?: unknown;
    sources?: unknown;
    facts?: unknown;
  }
): StoredResearchEvidence => {
  const snapshotKey =
    typeof input.snapshotKey === 'string' && input.snapshotKey.trim()
      ? input.snapshotKey.trim()
      : `res_${randomUUID()}`;
  const sources = (Array.isArray(input.sources) ? input.sources : []).map(normalizeStoredSource);
  const facts = (Array.isArray(input.facts) ? input.facts : []).map(normalizeStoredFact);
  const entry: StoredResearchEvidence = {
    organizationId,
    snapshotKey,
    query: typeof input.query === 'string' ? input.query : null,
    level: input.level ?? 'standard',
    summary: input.summary ?? null,
    sources,
    facts,
    createdAt: Date.now(),
  };
  researchEvidenceStore.set(`${organizationId}:${snapshotKey}`, entry);
  if (researchEvidenceStore.size > MAX_STORED_SNAPSHOTS) {
    const oldestKey = researchEvidenceStore.keys().next().value;
    if (oldestKey) researchEvidenceStore.delete(oldestKey);
  }
  return entry;
};

export const readResearchEvidence = (
  organizationId: string,
  snapshotKey: string
): StoredResearchEvidence | null => {
  if (!organizationId || !snapshotKey) return null;
  return researchEvidenceStore.get(`${organizationId}:${snapshotKey}`) ?? null;
};

/** Compact source list for model context; full source text stays readable via piece.read. */
export const compactResearchSources = (value: unknown) =>
  (Array.isArray(value) ? value : []).map((source: any, index: number) => {
    const normalized = normalizeStoredSource(source, index);
    const truncated = normalized.totalCharacters > normalized.excerpt.length;
    return {
      index: normalized.index,
      sourceIndex: normalized.index,
      url: normalized.url,
      title: normalized.title,
      ...(normalized.publishedAt ? { publishedAt: normalized.publishedAt } : {}),
      ...(normalized.provider ? { provider: normalized.provider } : {}),
      ...(normalized.evidenceId ? { evidenceId: normalized.evidenceId } : {}),
      excerpt: normalized.excerpt,
      totalCharacters: normalized.totalCharacters,
      truncated,
      ...(truncated ? { readWith: 'piece.read' as const } : {}),
    };
  });

/** Evidence for the model, in addition to the existing native human card. No hidden top-N slice. */
export const researchFacts = (value: unknown) =>
  (Array.isArray(value) ? value : []).map((fact: any, index: number) => {
    const fullStatement = redactSecretShapes(String(fact?.statement ?? fact?.text ?? '')).slice(
      0,
      STORED_RESEARCH_FACT_MAX
    );
    const fullQuote =
      typeof fact?.quote === 'string'
        ? redactSecretShapes(fact.quote).slice(0, STORED_RESEARCH_FACT_MAX)
        : null;
    const statement = fullStatement.slice(0, COMPACT_FACT_STATEMENT_MAX);
    const quote = fullQuote !== null ? fullQuote.slice(0, COMPACT_FACT_QUOTE_MAX) : null;
    const truncated =
      fullStatement.length > statement.length ||
      (fullQuote !== null && fullQuote.length > (quote?.length ?? 0));
    return {
      factKey: typeof fact?.factKey === 'string' ? fact.factKey : null,
      statement,
      sourceUrl: typeof fact?.sourceUrl === 'string' ? fact.sourceUrl : null,
      ...(typeof fact?.evidenceId === 'string' ? { evidenceId: fact.evidenceId } : {}),
      status: fact?.status ?? (fact?.verified === true ? 'confirmed' : 'unverified'),
      ...(fact?.kind || fact?.origin ? { kind: fact?.kind ?? fact?.origin } : {}),
      ...(fact?.selected === true ? { selected: true } : {}),
      ...(fact?.sourcePassage === true ? { sourcePassage: true, selected: false } : {}),
      quote,
      ...(fact?.dateProvenance ? { dateProvenance: fact.dateProvenance } : {}),
      ...(fact?.note ? { note: redactSecretShapes(String(fact.note)).slice(0, 1_000) } : {}),
      ...(truncated
        ? {
            truncated: true,
            totalCharacters: fullStatement.length + (fullQuote?.length ?? 0),
            factIndex: index,
            readWith: 'piece.read' as const,
          }
        : {}),
    };
  });

export type ResearchReady = {
  outcome: 'research-ready';
  snapshotKey: string | null;
  level: 'quick' | 'standard' | 'deep';
  facts: ReturnType<typeof researchFacts>;
  sources?: ReturnType<typeof compactResearchSources>;
  summary: Record<string, any> | null;
  waitingOnCard: 0;
};

export const researchReady = (
  snapshotKey: string | null | undefined,
  level: ResearchReady['level'],
  facts: unknown,
  summary?: unknown,
  options?: { organizationId?: string; sources?: unknown; query?: string }
): ResearchReady => {
  if (options?.organizationId && snapshotKey) {
    recordResearchEvidence(options.organizationId, {
      snapshotKey,
      query: options.query,
      level,
      summary,
      sources: options.sources,
      facts,
    });
  }
  return {
    outcome: 'research-ready',
    snapshotKey: snapshotKey ?? null,
    level,
    facts: researchFacts(facts),
    ...(Array.isArray(options?.sources) ? { sources: compactResearchSources(options.sources) } : {}),
    summary: summary && typeof summary === 'object' ? (summary as Record<string, any>) : null,
    waitingOnCard: 0,
  };
};

/** Keep stable machine ids/counts separate from newly readable source text. */
export const researchModelView = (result: ResearchReady) => ({
  outcome: result.outcome,
  snapshotKey: result.snapshotKey,
  level: result.level,
  waitingOnCard: result.waitingOnCard,
  status: result.summary?.status ?? null,
  ...(result.summary?.periodStatus ? { periodStatus: result.summary.periodStatus } : {}),
  readWith: 'piece.read',
  evidence: wrapUntrusted(
    {
      facts: result.facts,
      ...(result.sources ? { sources: result.sources } : {}),
      summary: result.summary,
    },
    ['search-result', 'fetched-page']
  ),
});
