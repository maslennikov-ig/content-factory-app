import { contentLanguageNames } from '@contentfactory/nestjs-libraries/dtos/content.language';
import { briefFillPromptV5, briefFillSchemaV5 } from './intake.prompts.v5';
import { oneLine, type BriefFillPromptInput } from './intake.prompts';

/**
 * Brief fill for an *instruction* — the person describing the post they want
 * (`content-factory-next-97dq.29`, tenth walk of 22.09.2026).
 *
 * Until this version the brief filler knew two kinds of material: the
 * person's own thought and a summary of somebody else's post. A task («write a
 * post that I was on the radio; here are the links, here are the questions I
 * answered») is neither: its words are not the text of the post, and the
 * announcement and questions pasted under it are what the post is *about*, not
 * a publication to answer. `cnt-28` went in as a foreign post and came out as
 * an essay on the questions' topic, with the appearance, the links and the
 * questions all gone.
 *
 * `briefFillSchemaV7` is `briefFillSchemaV5` itself: the answer's shape did not
 * change. `intake.prompts.v5.ts` stays importable and untouched, and every
 * material kind other than `instruction` still goes through it.
 */

export const briefFillSchemaV7 = briefFillSchemaV5;

export const BRIEF_FILL_PROMPT_VERSION_V7 = 'intake-brief-fill/v7' as const;

export type BriefFillPromptInputV7 = Omit<BriefFillPromptInput, 'materialKind'> & {
  materialKind: BriefFillPromptInput['materialKind'] | 'instruction';
  /** Links the person told us to keep; named so the model does not treat them as sources. */
  keepLinks?: readonly string[];
};

const section = (title: string, lines: readonly string[]) =>
  lines.length ? [title, ...lines].join('\n') : '';

export const briefFillPromptV7 = (input: BriefFillPromptInputV7): string => {
  if (input.materialKind !== 'instruction') {
    return briefFillPromptV5({ ...input, materialKind: input.materialKind });
  }
  return [
    `PROMPT VERSION: ${BRIEF_FILL_PROMPT_VERSION_V7}`,
    'You are filling a writing brief for one person, from what this workspace already knows about them.',
    'The material is the person’s INSTRUCTION: they describe the post they want written. It is a task, not the text of the post and not somebody else’s publication.',
    'Rules:',
    '- `goal` is what the person asked for, in one sentence. `thesis` is the one arguable sentence the post will make; when the instruction names an event, an experience or an announcement of their own, that is the thesis — not the topic of any questions, quotes or pasted text under it.',
    '- Text pasted under the instruction (an announcement, a list of questions, a message from somebody) is supporting material the person wants used, not a post to answer. Its author’s opinion is not the person’s position.',
    '- Fill a field only when the instruction supports it. When it does not, return null for that field and offer two or three ready answers under `options`.',
    '- Never invent a number, a name, a date or a source. A fact without an [F:...] or [E:...] id may only be the person’s own words.',
    '- Every number, date, name or count the person stated becomes its OWN row in `facts`, in the person’s own wording, without «Автор утверждает, что» or any other attribution.',
    '- Links in the instruction are addresses to KEEP in the text, not sources to read: never turn a link into a fact row, never cite it as evidence.',
    '- You may propose `position`, `disagreement` and `audience` yourself. Mark them with origin `model`. The person’s position on their own event is theirs; do not ask whether they agree with an author.',
    '- `audience` names people, never «everyone».',
    '- Fields listed under «Already decided by the person» are copied verbatim and never rewritten.',
    `- Write every field in ${contentLanguageNames[input.language]}.`,
    '',
    section(
      'Already decided by the person (copy verbatim):',
      input.fixed.map((row) => `- ${row.field}: ${oneLine(row.text)}`)
    ),
    section('Who writes here (the workspace avatar):', input.avatar),
    section('How this channel is written:', input.channel),
    section(
      'Facts this workspace already holds:',
      input.facts.map((line) => `- ${line}`)
    ),
    section(
      'Links the person told us to keep (addresses only, not sources):',
      (input.keepLinks ?? []).map((link) => `- ${link}`)
    ),
    '',
    'The person’s instruction:',
    oneLine(input.material),
  ]
    .filter(Boolean)
    .join('\n');
};
