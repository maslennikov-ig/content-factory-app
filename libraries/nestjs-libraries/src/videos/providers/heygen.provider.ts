import { Injectable } from '@nestjs/common';
import {
  VideoCredentialV1, VideoPreparedRequestV1, VideoProviderErrorV1, VideoProviderInputV1,
  VideoProviderReceiptV1, VideoProviderStatusV1, VideoProviderV1, VideoRouteV1,
} from '../video-provider.v1';
import { credentialV1, deepFreezeV1, exactUrlV1, failV1, finiteNumberV1, handleV1, httpsV1, localeV1, onlyKeysV1, requestV1 } from './provider-http.v1';

const BASE = 'https://api.heygen.com';
const PRICE_SOURCE = 'https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained';
export const HEYGEN_ROUTES_V1: readonly VideoRouteV1[] = deepFreezeV1([{
  provider: 'heygen', model: 'heygen-avatar', label: 'HeyGen presenter', mode: 'presenter',
  durations: { min: 15, max: 60, values: [15, 30, 60] }, aspectRatios: ['9:16', '16:9', '1:1'],
  resolutions: ['720p', '1080p'], audio: true, captions: true, inputs: ['text'], evidence: 'documented',
  price: { text: 'Price depends on exact engine/avatar; target script duration is not a hard spending cap.', checkedAt: '2026-10-22', source: PRICE_SOURCE },
}]);

export interface HeygenAssetsV1 {
  /** Speech engines; separate from avatars[].engines (avatar rendering engines). */
  voices: Array<{ id: string; name: string; language: string; supportLocale: boolean; speechEngines?: string[] }>;
  avatars: Array<{ id: string; name: string; type: string; engines: string[] }>;
}

@Injectable()
export class HeygenProviderV1 implements VideoProviderV1 {
  readonly id = 'heygen' as const;
  readonly routes = HEYGEN_ROUTES_V1;

  /** Read-only public assets visible to this account. No cloning or private likeness. */
  async listAssets(credential: VideoCredentialV1): Promise<HeygenAssetsV1> {
    credentialV1(credential, this.id);
    const voices = await this.pages('/v3/voices?type=public&limit=100', credential);
    const avatars = await this.pages('/v3/avatars/looks?ownership=public&limit=50', credential);
    return {
      voices: voices.filter(v => v.type === 'public' && v.voice_id && v.language && Array.isArray(v.available_engines) && v.available_engines.length > 0)
        .map(v => ({ id: handleV1(v.voice_id), name: String(v.name || ''), language: String(v.language), supportLocale: v.support_locale === true, speechEngines: v.available_engines.filter((e: unknown) => ['starfish', 'orca', 'elevenlabs', 'elevenlabs_v3'].includes(String(e))) }))
        .filter(v => v.speechEngines.length > 0),
      avatars: avatars.filter(a => a.id && (!a.status || a.status === 'completed') && ['studio_avatar', 'photo_avatar', 'digital_twin'].includes(a.avatar_type) && Array.isArray(a.supported_api_engines))
        .map(a => ({ id: handleV1(a.id), name: String(a.name || ''), type: String(a.avatar_type), engines: a.supported_api_engines.filter((e: unknown) => e === 'avatar_iii' || e === 'avatar_iv') }))
        .filter(a => a.engines.length > 0),
    };
  }

  async prepare(input: VideoProviderInputV1, credential: VideoCredentialV1): Promise<VideoPreparedRequestV1> {
    credentialV1(credential, this.id);
    const s = input.settings;
    if (s.provider !== this.id || s.model !== 'heygen-avatar' || s.mode !== 'presenter') failV1('video_unsupported_route');
    const locale = localeV1(s.locale);
    if (![15, 30, 60].includes(s.duration)) failV1('video_invalid_target_duration');
    if (!['9:16', '16:9', '1:1'].includes(s.aspectRatio)) failV1('video_invalid_aspect_ratio');
    if (!['720p', '1080p'].includes(s.resolution || '')) failV1('video_invalid_resolution');
    if (s.audio !== true || typeof s.captions !== 'boolean') failV1('video_unsupported_audio_or_captions');
    if (!input.script?.trim() || !Array.isArray(input.references) || input.references.length !== 0) failV1('video_invalid_presenter_input');
    if (!s.avatarId || !s.voiceId || !['avatar_iii', 'avatar_iv'].includes(s.engine || '')) failV1('video_presenter_asset_required');
    const assets = await this.listAssets(credential);
    const voice = assets.voices.find(v => v.id === s.voiceId);
    const avatar = assets.avatars.find(a => a.id === s.avatarId);
    if (!voice || !voice.speechEngines?.length || !avatar || !avatar.engines.includes(s.engine!)) failV1('video_presenter_asset_unavailable');
    const language = new Intl.Locale(locale).language;
    const languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(language);
    // Catalog language names are primary languages, not proof of every multilingual accent.
    if (![language.toLowerCase(), languageName?.toLowerCase()].includes(voice.language.toLowerCase()) ||
      (new Intl.Locale(locale).region && !voice.supportLocale)) failV1('video_voice_locale_unsupported');
    const body: Record<string, unknown> = {
      type: 'avatar', avatar_id: s.avatarId, script: input.script, voice_id: s.voiceId,
      voice_settings: { locale }, engine: { type: s.engine }, resolution: s.resolution,
      aspect_ratio: s.aspectRatio, output_format: 'mp4',
      ...(s.captions ? { caption: { file_format: 'srt', style: 'default' } } : {}),
    };
    // These are the exact engine/avatar rates in the dated public price evidence.
    // No upperBoundUsd: script duration and account billing are not known before generation.
    const minuteRate = s.engine === 'avatar_iv' ? (avatar.type === 'photo_avatar' ? 2.31 : 4.83)
      : avatar.type === 'digital_twin' ? 0.60 : 0.99;
    return deepFreezeV1({ provider: this.id, endpoint: BASE + '/v3/videos', body, estimate: {
      usd: minuteRate === null ? null : Number((minuteRate * s.duration / 60).toFixed(6)), currency: 'USD',
      source: `${PRICE_SOURCE}#target-duration-only-not-a-hard-cap;account-price-unverified`,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    } });
  }

  async submit(request: VideoPreparedRequestV1, key: string, credential: VideoCredentialV1): Promise<VideoProviderReceiptV1> {
    credentialV1(credential, this.id);
    this.validate(request);
    if (!/^[A-Za-z0-9_:.\-]{1,255}$/.test(key)) failV1('video_invalid_idempotency_key');
    const result = await requestV1(request.endpoint, { ...this.headers(credential), 'Idempotency-Key': key }, 'POST', request.body, this.id);
    try {
      const id = handleV1(this.videoData(result).video_id);
      return { id, statusUrl: `${BASE}/v3/videos/${id}` };
    } catch { throw new VideoProviderErrorV1('video_invalid_submit_receipt', true, false); }
  }

  async poll(receipt: VideoProviderReceiptV1, credential: VideoCredentialV1): Promise<VideoProviderStatusV1> {
    credentialV1(credential, this.id);
    const id = handleV1(receipt.id);
    const url = exactUrlV1(receipt.statusUrl, `${BASE}/v3/videos/${id}`);
    const result = this.videoData(await requestV1(url, this.headers(credential)));
    if (result.id !== id) failV1('video_receipt_mismatch');
    switch (result.status) {
      case 'pending': case 'waiting': return { state: 'queued' };
      case 'processing': return { state: 'running' };
      case 'failed': return { state: 'failed', errorCode: 'video_provider_generation_failed' };
      // VideoDetail reports duration, but no documented actual-cost field.
      case 'completed': return { state: 'succeeded', url: httpsV1(result.captioned_video_url || result.video_url), ...(finiteNumberV1(result.duration) === undefined ? {} : { duration: finiteNumberV1(result.duration) }) };
      default: return failV1('video_invalid_provider_status');
    }
  }

  /** V3 single-video resources use {data:{...}}; paginated assets use data:[...]. */
  private videoData(response: any): Record<string, any> {
    if (!response?.data || typeof response.data !== 'object' || Array.isArray(response.data)) failV1('video_invalid_provider_response');
    return response.data;
  }

  private validate(request: VideoPreparedRequestV1): void {
    if (request.provider !== this.id || request.endpoint !== BASE + '/v3/videos') failV1('video_unsupported_route');
    const b = request.body;
    onlyKeysV1(b, ['type', 'avatar_id', 'script', 'voice_id', 'voice_settings', 'engine', 'resolution', 'aspect_ratio', 'output_format', 'caption']);
    if (b.type !== 'avatar' || b.output_format !== 'mp4' || typeof b.script !== 'string' || !b.script.trim() || !['720p', '1080p'].includes(String(b.resolution)) || !['16:9', '9:16', '1:1'].includes(String(b.aspect_ratio))) failV1('video_invalid_payload');
    handleV1(b.avatar_id); handleV1(b.voice_id);
    const voice = b.voice_settings as Record<string, unknown>;
    const engine = b.engine as Record<string, unknown>;
    onlyKeysV1(voice, ['locale']); onlyKeysV1(engine, ['type']);
    localeV1(voice.locale as string);
    if (!['avatar_iii', 'avatar_iv'].includes(String(engine.type))) failV1('video_invalid_payload');
    if (b.caption !== undefined) {
      const caption = b.caption as Record<string, unknown>;
      onlyKeysV1(caption, ['file_format', 'style']);
      if (caption.file_format !== 'srt' || caption.style !== 'default') failV1('video_invalid_payload');
    }
  }

  private async pages(path: string, credential: VideoCredentialV1): Promise<any[]> {
    const items: any[] = []; const seen = new Set<string>(); let token: string | undefined;
    // Catalog requests are free; still bound latency and avoid provider cursor loops.
    for (let i = 0; i < 20; i++) {
      const result = await requestV1(BASE + path + (token ? '&token=' + encodeURIComponent(token) : ''), this.headers(credential));
      if (!Array.isArray(result.data)) failV1('video_invalid_asset_catalog');
      items.push(...result.data);
      if (result.has_more === false || (!result.has_more && !result.next_token)) return items;
      if (typeof result.next_token !== 'string' || !result.next_token || seen.has(result.next_token)) failV1('video_invalid_asset_cursor');
      token = result.next_token; seen.add(token);
    }
    return failV1('video_asset_catalog_limit');
  }

  private headers(credential: VideoCredentialV1): Record<string, string> {
    return { 'X-Api-Key': credential.apiKey, 'Content-Type': 'application/json' };
  }
}
