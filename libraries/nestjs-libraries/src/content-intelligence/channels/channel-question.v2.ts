import { z } from 'zod';
import type { ChannelWritingProfileV2 } from './channel-writing-profile.v2.contract';
import type { PieceQuestionV1 } from '../brand-voice/voice-wiring.contract';

const FIELDS = ['lengthPolicy', 'emojiLevel', 'linkPolicy', 'hashtagPolicy', 'ctaKind', 'formatPreference'] as const;
export const unavoidableQuestionSchemaV2 = z.object({
  unavoidable: z.boolean(),
  field: z.enum(FIELDS),
  question: z.string(),
  why: z.string(),
  options: z.array(z.string()).nullable().optional(),
}).nullable().optional();
export const hasAutomaticChannelField = (profile: ChannelWritingProfileV2 | null | undefined): boolean =>
  Boolean(profile && FIELDS.some((field) => profile[field] === 'auto'));
export const unavoidableQuestionV2 = (value: unknown, profile: ChannelWritingProfileV2 | null | undefined): PieceQuestionV1 | null => {
  const parsed = unavoidableQuestionSchemaV2.safeParse(value);
  const question = parsed.success ? parsed.data : null;
  if (!question?.unavoidable || profile?.[question.field] !== 'auto' || !question.question.trim() || !question.why.trim()) return null;
  return { key: question.field === 'ctaKind' ? 'cta' : question.field === 'formatPreference' ? 'format' : 'hook',
    question: question.question.trim().slice(0, 1000), why: question.why.trim().slice(0, 1000),
    options: (question.options ?? []).filter((option) => option.trim()).slice(0, 3), suggested: null };
};
export const channelQuestionPromptV2 = 'Write the adaptation without asking questions. Only if an automatic channel setting cannot be chosen without a missing human-owned fact, you may return unavoidableQuestion with unavoidable=true, its automatic field, one specific question and a concrete reason; content is then null. Routine choices about format, emoji or CTA are yours: never ask those as a questionnaire. If the person already answered or delegated the choice, do not ask again.';

export const channelQuestionTemplateV2 = (base: string): string => `${base}\n{channelQuestionRule}`;
