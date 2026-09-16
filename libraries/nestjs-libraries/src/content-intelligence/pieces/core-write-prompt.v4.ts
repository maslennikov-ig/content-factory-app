import {
  CORE_WRITE_BLOCK_TITLES_V3,
  CORE_WRITE_REPAIR_V3,
  coreWriteSystemV3,
} from './core-write-prompt.v3';

/** Eighth-walk core prompt. Older prompt modules remain readable by version. */
export const CORE_WRITE_PROMPT_VERSION = 'core-write/v4' as const;

export const coreWriteSystemV4 = (
  language: 'ru' | 'en',
  forbiddenPhrases: string
): string => [
  coreWriteSystemV3(language, forbiddenPhrases),
  language === 'ru'
    ? '11) суть держит позицию человека и не спорит с ней: сомнения, оговорки, ограничения и контраргументы помещай только в поле «возражение» и не добавляй их в суть;'
    : '11) the core holds the person\'s position and does not argue with it: doubts, caveats, limitations and counterarguments belong only in the objection field and must not be added to the core;',
].join('\n');

export const CORE_WRITE_BLOCK_TITLES_V4 = CORE_WRITE_BLOCK_TITLES_V3;
export const CORE_WRITE_REPAIR_V4 = CORE_WRITE_REPAIR_V3;
