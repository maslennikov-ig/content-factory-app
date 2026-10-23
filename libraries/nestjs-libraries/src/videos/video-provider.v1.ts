/** Additive asynchronous contract. The inherited VideoAbstract remains unchanged. */
export type VideoProviderIdV1 = 'higgsfield' | 'heygen';
export type VideoModeV1 = 'clip' | 'presenter';
export type VideoPayerV1 = 'included' | 'workspace_key';

export interface VideoSettingsV1 {
  provider: VideoProviderIdV1;
  model: string;
  mode: VideoModeV1;
  locale: string;
  duration: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
  resolution?: string;
  audio: boolean;
  captions: boolean;
  avatarId?: string;
  voiceId?: string;
  engine?: string;
}

export interface VideoCredentialV1 {
  provider: VideoProviderIdV1;
  apiKey: string;
  payer: VideoPayerV1;
  /** Opaque configuration identity; never a secret or provider key. */
  reference: string;
  maxCostUsd: number;
  monthlyBudgetUsd: number;
}

export interface VideoRouteV1 {
  provider: VideoProviderIdV1;
  model: string;
  label: string;
  mode: VideoModeV1;
  durations: { min: number; max: number; values?: number[] };
  aspectRatios: string[];
  resolutions: string[];
  audio: boolean;
  captions: boolean;
  inputs: Array<'text' | 'image'>;
  evidence: 'documented' | 'account_available' | 'sample_verified';
  price: { text: string; checkedAt: string; source: string };
}

export interface VideoProviderInputV1 {
  settings: VideoSettingsV1;
  prompt: string;
  script: string;
  references: Array<{ id: string; url: string; width?: number; height?: number }>;
  scriptPolicy: 'exact' | 'adaptable';
}

export interface VideoEstimateV1 {
  usd: number | null;
  /** A quote is not an invoice. Undefined means the provider offers no hard cap. */
  upperBoundUsd?: number;
  currency: 'USD';
  source: string;
  expiresAt: string;
}

export interface VideoPreparedRequestV1 {
  provider: VideoProviderIdV1;
  endpoint: string;
  body: Record<string, unknown>;
  estimate: VideoEstimateV1;
}

export interface VideoProviderReceiptV1 {
  id: string;
  statusUrl?: string;
  resultUrl?: string;
  cancelUrl?: string;
}

export interface VideoProviderStatusV1 {
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  url?: string;
  costUsd?: number;
  duration?: number;
  resolution?: string;
  audio?: boolean;
  errorCode?: string;
}

export interface VideoProviderV1 {
  readonly id: VideoProviderIdV1;
  readonly routes: readonly VideoRouteV1[];
  /** Validate and quote only. No video generation in this method. */
  prepare(input: VideoProviderInputV1, credential: VideoCredentialV1): Promise<VideoPreparedRequestV1>;
  submit(request: VideoPreparedRequestV1, key: string, credential: VideoCredentialV1): Promise<VideoProviderReceiptV1>;
  poll(receipt: VideoProviderReceiptV1, credential: VideoCredentialV1): Promise<VideoProviderStatusV1>;
  cancel?(receipt: VideoProviderReceiptV1, credential: VideoCredentialV1): Promise<VideoProviderStatusV1>;
}

/** Sanitized errors only: provider responses may contain credentials or private input. */
export class VideoProviderErrorV1 extends Error {
  constructor(public readonly code: string, public readonly uncertain = false, public readonly retryable = false) {
    super(code);
    this.name = 'VideoProviderErrorV1';
  }
}
