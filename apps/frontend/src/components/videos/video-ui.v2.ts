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
  catalog?: {scope: 'authenticated_private_account'; readOnly: true; renderQualified: false;
    avatars: Array<{id: string; name: string; ownership: string; state: string; engines: string[]; locales: string[]; selectableForDraft: boolean}>;
    voices: Array<{id: string; name: string; ownership: string; state: string; engines: string[]; locales: string[]; language?: string}>};
  status: 'ready' | 'catalog_only' | 'needs_owned_assets' | 'discovery_required' | 'unavailable'; blockers: string[]; guidance: {avatar: {url: 'https://app.heygen.com/'; requiresConsent: true}; voice: {url: 'https://app.heygen.com/'; requiresConsent: true}} | null; accountGeneration: number; ownedOnly: boolean;
  avatars: Array<{id: string; name: string; engines?: string[]; ownership: string; state: string}>;
  voices: Array<{id: string; name: string; ownership: string; state: string}>; engines?: string[];
}
export interface VideoJobUiV2 extends Omit<VideoJobUiV1, 'estimate'> {
  access?: {kind: 'api'; payer?: 'included' | 'workspace_key'} | {kind: 'subscription'; connectionId?: string; label?: string} | {kind: 'manual'};
  quote?: VideoCreditQuote;
  cost?: {amount: string | null; unit: VideoChargeUnitV2 | null; certainty: string};
  reserved?: string;
  actionRequired?: {kind: 'replace_owned_voice'; providerCode: 'voice_not_usable'; retryable: false};
  subtitles?: Array<{id: string; mediaId: string; name: string; path: string; mimeType: 'application/x-subrip' | 'text/vtt'}>;
}
export interface VideoPendingIntentV2 {
  draftId: string; version: number; preflightId: string; intentId: string;
  accessVersion: 1 | 2; access?: VideoAccessV2;
}
export const VIDEO_UNRESOLVED_STATES_V2 = new Set(['uncertain', 'submission_unknown', 'reauth_required', 'status_delayed']);
export const videoActorKeyV2 = (org: string, actor: string) => `cf-video-access-v2:${org}:${actor}`;
export const videoPendingKeyV2 = (org: string, actor: string, draft: string) => `cf-video-intent-v2:${org}:${actor}:${draft}`;
export function videoPresenterEngineOptionsV2(kind: VideoAccessV2['kind'] | undefined,
  assets: {avatars?: Array<{id: string; engines?: string[]}>; engines?: string[]} | undefined, avatarId: string | undefined): string[] {
  const selected = assets?.avatars?.find(avatar => avatar.id === avatarId)?.engines;
  // The personal saved-proposal route accepts III/IV only. An unselected look
  // never borrows capabilities from another private look or a global catalog.
  return kind === 'subscription' ? (selected ?? []).filter(engine => ['avatar_iii', 'avatar_iv'].includes(engine))
    : selected ?? assets?.engines ?? [];
}
export function videoSameAccessV2(a: VideoAccessV2 | null | undefined, b: VideoAccessV2 | null | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && (a.kind === 'subscription' && b.kind === 'subscription' ? a.connectionId === b.connectionId : a.kind === 'api' && b.kind === 'api' ? a.payer === b.payer : a.kind === 'manual' && b.kind === 'manual' ? a.provider === b.provider : false);
}
export function videoDecimalValidV2(value: unknown, positive = false): value is string {
  return typeof value === 'string' && /^\d{1,12}(?:\.\d{1,6})?$/.test(value) && (!positive || /[1-9]/.test(value));
}
export function videoApprovalCurrentV2(approval: VideoApprovalUiV2 | null | undefined, now = Date.now()): boolean {
  const s=approval?.settings,v=s?.heygenV2,inner=v?.settings,binding=v?.binding;
  const currentV2=!!s&&!!inner&&!!binding&&inner.version===2&&s.model==='heygen-avatar'&&s.mode==='presenter'&&s.audio===true&&
    approval?.access.kind==='subscription'&&binding.connectionId===approval.access.connectionId&&binding.accountGeneration===approval.accountGeneration&&
    Number.isInteger(binding.profileRevision)&&binding.profileRevision>0&&!!binding.profileId&&/^[a-f0-9]{64}$/.test(binding.profileDigest)&&
    s.avatarId===inner.appearanceLookId&&s.voiceId===inner.voiceId&&s.engine===inner.engine.type&&
    ['avatar_iii','avatar_iv','avatar_v'].includes(inner.engine.type)&&s.locale===inner.voiceSettings?.locale&&
    s.resolution===inner.resolution&&['720p','1080p','4k'].includes(inner.resolution)&&s.aspectRatio===inner.aspectRatio&&
    ['9:16','16:9','1:1','4:5','5:4','auto'].includes(inner.aspectRatio)&&s.duration===inner.durationSeconds&&
    inner.durationSeconds>=2&&inner.durationSeconds<=300&&s.captions===(inner.captions!=='none')&&inner.outputFormat==='mp4';
  const historicalV1=!v&&s?.engine==='avatar_iv'&&s.resolution==='720p'&&s.aspectRatio==='9:16'&&['en-US','ru-RU'].includes(s.locale);
  const native = approval?.unknownPrice === true && approval.billing === 'personal_subscription' && approval.maximumJobs === 1 &&
    approval.access.kind === 'subscription' && approval.settings.provider === 'heygen' && (historicalV1||currentV2) &&
    approval.quote.amount === null && approval.quote.unit === 'heygen_credit' && approval.quote.source === 'unavailable' &&
    approval.quote.upperBound === null && videoDecimalValidV2(approval.remaining, true) && !!approval.selection?.avatar && !!approval.selection.voice;
  return !!approval && (videoDecimalValidV2(approval.quote.amount) || native) && Date.parse(approval.expiresAt) > now && Date.parse(approval.quote.expiresAt) > now;
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

/** Fetch the persisted sidecar from the same actor-owned job, never a provider URL. */
export async function downloadOwnedVideoSubtitleV2(request: (path: string) => Promise<Response>, jobId: string, subtitleId: string, filename: string): Promise<void> {
  const response=await request(`/media/video-v2/jobs/${encodeURIComponent(jobId)}/subtitles/${encodeURIComponent(subtitleId)}/download`);
  if(!response.ok)throw new Error('VIDEO_DOWNLOAD_FAILED');
  const blob=await response.blob();
  if(!blob.size||!['application/x-subrip','text/vtt'].includes(blob.type.split(';')[0]))throw new Error('VIDEO_DOWNLOAD_FAILED');
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;link.hidden=true;document.body.appendChild(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
