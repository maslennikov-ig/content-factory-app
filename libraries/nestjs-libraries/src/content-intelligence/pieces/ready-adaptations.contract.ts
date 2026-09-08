/** Read-only calendar chooser contract. */
export const READY_ADAPTATIONS_VERSION = 'ready-adaptations/v1' as const;
export const READY_ADAPTATIONS_PATH =
  '/content-intelligence/pieces/ready-adaptations' as const;
export const READY_ADAPTATIONS_DEFAULT_LIMIT = 50 as const;
export const READY_ADAPTATIONS_MAX_LIMIT = 50 as const;

export type ReadyAdaptationV1 = {
  adaptationId: string;
  pieceId: string;
  pieceCode: string;
  title: string;
  firstLine: string;
  integrationId: string;
  postId: string;
  /** ISO timestamp of the latest adaptation write. */
  readyAt: string;
};

export type ReadyAdaptationsResponseV1 = {
  version: typeof READY_ADAPTATIONS_VERSION;
  items: ReadyAdaptationV1[];
};
