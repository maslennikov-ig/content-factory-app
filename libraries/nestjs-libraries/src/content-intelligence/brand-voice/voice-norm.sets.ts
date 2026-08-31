import type { BrandVoiceLocale } from './brand-voice.types';
import type { VoiceNorm } from './voice-norm';
import { RU_VOICE_NORM } from './voice-norm.ru';

/**
 * Which languages an author can be described relative to.
 *
 * Deliberately the same shape as `LOCALE_PACKS` and `IMPOSTOR_SETS`, and for
 * the same reason: a language the product cannot compare against says so
 * instead of being compared against somebody else's numbers. Without a norm
 * every measurement keeps its raw value and states no position — the screens
 * already draw that case, because it is the same case as a language with no
 * word list.
 *
 * The cost of a second language is one run of the stand's `generate` with no
 * voice in that language, and `scripts/evidence/build-voice-norm.cjs` over it.
 * That is a paid run, which is why `en` is not here yet: the norm would
 * otherwise be built from Russian generation and describe the register rather
 * than the author, which is precisely what the research forbids.
 */
export const VOICE_NORMS: Partial<Record<BrandVoiceLocale, VoiceNorm>> = {
  ru: RU_VOICE_NORM,
};

export const normFor = (locale: BrandVoiceLocale): VoiceNorm | null =>
  VOICE_NORMS[locale] ?? null;
