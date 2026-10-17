/** Title and body of a period overview are produced by the same draft call. */
import type { ContentLanguage } from '../../dtos/content.language';
import type { CoreWriteSystemOptionsV16 } from './core-write-prompt.v16';
import {
  coreWriteEventLeadV17,
  coreWriteSystemV17,
  type CoreEventUpdateV17,
} from './core-write-prompt.v17';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v18' as const;

export const coreWriteEventLeadV18 = (period: CoreEventUpdateV17): string =>
  `${coreWriteEventLeadV17(period)}\nReturn the new overview’s title and body together. The title must describe this same selected period and its substantive confirmed events; it replaces the previous title.`;

export const coreWriteSystemV18 = (
  language: ContentLanguage,
  forbiddenPhrases: string,
  options: CoreWriteSystemOptionsV16 & { eventUpdate?: CoreEventUpdateV17 } = {}
): string => {
  const system = coreWriteSystemV17(language, forbiddenPhrases, options);
  if (!options.eventUpdate) return system;
  return `${system}\nTITLE. Return a required \`title\` alongside \`text\` in this same answer, in the same output language. Write one plain line of at most 120 characters. Name the selected overview period and the actual substantive events covered by the body, without unsupported claims or old-period headlines. No Markdown, quotes around the title, field names, or meta commentary. Keep the title out of the body; the body retains its existing paragraph format. When repairing the answer, return a matching title and body together.`;
};
