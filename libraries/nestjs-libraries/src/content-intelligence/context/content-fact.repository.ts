import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { ContentContextError } from './content-context.errors';
import { factMomentOver } from './fact-valid-until';
import { wordsWhere } from '../search-terms';

/**
 * По каким полям ищет поиск по словам на витрине фактов
 * (`content-factory-next-odb8.4`).
 *
 * `statement` — то, что человек читает на карточке; `claimKey` — тема и
 * признак, по которым витрина и так группирует (`тема|признак`), поэтому
 * поиск по названию темы попадает именно сюда; `valueText` — само значение,
 * то есть «20%» или «Новосибирск», ради которого факт и заводили.
 * Источник факта живёт через связь `evidenceLinks → evidence → snapshot`;
 * его в поиск не берут, чтобы один запрос не превращался в обход трёх таблиц
 * с `contains` по каждой — записано в карте раздела как незакрытая часть.
 */
const SEARCHABLE_FACT_FIELDS = ['statement', 'claimKey', 'valueText'] as const;

type PrismaClientLike = Record<string, any>;

/**
 * The most facts one catalogue read returns. A caller that shows the list
 * says when it reached this (the chat's `capped`, review W4-24 F10).
 */
export const FACT_LIST_LIMIT = 100;

function notFound(): never {
  throw new ContentContextError(
    'CONTENT_CONTEXT_NOT_FOUND',
    404,
    'Fact or evidence was not found'
  );
}

/** The fact was replaced by a corrected copy: it is neither retracted nor restored. */
function superseded(): never {
  throw new ContentContextError(
    'CONTENT_CONTEXT_FACT_SUPERSEDED',
    409,
    'A superseded fact is out of work already; the fact that replaced it is the only version in work, so it is neither retracted nor restored'
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

  /**
   * Витрина фактов, при желании суженная поиском по словам.
   *
   * `words` пустой — запрос ровно тот же, что был до поиска. Слова
   * добавляются ВНУТРЬ того же `where`, рядом с `organizationId`, а не поверх
   * него: чужое пространство недостижимо любым набором слов.
   */
  async listFacts(organizationId: string, words: readonly string[] = []) {
    const byWords = wordsWhere(words, SEARCHABLE_FACT_FIELDS);
    const facts = await this.client().contentFact.findMany({
      where: {
        organizationId,
        status: { not: 'TOMBSTONED' },
        ...(byWords ?? {}),
      },
      orderBy: [{ claimKey: 'asc' }, { id: 'asc' }],
      take: FACT_LIST_LIMIT,
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
                // `needsLook` (`content-factory-next-tyrk`) reads this to
                // tell an accepted «найдено поиском» row from one still
                // waiting on confirmation.
                assessment: { select: { status: true } },
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

  /**
   * One fact of the workspace by id, for the chat (`kcxz.24`): what an
   * approval card quotes and what «Снять» and «Вернуть» act on. The catalogue
   * above stops at a hundred rows; a fact beyond them is still this
   * workspace's. A tombstoned fact is gone, as everywhere else.
   */
  async findFact(organizationId: string, factId: string) {
    return this.client().contentFact.findFirst({
      where: { organizationId, id: factId, status: { not: 'TOMBSTONED' } },
      select: {
        id: true,
        statement: true,
        status: true,
        verifiedAt: true,
        freshUntil: true,
      },
    });
  }

  /**
   * The row a dedupe key already names, tombstoned included — what
   * `createFact`'s upsert would return untouched (`kcxz.24` review F2).
   */
  async findFactByDedupeKey(organizationId: string, dedupeKey: string) {
    return this.client().contentFact.findFirst({
      where: { organizationId, dedupeKey },
      select: {
        id: true,
        statement: true,
        status: true,
        verifiedAt: true,
        freshUntil: true,
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
    input: { evidenceId: string; stance: string },
    now: Date
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
            select: { id: true, assessment: { select: { status: true } } },
          }),
        ]);
        if (!fact || !evidence) notFound();
        // «Ваш материал» (`content-factory-next-tyrk`): a MANUAL or synced
        // source's evidence already carries an `ACCEPTED` assessment from
        // the producer (`source-registry.repository.ts`), so citing it here
        // is the whole review — there is nothing left to wait for. A search
        // result's assessment starts `PROPOSED` and stays that way until
        // `confirmEvidence`.
        const evidenceAccepted = evidence.assessment?.status === 'ACCEPTED';
        const linkReviewStatus = evidenceAccepted ? 'ACCEPTED' : 'PROPOSED';
        const existing = await client.contentFactEvidence.findFirst({
          where: { organizationId, factId, evidenceId: input.evidenceId },
        });
        let link: any;
        if (existing && existing.reviewStatus !== 'PROPOSED') {
          return existing;
        }
        if (!existing) {
          try {
            link = await client.contentFactEvidence.create({
              data: {
                organizationId,
                factId,
                evidenceId: input.evidenceId,
                stance: input.stance,
                linkedBy: 'USER',
                reviewStatus: linkReviewStatus,
              },
            });
          } catch (error: any) {
            if (error?.code !== 'P2002') throw error;
            const raced = await client.contentFactEvidence.findFirst({
              where: { organizationId, factId, evidenceId: input.evidenceId },
            });
            if (!raced) throw error;
            link = raced;
          }
        } else {
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
              reviewStatus: linkReviewStatus,
            },
          });
          link =
            changed.count === 1
              ? {
                  ...existing,
                  stance: input.stance,
                  linkedBy: 'USER',
                  reviewStatus: linkReviewStatus,
                }
              : await client.contentFactEvidence.findFirst({
                  where: {
                    organizationId,
                    factId,
                    evidenceId: input.evidenceId,
                  },
                });
        }
        if (evidenceAccepted) {
          return this.evaluateFact(client, organizationId, factId, actorUserId, now);
        }
        return link;
      }
    );
  }

  /**
   * The door for «найдено поиском» (`content-factory-next-tyrk`): the one
   * gesture that moves a search result's assessment from `PROPOSED` to
   * `ACCEPTED`, accepts the link it is cited through, and re-evaluates the
   * fact — the same three writes `assessEvidence` + `reviewEvidenceLink`
   * made as two separate ADMIN-only steps nothing in the interface ever
   * called. This is the everyday, non-admin door for it.
   */
  async confirmEvidence(
    organizationId: string,
    actorUserId: string,
    factId: string,
    evidenceId: string,
    now: Date
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
            where: { organizationId, id: evidenceId, tombstone: null },
            select: { id: true },
          }),
        ]);
        if (!fact || !evidence) notFound();
        const link = await client.contentFactEvidence.findFirst({
          where: { organizationId, factId, evidenceId },
        });
        if (!link) notFound();
        // The upsert's `create` branch only fires when a producer somehow
        // left no assessment row at all — every real producer
        // (`source-registry.repository.ts`) writes one on creation, so this
        // is a safety net, not the expected path. `update` deliberately
        // leaves `trustTier` untouched: confirming is a statement about
        // review status, not a re-grading of the source's tier.
        await client.contentEvidenceAssessment.upsert({
          where: { organizationId_evidenceId: { organizationId, evidenceId } },
          create: {
            organizationId,
            evidenceId,
            trustTier: 'UNRATED',
            trustPolicyVersion: 1,
            status: 'ACCEPTED',
            reviewedByUserId: actorUserId,
            reviewedAt: now,
          },
          update: {
            status: 'ACCEPTED',
            reviewedByUserId: actorUserId,
            reviewedAt: now,
          },
        });
        await client.contentFactEvidence.updateMany({
          where: { organizationId, factId, evidenceId },
          data: { reviewStatus: 'ACCEPTED' },
        });
        return this.evaluateFact(client, organizationId, factId, actorUserId, now);
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
   *
   * A `SUPERSEDED` fact is refused (`CONTENT_CONTEXT_FACT_SUPERSEDED`, review
   * W4-24 F1): it is already out of work, and retracting it would turn it
   * into a row «Вернуть» accepts — putting the replaced statement back beside
   * its correction. The screen never offers «Снять» there; the refusal lives
   * here so every caller, the chat included, behaves the same. The write is
   * bound to the status just read, so a copy made in between is not undone.
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
    if (fact.status === 'SUPERSEDED') superseded();
    if (fact.status === 'RETRACTED') {
      return this.client().contentFact.findFirst({
        where: { organizationId, id: factId },
        include: evaluationInclude,
      });
    }
    const changed = await this.client().contentFact.updateMany({
      where: { organizationId, id: factId, status: fact.status },
      data: {
        status: 'RETRACTED',
        lastEvaluatedAt: now,
        updatedByUserId: actorUserId,
      },
    });
    if (changed.count !== 1) notFound();
    return this.client().contentFact.findFirst({
      where: { organizationId, id: factId },
      include: evaluationInclude,
    });
  }

  /**
   * «Вернуть» (`Facts.dc.html`, screen 22): the retracted row's only action.
   *
   * A `SUPERSEDED` fact is refused on purpose, corrected from an earlier
   * version of this comment that read the mockup as covering both rows —
   * a reviewer caught the contradiction it hid. КОПИРОВАТЬ И ПОПРАВИТЬ
   * (`copyFact`) exists specifically so a corrected statement never sits
   * beside the one it replaced with matching grounding; restoring the old
   * row would put both back in work at once, sharing a `claimKey`, with
   * disagreeing statements and the old row still wearing evidence that
   * confirmed a sentence it was never checked against. That is the exact
   * lie `content-factory-next-odb8.1`'s copy-not-edit rule refuses. The
   * newer fact stays the only version in work; `supersedesFactId` records
   * the lineage, it does not offer a way back.
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
        const fact = await client.contentFact.findFirst({
          where: { organizationId, id: factId, status: { not: 'TOMBSTONED' } },
          select: { id: true, status: true },
        });
        if (!fact) notFound();
        if (fact.status === 'SUPERSEDED') superseded();
        if (fact.status !== 'RETRACTED') notFound();
        // By lineage, not only by status (review W4-24 F1): a row retracted
        // after it was replaced — before `retractFact` refused that, or by
        // any path to come — still has its correction, and must not come
        // back beside it.
        const correction = await client.contentFact.findFirst({
          where: {
            organizationId,
            supersedesFactId: factId,
            status: { not: 'TOMBSTONED' },
          },
          select: { id: true },
        });
        if (correction) superseded();
        // `evaluateFact` refuses to touch a terminal row on purpose — a fact
        // whose evidence changed while it sat retracted must not come back
        // to life on its own. Restoring means clearing the status first, in
        // the same transaction, so the recompute below runs on a row that is
        // no longer terminal rather than short-circuiting.
        const changed = await client.contentFact.updateMany({
          where: { organizationId, id: factId, status: 'RETRACTED' },
          data: { status: 'UNVERIFIED', updatedByUserId: actorUserId },
        });
        if (changed.count !== 1) notFound();
        return this.evaluateFact(client, organizationId, factId, actorUserId, now);
      }
    );
  }

  /**
   * A new «Свежо до» for a fact in work, the person's own word from the chat
   * (owner 29.09.2026, walk review F1): «скидка теперь до 31.10» on a fact
   * already known. Only a live row — retracted, replaced or removed ones are
   * left as they are (`null`) — and the status is recomputed as after any
   * change, so a fact grounded in material keeps its material's freshness.
   */
  async redateFact(
    organizationId: string,
    actorUserId: string,
    factId: string,
    freshUntil: Date,
    now: Date
  ) {
    return (this.transaction.model as any).$transaction(
      async (client: PrismaClientLike) => {
        const changed = await client.contentFact.updateMany({
          where: {
            organizationId,
            id: factId,
            status: { notIn: ['TOMBSTONED', 'RETRACTED', 'SUPERSEDED'] },
          },
          data: { freshUntil, temporalKind: 'CURRENT', updatedByUserId: actorUserId },
        });
        if (changed.count !== 1) return null;
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
        // A «Свежо до» already over is not copied (owner 29.09.2026, walk
        // review F1): the copy would be out of date the moment it is stored.
        // It holds until the person names a new day — to the agent, which
        // sets it (`redateFact`); a day still ahead is copied as it is.
        const dayOver = !!previous.freshUntil && factMomentOver(new Date(previous.freshUntil), now);
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
            // «Действует сейчас» needs a day; without one it holds until
            // retracted, as a fact added without a day does.
            temporalKind:
              dayOver && previous.temporalKind === 'CURRENT' ? 'TIMELESS' : previous.temporalKind,
            effectiveFrom: previous.effectiveFrom,
            effectiveTo: previous.effectiveTo,
            freshUntil: dayOver ? null : previous.freshUntil,
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
            select: { id: true, assessment: { select: { status: true } } },
          });
          if (!evidence) notFound();
          // «Ваш материал» (`content-factory-next-tyrk`, §9.5): pointing the
          // copy at evidence already accepted for the old fact — or any
          // other already-accepted evidence in the workspace — is the whole
          // review, the same rule `linkEvidence` applies. Evidence still
          // `PROPOSED` (or unassessed, «найдено поиском») stays proposed.
          const evidenceAccepted = evidence.assessment?.status === 'ACCEPTED';
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
                reviewStatus: evidenceAccepted ? 'ACCEPTED' : 'PROPOSED',
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
        // Evaluated exactly like an ordinary fact whose evidence just
        // changed — the same recompute `linkEvidence`/`confirmEvidence` run
        // — so a copy is never left less verified than its evidence already
        // justifies: unlinked, it verifies on its own say-so («ваше
        // слово»); linked to already-accepted material, it verifies with a
        // citation; linked to a still-proposed one, it verifies as own word
        // with the citation pending, exactly as `evaluateFact`'s ownWord
        // branch already treats any other fact in that shape.
        const [supersededFact, newFact] = await Promise.all([
          client.contentFact.findFirst({
            where: { organizationId, id: factId },
            include: evaluationInclude,
          }),
          this.evaluateFact(client, organizationId, created.id, actorUserId, now),
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
    // «Ваше слово» (`content-factory-next-tyrk`): a fact with no evidence
    // links at all, or only ones still `PROPOSED`, was never waiting on a
    // review — it is verified on the person's own say-so
    // (`ContentFactService.createFact`). `evaluateFact` runs here for
    // reasons that have nothing to do with such a fact (another fact's
    // evidence was assessed, a different link on this same evidence was
    // reviewed), and must not use that as a reason to demote it.
    const ownWord = fact.evidenceLinks.every(
      (link: any) => link.reviewStatus === 'PROPOSED'
    );
    const status = contradiction
      ? 'CONFLICTED'
      : supports.length
      ? 'VERIFIED'
      : accepted.some((link: any) => link.stance === 'SUPPORTS')
      ? 'STALE'
      : ownWord
      ? 'VERIFIED'
      : 'UNVERIFIED';
    const freshUntil = supports.length
      ? new Date(
          Math.min(
            ...supports.map((item: any) =>
              new Date(authoritativeFreshUntil(item)).getTime()
            )
          )
        )
      : status === 'VERIFIED' && ownWord
      ? fact.freshUntil
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
