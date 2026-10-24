import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import type { PieceAnswerRequestV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { CapabilityEmit, CapabilityRunContext } from '../capability.types';
import { createDomainQuestionCard, domainQuestionRevision, continueDomainQuestions, isDomainQuestionCard, type DomainQuestionCard } from '../domain-questions';
import { codedFailure as intakeFailure, eventFailure, shortQuestion, QUOTED_QUESTION_MAX } from './selection';

const isMaterialQuestion = (id: string) => id.startsWith('ask-');

export type PieceAnswered = {
  pieceId: string;
  code: string | null;
  questions: number;
  /**
   * Questions about the author's own experience that nobody answered (`wffi`):
   * under the default policy we never invent them, the core goes around the
   * gap. The agent must not say they were decided.
   */
  leftToAuthor?: string[];
  /**
   * «Какую ссылку поставить в пост?» was closed by this call as «Без ссылки»
   * (`kcxz.37`, F9): everything was handed over and a link is never invented.
   */
  postLink?: 'none';
};


/** The same request and domain generator used by the standalone manual form. */
export const applyPieceQuestionAnswers = async (
  ctx: CapabilityRunContext,
  input: {pieceId?: string; answers?: Array<{questionId?: string; text?: string}>; decide?: string[]},
  emit: CapabilityEmit
): Promise<PieceAnswered> => {
    // The body the piece page sends (`piece.container.tsx`): answers by field,
    // a material question by its key on `facts`; «Решите за меня» by field.
    const given = (input.answers ?? []).map((answer) =>
      isMaterialQuestion(answer.questionId)
        ? { field: 'facts', key: answer.questionId, text: answer.text }
        : { field: answer.questionId, text: answer.text }
    );
    // A material question left unanswered is delegated by the service itself.
    const decide = [
      ...new Set((input.decide ?? []).filter((id) => !isMaterialQuestion(id))),
    ];
    const request = {
      ...(given.length ? { answers: given } : {}),
      ...(decide.length ? { decide } : {}),
    } as PieceAnswerRequestV1;
    const pieces = ctx.service(PieceService);
    const plan = await pieces.prepareAnswer(
      ctx.organizationId,
      input.pieceId,
      request,
      ctx.language
    );
    const toldKeys = new Set(given.flatMap((answer) => ('key' in answer ? [answer.key] : [])));
    const linkBefore = plan.core?.postLink;
    const openMaterial = (plan.core?.questions?.items ?? []).filter(
      (question) => question.key && !toldKeys.has(question.key)
    );
    let answered: PieceAnswered | null = null;
    for await (const event of pieces.answer(ctx.organizationId, plan, ctx.userId)) {
      const named = event as { name: string } & Record<string, any>;
      await emit({
        kind: 'progress',
        data: { capability: 'piece.answer', stage: named.name },
        transient: true,
      });
      if (named.name === 'piece') {
        answered = { pieceId: named.pieceId, code: named.code ?? null, questions: 0 };
        // What the service stored for them: an empty model answer is a gap.
        const stored: Array<{ key?: string; origin?: string; text?: string }> =
          named.core?.questions?.answered ?? [];
        const gaps = openMaterial.filter((question) =>
          stored.some(
            (one) => one.key === question.key && one.origin === 'model' && !one.text?.trim()
          )
        );
        if (gaps.length) {
          answered.leftToAuthor = gaps.map((question) =>
            shortQuestion(question.question, QUOTED_QUESTION_MAX)
          );
        }
        const link = named.core?.postLink;
        if (!linkBefore && link && link.url === null) answered.postLink = 'none';
      }
      if (named.name === 'questions' && answered) {
        answered.questions = Array.isArray(named.questions) ? named.questions.length : 0;
      }
      if (named.name === 'error') {
        throw eventFailure(named.code, named.message, 'PIECE_NOT_SAVED', 'The answers could not be saved.');
      }
    }
    if (!answered) {
      throw intakeFailure('PIECE_NOT_SAVED', 'The answers could not be saved.');
    }
    return answered;
};

type PieceResult = { pieceId?: string; questions?: number; code?: string | null } & Record<string, any>;
type PieceRun<T extends PieceResult> = (ctx: CapabilityRunContext, input: any, emit: CapabilityEmit) => Promise<T | undefined>;

/** Pause on the exact saved questions; the original paid create/rebuild is never repeated on resume. */
export const askPieceQuestions = async <T extends PieceResult>(
  ctx: CapabilityRunContext, output: T, emit: CapabilityEmit, inspect = false
): Promise<T | undefined> => {
  if (!ctx.suspend || !output.pieceId || (!inspect && !output.questions)) return output;
  const detail = await ctx.service(PieceService).detail(ctx.organizationId, output.pieceId, ctx.language);
  const pending = detail.core?.questions?.items ?? [];
  if (!pending.length) return output;
  const source = { kind: 'piece' as const, pieceId: output.pieceId,
    revision: domainQuestionRevision(detail, {kind: 'piece'}) };
  await emit({ kind: 'piece', data: { kind: 'piece', id: output.pieceId, code: detail.piece.code ?? output.code, questions: pending.length } });
  await ctx.suspend(createDomainQuestionCard(source, pending,
    ctx.language === 'ru' ? 'Уточним материал. Ответьте на вопросы здесь.' : 'Clarify the material by answering here.',
    { continuation: { operation: 'piece-questions', result: output } }));
  return undefined;
};

export const resumePieceQuestions = async <T extends PieceResult>(ctx: CapabilityRunContext, emit: CapabilityEmit): Promise<T | undefined> => {
  const card = await continueDomainQuestions(ctx);
  if (!card) return undefined;
  if (card.source.kind !== 'piece' || card.continuation?.operation !== 'piece-questions') {
    throw intakeFailure('INPUT_NEEDS_PERSON', 'The questions do not belong to this operation.');
  }
  const result = await applyPieceQuestionAnswers(ctx, {
    pieceId: card.source.pieceId,
    answers: card.answers.filter(answer => answer.mode !== 'delegate').map(answer => ({questionId: answer.key, text: answer.text!})),
    decide: card.answers.filter(answer => answer.mode === 'delegate').map(answer => answer.key),
  }, emit);
  return askPieceQuestions(ctx, { ...(card.continuation?.result as T), ...result }, emit) as Promise<T | undefined>;
};

/** Native tools may park after a saved result; MCP retains its existing manual request contract. */
export const withPieceQuestions = <T extends PieceResult>(run: PieceRun<T>, inspect = false): PieceRun<T> => async (ctx, input, emit) => {
  if (isDomainQuestionCard(ctx.suspendPayload) && ctx.resumeData !== undefined) return resumePieceQuestions<T>(ctx, emit);
  const output = await run(ctx, input, emit);
  return output ? askPieceQuestions(ctx, output, emit, inspect) : output;
};
