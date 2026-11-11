import type { RequestContext } from '@mastra/core/request-context';
import { AGENT_MATERIAL_FORMAT_CONTEXT_KEY, explicitMaterialFormats } from './chat-mode';
import { createTool } from '@mastra/core/tools';
import { askUserTool } from '@mastra/core/agent-controller';
import { z } from 'zod/v4';

/** The native SDK erases app keys at the tool boundary; recover only this key. */
const rememberPersonFormats = (context: RequestContext | undefined, formats: readonly string[]) => {
  const appContext = context as RequestContext<{[AGENT_MATERIAL_FORMAT_CONTEXT_KEY]: string}> | undefined;
  appContext?.set(AGENT_MATERIAL_FORMAT_CONTEXT_KEY, JSON.stringify(formats));
};
const option = z.object({ label: z.string().trim().min(1), description: z.string().optional() }).strict();
const questionPurpose = z.enum(['fact', 'creative', 'format', 'identity', 'voice', 'consent']).describe('format: the person-selected output format; identity or voice: NEW or unresolved person/voice likeness or initial voice selection; consent: actual human permission. These never delegate. fact: required owner/business facts, rights, budget or account capabilities; creative: an ordinary editorial or per-video choice within saved approved setup. Omitted means fact.');
// A creative label cannot turn an explicit identity/voice selection into an
// editorial answer. Exact saved profile reuse happens before asking a question.
const protectedSelection = /(?:\b(?:which|choose|select|pick|whose)\b[^?\n]{0,100}\b(?:voices?|identity|person|likeness)\b|(?:выб[\p{L}]*|како[\p{L}]*|котор[\p{L}]*|чей|чь[\p{L}]*)[^?\n]{0,100}(?:голос[\p{L}]*|личност[\p{L}]*|человек[\p{L}]*)|\b(?:clon(?:e|ing)|voice likeness|permission|consent)\b|клонир[\p{L}]*|согласи[\p{L}]*)/iu;
export const nativeQuestionCanDelegate = (question: {question?: unknown; questionPurpose?: unknown; canDecideForPerson?: unknown}): boolean =>
  question.questionPurpose === 'creative' && question.canDecideForPerson !== false &&
  !(typeof question.question === 'string' && protectedSelection.test(question.question));
const nativeSingleQuestionSchema = z.object({
  question: z.string().min(1), options: z.array(option).optional(),
  selectionMode: z.enum(['single_select', 'multi_select']).optional(),
  questionPurpose: questionPurpose.optional(), canDecideForPerson: z.boolean().optional(),
}).strict().refine((value) => !value.selectionMode || !!value.options?.length, {
  message: 'selectionMode requires options',
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

// A root union is advertised by the provider adapter as {input: ...}, while
// native tool validation still receives that envelope. Advertise an object
// and accept the saved envelope too; optional nulls mean absent, not consent.
const wireFields = {
  options: z.array(option.extend({ description: z.string().nullish() })).nullish(),
  selectionMode: z.enum(['single_select', 'multi_select']).nullish(),
  questionPurpose: questionPurpose.nullish(), canDecideForPerson: z.boolean().nullish(),
};
const wireQuestion = z.object({ question: z.string().min(1), ...wireFields }).strict();
const wireInput = z.object({ question: z.string().min(1).nullish(), ...wireFields,
  questions: z.array(wireQuestion).nullish() }).strict();
const canonicalInput = z.union([nativeSingleQuestionSchema, nativeQuestionBatchInputSchema]);
const omitOptionalNulls = (value: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(
  Object.entries(value).filter(([, field]) => field !== null && field !== undefined).map(([key, field]) => [key,
    (key === 'questions' || key === 'options') && Array.isArray(field)
      ? field.map(row => omitOptionalNulls(row as Record<string, unknown>)) : field])
);
const nativeQuestionInputSchema = wireInput.extend({ input: wireInput.nullish() }).superRefine((value, context) => {
  const { input, ...direct } = value;
  if (input && Object.keys(omitOptionalNulls(direct)).length) {
    context.addIssue({ code: 'custom', message: 'Provide one direct question form or input envelope, not both.' });
    return;
  }
  const parsed = canonicalInput.safeParse(omitOptionalNulls(input ?? direct));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue(issue);
  }
});
const normalizeNativeQuestionInput = (supplied: unknown) => {
  const { input, ...direct } = nativeQuestionInputSchema.parse(supplied);
  return canonicalInput.parse(omitOptionalNulls(input ?? direct));
};
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
    description: `${askUserTool.description} Mark questionPurpose=format for the output format of a new material; only the person supplies it in every chat mode. Mark identity or voice for NEW or unresolved person/voice likeness or initial voice selection, and consent for actual human permission; these never delegate. Reuse unchanged saved human-approved profile/voice before asking; per-video look, background and ordinary delivery are creative choices within that setup. Mark fact for missing owner/business facts, rights, budget or account features; these cannot be delegated or invented. Only an explicit creative question permits editorial delegation. Omitted purpose is fact, including legacy questions. For several independent questions, provide questions as an array in one call. The person sees them one at a time and answers the complete set before you continue. Do not invent personal views or synthesize a human resume.`,
    inputSchema: nativeQuestionInputSchema,
    suspendSchema: z.union([nativeSingleQuestionSchema, nativeQuestionBatchSuspendSchema]),
    resumeSchema: z.union([askUserTool.resumeSchema, nativeQuestionBatchResumeSchema, z.object({decideForPerson: z.literal(true)}).strict()]),
    requireApproval: (_input, context?: { requestContext?: any }) => {
      const request = context?.requestContext;
      const controller = request?.get?.('controller') ?? request?.controller;
      const state = controller?.getState?.() ?? controller?.state;
      const rules = state?.permissionRules;
      return (rules?.tools?.ask_user ?? rules?.categories?.read) !== 'allow';
    },
    execute: async (supplied, context) => {
      // Native cold resume skips SDK input validation and restores original
      // model arguments, so normalize again before using the saved question.
      const input = normalizeNativeQuestionInput(supplied);
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
          if (payload.questionPurpose === 'format') {
            const nativeAnswer: unknown = parsed.data;
            const answer = typeof nativeAnswer === 'string' || Array.isArray(nativeAnswer)
              ? nativeAnswer : (nativeAnswer as {answer?: unknown})?.answer;
            const formats = explicitMaterialFormats(typeof answer === 'string' ? answer : Array.isArray(answer) ? answer.join(' ') : '');
            rememberPersonFormats(context?.requestContext, formats);
          }
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
        const formatAnswers = (resumed as z.infer<typeof nativeQuestionBatchResumeSchema>).answers
          .filter((value, index) => payload.questions[index].questionPurpose === 'format' && value.answer !== undefined)
          .flatMap(value => explicitMaterialFormats(Array.isArray(value.answer) ? value.answer.join(' ') : value.answer ?? ''));
        if (payload.questions.some(question => question.questionPurpose === 'format'))
          rememberPersonFormats(context?.requestContext, [...new Set(formatAnswers)]);
        // Omission and delegation are not author statements.
        return { questions: payload.questions, answers: (resumed as z.infer<typeof nativeQuestionBatchResumeSchema>).answers };
      }
      if (!context?.agent?.suspend) throw new Error('Question suspension is unavailable.');
      return await context.agent.suspend(payload);
    },
    transform: askUserTool.transform,
  });
}
