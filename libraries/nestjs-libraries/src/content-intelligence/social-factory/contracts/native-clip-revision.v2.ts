import { z } from 'zod';
import type { ClipScenarioV1 } from './native-clip-preproduction.v1';
export const clipRevisionInputV2 = z.object({pilotId: z.string().min(1).max(128), requestMessageId: z.string().min(1).max(128), scope: z.enum(['scenario', 'references'])}).strict();
export interface ClipRevisionV2 {
  version: 2; parentPilotId: string; parentScenarioDigest: string; scope: 'scenario' | 'references';
  originalRequest: {messageId: string; text: string}; previousRequest: {messageId: string; text: string}; previousScenario: ClipScenarioV1;
}
