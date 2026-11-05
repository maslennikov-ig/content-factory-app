import { createTool } from '@mastra/core/tools';
import { askUserTool } from '@mastra/core/agent-controller';
import { z } from 'zod/v4';

const option = z.object({ label: z.string().trim().min(1), description: z.string().optional() }).strict();
const questionPurpose = z.enum(['fact', 'creative']).describe('fact: required owner/business facts, rights, budget, account capabilities or consent; creative: an editorial choice the person may delegate. Omitted means fact.');
export const nativeQuestionCanDelegate = (question: {questionPurpose?: unknown; canDecideForPerson?: unknown}): boolean =>
  question.questionPurpose === 'creative' && question.canDecideForPerson !== false;
const nativeSingleQuestionSchema = z.object({
  question: z.string().min(1), options: z.array(option).optional(),
  selectionMode: z.enum(['single_select', 'multi_select']).optional(),
  questionPurpose: questionPurpose.optional(), canDecideForPerson: z.boolean().optional(),
});
export const nativeBatchQuestionSchema = z.object({
  question: z.string().trim().min(1),
  options: z.array(option).min(1).optional(),
  selectionMode: z.enum(['single_select', 'multi_select']).optional(),
  canDecideForPerson: z.boolean().optional(),
  questionPurpose: questionPurpose.optional(),
}).strict().refine((value) => !value.selectionMode || !!value.options?.length, {
  message: 'selectionMode requires options',
});
const nonEmpty = z.string().trim().min(1);
const answer = z.object({
  answer: z.union([nonEmpty, z.array(nonEmpty).min(1)]).optional(),
  decideForPerson: z.literal(true).optional(),
  skipped: z.literal(true).optional(),
}).strict().refine((value) => [value.answer !== undefined, value.decideForPerson === true, value.skipped === true].filter(Boolean).length === 1,
  { message: 'Provide exactly one answer, delegation or skip.' });
export const nativeQuestionBatchInputSchema = z.object({
  questions: z.array(nativeBatchQuestionSchema).min(1),
}).strict();
export const nativeQuestionBatchSuspendSchema = nativeQuestionBatchInputSchema.extend({ kind: z.literal('question-batch') });
export const nativeQuestionBatchResumeSchema = z.object({ answers: z.array(answer).min(1) }).strict();

/** Validate against the saved native suspension, not a browser-supplied question list. */
export function nativeQuestionBatchAnswerFits(payload: unknown, response: unknown): boolean {
  const questions = nativeQuestionBatchSuspendSchema.safeParse(payload);
  const answers = nativeQuestionBatchResumeSchema.safeParse(response);
  if (!questions.success || !answers.success || questions.data.questions.length !== answers.data.answers.length) return false;
  return answers.data.answers.every((value, index) => {
    const question = questions.data.questions[index];
    if (value.decideForPerson && !nativeQuestionCanDelegate(question)) return false;
    if (Array.isArray(value.answer) && question.selectionMode !== 'multi_select') return false;
    return true;
  });
}

/** Keep the native tool identity, so session permissions and cold resume use
 * precisely the same rules as a single ask_user question. */
export function createNativeQuestionTool() {
  return createTool({
    id: 'ask_user',
    description: `${askUserTool.description} Mark questionPurpose=fact for missing owner/business facts, rights, budget, account features or consent; these cannot be delegated or invented. Only an explicit creative question permits editorial delegation. Omitted purpose is fact, including legacy questions. For several independent questions, provide questions as an array in one call. The person sees them one at a time and answers the complete set before you continue. Do not invent personal views.`,
    inputSchema: z.union([nativeSingleQuestionSchema, nativeQuestionBatchInputSchema]),
    suspendSchema: z.union([nativeSingleQuestionSchema, nativeQuestionBatchSuspendSchema]),
    resumeSchema: z.union([askUserTool.resumeSchema, nativeQuestionBatchResumeSchema, z.object({decideForPerson: z.literal(true)}).strict()]),
    requireApproval: (_input, context?: { requestContext?: any }) => {
      const request = context?.requestContext;
      const controller = request?.get?.('controller') ?? request?.controller;
      const state = controller?.getState?.() ?? controller?.state;
      const rules = state?.permissionRules;
      return (rules?.tools?.ask_user ?? rules?.categories?.read) !== 'allow';
    },
    execute: async (input, context) => {
      if (!('questions' in input)) {
        const payload = {...input, questionPurpose: input.questionPurpose ?? 'fact', canDecideForPerson: nativeQuestionCanDelegate(input)};
        const resumed = context?.agent?.resumeData;
        if (resumed !== undefined) {
          if (typeof resumed === 'object' && resumed !== null && 'decideForPerson' in resumed) {
            if (!payload.canDecideForPerson || resumed.decideForPerson !== true || Object.keys(resumed).length !== 1) throw new Error('This question requires a person-supplied answer.');
            return {content: 'Editorial choice delegated. This supplies no owner facts, rights, budget or consent.', questionPurpose: payload.questionPurpose, resolution: 'editorial_delegation', isError: false};
          }
          const parsed = askUserTool.resumeSchema.safeParse(resumed);
          if (!parsed.success) throw new Error('Answer does not match the question.');
          const result = await (askUserTool as any).execute(input, context);
          return {...result, questionPurpose: payload.questionPurpose, resolution: 'person_reply'};
        }
        if (input.selectionMode && !input.options?.length) throw new Error('selectionMode requires options.');
        if (!context?.agent?.suspend) return (askUserTool as any).execute(input, context);
        return await context.agent.suspend(payload);
      }
      const payload = { kind: 'question-batch' as const, questions: input.questions.map((question: z.infer<typeof nativeBatchQuestionSchema>) => ({...question, questionPurpose: question.questionPurpose ?? 'fact', canDecideForPerson: nativeQuestionCanDelegate(question)})) };
      const resumed = context?.agent?.resumeData;
      if (resumed !== undefined) {
        if (!nativeQuestionBatchAnswerFits(payload, resumed)) throw new Error('Answers do not match the questions.');
        // Omission and delegation are not author statements.
        return { questions: payload.questions, answers: (resumed as z.infer<typeof nativeQuestionBatchResumeSchema>).answers };
      }
      if (!context?.agent?.suspend) throw new Error('Question suspension is unavailable.');
      return await context.agent.suspend(payload);
    },
    transform: askUserTool.transform,
  });
}
