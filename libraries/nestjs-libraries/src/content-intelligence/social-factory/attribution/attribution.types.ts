import type { SocialPlatformV1, MaterialFormatV1, PlatformCapabilityV1 } from '../contracts/social-factory.v1';
export type CtaSurfaceV1 = PlatformCapabilityV1['links'][number];
export interface AttributionLinkV1 {
  version: 1; id: string; channelId: string; campaignId: string; itemId?: string;
  platform: SocialPlatformV1; format?: MaterialFormatV1; surface: CtaSurfaceV1;
  level: 'post' | 'campaign' | 'account'; targetUrl: string; trackingUrl: string;
  createdAt: string; expiresAt: string;
  placement: 'pending_verification' | 'verified_publication' | 'manual_account_placement';
  shortening?: { state: 'pending' | 'ready' | 'uncertain'; taggedUrl: string };
  clickAvailability: 'configured' | 'unavailable';
}
export interface ClaimedLeadLinkV1 {
  version: 1; id: string; linkId: string; leadId: string;
  evidenceRef: string; assertedBy: string; assertedAt: string;
  confidence: 'owner_reported'; level: AttributionLinkV1['level'];
  note: string;
}
