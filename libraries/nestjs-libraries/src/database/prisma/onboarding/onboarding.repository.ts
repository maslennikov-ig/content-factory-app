import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';

/**
 * `content-factory-next-rrs9`: how far along a workspace actually is.
 *
 * The walkthrough closes a step when the thing exists, not when a person
 * presses «дальше». That is the whole difference between the four paragraphs
 * it replaces and a walkthrough: a step you can dismiss without doing anything
 * teaches nothing, and a step that stays open until the work is done is the
 * product telling the truth about where you are.
 *
 * Five counts in one answer rather than five requests from the browser. The
 * page asks one question — how far along am I — and a screen that assembles
 * that from four endpoints has four ways to be half-right, each with its own
 * spinner and its own failure. Counts only: nothing here reads content, so it
 * stays cheap enough to ask on every visit to the page.
 */
@Injectable()
export class OnboardingRepository {
  constructor(
    private _prisma: PrismaRepository<
      'integration' | 'brandVoiceSample' | 'contentFact' | 'post'
    >
  ) {}

  async progress(organizationId: string) {
    const [channels, voiceSamples, facts, drafts, scheduled] =
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

    return { channels, voiceSamples, facts, drafts, scheduled };
  }
}
