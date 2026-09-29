import { AGENT_CARD_ID_KEY, AGENT_DECIDE_FOR_PERSON_KEY } from './agent-parts.contract';
import { approvalFingerprint } from './approval-fingerprint';

/**
 * A question card as the browser sees it, and which card an answer is for
 * (correctness review W2 F3, F9).
 *
 * One call may stop on more than one card — the autopilot consent, then the
 * adaptation interview. An answer must land on the card it answers: the card
 * the person saw carries its id (`AGENT_CARD_ID_KEY`), the answer sends it
 * back, and the door compares it with the id of the card that waits now,
 * recomputed from the payload Mastra keeps on the server. A stale tab, or a
 * reload that redrew an older card, is refused instead of answering the new
 * card with the old card's words.
 *
 * The same view strips what only the server continues with — the research
 * snapshot key, the signed proposal token, the moment a card was asked, the
 * consent the interview was asked after, the text a proposal of changes is
 * for (`kcxz.32`, N2). They stay in the run's snapshot
 * (what `ctx.suspendPayload` is read from on resume) and never reach the
 * browser, the stored transcript or the model.
 */

/** Keys of a card payload that only the server reads back. */
export const SERVER_ONLY_CARD_KEYS: readonly string[] = [
  'snapshotKey',
  'token',
  'askedAt',
  'afterConsent',
  'target',
  // Flagged spots a check left as they are (`kcxz.38`): said by the agent.
  'notes',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * The fingerprint of the card a call stopped on, from its stored payload. The
 * payload is hashed canonically (keys sorted, `undefined` dropped), so the
 * object `suspend` was given and the one the snapshot kept give the same id.
 */
export const questionCardId = (payload: unknown): string =>
  approvalFingerprint('question-card', payload ?? null).slice(0, 32);

/** What an answer's `cardId` may look like; anything else is not a card id. */
export const QUESTION_CARD_ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * The card as the browser, the transcript and the `pending` list show it:
 * the server-only keys removed, the card's id added.
 */
export const questionCardView = (payload: unknown): unknown => {
  if (!isRecord(payload)) return payload ?? null;
  const shown = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !SERVER_ONLY_CARD_KEYS.includes(key))
  );
  return { ...shown, [AGENT_CARD_ID_KEY]: questionCardId(payload) };
};

/** A media library id: the same shape `media.keep` takes (review W4-25 vision F9). */
const LIBRARY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const onlyKeys = (answer: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(answer).every((key) => allowed.includes(key));

const isStringList = (value: unknown) =>
  Array.isArray(value) && value.every((one) => typeof one === 'string');

/**
 * Whether an answer has the shape of the card it names (review W2 F3): a
 * consent answer never parses as an interview answer, nor rows as a consent.
 * Cards the product names by `kind` are checked here, strictly; a card
 * without a known kind (the avatar consent) is left to its capability's own
 * `resumeSchema`, which Mastra checks before the call runs.
 */
export const answerFitsCard = (payload: unknown, answer: Record<string, unknown>): boolean => {
  if (!isRecord(payload)) return true;
  const decide = answer[AGENT_DECIDE_FOR_PERSON_KEY];
  if (decide !== undefined && typeof decide !== 'boolean') return false;
  switch (payload.kind) {
    case 'selection': {
      const key = typeof payload.answerKey === 'string' ? payload.answerKey : '';
      if (!key || !onlyKeys(answer, [key, AGENT_DECIDE_FOR_PERSON_KEY])) return false;
      return answer[key] === undefined || isStringList(answer[key]);
    }
    case 'interview': {
      if (!onlyKeys(answer, ['answers', 'decideKeys', AGENT_DECIDE_FOR_PERSON_KEY])) return false;
      return (
        (answer.decideKeys === undefined || isStringList(answer.decideKeys)) &&
        (answer.answers === undefined || Array.isArray(answer.answers))
      );
    }
    case 'keep-picture': {
      // The browser's answer after it put the picture into the library (or
      // could not): the person's, no «Решите за меня».
      // The id is a library id, and «kept» names one (review W4-25 vision F9).
      if (!onlyKeys(answer, ['kept', 'mediaId', 'gone'])) return false;
      return (
        typeof answer.kept === 'boolean' &&
        (answer.mediaId === undefined ||
          (typeof answer.mediaId === 'string' && LIBRARY_ID.test(answer.mediaId))) &&
        (answer.kept !== true || answer.mediaId !== undefined) &&
        (answer.gone === undefined || typeof answer.gone === 'boolean')
      );
    }
    case 'consent': {
      const key = typeof payload.answerKey === 'string' ? payload.answerKey : '';
      // No «Решите за меня» on a consent: only the person answers it.
      return !!key && onlyKeys(answer, [key]) && typeof answer[key] === 'boolean';
    }
    default:
      return true;
  }
};
