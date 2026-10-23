import { z } from 'zod';
export const VideoAccessSchemaV2 = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('api'), payer: z.enum(['included', 'workspace_key'])}).strict(),
  z.object({kind: z.literal('subscription'), connectionId: z.string().uuid()}).strict(),
  z.object({kind: z.literal('manual'), provider: z.enum(['higgsfield', 'heygen'])}).strict(),
]);
export type VideoAccessV2 = z.infer<typeof VideoAccessSchemaV2>;
export type VideoChargeUnitV2 = 'USD' | 'higgsfield_credit' | 'heygen_credit';
export interface VideoCreditQuote {
  amount: string; unit: VideoChargeUnitV2; source: string; asOf: string; expiresAt: string; upperBound: string | null;
}
export interface VideoSubscriptionRequest {
  tool: string; args: Record<string, unknown>; schemaDigest: string; quote: VideoCreditQuote;
}
export interface VideoAccessApprovalV2 {
  id: string; preflightId: string; draftId: string; version: number; access: VideoAccessV2;
  brief: any; settings: any; quote: VideoCreditQuote; expiresAt: string;
  accountGeneration: number | null; perJob: string | null; perMonth: string | null; remaining: string | null;
  providerBillingCap: false;
}
