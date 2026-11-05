import { z } from 'zod';

/** Shared execution/approval bound, measured in JavaScript UTF-16 code units. */
export const NATIVE_SUBAGENT_TASK_MAX_LENGTH = 16_000;

/** Shared by native execution and the description of its stored approval. */
export const nativeSubagentInputSchema = z.object({
  agentType: z
    .enum(['research', 'writing', 'review'])
    .describe('Which bounded specialist to run: research, writing, or review.'),
  task: z
    .string()
    .min(1)
    .max(NATIVE_SUBAGENT_TASK_MAX_LENGTH)
    .optional()
    .describe('Self-contained task instructions and context for the specialist.'),
  prompt: z
    .string()
    .min(1)
    .max(NATIVE_SUBAGENT_TASK_MAX_LENGTH)
    .optional()
    .describe('Alias for task instructions.'),
  forked: z
    .boolean()
    .optional()
    .describe('Must not be true; forked subagent execution is disabled.'),
  modelId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('Optional model ID override; defaults to the workspace role model for the specialist.'),
});

export type NativeSubagentInput = z.infer<typeof nativeSubagentInputSchema>;
