/**
 * The five first steps of a workspace and what closes each one — one
 * definition for every reader (`content-factory-next-kcxz.21`).
 *
 * «С чего начать» (`onboarding.adapter.ts`, which re-exports all of this), the
 * sidebar row, the agent chat's starters and the agent's own workspace
 * snapshot (`overview.capabilities.ts`) read the same list and the same rules.
 * It lives beside `OnboardingRepository`, which counts the rows these rules
 * read, because the server needs it too and the server does not import from
 * the frontend. Pure: no Nest, no Prisma, safe for the edge proxy; its one
 * import, the role table, is pure as well.
 *
 * Variant B of the 25.09.2026 canvas, chosen by the owner (2q28.5): five
 * steps in the order of the menu — avatar, channel, piece, adaptation, plan.
 * A step closes only when the thing exists; the claim («факт») step is an
 * optional extra that never blocks the path.
 */

import {
  isOrganizationAdmin,
  isOrganizationEditor,
} from '@contentfactory/nestjs-libraries/user/organization.roles';

/**
 * The five steps, in menu order, and — the same list — the stable keys the
 * on-screen tour reads from `?tour=<key>` (stream S3 of 2q28). One constant,
 * so the tour, the walkthrough and the chat cannot drift apart on a key name.
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

export const isOnboardingStepKey = (value: unknown): value is OnboardingStepKey =>
  typeof value === 'string' &&
  (ONBOARDING_STEP_KEYS as readonly string[]).includes(value);

/**
 * The counts the rules read — the numbers of `GET /onboarding/progress`
 * (`OnboardingRepository.progress`), each one rows of the workspace.
 */
export type OnboardingStepCounts = {
  channels: number;
  /** Avatars with an active version, however they were made (fn33.157). */
  avatars: number;
  facts: number;
  /** Chosen facts stored with current CORE pieces, outside `ContentFact`. */
  pieceFacts: number;
  /** Заготовки области: `ContentPiece` c `kind='CORE'`, не в архиве. */
  pieces: number;
  drafts: number;
  scheduled: number;
  /** Адаптации живых заготовок — строки `ContentDerivation` (2q28.6). */
  adaptations: number;
  /** Connected channels whose plan mode was chosen explicitly (`Integration.planMode`). */
  planModes: number;
};

/**
 * What counts as done, read off one answer.
 *
 * `piece` closes on a заготовка, and on a draft or a scheduled post for a
 * workspace that came the older way (owner, 07.09.2026: «Хотя, по идее, я же
 * создал новую заготовку»). `adaptation` closes on an adaptation of a live
 * piece, or on a draft/scheduled post — the only form an adaptation had
 * before the plan wave. `plan` closes when a post is in the schedule or the
 * person chose how a channel plans (Бронь, Автопилот, Без плана): either one
 * is the decision «когда выйдет» made. A reserve is a draft post with a time,
 * so on its own it does not close `plan`; the chat chooses the channel's plan
 * mode on the way, as the channel card does (spec §5.6).
 */
export function stepIsDone(
  step: OnboardingStepKey,
  progress: OnboardingStepCounts
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
export function factIsDone(progress: OnboardingStepCounts): boolean {
  return progress.facts > 0 || progress.pieceFacts > 0;
}

export function doneCount(progress: OnboardingStepCounts): number {
  return ONBOARDING_STEP_KEYS.filter((step) => stepIsDone(step, progress))
    .length;
}

/**
 * The step a person lands on: the first one not done. Skipping back to the
 * first gap is what actually unblocks someone who went out of order.
 */
export function currentStep(
  progress: OnboardingStepCounts
): OnboardingStepKey | null {
  return (
    ONBOARDING_STEP_KEYS.find((step) => !stepIsDone(step, progress)) ?? null
  );
}

/**
 * Пройдены ли все пять шагов (необязательный факт не в счёт).
 *
 * Read by the sidebar, which drops «С чего начать» once there is nothing left
 * to start (owner, 07.09.2026). One function rather than a number retyped
 * where the menu is built: the total is the length of the list above.
 */
export function allStepsDone(progress: OnboardingStepCounts): boolean {
  return doneCount(progress) === ONBOARDING_STEP_KEYS.length;
}

/**
 * Who can run a step (`kcxz.31`, D14; moved here for the server by review
 * W3-21 P3-2): connecting a channel is `Sections.ADMIN`
 * (`integrations.controller.ts`); an avatar, a piece, an adaptation and a
 * reserve are `Sections.EDITOR`. The same role functions the doors use.
 */
export const stepAllowed = (
  step: OnboardingStepKey,
  role: string | null | undefined
): boolean =>
  step === 'channel' ? isOrganizationAdmin(role) : isOrganizationEditor(role);

/** Steps that do nothing without a connected channel (review W3-21 P3-3). */
const NEEDS_CHANNEL: readonly OnboardingStepKey[] = ['adaptation', 'plan'];

/**
 * A step a person is offered now: still open, their role can run it, and not
 * blocked by a missing channel — an adaptation or a reserve with no channel
 * is a dead end, for an administrator too (the channel step comes first) —
 * nor, for an adaptation, by a missing piece: there is nothing to adapt yet,
 * and the piece step comes first (W3 live walk 28.09.2026, P3-L).
 *
 * This is what is *offered* — the chat's starters, «Сделать в чате» under a
 * step and the snapshot's `next` — never whether a step is done: the order
 * and the done-rules above are the screens' and stay as they are.
 */
export function stepOffered(
  step: OnboardingStepKey,
  progress: OnboardingStepCounts,
  role: string | null | undefined
): boolean {
  if (stepIsDone(step, progress) || !stepAllowed(step, role)) return false;
  if (step === 'adaptation' && !stepIsDone('piece', progress)) return false;
  return !(NEEDS_CHANNEL.includes(step) && progress.channels === 0);
}

/**
 * The step to suggest to this person: the first one offered, in menu order.
 * `null` when none is — all done, or the rest wait for someone else.
 */
export function nextStepFor(
  progress: OnboardingStepCounts,
  role: string | null | undefined
): OnboardingStepKey | null {
  return (
    ONBOARDING_STEP_KEYS.find((step) => stepOffered(step, progress, role)) ??
    null
  );
}

/**
 * No channel yet and this role cannot connect one: an administrator must.
 * The chat says so instead of offering «Подключим Telegram».
 */
export function channelWaitsForAdmin(
  progress: OnboardingStepCounts,
  role: string | null | undefined
): boolean {
  return !stepIsDone('channel', progress) && !stepAllowed('channel', role);
}
