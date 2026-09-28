/**
 * The last step of a turn speaks (W3 live walk 28.09.2026, P2-B; spec §4.6).
 *
 * A turn runs at most `maxSteps` model steps. The walk's «second avatar by
 * five lines» spent all six on tool calls and the stream ended with
 * `finishReason: "tool-calls"`: no words, no card, the person had to write
 * again to learn what happened. Asking the model to leave room is a request;
 * this is the guarantee, in Mastra's own per-step hook (`prepareStep`, run
 * before every step): the step that is the last one this request may take
 * runs with `toolChoice: 'none'` and one more system line saying what to say.
 * A turn that ends earlier never meets it.
 *
 * Steps are counted from the first step of this request (correctness review
 * F1, proven in `turn-step-cap-after-approval` / `-after-question`): a run
 * resumed after «Да» or a question card gets `stepNumber` = the steps it took
 * before the pause, while Mastra's own `stepCountIs(maxSteps)` counts only the
 * steps of this stream — the resumed step itself among them. Counting from 0
 * made the first step after «Да» the «last» one — tools off, the person's
 * follow-up blocked. The first step a
 * stream shows is remembered per stream (its `messageList`, one per stream
 * and per approval leg), so the hook holds no state between requests.
 *
 * The door passes its own `maxSteps` (it splits the cap between the answers of
 * one approval request) and the notes of this request (what «Нет» means), so
 * the hook is built per request; the agent's `defaultOptions` carry the one
 * for the ordinary cap.
 */

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
export const LAST_STEP_NOTE = `This is the last step of this message: no more tools can run now. In one or two short sentences say what was done and what is left, if anything. When something is left, end with the continuation line in the language you answer in — «${CONTINUE_LINE.ru}» in Russian, “${CONTINUE_LINE.en}” in English. Do not ask whether to continue and do not promise anything you did not do.`;

type PrepareStepArgs = {
  stepNumber: number;
  systemMessages?: unknown;
  /** One per stream (and per approval leg): the key of «this request's steps». */
  messageList?: unknown;
};

/** The first `stepNumber` each stream showed, by its message list. */
const firstStepOf = new WeakMap<object, number>();

const stepsTakenHere = ({ stepNumber, messageList }: PrepareStepArgs) => {
  if (!messageList || typeof messageList !== 'object') return stepNumber;
  const first = firstStepOf.get(messageList);
  if (first === undefined) {
    firstStepOf.set(messageList, stepNumber);
    return 0;
  }
  return stepNumber - first;
};

/**
 * `prepareStep` for a request of `maxSteps` steps. `notes` are system lines
 * of this request only (the door's reading of a «Нет», correctness review
 * F9): read on every step of it, never stored in the thread.
 */
export const lastStepSpeaks =
  (maxSteps: number, notes: readonly string[] = [], options: { resumed?: boolean } = {}) =>
  (args: PrepareStepArgs) => {
    // A resumed stream finishes the paused step first, and Mastra's cap
    // counts it as one of this stream's steps.
    const taken = stepsTakenHere(args) + (options.resumed ? 1 : 0);
    const last = taken + 1 >= maxSteps;
    if (!last && !notes.length) return undefined;
    const extra = [...notes, ...(last ? [LAST_STEP_NOTE] : [])];
    return {
      ...(last ? { toolChoice: 'none' as const } : {}),
      // Appended to the untagged system messages Mastra passes in, never in
      // their place: without that list nothing is replaced.
      ...(Array.isArray(args.systemMessages)
        ? {
            systemMessages: [
              ...args.systemMessages,
              ...extra.map((content) => ({ role: 'system' as const, content })),
            ],
          }
        : {}),
    };
  };

/**
 * The door's own closing line, for a stream that still ended with no words
 * and no card after its last tool (a provider that ignored
 * `toolChoice: 'none'`, a model that answered the last step with nothing, or
 * one cut off by its length or reasoning budget): the person never gets
 * silence. Not stored in the thread — the next message reads the steps
 * themselves.
 */
export const STEP_CAP_CLOSING = {
  ru: `Сделали шаги выше, но в одно сообщение всё не поместилось. ${CONTINUE_LINE.ru}`,
  en: `We did the steps above, but not everything fitted into one message. ${CONTINUE_LINE.en}`,
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
