import { STYLE_SCALE_KEYS, STYLE_SCALE_LABELS } from './brand-voice.types';
import { POST_HABIT_METRIC_KEYS, POST_HABIT_WORDS } from './post-habits';
import { POST_LAYOUT_METRIC_KEYS, POST_LAYOUT_WORDS } from './post-layout';
import { truncateChars } from './text-truncate';
import { statisticsInWords } from './proposal-plain-words';

/**
 * A metric's identifier in a proposal, said in words (W3 live walk
 * 28.09.2026, P3-I).
 *
 * The analysis prompt names every metric by its key beside its words
 * (`dashCopula: 59`, `opensWithQuestion · начинает с вопроса`), and asks each
 * observation to name the metric it explains. The model then wrote the key
 * into a line the person reads: «конструкции со связкой через тире:
 * показатель dashCopula — 59». This is the guarantee after the prompt: every
 * known key in a proposal's text becomes its words, quoted, in the text's own
 * language (Cyrillic → Russian words, else English), from the same
 * dictionaries the screens and the prompt use. Pure and deterministic; text
 * without a key comes back as the same string.
 */

type Locale = 'ru' | 'en';

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const wordsFor = (locale: Locale): ReadonlyMap<string, string> =>
  new Map<string, string>([
    ...STYLE_SCALE_KEYS.map(
      (key) => [key, lower(STYLE_SCALE_LABELS[locale][key].label)] as [string, string]
    ),
    ...POST_HABIT_METRIC_KEYS.map((key) => [key, POST_HABIT_WORDS[locale][key]] as [string, string]),
    ...POST_LAYOUT_METRIC_KEYS.map((key) => [key, POST_LAYOUT_WORDS[locale][key]] as [string, string]),
  ]);

const WORDS: Record<Locale, ReadonlyMap<string, string>> = {
  ru: wordsFor('ru'),
  en: wordsFor('en'),
};

/**
 * Longest first, so no key is read as the start of a longer one. Two keys are
 * plain English words (`questions`, `nominalisation`): in an English text they
 * are just words, so they are read as keys only inside a Cyrillic text.
 */
const patternOf = (keys: readonly string[]) =>
  new RegExp(
    `(?<![A-Za-z0-9_])(${[...keys].sort((a, b) => b.length - a.length).join('|')})(?![A-Za-z0-9_])`,
    'g'
  );
const ALL_KEYS = [...WORDS.en.keys()];
const KEYS_ANYWHERE = patternOf(ALL_KEYS.filter((key) => /[A-Z]/.test(key)));
const KEYS_IN_RUSSIAN = patternOf(ALL_KEYS);

const CYRILLIC = /\p{Script=Cyrillic}/u;
const QUOTE_OPENERS = ['«', '“', '"', '`'];
const QUOTE_CLOSERS = ['»', '”', '"', '`'];

const patternFor = (text: string) => (CYRILLIC.test(text) ? KEYS_IN_RUSSIAN : KEYS_ANYWHERE);

/** Whether a text still carries a metric's identifier. */
export const hasMetricKeys = (text: string | null | undefined): boolean => {
  if (!text) return false;
  const pattern = patternFor(text);
  pattern.lastIndex = 0;
  return pattern.test(text);
};

/** The text with every metric identifier said in words, quoted. */
export const metricKeysInWords = (text: string): string => {
  if (!hasMetricKeys(text)) return text;
  const locale: Locale = CYRILLIC.test(text) ? 'ru' : 'en';
  const [open, close] = locale === 'ru' ? ['«', '»'] : ['“', '”'];
  const pattern = patternFor(text);
  pattern.lastIndex = 0;
  return text.replace(pattern, (key, _key: string, offset: number) => {
    const words = WORDS[locale].get(key) ?? key;
    // A key the model quoted itself keeps its own quotes.
    const quoted =
      QUOTE_OPENERS.includes(text.charAt(offset - 1)) &&
      QUOTE_CLOSERS.includes(text.charAt(offset + key.length));
    return quoted ? words : `${open}${words}${close}`;
  });
};

type ProposalText = {
  fields?: ReadonlyArray<{ text?: string }>;
  portrait?: { text?: string } | null;
  observations?: ReadonlyArray<{ claim?: string }>;
};

/**
 * The stored limits of a proposal's texts (`assist.contract.ts`): a line 600,
 * the portrait 1200, an observation's claim 400. The words are longer than
 * the keys, so what is shown is cut back to them (correctness review F6).
 */
export const PROPOSAL_TEXT_LIMITS = { field: 600, portrait: 1_200, claim: 400 } as const;

/**
 * Keys in words, then the corpus statistics in plain words (W3 recheck R-7,
 * `proposal-plain-words.ts`); a text neither touches is the same string.
 */
const inWords = (text: string | undefined, limit: number) => {
  if (typeof text !== 'string') return text;
  const plain = statisticsInWords(metricKeysInWords(text));
  return plain === text ? text : truncateChars(plain, limit);
};

/**
 * One stored line of a voice in force, said in words where it is read (kcxz
 * W3 final recheck F-4a): a version activated before R-7 still holds
 * «показатель первого лица по корпусу — 96,4%». Display only, like the
 * proposal: the stored version is not rewritten.
 */
export const voiceLineInWords = (text: string): string =>
  inWords(text, PROPOSAL_TEXT_LIMITS.field) ?? text;

/**
 * A proposal with its lines, portrait and observations said in words, within
 * their stored limits. Display only (correctness review F6): the screen, the
 * chat and the voice an activation writes read it through the service; the
 * stored proposal keeps the model's text and is never written back in words.
 */
export const proposalInWords = <T extends ProposalText>(proposal: T): T =>
  ({
    ...proposal,
    ...(proposal.fields
      ? {
          fields: proposal.fields.map((field) => ({
            ...field,
            text: inWords(field.text, PROPOSAL_TEXT_LIMITS.field),
          })),
        }
      : {}),
    ...(proposal.portrait
      ? {
          portrait: {
            ...proposal.portrait,
            text: inWords(proposal.portrait.text, PROPOSAL_TEXT_LIMITS.portrait),
          },
        }
      : {}),
    ...(proposal.observations
      ? {
          observations: proposal.observations.map((one) => ({
            ...one,
            claim: inWords(one.claim, PROPOSAL_TEXT_LIMITS.claim),
          })),
        }
      : {}),
  }) as T;
