/**
 * Core prompt where «Решите за меня» is answered from the model's own
 * knowledge (`content-factory-next-97dq.99`, owner decision of 25.09.2026).
 * Older prompt modules stay importable and untouched: a released receipt must
 * still name the exact contract its core was written by.
 *
 * What changes. From v11 (`97dq.56`) a handed question got a decision — an
 * angle, a reader, a structure — and «a decision is not a fact» kept the
 * model from adding anything the person had not said. The owner: «если
 * человек нажимает „реши сам“… Он должен дописывать тогда свои мысли, идеи из
 * своей головы, брать их из своих знаний. Потому что если человек пишет „реши
 * сам“, это не значит, что ничего писать не нужно.» So a handed question is
 * now answered with content, under a policy the author sets on the avatar
 * (`voice.delegatedPolicy`, `brand-profile/delegated-policy.ts`):
 *
 * - `knowledge` (default): explanations, advice, techniques, widely known
 *   facts, examples in a general form — written as the author's reasoning or
 *   advice, never as their lived experience. No invented first-person episode,
 *   exact numbers, quotes or named sources. A question about the author's own
 *   material is answered in general terms; their case is not invented.
 * - `examples` (opt-in): the same, plus a plausible illustrative example in
 *   the author's voice, first person included. Still no numbers presented as
 *   measured results, quotes or named sources.
 *
 * Why the base is written whole. Three rules of v11–v13 say the opposite of
 * the new one in so many words (the decisions bullet and rule 2 of the base,
 * the last sentence of the rebuild and of the finished-text rule), and a rule
 * that contradicts a later «stronger» one is still read. v15 restates those
 * four in English and imports everything else unchanged: the modes of v9–v10
 * (research, enrichment, unconfirmed, source material, instruction), the
 * caveats rule of v12, the finished-text rule's first three points of v13 by
 * meaning, and the output-language line of v14.
 */

import {
  contentLanguageNames,
  type ContentLanguage,
} from '../../dtos/content.language';
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
import {
  CORE_WRITE_BLOCK_TITLES_V14,
  CORE_WRITE_ENRICH_LEAD_V14,
  CORE_WRITE_META_REPAIR_V14,
  CORE_WRITE_REPAIR_V14,
  coreWriteOutputLanguageV14,
} from './core-write-prompt.v14';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v15' as const;

/**
 * Block titles of v14, with the three that described a decision as «not
 * content» restated. The question about the author's material no longer says
 * «a framing only»: what it may carry is the policy's to say, not the title's.
 */
export const CORE_WRITE_BLOCK_TITLES_V15 = {
  ...CORE_WRITE_BLOCK_TITLES_V14,
  decisions:
    'THE MODEL’S DECISIONS (the person handed these questions to the model; what the model decided and wrote in answer, not the person’s words)',
  delegated:
    'QUESTIONS HANDED TO THE MODEL (answer them yourself; the decision goes into decisions under the same key)',
  authorMaterial: 'about the author’s material: only the person knows it',
} as const;

/** The base: what the core is, what it is written from, how. Always rides. */
const BASE_V15 = (forbiddenPhrases: string): string =>
  [
    'You are writing the CORE: a neutral, connected text about what this person wants to tell, with no platform and no manner. It is not a post and not a retelling of the brief — it is the ground that texts for different platforms will later be made from, so it must carry everything the person said, developed into connected text. It will be read as finished text, not as a draft or a transcript.',
    '',
    'WHAT TO WRITE FROM. The material arrives in blocks, and each block carries its own trust.',
    '— «The person’s words» and «answers to the questions» are the main material. Often it is dictation or a quick note: typos, fillers, repetitions and the word order of speech. Carried over verbatim: the person’s numbers, names, dates, examples and distinctive expressions («a convenient loophole», «a lift for the brand»), their short sentences and blunt judgements — that is the voice, do not smooth it. Corrected: typos and spelling; the fillers of dictated speech («I mean», «maybe», «some kind of», «here it is important, of course», «already», «in general»); a thought said in two consecutive turns of phrase is written once; the word order of a dictated sentence is straightened. Unchanged: the meaning, the judgements and the position, and the person’s words stay their words rather than better synonyms — correcting spelling and syntax is allowed, arguing with the person, softening them or finishing their thoughts for them is not. Never paste an answer as a block and never rewrite it sentence by sentence: take its thoughts and place them where they serve the claim. Write a selected answer option in the author’s first person. Example: before «Here it is important, of course, to read the contract, the contract, I mean, the offer, but you can always find a convenient clause there in order to recalcuate the price already at your own rate» — after «Read the offer: there is always a convenient clause to recalculate the price at your own rate».',
    '— «The model’s decisions» and brief fields marked «the model’s proposal» are questions the person handed to the model instead of answering them. Build the text on them: order, emphasis, who it is for, how it ends, why what the person said works — and the content that answers a handed question, exactly as far as the rule about handed questions below allows. They are not the person’s words: never quote them as the person’s, and never add a number, a quote or a named source to them.',
    '— The brief (claim, position, audience) is what the model understood from the material; in the text it is ground, not a quotation. The «objection» field is not for the core (see rule 3).',
    '— «Confirmed facts» may be stated as facts: checked against search or memory, or said by the person themselves.',
    '— «Taken from research» and «linked material (not verified)» are outside support, not verification: keep their uncertainty and never present them as confirmed facts.',
    '— Service material is not material: URLs, «here is the link», «see», questions to the model, «I want to write about…», «I would like to write about…», «let us write about…» are delivery and intent, not words for the text; only their topic and the read source are used, by meaning, and neither the framing nor the address enters the core. A stated goal («I want to tell how we got there») is not words for the text but what the text has to do: fulfil it with content. The person’s questions are topics for the text, not quotations or questions to the reader.',
    '',
    'HOW TO WRITE, all rules binding:',
    '1) begin with the person’s thought that stands closest to the claim — as a complete, grammatically connected sentence;',
    '2) never invent the person’s story: a number that is not in the input is not written; a quote, a named source or study, or an experience the person did not give is not invented; the model’s own knowledge — explanations, advice, techniques, widely known facts, examples — enters only where it answers a question handed to the model, and only as the rule about handed questions allows; explaining why what the person said works is always allowed — as reasoning, never as a fact of their story;',
    '3) the core holds the person’s position and never argues with it: doubts, caveats, limitations and counter-arguments go only into the «objection» field and never into the core;',
    '4) develop what was said instead of shrinking it: every answer of the person gets its own place in the text, their stated goal sets the structure (what it was like, what changed, why it worked, what follows from it), the model’s decisions add the angle, the explanation, the answer to the handed question and the conclusion; research supports and source material blocks are material too. The length follows the material and the decisions — never shorter than it takes to develop every answer, every handed question and the goal, and never longer: not one sentence without a word of the person, a decision of the model, a support or a material block behind it;',
    '5) smoothing over, introductory turns of phrase, generalities in place of particulars, «in the end» and «thus» conclusions, calls to action and questions to the reader are forbidden, and so is a closing sentence that repeats in other words what was already said above;',
    '6) no markup, no emoji, no headings, no lists; paragraphs separated by a blank line; a fragment in another language inside the input is material to retell in the output language, never a line to copy;',
    `7) ${forbiddenPhrases}`,
  ].join('\n');

/**
 * The mechanics of the «questions handed to the model» block: one decision per
 * key, returned beside the core by the same call. Rides only when the block
 * is there — without handed questions there is nothing to return.
 */
export const CORE_WRITE_DELEGATED_V15 =
  'A separate rule about the «questions handed to the model» block: the person pressed «You decide». For every question in that block return an entry in `decisions` under its key — one to three sentences that name what you decided and what the core now says in answer (for example: «The text explains why status questions disappear with a shared board and gives two ways to start one») — and write that answer into the core itself, following the rule about handed questions.';

/**
 * What a handed question may be answered with. Rides whenever the core is
 * built on handed questions — a fresh block or decisions from an earlier
 * round — so a rebuild keeps the same policy as the first core.
 */
export const CORE_WRITE_HANDED_V15: Record<DelegatedPolicyV1, string> = {
  knowledge:
    'The rule about handed questions («You decide»), stronger than any rule above about them. Handing a question over does not mean «write nothing about it»: the person expects you to answer it with content from your own knowledge, the way a knowledgeable co-author would. Answer each handed question in the core with substance: why it works, advice, techniques, widely known facts, and examples in a general form («teams often…», «for example, when…»). Write that knowledge as the author’s own reasoning or advice inside their first-person post — never as their lived experience. Still forbidden: a personal first-person episode the person did not give («last month we…» as something that happened), exact numbers, quotes, and named sources or studies that are not in the input. A question marked «about the author’s material» asks what only the person knows: answer it in general terms — how this usually goes and why — and do not invent their case.',
  examples:
    'The rule about handed questions («You decide»), stronger than any rule above about them. Handing a question over does not mean «write nothing about it»: the person expects you to answer it with content from your own knowledge, the way a knowledgeable co-author would. Answer each handed question in the core with substance: why it works, advice, techniques, widely known facts, and examples in a general form («teams often…», «for example, when…»). The author has allowed invented examples: beyond that knowledge you may invent a plausible illustrative example in the author’s voice, first person included («once a client asked me…»), where a concrete scene makes the point clearer, and a question marked «about the author’s material» may be answered with such an example. Keep it modest and typical — nothing that reads as a checkable claim about a real person, company or event. Still forbidden, even inside an example: numbers presented as measured results (say «fewer», «most of the team», never an exact figure), quotes of real people, and named sources or studies that are not in the input.',
};

/** The rebuild of v12, with its last sentence following the policy. */
export const CORE_WRITE_REBUILD_V15 =
  'A separate rule about the rebuild: the person pressed «Rebuild the core». Write the core again from every block — the person’s words, the added material, the answers, the model’s decisions, the brief — and keep the «previous core» block beside you: it was written from the same input. Everything the previous core carried from the person’s words, the answers and the model’s decisions stays in the new one: every thought, every paragraph built on a decision, the person’s examples, numbers, names and first-person sentences («I noticed», «we did» — when those are their words) are kept by meaning; drop none of it and never shorten it. Weave the added material in where it serves the claim instead of appending it as a last paragraph; where it refines or corrects what was there, the added material is right. A previous core marked «edited by the person» is their words: everything they wrote in it stays, including their numbers and examples. The model’s decisions still build the text, and what answers a handed question follows the rule about handed questions; add no numbers, names or quotes that are not in the person’s words, the added material, the answers or the supports, and if the previous core had such a thing and the person did not write it, do not carry it over.';

/**
 * The finished-text rule of v13 (`97dq.90`); its closing sentence now defers
 * to the rule about handed questions instead of forbidding all content.
 */
export const CORE_WRITE_FINISHED_TEXT_V15 =
  'The main rule about the form of the core, stronger than any rule above except the rule about handed questions. The core is always the finished text of the post in the author’s first person: the way they would write it to a reader themselves, never an account of the material, the answers or the decisions. (1) The model’s decisions are instructions for how to write and what to answer: apply each one silently. If a decision says «do not describe the concrete steps», the text simply has no steps; neither the decision nor what the text leaves out and why is mentioned. (2) The person’s answer outranks the material: where a number or a fact in an answer differs from the material (the material says «half», the answer says «a third less»), the text states only the value from the answer — as the only one, never mentioning that it was different before or that the person clarified or corrected it. (3) No speech about the text or the input: never write «in the first description», «at first I described», «in my answer I clarified», «as I wrote before», «here one could tell», «this is worth telling», «there are no concrete details», «no details», «in the material», «in the brief», «in the question», «the model’s decision», «this text explains». What is not in the input and not allowed by the rule about handed questions is not in the text — silently, with no remark about its absence. Beyond that rule, add no cases the person did not give, and never add numbers, names or quotes they did not give.';

export type CoreWriteSystemOptionsV15 = {
  enrichment?: boolean;
  firstWithResearch?: boolean;
  unconfirmed?: boolean;
  foreign?: boolean;
  instruction?: boolean;
  /** There is a «questions handed to the model» block. */
  delegated?: boolean;
  /** «Пересобрать суть»: there is a «previous core» block. */
  rebuild?: boolean;
  /**
   * The core is built on handed questions: a fresh block or decisions from
   * an earlier round. The policy rule rides only then.
   */
  handed?: boolean;
  /** The avatar's policy (`voice.delegatedPolicy`); absent is `knowledge`. */
  policy?: DelegatedPolicyV1;
};

export const coreWriteSystemV15 = (
  language: ContentLanguage,
  forbiddenPhrases: string,
  options: CoreWriteSystemOptionsV15 = {}
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
      ? CORE_WRITE_HANDED_V15[options.policy ?? DEFAULT_DELEGATED_POLICY]
      : '',
    CORE_WRITE_CAVEATS_V12.en,
    options.rebuild ? CORE_WRITE_REBUILD_V15 : '',
    CORE_WRITE_FINISHED_TEXT_V15,
    coreWriteOutputLanguageV14(language),
  ]
    .filter(Boolean)
    .join('\n');

export const CORE_WRITE_ENRICH_LEAD_V15 = CORE_WRITE_ENRICH_LEAD_V14;
export const CORE_WRITE_REPAIR_V15 = CORE_WRITE_REPAIR_V14;
export const CORE_WRITE_META_REPAIR_V15 = CORE_WRITE_META_REPAIR_V14;
