import type {
  ContentFactView,
  ContentSourceView,
  ProvenanceView,
  SourceCapabilitiesView,
  SourceDraftMaterialView,
} from './content-intelligence.view';

const CONTENT_INTELLIGENCE_API = '/content-intelligence';
const SOURCES_API = `${CONTENT_INTELLIGENCE_API}/sources`;
const CONTEXTS_API = `${CONTENT_INTELLIGENCE_API}/contexts`;

export type SourceOperation =
  | 'rights'
  | 'validate'
  | 'activate'
  | 'sync'
  | 'draft-material';

export function sourceEndpoint(
  sourceId?: string,
  operation?: SourceOperation
): string {
  if (!sourceId) return SOURCES_API;
  const source = `${SOURCES_API}/${encodeURIComponent(sourceId)}`;
  return operation ? `${source}/${operation}` : source;
}

export const contextEndpoint = (contextId: string) =>
  `${CONTEXTS_API}/${encodeURIComponent(contextId)}`;

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const asNullableString = (value: unknown) =>
  typeof value === 'string' ? value : null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T => {
  const candidate = asString(value) as T;
  return allowed.includes(candidate) ? candidate : fallback;
};

export function buildSourceCreatePayload(form: FormData) {
  const kind = oneOf(form.get('kind'), ['MANUAL', 'URL', 'RSS'], 'URL');
  const base = {
    kind,
    displayName: asString(form.get('displayName')).trim(),
  };
  return kind === 'MANUAL'
    ? { ...base, manualText: asString(form.get('manualText')).trim() }
    : { ...base, canonicalUrl: asString(form.get('canonicalUrl')).trim() };
}

export const buildSourceRightsPayload = (confirmed: boolean) => ({ confirmed });

export function mapSourceDraftMaterial(response: unknown): SourceDraftMaterialView {
  const material = asRecord(response);
  const trace = asRecord(material.trace);
  return {
    sourceId: asString(material.sourceId),
    snapshotId: asString(material.snapshotId),
    evidence: asArray(material.evidence).map((value) => {
      const evidence = asRecord(value);
      const provenance = asRecord(evidence.provenance);
      return {
        evidenceId: asString(evidence.evidenceId),
        excerpt: asString(evidence.excerpt),
        observedAt: asString(evidence.observedAt),
        freshUntil: asNullableString(evidence.freshUntil),
        freshnessStatus: asString(evidence.freshnessStatus),
        provenance: {
          kind: asString(provenance.kind),
          retrievalProvider: asString(provenance.retrievalProvider),
        },
      };
    }),
    trace: {
      contractVersion: asString(trace.contractVersion),
      builtAt: asString(trace.builtAt),
    },
  };
}

export function mapSourcesEnvelope(response: unknown): {
  sources: readonly ContentSourceView[];
  capabilities: SourceCapabilitiesView;
} {
  const envelope = asRecord(response);
  const rawCapabilities = asRecord(envelope.capabilities);
  const capabilities = {
    directFetch: rawCapabilities.directFetch === true,
    validate: rawCapabilities.validate === true,
    sync: rawCapabilities.sync === true,
  };
  const sources = asArray(envelope.sources).map((value) => {
    const source = asRecord(value);
    const rawSnapshot = asRecord(source.currentSnapshot);
    return {
      id: asString(source.id),
      kind: oneOf(source.kind, ['MANUAL', 'URL', 'RSS'], 'MANUAL'),
      displayName: asString(source.displayName, 'Untitled source'),
      canonicalUrl: asNullableString(source.canonicalUrl),
      desiredState: oneOf(
        source.desiredState,
        ['DRAFT', 'ACTIVE', 'ARCHIVED'],
        'DRAFT'
      ),
      healthState: oneOf(
        source.healthState,
        ['NEVER_SYNCED', 'FRESH', 'STALE', 'POLICY_BLOCKED', 'ERROR'],
        'ERROR'
      ),
      rightsState: oneOf(
        source.rightsState,
        ['UNCONFIRMED', 'CONFIRMED', 'DENIED'],
        'UNCONFIRMED'
      ),
      robotsState: oneOf(
        source.robotsState,
        ['UNKNOWN', 'ALLOWED', 'DISALLOWED', 'NOT_APPLICABLE'],
        'UNKNOWN'
      ),
      currentSnapshot:
        source.currentSnapshot && typeof source.currentSnapshot === 'object'
          ? {
              observedAt: asString(rawSnapshot.observedAt),
              freshUntil: asNullableString(rawSnapshot.freshUntil),
              evidenceCount: Number(rawSnapshot.evidenceCount) || 0,
            }
          : null,
    } satisfies ContentSourceView;
  });
  return { sources, capabilities };
}

const unavailableContext = (contextId?: unknown): ProvenanceView => ({
  contextId: isNonEmptyString(contextId) ? contextId : null,
  status: 'UNAVAILABLE',
  generationPolicy: 'EVIDENCE_REQUIRED',
  errorCode: 'CONTENT_EVIDENCE_REQUIRED',
  profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
  facts: [],
  rejected: [],
});

function hasConsistentContextPolicy(envelope: JsonRecord) {
  const { status, generationPolicy, errorCode } = envelope;
  if (status === 'READY' || status === 'PARTIAL') {
    return generationPolicy === 'ALLOW_GROUNDED' && errorCode === null;
  }
  if (status === 'UNAVAILABLE') {
    return (
      (generationPolicy === 'ALLOW_USER_ONLY' && errorCode === null) ||
      (generationPolicy === 'EVIDENCE_REQUIRED' &&
        errorCode === 'CONTENT_EVIDENCE_REQUIRED')
    );
  }
  if (status === 'BLOCKED_STALE' || status === 'BLOCKED_CONFLICT') {
    return (
      generationPolicy === 'EVIDENCE_REQUIRED' &&
      errorCode === 'CONTENT_EVIDENCE_REQUIRED'
    );
  }
  return false;
}

export function mapContentContextEnvelope(response: unknown): ProvenanceView {
  const envelope = asRecord(response);
  const rawFacts = envelope.facts;
  const rawEvidence = envelope.evidence;
  const rawRejected = envelope.rejected;
  if (
    envelope.contractVersion !== 'content-context/v1' ||
    !isNonEmptyString(envelope.contentContextSnapshotId) ||
    !hasConsistentContextPolicy(envelope) ||
    !Array.isArray(rawFacts) ||
    !Array.isArray(rawEvidence) ||
    !Array.isArray(rawRejected)
  ) {
    return unavailableContext(envelope.contentContextSnapshotId);
  }

  const evidenceRecords = rawEvidence.map(asRecord);
  const evidenceCitationIds = evidenceRecords.map((item) => item.citationId);
  const evidenceValid = evidenceRecords.every(
    (item) =>
      isNonEmptyString(item.citationId) &&
      isNonEmptyString(item.evidenceId) &&
      isNonEmptyString(item.sourceSnapshotId) &&
      isNonEmptyString(item.title) &&
      isNonEmptyString(item.excerpt) &&
      (item.exposure === 'PUBLIC' || item.exposure === 'INTERNAL_ONLY') &&
      isNonEmptyString(item.retrievedAt)
  );
  if (
    !evidenceValid ||
    new Set(evidenceCitationIds).size !== evidenceCitationIds.length
  ) {
    return unavailableContext(envelope.contentContextSnapshotId);
  }

  const evidenceByCitation = new Map(
    evidenceRecords.map((item) => [item.citationId as string, item] as const)
  );
  const factRecords = rawFacts.map(asRecord);
  const factsValid = factRecords.every((fact) => {
    if (
      !isNonEmptyString(fact.citationId) ||
      !isNonEmptyString(fact.factId) ||
      !isNonEmptyString(fact.statement) ||
      !['CURRENT', 'DATED', 'TIMELESS'].includes(asString(fact.temporalKind)) ||
      !Array.isArray(fact.evidenceCitationIds) ||
      fact.evidenceCitationIds.length === 0
    ) {
      return false;
    }
    return fact.evidenceCitationIds.every(
      (citationId) =>
        isNonEmptyString(citationId) && evidenceByCitation.has(citationId)
    );
  });
  if (!factsValid) {
    return unavailableContext(envelope.contentContextSnapshotId);
  }

  const rawProfile = asRecord(envelope.profile);
  const profileValid =
    (rawProfile.mode === 'resolved' &&
      isNonEmptyString(rawProfile.versionId) &&
      Number.isFinite(rawProfile.versionNumber) &&
      Number(rawProfile.versionNumber) > 0) ||
    (rawProfile.mode === 'neutral_fallback' &&
      ['NO_PROFILE', 'EXPLICIT_NONE', 'LEGACY_REQUEST'].includes(
        asString(rawProfile.reason)
      ));
  if (!profileValid) {
    return unavailableContext(envelope.contentContextSnapshotId);
  }

  const status = envelope.status as ProvenanceView['status'];
  const generationPolicy =
    envelope.generationPolicy as ProvenanceView['generationPolicy'];
  const facts: ContentFactView[] = factRecords.map((fact) => ({
    id: fact.factId as string,
    statement: fact.statement as string,
    status:
      status === 'BLOCKED_CONFLICT'
        ? 'CONFLICT'
        : generationPolicy === 'EVIDENCE_REQUIRED'
        ? 'EVIDENCE_REQUIRED'
        : 'VERIFIED',
    currentRequired:
      fact.temporalKind === 'CURRENT' ||
      generationPolicy === 'EVIDENCE_REQUIRED',
    evidence: (fact.evidenceCitationIds as string[]).map((citationId) => {
      const item = evidenceByCitation.get(citationId)!;
      const removed = item.title === 'SOURCE_REMOVED';
      return {
        id: item.evidenceId as string,
        sourceLabel: item.title as string,
        excerpt: item.excerpt as string,
        relation: 'SUPPORTS' as const,
        sourceState: removed
          ? ('SOURCE_REMOVED' as const)
          : ('AVAILABLE' as const),
      };
    }),
  }));
  return {
    contextId: isNonEmptyString(envelope.contentContextSnapshotId)
      ? envelope.contentContextSnapshotId
      : null,
    status,
    generationPolicy,
    errorCode:
      envelope.errorCode === 'CONTENT_EVIDENCE_REQUIRED'
        ? 'CONTENT_EVIDENCE_REQUIRED'
        : null,
    profile:
      rawProfile.mode === 'resolved'
        ? {
            mode: 'resolved',
            versionId: rawProfile.versionId as string,
            versionNumber: Number(rawProfile.versionNumber),
          }
        : {
            mode: 'neutral_fallback',
            reason: rawProfile.reason as
              | 'NO_PROFILE'
              | 'EXPLICIT_NONE'
              | 'LEGACY_REQUEST',
          },
    facts,
    rejected: rawRejected.map((value) => {
      const item = asRecord(value);
      return {
        label: asString(item.itemId, 'Unknown citation'),
        reason: asString(item.reason, 'UNVERIFIED'),
      };
    }),
  };
}

export async function loadContentContext(
  read: (path: string) => Promise<unknown>,
  contextId: string
): Promise<ProvenanceView> {
  return mapContentContextEnvelope(await read(contextEndpoint(contextId)));
}
