/** Native per-step notes and stream closing; technical fuses live in conductor.execution.ts. */

export type StepLanguage = 'ru' | 'en';

/**
 * The line a stop ends with when something is left (W3 walk P2-B, P2-D;
 * correctness review F8): the person's word for going on, in their language.
 */
export const CONTINUE_LINE = {
  ru: 'Напишите «дальше» — продолжим.',
  en: 'Write “next” — we\'ll continue.',
} as const;

/** The words that mean «go on with what was left», in either language. */
export const CONTINUE_WORDS = '«дальше», «продолжай», “next”, “continue”';

/** What the model reads on the last step, beside its instructions. */
export const LAST_STEP_NOTE = 'An execution budget is a technical stop, never evidence of task completion. Preserve confirmed results and explain exactly what remains when a budget stops work.';

type PrepareStepArgs = {
  stepNumber: number;
  systemMessages?: unknown;
  /** One per stream (and per approval leg): the key of «this request's steps». */
  messageList?: unknown;
};

/**
 * `prepareStep` carries the request's own notes. `notes` are system lines
 * of this request only (the door's reading of a «Нет», correctness review
 * F9): read on every step of it, never stored in the thread.
 */
export const stepNotes =
  (notes: readonly string[] = []) =>
  (args: PrepareStepArgs) => {
    if (!notes.length) return undefined;
    return {
      // Appended to the untagged system messages Mastra passes in, never in
      // their place: without that list nothing is replaced.
      ...(Array.isArray(args.systemMessages)
        ? {
            systemMessages: [
              ...args.systemMessages,
              ...notes.map((content) => ({ role: 'system' as const, content })),
            ],
          }
        : {}),
    };
  };

/** Compatibility for existing native callers: notes never disable tools. */
export const lastStepSpeaks = (
  _maxSteps: number,
  notes: readonly string[] = [],
  _options: { resumed?: boolean } = {}
) => stepNotes(notes);

/**
 * The door's own closing line, for a stream that still ended with no words
 * and no card after its last tool (a model that answered with nothing, or
 * one cut off by its length or reasoning budget): the person never gets
 * silence. Not stored in the thread — the next message reads the steps
 * themselves.
 */
export const STEP_CAP_CLOSING = {
  ru: 'Задача не завершена. Подтверждённые результаты сохранены; оставшуюся работу нужно продолжить с учётом уже выполненного.',
  en: 'The task is incomplete. Confirmed results are preserved; remaining work must continue from the existing results.',
} as const;

const OUTPUT_PARTS = new Set(['tool-output-available', 'tool-output-error']);
const LEG_START_PARTS = new Set([...OUTPUT_PARTS, 'tool-output-denied']);

/**
 * Whether the stream the door relays ends silent (correctness review F1,
 * F10). Fed every UI part in order; `before(part)` says whether the closing
 * line goes out before that part.
 *
 * - A card (an approval or a question) is an answer until its leg ends; words
 *   after the last tool are an answer; so is the open-proposal stop
 *   (`PROPOSAL_CARD_OPEN`, kcxz.38), which the person sees under the tool.
 * - Silence is a finish that is not an error, after a tool ran, with neither
 *   — whatever its reason (`tool-calls`, `stop` on an empty last step,
 *   `length` when the budget ran out).
 * - `legCalls`: the calls an approval request answers. Mastra resumes each as
 *   its own leg and keeps one `finish` for the whole request, so a leg begins
 *   with its call's output: the previous leg is judged there, and a card of
 *   one leg does not answer for the next.
 * - At most one line per stream; none after an error part.
 */
export const closingLineWatch = (legCalls: Iterable<string> = []) => {
  const legs = new Set(legCalls);
  let said: 'card' | 'words' | null = null;
  let toolRan = false;
  let failed = false;
  let written = false;
  let legsSeen = 0;
  const silent = () => !written && !failed && toolRan && said === null;

  return {
    before(part: any): boolean {
      let close = false;
      if (LEG_START_PARTS.has(part?.type) && legs.has(part.toolCallId)) {
        if (legsSeen > 0 && silent()) close = true;
        legsSeen += 1;
        said = null;
        toolRan = false;
      }
      if (part?.type === 'error') failed = true;
      if (part?.type === 'finish') {
        if (part.finishReason === 'error') failed = true;
        else if (silent()) close = true;
      }
      if (close) written = true;

      if (said !== 'card') {
        if (part?.type === 'tool-approval-request' || part?.type === 'data-tool-call-suspended') {
          said = 'card';
        } else if (
          part?.type === 'text-delta' &&
          typeof part.delta === 'string' &&
          part.delta.trim()
        ) {
          said = 'words';
        } else if (part?.type === 'tool-input-start' || part?.type === 'tool-input-available') {
          toolRan = true;
          said = null;
        } else if (OUTPUT_PARTS.has(part?.type)) {
          toolRan = true;
          said = part.output?.code === 'PROPOSAL_CARD_OPEN' ? 'words' : null;
        }
      }
      return close;
    },
  };
};

/**
 * Ends the turn after a step whose every tool call was refused with
 * `PROPOSAL_CARD_OPEN` (`kcxz.38`, R5). The person already reads that refusal
 * under the tool, in their words; a model step after it only restated it
 * («Повторную проверку сейчас не запустили.») however the reason was worded.
 * So the loop stops there, natively (Mastra's `stopWhen`, evaluated after a
 * step with tool results), and no model text follows. A step that also ran
 * another tool goes on as ever: the rest of the message is answered.
 */
type StepLike = {
  content?: ReadonlyArray<{ type?: string; toolCallId?: string; output?: unknown; result?: unknown }>;
};

const refusedOpenProposal = (part: { output?: unknown; result?: unknown }): boolean => {
  const raw = (part.output ?? part.result) as { type?: unknown; value?: unknown } | undefined;
  // AI SDK v5 model messages wrap a tool's value as `{ type: 'json', value }`.
  const value = (raw && typeof raw === 'object' && 'value' in raw && (raw.type === 'json' || raw.type === 'text')
    ? raw.value
    : raw) as { ok?: unknown; code?: unknown } | undefined;
  return !!value && typeof value === 'object' && value.ok === false && value.code === 'PROPOSAL_CARD_OPEN';
};

export const stopAfterOpenProposalRefusal = ({
  steps,
}: {
  steps: ReadonlyArray<StepLike>;
}): boolean => {
  const last = steps[steps.length - 1];
  const content = last?.content ?? [];
  const calls = content.filter((part) => part.type === 'tool-call');
  const results = content.filter((part) => part.type === 'tool-result');
  if (!calls.length || results.length !== calls.length) return false;
  return results.every(refusedOpenProposal);
};
