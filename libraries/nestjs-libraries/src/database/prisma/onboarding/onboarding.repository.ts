import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { selectedFactsBrief } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece-facts.v2';

/**
 * `ContentPiece` в том виде, в каком этот счёт её спрашивает.
 *
 * Колонка `kind` появилась в схеме позже, чем сгенерирован клиент Prisma в
 * дереве, и `ContentPieceWhereInput` про неё ещё не знает — `tsc` отказывает
 * на живом запросе. `piece.repository.ts` и `content-brief.repository.ts`
 * ходят в ту же таблицу тем же способом, через собственный узкий тип поверх
 * клиента; заводить здесь второй способ значит развести две правды об одной
 * таблице. Тип узкий намеренно: он умеет только посчитать живые заготовки и
 * прочитать их брифы для счёта выбранных опор.
 */
type PieceCounter = {
  count(args: {
    where: { organizationId: string; kind: string; archivedAt: null };
  }): Promise<number>;
  findMany(args: {
    where: { organizationId: string; kind: string; archivedAt: null };
    select: { brief: true };
  }): Promise<Array<{ brief: unknown }>>;
  findFirst(args: {
    where: { organizationId: string; kind: string; archivedAt: null };
    orderBy: { updatedAt: 'desc' };
    select: { id: true };
  }): Promise<{ id: string } | null>;
};

const recordOf = (value: unknown): Record<string, any> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;

/**
 * Facts the current piece path will actually carry into generated text.
 *
 * This delegates the selection rule to the same pure helper the piece service
 * uses. Found rows are opt-in; a person's own row is included by default; a
 * conflicting/corrected pair includes only the selected side. Old briefs
 * without v2 selection fields remain readable. An empty or malformed
 * statement is never completion evidence.
 */
export const selectedPieceFactCount = (storedBrief: unknown): number => {
  const stored = recordOf(storedBrief);
  const brief = recordOf(stored?.brief);
  if (!brief || !Array.isArray(brief.facts)) return 0;
  const facts = brief.facts.filter((fact: unknown) => {
    const row = recordOf(fact);
    return Boolean(
      row && typeof row.statement === 'string' && row.statement.trim()
    );
  });
  return selectedFactsBrief({ ...brief, facts } as any).facts.length;
};

/**
 * `content-factory-next-rrs9`: how far along a workspace actually is.
 *
 * The walkthrough closes a step when the thing exists, not when a person
 * presses «дальше». That is the whole difference between the four paragraphs
 * it replaces and a walkthrough: a step you can dismiss without doing anything
 * teaches nothing, and a step that stays open until the work is done is the
 * product telling the truth about where you are.
 *
 * One answer rather than a request per step from the browser. The page asks
 * one question — how far along am I — and a screen that assembles that from
 * several endpoints has several ways to be half-right, each with its own
 * spinner and its own failure. The only stored content read here is the brief
 * JSON of live CORE pieces: the current flow keeps its chosen facts there,
 * separately from the older cross-piece fact memory.
 *
 * `pieces` joined them on 07.09.2026. The owner had made a заготовка and the
 * brief step stayed open: «У меня все пройдено, кроме пункта… Хотя, по идее,
 * я же создал новую заготовку». The step was reading the draft count, which
 * is what the brief produced back when the brief was the only way in. Since
 * the «заготовка и адаптации» wave a `ContentPiece` with `kind='CORE'` is the
 * other way in and carries the filled brief inside it, so a workspace that
 * has one has done the work the step asks for.
 */
@Injectable()
export class OnboardingRepository {
  constructor(
    private _prisma: PrismaRepository<
      | 'integration'
      | 'brandVoiceSample'
      | 'projectBrandProfile'
      | 'contentFact'
      | 'post'
      | 'contentPiece'
      | 'contentDerivation'
      | 'userOrganization'
    >
  ) {}

  /**
   * Who founded the workspace: the member whose membership is the oldest.
   * The founder and an invited administrator share the role `ADMIN`
   * (`fn33.19`), so the role cannot tell them apart; the first membership
   * can, because `createOrgAndUser` makes the workspace and its first
   * membership in one write and every invitation joins later (2q28.12).
   */
  async founderId(organizationId: string): Promise<string | null> {
    const first = await this._prisma.model.userOrganization.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    return first?.userId ?? null;
  }

  private contentPiece(): PieceCounter {
    return this._prisma.model.contentPiece as unknown as PieceCounter;
  }

  async progress(organizationId: string) {
    const [
      channels,
      voiceSamples,
      avatars,
      facts,
      pieces,
      drafts,
      scheduled,
      adaptations,
      planModes,
    ] = await Promise.all([
        this._prisma.model.integration.count({
          where: { organizationId, deletedAt: null, disabled: false },
        }),
        /*
          The corpus as the screens see it, not every row that ever existed
          (`content-factory-next-za05`). A deleted sample is gone from every
          list and every count elsewhere — `voice-sample.repository.ts` says
          so — and a `STYLE_REFERENCE` past its `retentionUntil` has had its
          text erased in place by `purgeExpiredReferences`: the row survives
          so the corpus history stays readable, the words do not. Counting
          either one would tick the voice step for a workspace whose «Аватары»
          tab shows nothing to measure.
        */
        this._prisma.model.brandVoiceSample.count({
          where: { organizationId, deletedAt: null, text: { not: '' } },
        }),
        /*
          Avatars in use: not deleted, with an active version
          (`content-factory-next-fn33.157`). The hand-filled path gives a
          voice without a single sample — its screen says «Тексты не читаем и
          не разбираем» — so a samples-only count left the voice step open
          forever for whoever took it.
        */
        this._prisma.model.projectBrandProfile.count({
          where: { organizationId, deletedAt: null, activeVersionId: { not: null } },
        }),
        /*
          The same three statuses the brief refuses (`UNUSABLE_FACT_STATUSES`).
          A workspace whose only fact was retracted has not done this step —
          counting it would close the step and then let the brief refuse the
          id, which is the worst of both.
        */
        this._prisma.model.contentFact.count({
          where: {
            organizationId,
            status: { notIn: ['TOMBSTONED', 'RETRACTED', 'SUPERSEDED'] },
          },
        }),
        /*
          Заготовка: `kind='CORE'` и не в архиве. The table has no `deletedAt`
          — `piece.repository.ts` reads `archivedAt` and the list hides an
          archived row — so that is the column asked for here too. A row
          without `kind` predates the wave: its brief was never filled in, so
          it cannot answer for this step.
        */
        this.contentPiece().count({
          where: { organizationId, kind: 'CORE', archivedAt: null },
        }),
        this._prisma.model.post.count({
          where: { organizationId, deletedAt: null, state: 'DRAFT' },
        }),
        /*
          `QUEUE` is «поставлено в расписание» and `PUBLISHED` is what it
          becomes afterwards. Counting only `QUEUE` would reopen the last step
          the moment the post went out, which is exactly backwards.
        */
        this._prisma.model.post.count({
          where: {
            organizationId,
            deletedAt: null,
            state: { in: ['QUEUE', 'PUBLISHED'] },
          },
        }),
        /*
          Адаптации живых заготовок (2q28.6). Since the plan wave an
          adaptation exists before any post does — `postId` stays empty until
          it is planned — so the draft count above cannot answer for the
          adaptation step on its own. Only derivations of a live `CORE` piece:
          an archived piece is gone from every list.
        */
        this._prisma.model.contentDerivation.count({
          where: {
            organizationId,
            piece: { kind: 'CORE', archivedAt: null },
          },
        }),
        /*
          Channels whose plan mode someone chose (`Integration.planMode`,
          97dq.57). `NULL` is read as «Бронь» everywhere, but only a written
          value is a decision a person made, and only that closes the step.
        */
        this._prisma.model.integration.count({
          where: {
            organizationId,
            deletedAt: null,
            disabled: false,
            planMode: { not: null },
          },
        }),
      ]);

    // Most new workspaces have no pieces yet and need no JSON read at all.
    // Once one exists, read only `brief`, never the body or title.
    const corePieces = pieces
      ? await this.contentPiece().findMany({
          where: { organizationId, kind: 'CORE', archivedAt: null },
          select: { brief: true },
        })
      : [];
    /*
      The piece touched last (2q28.6): the adaptation step and its on-screen
      tour open that piece's page, because adaptations are made there and the
      list of pieces has nothing to point at. Only the id.
    */
    const latestPiece = pieces
      ? await this.contentPiece().findFirst({
          where: { organizationId, kind: 'CORE', archivedAt: null },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        })
      : null;

    return {
      channels,
      voiceSamples,
      avatars,
      facts,
      pieceFacts: corePieces.reduce(
        (total, piece) => total + selectedPieceFactCount(piece.brief),
        0
      ),
      pieces,
      drafts,
      scheduled,
      adaptations,
      planModes,
      latestPieceId: latestPiece?.id ?? null,
    };
  }
}
