import type { PieceFactV2 } from './piece-facts.v2';
import type { IntakeCorrectionV1, IntakeResearchSummaryV1 } from '../brand-voice/voice-wiring.contract';

/** Explicit enrichment, separate from corrective review and persisted core contracts. */
export const PIECE_RESEARCH_VERSION = 'piece-research/v2' as const;
export const PIECE_RESEARCH_VERSIONS = [
  'piece-research/v1',
  PIECE_RESEARCH_VERSION,
] as const;
export type PieceResearchLevel = 'quick' | 'standard' | 'deep';

type PieceResearchPreviewBase = {
  snapshotKey: string;
  input: string;
  facts: PieceFactV2[];
  corrections: IntakeCorrectionV1[];
  summary: IntakeResearchSummaryV1 | null;
};
export type PieceResearchPreviewV1 = PieceResearchPreviewBase & {
  version: 'piece-research/v1';
  level: 'standard';
};
export type PieceResearchPreview = PieceResearchPreviewBase & {
  version: typeof PIECE_RESEARCH_VERSION;
  level: PieceResearchLevel;
  direction?: string;
};
/** Old tabs may still hold a v1 preview after the server starts issuing v2. */
export type ReadablePieceResearchPreview = PieceResearchPreviewV1 | PieceResearchPreview;
export type PieceResearchSelection = { snapshotKey: string; selectedKeys: string[] };
