import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';

/** Authenticated HeyGen input schemas reviewed on 7 November 2026. */
export const HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1 = {
  get_current_user: 'aa062cb3306408324a08e89c315b11ef294c8951c3fcb0de564c8824e9c3ca35',
  // 7 November: added optional HeyGen Voice engine settings. Our frozen request
  // does not select engine_settings; existing Avatar IV arguments are unchanged.
  create_video_from_avatar: '2015c7812357ed599e78df072aed1137df6532e5fa7683322f357bceb84fb55a',
  get_video: 'cbfd3cc767e998afa98e3f4cd22d0c815710d39a9fd56a52455bf112432b7ecb',
} as const;
export const HEYGEN_AVATAR_NATIVE_SCHEMA_V1 = subscriptionHash(HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1);
export const HEYGEN_AVATAR_NATIVE_KIND_V1 = 'heygen-personal-avatar/v1' as const;

const privateId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const script = z.string().min(1).max(1200).refine(value => value.trim().length > 0 &&
  value.trim().split(/\s+/u).length <= 100 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value));
const title = z.string().min(1).max(120).refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value));
const locale = z.enum(['en-US', 'ru-RU']);
const input = z.object({avatarId: privateId, voiceId: privateId, script, locale,
  resolution: z.literal('720p'), aspectRatio: z.literal('9:16'), engine: z.literal('avatar_iv'),
  captions: z.boolean(), title: title.optional()}).strict();
const wire = z.object({avatarId: privateId, voiceId: privateId, script,
  resolution: z.literal('720p'), aspectRatio: z.literal('9:16'), engine: z.object({type: z.literal('avatar_iv')}).strict(),
  voiceSettings: z.object({locale}).strict(), outputFormat: z.literal('mp4'),
  caption: z.object({file_format: z.literal('srt'), style: z.literal('default')}).strict().optional(), title: title.optional()}).strict();
export type HeygenAvatarInputV1 = z.infer<typeof input>;
export type HeygenAvatarWireArgsV1 = z.infer<typeof wire>;
export interface HeygenAccountV1 {
  subjectDigest: string; billingType: 'subscription'; plan: string; remaining: string; resetAt: string | null;
}
export interface HeygenAvatarHooksV1 {
  beforeDispatch: () => Promise<void>;
  /** Bounded HTTP body captured before SDK/receipt decoding; keep this private. */
  afterResponse: (raw: Record<string, unknown>) => Promise<void>;
}
export interface HeygenVideoStatusV1 {
  jobId: string; state: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  url?: string; subtitleUrl?: string; subtitleError?: 'VIDEO_PROVIDER_SUBTITLE_INVALID'; actualCost: null; durationSeconds?: number;
}

/** Preserve every reviewed script byte; never accept arbitrary URLs, callbacks or tuning. */
export function heygenAvatarArgsV1(raw: unknown): HeygenAvatarWireArgsV1 {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
  const value = parsed.data;
  return {avatarId: value.avatarId, voiceId: value.voiceId, script: value.script,
    resolution: value.resolution, aspectRatio: value.aspectRatio, engine: {type: value.engine},
    voiceSettings: {locale: value.locale}, outputFormat: 'mp4',
    ...(value.captions ? {caption: {file_format: 'srt' as const, style: 'default' as const}} : {}),
    ...(value.title ? {title: value.title} : {})};
}
export function heygenAvatarWireArgsV1(raw: unknown): HeygenAvatarWireArgsV1 {
  const parsed = wire.safeParse(raw);
  return parsed.success ? parsed.data : videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
}
function object(raw: unknown): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  return raw as Record<string, any>;
}
function value(raw: unknown) {
  const envelope = object(raw);
  if (envelope.error != null || envelope.success === false || envelope.isError === true) return videoErrorV1('VIDEO_PROVIDER_TOOL_ERROR', 409);
  return envelope;
}
export function decodeHeygenAccountV1(raw: unknown, issuer: string): HeygenAccountV1 {
  const account = value(raw), secret = process.env.JWT_SECRET;
  if (!secret || typeof account.username !== 'string' || !/^[a-f0-9]{32}$/i.test(account.username) ||
    account.billing_type !== 'subscription' || account.wallet !== null || account.usage_based !== null ||
    typeof account.subscription?.plan !== 'string' || !/^[a-z][a-z0-9_-]{0,59}$/.test(account.subscription.plan))
    return videoErrorV1('VIDEO_SUBSCRIPTION_BILLING_UNVERIFIED', 409);
  const credits = account.subscription?.credits?.premium_credits;
  const remaining = typeof credits?.remaining === 'number' && Number.isFinite(credits.remaining) ? String(credits.remaining) : credits?.remaining;
  if (typeof remaining !== 'string' || !/^\d{1,12}(?:\.\d{1,6})?$/.test(remaining)) return videoErrorV1('VIDEO_SUBSCRIPTION_BILLING_UNVERIFIED', 409);
  const reset = credits.resets_at;
  if (reset !== null && (typeof reset !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(reset) || !Number.isFinite(Date.parse(reset))))
    return videoErrorV1('VIDEO_SUBSCRIPTION_BILLING_UNVERIFIED', 409);
  return {subjectDigest: createHmac('sha256', secret).update(`heygen-personal-avatar-account:v1:${issuer}:${account.username.toLowerCase()}`).digest('hex'),
    billingType: 'subscription', plan: account.subscription.plan, remaining, resetAt: reset === null ? null : new Date(reset).toISOString()};
}

/** A raw capture is recovery evidence, never authorization to submit again. */
export function decodeHeygenAvatarReceiptV1(raw: unknown): {id: string} {
  let result = value(raw);
  if (result.kind === 'http') {
    if (typeof result.status !== 'number' || result.status < 200 || result.status >= 300 || typeof result.body !== 'string')
      return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
    try { result = object(JSON.parse(result.body)); }
    catch {
      // Streamable HTTP can return one JSON-RPC response in an SSE envelope.
      try {
        const replies = result.body.split(/\r?\n\r?\n/).map((event: string) => event.split(/\r?\n/)
          .filter((line: string) => line.startsWith('data:')).map((line: string) => line.slice(5).trimStart()).join('\n')).filter(Boolean)
          .map((data: string) => object(JSON.parse(data))).filter((reply: Record<string, any>) => reply.jsonrpc === '2.0' && (reply.result !== undefined || reply.error !== undefined));
        if (replies.length !== 1) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
        result = replies[0];
      } catch { return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409); }
    }
  }
  if (result.jsonrpc === '2.0') {
    if (result.error != null) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
    result = value(result.result);
  }
  if (result.content !== undefined || result.structuredContent !== undefined) {
    if (result.isError === true) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
    if (result.structuredContent) result = value(result.structuredContent);
    else {
      if (!Array.isArray(result.content) || result.content.length !== 1 || result.content[0]?.type !== 'text') return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
      try { result = value(JSON.parse(result.content[0].text)); } catch { return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409); }
    }
  }
  result = value(result);
  // Accept only explicit provider receipt keys; disagreement is an uncertain result.
  const id = result.id ?? result.video_id;
  if (!privateId.safeParse(id).success || result.id !== undefined && result.video_id !== undefined && result.id !== result.video_id)
    return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
  return {id};
}
/** One observed explicit non-retryable business rejection. All other lost/ambiguous replies remain uncertain. */
export function decodeHeygenAvatarRejectionV1(raw: unknown): {code: 'VIDEO_OWNED_VOICE_UNUSABLE'; providerCode: 'voice_not_usable'; retryable: false} | null {
  try {
    let reply = object(raw);
    if (reply.kind === 'http') {
      if (typeof reply.status !== 'number' || reply.status < 200 || reply.status >= 300 || typeof reply.body !== 'string') return null;
      reply = object(JSON.parse(reply.body));
    }
    if (reply.jsonrpc === '2.0') {
      if (reply.error != null) return null;
      reply = object(reply.result);
    }
    if (reply.isError !== true || Object.keys(reply).some(key => !['isError', 'content', 'structuredContent'].includes(key)) ||
      !Array.isArray(reply.content) || reply.content.length !== 1 || reply.content[0]?.type !== 'text') return null;
    const text = object(JSON.parse(reply.content[0].text));
    const result = reply.structuredContent === undefined ? text : object(reply.structuredContent);
    if (subscriptionHash(text) !== subscriptionHash(result) || result.error !== true || result.status_code !== 403 || result.retryable !== false ||
      result.error_code !== 'voice_not_usable' || Object.keys(result).some(key => !['error', 'message', 'status_code', 'retryable', 'error_code', 'doc_url'].includes(key))) return null;
    return {code: 'VIDEO_OWNED_VOICE_UNUSABLE', providerCode: 'voice_not_usable', retryable: false};
  } catch { return null; }
}
export function decodeHeygenVideoV1(raw: unknown, expectedId: string): HeygenVideoStatusV1 {
  const result = value(raw);
  if (!privateId.safeParse(expectedId).success || result.id !== expectedId) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_MISMATCH', 409);
  const statuses = {queued: 'queued', pending: 'queued', processing: 'running', running: 'running', completed: 'completed', failed: 'failed', canceled: 'canceled'} as const;
  const state = typeof result.status === 'string' && Object.prototype.hasOwnProperty.call(statuses, result.status)
    ? statuses[result.status as keyof typeof statuses] : undefined;
  if (!state || result.failure_code != null && state !== 'failed' || result.failure_message != null && state !== 'failed')
    return videoErrorV1('VIDEO_PROVIDER_STATUS_INVALID', 409);
  let url: string | undefined;
  let subtitleUrl: string | undefined;
  let subtitleError: HeygenVideoStatusV1['subtitleError'];
  if (state === 'completed') {
    try {
      if (typeof result.video_url !== 'string' || result.video_url.length > 8192) throw new Error();
      const parsed = new URL(result.video_url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error();
      url = result.video_url;
    } catch { return videoErrorV1('VIDEO_PROVIDER_RESULT_MISSING', 409); }
    if (result.subtitle_url != null) {
      try {
        if (typeof result.subtitle_url !== 'string' || result.subtitle_url.length > 8192) throw new Error();
        const parsed = new URL(result.subtitle_url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error();
        subtitleUrl = result.subtitle_url;
      } catch { subtitleError = 'VIDEO_PROVIDER_SUBTITLE_INVALID'; }
    }
  }
  return {jobId: expectedId, state, ...(url ? {url} : {}), ...(subtitleUrl ? {subtitleUrl} : {}), ...(subtitleError ? {subtitleError} : {}), actualCost: null,
    ...(state === 'completed' && typeof result.duration === 'number' && Number.isFinite(result.duration) && result.duration > 0 ? {durationSeconds: result.duration} : {})};
}
