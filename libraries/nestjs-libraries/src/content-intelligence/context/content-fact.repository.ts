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

  async listFacts(organizationId: string) {
    const facts = await this.client().contentFact.findMany({
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
                excerpt: true,
                freshUntil: true,
                freshnessStatus: true,
                exposure: true,
                snapshot: {
                  select: {
                    id: true,
                    kind: true,
                    normalizedTitle: true,
                    observedAt: true,
                    publishedAt: true,
                    purgedAt: true,
                    requestedCanonicalUrl: true,
                    finalCanonicalUrl: true,
                    source: {
                      select: {
                        archivedAt: true,
                        purgedAt: true,
                        displayName: true,
                        canonicalUrl: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    // The «ваше слово» card names who typed it (`Facts.dc.html`, screen 22),
    // and `ContentFact.createdByUserId` is a plain string column with no
    // Prisma relation — widening the model is out of this task's write zone.
    // A second query keyed on the ids this page actually holds costs one
    // round trip and touches nothing in `schema.prisma`.
    const authorIds = [...new Set(facts.map((fact: any) => fact.createdByUserId))];
    const authors = authorIds.length
      ? await this.client().user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, lastName: true },
        })
      : [];
    const authorById = new Map(authors.map((user: any) => [user.id, user]));
    return facts.map((fact: any) => ({
      ...fact,
      createdByUser: authorById.get(fact.createdByUserId) ?? null,
    }));
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

  /**
   * СНЯТЬ (`content-factory-next-odb8.1`): the fact stops being offered.
   *
   * Nothing is built here that was not already in the data model —
   * `UNUSABLE_FACT_STATUSES` in `content-brief.service.ts` already refuses a
   * `RETRACTED` fact, and `evaluateFact` above already leaves a `RETRACTED`
   * row untouched when new evidence arrives. This only writes the status a
   * terminal fact was always allowed to carry.
   */
  async retractFact(
    organizationId: string,
    actorUserId: string,
    factId: string,
    now: Date
  ) {
    const fact = await this.client().contentFact.findFirst({
      where: { organizationId, id: factId, status: { not: 'TOMBSTONED' } },
      select: { id: true, status: true },
    });
    if (!fact) notFound();
    if (fact.status === 'RETRACTED') {
      return this.client().contentFact.findFirst({
        where: { organizationId, id: factId },
        include: evaluationInclude,
      });
    }
    await this.client().contentFact.updateMany({
      where: { organizationId, id: factId },
      data: {
        status: 'RETRACTED',
        lastEvaluatedAt: now,
        updatedByUserId: actorUserId,
      },
    });
    return this.client().contentFact.findFirst({
      where: { organizationId, id: factId },
      include: evaluationInclude,
    });
  }

  /**
   * «Вернуть» (`Facts.dc.html`, screen 22): the only action a fact not in
   * work offers, whether it got there by СНЯТЬ or by being copied over.
   *
   * The mockup draws it on a row shown as superseded (row 4, screen 22) as
   * plainly as on a retracted one, and nothing in the data model needs a
   * superseded fact to stay that way forever: `supersedesFactId` on the newer
   * row is a fact about lineage, not a lock on the older one. Restoring
   * leaves both usable — two facts sharing a `claimKey` is already ordinary
   * (`content-brief.radar.ts` groups by it), and the newer row's link to
   * this one still holds regardless.
   *
   * The status is not simply flipped back to `UNVERIFIED` — that would forget
   * evidence accepted before the fact stopped being offered. `evaluateFact`
   * recomputes the honest status from what is on record now, the same call
   * `reviewEvidenceLink` already makes after a review changes.
   */
  async restoreFact(
    organizationId: string,
    actorUserId: string,
    factId: string,
    now: Date
  ) {
    return (this.transaction.model as any).$transaction(
      async (client: PrismaClientLike) => {
        // `evaluateFact` refuses to touch a terminal row on purpose — a fact
        // whose evidence changed while it sat retracted or superseded must
        // not come back to life on its own. Restoring means clearing the
        // status first, in the same transaction, so the recompute below runs
        // on a row that is no longer terminal rather than short-circuiting.
        const changed = await client.contentFact.updateMany({
          where: {
            organizationId,
            id: factId,
            status: { in: ['RETRACTED', 'SUPERSEDED'] },
          },
          data: { status: 'UNVERIFIED', updatedByUserId: actorUserId },
        });
        if (changed.count !== 1) notFound();
        return this.evaluateFact(client, organizationId, factId, actorUserId, now);
      }
    );
  }

  /**
   * КОПИРОВАТЬ И ПОПРАВИТЬ (`content-factory-next-odb8.1`).
   *
   * A new row, not an edit: the old fact keeps its own statement and its own
   * evidence exactly as they were, and the new row starts with none of
   * either. `evidenceLinks` belongs to `(organizationId, factId)`, and this
   * never copies one — the guarantee the design calls out by name is
   * structural here, not a check that could be forgotten. What the new row
   * inherits is only what still describes the same claim: `claimKey`,
   * `language`, `temporalKind` and the lifecycle dates.
   */
  async copyFact(
    organizationId: string,
    actorUserId: string,
    factId: string,
    input: {
      statement: string;
      valueText: string;
      valueHash: string;
      dedupeKey: string;
      evidenceId?: string;
      stance?: string;
    },
    now: Date
  ) {
    return (this.transaction.model as any).$transaction(
      async (client: PrismaClientLike) => {
        const previous = await client.contentFact.findFirst({
          where: { organizationId, id: factId, status: { not: 'TOMBSTONED' } },
          select: {
            claimKey: true,
            language: true,
            temporalKind: true,
            effectiveFrom: true,
            effectiveTo: true,
            freshUntil: true,
          },
        });
        if (!previous) notFound();
        // Deterministic `dedupeKey` (tied to the fact being replaced, not to
        // the moment of the call), so a double-submitted copy lands on the
        // same new row rather than creating a second one — the same
        // guarantee `createFact`'s own upsert gives an ordinary fact.
        const created = await client.contentFact.upsert({
          where: { organizationId_dedupeKey: { organizationId, dedupeKey: input.dedupeKey } },
          create: {
            organizationId,
            claimKey: previous.claimKey,
            statement: input.statement,
            language: previous.language,
            valueText: input.valueText,
            valueHash: input.valueHash,
            dedupeKey: input.dedupeKey,
            temporalKind: previous.temporalKind,
            effectiveFrom: previous.effectiveFrom,
            effectiveTo: previous.effectiveTo,
            freshUntil: previous.freshUntil,
            status: 'UNVERIFIED',
            supersedesFactId: factId,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
          },
          update: {},
        });
        if (input.evidenceId) {
          const evidence = await client.sourceEvidence.findFirst({
            where: { organizationId, id: input.evidenceId, tombstone: null },
            select: { id: true },
          });
          if (!evidence) notFound();
          const existingLink = await client.contentFactEvidence.findFirst({
            where: {
              organizationId,
              factId: created.id,
              evidenceId: input.evidenceId,
            },
            select: { id: true },
          });
          if (!existingLink) {
            await client.contentFactEvidence.create({
              data: {
                organizationId,
                factId: created.id,
                evidenceId: input.evidenceId,
                stance: input.stance || 'SUPPORTS',
                linkedBy: 'USER',
                reviewStatus: 'PROPOSED',
              },
            });
          }
        }
        await client.contentFact.updateMany({
          where: { organizationId, id: factId },
          data: {
            status: 'SUPERSEDED',
            lastEvaluatedAt: now,
            updatedByUserId: actorUserId,
          },
        });
        const [supersededFact, newFact] = await Promise.all([
          client.contentFact.findFirst({
            where: { organizationId, id: factId },
            include: evaluationInclude,
          }),
          client.contentFact.findFirst({
            where: { organizationId, id: created.id },
            include: evaluationInclude,
          }),
        ]);
        return { fact: newFact, supersededFact };
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
