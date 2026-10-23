import { Injectable } from '@nestjs/common';
import { VideoMcpClient, VideoTokenGuard } from '../subscriptions/video-mcp-client';
import { SubscriptionEndpoint, VideoSubscriptionRuntime } from '../subscriptions/video-provider-registry';
import { VideoSubscriptionRequest } from '../video-access.v2';
import { creditDecimal } from '../subscriptions/video-connection.service';
import { videoErrorV1 } from '../video-brief.v1';
import type { VideoSettingsV1 } from '../video-provider.v1';

/** Bounded MCP adapter. Production requires an explicitly reviewed live schema digest. */
@Injectable()
export class HiggsfieldSubscriptionProvider {
  constructor(readonly mcp: VideoMcpClient, readonly runtime: VideoSubscriptionRuntime) {}
  async prepare(def: SubscriptionEndpoint, token: string, settings: VideoSettingsV1, brief: any, references: Array<{id: string; url: string}>, assertUsable?: VideoTokenGuard) {
    const capability = await this.mcp.capabilities(def, token, assertUsable);
    if (settings.mode !== 'clip' || !['wan-3.0', 'kling-3.0'].includes(settings.model) || settings.audio || settings.captions ||
      !['720p', '1080p'].includes(settings.resolution || '') || ![5, 10].includes(settings.duration) || !['9:16', '16:9'].includes(settings.aspectRatio) || references.length > 1) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
    if (!capability.tools.some(t => t.name === 'generate_clip') || !capability.tools.some(t => t.name === 'jobs_wait')) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
    const args = {model: settings.model, prompt: brief.prompt, duration: settings.duration, aspect_ratio: settings.aspectRatio,
      resolution: settings.resolution, locale: settings.locale, audio: false, ...(references.length ? {image_url: references[0].url} : {})};
    const quote = await this.mcp.call(def, token, 'generate_clip', {...args, get_cost: true}, assertUsable);
    if (quote.job_id || quote.request_id || quote.unit !== 'higgsfield_credit' || quote.kind !== 'quote' || typeof quote.credits !== 'string') return videoErrorV1('VIDEO_PRICE_UNAVAILABLE', 409);
    creditDecimal(quote.credits);
    const expires = Math.min(Date.parse(quote.expires_at), this.runtime.now().getTime() + 300_000);
    if (!Number.isFinite(expires) || expires <= this.runtime.now().getTime()) return videoErrorV1('VIDEO_PRICE_UNAVAILABLE', 409);
    if (quote.upper_bound !== undefined && quote.upper_bound !== null) creditDecimal(quote.upper_bound);
    return {tool: 'generate_clip', args: {...args, get_cost: false}, schemaDigest: capability.digest,
      quote: {amount: quote.credits, unit: 'higgsfield_credit', source: 'provider_quote', asOf: this.runtime.now().toISOString(), expiresAt: new Date(expires).toISOString(), upperBound: quote.upper_bound ?? null}} as VideoSubscriptionRequest;
  }
  async submit(def: SubscriptionEndpoint, token: string, request: VideoSubscriptionRequest, assertUsable?: VideoTokenGuard) {
    const result = await this.mcp.call(def, token, request.tool, request.args, assertUsable);
    if (typeof result.job_id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(result.job_id)) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID');
    return {id: result.job_id};
  }
  async poll(def: SubscriptionEndpoint, token: string, receipt: any, assertUsable?: VideoTokenGuard) {
    return normalizeSubscriptionStatus(await this.mcp.call(def, token, 'jobs_wait', {job_id: receipt.id, timeout_seconds: 1}, assertUsable), 'higgsfield_credit');
  }
}

export function normalizeSubscriptionStatus(result: any, unit: string) {
  const value = result.data ?? result;
  if (!['queued', 'running', 'completed', 'failed', 'canceled'].includes(value.status)) return videoErrorV1('VIDEO_PROVIDER_STATUS_INVALID');
  if (value.status === 'completed' && typeof value.video_url !== 'string') return videoErrorV1('VIDEO_PROVIDER_RESULT_MISSING');
  let cost: string | null = null;
  if (value.charge?.unit === unit && value.charge?.job_id === value.job_id && typeof value.job_id === 'string' && typeof value.charge?.amount === 'string') {
    creditDecimal(value.charge.amount); cost = value.charge.amount;
  }
  return {state: value.status, url: value.video_url ?? null, actualCost: cost, jobId: value.job_id};
}
