import type { PersonalVideoOperation, SubscriptionProvider } from './subscriptions/video-provider-registry';
import type { VideoSubscriptionRequest, VideoChargeUnitV2 } from './video-access.v2';
import type { VideoSettingsV1 } from './video-provider.v1';
import type { VideoProductionManifestV1 } from './production/video-production.v1';
import type { HeygenOwnedCatalogV1 } from './subscriptions/video-heygen-owned-catalog.v1';

/** Public, credential-free inspection contracts. No provider text/claims enter UI. */
export interface VideoPersonalAssetV1 {
  id: string; name: string; ownership: 'owned'; state: 'available'; engines: string[]; locales: string[];
}
export interface VideoPersonalAssetsV1 {
  avatars: VideoPersonalAssetV1[]; voices: VideoPersonalAssetV1[]; engines: string[];
  status: 'ready' | 'catalog_only' | 'needs_owned_assets' | 'discovery_required' | 'unavailable';
  blockers: string[]; ownedOnly: true; accountGeneration: number;
  /** Account-visible private assets are readable before wallet/render qualification. */
  catalog?: HeygenOwnedCatalogV1;
  guidance: {
    avatar: {url: 'https://app.heygen.com/'; requiresConsent: true};
    voice: {url: 'https://app.heygen.com/'; requiresConsent: true};
  } | null;
}
export interface VideoPersonalReadinessV1 {
  connectionId: string; provider: SubscriptionProvider; accountGeneration: number;
  walletVerified: boolean; unit: VideoChargeUnitV2;
  schema: {digest: string | null; reviewed: boolean; observedToolNames: string[]};
  operations: Array<{kind: PersonalVideoOperation; ready: boolean; blockers: string[]}>;
  /** Separate bounded native profile; does not qualify the legacy general renderer. */
  nativeAvatarPreflightAvailable?: boolean;
}
/** Private operator evidence. Raw provider schemas must never be forwarded to chat/model context. */
export interface VideoPersonalQualificationV1 {
  version: 1; purpose: 'schema_qualification'; capturedAt: string;
  connectionId: string; provider: SubscriptionProvider; resource: string; accountGeneration: number;
  walletVerified: boolean;
  schema: {
    digest: string; reviewed: boolean; complete: true; truncated: false;
    provenance: 'authenticated_mcp_tools_list'; untrusted: true;
    inventory: Array<{name: string; inputSchema: Record<string, unknown>; outputSchema?: Record<string, unknown>}>;
  };
}
export interface VideoPersonalProductionPayloadV1 {
  version: 1; intentId: string; stage: 'quote' | 'ready_assets';
  manifest: VideoProductionManifestV1; manifestDigest: string;
  /** Actual owned, measured scene results in manifest order; absent during quote. */
  resolvedScenes?: Array<{sceneId: string; mediaId: string; audioMediaId?: string; durationSeconds: number; sourceCaptions?: 'burned' | 'none'}>;
  sceneId?: string; finalMediaId?: string;
}
export type VideoPersonalOperationInputV1 = {
  connectionId: string; operation: 'presenter' | 'generated_clip'; settings: VideoSettingsV1;
  brief: unknown; references: string[];
} | {
  connectionId: string; operation: 'narration' | 'captions' | 'final_composition';
  production: VideoPersonalProductionPayloadV1;
};
export interface VideoPersonalOperationPreparationV1 {
  connectionId: string; provider: SubscriptionProvider; accountGeneration: number;
  operation: PersonalVideoOperation; request: VideoSubscriptionRequest;
}
