import {
  buildCharacterNgramProfile,
  characterNgramDistance,
  type CharacterNgramProfile,
} from './character-ngrams';
import {
  buildFunctionWordProfile,
  functionWordDistance,
  functionWordOutliers,
  type FunctionWordProfile,
} from './function-words';
import type { LocalePack } from './locale-pack';
import { impostorVote, type ImpostorSet } from './impostors';
import { verdictFor, type VoiceCalibration } from './voice-calibration';

/**
 * One question the eight scales do not answer: is this the same person?
 *
 * The scales say what a habit is — how long the phrases run, how often a dash
 * stands in for a copula — and on a real channel on 2026-08-24 they turned out
 * not to say whose the text is. That is not a defect in them; it is the
 * question they were built for. This file is the ruler beside them, and the
 * two are kept apart deliberately: the print answers "похоже ли", the scales
 * answer "чем именно", and a screen needs both.
 *
 * It is a warning and never a gate. The owner decided that on 2026-08-24, and
 * the reason is in the epic: a product does not get to refuse a person their
 * own text. So nothing here returns a boolean anybody is allowed to branch an
 * activation, a save or a publication on.
 *
 * Two measures, both from the research's four-star list, doing different jobs.
 * Character n-grams decide, because they are the ones that separate at the
 * length a post actually is. Service words explain, because "you used `при`
 * four times and you normally use it once" is something a person can act on
 * and "your cosine is 0.81" is not.
 */

export const VOICE_PRINT_VERSION = 'voice-print/1.0.0';

export type VoicePrint = {
  version: string;
  localePackVersion: string;
  /** Absent when the corpus was too small or too short to build one. */
  ngrams: CharacterNgramProfile | null;
  functionWords: FunctionWordProfile | null;
};

export type VoiceSimilarityTerm = {
  term: string;
  /** Per thousand words, in this text and in the author's own writing. */
  rate: number;
  expected: number;
  z: number;
};

export type VoiceSimilarity = {
  /**
   * `CLOSE` and `FAR` are readings, not permissions. `UNKNOWN` is the honest
   * answer when the text is too short or the voice has no print, and it is
   * kept distinct from `CLOSE` on purpose: "cannot tell" and "looks like you"
   * are different statements and merging them would be a lie in the safe
   * direction.
   */
  verdict: 'CLOSE' | 'FAR' | 'UNKNOWN';
  /**
   * Почему ответа нет.
   *
   * `TOO_SHORT` и `NO_PROFILE` — нечего мерить. `CANNOT_TELL` и `UNCALIBRATED`
   * добавлены 27.08.2026 и отличаются друг от друга ровно тем, чего человеку
   * не хватает: в первом случае мерка есть и текст лёг в её слепую полосу, во
   * втором мерки для этого автора ещё не сняли. Первое лечится другим текстом,
   * второе — работой продукта, и предлагать надо разное.
   */
  reason?: 'TOO_SHORT' | 'NO_PROFILE' | 'CANNOT_TELL' | 'UNCALIBRATED';
  distance: number | null;
  threshold: number | null;
  /** The author's own middle, so a screen can show the distance in context. */
  selfMedian: number | null;
  /** The service words this text used at a rate its author does not. */
  divergingTerms: VoiceSimilarityTerm[];
  /** The service-word distance, reported beside the deciding one. */
  functionWordDistance: number | null;
  functionWordThreshold: number | null;
  /**
   * The relative decision, when impostors exist for this language.
   *
   * Measured on 2026-08-25: the absolute threshold called **all one hundred and
   * twenty** generated texts the author's, at every crop from 600 to 1200
   * characters, while the same n-grams asked relatively separate the author
   * from generated text at an AUC of 0.90–0.93. So the vote decides where it
   * can, and the distance stays beside it because a person reading a screen
   * still wants a number they can watch move.
   */
  votes: number | null;
  voteFloor: number | null;
  /**
   * Which rule produced `verdict`, so a saved reading can be explained later.
   *
   * `RELATIVE` was the vote against the constant two thirds and is retired:
   * nothing returns it any more. The name stays in the union because saved
   * readings carry it, and a screen reading an old row must not fall through
   * to a case that does not exist.
   */
  decidedBy: 'CALIBRATED' | 'RELATIVE' | 'THRESHOLD' | 'NONE';
};

export function buildVoicePrint(
  samples: readonly { text: string }[],
  pack: LocalePack
): VoicePrint {
  return {
    version: VOICE_PRINT_VERSION,
    localePackVersion: pack.version,
    ngrams: buildCharacterNgramProfile(samples),
    functionWords: buildFunctionWordProfile(samples, pack),
  };
}

/**
 * How close one text sits to the author who owns this print.
 *
 * The n-gram distance decides. The service-word distance rides along because
 * it is the half a person can read, and the diverging terms because they are
 * the half a person can act on — the pointwise repair needs somewhere to
 * point, and "this sentence carries three of the words you never use" is
 * somewhere.
 */
export function measureSimilarity(
  text: string,
  print: VoicePrint | null | undefined,
  pack: LocalePack,
  impostors?: ImpostorSet | null,
  calibration?: VoiceCalibration | null
): VoiceSimilarity {
  const empty: VoiceSimilarity = {
    verdict: 'UNKNOWN',
    reason: 'NO_PROFILE',
    distance: null,
    threshold: null,
    selfMedian: null,
    divergingTerms: [],
    functionWordDistance: null,
    functionWordThreshold: null,
    votes: null,
    voteFloor: null,
    decidedBy: 'NONE',
  };
  if (!print?.ngrams) return empty;

  const ngram = characterNgramDistance(text, print.ngrams);
  const words = functionWordDistance(text, print.functionWords, pack);
  const terms = functionWordOutliers(text, print.functionWords, pack);
  const vote = impostorVote(text, print.ngrams, impostors);

  const common = {
    selfMedian: print.ngrams.selfMedian,
    threshold: print.ngrams.threshold,
    divergingTerms: terms,
    functionWordDistance: words.measured ? words.distance : null,
    functionWordThreshold: print.functionWords?.threshold ?? null,
    votes: vote.votes,
    voteFloor: vote.votes === null ? null : vote.floor,
  };

  if (!ngram.measured) {
    return {
      ...empty,
      ...common,
      reason: ngram.reason,
      verdict: 'UNKNOWN',
      decidedBy: 'NONE',
    };
  }

  /**
   * The calibrated point decides where this author has one.
   *
   * Three answers and not two: between the two thresholds sits the band where
   * the ruler cannot tell, and `CANNOT_TELL` is returned instead of guessing.
   * Measured on three corpora on 2026-08-27, that band holds a quarter to a
   * third of the author's own held-out posts — a short post carries the number
   * of habits it carries, and a confident answer over it would be a coin.
   */
  const calibrated = verdictFor(vote.votes, calibration);
  if (calibrated) {
    return {
      ...common,
      verdict: calibrated === 'CANNOT_TELL' ? 'UNKNOWN' : calibrated,
      ...(calibrated === 'CANNOT_TELL' ? { reason: 'CANNOT_TELL' } : {}),
      distance: ngram.distance,
      decidedBy: 'CALIBRATED',
    };
  }

  /**
   * No calibration for this author yet, and the vote alone is not a verdict.
   *
   * The constant that used to stand here — two thirds of the votes — was taken
   * on one author in one language, and on the lineup of 2026-08-27 it rejects
   * 71%, 58% and 41% of the three authors' own held-out posts. A reading that
   * calls a person's own writing somebody else's most of the time is worse than
   * no reading, so the vote is reported and the verdict withheld.
   */
  if (vote.votes !== null) {
    return {
      ...common,
      verdict: 'UNKNOWN',
      reason: 'UNCALIBRATED',
      distance: ngram.distance,
      decidedBy: 'NONE',
    };
  }

  return {
    ...common,
    verdict: ngram.distance <= print.ngrams.threshold ? 'CLOSE' : 'FAR',
    distance: ngram.distance,
    decidedBy: 'THRESHOLD',
  };
}
