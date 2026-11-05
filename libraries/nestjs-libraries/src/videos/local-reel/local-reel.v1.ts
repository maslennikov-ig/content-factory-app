import type { MeasuredVideoMetadataV1 } from '../production/video-production-result.v1';
import type { CompositionCaptionCueV1 } from '../providers/composition/composition-provider.v1';

/** Server-resolved pin. The caller retains the complete piece/adaptation source reference. */
export interface LocalReelSourceV1 {
  pieceId: string; revision: string; textSha256: string; adaptationId?: string;
}
export interface LocalReelSceneV1 {
  id: string; durationSeconds: number; title?: string; text?: string;
  image?: { assetId: string; absolutePath: string; sha256: string };
  captions?: readonly CompositionCaptionCueV1[];
}
export interface LocalReelInputV1 {
  organizationId: string; source: LocalReelSourceV1; title: string; locale: string;
  scenes: readonly LocalReelSceneV1[];
}
export interface LocalReelFrameV1 {
  absolutePath: string; sha256: string; startSeconds: number; endSeconds: number;
}
export interface LocalReelSceneResultV1 {
  id: string; contentSha256: string; startSeconds: number; durationSeconds: number;
  renderedText: { title: string; text: string; captions: readonly CompositionCaptionCueV1[] };
  imageAssetId?: string;
  frames: LocalReelFrameV1[]; reused: boolean;
}
export interface LocalReelResultV1 {
  version: 1; renderKey: string; absolutePath: string; sha256: string;
  metadata: MeasuredVideoMetadataV1; source: LocalReelSourceV1;
  captions: { source: 'authored_on_screen'; speech: false };
  sceneResults: LocalReelSceneResultV1[]; reused: boolean;
}
export interface LocalReelConfigV1 {
  /** Private, server-selected cache. Never accept these paths from a tool request. */
  cacheRoot: string; allowedAssetRoots: readonly string[];
  chromiumExecutable: string; ffmpegExecutable: string;
  /** Existing local Playwright install; optional when available to Node normally. */
  playwrightModule?: string;
}
export interface LocalReelPortV1 { render(input: LocalReelInputV1): Promise<LocalReelResultV1> }
