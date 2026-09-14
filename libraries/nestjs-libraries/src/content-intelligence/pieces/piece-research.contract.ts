import type { PieceFactV2 } from './piece-facts.v2';
import type { IntakeCorrectionV1, IntakeResearchSummaryV1 } from '../brand-voice/voice-wiring.contract';

/** Explicit enrichment, separate from corrective review and persisted core contracts. */
export const PIECE_RESEARCH_VERSION = 'piece-research/v1' as const;
export type PieceResearchPreview = {
  version: typeof PIECE_RESEARCH_VERSION;
  snapshotKey: string;
  level: 'standard';
  input: string;
  facts: PieceFactV2[];
  corrections: IntakeCorrectionV1[];
  summary: IntakeResearchSummaryV1 | null;
};
export type PieceResearchSelection = { snapshotKey: string; selectedKeys: string[] };
