import { VideoCredentialV1, VideoEstimateV1, VideoPayerV1 } from '../../video-provider.v1';

/** Additive composition port; existing clip/presenter contracts remain unchanged. */
export type CompositionRouteV1 = 'heygen-studio' | 'hyperframes';
export interface CompositionCaptionCueV1 { startSeconds: number; endSeconds: number; text: string }
export interface CompositionSceneV1 {
  id: string;
  kind: 'presenter' | 'image' | 'video';
  /** Target for synthesized speech; exact authored duration for Hyperframes/silent images. */
  durationSeconds: number;
  /** Exact approved spoken text. Empty only for an explicitly silent scene. */
  script: string;
  mediaUrl?: string;
  /** Keep an approved existing clip's speech instead of synthesizing it again. */
  retainSourceAudio?: boolean;
  /** Provenance-backed burned captions already present in a retained clip. */
  sourceCaptions?: 'burned';
  /** Existing, approved narration. Hyperframes does not synthesize speech. */
  audioUrl?: string;
  title?: string;
  avatarId?: string;
  voiceId?: string;
  engine?: 'avatar_iv';
  playback?: 'freeze' | 'loop' | 'fit_to_scene';
  captionCues?: readonly CompositionCaptionCueV1[];
}
export interface CompositionInputV1 {
  route: CompositionRouteV1;
  intentKey: string;
  title: string;
  locale: string;
  durationSeconds: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  resolution: '720p' | '1080p';
  audio: boolean;
  captions: boolean;
  /** Must equal scene scripts joined with two newlines, including empty scene scripts. */
  approvedScript: string;
  scenes: readonly CompositionSceneV1[];
}
export interface CompositionPreparedRequestV1 {
  readonly version: 1;
  readonly route: CompositionRouteV1;
  readonly endpoint: string;
  /** Retained to validate restored requests against the exact authored input. */
  readonly input: Readonly<CompositionInputV1>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly bodySha256: string;
  readonly inputSha256: string;
  readonly intentKey: string;
  readonly credentialReference: string;
  readonly payer: VideoPayerV1;
  readonly estimate: Readonly<VideoEstimateV1>;
  readonly captions: boolean;
}
export interface CompositionReceiptV1 {
  readonly version: 1;
  readonly route: CompositionRouteV1;
  readonly id: string;
  readonly statusUrl: string;
  readonly credentialReference: string;
  readonly payer: VideoPayerV1;
  readonly captions: boolean;
}
export interface CompositionStatusV1 {
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  /** Expiring download URL: import promptly, refresh by polling receipt. */
  url?: string;
  subtitleUrl?: string;
  durationSeconds?: number;
  resolution?: string;
  /** Unavailable on documented detail endpoints; must never infer from estimates. */
  costUsd?: number;
  errorCode?: string;
}
export interface CompositionProviderV1 {
  readonly route: CompositionRouteV1;
  prepare(input: CompositionInputV1, credential: VideoCredentialV1): Promise<CompositionPreparedRequestV1>;
  submit(request: CompositionPreparedRequestV1, credential: VideoCredentialV1): Promise<CompositionReceiptV1>;
  poll(receipt: CompositionReceiptV1, credential: VideoCredentialV1): Promise<CompositionStatusV1>;
}
