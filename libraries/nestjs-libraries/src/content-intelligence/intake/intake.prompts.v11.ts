import {
  BRIEF_FILL_PROMPT_VERSION_V10,
  DECIDED_RULES_V10,
  briefFillPromptV10,
  briefFillSchemaV10,
  type BriefFillPromptInputV10,
} from './intake.prompts.v10';

/**
 * Brief fill where a handed field may draw on the model's own knowledge
 * (`content-factory-next-97dq.99`, owner decision of 25.09.2026).
 *
 * v10 (`97dq.56`) said a decision «develops what the person said» and nothing
 * more. The owner: «если человек пишет „реши сам“, это не значит, что ничего
 * писать не нужно» — the model answers from what it knows. v11 changes that
 * one rule: a handed field may rest on widely known knowledge — why such a
 * claim holds, what is known about it — and is still never the person's
 * experience, case, number, quote or named source.
 *
 * The avatar's policy (`voice.delegatedPolicy`) does not reach this prompt on
 * purpose: its opt-in allows an invented illustrative example in the text,
 * and a brief field (claim, position, reader) is a summary the person reads in
 * «Что мы поняли», not a place for a scene. Both policies fill the brief the
 * same way; the core prompt (`core-write/v15`) is where they differ.
 *
 * The answer's shape is v10's. `intake.prompts.v10.ts` stays importable and
 * untouched for released receipts.
 */

export const BRIEF_FILL_PROMPT_VERSION_V11 = 'intake-brief-fill/v11' as const;

export const briefFillSchemaV11 = briefFillSchemaV10;

export type BriefFillPromptInputV11 = BriefFillPromptInputV10;

/** The rules v11 carries for handed fields; a test pins each into the prompt. */
export const DECIDED_RULES_V11: readonly string[] = [
  'Handed to you («Decide for me»): the person gave the fields listed under «Handed to the model» to you instead of answering them. Handing a field over does not mean «leave it thin»: fill it from what the person said and from your own knowledge.',
  '- Fill every handed field with a decision and mark it with origin `model`; never leave a handed field null.',
  '- A decision is an editorial choice: the angle, the reader, the conclusion, the structure, or the reasoning behind the person’s own claim. It develops what the person said and may rest on widely known knowledge — why such a claim holds, what is generally known about it; it is never the person’s experience.',
  '- Never write a decision in the first person as something the person lived, and never put into it a case, a number, a name, a date, a quote or a source the material does not carry.',
  '- Never ask a question about a handed field.',
];

/**
 * v10's prompt with its version line and handed-field rules swapped for
 * v11's: the placement and the handed-field list stay v10's own code.
 */
export const briefFillPromptV11 = (input: BriefFillPromptInputV11): string => {
  const replaced = new Map<string, string>([
    [`PROMPT VERSION: ${BRIEF_FILL_PROMPT_VERSION_V10}`, `PROMPT VERSION: ${BRIEF_FILL_PROMPT_VERSION_V11}`],
    ...DECIDED_RULES_V10.map((rule, index): [string, string] => [rule, DECIDED_RULES_V11[index]]),
  ]);
  return briefFillPromptV10(input)
    .split('\n')
    .map((line) => replaced.get(line) ?? line)
    .join('\n');
};
