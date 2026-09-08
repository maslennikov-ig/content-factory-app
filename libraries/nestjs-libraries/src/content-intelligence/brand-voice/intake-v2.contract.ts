/** Neutral intake and answer feedback, second walk 08.09.2026. V1 stays frozen. */
import type {
  IntakeEventWithPieceV1,
  PieceCreateRequestV1,
  PieceAnswerEventV1,
} from './voice-wiring.contract';
export type IntakeRequestV2 = Omit<PieceCreateRequestV1, 'integrationIds'>;
export type IntakeEventV2 =
  | Exclude<
      IntakeEventWithPieceV1,
      {
        name:
          | 'intake-started'
          | 'channel-started'
          | 'content-context'
          | 'generator'
          | 'draft'
          | 'done';
      }
    >
  | {
      name: 'intake-started';
      inputKind: 'thought' | 'link' | 'foreign_post';
      sources: Array<'foreign_post' | 'link' | 'thought'>;
    }
  | { name: 'brief-started' }
  | { name: 'done'; pieceId: string | null };
export type PieceAnswerEventV2 =
  | Exclude<PieceAnswerEventV1, { name: 'piece' }>
  | (Extract<PieceAnswerEventV1, { name: 'piece' }> & { previousBody: string });

import type { BriefFilledV1 } from './voice-wiring.contract';
export type BriefFilledV2 = BriefFilledV1 & {
  inputSources?: Array<{
    kind: 'foreign_post' | 'link' | 'thought';
    url?: string;
    evidenceId?: string;
  }>;
};
