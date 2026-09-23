import { z } from 'zod';
import { contentLanguageNames } from '@contentfactory/nestjs-libraries/dtos/content.language';
import type { BriefField } from '../brand-voice/brief-gate';
import {
  interviewAskKey,
  PIECE_INTERVIEW_MAX_QUESTIONS,
  type PieceOpenQuestionV1,
} from '../brand-voice/voice-wiring.contract';
import {
  briefFillPromptV7,
  briefFillSchemaV7,
  type BriefFillPromptInputV7,
} from './intake.prompts.v7';

/**
 * Brief fill whose interview has no fixed question count
 * (`content-factory-next-97dq.44`, eleventh walk of 23.09.2026).
 *
 * The owner: «Зачем нужно ограничивать модель? Пусть дают столько вопросов,
 * сколько ей нужно. … На первом этапе модель задает вопрос именно касающийся
 * насыщения поста, чтобы сделать какую-то авторскую подачу … Мы должны давать
 * модели просто рекомендации, но не загонять в какие-то жесткие рамки. И тем
 * более не создавать типовые вопросы.»
 *
 * Until this version the brief filler asked «at most two questions», only
 * about `thesis` and `position` (`intake.prompts.v3.ts`), and v8 added one
 * default question about `thesis` or `audience`. The successor:
 *
 *  - lets the model decide how many questions the material needs — zero is a
 *    valid answer; `PIECE_INTERVIEW_MAX_QUESTIONS` is a guard against a
 *    runaway list, not a target;
 *  - aims the questions at enriching the post and the author's angle: an
 *    episode, a detail or number only the author has, the stake, an opinion
 *    somebody could argue with, the exact reader;
 *  - marks every question with `about`: the brief field its answer settles, or
 *    `material` when the answer is substance for the text rather than a brief
 *    field. A `material` question is keyed `ask-<n>` and rides on the `facts`
 *    field — «what the post stands on»;
 *  - has no default question and no fixed wording: every question is written
 *    by the model from this material.
 *
 * The first live check (`evidence/live-stand-2026-09-23-interview/`) showed the
 * first wording under-asking: «as many as THIS material needs and no more»,
 * «not everything on this list» and «a skipped one still leaves a good post»
 * read as «one question is safest», and every thin text got exactly one. The
 * owner: «он задаст 5–10 вопросов, если это необходимо, какая разница. Если
 * нужен один, значит один … Главное — ей цель написать, чтобы материал был
 * полезным, интересным.» So the rules now state the goal — interview like an
 * editor so the post is useful and interesting in the author's voice — and ask
 * every question whose answer would materially improve the post.
 *
 * Two base rules are replaced rather than retired (`REPLACED_BASE_RULES_V9`):
 * the licence to propose `position` and `audience` yourself filled every brief
 * field, so no field was ever asked; now an unclear position or reader is asked
 * and a proposal only stands in when the question is skipped. And a proposed
 * field keeps the author's numbers verbatim — live, «созвонов вдвое меньше»
 * came back as «почти исчезли».
 *
 * Research behind the rules:
 * `.codex/stages/content-factory-next-97dq/evidence/interview-practices-2026-09-23.md`.
 *
 * The brief rules themselves are v7's (and, through it, v5's): this prompt
 * reuses that text and drops only the retired question rules of v3, so the
 * two cannot drift. `intake.prompts.v7.ts` and `intake.prompts.v8.ts` stay
 * importable and untouched for released receipts.
 */

export const BRIEF_FILL_PROMPT_VERSION_V9 = 'intake-brief-fill/v9' as const;

/** What an answer settles: a brief field, or substance for the text. */
export const INTERVIEW_ABOUT_V9 = [
  'thesis',
  'position',
  'audience',
  'disagreement',
  'material',
] as const;

export type InterviewAboutV9 = (typeof INTERVIEW_ABOUT_V9)[number];

export const intakeQuestionsSchemaV9 = z
  .array(
    z.object({
      about: z
        .enum(INTERVIEW_ABOUT_V9)
        .describe(
          'The brief field the answer settles, or `material` when the answer adds substance to the text'
        ),
      question: z.string(),
      options: z
        .array(z.string())
        .describe('Two or three first-person options, or an empty list'),
    })
  )
  .nullable()
  .optional();

export const briefFillSchemaV9 = briefFillSchemaV7.extend({
  questions: intakeQuestionsSchemaV9,
});

export type BriefFillPromptInputV9 = BriefFillPromptInputV7;

/**
 * Lines of `briefFillPromptV3` that v9 retires. They are frozen text of a
 * released prompt, so matching them verbatim is stable; a test pins that none
 * of them survives into v9.
 */
export const RETIRED_QUESTION_RULES_V9: readonly string[] = [
  'Before any draft, return at most two questions, only when the answer is something only the author can know: the thesis they want to argue or their personal position.',
  'Never ask for a source, number, document or searchable context. Confirm facts yourself; do not ask the author to supply evidence or missing background.',
  'If thesis and position are already clear, questions is empty. Never ask again about Already decided fields.',
];

/**
 * Base rules v9 rewrites. The keys are frozen text of released prompts (v5 for
 * own and borrowed material, v7 for an instruction), so matching them verbatim
 * is stable; a test pins that v7 and v8 still carry them.
 */
const PROPOSE_WITH_FIDELITY_V9 =
  '- You may propose `disagreement` yourself, and `position` or `audience` when the material makes them evident. Mark proposals with origin `model`. When the person’s own position or the reader is genuinely unclear, ask (see Interview) instead of settling on a guess; your proposal then only stands in if they skip the question.';
const FIDELITY_V9 =
  '- A field you write never restates the person’s facts differently: their numbers and claims appear in their own wording or not at all. Never round, strengthen or soften them («half as many» never becomes «almost none»).';

export const REPLACED_BASE_RULES_V9: Readonly<Record<string, readonly string[]>> = {
  '- You may propose `position`, `disagreement` and `audience` yourself. Mark them with origin `model`.': [
    PROPOSE_WITH_FIDELITY_V9,
    FIDELITY_V9,
  ],
  '- You may propose `position`, `disagreement` and `audience` yourself. Mark them with origin `model`. The person’s position on their own event is theirs; do not ask whether they agree with an author.': [
    PROPOSE_WITH_FIDELITY_V9,
    '- The person’s position on their own event is theirs; do not ask whether they agree with an author.',
    FIDELITY_V9,
  ],
};

const interviewRules = (input: BriefFillPromptInputV9): string[] =>
  [
    'Interview (`questions`): before the core is written we interview the person the way a good editor or ghostwriter would. The goal is a post that is useful and interesting to its reader and sounds like the author, standing on their own experience instead of a generic take.',
    '- Ask every question whose answer would materially improve THIS post, one question per thing it lacks: it may be one, it may be several. Ask none when the material already carries it.',
    '- What a strong post usually stands on, and what to ask for when this material does not state it: the concrete episode or example behind the claim; how it was before and what changed after; the author’s own numbers (how many, how much, how long, how often); what was at stake or went wrong; what surprised them; who exactly the reader is; the author’s own position when it is unclear. Never ask for what the material already says.',
    '- Ask for what only the person knows: their experience, their numbers, their view, their reader. Never ask for details of a public event, study or topic — research supplies those. When the material is about somebody else’s event or study, ask how it touches the author: what they saw themselves, why it matters to them, what they want the reader to take from it.',
    '- Every question is about THIS material and names its subject. A question that would fit any post («What is your main message?», «Who is your audience?») is a template: never ask it.',
    '- One concern per question; never join two asks in one sentence. Two questions never ask the same thing in different words.',
    '- Mark each question with `about`: the brief field its answer settles (`thesis`, `position`, `audience`, `disagreement`) or `material` when the answer adds substance to the text (an episode, a before and after, a detail, a number, a stake). At most one question per brief field.',
    '- Under `options` offer two or three short answers in the person’s first person, ready to become their words. They differ in substance, never reword one another, and none is marked as recommended. Never put a fact, a number, a name or an event the person did not state into an option: when an honest option would need one, return an empty `options` list and the person answers in their own words.',
    '- Never ask for a source, a link or a document, and never ask the person to confirm a fact you can check yourself. Asking for their own experience, example or number is welcome.',
    '- Never ask about a field listed under «Already decided by the person».',
    input.materialKind === 'borrowed'
      ? '- The material is somebody else’s post: when the person’s own position on it is unknown, ask for it (about `position`); never attribute the source author’s position to them.'
      : '',
    '- The person may answer in their own words, skip a question or hand it back to you.',
    `- Write every question and option in ${contentLanguageNames[input.language]}.`,
  ].filter(Boolean);

export const briefFillPromptV9 = (input: BriefFillPromptInputV9): string => {
  const retired = new Set(RETIRED_QUESTION_RULES_V9);
  const base = briefFillPromptV7(input)
    .split('\n')
    .filter((line) => !retired.has(line) && !line.startsWith('PROMPT VERSION:'))
    .flatMap((line) => REPLACED_BASE_RULES_V9[line] ?? [line])
    .join('\n');
  return [
    `PROMPT VERSION: ${BRIEF_FILL_PROMPT_VERSION_V9}`,
    base,
    '',
    ...interviewRules(input),
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n');
};

/* -------------------------------------------------------------------------
 * The model's questions as the piece stores them
 * ---------------------------------------------------------------------- */

const OPTION_MAX_CHARS = 200;
const QUESTION_MAX_CHARS = 400;

const textOf = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/gu, ' ').trim();
  if (!text || ['null', 'none', ':null,'].includes(text.toLowerCase())) {
    return null;
  }
  return text;
};

const BRIEF_ABOUT: Readonly<Record<string, BriefField>> = {
  thesis: 'thesis',
  position: 'position',
  audience: 'audience',
  disagreement: 'disagreement',
};

/**
 * The model's interview as open questions: in its order, one per brief field,
 * `material` questions keyed `ask-1`, `ask-2` … on the `facts` field, no
 * question twice, options trimmed and distinct (at most three). The count is
 * the model's; only `PIECE_INTERVIEW_MAX_QUESTIONS` cuts a runaway list.
 *
 * Accepts `field` as well as `about`: v3–v8 answers named it so.
 */
export const interviewQuestionsV9 = (value: unknown): PieceOpenQuestionV1[] => {
  const questions: PieceOpenQuestionV1[] = [];
  const seenFields = new Set<BriefField>();
  const seenTexts = new Set<string>();
  let material = 0;
  for (const raw of Array.isArray(value) ? value : []) {
    if (questions.length >= PIECE_INTERVIEW_MAX_QUESTIONS) break;
    const about = String((raw as any)?.about ?? (raw as any)?.field ?? '');
    const question = textOf((raw as any)?.question)?.slice(0, QUESTION_MAX_CHARS);
    if (!question || seenTexts.has(question.toLowerCase())) continue;
    const options: string[] = [];
    for (const option of Array.isArray((raw as any)?.options) ? (raw as any).options : []) {
      const text = textOf(option)?.slice(0, OPTION_MAX_CHARS).trim();
      if (text && !options.some((other) => other.toLowerCase() === text.toLowerCase())) {
        options.push(text);
      }
      if (options.length >= 3) break;
    }
    const field = BRIEF_ABOUT[about];
    if (field) {
      if (seenFields.has(field)) continue;
      seenFields.add(field);
      questions.push({ field, question, options, suggested: null });
    } else if (about === 'material') {
      questions.push({
        field: 'facts',
        key: interviewAskKey(material),
        question,
        options,
        suggested: null,
      });
      material += 1;
    } else {
      continue;
    }
    seenTexts.add(question.toLowerCase());
  }
  return questions;
};
