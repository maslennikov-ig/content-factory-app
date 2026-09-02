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
 * Direction A of the 02.09.2026 canvas, chosen by the owner: six steps along
 * the product's own loop, each one closing when the thing exists rather than
 * when a person presses «дальше». That last rule is what makes it a
 * walkthrough instead of a slideshow — a step nobody can dismiss without doing
 * the work is a step that has to be honest about what the work is.
 */

export const ONBOARDING_PROGRESS_API = '/onboarding/progress';

export type OnboardingProgress = {
  channels: number;
  voiceSamples: number;
  facts: number;
  drafts: number;
  scheduled: number;
};

export const EMPTY_PROGRESS: OnboardingProgress = {
  channels: 0,
  voiceSamples: 0,
  facts: 0,
  drafts: 0,
  scheduled: 0,
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
    facts: count(record.facts),
    drafts: count(record.drafts),
    scheduled: count(record.scheduled),
  };
}

export type OnboardingStepKey =
  | 'channel'
  | 'voice'
  | 'fact'
  | 'brief'
  | 'preview'
  | 'schedule';

export const ONBOARDING_STEP_KEYS: readonly OnboardingStepKey[] = [
  'channel',
  'voice',
  'fact',
  'brief',
  'preview',
  'schedule',
];

/**
 * Where each step is done. The button on a step goes here — into the product,
 * not to the next slide.
 */
export const ONBOARDING_STEP_HREF: Record<OnboardingStepKey, string> = {
  channel: '/launches',
  voice: '/content?tab=voice',
  fact: '/content?tab=brief',
  brief: '/content?tab=brief',
  preview: '/launches',
  schedule: '/launches',
};

/**
 * What counts as done, read off one answer.
 *
 * `brief` and `preview` share the draft count on purpose: a draft is what a
 * brief produces, and the product has no separate record of «a brief was
 * filled in». Claiming otherwise would need a new column to hold a fact the
 * walkthrough is the only consumer of, and the honest reading is that the two
 * steps close together — you get a draft, you look at it.
 */
export function stepIsDone(
  step: OnboardingStepKey,
  progress: OnboardingProgress
): boolean {
  switch (step) {
    case 'channel':
      return progress.channels > 0;
    case 'voice':
      return progress.voiceSamples > 0;
    case 'fact':
      return progress.facts > 0;
    case 'brief':
    case 'preview':
      return progress.drafts > 0 || progress.scheduled > 0;
    case 'schedule':
      return progress.scheduled > 0;
  }
}

export function doneCount(progress: OnboardingProgress): number {
  return ONBOARDING_STEP_KEYS.filter((step) => stepIsDone(step, progress))
    .length;
}

/**
 * The step a person is on: the first one not done.
 *
 * Not «the one after the last done», because the steps have real dependencies
 * — a brief without a fact is refused by the gate — and skipping back to the
 * first gap is what actually unblocks someone who went out of order.
 */
export function currentStep(
  progress: OnboardingProgress
): OnboardingStepKey | null {
  return (
    ONBOARDING_STEP_KEYS.find((step) => !stepIsDone(step, progress)) ?? null
  );
}

/** What the rail shows under a finished step, when there is something to show. */
export function stepDetail(
  step: OnboardingStepKey,
  progress: OnboardingProgress,
  words: { channels: (n: number) => string; samples: (n: number) => string; facts: (n: number) => string }
): string | null {
  switch (step) {
    case 'channel':
      return progress.channels > 0 ? words.channels(progress.channels) : null;
    case 'voice':
      return progress.voiceSamples > 0
        ? words.samples(progress.voiceSamples)
        : null;
    case 'fact':
      return progress.facts > 0 ? words.facts(progress.facts) : null;
    default:
      return null;
  }
}
