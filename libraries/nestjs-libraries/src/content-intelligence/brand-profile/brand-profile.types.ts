import type {
  BrandProfileSelectionV1,
  ResolvedBrandProfileContextV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/contracts';

export type BrandLanguageV1 = 'ru' | 'en';
export type BrandPointOfViewV1 = 'first_person' | 'company_we' | 'third_person';
export type BrandFormalityV1 = 'conversational' | 'neutral' | 'formal';
export type BrandUsagePolicyV1 = 'none' | 'restrained' | 'allowed';

export type BrandTermV1 = {
  term: string;
  guidance?: string;
  replacement?: string;
  reason?: string;
};

export type PlatformVoiceOverrideV1 = {
  provider: string;
  traits?: Array<{ name: string; guidance: string }>;
  pointOfView?: BrandPointOfViewV1;
  formality?: BrandFormalityV1;
  sentenceStyle?: string;
  ctaStyle?: string;
  emojiPolicy?: BrandUsagePolicyV1;
  hashtagPolicy?: BrandUsagePolicyV1;
  preferredAdd?: BrandTermV1[];
  avoidAdd?: BrandTermV1[];
  prohibitedTopicsAdd?: string[];
  prohibitedClaimsAdd?: string[];
  requiredPhrasesAdd?: string[];
  examples?: Array<{
    kind: 'on_brand' | 'off_brand';
    text: string;
  }>;
};

/**
 * Who the model becomes before it writes, as opposed to what it is forbidden.
 *
 * Measured on the owner's corpus on 2026-08-25: the product described his
 * manner in eight scales, the model obeyed — 90% of the scales landed inside
 * their corridors, up from 77% with no voice at all — and the text was no
 * closer to him than text written with no voice whatsoever (0.644 against
 * 0.637). Obedience is not resemblance. A person cannot be assembled out of
 * prohibitions, and a list of them produces a compliant author with no face.
 *
 * The portrait is prose, written by the model from the author's own posts and
 * editable by him afterwards. It is deliberately not measured and has no
 * corridor: a corridor is what the eight scales already are, and they are the
 * part that did not work.
 *
 * `kind` is the whole difference between a person and a brand. Everything else
 * — portrait, examples, print, the likeness check — behaves identically, so
 * they are one mechanism with two values rather than two parallel trees that
 * would need the same defect fixed twice.
 */
export type PersonaKindV1 = 'PERSON' | 'BRAND';

/**
 * Which avatar a space means when it does not say.
 *
 * Until 2026-08-25 the question could not arise: `organizationId` was unique on
 * `ProjectBrandProfile`, so a query for "this space's profile" had at most one
 * row to find. It is not unique any more, and an unordered `findFirst` returns
 * whatever the planner reaches first — stable enough in testing to look correct
 * and not stable at all once a second avatar exists.
 *
 * The default first, then the oldest. The tie-break earns its place: a space
 * whose default flag was somehow lost still resolves to the same avatar on
 * every request rather than to a different one per query plan.
 *
 * It lives in this file, which imports nothing, because both the brand-profile
 * repository and the brief repository need it and the brief must not have to
 * pull Nest in to learn one sort order.
 */
export const DEFAULT_AVATAR_FIRST = [
  { isDefault: 'desc' as const },
  { createdAt: 'asc' as const },
];

export type BrandPersonaV1 = {
  kind: PersonaKindV1;
  /**
   * Prose, in the corpus language, describing a human being: what they do, what
   * they take for granted, what irritates them, how they treat a reader.
   *
   * Empty where the analysis predates the portrait or the author deleted it.
   * Absence is absence — the generator falls back to the older instruction
   * shape rather than inventing a portrait at generation time.
   */
  portrait?: string;
  /**
   * `smp-02#1` — the observations the portrait was written from.
   *
   * A portrait with no refs is a compliment, and the pipeline drops it for the
   * same reason it drops an ungrounded field.
   */
  portraitRefs?: string[];
};

export type BrandProfileContentV1 = {
  /**
   * Optional because every profile analysed before 2026-08-25 has none, and a
   * required field would make those profiles unreadable rather than older.
   */
  persona?: BrandPersonaV1;
  project: {
    name: string;
    oneLineDescription: string;
    mission?: string;
    offerings: string[];
    audiences: Array<{ name: string; need?: string }>;
    positioning?: string;
    contentGoals: string[];
  };
  voice: {
    defaultLanguage: BrandLanguageV1;
    allowedLanguages: BrandLanguageV1[];
    traits: Array<{ name: string; guidance: string }>;
    pointOfView: BrandPointOfViewV1;
    formality: BrandFormalityV1;
    sentenceStyle?: string;
    ctaStyle?: string;
    emojiPolicy: BrandUsagePolicyV1;
    hashtagPolicy: BrandUsagePolicyV1;
    /**
     * How long this author's posts actually are, in characters.
     *
     * Measured, not asked for. The product told every model «Post should be
     * long» regardless of the person it was writing as, and the owner's own
     * posts are 823 characters against generations of 1800–2944. Length is one
     * of the loudest habits a reader notices, and it was the one thing the
     * voice never carried.
     *
     * A soft range, and deliberately not a hard rule: both answers of the
     * research say models cannot count characters — the tokenizer works in
     * sub-words — so the number in the prompt is a direction and the check
     * that follows the draft is where the actual limit lives.
     */
    postLength?: { median: number; low: number; high: number };
    /**
     * Как часто автор приносит собственное измеренное число.
     *
     * Не инструкция и в промпт не идёт. Она нужна после черновика, чтобы
     * решить, предлагать ли человеку добавить свою цифру: у владельца эта
     * привычка стоит на 54% постов, а модель без фактов повторить её не может
     * и правильно не выдумывает. `draft-gaps.ts` объясняет, почему из этого
     * следует предложение, а не предупреждение и не отказ.
     *
     * Знаменатель хранится вместе с долей: «54%» на тридцати постах и на
     * тысяче — разные утверждения, и правило отсекает первое.
     */
    bringsOwnMeasurements?: { share: number; of: number };
    /**
     * The author's habits, said as directions against the norm.
     *
     * «Пишет короткими фразами — намного сильнее, чем у обычного поста» rather
     * than «10,8 слов в предложении»: the same number, positioned, with the
     * raw value kept beside it in `detail` for whoever wants to check.
     *
     * Written at activation from the measurement's deviations, so the version
     * carries the sentences it was activated with — a norm is versioned
     * precisely because changing it changes every number a person has already
     * read, and a version that recomputed its own description on every read
     * would quietly rewrite its own history.
     *
     * Absent where the language has no norm, and on every version activated
     * before 2026-08-25. Absence is absence: the block and the screen state no
     * position rather than «как обычно».
     */
    directions?: Array<{
      /** `NormMetricKey`; kept as a string so this file imports nothing. */
      metric: string;
      band: string;
      text: string;
      detail: string;
    }>;
    /**
     * How this author breaks a paragraph, measured rather than asked for.
     *
     * `post-layout.ts` found the group the eight scales and `postLength` both
     * miss: a live author breaks a paragraph with a soft line return
     * mid-thought and leaves blank lines between short blocks, while a model
     * asked to sound like them writes even blocks instead. Kept beside
     * `postLength` on the same terms — a measured number rather than an
     * adjective — and, like `bringsOwnMeasurements`, not yet sent to the
     * generator as an instruction: whether stating it as a rule moves
     * resemblance is unmeasured, the same open question `directions` above
     * states about itself, and shipping it as a line in the prompt ahead of
     * that measurement would be the taste this epic exists to remove.
     *
     * Absent on every version activated before this field existed.
     */
    postLayout?: {
      /** Soft line breaks per thousand characters. */
      softBreakRate: number;
      /** Blank lines per thousand characters. */
      blockBreakRate: number;
      /** Average block length in characters. */
      meanBlockChars: number;
      /** Share of blocks made of exactly one sentence, in per cent. */
      oneSentenceBlockShare: number;
    };
  };
  lexicon: {
    preferred: BrandTermV1[];
    avoid: BrandTermV1[];
  };
  guardrails: {
    prohibitedTopics: string[];
    prohibitedClaims: string[];
    requiredPhrases: string[];
  };
  examples: Array<{
    kind: 'on_brand' | 'off_brand';
    text: string;
    explanation?: string;
    platform?: string;
  }>;
  platformOverrides: PlatformVoiceOverrideV1[];
};

export type BrandProfileLifecycleV1 = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type BrandProfileRecordV1 = {
  id: string;
  organizationId: string;
  /**
   * What a person calls this avatar; `null` on every row made before names
   * existed and on one created but not yet named.
   *
   * Optional in the type as well as nullable in the column, because the
   * repository reads rows written by code that predates the field.
   */
  name?: string | null;
  kind?: PersonaKindV1;
  isDefault?: boolean;
  activeVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/**
 * What creating an avatar takes: a name, if there is one, and who speaks.
 *
 * `kind` defaults to `PERSON` rather than being required. The product is about
 * writing as a person — a brand avatar is the deliberate exception — and a
 * required enum on the first screen is a question asked before the person has
 * seen what the answer changes.
 */
export type BrandAvatarCreateV1 = {
  name?: string;
  kind?: PersonaKindV1;
};

export type BrandAvatarUpdateV1 = {
  name?: string;
  kind?: PersonaKindV1;
};

/** One avatar, with the version in force for it read in the same query. */
export type BrandAvatarRowV1 = BrandProfileRecordV1 & {
  activeVersion: BrandProfileVersionRecordV1 | null;
};

export type BrandProfileVersionRecordV1 = {
  id: string;
  organizationId: string;
  profileId: string;
  versionNumber: number;
  parentVersionId: string | null;
  schemaVersion: number;
  lifecycle: BrandProfileLifecycleV1;
  label: string | null;
  content: BrandProfileContentV1;
  contentDigest: string;
  revision: number;
  createdByUserId: string;
  updatedByUserId: string;
  publishedByUserId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BrandProfileDraftInputV1 = {
  label?: string;
  content: BrandProfileContentV1;
};

export type BrandProfileDraftUpdateV1 = BrandProfileDraftInputV1 & {
  expectedRevision: number;
};

export type BrandProfileRepositoryErrorCodeV1 =
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'VERSION_IMMUTABLE'
  | 'VERSION_UNAVAILABLE'
  | 'DEPENDENCIES_ACTIVE'
  /** The space already holds as many avatars as it may. */
  | 'AVATAR_LIMIT'
  /** Asked to make an avatar the default before anything analysed it. */
  | 'AVATAR_NOT_ANALYSED'
  /** The default was deleted with another avatar available and none named. */
  | 'SUCCESSOR_REQUIRED';

/**
 * How many avatars one space may hold.
 *
 * Declared beside the rest of the avatar rules rather than imported from the
 * wiring contract: the repository must refuse a ninth whether or not anything
 * screen-shaped is in the process. `tests/brand-voice.avatars.test.cjs` holds
 * the two numbers equal.
 */
export const MAX_AVATARS_PER_SPACE = 8;

export class BrandProfileRepositoryError extends Error {
  constructor(
    readonly code: BrandProfileRepositoryErrorCodeV1,
    readonly details?: Record<string, unknown>
  ) {
    super(code);
    this.name = 'BrandProfileRepositoryError';
  }
}

export type { BrandProfileSelectionV1, ResolvedBrandProfileContextV1 };
