import { z } from 'zod';
import { SourceArtifactRefSchemaV1, type ResolvedSourceArtifactV1 } from './source-artifact.v1';

const text = z.string().min(1).max(5000);
export const clipPreproductionInputV1 = z.object({
  requestMessageId: z.string().min(1).max(128), sourceArtifact: SourceArtifactRefSchemaV1,
  outputLocale: z.string().min(2).max(60),
}).strict();
export const clipPreproductionOpenV1 = z.object({ pilotId: z.string().min(1).max(128) }).strict();
export const clipScenarioV1 = z.object({
  directionsLanguage: z.literal('en'), outputLocale: z.string().min(2).max(60),
  targetSeconds: z.literal(5), aspectRatio: z.literal('9:16'),
  firstFrameDirections: text, lastFrameDirections: text, motionDirections: text,
  screenText: z.string().max(2000), spokenText: z.string().max(2000), captions: z.array(z.string().max(1000)).max(10),
  claims: z.array(z.object({ text, sourceQuote: text }).strict()).max(20),
  unknownFacts: z.array(text).max(10), rightsConflicts: z.array(text).max(10),
}).strict();
export const clipCritiqueV1 = z.object({
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/), scenarioDigest: z.string().regex(/^[a-f0-9]{64}$/),
  verdict: z.enum(['accept', 'revise', 'blocked']),
  findings: z.array(z.object({ category: z.enum(['facts', 'rights', 'language', 'duration', 'creative']), detail: text }).strict()).max(20),
}).strict();
export type ClipScenarioV1 = z.infer<typeof clipScenarioV1>;
export type ClipCritiqueV1 = z.infer<typeof clipCritiqueV1>;
export interface ClipModelAuditV1 {
  selectedModel: string; actualModel?: string; provider: string; admissionId: string; inputDigest: string;
  modelProvenance: 'provider_response' | 'unverified'; providerReportedModels: (string | null)[];
}
export interface ClipStageV1 {
  kind: 'author' | 'critic'; state: 'started' | 'captured' | 'unknown';
  inputDigest: string; raw?: unknown; audit?: ClipModelAuditV1;
}
export interface ClipPreproductionV1 {
  revisionV2?: import('./native-clip-revision.v2').ClipRevisionV2;
  executionModeV2?: {version: 2; mode: import('./native-clip-execution.v2').ClipExecutionPolicyV2['mode']};
  type: 'native_clip_preproduction'; version: 1; actorId: string; threadId: string;
  request: { messageId: string; text: string }; source: ResolvedSourceArtifactV1; outputLocale: string;
  policy: { author: string; critic: string; provider: string };
  state: 'preparing' | 'reviewed' | 'needs_input' | 'uncertain'; blocker?: string;
  reviewResume?: { version: 1; authorInputDigest: string };
  production?: import('./native-clip-production.v1').ClipProductionV1;
  stages: ClipStageV1[];
}
