import { Injectable } from '@nestjs/common';
import { VideoMcpClient, VideoTokenGuard } from '../subscriptions/video-mcp-client';
import { VideoSubscriptionRuntime, SubscriptionEndpoint } from '../subscriptions/video-provider-registry';
import { creditDecimal } from '../subscriptions/video-connection.service';
import { normalizeSubscriptionStatus } from './higgsfield-subscription.provider';
import { VideoSubscriptionRequest } from '../video-access.v2';
import type { VideoSettingsV1 } from '../video-provider.v1';
import { videoErrorV1 } from '../video-brief.v1';

@Injectable()
export class HeygenSubscriptionProvider {
  constructor(readonly mcp: VideoMcpClient, readonly runtime: VideoSubscriptionRuntime) {}
  async prepare(def: SubscriptionEndpoint, token: string, settings: VideoSettingsV1, brief: any, references: unknown[], assertUsable?: VideoTokenGuard) {
    const capability = await this.mcp.capabilities(def, token, assertUsable);
    if (settings.mode !== 'presenter' || settings.model !== 'heygen-avatar' || !['avatar_iii', 'avatar_iv'].includes(settings.engine || '') ||
      !settings.avatarId || !settings.voiceId || !settings.audio || references.length || brief.scriptPolicy !== 'exact' ||
      !['720p', '1080p'].includes(settings.resolution || '') || !['9:16', '16:9', '1:1'].includes(settings.aspectRatio)) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
    for (const name of ['create_video', 'get_video', 'quote_video', 'list_avatars', 'list_voices']) if (!capability.tools.some(t => t.name === name)) return videoErrorV1(name === 'quote_video' ? 'VIDEO_PRICE_UNAVAILABLE' : 'VIDEO_TOOL_UNAVAILABLE', 409);
    const avatars = await this.mcp.call(def, token, 'list_avatars', {}, assertUsable);
    const voices = await this.mcp.call(def, token, 'list_voices', {}, assertUsable);
    if (avatars.eligibility !== 'small_trial' || voices.eligibility !== 'small_trial') return videoErrorV1('VIDEO_SUBSCRIPTION_TRIAL_UNVERIFIED', 409);
    if (!Array.isArray(avatars.avatars) || !avatars.avatars.some((a: any) => a.id === settings.avatarId && a.engines?.includes(settings.engine)) ||
      !Array.isArray(voices.voices) || !voices.voices.some((v: any) => v.id === settings.voiceId && v.engines?.includes(settings.engine) && v.locales?.includes(settings.locale))) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
    // Preserve the exact reviewed string, including numbers, negations and locale.
    const args = {script: brief.script, engine: settings.engine, avatar_id: settings.avatarId, voice_id: settings.voiceId,
      locale: settings.locale, aspect_ratio: settings.aspectRatio, resolution: settings.resolution, captions: settings.captions};
    const quote = await this.mcp.call(def, token, 'quote_video', args, assertUsable);
    if (quote.job_id || quote.kind !== 'quote' || quote.unit !== 'heygen_credit' || typeof quote.credits !== 'string') return videoErrorV1('VIDEO_PRICE_UNAVAILABLE', 409);
    creditDecimal(quote.credits);
    const expires = Math.min(Date.parse(quote.expires_at), this.runtime.now().getTime() + 300_000);
    if (!Number.isFinite(expires) || expires <= this.runtime.now().getTime()) return videoErrorV1('VIDEO_PRICE_UNAVAILABLE', 409);
    if (quote.upper_bound !== undefined && quote.upper_bound !== null) creditDecimal(quote.upper_bound);
    return {tool: 'create_video', args, schemaDigest: capability.digest,
      quote: {amount: quote.credits, unit: 'heygen_credit', source: 'provider_quote', asOf: this.runtime.now().toISOString(), expiresAt: new Date(expires).toISOString(), upperBound: quote.upper_bound ?? null}} as VideoSubscriptionRequest;
  }
  async submit(def: SubscriptionEndpoint, token: string, request: VideoSubscriptionRequest, assertUsable?: VideoTokenGuard) {
    const result = await this.mcp.call(def, token, 'create_video', request.args, assertUsable);
    const id = (result.data ?? result).video_id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID');
    return {id};
  }
  async poll(def: SubscriptionEndpoint, token: string, receipt: any, assertUsable?: VideoTokenGuard) {
    return normalizeSubscriptionStatus(await this.mcp.call(def, token, 'get_video', {video_id: receipt.id}, assertUsable), 'heygen_credit');
  }
}
