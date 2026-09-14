/** Answer-stream additions for the seventh walk. V2 remains immutable. */
import type { PieceAnswerEventV2 } from '../brand-voice/intake-v2.contract';

export type PieceAnswerLinkEventV3 = {
  name: 'link';
  url: string;
  title: string | null;
  evidenceId: string;
};

export type PieceAnswerEventV3 =
  | PieceAnswerEventV2
  | PieceAnswerLinkEventV3;
