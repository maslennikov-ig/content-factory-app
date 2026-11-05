import { Injectable } from '@nestjs/common';
import { VideoCredentialV1, VideoProviderErrorV1 } from '../../video-provider.v1';
import { deepFreezeV1, failV1, finiteNumberV1, handleV1, localeV1 } from '../provider-http.v1';
import { CompositionInputV1, CompositionPreparedRequestV1, CompositionProviderV1, CompositionReceiptV1, CompositionStatusV1 } from './composition-provider.v1';
import { COMPOSITION_BASE_V1, compositionCredentialV1, compositionHashV1, compositionIdentityV1, compositionRequestV1, compositionUrlV1, validateCompositionInputV1 } from './composition-http.v1';

const ENDPOINT = COMPOSITION_BASE_V1 + '/v3/videos';
export const STUDIO_DOCUMENTATION_V1 = 'https://developers.heygen.com/studio-videos';

/** Whole-frame ordered scenes. No local timeline, implicit voice or payer fallback. */
@Injectable()
export class HeygenStudioCompositionProviderV1 implements CompositionProviderV1 {
  readonly route = 'heygen-studio' as const;

  async prepare(input: CompositionInputV1, c: VideoCredentialV1): Promise<CompositionPreparedRequestV1> {
    compositionCredentialV1(c, true);
    const saved = JSON.parse(JSON.stringify(input)) as CompositionInputV1;
    const body = this.body(saved);
    return deepFreezeV1({ version: 1, route: this.route, endpoint: ENDPOINT, input: saved, body,
      bodySha256: compositionHashV1(body), inputSha256: compositionHashV1(saved), intentKey: saved.intentKey,
      credentialReference: c.reference, payer: c.payer, captions: saved.captions,
      // The selected account's tariff/quote must be admitted by the durable domain.
      estimate: { usd: null, currency: 'USD', source: STUDIO_DOCUMENTATION_V1 + '#account-tariff-required', expiresAt: new Date(Date.now() + 300_000).toISOString() } });
  }

  async submit(request: CompositionPreparedRequestV1, c: VideoCredentialV1): Promise<CompositionReceiptV1> {
    compositionIdentityV1(request, this.route, c, true);
    this.validate(request);
    // One call only. The caller persists uncertainty before any possible reconciliation.
    const result = await compositionRequestV1(ENDPOINT, c, request.body, request.intentKey);
    try {
      const id = handleV1(result.video_id);
      return deepFreezeV1({ version: 1, route: this.route, id, statusUrl: ENDPOINT + '/' + id,
        credentialReference: c.reference, payer: c.payer, captions: request.captions });
    } catch { throw new VideoProviderErrorV1('video_composition_invalid_submit_receipt', true, false); }
  }

  async poll(receipt: CompositionReceiptV1, c: VideoCredentialV1): Promise<CompositionStatusV1> {
    compositionIdentityV1(receipt, this.route, c);
    const id = handleV1(receipt.id); const url = ENDPOINT + '/' + id;
    if (receipt.statusUrl !== url) failV1('video_composition_invalid_receipt');
    const result = await compositionRequestV1(url, c);
    if (result.id !== id) failV1('video_composition_receipt_mismatch');
    switch (result.status) {
      case 'pending': case 'waiting': return { state: 'queued' };
      case 'processing': return { state: 'running' };
      case 'failed': return { state: 'failed', errorCode: 'video_composition_provider_failed' };
      case 'completed': {
        // A normal uncaptioned URL cannot silently satisfy a requested captioned result.
        const download = receipt.captions ? result.captioned_video_url : result.video_url;
        if (!download) failV1('video_composition_incomplete_result');
        return { state: 'succeeded', url: compositionUrlV1(download),
          ...(result.subtitle_url ? { subtitleUrl: compositionUrlV1(result.subtitle_url) } : {}),
          ...(finiteNumberV1(result.duration) === undefined ? {} : { durationSeconds: finiteNumberV1(result.duration) }) };
      }
      default: return failV1('video_composition_invalid_provider_status');
    }
  }

  private validate(request: CompositionPreparedRequestV1): void {
    if (request.endpoint !== ENDPOINT || request.intentKey !== request.input?.intentKey || request.captions !== request.input?.captions ||
      request.inputSha256 !== compositionHashV1(request.input) || request.bodySha256 !== compositionHashV1(request.body) ||
      compositionHashV1(this.body(request.input)) !== request.bodySha256) failV1('video_composition_prepared_request_changed');
  }

  private body(input: CompositionInputV1): Record<string, unknown> {
    validateCompositionInputV1(input, this.route);
    const locale = localeV1(input.locale);
    const scenes = input.scenes.map(s => {
      if (s.title !== undefined || s.captionCues !== undefined) failV1('video_composition_studio_layout_unsupported');
      if (s.kind === 'presenter') {
        if (!input.audio || !s.script.trim() || s.audioUrl || s.mediaUrl || s.retainSourceAudio || s.sourceCaptions || s.playback || !s.avatarId || !s.voiceId || s.engine !== 'avatar_iv') failV1('video_composition_invalid_presenter_scene');
        return { type: 'avatar_video', input: { type: 'avatar', avatar_id: handleV1(s.avatarId),
          script: s.script, voice_id: handleV1(s.voiceId), voice_settings: { locale }, engine: { type: 'avatar_iv' } } };
      }
      if (s.avatarId || s.engine || !s.mediaUrl) failV1('video_composition_invalid_media_scene');
      const source = { type: 'url', url: compositionUrlV1(s.mediaUrl) };
      if (s.retainSourceAudio) {
        if (s.kind !== 'video' || !input.audio || !s.script.trim() || s.audioUrl || s.voiceId || s.playback || (input.captions && s.sourceCaptions !== 'burned')) failV1('video_composition_invalid_retained_audio');
        return { type: 'video', source, playback: { mute: false, volume: 1 } };
      }
      if (s.sourceCaptions) failV1('video_composition_invalid_retained_audio');
      if (s.audioUrl) failV1('video_composition_exact_script_requires_tts_or_retained_clip');
      if (s.script.trim()) {
        if (!input.audio || !s.voiceId) failV1('video_composition_voice_required');
        // Provider docs promise automatic captions for avatars/narrated images only.
        if (s.kind === 'video' && input.captions) failV1('video_composition_video_captions_unsupported');
        if (s.kind === 'image' && s.playback) failV1('video_composition_invalid_playback');
        if (s.playback && !['freeze', 'loop', 'fit_to_scene'].includes(s.playback)) failV1('video_composition_invalid_playback');
        return { type: s.kind, source, script: s.script, voice_id: handleV1(s.voiceId), voice_settings: { locale },
          ...(s.kind === 'video' ? { playback: { mode: s.playback || 'freeze', mute: true } } : {}) };
      }
      if (s.voiceId || s.playback) failV1('video_composition_invalid_silent_scene');
      if (s.kind === 'image') {
        if (s.durationSeconds > 300) failV1('video_composition_silent_image_too_long');
        return { type: 'image', source, duration: s.durationSeconds };
      }
      return { type: 'video', source, playback: { mute: true } };
    });
    return { type: 'studio', title: input.title, aspect_ratio: input.aspectRatio, resolution: input.resolution,
      ...(input.captions ? { caption: { file_format: 'srt', style: 'default' } } : {}), scenes };
  }
}
