import { z } from 'zod';
import { UNTRUSTED_DATA_RULE } from '../capabilities/untrusted-data';

const candidate = z.object({
  text: z.string().min(1).max(16_000),
  totalCharacters: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  truncated: z.boolean(),
}).strict().refine(value => value.truncated
  ? value.text.length === 16_000 && value.totalCharacters > 16_000
  : value.totalCharacters === value.text.length);

/** The one server diagnostic that must survive normal transient progress. */
const rejectedReviewProgress = z.object({
  type: z.literal('data-progress'),
  id: z.string().min(1).max(128).optional(),
  transient: z.boolean().optional(),
  data: z.object({
    capability: z.literal('piece.adapt'),
    stage: z.literal('error'),
    code: z.literal('CONTENT_ADAPTATION_INCOMPLETE'),
    saved: z.literal(false),
    qualityReview: z.object({
      untrustedData: z.object({
        sources: z.tuple([z.literal('workspace-text')]),
        rule: z.literal(UNTRUSTED_DATA_RULE),
        value: z.object({
          reviewAvailable: z.boolean(),
          missingRequirements: z.array(z.string().max(1_000)).max(20),
          unsupportedClaims: z.array(z.string().max(1_000)).max(20),
          candidate: z.union([candidate, z.object({ unavailable: z.literal(true) }).strict()]),
        }).strict(),
      }).strict(),
    }).strict(),
  }).strict(),
}).strict();

export const isRejectedAdaptationReviewProgress = (part: unknown): boolean =>
  rejectedReviewProgress.safeParse(part).success;
