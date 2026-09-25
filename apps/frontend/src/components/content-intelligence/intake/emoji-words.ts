import { intakeCopy, type IntakeLocale } from './intake.copy';
import {
  readEmojiLevel,
  type EmojiStop,
} from '@contentfactory/nestjs-libraries/content-intelligence/channels/emoji-ceiling';

/**
 * Words of the emoji scale (`97dq.96`), kept apart from the slider so a
 * summary line — the channel list, the card's read-only rows — can say
 * «Средне» without pulling a React component in.
 */

/** «Без эмодзи» · «Мало» · «Средне» · «Много» · «Как можно больше». */
export function emojiStopWord(locale: IntakeLocale, stop: EmojiStop): string {
  const t = intakeCopy[locale];
  switch (stop) {
    case 'none':
      return t.profileEmojiNone;
    case 'few':
      return t.profileEmojiFew;
    case 'medium':
      return t.profileEmojiMedium;
    case 'many':
      return t.profileEmojiMany;
    case 'max':
      return t.profileEmojiMax;
  }
}

/**
 * How a stored value reads in a summary: an old «до N» reads as the density
 * it now means, `auto` as «на выбор».
 */
export function emojiLevelWord(locale: IntakeLocale, level: unknown): string {
  const read = readEmojiLevel(level, 'auto' as const);
  return read === 'auto'
    ? intakeCopy[locale].profileAuto
    : emojiStopWord(locale, read);
}
