import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { ContentContextError } from './content-context.errors';

type PrismaClientLike = Record<string, any>;

function notFound(): never {
  throw new ContentContextError(
    'CONTENT_CONTEXT_NOT_FOUND',
    404,
    'Fact or evidence was not found'
  );
}

function authoritativeFreshUntil(evidence: any) {
  return evidence.snapshot?.source
    ? evidence.snapshot.source.freshUntil
    : evidence.freshUntil || evidence.snapshot?.freshUntil;
}

function evidenceUsable(evidence: any, now: Date) {
  const source = evidence.snapshot?.source;
  const freshUntil = authoritativeFreshUntil(evidence);
  return Boolean(
    !evidence.tombstone &&
      !evidence.snapshot?.purgedAt &&
      freshUntil &&
      new Date(freshUntil).getTime() >= now.getTime() &&
      (source || evidence.freshnessStatus === 'FRESH') &&
      evidence.assessment?.status === 'ACCEPTED' &&
      evidence.assessment?.trustTier !== 'BLOCKED' &&
      (source
        ? !source.archivedAt &&
          !source.purgedAt &&
          source.desiredState === 'ACTIVE' &&
          source.rightsState === 'CONFIRMED' &&
          ['ALLOWED', 'NOT_APPLICABLE'].includes(source.robotsState) &&
          source.currentSnapshotId === evidence.sourceSnapshotId
        : evidence.snapshot?.kind === 'SEARCH_PROVIDER_RESULT')
  );
}

const evaluationInclude = {
  evidenceLinks: {
    include: {
      evidence: {
        include: {
          assessment: true,
          snapshot: { include: { source: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class ContentFactRepository {
  constructor(
    private readonly repository: PrismaRepository<any>,
    private readonly transaction: PrismaTransaction
  ) {}

  private client() {
    return this.repository.model as PrismaClientLike;
  }

  listFacts(organizationId: string) {
    return this.client().contentFact.findMany({
      where: { organizationId, status: { not: 'TOMBSTONED' } },
      orderBy: [{ claimKey: 'asc' }, { id: 'asc' }],
      take: 100,
      include: {
        evidenceLinks: {
          orderBy: { id: 'asc' },
          include: {
            evidence: {
              select: {
                id: true,
                organizationId: true,
                tombstone: true,
                freshUntil: true,
                freshnessStatus: true,
                exposure: true,
                snapshot: {
                  select: {
                    id: true,
                    normalizedTitle: true,
                    observedAt: true,
                    publishedAt: true,
                    purgedAt: true,
                    source: {
                      select: { archivedAt: true, purgedAt: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async createFact(
    organizationId: string,
    actorUserId: string,
    input: Record<string, unknown>
  ) {
    return this.client().contentFact.upsert({
      where: {
        organizationId_dedupeKey: {
          organizationId,
          dedupeKey: input.dedupeKey,
        },
      },
      create: {
        organizationId,
        ...input,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
      update: {},
    });
  }

  async linkEvidence(
    organizationId: string,
    actorUserId: string,
    factId: string,
    input: { evidenceId: string; stance: string }
  ) {
    return (this.transaction.model as any).$transaction(
      async (client: PrismaClientLike) => {
        const [fact, evidence] = await Promise.all([
          client.contentFact.findFirst({
            where: {
              organizationId,
              id: factId,
              status: { not: 'TOMBSTONED' },
            },
            select: { id: true },
          }),
          client.sourceEvidence.findFirst({
            where: {
              organizationId,
              id: input.evidenceId,
              tombstone: null,
            },
            select: { id: true },
          }),
        ]);
        if (!fact || !evidence) notFound();
        const existing = await client.contentFactEvidence.findFirst({
          where: { organizationId, factId, evidenceId: input.evidenceId },
        });
        if (existing?.reviewStatus !== 'PROPOSED') {
          if (existing) return existing;
          try {
            return await client.contentFactEvidence.create({
              data: {
                organizationId,
                factId,
                evidenceId: input.evidenceId,
                stance: input.stance,
                linkedBy: 'USER',
                reviewStatus: 'PROPOSED',
              },
            });
          } catch (error: any) {
            if (error?.code !== 'P2002') throw error;
            const raced = await client.contentFactEvidence.findFirst({
              where: { organizationId, factId, evidenceId: input.evidenceId },
            });
            if (!raced) throw error;
            return raced;
          }
        }
        const changed = await client.contentFactEvidence.updateMany({
          where: {
            organizationId,
            factId,
            evidenceId: input.evidenceId,
            reviewStatus: 'PROPOSED',
          },
          data: {
            stance: input.stance,
            linkedBy: 'USER',
          },
        });
        if (changed.count === 1) {
          return {
            ...existing,
            stance: input.stance,
            linkedBy: 'USER',
          };
        }
        return client.contentFactEvidence.findFirst({
          where: { organizationId, factId, evidenceId: input.evidenceId },
        });
      }
    );
  }

  async reviewEvidenceLink(
    organizationId: string,
    actorUserId: string,
    factId: string,
    evidenceId: string,
    reviewStatus: 'ACCEPTED' | 'REJECTED',
    now: Date
  ) {
    return (this.transaction.model as any).$transaction(
      async (client: PrismaClientLike) => {
        const changed = await client.contentFactEvidence.updateMany({
          where: { organizationId, factId, evidenceId },
          data: { reviewStatus },
        });
        if (changed.count !== 1) notFound();
        return this.evaluateFact(
          client,
          organizationId,
          factId,
          actorUserId,
          now
        );
      }
    );
  }

  async assessEvidence(
    organizationId: string,
    actorUserId: string,
    evidenceId: string,
    input: {
      trustTier: string;
      status: string;
      note?: string;
    },
    now: Date
  ) {
    return (this.transaction.model as any).$transaction(
      async (client: PrismaClientLike) => {
        const evidence = await client.sourceEvidence.findFirst({
          where: { organizationId, id: evidenceId },
          select: { id: true },
        });
        if (!evidence) notFound();
        const assessment = await client.contentEvidenceAssessment.upsert({
          where: {
            organizationId_evidenceId: { organizationId, evidenceId },
          },
          create: {
            organizationId,
            evidenceId,
            trustTier: input.trustTier,
            trustPolicyVersion: 1,
            status: input.status,
            reviewedByUserId: actorUserId,
            reviewedAt: now,
            note: input.note?.trim() || null,
          },
          update: {
            trustTier: input.trustTier,
            trustPolicyVersion: { increment: 1 },
            status: input.status,
            reviewedByUserId: actorUserId,
            reviewedAt: now,
            note: input.note?.trim() || null,
          },
        });
        const linked = await client.contentFactEvidence.findMany({
          where: { organizationId, evidenceId },
          select: { factId: true },
        });
        for (const factId of [
          ...new Set(linked.map((row: any) => row.factId)),
        ]) {
          await this.evaluateFact(
            client,
            organizationId,
            factId as string,
            actorUserId,
            now
          );
        }
        return assessment;
      }
    );
  }

  private async evaluateFact(
    client: PrismaClientLike,
    organizationId: string,
    factId: string,
    actorUserId: string,
    now: Date
  ) {
    const fact = await client.contentFact.findFirst({
      where: { organizationId, id: factId },
      include: evaluationInclude,
    });
    if (!fact) notFound();
    if (['TOMBSTONED', 'RETRACTED', 'SUPERSEDED'].includes(fact.status)) {
      return fact;
    }
    const accepted = fact.evidenceLinks.filter(
      (link: any) => link.reviewStatus === 'ACCEPTED'
    );
    const contradiction = accepted.some(
      (link: any) =>
        link.stance === 'CONTRADICTS' && evidenceUsable(link.evidence, now)
    );
    const supports = accepted
      .filter(
        (link: any) =>
          link.stance === 'SUPPORTS' && evidenceUsable(link.evidence, now)
      )
      .map((link: any) => link.evidence);
    const status = contradiction
      ? 'CONFLICTED'
      : supports.length
      ? 'VERIFIED'
      : accepted.some((link: any) => link.stance === 'SUPPORTS')
      ? 'STALE'
      : 'UNVERIFIED';
    const freshUntil = supports.length
      ? new Date(
          Math.min(
            ...supports.map((item: any) =>
              new Date(authoritativeFreshUntil(item)).getTime()
            )
          )
        )
      : null;
    await client.contentFact.updateMany({
      where: { organizationId, id: factId },
      data: {
        status,
        freshUntil,
        verifiedAt: status === 'VERIFIED' ? now : null,
        lastEvaluatedAt: now,
        updatedByUserId: actorUserId,
      },
    });
    return client.contentFact.findFirst({
      where: { organizationId, id: factId },
      include: evaluationInclude,
    });
  }
}
