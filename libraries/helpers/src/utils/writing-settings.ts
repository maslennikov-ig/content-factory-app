import { z } from 'zod';

/** The browser and native resume door share the same bounded, editable values. */
export const writingSettingsSchema = z.object({
  lengthPolicy: z.enum(['channel', 'auto', 'range', 'shorter', 'longer']),
  lengthRange: z.object({
    idealMin: z.number().int().min(50).max(100_000).nullable(),
    idealMax: z.number().int().min(50).max(100_000),
    hardMax: z.number().int().min(50).max(100_000).nullable(),
  }).strict().nullable(),
  emojiLevel: z.enum(['none', 'few', 'medium', 'many', 'max', 'auto']),
  hashtagPolicy: z.enum(['none', 'end_1_3', 'free', 'auto']),
  linkPolicy: z.enum(['none', 'end', 'inline', 'auto']),
  ctaKind: z.enum(['auto', 'none', 'question', 'comment', 'link', 'subscribe', 'reply']),
}).strict().superRefine((value, ctx) => {
  const range = value.lengthRange;
  if (value.lengthPolicy === 'range' && !range) ctx.addIssue({code: 'custom', path: ['lengthRange'], message: 'A range is required.'});
  if (range && ((range.idealMin !== null && range.idealMin > range.idealMax) ||
    (range.hardMax !== null && range.hardMax < range.idealMax))) {
    ctx.addIssue({code: 'custom', path: ['lengthRange'], message: 'Use minimum ≤ maximum ≤ hard maximum.'});
  }
});
export type WritingSettings = z.infer<typeof writingSettingsSchema>;
export const writingSettingsAnswerSchema = z.union([
  z.object({action: z.literal('apply'), settings: writingSettingsSchema}).strict(),
  z.object({action: z.literal('keep-channel')}).strict(),
]);

export const writingSettingsWithinLimit = (settings: WritingSettings, maxCharacters: number): boolean =>
  settings.lengthPolicy !== 'range' || (!!settings.lengthRange &&
    [settings.lengthRange.idealMin, settings.lengthRange.idealMax, settings.lengthRange.hardMax]
      .every(value => value === null || value <= maxCharacters));
