import { oneLine } from './intake.prompts';
import {
  BRIEF_FILL_PROMPT_VERSION_V9,
  briefFillPromptV9,
  briefFillSchemaV9,
  type BriefFillPromptInputV9,
} from './intake.prompts.v9';

/**
 * Brief fill where «Решите за меня» is a decision (`content-factory-next-97dq.56`,
 * owner decision of 23.09.2026, twelfth walk, `cnt-32`).
 *
 * Until this version a field the person handed to the model reached the
 * brief filler not at all: the prompt only knew the fields the person had
 * decided themselves («Already decided by the person»). Whether a handed field
 * got a value depended on the licence to propose, and the piece stored the
 * hand-over as an empty string. The owner: the model has to write a decision —
 * angle, reader, conclusion, structure, the reasoning behind the author's own
 * claim — and never the author's experience, cases or numbers.
 *
 * v10 is v9 plus one block: the handed fields are named, each must be filled
 * with a decision marked origin `model`, and the decision's limits are stated.
 * The answer's shape is v9's (`briefFillSchemaV10` is `briefFillSchemaV9`), so
 * no second model call and no new parser. `intake.prompts.v9.ts` stays
 * importable and untouched for released receipts.
 */

export const BRIEF_FILL_PROMPT_VERSION_V10 = 'intake-brief-fill/v10' as const;

export const briefFillSchemaV10 = briefFillSchemaV9;

export type BriefFillPromptInputV10 = BriefFillPromptInputV9 & {
  /** Brief fields the person handed to the model («Решите за меня»). */
  decided?: readonly string[];
};

/** The rules v10 adds; a test pins each of them into the prompt. */
export const DECIDED_RULES_V10: readonly string[] = [
  'Handed to you («Decide for me»): the person gave the fields listed under «Handed to the model» to you instead of answering them.',
  '- Fill every handed field with a decision and mark it with origin `model`; never leave a handed field null.',
  '- A decision is an editorial choice: the angle, the reader, the conclusion, the structure, or the reasoning behind the person’s own claim. It develops what the person said; it is never the person’s experience.',
  '- Never write a decision in the first person as something the person lived, and never put into it a case, a number, a name, a date, a quote or a source the material does not carry.',
  '- Never ask a question about a handed field.',
];

const INTERVIEW_LEAD = 'Interview (`questions`):';

export const briefFillPromptV10 = (input: BriefFillPromptInputV10): string => {
  const lines = briefFillPromptV9(input)
    .split('\n')
    .map((line) =>
      line === `PROMPT VERSION: ${BRIEF_FILL_PROMPT_VERSION_V9}`
        ? `PROMPT VERSION: ${BRIEF_FILL_PROMPT_VERSION_V10}`
        : line
    );
  const decided = [...new Set(input.decided ?? [])].filter(Boolean);
  if (!decided.length) return lines.join('\n');
  const block = [
    ...DECIDED_RULES_V10,
    'Handed to the model («Decide for me»; decide these yourself):',
    ...decided.map((field) => `- ${oneLine(field)}`),
    '',
  ];
  const at = lines.findIndex((line) => line.startsWith(INTERVIEW_LEAD));
  return (at < 0 ? [...lines, '', ...block] : [...lines.slice(0, at), ...block, ...lines.slice(at)])
    .join('\n')
    .trimEnd();
};
