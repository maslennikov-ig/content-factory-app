import { z } from 'zod';
import { STYLE_SCALE_KEYS } from './brand-voice.types';
import { POST_HABIT_METRIC_KEYS } from './post-habits';
import { POST_LAYOUT_METRIC_KEYS } from './post-layout';

/**
 * What the model is allowed to say back.
 *
 * The shape is the guard. An observation has to carry a verbatim quote, the
 * sample it came from and the metric it explains; the design shows the
 * standard — "В 34 из 48 постов автор пишет «мы» и «у нас на участке»" beside a
 * quote and `smp-02` — against which "an engaging and professional tone" is not
 * an observation at all, it is a compliment.
 *
 * Enumerations rather than free text for every categorical field, because a
 * profile is read back by code that has to branch on it. A model answering
 * "fairly informal" for formality produces a profile nothing can apply.
 */

export const PROFILE_FIELDS = [
  'WHO_SPEAKS',
  'TONE',
  'AUDIENCE',
  'SENTENCE_LENGTH',
  'NEVER_SAY',
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const observationSchema = z.object({
  field: z.enum(PROFILE_FIELDS),
  /**
   * The counted number this rests on, or null where it rests on the corpus at
   * large.
   *
   * All three lists, because the post-level habits and the post's layout are
   * numbers too. With only the eight scales here a model handed every set
   * cited one of the eight every time — it was told to name a metric and
   * given eight names.
   */
  metric: z
    .enum([
      ...STYLE_SCALE_KEYS,
      ...POST_HABIT_METRIC_KEYS,
      ...POST_LAYOUT_METRIC_KEYS,
    ])
    .nullable(),
  /** Verbatim, from the sample. Not a paraphrase and not an illustration. */
  quote: z.string().min(8).max(400),
  /** The claim, in one sentence, about what the quote shows. */
  claim: z.string().min(8).max(400),
});

export const mapResultSchema = z.object({
  sampleCode: z.string().min(1).max(32),
  observations: z.array(observationSchema).min(1).max(6),
});

export const proposedFieldSchema = z.object({
  field: z.enum(PROFILE_FIELDS),
  text: z.string().min(2).max(600),
  /** `smp-02#1`. Empty means the field has no grounds and is not proposed. */
  observationRefs: z.array(z.string().min(3).max(64)),
});

/**
 * The portrait: who this person is, in prose, so the model can be them.
 *
 * Bounded at both ends for opposite reasons. Under 200 characters there is no
 * person, only a label — «инженер, пишет коротко» is the eight scales again in
 * worse form. Over 1200 the portrait starts competing with the request itself
 * for the model's attention, which is the drift the whole voice block exists to
 * avoid.
 */
export const portraitSchema = z.object({
  text: z.string().min(200).max(1200),
  observationRefs: z.array(z.string().min(3).max(64)).min(2),
});

export const reduceResultSchema = z.object({
  /**
   * Optional in the schema, mandatory in the prompt.
   *
   * A model that cannot ground a portrait should return none, exactly as with
   * the five fields — and the pipeline treats a missing portrait as a profile
   * without one rather than failing the whole analysis, because four grounded
   * fields and no portrait is still worth more than an error.
   */
  portrait: portraitSchema.nullable().optional(),
  fields: z.array(proposedFieldSchema).min(1).max(PROFILE_FIELDS.length),
  pointOfView: z.enum(['first_person', 'company_we', 'third_person']),
  formality: z.enum(['conversational', 'neutral', 'formal']),
  emojiPolicy: z.enum(['none', 'restrained', 'allowed']),
  hashtagPolicy: z.enum(['none', 'restrained', 'allowed']),
  neverSay: z.array(z.string().min(2).max(120)).max(12),
});

export type MapResult = z.infer<typeof mapResultSchema>;
export type ReduceResult = z.infer<typeof reduceResultSchema>;
export type Observation = z.infer<typeof observationSchema>;

/**
 * An observation is kept only if its quote is really in the sample it names.
 *
 * This is the critic pass, and it is a string comparison rather than a second
 * model call on purpose: the failure it catches — a quote the model composed
 * that reads like the author — is exactly the failure a model is worst at
 * noticing. Whitespace is normalised because the model reflows what it copies;
 * nothing else is.
 */
export const quoteIsGrounded = (quote: string, sampleText: string): boolean => {
  const flat = (value: string) =>
    value.replace(/\s+/gu, ' ').replace(/[«»"“”]/gu, '"').trim().toLowerCase();
  return flat(sampleText).includes(flat(quote));
};

/**
 * The words a model reaches for when it has nothing to say about a person.
 *
 * This is the failure mode of every prose description an LLM writes about
 * writing: «увлекательный, профессиональный тон, живой язык, глубокая
 * экспертиза» describes nobody, fits everybody, and reads as a finished
 * portrait. The contract already refuses an ungrounded *field*; prose cannot be
 * checked against a quote the same way, so it is checked against this list
 * instead.
 *
 * Deliberately stems rather than whole words: «увлекательный» and
 * «увлекательная» are the same nothing.
 */
export const PORTRAIT_CLICHES = [
  'увлекательн',
  'профессиональн',
  'уникальн',
  'качественн',
  'экспертн',
  'динамичн',
  'живой язык',
  'яркий стиль',
  'глубок',
  'вовлекающ',
  'engaging',
  'professional',
  'unique',
  'high-quality',
  'compelling',
  'vibrant',
  'insightful',
  'passionate',
  'thought-provoking',
] as const;

/**
 * One cliché is a word; two are a genre.
 *
 * A real portrait can say «глубокая яма в расписании» without being a
 * compliment, so a single hit is not evidence. Two mean the model stopped
 * describing this author and started describing an author.
 */
export const PORTRAIT_CLICHE_LIMIT = 2;

export const portraitCliches = (text: string): string[] => {
  const flat = text.toLowerCase();
  return PORTRAIT_CLICHES.filter((one) => flat.includes(one));
};

export type AssistFailure =
  | 'SCHEMA_INVALID'
  | 'QUOTE_NOT_GROUNDED'
  | 'UNKNOWN_SAMPLE'
  | 'NO_OBSERVATIONS';
