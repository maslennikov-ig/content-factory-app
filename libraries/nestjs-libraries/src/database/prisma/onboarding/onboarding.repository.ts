import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';

/**
 * `ContentPiece` в том виде, в каком этот счёт её спрашивает.
 *
 * Колонка `kind` появилась в схеме позже, чем сгенерирован клиент Prisma в
 * дереве, и `ContentPieceWhereInput` про неё ещё не знает — `tsc` отказывает
 * на живом запросе. `piece.repository.ts` и `content-brief.repository.ts`
 * ходят в ту же таблицу тем же способом, через собственный узкий тип поверх
 * клиента; заводить здесь второй способ значит развести две правды об одной
 * таблице. Тип узкий намеренно: это единственный вопрос, который отсюда
 * задаётся.
 */
type PieceCounter = {
  count(args: {
    where: { organizationId: string; kind: string; archivedAt: null };
  }): Promise<number>;
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
 * Six counts in one answer rather than six requests from the browser. The
 * page asks one question — how far along am I — and a screen that assembles
 * that from four endpoints has four ways to be half-right, each with its own
 * spinner and its own failure. Counts only: nothing here reads content, so it
 * stays cheap enough to ask on every visit to the page.
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
      | 'contentFact'
      | 'post'
      | 'contentPiece'
    >
  ) {}

  private contentPiece(): PieceCounter {
    return this._prisma.model.contentPiece as unknown as PieceCounter;
  }

  async progress(organizationId: string) {
    const [channels, voiceSamples, facts, pieces, drafts, scheduled] =
      await Promise.all([
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
      ]);

    return { channels, voiceSamples, facts, pieces, drafts, scheduled };
  }
}
