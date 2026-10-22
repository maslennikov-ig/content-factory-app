import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { ContentContextError } from './content-context.errors';
import { canonicalizeSourceUrl } from '../source-registry/network-policy';
import { PIECE_EVIDENCE_MAX_ITEMS } from './piece-evidence-projection';
import type {
  ContentContextBuildInputV1,
  ContentContextCandidatesV1,
  ContentContextSnapshotCreateV1,
  EvidenceCandidateV1,
  FactCandidateV1,
  StoredContextItemV1,
  StoredContextSnapshotV1,
} from './content-context.types';

type PrismaClientLike = Record<string, any>;

const MAX_CANDIDATE_FACTS = 64;
const MAX_EXPLICIT_IDS = 64;

function uniqueIds(values: string[] | undefined) {
  return [
    ...new Set((values || []).map((value) => value.trim()).filter(Boolean)),
  ];
}

function assertIdBudget(values: string[]) {
  if (values.length > MAX_EXPLICIT_IDS) {
    throw new ContentContextError(
      'CONTENT_CONTEXT_INPUT_INVALID',
      400,
      'Too many explicit context identifiers'
    );
  }
}

function canonicalCitationUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_000) return null;
  try { return canonicalizeSourceUrl(value); } catch { return null; }
}

/** URL lookup is candidate discovery; the builder repeats its final admission. */
function usableCoreSource(row: any, organizationId: string, asOf: Date) {
  if (row.organizationId !== organizationId || row.snapshot?.organizationId !== organizationId ||
      row.exposure !== 'PUBLIC' || row.tombstone || row.snapshot.purgedAt ||
      typeof row.excerpt !== 'string' || row.excerpt.length > 256_000 ||
      !row.excerpt.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '').trim() ||
      row.assessment?.status === 'REJECTED' || row.assessment?.trustTier === 'BLOCKED') return false;
  const source = row.snapshot.source;
  if (source) return source.organizationId === organizationId && !source.archivedAt && !source.purgedAt &&
    source.usagePurpose !== 'STYLE_REFERENCE' && source.desiredState === 'ACTIVE' &&
    source.rightsState === 'CONFIRMED' && ['ALLOWED', 'NOT_APPLICABLE'].includes(source.robotsState) &&
    source.currentSnapshotId === row.sourceSnapshotId && source.freshUntil >= asOf &&
    row.assessment?.status === 'ACCEPTED';
  return row.snapshot.kind === 'SEARCH_PROVIDER_RESULT' && row.freshnessStatus === 'FRESH' &&
    (row.freshUntil || row.snapshot.freshUntil) >= asOf;
}

function asEvidence(row: any, explicit = false): EvidenceCandidateV1 {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceSnapshotId: row.sourceSnapshotId,
    excerpt: row.excerpt,
    excerptHash: row.excerptHash,
    exposure: row.exposure,
    tombstone: row.tombstone,
    observedAt: row.observedAt,
    freshUntil: row.freshUntil,
    freshnessStatus: row.freshnessStatus,
    explicit,
    assessment: row.assessment,
    snapshot: {
      ...row.snapshot,
      source: row.snapshot?.source || null,
    },
  };
}

function asFact(row: any, explicitIds: Set<string>): FactCandidateV1 {
  return {
    id: row.id,
    organizationId: row.organizationId,
    claimKey: row.claimKey,
    statement: row.statement,
    temporalKind: row.temporalKind,
    status: row.status,
    verifiedAt: row.verifiedAt,
    freshUntil: row.freshUntil,
    explicit: explicitIds.has(row.id),
    evidenceLinks: (row.evidenceLinks || []).map((link: any) => ({
      stance: link.stance,
      reviewStatus: link.reviewStatus,
      evidence: asEvidence(link.evidence),
    })),
  };
}

const evidenceInclude = {
  assessment: true,
  snapshot: { include: { source: true } },
} as const;

const factInclude = {
  evidenceLinks: {
    orderBy: { id: 'asc' },
    include: {
      evidence: { include: evidenceInclude },
    },
  },
} as const;

function normalizeStoredSnapshot(row: any): StoredContextSnapshotV1 {
  return {
    ...row,
    contractVersion: 'content-context/v1',
    rejectionReasons: Array.isArray(row.rejectionReasons)
      ? row.rejectionReasons
      : [],
    profile: undefined,
    items: (row.items || []).map((item: any) => ({
      ...item,
      fact: item.fact
        ? asFact(item.fact, new Set(item.factId ? [item.factId] : []))
        : null,
      evidence: item.evidence ? asEvidence(item.evidence) : null,
    })),
  } as StoredContextSnapshotV1;
}

@Injectable()
export class ContentContextRepository {
  constructor(
    private readonly repository: PrismaRepository<any>,
    private readonly transaction: PrismaTransaction
  ) {}

  private client() {
    return this.repository.model as PrismaClientLike;
  }

  async findCandidates(
    organizationId: string,
    request: ContentContextBuildInputV1
  ): Promise<ContentContextCandidatesV1> {
    const factIds = uniqueIds(request.factIds);
    const sourceIds = uniqueIds(request.sourceIds);
    const evidenceIds = uniqueIds(request.userMaterialEvidenceIds);
    for (const ids of [factIds, sourceIds, evidenceIds]) assertIdBudget(ids);

    const [explicitFacts, explicitSources, explicitEvidence] =
      await Promise.all([
        factIds.length
          ? this.client().contentFact.findMany({
              where: { organizationId, id: { in: factIds } },
              include: factInclude,
            })
          : [],
        sourceIds.length
          ? this.client().contentSource.findMany({
              where: { organizationId, id: { in: sourceIds } },
              select: { id: true },
            })
          : [],
        evidenceIds.length
          ? this.client().sourceEvidence.findMany({
              where: { organizationId, id: { in: evidenceIds } },
              include: evidenceInclude,
            })
          : [],
      ]);
    if (
      explicitFacts.length !== factIds.length ||
      explicitSources.length !== sourceIds.length ||
      explicitEvidence.length !== evidenceIds.length
    ) {
      throw new ContentContextError(
        'CONTENT_CONTEXT_NOT_FOUND',
        404,
        'An explicit context item was not found'
      );
    }

    const lexicalFacts = await this.client().contentFact.findMany({
      where: { organizationId },
      orderBy: { id: 'asc' },
      take: MAX_CANDIDATE_FACTS,
      include: factInclude,
    });
    const factsById = new Map<string, any>();
    for (const row of [...explicitFacts, ...lexicalFacts])
      factsById.set(row.id, row);

    const sourceEvidence = sourceIds.length
      ? await this.client().sourceEvidence.findMany({
          where: {
            organizationId,
            snapshot: { sourceId: { in: sourceIds } },
          },
          orderBy: { id: 'asc' },
          take: MAX_EXPLICIT_IDS,
          include: evidenceInclude,
        })
      : [];
    const standaloneById = new Map<string, any>();
    for (const row of [...explicitEvidence, ...sourceEvidence]) {
      standaloneById.set(row.id, row);
    }

    const explicitFactIds = new Set(factIds);
    const explicitEvidenceIds = new Set([
      ...evidenceIds,
      ...sourceEvidence.map((row: any) => row.id),
    ]);
    if (request.pieceEvidence?.sourceUrls?.length) {
      const sourceUrls = [...new Set(request.pieceEvidence.sourceUrls
        .map(canonicalCitationUrl).filter((url): url is string => url !== null))];
      assertIdBudget(sourceUrls);
      const explicitSupports = explicitFacts.flatMap((fact: any) => (fact.evidenceLinks || [])
        .filter((link: any) => link.stance === 'SUPPORTS' && link.reviewStatus === 'ACCEPTED')
        .map((link: any) => link.evidence));
      const representedIds = new Set([...explicitEvidenceIds, ...explicitSupports.map((row: any) => row.id),
        ...request.pieceEvidence.quotes.map(quote => quote.evidenceId)]);
      const representedUrls = new Set([...standaloneById.values(), ...explicitSupports]
        .map(row => canonicalCitationUrl(row.snapshot?.finalCanonicalUrl)).filter(Boolean));
      for (const quote of request.pieceEvidence.quotes) {
        const url = canonicalCitationUrl(quote.sourceUrl); if (url) representedUrls.add(url);
      }
      const asOf = new Date(request.asOf);
      for (const url of sourceUrls.filter(url => !representedUrls.has(url)).slice(0, PIECE_EVIDENCE_MAX_ITEMS)) {
        if (representedIds.size >= PIECE_EVIDENCE_MAX_ITEMS) break;
        if (representedUrls.has(url)) continue;
        const rows = await this.client().sourceEvidence.findMany({
          where: { organizationId, exposure: 'PUBLIC', tombstone: null, excerpt: { not: null },
            snapshot: { organizationId, finalCanonicalUrl: url, purgedAt: null },
            AND: [
              { OR: [{ assessment: { is: null } }, { assessment: { is: { status: { not: 'REJECTED' }, trustTier: { not: 'BLOCKED' } } } }] },
              { OR: [{ freshUntil: { gte: asOf } }, { snapshot: { freshUntil: { gte: asOf } } },
                { snapshot: { source: { is: { freshUntil: { gte: asOf } } } } }] },
            ],
          },
          orderBy: [{ observedAt: 'desc' }, { id: 'asc' }], take: 8, include: evidenceInclude,
        });
        // Prefer the most complete actual retained passage within this bounded
        // URL history, with stable recency/id ties. Never replace chosen proof.
        const row = rows.filter((candidate: any) => canonicalCitationUrl(candidate.snapshot?.finalCanonicalUrl) === url &&
          usableCoreSource(candidate, organizationId, asOf))
          .sort((a: any, b: any) => b.excerpt.length - a.excerpt.length ||
            b.observedAt.getTime() - a.observedAt.getTime() || a.id.localeCompare(b.id))[0];
        if (!row) continue;
        standaloneById.set(row.id, row);
        explicitEvidenceIds.add(row.id); representedIds.add(row.id); representedUrls.add(url);
      }
    }
    return {
      facts: [...factsById.values()].map((row) => asFact(row, explicitFactIds)),
      evidence: [...standaloneById.values()].map((row) =>
        asEvidence(row, explicitEvidenceIds.has(row.id))
      ),
    };
  }

  async createSnapshot(
    organizationId: string,
    snapshot: ContentContextSnapshotCreateV1,
    items: StoredContextItemV1[]
  ): Promise<StoredContextSnapshotV1> {
    return (this.transaction.model as any).$transaction(
      async (client: PrismaClientLike) => {
        const created = await client.contentContextSnapshot.create({
          data: {
            organizationId,
            contractVersion: snapshot.contractVersion,
            consumer: snapshot.consumer,
            purpose: snapshot.purpose,
            queryHash: snapshot.queryHash,
            language: snapshot.language,
            freshnessMode: snapshot.freshnessMode,
            asOf: snapshot.asOf,
            builtAt: snapshot.builtAt,
            expiresAt: snapshot.expiresAt,
            status: snapshot.status,
            generationPolicy: snapshot.generationPolicy,
            brandProfileVersionId: snapshot.brandProfileVersionId,
            profileContentDigest: snapshot.profileContentDigest,
            profileFallbackReason: snapshot.profileFallbackReason,
            selectionAlgorithmVersion: snapshot.selectionAlgorithmVersion,
            trustPolicyVersion: snapshot.trustPolicyVersion,
            freshnessPolicyVersion: snapshot.freshnessPolicyVersion,
            maxFacts: snapshot.maxFacts,
            maxEvidence: snapshot.maxEvidence,
            maxRenderedCharacters: snapshot.maxRenderedCharacters,
            selectedFactCount: snapshot.selectedFactCount,
            selectedEvidenceCount: snapshot.selectedEvidenceCount,
            rejectedCount: snapshot.rejectedCount,
            rejectionReasons: snapshot.rejectionReasons,
          },
        });
        if (items.length) {
          await client.contentContextItem.createMany({
            data: items.map((item) => ({
              organizationId,
              contentContextSnapshotId: created.id,
              ordinal: item.ordinal,
              citationId: item.citationId,
              factId: item.factId,
              evidenceId: item.evidenceId,
              inclusionReason: item.inclusionReason,
              statementHash: item.statementHash,
              excerptHash: item.excerptHash,
              ...(item.evidenceProjection ? { evidenceProjection: item.evidenceProjection } : {}),
              factStatement: item.factStatement,
              factTemporalKind: item.factTemporalKind,
              factVerifiedAt: item.factVerifiedAt,
              factFreshUntil: item.factFreshUntil,
              factEvidenceCitationIds: item.factEvidenceCitationIds,
              tombstone: item.tombstone,
            })),
          });
        }
        const stored = await this.findSnapshot(
          client,
          organizationId,
          created.id
        );
        if (!stored) {
          throw new ContentContextError(
            'CONTENT_CONTEXT_NOT_FOUND',
            500,
            'Created content context could not be read'
          );
        }
        const normalized = normalizeStoredSnapshot(stored);
        normalized.profile = snapshot.profile;
        return normalized;
      },
      { isolationLevel: 'RepeatableRead', maxWait: 5_000, timeout: 10_000 }
    );
  }

  async getSnapshot(organizationId: string, id: string) {
    const row = await this.findSnapshot(this.client(), organizationId, id);
    return row ? normalizeStoredSnapshot(row) : null;
  }

  private findSnapshot(
    client: PrismaClientLike,
    organizationId: string,
    id: string
  ) {
    return client.contentContextSnapshot.findFirst({
      where: { organizationId, id },
      include: {
        brandProfileVersion: {
          select: { id: true, versionNumber: true, contentDigest: true },
        },
        items: {
          orderBy: { ordinal: 'asc' },
          include: {
            fact: { include: factInclude },
            evidence: { include: evidenceInclude },
          },
        },
      },
    });
  }
}
