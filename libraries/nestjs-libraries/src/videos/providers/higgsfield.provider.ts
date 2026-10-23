import { Injectable } from '@nestjs/common';
import {
  VideoCredentialV1, VideoPreparedRequestV1, VideoProviderErrorV1,
  VideoProviderInputV1, VideoProviderReceiptV1, VideoProviderStatusV1, VideoProviderV1, VideoRouteV1,
} from '../video-provider.v1';
import { credentialV1, deepFreezeV1, exactUrlV1, failV1, handleV1, httpsV1, localeV1, onlyKeysV1, requestV1 } from './provider-http.v1';

const BASE = 'https://api.higgsfield.ai';
const ROUTES = {
  'wan-3.0': '/alibaba/wan-3.0',
  'kling-3.0-standard': '/kling-video/v3.0/std',
  'kling-3.0-pro': '/kling-video/v3.0/pro',
};

export const HIGGSFIELD_ROUTES_V1: readonly VideoRouteV1[] = deepFreezeV1(
  Object.keys(ROUTES).map(model => ({
    provider: 'higgsfield' as const, model,
    label: model === 'wan-3.0' ? 'Wan 3.0' : `Kling 3.0 ${model.endsWith('pro') ? 'Pro' : 'Standard'}`,
    mode: 'clip' as const, durations: { min: model === 'wan-3.0' ? 2 : 3, max: model === 'wan-3.0' ? 30 : 15 },
    aspectRatios: ['9:16', '16:9', '1:1'], resolutions: model === 'wan-3.0' ? ['480p', '720p', '1080p'] : [],
    audio: true, captions: false, inputs: ['text', 'image'] as Array<'text' | 'image'>, evidence: 'documented' as const,
    price: { text: 'Exact account estimate required; public starting price is not a quote.', checkedAt: '2026-10-22', source: 'https://docs.higgsfield.ai/docs/concepts/billing-and-retention' },
  }))
);

@Injectable()
export class HiggsfieldProviderV1 implements VideoProviderV1 {
  readonly id = 'higgsfield' as const;
  readonly routes = HIGGSFIELD_ROUTES_V1;

  async prepare(input: VideoProviderInputV1, credential: VideoCredentialV1): Promise<VideoPreparedRequestV1> {
    credentialV1(credential, this.id);
    const s = input.settings;
    const route = this.routes.find(x => x.model === s.model);
    if (!route || s.provider !== this.id || s.mode !== 'clip') failV1('video_unsupported_route');
    localeV1(s.locale);
    if (!Number.isInteger(s.duration) || s.duration < route.durations.min || s.duration > route.durations.max) failV1('video_invalid_duration');
    if (!route.aspectRatios.includes(s.aspectRatio)) failV1('video_invalid_aspect_ratio');
    if (typeof s.audio !== 'boolean' || s.captions !== false) failV1('video_unsupported_audio_or_captions');
    if (s.avatarId || s.voiceId || s.engine || input.script) failV1('video_unsupported_clip_fields');
    if (!input.prompt?.trim() || (s.model !== 'wan-3.0' && input.prompt.length > 2500)) failV1('video_invalid_prompt');
    if (!Array.isArray(input.references) || input.references.length > 1) failV1('video_unsupported_references');
    const image = input.references[0];
    const wan = s.model === 'wan-3.0';
    if (wan ? !route.resolutions.includes(s.resolution || '') : Boolean(s.resolution)) failV1('video_invalid_resolution');
    if (image && !wan) {
      // Kling image endpoints have no aspect_ratio field: their source controls framing.
      const { width, height } = image as typeof image & { width?: number; height?: number };
      const [rw, rh] = s.aspectRatio.split(':').map(Number);
      if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || Math.abs(width / height - rw / rh) > 0.015) failV1('video_reference_aspect_mismatch');
    }
    const body: Record<string, unknown> = { prompt: input.prompt, duration: s.duration };
    if (wan) Object.assign(body, { resolution: s.resolution, aspect_ratio: s.aspectRatio, generate_audio: s.audio, enable_thinking: false });
    else Object.assign(body, { sound: s.audio ? 'on' : 'off', multi_shots: false, cfg_scale: 0.5, ...(!image ? { aspect_ratio: s.aspectRatio } : {}) });
    if (image) body.image_url = httpsV1(image.url);
    const endpoint = BASE + ROUTES[s.model as keyof typeof ROUTES] + (image ? '/image-to-video' : '/text-to-video');
    const quote = await requestV1(BASE + '/estimate' + endpoint.slice(BASE.length), this.headers(credential), 'POST', body);
    const usd = typeof quote.usd === 'string' || typeof quote.usd === 'number' ? Number(quote.usd) : NaN;
    if (!Number.isFinite(usd) || usd < 0 || quote.usd === '') failV1('video_invalid_estimate');
    return deepFreezeV1({ provider: this.id, endpoint, body, estimate: {
      usd, currency: 'USD', source: 'higgsfield_account_estimate', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    } });
  }

  async submit(request: VideoPreparedRequestV1, key: string, credential: VideoCredentialV1): Promise<VideoProviderReceiptV1> {
    credentialV1(credential, this.id);
    this.validate(request);
    if (!/^[\x21-\x7e]{1,255}$/.test(key)) failV1('video_invalid_idempotency_key');
    const data = await requestV1(request.endpoint, { ...this.headers(credential), 'Idempotency-Key': key }, 'POST', request.body, this.id);
    try {
      const id = handleV1(data.request_id);
      return { id, statusUrl: exactUrlV1(data.status_url, `${BASE}/requests/${id}/status`), cancelUrl: exactUrlV1(data.cancel_url, `${BASE}/requests/${id}/cancel`) };
    } catch { throw new VideoProviderErrorV1('video_invalid_submit_receipt', true, true); }
  }

  async poll(receipt: VideoProviderReceiptV1, credential: VideoCredentialV1): Promise<VideoProviderStatusV1> {
    credentialV1(credential, this.id);
    const id = handleV1(receipt.id);
    const url = exactUrlV1(receipt.statusUrl, `${BASE}/requests/${id}/status`);
    const data = await requestV1(url, this.headers(credential));
    if (data.request_id !== id) failV1('video_receipt_mismatch');
    switch (data.status) {
      case 'queued': return { state: 'queued' };
      case 'in_progress': return { state: 'running' };
      case 'canceled': return { state: 'canceled' };
      case 'nsfw': return { state: 'failed', errorCode: 'video_provider_moderated' };
      case 'failed': return { state: 'failed', errorCode: 'video_provider_generation_failed' };
      case 'completed': return { state: 'succeeded', url: httpsV1(data.video?.url) };
      default: return failV1('video_invalid_provider_status');
    }
  }

  async cancel(receipt: VideoProviderReceiptV1, credential: VideoCredentialV1): Promise<VideoProviderStatusV1> {
    credentialV1(credential, this.id);
    const id = handleV1(receipt.id);
    const url = exactUrlV1(receipt.cancelUrl, `${BASE}/requests/${id}/cancel`);
    // 202 has an empty body; verify actual state rather than equating request with cancellation.
    await requestV1(url, this.headers(credential), 'POST', undefined, false, true);
    return this.poll(receipt, credential);
  }

  private headers(credential: VideoCredentialV1): Record<string, string> {
    if (!/^[^\s:]+:[^\s:]+$/.test(credential.apiKey)) failV1('video_invalid_higgsfield_credential');
    return { Authorization: `Key ${credential.apiKey}`, 'Content-Type': 'application/json' };
  }

  private validate(request: VideoPreparedRequestV1): void {
    const paths = Object.values(ROUTES).flatMap(path => ['text-to-video', 'image-to-video'].map(type => BASE + path + '/' + type));
    if (request.provider !== this.id || !paths.includes(request.endpoint)) failV1('video_unsupported_route');
    const b = request.body; const wan = request.endpoint.includes('/alibaba/'); const image = request.endpoint.endsWith('/image-to-video');
    onlyKeysV1(b, wan ? ['prompt', 'duration', 'resolution', 'aspect_ratio', 'generate_audio', 'enable_thinking', ...(image ? ['image_url'] : [])] : ['prompt', 'duration', 'sound', 'cfg_scale', 'multi_shots', ...(image ? ['image_url'] : ['aspect_ratio'])]);
    if (typeof b.prompt !== 'string' || !b.prompt.trim() || (!wan && b.prompt.length > 2500) || !Number.isInteger(b.duration) || Number(b.duration) < (wan ? 2 : 3) || Number(b.duration) > (wan ? 30 : 15)) failV1('video_invalid_payload');
    if (wan && (!['480p', '720p', '1080p'].includes(String(b.resolution)) || typeof b.generate_audio !== 'boolean' || b.enable_thinking !== false)) failV1('video_invalid_payload');
    if (!wan && (!['on', 'off'].includes(String(b.sound)) || b.multi_shots !== false || b.cfg_scale !== 0.5)) failV1('video_invalid_payload');
    if ((wan || !image) && !['9:16', '16:9', '1:1'].includes(String(b.aspect_ratio))) failV1('video_invalid_payload');
    if (image) httpsV1(b.image_url);
  }
}
