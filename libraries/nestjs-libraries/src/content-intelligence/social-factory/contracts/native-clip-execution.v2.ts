import { z } from 'zod';

/** Additive policy. Absence on an existing production means historical V1 autopilot. */
export const clipExecutionModeV2 = z.enum(['review', 'autopilot']);
export const clipExecutionModeInputV2 = z.object({pilotId: z.string().min(1).max(128), mode: clipExecutionModeV2}).strict();
export const clipReferenceLaunchV2 = z.object({pilotId: z.string().min(1).max(128), referenceDigest: z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export interface ClipExecutionPolicyV2 {
  version: 2;
  mode: z.infer<typeof clipExecutionModeV2>;
  referencesApproval?: {contextDigest: string; referenceDigest: string};
}
export interface ClipExecutionPublicV2 {
  version: 2; mode: ClipExecutionPolicyV2['mode'];
  referenceApproval: {state: 'not_ready' | 'awaiting_approval' | 'approved' | 'stale';
    referenceDigest: string | null; canApprove: boolean};
}
