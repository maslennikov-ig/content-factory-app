/**
 * Channel plan mode and the one slot a piece holds per channel
 * (`content-factory-next-97dq.57`, owner decision 23.09.2026).
 *
 * Every connected channel (`Integration`) has a plan mode:
 *
 *  - `draft`     — «Без плана»: the adaptation stays a draft, the person picks
 *                  the time (the behaviour before this wave);
 *  - `reserve`   — «Бронь», the default: the latest version holds the
 *                  channel's next free time, labelled «в плане на …», and is
 *                  published only after the person confirms;
 *  - `autopilot` — «Автопилот»: the latest version is queued at that time and
 *                  publishes by itself; a newer version replaces it while the
 *                  queue can still be changed safely.
 *
 * `Integration.planMode` NULL reads as `reserve` (invariant I2). The mode lives
 * in a CF-owned column, not in `additionalSettings`, which the provider UI
 * renders.
 *
 * Invariant I1: at most one post per (piece, channel) holds a slot. The holder
 * is the live variant with the latest `plannedAt ?? createdAt`; the other
 * variants' DRAFT posts are "superseded" and are hidden from the calendar, the
 * picker and the slot search. Nothing is deleted: the rows stay, «Вариант N»
 * keeps working, and choosing an older variant (placing or scheduling it) sets
 * its `plannedAt`, which makes it the holder again. «Снять с расписания» on a
 * variant that is not the holder is such a choice too, so the unscheduled
 * draft stays in the calendar (review F10). Under «Без плана» (the post's own
 * mode, else the channel's) no variant holds a slot and none is hidden, as
 * before the wave.
 *
 * Everything here is pure except `supersededDraftPostIds`, which takes a
 * Prisma-like client so that the Postiz calendar repository and the pieces
 * repository answer the question with the same rule.
 */

export const PLAN_MODES = ['draft', 'reserve', 'autopilot'] as const;
export type PlanModeV1 = (typeof PLAN_MODES)[number];

/** NULL, unknown or empty reads as the default «Бронь» (I2). */
export const DEFAULT_PLAN_MODE: PlanModeV1 = 'reserve';

export const isPlanMode = (value: unknown): value is PlanModeV1 =>
  typeof value === 'string' && (PLAN_MODES as readonly string[]).includes(value);

export const planModeOf = (value: unknown): PlanModeV1 =>
  isPlanMode(value) ? value : DEFAULT_PLAN_MODE;

/**
 * I4: a queued post is replaced only while it is still `QUEUE` and more than
 * two minutes away. Closer than that the publish workflow may already be
 * running, and swapping the post under it would race the channel.
 */
export const QUEUE_REPLACE_MARGIN_MS = 2 * 60_000;

export const canReplaceQueued = (
  post: { state?: string | null; publishDate?: Date | string | null; deletedAt?: Date | string | null } | null | undefined,
  now: Date
): boolean => {
  if (!post || post.deletedAt) return false;
  if (String(post.state || '').toUpperCase() !== 'QUEUE') return false;
  const at = post.publishDate ? new Date(post.publishDate).getTime() : NaN;
  return Number.isFinite(at) && at > now.getTime() + QUEUE_REPLACE_MARGIN_MS;
};

/** One variant as the holder rule reads it. */
export type PlanVariantLike = {
  id: string;
  pieceId: string;
  /** The channel: the post's integration, else the derivation's own. */
  integrationId: string | null;
  plannedAt?: Date | string | null;
  createdAt: Date | string;
  postId: string | null;
  postState?: string | null;
  postDeleted?: boolean;
  /**
   * The mode that decides for this (piece, channel): the post's own, else the
   * channel's. «Без плана» keeps every variant draft visible (review F10).
   */
  planMode?: PlanModeV1 | null;
};

/**
 * The post's own plan mode stored in `ContentPiece.tags.postSettings`
 * (`post-settings.ts`, `97dq.70`). It lives here, not in the settings module
 * (which imports this one), so the calendar filter can read it; the settings
 * module's `postPlanModeOf` is this same function, so the two cannot drift
 * (review F6 of the fourteenth walk).
 */
export const tagPlanModeOf = (tags: unknown, integrationId: string): PlanModeV1 | null => {
  const record = (value: unknown): Record<string, any> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
  const all = record(record(tags).postSettings);
  if (!Object.prototype.hasOwnProperty.call(all, integrationId)) return null;
  const mode = all[integrationId]?.planMode;
  return isPlanMode(mode) ? mode : null;
};

const timeOf = (value: Date | string | null | undefined): number => {
  if (!value) return NaN;
  const at = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(at) ? at : NaN;
};

/** Holder rank: an explicit choice (`plannedAt`) or the variant's birth. */
export const holderRank = (row: Pick<PlanVariantLike, 'plannedAt' | 'createdAt'>): number => {
  const planned = timeOf(row.plannedAt ?? null);
  return Number.isFinite(planned) ? planned : timeOf(row.createdAt) || 0;
};

/**
 * The holder of each (piece, channel): the live variant with the highest
 * rank, ties broken by id so that two reads never disagree. Variants without a
 * post or with a deleted post hold nothing.
 */
export const holderIds = (rows: readonly PlanVariantLike[]): Set<string> => {
  const best = new Map<string, PlanVariantLike>();
  for (const row of rows) {
    if (!row.postId || row.postDeleted || !row.integrationId) continue;
    const key = `${row.pieceId}\u0000${row.integrationId}`;
    const current = best.get(key);
    if (
      !current ||
      holderRank(row) > holderRank(current) ||
      (holderRank(row) === holderRank(current) && row.id > current.id)
    ) {
      best.set(key, row);
    }
  }
  return new Set([...best.values()].map((row) => row.id));
};

/**
 * DRAFT posts of variants that are not the holder of their (piece, channel).
 * A (piece, channel) under «Без плана» has no slot to hold, so none of its
 * drafts is superseded — as before the wave (review F10, `97dq.64`).
 */
export const supersededPostIdsOf = (rows: readonly PlanVariantLike[]): string[] => {
  const planned = rows.filter((row) => row.planMode !== 'draft');
  const holders = holderIds(planned);
  return planned
    .filter(
      (row) =>
        row.postId &&
        !row.postDeleted &&
        row.integrationId &&
        !holders.has(row.id) &&
        String(row.postState || '').toUpperCase() === 'DRAFT'
    )
    .map((row) => row.postId as string);
};

/**
 * The channel's next free time from its own `postingTimes` (minutes after UTC
 * midnight), starting today. `taken` holds the epoch milliseconds already held
 * by this channel. `null` when the channel has no posting times at all.
 */
export const nextFreeSlot = (
  times: readonly number[],
  taken: ReadonlySet<number>,
  now: Date,
  horizonDays = 366
): Date | null => {
  const minutes = [...new Set(times.filter((one) => Number.isFinite(one) && one >= 0 && one < 24 * 60))].sort(
    (a, b) => a - b
  );
  if (!minutes.length) return null;
  // Minute precision on both sides (review F11): a post at 09:20:30 holds the
  // 09:20 slot.
  const takenMinutes = new Set([...taken].map((at) => Math.floor(at / 60_000)));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let day = 0; day <= horizonDays; day += 1) {
    for (const minute of minutes) {
      const at = today + day * 86_400_000 + minute * 60_000;
      if (at <= now.getTime() + QUEUE_REPLACE_MARGIN_MS) continue;
      if (!takenMinutes.has(Math.floor(at / 60_000))) return new Date(at);
    }
  }
  return null;
};

/** `Integration.postingTimes` as minutes; broken JSON reads as none. */
export const postingMinutesOf = (value: unknown): number[] => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((one) => Number((one as { time?: unknown })?.time))
      .filter((one) => Number.isFinite(one));
  } catch {
    return [];
  }
};

type ClientLike = Record<string, any>;

/**
 * Post ids of superseded variant drafts among the DRAFT posts a read can
 * actually return (review F12 of `97dq.57`, `97dq.65`).
 *
 * Before, every calendar, list, picker and slot read loaded ALL the
 * organisation's derivations and handed back every superseded draft ever
 * made, so the caller's `id NOT IN (...)` grew with each regenerated variant.
 * Now the read is two indexed steps and no schema change:
 *
 *  1. the candidates: live DRAFT posts with a derivation, narrowed by the
 *     caller's own scope (`postWhere`: its date window, its channels, its
 *     page of ids) — `ContentDerivation(organizationId, postId)`;
 *  2. the siblings of only those pieces in only those channels —
 *     `ContentDerivation(organizationId, contentPieceId)`.
 *
 * The holder rule is still `supersededPostIdsOf`, so the Postiz calendar and
 * the pieces repository keep answering with one rule, and the answer is only
 * ever a subset of the posts the caller's own query can see.
 */
export async function supersededDraftPostIds(
  client: ClientLike,
  organizationId: string,
  /** One channel, or several: supersession never crosses channels. */
  integrationId?: string | readonly string[] | null,
  /** Extra `Post` filter of the caller's read: only those drafts are candidates. */
  postWhere?: Record<string, unknown> | null
): Promise<string[]> {
  const channelFilter =
    typeof integrationId === 'string'
      ? { integrationId }
      : integrationId?.length
      ? { integrationId: { in: [...integrationId] } }
      : {};
  const candidates: Array<{
    contentPieceId: string;
    postId: string | null;
    post: { integrationId: string } | null;
  }> =
    (await client.contentDerivation?.findMany?.({
      where: {
        organizationId,
        postId: { not: null },
        post: {
          is: {
            organizationId,
            deletedAt: null,
            state: 'DRAFT',
            ...channelFilter,
            ...(postWhere ? { AND: [postWhere] } : {}),
          },
        },
      },
      select: {
        contentPieceId: true,
        postId: true,
        post: { select: { integrationId: true } },
      },
    })) ?? [];
  const wanted = new Set(
    candidates.map((row) => row.postId).filter((id): id is string => !!id)
  );
  if (!wanted.size) return [];
  const pieces = [...new Set(candidates.map((row) => row.contentPieceId))];
  const channels = [
    ...new Set(
      candidates
        .map((row) => row.post?.integrationId)
        .filter((id): id is string => !!id)
    ),
  ];
  const rows: Array<{
    id: string;
    contentPieceId: string;
    integrationId: string | null;
    plannedAt: Date | null;
    createdAt: Date;
    postId: string | null;
    post: {
      state: string;
      deletedAt: Date | null;
      integrationId: string;
      integration?: { planMode: string | null } | null;
    } | null;
    piece?: { tags: unknown } | null;
  }> =
    (await client.contentDerivation?.findMany?.({
      where: {
        organizationId,
        contentPieceId: { in: pieces },
        postId: { not: null },
        post: {
          is: {
            organizationId,
            deletedAt: null,
            integrationId: { in: channels },
          },
        },
      },
      select: {
        id: true,
        contentPieceId: true,
        integrationId: true,
        plannedAt: true,
        createdAt: true,
        postId: true,
        post: {
          select: {
            state: true,
            deletedAt: true,
            integrationId: true,
            integration: { select: { planMode: true } },
          },
        },
        piece: { select: { tags: true } },
      },
    })) ?? [];
  return supersededPostIdsOf(
    rows.map((row) => {
      const channel = row.post?.integrationId ?? row.integrationId;
      return {
        id: row.id,
        pieceId: row.contentPieceId,
        integrationId: channel,
        plannedAt: row.plannedAt,
        createdAt: row.createdAt,
        postId: row.postId,
        postState: row.post?.state ?? null,
        postDeleted: !row.post || !!row.post.deletedAt,
        planMode:
          (channel ? tagPlanModeOf(row.piece?.tags, channel) : null) ??
          planModeOf(row.post?.integration?.planMode),
      };
    })
  ).filter((id) => wanted.has(id));
}

/**
 * Why a variant may not be queued now (`97dq.57`, correctness review F1, F3,
 * F5): `published` — the piece already went out in this channel and autopilot
 * does not publish it again; `tooLate` — another variant is queued and goes
 * out within two minutes, so it cannot be taken off safely (I4);
 * `keptQueued` — another variant was queued by a person, and autopilot does
 * not replace a person's choice.
 */
export type QueueBlockV1 = 'published' | 'tooLate' | 'keptQueued';

export type QueueSiblingLike = {
  id: string;
  plan?: string | null;
  post: {
    state?: string | null;
    publishDate?: Date | string | null;
    deletedAt?: Date | string | null;
  } | null;
};

/**
 * The one rule behind every queue write of a piece in a channel: after the
 * write at most one live `QUEUE` post exists for (piece, channel).
 *
 * `release` names the other variants that must leave the queue first; the
 * caller releases them only once it is sure it will queue its own. When
 * anything blocks, nothing is released.
 *
 *  - `releaseHuman` — a person's explicit choice («Запланировать», «Поставить
 *    на …») may take a person-queued variant off the queue; autopilot may not;
 *  - `blockPublished` — autopilot never queues a piece that already went out
 *    in this channel; a person may.
 */
export const queueGate = (
  siblings: readonly QueueSiblingLike[],
  keepId: string,
  now: Date,
  options: { releaseHuman: boolean; blockPublished: boolean }
): { block: QueueBlockV1 | null; release: string[] } => {
  const blocks = new Set<QueueBlockV1>();
  const release: string[] = [];
  for (const sibling of siblings) {
    if (sibling.id === keepId || !sibling.post || sibling.post.deletedAt) continue;
    const state = String(sibling.post.state || '').toUpperCase();
    if (state === 'PUBLISHED') {
      if (options.blockPublished) blocks.add('published');
      continue;
    }
    if (state !== 'QUEUE' && state !== 'QUEUED') continue;
    if (!canReplaceQueued({ ...sibling.post, state: 'QUEUE' }, now)) {
      blocks.add('tooLate');
    } else if (options.releaseHuman || sibling.plan === 'autopilot') {
      release.push(sibling.id);
    } else {
      blocks.add('keptQueued');
    }
  }
  const block = (['published', 'tooLate', 'keptQueued'] as const).find((one) =>
    blocks.has(one)
  );
  return block ? { block, release: [] } : { block: null, release };
};

/** The advisory-lock key every queue write of a (piece, channel) takes (F4). */
export const channelLockKey = (
  organizationId: string,
  pieceId: string,
  integrationId: string
): string => `cf-plan:${organizationId}:${pieceId}:${integrationId}`;

export const CF_QUEUE_BUSY = 'CF_QUEUE_BUSY';

/** How long the gate may wait for the channel lock and hold it (ms). */
export const FOREIGN_QUEUE_GATE_MS = 20_000;

/**
 * Queue writes that do not come from Content Factory's own paths — the Postiz
 * editor and calendar, the public `PUT /posts/:id/status`, chat tools — go
 * through the same one-queue rule when the post is a Content Factory variant
 * (`content-factory-next-97dq.67`).
 *
 * For each named post that a `ContentDerivation` points at, the gate takes the
 * channel lock that the pieces' own queue writes take (`channelLockKey`), and
 * refuses with `CF_QUEUE_BUSY` (409) while another live variant of the same
 * piece is `QUEUE` in that channel. A person working in Postiz does not see the
 * other variants, so nothing is released silently here: the refusal says to
 * unschedule the other version first. Plain Postiz posts (no derivation) skip
 * the gate entirely and `work` gets no transaction client.
 *
 * `work` receives the gate's own transaction client and must write through
 * it (review F1 of the fourteenth walk): the lock, the check and the write
 * share one connection and commit or roll back together. A write on a second
 * pooled connection while this one waits could starve the pool under
 * concurrent saves, and a gate timeout after such a write had committed left a
 * QUEUE post with no workflow. The transaction is READ COMMITTED on purpose:
 * each statement after the lock sees what committed before the lock was
 * granted, which REPEATABLE READ (snapshot taken before the lock wait) would not.
 */
export async function withForeignQueueGate<T>(
  client: ClientLike,
  organizationId: string,
  postIds: readonly string[],
  work: (tx?: ClientLike) => Promise<T>,
  now: () => Date = () => new Date()
): Promise<T> {
  const ids = [...new Set(postIds.filter(Boolean))];
  if (!ids.length || !client.contentDerivation?.findMany) return work();
  const variants: Array<{
    id: string;
    contentPieceId: string;
    postId: string | null;
    post: { integrationId: string } | null;
  }> = await client.contentDerivation.findMany({
    where: { organizationId, postId: { in: ids } },
    select: {
      id: true,
      contentPieceId: true,
      postId: true,
      post: { select: { integrationId: true } },
    },
  });
  const gated = variants.filter((row) => row.post?.integrationId);
  if (!gated.length) return work();
  const keys = [
    ...new Set(
      gated.map((row) =>
        channelLockKey(organizationId, row.contentPieceId, row.post!.integrationId)
      )
    ),
  ].sort();
  return client.$transaction(
    async (tx: ClientLike) => {
      for (const key of keys) {
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS held`;
      }
      for (const row of gated) {
        const siblings: QueueSiblingLike[] = await tx.contentDerivation.findMany({
          where: {
            organizationId,
            contentPieceId: row.contentPieceId,
            postId: { not: null },
            post: { is: { organizationId, integrationId: row.post!.integrationId } },
          },
          select: {
            id: true,
            plan: true,
            post: { select: { state: true, publishDate: true, deletedAt: true } },
          },
        });
        const gate = queueGate(siblings, row.id, now(), {
          releaseHuman: false,
          blockPublished: false,
        });
        if (gate.block || gate.release.length) {
          const error: any = new Error(
            'Another version of this post is already scheduled in this channel. Unschedule it first.'
          );
          error.code = CF_QUEUE_BUSY;
          error.status = 409;
          throw error;
        }
      }
      return work(tx);
    },
    {
      maxWait: FOREIGN_QUEUE_GATE_MS,
      timeout: FOREIGN_QUEUE_GATE_MS,
      isolationLevel: 'ReadCommitted',
    }
  );
}
