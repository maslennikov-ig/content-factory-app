import { z } from 'zod';
import { writingSettingsSchema, writingSettingsAnswerSchema, type WritingSettings } from '@contentfactory/helpers/utils/writing-settings';
import { readEmojiLevel } from '@contentfactory/nestjs-libraries/content-intelligence/channels/emoji-ceiling';
import type { ChannelWritingProfileV1 } from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile';
import { approvalFingerprint } from './approval-fingerprint';

export { writingSettingsAnswerSchema };
export const writingSettingsCheckpoint = z.object({
  pieceId: z.string(), channelId: z.string(), profileFingerprint: z.string(),
  current: writingSettingsSchema, settings: writingSettingsSchema,
  action: z.enum(['apply', 'keep-channel']), scope: z.enum(['post', 'drafts']),
}).strict();
export const writingSettingsQuestionFields = {
  kind: z.literal('writing-settings'), question: z.string(), reason: z.string(),
  scope: z.enum(['post', 'drafts']), maxCharacters: z.number().int().positive(),
  current: writingSettingsSchema, proposed: writingSettingsSchema,
  channel: z.object({id: z.string(), name: z.string(), provider: z.string()}),
  canDecideForPerson: z.literal(false),
};
export const settingsProfileFingerprint = (profile: ChannelWritingProfileV1) => approvalFingerprint('writing-settings-profile', profile);
export const channelWritingSettings = (profile: ChannelWritingProfileV1): WritingSettings => writingSettingsSchema.parse({
  lengthPolicy: 'channel',
  lengthRange: typeof profile.lengthPolicy === 'object' ? {
    idealMin: profile.lengthPolicy.idealMin ?? null, idealMax: profile.lengthPolicy.idealMax, hardMax: profile.lengthPolicy.hardMax ?? null,
  } : null,
  emojiLevel: readEmojiLevel(profile.emojiLevel, 'auto'), hashtagPolicy: profile.hashtagPolicy,
  linkPolicy: profile.linkPolicy, ctaKind: profile.ctaKind,
});
type ProposedInput = Partial<Pick<WritingSettings, 'emojiLevel' | 'hashtagPolicy' | 'linkPolicy' | 'ctaKind'>> & {
  length?: 'shorter' | 'channel' | 'longer'; lengthPolicy?: 'auto' | 'range';
  lengthRange?: {idealMin?: number | null; idealMax?: number; hardMax?: number | null};
};
export const hasWritingProposal = (input: ProposedInput) =>
  ['emojiLevel', 'hashtagPolicy', 'linkPolicy', 'ctaKind', 'lengthPolicy', 'lengthRange'].some(key => (input as Record<string, unknown>)[key] !== undefined) ||
  (input.length !== undefined && input.length !== 'channel');
export const proposedWritingSettings = (current: WritingSettings, input: ProposedInput): WritingSettings => writingSettingsSchema.parse({
  ...current,
  ...Object.fromEntries(['emojiLevel', 'hashtagPolicy', 'linkPolicy', 'ctaKind'].filter(key => (input as any)[key] !== undefined).map(key => [key, (input as any)[key]])),
  lengthPolicy: input.lengthPolicy || input.length || 'channel',
  lengthRange: input.lengthRange ? {idealMin: input.lengthRange.idealMin ?? null, idealMax: input.lengthRange.idealMax, hardMax: input.lengthRange.hardMax ?? null} : current.lengthRange,
});
/** Only approved differences reach the existing per-post DTO. No channel write. */
export const writingSettingsOverrides = (current: WritingSettings, settings: WritingSettings) => ({
  ...Object.fromEntries((['emojiLevel', 'hashtagPolicy', 'linkPolicy', 'ctaKind'] as const).filter(key => settings[key] !== current[key]).map(key => [key, settings[key]])),
  ...(settings.lengthPolicy === 'auto' ? {lengthPolicy: 'auto' as const} : {}),
  ...(settings.lengthPolicy === 'range' ? {lengthPolicy: 'range' as const, lengthRange: settings.lengthRange!} : {}),
  ...(['shorter', 'longer'].includes(settings.lengthPolicy) ? {length: settings.lengthPolicy as 'shorter' | 'longer'} : {}),
});
export const writingSettingsDiffer = (current: WritingSettings, proposed: WritingSettings) => Object.keys(writingSettingsOverrides(current, proposed)).length > 0;
