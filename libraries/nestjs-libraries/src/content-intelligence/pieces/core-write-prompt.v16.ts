/**
 * Core prompt where «Решите за меня» never stands in for the author's own
 * experience (`content-factory-next-wffi`, W2 recheck 27.09.2026, N3).
 * Older prompt modules stay importable and untouched: a released receipt must
 * still name the exact contract its core was written by.
 *
 * What went wrong under v15. Two questions about the person's own experience
 * (which episode, over what period) were handed to the model under the
 * default `knowledge` policy. v15 told the model to «answer it in general
 * terms — how this usually goes and why», and the core got hedged filler in
 * the person's first-person post: «например, команда довела до выпуска
 * функцию…» and a paragraph on how periods should be compared. The owner's
 * rule: decide for the person, but never invent the person's own experience.
 *
 * What changes.
 *
 * - Under `knowledge` a question about the author's own material is no
 *   longer handed to the model at all (`handedQuestionsOf` in `core-write.ts`
 *   drops it deterministically). It rides as a GAP: a block that names what
 *   the person did not tell, so the core is written around it.
 * - The `knowledge` rule keeps answering handed questions with knowledge, but
 *   a general example may not be a scene that reads as the author's case.
 * - `examples` (the avatar's explicit opt-in) is unchanged: there the author
 *   has allowed an illustrative example in their voice.
 *
 * Everything else is v15 unchanged.
 */

import type { ContentLanguage } from '../../dtos/content.language';
import {
  DEFAULT_DELEGATED_POLICY,
  type DelegatedPolicyV1,
} from '../brand-profile/delegated-policy';
import { CORE_WRITE_INSTRUCTION_V10 } from './core-write-prompt.v10';
import {
  CORE_WRITE_ENRICH_V9,
  CORE_WRITE_FIRST_RESEARCH_V9,
  CORE_WRITE_FOREIGN_V9,
  CORE_WRITE_UNCONFIRMED_V9,
} from './core-write-prompt.v9';
import { CORE_WRITE_CAVEATS_V12 } from './core-write-prompt.v12';
import { coreWriteOutputLanguageV14 } from './core-write-prompt.v14';
import {
  BASE_V15,
  CORE_WRITE_BLOCK_TITLES_V15,
  CORE_WRITE_DELEGATED_V15,
  CORE_WRITE_ENRICH_LEAD_V15,
  CORE_WRITE_FINISHED_TEXT_V15,
  CORE_WRITE_HANDED_V15,
  CORE_WRITE_META_REPAIR_V15,
  CORE_WRITE_REBUILD_V15,
  CORE_WRITE_REPAIR_V15,
  type CoreWriteSystemOptionsV15,
} from './core-write-prompt.v15';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v16' as const;

export const CORE_WRITE_BLOCK_TITLES_V16 = {
  ...CORE_WRITE_BLOCK_TITLES_V15,
  gaps:
    'THE AUTHOR’S MATERIAL THAT IS MISSING (the person handed these questions over, but only they know the answer; nothing here is to be answered or filled)',
} as const;

/**
 * The `knowledge` rule: v15's, with the general example narrowed and the
 * author's material taken out of it — that material is a gap now.
 */
export const CORE_WRITE_HANDED_V16: Record<DelegatedPolicyV1, string> = {
  knowledge:
    'The rule about handed questions («You decide»), stronger than any rule above about them. Handing a question over does not mean «write nothing about it»: the person expects you to answer it with content from your own knowledge, the way a knowledgeable co-author would. Answer each handed question in the core with substance: why it works, advice, techniques and widely known facts. Write that knowledge as the author’s own reasoning or advice inside their first-person post — never as their lived experience. A general example is allowed only as a pattern stated outright («teams often…»), never as a concrete scene that a reader of this first-person post would take for the author’s own case: no «for example, the team shipped…», «say, over a quarter…», «imagine a release where…». Still forbidden: a personal first-person episode the person did not give («last month we…» as something that happened), exact numbers, quotes, and named sources or studies that are not in the input.',
  examples: CORE_WRITE_HANDED_V15.examples,
};

/**
 * What the core does with the author's material that was handed over but
 * cannot be decided for them. Rides only when the gaps block is there.
 */
export const CORE_WRITE_GAPS_V16 =
  'The rule about the author’s missing material, stronger than any rule above including the rule about handed questions. The block «the author’s material that is missing» lists questions about what only the person knows — their own episode, period, numbers, result. The person did not tell it, and it is never decided for them: return no entry in `decisions` for it and write nothing in its place. Write the core around the gap from the person’s own words only: where a claim needs that material, drop the claim or keep the thought as general as the person said it. Forbidden in its place: an invented or hypothetical episode («for example, the team…», «say, a feature that…»), a period, a number or a result the person did not give, and a paragraph on how such things usually go, are chosen, compared or measured. Never mention that something is missing.';

export type CoreWriteSystemOptionsV16 = CoreWriteSystemOptionsV15 & {
  /** There is a «the author’s material that is missing» block. */
  gaps?: boolean;
};

export const coreWriteSystemV16 = (
  language: ContentLanguage,
  forbiddenPhrases: string,
  options: CoreWriteSystemOptionsV16 = {}
): string =>
  [
    BASE_V15(forbiddenPhrases),
    options.enrichment ? CORE_WRITE_ENRICH_V9.en : '',
    !options.enrichment && options.firstWithResearch
      ? CORE_WRITE_FIRST_RESEARCH_V9.en
      : '',
    options.unconfirmed ? CORE_WRITE_UNCONFIRMED_V9.en : '',
    options.foreign ? CORE_WRITE_FOREIGN_V9.en : '',
    options.instruction ? CORE_WRITE_INSTRUCTION_V10.en : '',
    options.delegated ? CORE_WRITE_DELEGATED_V15 : '',
    options.delegated || options.handed
      ? CORE_WRITE_HANDED_V16[options.policy ?? DEFAULT_DELEGATED_POLICY]
      : '',
    options.gaps ? CORE_WRITE_GAPS_V16 : '',
    CORE_WRITE_CAVEATS_V12.en,
    options.rebuild ? CORE_WRITE_REBUILD_V15 : '',
    CORE_WRITE_FINISHED_TEXT_V15,
    coreWriteOutputLanguageV14(language),
  ]
    .filter(Boolean)
    .join('\n');

export const CORE_WRITE_ENRICH_LEAD_V16 = CORE_WRITE_ENRICH_LEAD_V15;
export const CORE_WRITE_REPAIR_V16 = CORE_WRITE_REPAIR_V15;
export const CORE_WRITE_META_REPAIR_V16 = CORE_WRITE_META_REPAIR_V15;
