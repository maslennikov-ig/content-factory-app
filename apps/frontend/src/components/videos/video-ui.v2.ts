import type { VideoAccessApprovalV2, VideoAccessV2, VideoChargeUnitV2, VideoCreditQuote } from '@contentfactory/nestjs-libraries/videos/video-access.v2';
import type { VideoBriefUiV1, VideoDraftUiV1, VideoJobUiV1, VideoSettingsV1 } from './video-ui.v1';

export type { VideoAccessV2, VideoChargeUnitV2, VideoCreditQuote };
export type VideoApprovalUiV2 = Omit<VideoAccessApprovalV2, 'brief' | 'settings'> & { brief: VideoBriefUiV1; settings: VideoSettingsV1 };
export interface VideoConnectionUiV2 {
  id: string; provider: 'higgsfield' | 'heygen'; state: string; generation: number;
  unit: VideoChargeUnitV2; perJob: string | null; perMonth: string | null; workspaceGranted: boolean; balance: null; walletVerified?: boolean;
}
export interface VideoAccessChoicesUiV2 {
  workspaceEnabled: boolean;
  providers: Array<{ provider: 'higgsfield' | 'heygen'; enabled: boolean; trial: boolean; connectReady?: boolean; generationReady?: boolean; blockers?: string[] }>;
  connections: VideoConnectionUiV2[];
}
export interface VideoPersonalReadinessUi {
  connectionId: string; provider: 'higgsfield' | 'heygen'; accountGeneration: number; walletVerified: boolean; unit: VideoChargeUnitV2;
  schema: {digest: string | null; reviewed: boolean}; operations: Array<{kind: string; ready: boolean; blockers: string[]}>;
}
export interface VideoPersonalAssetsUi {
  status: 'ready' | 'needs_owned_assets' | 'discovery_required' | 'unavailable'; blockers: string[]; guidance: {avatar: {url: 'https://app.heygen.com/'; requiresConsent: true}; voice: {url: 'https://app.heygen.com/'; requiresConsent: true}} | null; accountGeneration: number; ownedOnly: boolean;
  avatars: Array<{id: string; name: string; engines?: string[]; ownership: string; state: string}>;
  voices: Array<{id: string; name: string; ownership: string; state: string}>; engines?: string[];
}
export interface VideoJobUiV2 extends Omit<VideoJobUiV1, 'estimate'> {
  access?: {kind: 'api'; payer?: 'included' | 'workspace_key'} | {kind: 'subscription'; connectionId?: string; label?: string} | {kind: 'manual'};
  quote?: VideoCreditQuote;
  cost?: {amount: string | null; unit: VideoChargeUnitV2 | null; certainty: string};
  reserved?: string;
}
export interface VideoPendingIntentV2 {
  draftId: string; version: number; preflightId: string; intentId: string;
  accessVersion: 1 | 2; access?: VideoAccessV2;
}
export const VIDEO_UNRESOLVED_STATES_V2 = new Set(['uncertain', 'submission_unknown', 'reauth_required', 'status_delayed']);
export const videoActorKeyV2 = (org: string, actor: string) => `cf-video-access-v2:${org}:${actor}`;
export const videoPendingKeyV2 = (org: string, actor: string, draft: string) => `cf-video-intent-v2:${org}:${actor}:${draft}`;
export function videoSameAccessV2(a: VideoAccessV2 | null | undefined, b: VideoAccessV2 | null | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && (a.kind === 'subscription' && b.kind === 'subscription' ? a.connectionId === b.connectionId : a.kind === 'api' && b.kind === 'api' ? a.payer === b.payer : a.kind === 'manual' && b.kind === 'manual' ? a.provider === b.provider : false);
}
export function videoDecimalValidV2(value: unknown, positive = false): value is string {
  return typeof value === 'string' && /^\d{1,12}(?:\.\d{1,6})?$/.test(value) && (!positive || /[1-9]/.test(value));
}
export function videoApprovalCurrentV2(approval: VideoApprovalUiV2 | null | undefined, now = Date.now()): boolean {
  return !!approval && videoDecimalValidV2(approval.quote.amount) && Date.parse(approval.expiresAt) > now && Date.parse(approval.quote.expiresAt) > now;
}
export function videoCanLaunchV2(draft: VideoDraftUiV1 | null, approval: VideoApprovalUiV2 | null, access: VideoAccessV2 | null, dirty: boolean): boolean {
  return !!draft && !!approval && !dirty && draft.id === approval.draftId && draft.version === approval.version && videoSameAccessV2(access, approval.access) && videoApprovalCurrentV2(approval);
}
export function videoManualTextV2(brief: VideoBriefUiV1, settings: VideoSettingsV1): string {
  return [brief.prompt, brief.script, JSON.stringify({settings, facts: brief.facts, avoidImplications: brief.avoidImplications, referenceMediaIds: brief.referenceMediaIds, scriptPolicy: brief.scriptPolicy}, null, 2)].filter(Boolean).join('\n\n');
}
export const VIDEO_PROVIDER_SITES_V2 = {higgsfield: 'https://higgsfield.ai/', heygen: 'https://app.heygen.com/'} as const;

/** Every result, including retained V1 API files, uses the owned facade door. */
export async function downloadOwnedVideoV2(request: (path: string) => Promise<Response>, jobId: string, filename: string): Promise<void> {
  const response = await request(`/media/video-v2/jobs/${encodeURIComponent(jobId)}/download`);
  if (!response.ok) throw new Error('VIDEO_DOWNLOAD_FAILED');
  const blob = await response.blob();
  if (!blob.size || !blob.type.toLowerCase().startsWith('video/')) throw new Error('VIDEO_DOWNLOAD_FAILED');
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; link.hidden = true; document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
