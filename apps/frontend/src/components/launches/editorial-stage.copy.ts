/**
 * The editorial stage's own words, kept next to the enum values instead of
 * behind i18next keys — the same convention `content-section.copy.ts` set for
 * this generation of bilingual screens: two languages, spelled out in one
 * object, not sixteen locale files promising a translation nobody wrote.
 *
 * These four values must stay identical to `EDITORIAL_STAGE_VALUES` in
 * `@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto` (itself kept by
 * hand in sync with the `EditorialStage` enum in `schema.prisma`). Not
 * imported from there directly: that file carries `class-validator`
 * decorators, and importing it pulls a decorated class into every bundle and
 * test harness that loads this copy file, including ones that render this
 * module's components without a decorator-aware transpile step.
 * `tests/editorial-stage.frontend-copy-parity.test.cjs` fails the build the
 * moment the two lists disagree, which is what would otherwise let them
 * drift silently.
 */
export const EDITORIAL_STAGE_VALUES = [
  'PLAN',
  'DRAFT',
  'REVIEW',
  'SCHEDULED',
] as const;
export type EditorialStageValue = (typeof EDITORIAL_STAGE_VALUES)[number];

/**
 * `content-factory-next-pdbe`: the editorial stage `DRAFT` and the post's
 * delivery `state: DRAFT` are two different facts. The enum value has to stay
 * `DRAFT` — it is in the database and the tag carry-over matches on it — but
 * the word a person reads does not.
 *
 * This was first shipped with the label «Черновик»/«Draft» and the prefix
 * alone doing the disambiguating. Opening the calendar in a browser settled
 * it: the card rendered
 *
 *     Stage: Draft
 *     Draft:
 *     Поставщика надо было менять раньше…
 *
 * — the same word twice, one line apart, in two type styles, meaning two
 * different things. The prefix was technically correct and read as a stutter.
 * No test caught it, and none could have: every one of them asserts the label
 * it was given.
 *
 * So the stage is called what the owner called it when he described the
 * ladder — «пишется» / "Writing". The collision is gone at the source rather
 * than papered over, and the prefix stays for the other three, where it keeps
 * a pill like "Scheduled" from being read as a delivery state.
 */
export const editorialStageCopy = {
  ru: {
    stageLabelPrefix: 'Этап',
    fieldLabel: 'Этап',
    filterLabel: 'Этап',
    filterAll: 'Все этапы',
    unset: 'Этап не задан',
    PLAN: 'В плане',
    DRAFT: 'Пишется',
    REVIEW: 'На проверке',
    SCHEDULED: 'Запланирован',
  },
  en: {
    stageLabelPrefix: 'Stage',
    fieldLabel: 'Stage',
    filterLabel: 'Stage',
    filterAll: 'All stages',
    unset: 'No stage',
    PLAN: 'Plan',
    DRAFT: 'Writing',
    REVIEW: 'Review',
    SCHEDULED: 'Scheduled',
  },
} as const;

export type EditorialStageLocale = keyof typeof editorialStageCopy;

/**
 * Two languages, not the interface's full locale list — the same narrowing
 * `manage.modal.tsx` already applies to `voiceLocale`. A language tag that
 * isn't Russian reads as English rather than failing closed.
 */
export const resolveEditorialStageLocale = (
  language: string | undefined | null
): EditorialStageLocale =>
  (language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';

export const editorialStageLabel = (
  locale: EditorialStageLocale,
  stage: EditorialStageValue
): string => editorialStageCopy[locale][stage];

/**
 * The disambiguated form for anywhere the stage sits next to delivery
 * `state` on screen: the calendar card, the list row. The bare label (no
 * prefix) is for the editor's own picker and the filter control, where
 * nothing else on screen claims the same word.
 */
export const editorialStageBadgeLabel = (
  locale: EditorialStageLocale,
  stage: EditorialStageValue
): string =>
  `${editorialStageCopy[locale].stageLabelPrefix}: ${editorialStageCopy[locale][stage]}`;
