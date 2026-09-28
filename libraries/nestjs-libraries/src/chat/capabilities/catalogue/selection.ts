import { z } from 'zod';
import { AGENT_DECIDE_FOR_PERSON_KEY } from '../agent-parts.contract';
import { isProductErrorCode } from '../capability.types';

/**
 * The selection card (`AgentSelectionQuestionPayload`, `kcxz.12`, `kcxz.13`):
 * rows the person keeps — facts at a research pause, changes of a check or a
 * rewrite. One shape for every capability that pauses for such a choice.
 *
 * What the card carries beyond the wire shape (a snapshot key, a proposal
 * token) is what the answer continues. On resume it is read from the payload
 * Mastra stored on the server (`ctx.suspendPayload`), never from the browser,
 * and the model never carries it: no capability input names a row, a key or
 * a token (guarded in `tests/agent-capabilities.registry.guard.test.cjs`).
 */

export const RESEARCH_LEVELS = ['quick', 'standard', 'deep'] as const;
export type ResearchLevel = (typeof RESEARCH_LEVELS)[number];

const selectionOption = z.object({
  id: z.string(),
  label: z.string(),
  selected: z.boolean(),
  status: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});
export type SelectionOption = z.infer<typeof selectionOption>;

/** The card's schema for one answer key, plus what the answer continues. */
export const selectionQuestion = <K extends string, E extends z.ZodRawShape>(
  answerKey: K,
  extra: E
) =>
  z.object({
    kind: z.literal('selection'),
    question: z.string(),
    answerKey: z.literal(answerKey),
    options: z.array(selectionOption),
    canDecideForPerson: z.literal(true),
    ...extra,
  });

/** The person's answer: row ids under the card's key, or «Решите за меня». */
export const selectionAnswer = <K extends string>(answerKey: K, max: number) =>
  z.object({
    [answerKey]: z.array(z.string().max(400)).max(max).optional(),
    [AGENT_DECIDE_FOR_PERSON_KEY]: z.boolean().optional(),
  } as Record<K | typeof AGENT_DECIDE_FOR_PERSON_KEY, z.ZodOptional<z.ZodTypeAny>>);

/** What the product keeps by itself: the screen's own preselection. */
export const defaultIds = (options: readonly SelectionOption[]) =>
  options.filter((option) => option.selected).map((option) => option.id);

/**
 * The ids the answer keeps: the defaults for «Решите за меня», otherwise the
 * named rows that the card offered — nothing else, in the card's order.
 */
export const chosenIds = (
  options: readonly SelectionOption[],
  answer: Record<string, unknown>,
  answerKey: string
): string[] => {
  if (answer[AGENT_DECIDE_FOR_PERSON_KEY] === true) return defaultIds(options);
  const named = new Set(
    Array.isArray(answer[answerKey]) ? (answer[answerKey] as string[]) : []
  );
  return options.filter((option) => named.has(option.id)).map((option) => option.id);
};

export const hostOf = (url: unknown): string | null => {
  if (typeof url !== 'string' || !url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/**
 * Fact rows as the research screens show them (`intake.research.tsx`,
 * `adaptation-review.tsx`): the id the screen sends back for a row
 * (`factKey ?? statement`), the statement, and the row's own preselection.
 */
export const factOptions = (facts: unknown, { keyed = false } = {}): SelectionOption[] =>
  (Array.isArray(facts) ? facts : [])
    .map((fact: any) => ({
      id: String((keyed ? fact?.factKey : fact?.factKey ?? fact?.statement) ?? ''),
      label: String(fact?.statement ?? '').slice(0, 400),
      selected: fact?.selected === true,
      status: typeof fact?.status === 'string' ? fact.status : null,
      source: hostOf(fact?.sourceUrl),
    }))
    .filter((option) => option.id);

/** The facts card: `factKeys`, the snapshot the answer continues, the level. */
export const factSelection = selectionQuestion('factKeys', {
  snapshotKey: z.string().nullable(),
  level: z.enum(RESEARCH_LEVELS),
  /** When the intake asked it (ms): its first pass is kept for an hour. */
  askedAt: z.number().optional(),
});
export type FactSelection = z.infer<typeof factSelection>;
export const factAnswer = selectionAnswer('factKeys', 100);

/** A refusal that keeps its code, the shape the doors' `safeHttpError` reads. */
export const codedFailure = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

/**
 * A failure a service reported as an event (`{ name: 'error', code, message }`)
 * — the adapt, intake and answer generators (correctness review W2 F13). The
 * service's words reach the model only under a product code other than the
 * generic one a caught exception is dressed in (`GENERATION_FAILED` around
 * `error.message`): that text was never written for people.
 */
export const eventFailure = (
  code: unknown,
  message: unknown,
  genericCode: string,
  genericMessage: string
) => {
  const named = isProductErrorCode(code) ? code : genericCode;
  const words =
    named !== genericCode && typeof message === 'string' && message.trim()
      ? message.trim().slice(0, 1_000)
      : genericMessage;
  return codedFailure(named, words);
};

/**
 * A choice only a person makes, asked where there is nobody to ask (MCP):
 * refused before anything is spent.
 */
export const needsPerson = () =>
  codedFailure(
    'INPUT_NEEDS_PERSON',
    'Accepting the result needs the person’s choice on a card in the web chat; nothing was spent.'
  );

/**
 * A question as the agent may quote it (W3 recheck R-4, R-6): whole when
 * short, else cut at a word with «…».
 */
/**
 * How long a question the agent is told to quote word for word may be
 * (`leftToAuthor`, `openQuestions`; kcxz W3 final recheck F-3b). The
 * questions are one sentence each and fit whole; the bound keeps a runaway
 * one from filling the tool output.
 */
export const QUOTED_QUESTION_MAX = 300;

export const shortQuestion = (text: string, limit = 120) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), limit - 20)).trimEnd()}…`;
};
