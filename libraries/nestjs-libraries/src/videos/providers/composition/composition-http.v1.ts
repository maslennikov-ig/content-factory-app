import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { VideoCredentialV1, VideoProviderErrorV1 } from '../../video-provider.v1';
import { credentialV1, failV1, onlyKeysV1 } from '../provider-http.v1';
import { CompositionInputV1, CompositionPreparedRequestV1, CompositionReceiptV1, CompositionRouteV1 } from './composition-provider.v1';

export const COMPOSITION_BASE_V1 = 'https://api.heygen.com';
export const COMPOSITION_TIMEOUT_MS_V1 = 30_000;
export const COMPOSITION_MAX_JSON_BYTES_V1 = 1024 * 1024;
export function compositionHashV1(value: unknown): string {
  // JSONB may reorder object keys on persistence; arrays retain their approved scene order.
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
/** Only public HTTPS media. Provider fetches the resource; no arbitrary local network targets. */
export function compositionUrlV1(value: unknown): string {
  try {
    if (typeof value !== 'string' || value.length > 8192) throw Error();
    const u = new URL(value); const h = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || (u.port && u.port !== '443') ||
      isIP(h.replace(/^\[|\]$/g, '')) || !h.includes('.') || h.endsWith('.') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(h)) throw Error();
    return u.href;
  } catch { return failV1('video_composition_invalid_url'); }
}
export function compositionCredentialV1(c: VideoCredentialV1, spending = false): void {
  credentialV1(c, 'heygen');
  if (!['included', 'workspace_key'].includes(c.payer) || typeof c.reference !== 'string' || !c.reference.trim() || c.reference.length > 255 ||
    !Number.isFinite(c.maxCostUsd) || c.maxCostUsd < 0 || !Number.isFinite(c.monthlyBudgetUsd) || c.monthlyBudgetUsd < 0 ||
    (spending && (c.maxCostUsd === 0 || c.monthlyBudgetUsd === 0))) failV1('video_composition_invalid_funding');
}
export function compositionIdentityV1(value: CompositionPreparedRequestV1 | CompositionReceiptV1, route: CompositionRouteV1, c: VideoCredentialV1, spending = false): void {
  compositionCredentialV1(c, spending);
  if (value?.version !== 1 || value.route !== route || value.credentialReference !== c.reference || value.payer !== c.payer || typeof value.captions !== 'boolean') failV1('video_composition_route_or_payer_changed');
}
export function validateCompositionInputV1(input: CompositionInputV1, route: CompositionRouteV1): void {
  onlyKeysV1(input as unknown as Record<string, unknown>, ['route', 'intentKey', 'title', 'locale', 'durationSeconds', 'aspectRatio', 'resolution', 'audio', 'captions', 'approvedScript', 'scenes']);
  if (input?.route !== route || !/^[A-Za-z0-9_:.-]{1,255}$/.test(input.intentKey)) failV1('video_composition_invalid_route_or_intent');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500 || typeof input.approvedScript !== 'string') failV1('video_composition_invalid_text');
  if (!['16:9', '9:16', '1:1'].includes(input.aspectRatio) || !['720p', '1080p'].includes(input.resolution) || typeof input.audio !== 'boolean' || typeof input.captions !== 'boolean') failV1('video_composition_unsupported_settings');
  if (!Array.isArray(input.scenes) || input.scenes.length < 1 || input.scenes.length > 50) failV1('video_composition_invalid_scenes');
  const ids = new Set<string>();
  for (const s of input.scenes) {
    onlyKeysV1(s as unknown as Record<string, unknown>, ['id', 'kind', 'durationSeconds', 'script', 'mediaUrl', 'retainSourceAudio', 'sourceCaptions', 'audioUrl', 'title', 'avatarId', 'voiceId', 'engine', 'playback', 'captionCues']);
    if ((s.retainSourceAudio !== undefined && typeof s.retainSourceAudio !== 'boolean') || (s.sourceCaptions !== undefined && s.sourceCaptions !== 'burned')) failV1('video_composition_invalid_scene');
    if (!s || typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(s.id) || ids.has(s.id) || !['presenter', 'image', 'video'].includes(s.kind) ||
      !Number.isFinite(s.durationSeconds) || s.durationSeconds <= 0 || s.durationSeconds > 600 || typeof s.script !== 'string' || s.script.length > 5000) failV1('video_composition_invalid_scene');
    ids.add(s.id);
  }
  const duration = input.scenes.reduce((n, s) => n + s.durationSeconds, 0);
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 600 || Math.abs(duration - input.durationSeconds) > 0.001) failV1('video_composition_invalid_duration');
  if (input.approvedScript !== input.scenes.map(s => s.script).join('\n\n')) failV1('video_composition_script_changed');
  if (!input.audio && input.scenes.some(s => s.script.trim() || s.audioUrl)) failV1('video_composition_speech_requires_audio');
  if (input.captions && (!input.audio || !input.scenes.some(s => s.script.trim()))) failV1('video_composition_captions_require_speech');
}
/** Bound reads even without Content-Length. No automatic retry or provider response text in errors. */
export async function compositionReadV1(response: Response, maxBytes: number): Promise<Uint8Array> {
  const stated = response.headers.get('content-length');
  if (stated && (!/^\d+$/.test(stated) || Number(stated) > maxBytes)) { await response.body?.cancel(); return failV1('video_composition_response_too_large'); }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return failV1('video_composition_response_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return bytes;
}
export async function compositionRequestV1(url: string, c: VideoCredentialV1, body?: Readonly<Record<string, unknown>>, key?: string): Promise<Record<string, any>> {
  const paid = body !== undefined;
  try {
    const response = await fetch(url, { method: paid ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(COMPOSITION_TIMEOUT_MS_V1),
      headers: { 'X-Api-Key': c.apiKey, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(paid ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      await response.body?.cancel();
      const uncertain = paid && (response.status === 408 || response.status === 409 || response.status >= 500);
      throw new VideoProviderErrorV1(`video_provider_http_${response.status}`, uncertain, !paid && (response.status === 429 || response.status >= 500 || response.status === 408));
    }
    const bytes = await compositionReadV1(response, COMPOSITION_MAX_JSON_BYTES_V1);
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value?.data || typeof value.data !== 'object' || Array.isArray(value.data)) throw Error();
    return value.data;
  } catch (e) {
    if (e instanceof VideoProviderErrorV1 && !(paid && e.code === 'video_composition_response_too_large')) throw e;
    throw new VideoProviderErrorV1('video_composition_provider_transport_or_response', paid, !paid);
  }
}
/** No auth is forwarded to presigned URLs; trusted host policy belongs to the media importer. */
export async function downloadCompositionFileV1(url: string, allowedHosts: readonly string[], maxBytes: number): Promise<Uint8Array> {
  const checked = compositionUrlV1(url);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1024 * 1024 * 1024 || !allowedHosts.includes(new URL(checked).hostname)) failV1('video_composition_download_policy');
  try {
    const response = await fetch(checked, { redirect: 'error', signal: AbortSignal.timeout(COMPOSITION_TIMEOUT_MS_V1) });
    if (!response.ok) { await response.body?.cancel(); failV1('video_composition_download_failed'); }
    const type = response.headers.get('content-type')?.split(';')[0].trim();
    if (type !== 'video/mp4' && type !== 'application/octet-stream') { await response.body?.cancel(); failV1('video_composition_download_type'); }
    const bytes = await compositionReadV1(response, maxBytes);
    if (bytes.byteLength < 12 || new TextDecoder().decode(bytes.slice(4, 8)) !== 'ftyp') failV1('video_composition_download_type');
    return bytes;
  } catch (e) { if (e instanceof VideoProviderErrorV1) throw e; return failV1('video_composition_download_failed'); }
}
