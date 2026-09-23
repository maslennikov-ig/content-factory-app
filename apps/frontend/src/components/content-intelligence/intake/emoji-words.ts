import { intakeCopy, type IntakeLocale } from './intake.copy';
import {
  EMOJI_STOP_CEILING,
  emojiStopOf,
  type EmojiLevel,
  type EmojiStop,
} from '@contentfactory/nestjs-libraries/content-intelligence/channels/emoji-ceiling';

/**
 * Words of the emoji scale (`97dq.61`), kept apart from the slider so a
 * summary line — the channel list, the card's read-only rows — can say «до 3»
 * without pulling a React component in.
 */

/** «нет», «до 3», «без предела» — how a stop reads as a value. */
export function emojiStopWord(locale: IntakeLocale, stop: EmojiStop): string {
  const t = intakeCopy[locale];
  const ceiling = EMOJI_STOP_CEILING[stop];
  if (ceiling === null) return t.profileEmojiStopUnlimited;
  if (ceiling === 0) return t.profileEmojiStopNone;
  return t.profileEmojiUpTo(ceiling);
}

/** The caption under a division: «нет», «1», «3» … «без предела». */
export function emojiDivisionWord(locale: IntakeLocale, stop: EmojiStop): string {
  const ceiling = EMOJI_STOP_CEILING[stop];
  if (ceiling === null) return intakeCopy[locale].profileEmojiStopUnlimited;
  if (ceiling === 0) return intakeCopy[locale].profileEmojiStopNone;
  return String(ceiling);
}

/**
 * How a stored value reads in a summary.
 *
 * The old values keep their old words, because the prompt still gives them
 * the old instruction; the stops read as their exact ceiling.
 */
export function emojiLevelWord(locale: IntakeLocale, level: EmojiLevel): string {
  const t = intakeCopy[locale];
  switch (level) {
    case 'none':
      return t.profileEmojiNone;
    case 'few':
      return t.profileEmojiFew;
    case 'many':
      return t.profileEmojiFree;
    case 'auto':
      return t.profileAuto;
    default:
      return emojiStopWord(locale, emojiStopOf(level));
  }
}
