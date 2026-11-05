import type { VideoSubscriptionRequest } from '../video-access.v2';
import type { VideoProductionRevisionV1 } from './video-production.v1';
import type {
  PersonalProductionCreditLimitV2, PersonalProductionCreditUnitV2,
  PersonalProductionManifestV2,
} from './video-production.personal.v2';

export type PersonalProductionOperationV2 = 'presenter' | 'generated_clip' | 'narration' | 'captions' | 'final_composition';

/** Internal server snapshot. Wallet and request data never enter approval UI. */
export interface PersonalProductionPreparationV2 {
  connectionId: string;
  provider: 'heygen' | 'higgsfield';
  accountGeneration: number;
  operation: PersonalProductionOperationV2;
  walletDigest: string;
  unit: PersonalProductionCreditUnitV2;
  perJob: string;
  perMonth: string;
  request: VideoSubscriptionRequest;
}

export interface PersonalProductionScenePlanV2 {
  sceneId: string;
  key: string;
  kind: 'asset' | 'generation';
  reused: boolean;
  mediaId?: string;
  audioMediaId?: string;
  jobId?: string;
  preparation?: PersonalProductionPreparationV2;
}

export interface PersonalProductionApprovalV2 {
  version: 2;
  kind: 'personal_subscription';
  id: string;
  actorId: string;
  manifestDigest: string;
  expiresAt: string;
  creditLimits: PersonalProductionCreditLimitV2[];
  scenes: PersonalProductionScenePlanV2[];
  final: {
    provider?: 'heygen' | 'higgsfield'; connectionId?: string; jobId: string; preparation?: PersonalProductionPreparationV2;
    /** Server-frozen full ready request, independent of the original quote. */
    readyRequestDigest?: string;
  };
  blockers: string[];
  acceptedAt?: string;
}

export interface PersonalProductionJobCreateV2 {
  id: string;
  intentId: string;
  state: 'accepted' | 'awaiting_assets';
  preparation: PersonalProductionPreparationV2;
  snapshot: Record<string, unknown>;
}

export type PersonalProductionRevisionV2 = Omit<VideoProductionRevisionV1, 'manifest' | 'approval'> & {
  manifest: PersonalProductionManifestV2;
  approval: PersonalProductionApprovalV2 | null;
};
