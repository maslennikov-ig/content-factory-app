import type { VideoEstimateV1, VideoRouteV1, VideoSettingsV1 } from '@contentfactory/nestjs-libraries/videos/video-provider.v1';

export type { VideoRouteV1, VideoSettingsV1 };
export interface VideoBriefUiV1 {
  intent: string; audience: string; keyMessage: string; visualIntent: string;
  prompt: string; script: string; scriptPolicy: 'exact' | 'adaptable';
  sourceLocale?: string; outputLocale: string;
  facts: Array<{ text: string; sourceId: string; policy: 'must_include' | 'context_only' }>;
  avoidImplications: string[]; referenceMediaIds: string[];
}
export interface VideoDraftUiV1 {
  id: string; version: number; pieceId: string; pieceRevision: string;
  brief: VideoBriefUiV1; settings: VideoSettingsV1; preflightId?: string;
}
export interface VideoApprovalScopeV1 { draftId: string; version: number; preflightId: string; accessVersion?: 2 }
export function videoApprovalScopeV1(value: unknown): VideoApprovalScopeV1 | null {
  const row = value as Partial<VideoApprovalScopeV1> | null;
  return row && typeof row.draftId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.draftId) &&
    typeof row.preflightId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.preflightId) &&
    Number.isInteger(row.version) && (row.version as number) > 0
    ? {draftId: row.draftId, version: row.version as number, preflightId: row.preflightId} : null;
}
export interface VideoPreflightUiV1 {
  id: string; version: number; preflightId: string; estimate: VideoEstimateV1;
  payer: 'included' | 'workspace_key'; route: string; maxCostUsd: number;
}
export interface VideoJobUiV1 {
  id: string; draftId?: string; pieceId?: string; state: string; errorCode?: string;
  estimate?: VideoEstimateV1; costUsd?: number | null; createdAt?: string;
  canCancel?: boolean; result?: { id: string; path: string; name: string } | null;
  snapshot?: { settings?: VideoSettingsV1; brief?: VideoBriefUiV1 };
}
export interface VideoCatalogUiV1 {
  routes: VideoRouteV1[];
  settings?: unknown;
  assetsError?: string;
  assets?: { avatars?: Array<{ id: string; name: string; locales?: string[]; engines?: string[] }>; voices?: Array<{ id: string; name: string; locales?: string[]; engines?: string[] }>; engines?: string[] };
}
export const VIDEO_ACTIVE_STATES = new Set(['accepted', 'prepared', 'submitting', 'queued', 'running', 'provider_succeeded', 'saving', 'cancel_requested']);
export function videoWorkspacePath(params: { pieceId?: string; draftId?: string; jobId?: string } = {}): string {
  const query = new URLSearchParams({ video: '1' });
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `/media?${query}`;
}
export function videoSettingsForRoute(route: VideoRouteV1, locale: string): VideoSettingsV1 {
  return { provider: route.provider, model: route.model, mode: route.mode, locale,
    duration: route.durations.values?.[0] ?? route.durations.min,
    aspectRatio: route.aspectRatios[0] as VideoSettingsV1['aspectRatio'],
    resolution: route.resolutions[0], audio: route.mode === 'presenter', captions: false };
}
/** Editing any semantic field clears the quote. An expired/unknown quote never enables launch. */
export function videoCanLaunch(draft: VideoDraftUiV1 | null, preflight: VideoPreflightUiV1 | null, dirty: boolean, now = Date.now()): boolean {
  return !!draft && !!preflight && !dirty && draft.version === preflight.version &&
    draft.id === preflight.id && Number.isFinite(preflight.estimate.usd) &&
    (preflight.estimate.usd as number) >= 0 && Number.isFinite(preflight.maxCostUsd) &&
    preflight.maxCostUsd > 0 && (preflight.estimate.usd as number) <= preflight.maxCostUsd &&
    Date.parse(preflight.estimate.expiresAt) > now;
}
export function videoPendingKey(orgId: string, draftId: string): string { return `cf-video-intent-v1:${orgId}:${draftId}`; }
export interface VideoPendingIntentV1 { draftId: string; version: number; preflightId: string; intentId: string }
/** A retry reuses the whole authorized request, including the logical intent. */
export function videoLaunchIntent(draft: VideoDraftUiV1, preflight: VideoPreflightUiV1, intentId: string): VideoPendingIntentV1 {
  return { draftId: draft.id, version: draft.version, preflightId: preflight.preflightId, intentId };
}
export function videoErrorCode(value: unknown): string {
  if (value && typeof value === 'object') {
    const code = (value as { code?: unknown; message?: unknown }).code ?? (value as { message?: unknown }).message;
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(code)) return code;
  }
  return 'VIDEO_REQUEST_FAILED';
}

/** Download through the authenticated tenant door; never fetch a result/provider URL. */
export async function downloadOwnedVideoV1(request: (path: string) => Promise<Response>, jobId: string, filename: string): Promise<void> {
  const response = await request(`/media/video-jobs/${encodeURIComponent(jobId)}/download`);
  if (!response.ok) throw new Error('VIDEO_DOWNLOAD_FAILED');
  const blob = await response.blob();
  if (!blob.size || !blob.type.toLowerCase().startsWith('video/')) throw new Error('VIDEO_DOWNLOAD_FAILED');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.hidden = true;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
