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
  /**
   * Where the adaptation stands in its channel's calendar (`97dq.57`):
   * `reserved` — holds a time «в плане»; `queued` — in the queue
   * (`autopilot` when the autopilot put it there); `free` — a draft with no
   * time held. `date` is ISO for `reserved` and `queued`, else `null`.
   * Absent from an older server.
   */
  slot?: ReadyAdaptationSlotV1;
};

export type ReadyAdaptationSlotV1 = {
  status: 'reserved' | 'queued' | 'free';
  date: string | null;
  autopilot: boolean;
};

export type ReadyAdaptationsResponseV1 = {
  version: typeof READY_ADAPTATIONS_VERSION;
  items: ReadyAdaptationV1[];
};
