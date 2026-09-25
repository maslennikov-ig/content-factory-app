/**
 * `content-factory-next-rrs9`: the walkthrough's own vocabulary.
 *
 * The screen it replaces was four paragraphs about the inherited loop —
 * calendar, draft, preview, schedule — which is what any scheduler does. The
 * owner's words on 01.09.2026: «оно очень странно выглядит, как будто бы у нас
 * его и нет». Three separate things made it look absent, and only one of them
 * was the writing:
 *
 *  - the step was called «смотреть обучение» and showed text, because the
 *    upstream product had a video there and the rename took the video out and
 *    left the title;
 *  - it described a loop that says nothing about why this product exists —
 *    the voice, the facts, the evidence a draft has to stand on;
 *  - and it was all reading. Not one of the four steps asked anyone to do
 *    anything.
 *
 * Variant B of the 25.09.2026 canvas, chosen by the owner (2q28.5): five
 * steps in the order of the menu — avatar, channel, piece, adaptation, plan —
 * one on the screen at a time. A step still closes only when the thing
 * exists; «Сделаю позже» moves the person on without ticking anything, which
 * is what keeps the ticks honest. The claim («факт») step became an optional
 * extra: it never blocks the path or the «всё пройдено» state.
 */

export const ONBOARDING_PROGRESS_API = '/onboarding/progress';

export type OnboardingProgress = {
  channels: number;
  voiceSamples: number;
  /** Avatars with an active version, however they were made (fn33.157). */
  avatars: number;
  facts: number;
  /** Chosen facts stored with current CORE pieces, outside `ContentFact`. */
  pieceFacts: number;
  /** Заготовки области: `ContentPiece` c `kind='CORE'`, не в архиве. */
  pieces: number;
  drafts: number;
  scheduled: number;
  /**
   * Адаптации живых заготовок — строки `ContentDerivation` (2q28.6). Since
   * the plan wave an adaptation can exist without a post in the calendar
   * (`postId` is empty until it is planned), so `drafts` alone could leave the
   * adaptation step open for someone who made one.
   */
  adaptations: number;
  /** Connected channels whose plan mode was chosen explicitly (`Integration.planMode`). */
  planModes: number;
  /** The live piece touched last, for the adaptation step's links; `null` when none. */
  latestPieceId: string | null;
  /**
   * Whether the person asking made this workspace (2q28.12). Only a founder
   * is sent to «С чего начать» after sign-in; a missing field reads as not.
   */
  founder: boolean;
};

export const EMPTY_PROGRESS: OnboardingProgress = {
  channels: 0,
  voiceSamples: 0,
  avatars: 0,
  facts: 0,
  pieceFacts: 0,
  pieces: 0,
  drafts: 0,
  scheduled: 0,
  adaptations: 0,
  planModes: 0,
  latestPieceId: null,
  founder: false,
};

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;

/**
 * A missing field reads as zero, never as done. The walkthrough's whole job is
 * telling someone what is left, and a server that answered with less than it
 * promised must not be able to congratulate them.
 */
export function readProgress(body: unknown): OnboardingProgress {
  const record = (body ?? {}) as Record<string, unknown>;
  return {
    channels: count(record.channels),
    voiceSamples: count(record.voiceSamples),
    avatars: count(record.avatars),
    facts: count(record.facts),
    pieceFacts: count(record.pieceFacts),
    pieces: count(record.pieces),
    drafts: count(record.drafts),
    scheduled: count(record.scheduled),
    adaptations: count(record.adaptations),
    planModes: count(record.planModes),
    latestPieceId:
      typeof record.latestPieceId === 'string' && record.latestPieceId
        ? record.latestPieceId
        : null,
    founder: record.founder === true,
  };
}

/**
 * The five steps, in menu order, and — the same list — the stable keys the
 * on-screen tour reads from `?tour=<key>` (stream S3 of 2q28). One constant,
 * so the tour and the walkthrough cannot drift apart on a key name.
 */
export const ONBOARDING_TOUR_STEPS = [
  'avatar',
  'channel',
  'piece',
  'adaptation',
  'plan',
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_TOUR_STEPS)[number];

export const ONBOARDING_STEP_KEYS: readonly OnboardingStepKey[] =
  ONBOARDING_TOUR_STEPS;

/** The query parameter the tour listens to. */
export const ONBOARDING_TOUR_PARAM = 'tour';

/**
 * Where each step is done. The step's own button goes here — into the
 * product, not to the next slide.
 *
 * The tabs are the ones `content-section.tabs.ts` actually has: avatars live
 * on «Аватар», a piece starts on «Заготовки» with «Новая заготовка», and an
 * adaptation is made on the piece page reached from the same list. The plan
 * step goes to the calendar, where a post is put into the schedule; the plan
 * mode of a channel is on the channel card.
 */
export const ONBOARDING_STEP_HREF: Record<OnboardingStepKey, string> = {
  avatar: '/content?tab=avatars',
  channel: '/channels',
  piece: '/content?tab=materials',
  adaptation: '/content?tab=materials',
  plan: '/launches',
};

/** The optional claim step: claims are added where the brief asks for them. */
export const ONBOARDING_FACT_HREF = '/content?tab=brief';

/** A piece's own page — where its adaptations are made and planned. */
export const piecePageHref = (pieceId: string) =>
  `/content/pieces/${encodeURIComponent(pieceId)}`;

/**
 * Where the step's own button goes for this workspace. The adaptation and
 * the plan step depend on the data: an adaptation is made, scheduled and its
 * reservation confirmed on the piece page, so with a piece the button goes
 * straight to the piece touched last; without one, to the step's usual place.
 */
export function stepHref(
  step: OnboardingStepKey,
  progress: OnboardingProgress
): string {
  if ((step === 'adaptation' || step === 'plan') && progress.latestPieceId) {
    return piecePageHref(progress.latestPieceId);
  }
  return ONBOARDING_STEP_HREF[step];
}

/** `target` with `?tour=<key>` added, keeping its query; an old `tour` is replaced. */
export function withTour(target: string, key: OnboardingStepKey): string {
  const hashAt = target.indexOf('#');
  const hash = hashAt >= 0 ? target.slice(hashAt) : '';
  const bare = hashAt >= 0 ? target.slice(0, hashAt) : target;
  const queryAt = bare.indexOf('?');
  const path = queryAt >= 0 ? bare.slice(0, queryAt) : bare;
  const kept = (queryAt >= 0 ? bare.slice(queryAt + 1) : '')
    .split('&')
    .filter((pair) => pair && pair.split('=')[0] !== ONBOARDING_TOUR_PARAM);
  kept.push(`${ONBOARDING_TOUR_PARAM}=${encodeURIComponent(key)}`);
  return `${path}?${kept.join('&')}${hash}`;
}

/**
 * «Показать на экране»: the screen that actually carries the step's tour
 * anchors (contract with stream S3): `/content?tab=avatars&tour=avatar`,
 * `/channels?tour=channel`, `/content?tab=materials&tour=piece`, the latest
 * piece's page with `?tour=adaptation`, `/launches?tour=plan`. Without a
 * piece there is no page to show an adaptation on, so the adaptation step
 * shows the piece list's tour instead.
 */
export function tourHref(
  step: OnboardingStepKey,
  progress: OnboardingProgress = EMPTY_PROGRESS
): string {
  if (step === 'adaptation') {
    return progress.latestPieceId
      ? withTour(piecePageHref(progress.latestPieceId), 'adaptation')
      : withTour(ONBOARDING_STEP_HREF.piece, 'piece');
  }
  return withTour(ONBOARDING_STEP_HREF[step], step);
}

/**
 * What counts as done, read off one answer.
 *
 * `piece` closes on a заготовка, and on a draft or a scheduled post for a
 * workspace that came the older way (owner, 07.09.2026: «Хотя, по идее, я же
 * создал новую заготовку»). `adaptation` closes on an adaptation of a live
 * piece, or on a draft/scheduled post — the only form an adaptation had
 * before the plan wave. `plan` closes when a post is in the schedule or the
 * person chose how a channel plans (Бронь, Автопилот, Без плана): either one
 * is the decision «когда выйдет» made.
 */
export function stepIsDone(
  step: OnboardingStepKey,
  progress: OnboardingProgress
): boolean {
  switch (step) {
    case 'avatar':
      // An avatar in use is the voice set, whichever path built it: the
      // hand-filled one collects no samples at all (fn33.157). Samples alone
      // are not an avatar (2q28.13): one pasted text ticked this step while
      // the avatar screen still said «Аватара пока нет».
      return progress.avatars > 0;
    case 'channel':
      return progress.channels > 0;
    case 'piece':
      return (
        progress.pieces > 0 || progress.drafts > 0 || progress.scheduled > 0
      );
    case 'adaptation':
      return (
        progress.adaptations > 0 ||
        progress.drafts > 0 ||
        progress.scheduled > 0
      );
    case 'plan':
      return progress.scheduled > 0 || progress.planModes > 0;
  }
}

/**
 * The optional claim: a usable claim in memory or one chosen in a piece.
 * Never part of `doneCount` or `allStepsDone`.
 */
export function factIsDone(progress: OnboardingProgress): boolean {
  return progress.facts > 0 || progress.pieceFacts > 0;
}

export function doneCount(progress: OnboardingProgress): number {
  return ONBOARDING_STEP_KEYS.filter((step) => stepIsDone(step, progress))
    .length;
}

/**
 * The step a person lands on: the first one not done. Skipping back to the
 * first gap is what actually unblocks someone who went out of order.
 */
export function currentStep(
  progress: OnboardingProgress
): OnboardingStepKey | null {
  return (
    ONBOARDING_STEP_KEYS.find((step) => !stepIsDone(step, progress)) ?? null
  );
}

/**
 * Where «Дальше» and «Сделаю позже» lead from `step`: the next step in menu
 * order, and after the last one the summary. Moving on never ticks anything.
 */
export function nextStep(step: OnboardingStepKey): OnboardingStepKey | 'done' {
  const index = ONBOARDING_STEP_KEYS.indexOf(step);
  if (index >= 0 && index < ONBOARDING_STEP_KEYS.length - 1) {
    return ONBOARDING_STEP_KEYS[index + 1];
  }
  // The last step finishes. It used to wrap to the first open step, and
  // «Дальше: Аватар» on «Шаг 5 из 5» read as going round in a circle (stand
  // check 25.09.2026, D7). The summary names what is still open, and the
  // strip leads back to it.
  return 'done';
}

export function previousStep(
  step: OnboardingStepKey
): OnboardingStepKey | null {
  const index = ONBOARDING_STEP_KEYS.indexOf(step);
  return index > 0 ? ONBOARDING_STEP_KEYS[index - 1] : null;
}

/** What the strip shows under a finished step, when there is something to show. */
export function stepDetail(
  step: OnboardingStepKey,
  progress: OnboardingProgress,
  words: {
    channels: (n: number) => string;
  }
): string | null {
  switch (step) {
    case 'channel':
      return progress.channels > 0 ? words.channels(progress.channels) : null;
    default:
      return null;
  }
}

/**
 * Пройдены ли все пять шагов (необязательный факт не в счёт).
 *
 * Read by the sidebar, which drops «С чего начать» once there is nothing left
 * to start (owner, 07.09.2026). One function rather than a number retyped
 * where the menu is built: the total is the length of the list above.
 */
export function allStepsDone(progress: OnboardingProgress): boolean {
  return doneCount(progress) === ONBOARDING_STEP_KEYS.length;
}

/** Where «С чего начать» lives. */
export const ONBOARDING_PATH = '/onboarding';

/**
 * Where a signed-in person lands on the root (2q28.12): «С чего начать» for
 * the founder of a workspace whose path is still open, otherwise `null` — the
 * usual landing. A first sign-in after approval used to open an empty
 * calendar, while the auto-approved registration already landed here.
 * Someone invited into a working space is not the one who sets it up.
 */
export function signedInLanding(progress: OnboardingProgress): string | null {
  return progress.founder && !allStepsDone(progress) ? ONBOARDING_PATH : null;
}
