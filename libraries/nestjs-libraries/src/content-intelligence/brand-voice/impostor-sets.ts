import type { BrandVoiceLocale } from './brand-voice.types';
import type { ImpostorSet } from './impostors';
import { RU_IMPOSTORS } from './impostors.ru';
import { EN_IMPOSTORS } from './impostors.en';

/**
 * Which languages the relative decision can be made in.
 *
 * Deliberately the same shape as `LOCALE_PACKS` and for the same reason: a
 * language the product cannot measure says so instead of being measured with
 * somebody else's numbers. Without a set, the verdict falls back to the
 * absolute threshold — which is the rule measured on 2026-08-25 to accept every
 * generated text there was, so the fallback is honest about being worse rather
 * than pretending the language is covered.
 *
 * The cost of a seventeenth language here is one rebuild of
 * `scripts/evidence/build-impostor-prints.cjs` over three documents in that
 * language that the workspace's authors did not write. No word lists, no
 * annotation — the windows are counted straight off the text. That makes this
 * level A by §3.3 of the specification, unlike almost everything else that
 * needs a language.
 */
export const IMPOSTOR_SETS: Partial<Record<BrandVoiceLocale, ImpostorSet>> = {
  ru: RU_IMPOSTORS,
  en: EN_IMPOSTORS,
};

export const impostorsFor = (
  locale: BrandVoiceLocale
): ImpostorSet | null => IMPOSTOR_SETS[locale] ?? null;
