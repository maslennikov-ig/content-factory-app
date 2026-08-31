import type { VoiceNorm } from './voice-norm';
import { VOICE_NORM_VERSION } from './voice-norm';

/**
 * The norm for `ru`, built by `scripts/evidence/build-voice-norm.cjs`.
 *
 * Derived statistics only: a median and a robust MAD per metric, over 280
 * posts the product wrote with no voice block at all. This file holds no
 * sentence anybody wrote, and none of the texts it was computed from.
 *
 * The norm is a model, not people. Every sentence the product builds on it says
 * «обычного сгенерированного поста» and never «большинства людей» — see
 * `voice-norm.ts` for why that wording is load-bearing rather than modest.
 *
 * Six post habits are absent on purpose: they are yes/no per post and only
 * become numbers as a share, which is a different statistic with different
 * thresholds. A metric observed in fewer than `MIN_NORM_POSTS` of the
 * reference is absent too, for a different reason — `voice-norm.ts` states
 * both.
 *
 * Rebuild with the script; do not edit by hand.
 */
export const RU_VOICE_NORM: VoiceNorm = {
  version: VOICE_NORM_VERSION,
  locale: 'ru',
  source: 'собственная генерация продукта без голоса, 280 постов, восемь нейтральных тем, openai/gpt-5.6-luna, температура 0,7',
  posts: 280,
  stats: {
    sentenceLength: { median: 14.7, scale: 1.705, observed: 280 },
    sentenceSpread: { median: 36.35, scale: 6.672, observed: 280 },
    shortSentences: { median: 8.5, scale: 5.93, observed: 280 },
    listParagraphs: { median: 0, scale: 0, observed: 280 },
    questions: { median: 4.3, scale: 5.041, observed: 280 },
    dashCopula: { median: 50, scale: 24.759, observed: 278 },
    firstPerson: { median: 100, scale: 0, observed: 29 },
    nominalisation: { median: 23.4, scale: 8.896, observed: 280 },
    postLength: { median: 1999, scale: 381.77, observed: 280 },
    softBreakRate: { median: 0.52, scale: 0.235, observed: 280 },
    blockBreakRate: { median: 8.15, scale: 2.176, observed: 280 },
    meanBlockChars: { median: 113.304, scale: 26.736, observed: 280 },
    oneSentenceBlockShare: { median: 93.75, scale: 3.089, observed: 280 },
    emojiRate: { median: 0, scale: 0, observed: 280 },
    digitShare: { median: 0, scale: 0, observed: 280 },
  },
};
