import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { ContentContextError } from './content-context.errors';
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
