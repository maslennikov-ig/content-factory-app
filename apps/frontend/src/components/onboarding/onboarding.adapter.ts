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
  /** Заготовки области: `ContentPiece` c `kind='CORE'`, не в архиве. */
  pieces: number;
  drafts: number;
  scheduled: number;
};

export const EMPTY_PROGRESS: OnboardingProgress = {
  channels: 0,
  voiceSamples: 0,
  facts: 0,
  pieces: 0,
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
    pieces: count(record.pieces),
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
/**
 * The five tabs the section actually has are `content-section.tabs.ts`;
 * `?tab=voice` was not one of them and never had been, so the button of the
 * voice step opened the section on whatever tab came first
 * (`content-factory-next-fn33.107`). Samples of a person's writing are added
 * on «Аватары», and a claim is added where the brief asks for it.
 */
export const ONBOARDING_STEP_HREF: Record<OnboardingStepKey, string> = {
  channel: '/channels',
  voice: '/content?tab=avatars',
  fact: '/content?tab=brief',
  // «Заготовки», ключ которых остался `materials`
  // (`content-section.tabs.ts`). The step used to send people to the brief
  // tab, which was the only way to a draft before the «заготовка и адаптации»
  // wave; «Новая заготовка» is where that work starts now.
  brief: '/content?tab=materials',
  preview: '/content?tab=materials',
  schedule: '/launches',
};

/**
 * What counts as done, read off one answer.
 *
 * `brief` closes on a заготовка as well as on a draft. Owner, 07.09.2026:
 * «У меня все пройдено, кроме пункта… Хотя, по идее, я же создал новую
 * заготовку». He was right — the step asks for a filled brief, and since the
 * «заготовка и адаптации» wave a `CORE` piece carries one inside it. Reading
 * only the draft count left the step open for someone who had done exactly
 * what it asked.
 *
 * `preview` still reads the drafts alone, and the two steps no longer close
 * together: a заготовка is the brief done, a draft is the thing there is to
 * look at, and only the second one can honestly tick «посмотрите, как это
 * выйдет в канале».
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
      return (
        progress.pieces > 0 || progress.drafts > 0 || progress.scheduled > 0
      );
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

/**
 * Пройдены ли все шесть шагов.
 *
 * Read by the sidebar, which drops «С чего начать» once there is nothing left
 * to start (owner, 07.09.2026: «раздел «С чего начать» должен быть просто
 * отдельным пунктом меню вынесен»). One function rather than a second
 * `doneCount(...) === 6` written where the menu is built: the total is the
 * length of the list above, and two places counting it apart is how a menu row
 * outlives its reason.
 */
export function allStepsDone(progress: OnboardingProgress): boolean {
  return doneCount(progress) === ONBOARDING_STEP_KEYS.length;
}
