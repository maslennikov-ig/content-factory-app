import { ConflictException } from '@nestjs/common';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import type { CapabilityRunContext } from './capability.types';
import { isDomainQuestionCard, domainQuestionRevision, domainQuestionSchema, mergeDomainQuestionAnswers, domainQuestionsComplete, type DomainQuestionCard } from './domain-question-contract';
export * from './domain-question-contract';

/** Called before the ingress consumes a pending card, and again before domain application. */
export const assertDomainQuestionCurrent = async (
  ctx: Pick<CapabilityRunContext, 'organizationId' | 'language' | 'service'>,
  payload: unknown
): Promise<void> => {
  if (!isDomainQuestionCard(payload)) return;
  const detail = await ctx.service(PieceService).detail(ctx.organizationId, payload.source.pieceId, ctx.language);
  if (domainQuestionRevision(detail, payload.source) !== payload.source.revision) {
    const message = ctx.language === 'ru'
      ? 'Материал изменился после этих вопросов. Ваш ответ сохранён в поле; откройте актуальные вопросы.'
      : 'The material changed after these questions were shown. Your typed answer is retained; open the current questions.';
    throw Object.assign(new ConflictException({ code: 'AGENT_QUESTION_STALE', message }), { code: 'AGENT_QUESTION_STALE' });
  }
};

/** One native resume saves a partial answer before showing the next question. */
export const continueDomainQuestions = async (ctx: CapabilityRunContext): Promise<DomainQuestionCard | undefined> => {
  const stored = domainQuestionSchema.parse(ctx.suspendPayload) as DomainQuestionCard;
  await assertDomainQuestionCurrent(ctx, stored);
  const next = mergeDomainQuestionAnswers(stored, ctx.resumeData);
  if (!domainQuestionsComplete(next)) {
    await ctx.suspend!(next);
    return undefined;
  }
  return next;
};
