import { Injectable } from '@nestjs/common';
import { VideoCredentialV1, VideoEstimateV1, VideoProviderErrorV1 } from '../../video-provider.v1';
import { deepFreezeV1, failV1, finiteNumberV1, handleV1, localeV1 } from '../provider-http.v1';
import { CompositionInputV1, CompositionPreparedRequestV1, CompositionProviderV1, CompositionReceiptV1, CompositionStatusV1 } from './composition-provider.v1';
import { COMPOSITION_BASE_V1, compositionCredentialV1, compositionHashV1, compositionIdentityV1, compositionRequestV1, compositionUrlV1, validateCompositionInputV1 } from './composition-http.v1';
import { buildHyperframesBundleV1 } from './hyperframes-bundle.v1';

const ENDPOINT = COMPOSITION_BASE_V1 + '/v3/hyperframes/renders';
export const HYPERFRAMES_PRICE_SOURCE_V1 = 'https://help.heygen.com/en/articles/10060327-heygen-api-pricing-credits-explained';
/** Fixed selected output is 1080p/30 fps. Public tariff is an estimate, never actual cost/a ceiling. */
export function estimateHyperframesV1(durationSeconds: number, resolution: string): VideoEstimateV1 {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600 || resolution !== '1080p') failV1('video_composition_unsupported_hyperframes_settings');
  return deepFreezeV1({ usd: Number((durationSeconds * 0.15 / 60).toFixed(6)), currency: 'USD',
    source: HYPERFRAMES_PRICE_SOURCE_V1 + '#1080p-30fps;public-tariff-2026-11-03;account-unverified;not-hard-cap',
    expiresAt: new Date(Date.now() + 300_000).toISOString() });
}

@Injectable()
export class HyperframesCompositionProviderV1 implements CompositionProviderV1 {
  readonly route = 'hyperframes' as const;

  async prepare(input: CompositionInputV1, c: VideoCredentialV1): Promise<CompositionPreparedRequestV1> {
    compositionCredentialV1(c, true);
    const saved = JSON.parse(JSON.stringify(input)) as CompositionInputV1;
    const body = this.body(saved);
    return deepFreezeV1({ version: 1, route: this.route, endpoint: ENDPOINT, input: saved, body,
      bodySha256: compositionHashV1(body), inputSha256: compositionHashV1(saved), intentKey: saved.intentKey,
      credentialReference: c.reference, payer: c.payer, captions: saved.captions,
      estimate: estimateHyperframesV1(saved.durationSeconds, saved.resolution) });
  }

  async submit(request: CompositionPreparedRequestV1, c: VideoCredentialV1): Promise<CompositionReceiptV1> {
    compositionIdentityV1(request, this.route, c, true);
    if (request.endpoint !== ENDPOINT || request.intentKey !== request.input?.intentKey || request.captions !== request.input?.captions ||
      request.inputSha256 !== compositionHashV1(request.input) || request.bodySha256 !== compositionHashV1(request.body) ||
      compositionHashV1(this.body(request.input)) !== request.bodySha256) failV1('video_composition_prepared_request_changed');
    const result = await compositionRequestV1(ENDPOINT, c, request.body, request.intentKey);
    try {
      const id = handleV1(result.render_id);
      return deepFreezeV1({ version: 1, route: this.route, id, statusUrl: ENDPOINT + '/' + id,
        credentialReference: c.reference, payer: c.payer, captions: request.captions });
    } catch { throw new VideoProviderErrorV1('video_composition_invalid_submit_receipt', true, false); }
  }

  async poll(receipt: CompositionReceiptV1, c: VideoCredentialV1): Promise<CompositionStatusV1> {
    compositionIdentityV1(receipt, this.route, c);
    const id = handleV1(receipt.id); const url = ENDPOINT + '/' + id;
    if (receipt.statusUrl !== url) failV1('video_composition_invalid_receipt');
    const result = await compositionRequestV1(url, c);
    if (result.render_id !== id) failV1('video_composition_receipt_mismatch');
    switch (result.status) {
      case 'queued': return { state: 'queued' };
      case 'rendering': return { state: 'running' };
      case 'failed': return { state: 'failed', errorCode: 'video_composition_provider_failed' };
      case 'completed': {
        if (result.format !== 'mp4' || !result.video_url) failV1('video_composition_incomplete_result');
        return { state: 'succeeded', url: compositionUrlV1(result.video_url),
          ...(finiteNumberV1(result.duration) === undefined ? {} : { durationSeconds: finiteNumberV1(result.duration) }),
          ...(result.resolution === '1080p' ? { resolution: '1080p' } : {}) };
      }
      default: return failV1('video_composition_invalid_provider_status');
    }
  }

  private body(input: CompositionInputV1): Record<string, unknown> {
    validateCompositionInputV1(input, this.route); localeV1(input.locale);
    if (input.resolution !== '1080p') failV1('video_composition_unsupported_hyperframes_settings');
    const dimensions = input.aspectRatio === '16:9' ? [1920, 1080] : input.aspectRatio === '9:16' ? [1080, 1920] : [1080, 1080];
    const bundle = buildHyperframesBundleV1({ title: input.title, locale: input.locale, width: dimensions[0], height: dimensions[1],
      scenes: input.scenes.map(s => {
        if (s.kind === 'presenter' || !s.mediaUrl || s.avatarId || s.voiceId || s.engine || s.playback ||
          (s.retainSourceAudio && (s.kind !== 'video' || !input.audio || s.audioUrl)) ||
          (s.sourceCaptions && (!s.retainSourceAudio || s.sourceCaptions !== 'burned')) ||
          (s.script.trim() && !s.audioUrl && !s.retainSourceAudio) ||
          (s.audioUrl && (!s.script.trim() || !input.audio))) failV1('video_composition_hyperframes_owned_narration_required');
        if (!input.captions && s.captionCues?.length) failV1('video_composition_unrequested_captions');
        if (input.captions && s.script.trim() && s.sourceCaptions !== 'burned') {
          const cueText = (s.captionCues || []).map(c => c.text).join(' ').replace(/\s+/g, ' ').trim();
          if (!s.captionCues?.length || cueText !== s.script.replace(/\s+/g, ' ').trim()) failV1('video_composition_exact_caption_cues_required');
        }
        return { id: s.id, durationSeconds: s.durationSeconds, ...(s.title ? { title: s.title } : {}),
          media: { type: s.kind as 'image' | 'video', url: compositionUrlV1(s.mediaUrl), retainAudio: s.retainSourceAudio === true },
          ...(s.audioUrl ? { audioUrl: compositionUrlV1(s.audioUrl) } : {}),
          ...(input.captions && s.captionCues?.length ? { captions: s.captionCues } : {}) };
      }) });
    return { project: { type: 'base64', media_type: 'application/zip', data: bundle.zipBase64 },
      fps: 30, quality: 'standard', format: 'mp4', resolution: '1080p', aspect_ratio: input.aspectRatio,
      composition: 'index.html', title: input.title };
  }
}
