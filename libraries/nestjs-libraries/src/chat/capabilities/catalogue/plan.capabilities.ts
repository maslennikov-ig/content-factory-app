import { z } from 'zod';
import { AnalyticsController } from '@contentfactory/backend/api/routes/analytics.controller';
import { ContentPieceController } from '@contentfactory/backend/api/routes/content-piece.controller';
import { PostsController } from '@contentfactory/backend/api/routes/posts.controller';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import { ADAPTATION_QUEUE_NEEDS_CONSENT } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-review.contract';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import type { AgentCardPayloads, PlanSlotState } from '../agent-parts.contract';
import {
  defineCapability,
  door,
  type ApprovalDescribeContext,
  type CapabilityRunContext,
} from '../capability.types';
import { codedFailure } from './selection';
import { localDayStart, localTime } from '../person-time';
import { namedTimeZone, namedTimeZoneInput } from './named-zone';

/**
 * The plan (spec §5.2 «План», `kcxz.15`): what is ahead, the calendar for a
 * range, ready adaptations; a reserve («Бронь») and taking a post off the
 * schedule without asking; scheduling at a firm date, «Опубликовать сейчас»,
 * moving a scheduled post and «Ко всем N» behind the approval card (owner
 * 26.09, rule 4: anything that goes out without a further human act asks).
 *
 * Every capability calls the method its door calls, with the body the screen
 * sends: the calendar picker's `place` body, `buildSchedulePayload`, the
 * calendar's drag body for `PUT /posts/:id/date`, the channel card's
 * `plan-apply` body. The model names adaptations and channels by id; which
 * post an adaptation is, its channel and its time are read from the stored
 * rows, never taken from the model.
 */

const pieceId = z.string().min(1).max(128).describe('Piece id');
const adaptationId = z
  .string()
  .min(1)
  .max(128)
  .describe('Adaptation id from plan.ready or piece.adapt');
const channelId = z.string().min(1).max(128).describe('Channel id from the snapshot or channels.list');
const channelIds = z
  .array(z.string().min(1).max(128))
  .max(50)
  .optional()
  .describe('Only these channels; all when absent');
/**
 * A moment with its zone, as the model writes it. No transform (a confirm
 * input is fingerprinted as sent, `rewritingFindings`); the check refuses a
 * time without an offset, which would be read in the server's zone.
 */
const at = z
  .string()
  .datetime({ offset: true })
  .describe('ISO 8601 with the offset of the person’s zone, e.g. 2026-09-29T10:00:00+03:00');
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('YYYY-MM-DD in the person’s zone');

/* ---- The person's zone ---------------------------------------------------- */

/**
 * The zone the door resolved for this request (`person-time.ts`: the
 * browser's, else the saved offset, else UTC) — a primitive of the identity.
 */
const personZone = (ctx: { timeZone?: string }) => ctx.timeZone || 'UTC';

/**
 * The zone of a call that reads or says local times (`kcxz.42`, the rule of
 * `channel.times`): the web chat keeps the identity's; over MCP the call names
 * an IANA zone, since the fallback there (saved offset or UTC) knows no summer
 * time. The context comes back with that zone, so every time the run says is
 * in it.
 */
const withPlanZone = <C extends Pick<CapabilityRunContext, 'entrance' | 'timeZone'>>(
  ctx: C,
  named: string | undefined,
  nothingDone: string
): C => ({
  ...ctx,
  timeZone: namedTimeZone(ctx, named, {
    prefix: 'PLAN',
    subject: 'Plan days and times',
    nothingDone,
  }),
});
const NOTHING_READ = 'Nothing was read.';
const NOTHING_CHANGED = 'Nothing was changed.';
const ZONE_NOTE = ' `timeZone` (IANA) only when the person named another zone; required over MCP.';

const isoOf = (value: unknown): string | null => {
  if (!(typeof value === 'string' || value instanceof Date)) return null;
  const moment = new Date(value);
  return Number.isNaN(moment.getTime()) ? null : moment.toISOString();
};

/* ---- One adaptation, as the plan sees it ---------------------------------- */

type StoredAdaptation = {
  id: string;
  pieceId?: string;
  integrationId?: string | null;
  integrationName?: string | null;
  platform?: string | null;
  postId?: string | null;
  state?: string | null;
  date?: string | null;
  plan?: { status?: string | null; date?: string | null; autopilot?: boolean } | null;
  title?: string | null;
  body?: string | null;
  mediaId?: string | null;
};

/** Where an adaptation stands: the words of the plan card. */
export const slotStateOf = (row: StoredAdaptation): PlanSlotState => {
  if (row.state === 'published') return 'published';
  if (row.state === 'queued') return 'scheduled';
  // Sent and did not go out: the calendar's ERROR, never a draft (W2 F14).
  if (row.state === 'error') return 'error';
  return row.plan?.status === 'reserved' ? 'reserve' : 'draft';
};

const slotTimeOf = (row: StoredAdaptation) => isoOf(row.plan?.date ?? row.date ?? null);

const channelOf = (row: StoredAdaptation) => ({
  id: String(row.integrationId ?? ''),
  name: String(row.integrationName ?? ''),
  provider: String(row.platform ?? ''),
});

/** The piece and one of its adaptations, in the caller's workspace. */
const storedAdaptation = async (
  ctx: Pick<ApprovalDescribeContext, 'organizationId' | 'language' | 'service'>,
  piece: string,
  adaptation: string
) => {
  const detail = await ctx.service(PieceService).detail(ctx.organizationId, piece, ctx.language);
  const row = (detail.adaptations ?? []).find((one: { id: string }) => one.id === adaptation) as
    | StoredAdaptation
    | undefined;
  return {
    code: String(detail.piece?.code ?? ''),
    row: row ?? null,
    rows: (detail.adaptations ?? []) as StoredAdaptation[],
  };
};

const adaptationMissing = () =>
  codedFailure(
    'ADAPTATION_NOT_FOUND',
    'There is no such adaptation of this piece in the workspace; nothing was changed. Read plan.ready for the ids.'
  );

type Slot = {
  pieceId: string;
  adaptationId: string;
  channel: { id: string; name: string; provider: string };
  state: PlanSlotState;
  at: string | null;
  local: string | null;
  /** Why autopilot kept a reserve instead of the queue (the service's words). */
  note?: string | null;
  /**
   * plan.place on a channel «Без плана» (kcxz.31 D5): this post's own mode
   * was set to «Бронь» so the reserve could stand; the channel is unchanged.
   */
  postMode?: 'reserve';
};

const slotSummary = (slot: Slot) => ({
  pieceId: slot.pieceId,
  adaptationId: slot.adaptationId,
  channelId: slot.channel.id,
  state: slot.state,
  at: slot.at,
  local: slot.local,
  ...(slot.note ? { note: slot.note } : {}),
  ...(slot.postMode ? { postMode: slot.postMode } : {}),
});

/**
 * What plan.place tells the model when the post did not become a reserve
 * (kcxz.31 D5): the state it is really in, so it is not reported as «бронь».
 */
const NOT_A_RESERVE =
  'Not a reserve: the post stays a draft with this time and will not go out by itself. Tell the person exactly that; do not call it a reserve.';

const slotCard = (slot: Slot): AgentCardPayloads['plan'] => ({
  kind: 'plan',
  id: slot.adaptationId,
  pieceId: slot.pieceId,
  channel: slot.channel,
  at: slot.at,
  state: slot.state,
});

/** The slot after a door wrote it: the door's own answer, read as the page reads it. */
const slotAfter = async (
  ctx: CapabilityRunContext,
  input: { pieceId?: string; adaptationId?: string },
  written: StoredAdaptation | null | undefined,
  before: StoredAdaptation
): Promise<Slot> => {
  const row = { ...before, ...(written ?? {}) };
  const zone = personZone(ctx);
  const time = slotTimeOf(row);
  return {
    pieceId: String(input.pieceId),
    adaptationId: String(input.adaptationId),
    channel: channelOf(row),
    state: slotStateOf(row),
    at: time,
    local: time ? localTime(time, zone, ctx.language) : null,
  };
};

/* ---- Reads ---------------------------------------------------------------- */

export const planAhead = defineCapability({
  id: 'plan.ahead',
  group: 'plan',
  label: { ru: 'Что впереди', en: 'What is ahead' },
  description:
    'Read the plan ahead, as «План» and Analytics → «Производство» count it: posts reserved («в плане») and queued («в очереди») from today, how far the plan reaches, how many days in a row hold a post, published in the last 7 days — for the workspace and per channel. Free. Days are in the person’s zone.' +
    ZONE_NOTE,
  input: z.object({ channelIds, timeZone: namedTimeZoneInput }),
  risk: 'read',
  door: door(AnalyticsController, 'getPlanAhead'),
  // Channel names are set on the platform.
  untrusted: ['workspace-text'],
  run: async (ctx, input) => {
    const zone = personZone(withPlanZone(ctx, input.timeZone, NOTHING_READ));
    const ids = input.channelIds ?? [];
    // `planAheadUrl`: the ids sorted, omitted when none; the zone of the reader.
    const ahead = (await ctx.service(PostsService).getPlanAhead(ctx.organizationId, {
      ...(ids.length ? { integrationIds: [...ids].sort().join(',') } : {}),
      timeZone: zone,
    })) as Record<string, any>;
    const counts = (row: Record<string, any>) => ({
      planned: Number(row.planned ?? 0),
      reserved: Number(row.reserved ?? 0),
      queued: Number(row.queued ?? 0),
      planUntil: row.planUntil ?? null,
    });
    return {
      today: String(ahead.today ?? ''),
      zone,
      ...counts(ahead),
      published7d: Number(ahead.published7d ?? 0),
      daysInARow: Number(ahead.days ?? 0),
      emptyFrom: ahead.emptyFrom ?? null,
      channels: (Array.isArray(ahead.channels) ? ahead.channels : []).map((row: Record<string, any>) => ({
        id: String(row.integrationId ?? ''),
        name: String(row.name ?? ''),
        ...counts(row),
      })),
    };
  },
  summarize: (output) => ({ ...output }),
});

/** A range longer than two months is a second call, not one long answer. */
const CALENDAR_MAX_DAYS = 62;
const CALENDAR_MAX_ROWS = 60;

/** `YYYY-MM-DD` of the day after, by the calendar alone. */
const nextDayKey = (key: string) => {
  const [year, month, date] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
};

/** `dayjs().utc().format()`: the calendar's own query form, without milliseconds. */
const calendarInstant = (moment: Date) => `${moment.toISOString().slice(0, 19)}Z`;

export const planCalendar = defineCapability({
  id: 'plan.calendar',
  group: 'plan',
  label: { ru: 'Календарь', en: 'Calendar' },
  description:
    'Read the calendar for a range of days (at most 62), as the «Календарь» screen shows it: every post with its time, state (DRAFT with a plan is a reserve, QUEUE goes out by itself, PUBLISHED, ERROR), its channel and the piece it came from. Free. Days are in the person’s zone; one channel with `channelId`.' +
    ZONE_NOTE,
  input: z.object({ from: day, to: day, channelId: channelId.optional(), timeZone: namedTimeZoneInput }),
  risk: 'read',
  door: door(PostsController, 'getPosts'),
  // Channel names from the platform, piece titles from pasted texts.
  untrusted: ['workspace-text'],
  run: async (ctx, input) => {
    const zone = personZone(withPlanZone(ctx, input.timeZone, NOTHING_READ));
    const start = localDayStart(input.from, zone);
    // The last second before the next day starts: a fall-back day has 25
    // hours, a spring-forward day 23 (review W2 F15).
    const end = new Date(localDayStart(nextDayKey(input.to), zone).getTime() - 1_000);
    const days = Math.round((end.getTime() - start.getTime()) / (24 * 3_600_000));
    if (Number.isNaN(days) || days < 1 || days > CALENDAR_MAX_DAYS) {
      throw codedFailure(
        'PLAN_RANGE_INVALID',
        `Ask for 1 to ${CALENDAR_MAX_DAYS} days, \`from\` not after \`to\`; nothing was read.`
      );
    }
    // The calendar's query (`calendar.context.tsx` `loadData`): the zone's day
    // bounds in UTC, `customer` empty, one channel when chosen.
    const posts = (await ctx.service(PostsService).getPosts(ctx.organizationId, {
      startDate: calendarInstant(start),
      endDate: calendarInstant(end),
      customer: '',
      ...(input.channelId ? { integrationId: input.channelId } : {}),
    } as any)) as Array<Record<string, any>>;
    const rows = posts
      .map((post) => {
        const time = isoOf(post.publishDate);
        return {
          postId: String(post.id ?? ''),
          at: time,
          local: time ? localTime(time, zone, ctx.language) : null,
          state: String(post.state ?? ''),
          plan: typeof post.plan === 'string' ? post.plan : null,
          channel: { id: String(post.integration?.id ?? ''), name: String(post.integration?.name ?? '') },
          piece: post.piece?.id
            ? { id: String(post.piece.id), code: String(post.piece.code ?? ''), title: String(post.piece.title ?? '') }
            : null,
        };
      })
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return {
      from: input.from,
      to: input.to,
      zone,
      posts: rows.slice(0, CALENDAR_MAX_ROWS),
      more: Math.max(0, rows.length - CALENDAR_MAX_ROWS),
    };
  },
  summarize: (output) => ({ ...output }),
});

/** The picker's page size (`adaptation-picker.tsx`). */
const READY_LIMIT = 50;

export const planReady = defineCapability({
  id: 'plan.ready',
  group: 'plan',
  label: { ru: 'Готовые адаптации', en: 'Ready adaptations' },
  description:
    'List adaptations that can go into the plan or move in it, as the calendar’s «Что публикуем» picker does: ids (what plan.place, plan.schedule, plan.publish_now, plan.move and plan.unschedule take), the piece code and title, the channel, and the slot — free, reserved («в плане») or queued, with its time. Free.' +
    ZONE_NOTE,
  input: z.object({ channelIds, timeZone: namedTimeZoneInput }),
  risk: 'read',
  door: door(ContentPieceController, 'readyAdaptations'),
  untrusted: ['workspace-text'],
  run: async (ctx, input) => {
    const zone = personZone(withPlanZone(ctx, input.timeZone, NOTHING_READ));
    const ready = (await ctx
      .service(PieceService)
      .readyAdaptations(
        ctx.organizationId,
        READY_LIMIT,
        input.channelIds?.length ? input.channelIds : undefined
      )) as { items?: Array<Record<string, any>> };
    return {
      zone,
      items: (ready.items ?? []).map((item) => {
        const time = isoOf(item.slot?.date ?? null);
        return {
          adaptationId: String(item.adaptationId),
          pieceId: String(item.pieceId),
          pieceCode: String(item.pieceCode ?? ''),
          title: String(item.title ?? ''),
          channelId: String(item.integrationId ?? ''),
          slot: String(item.slot?.status ?? 'free'),
          autopilot: item.slot?.autopilot === true,
          at: time,
          local: time ? localTime(time, zone, ctx.language) : null,
        };
      }),
    };
  },
  summarize: (output) => ({ ...output }),
});

/* ---- Writes: a reserve, and taking a post off the schedule ---------------- */

/** `PieceAdaptationPlacementV1.status` in the card's words. */
const PLACEMENT_STATES: Record<'reserved' | 'queued' | 'draft', PlanSlotState> = {
  reserved: 'reserve',
  queued: 'scheduled',
  draft: 'draft',
};

export const planPlace = defineCapability({
  id: 'plan.place',
  group: 'plan',
  label: { ru: 'Поставить бронь', en: 'Reserve a time' },
  description:
    'Put an adaptation into the plan at a time as a reserve («Бронь»), as «Поставить на ЧЧ:ММ» in the calendar does. Runs without asking: a reserve does not go out by itself and can be cancelled. On a channel «Без плана» this post’s own mode becomes «Бронь» first (`postMode: reserve` in the result; the channel keeps its mode). Refused on an autopilot channel (a reserve there would join the queue) and for a post already scheduled — offer plan.schedule or plan.move, which the person approves. Returns the state and the time in the person’s zone: report exactly that `state` (`reserve` — «бронь», `draft` — a draft with a time, not a reserve). `at` is the time the person named — never one you picked; an adaptation piece.adapt already answered with `plan: reserved` is in the plan at the channel’s own slot, so call this for it only when the person asked for a time.' +
    ZONE_NOTE,
  input: z.object({ pieceId, adaptationId, at, timeZone: namedTimeZoneInput }),
  risk: 'write',
  card: 'plan',
  door: door(ContentPieceController, 'placeAdaptation'),
  untrusted: [],
  run: async (asked, input): Promise<Slot> => {
    const ctx = withPlanZone(asked, input.timeZone, NOTHING_CHANGED);
    const { row } = await storedAdaptation(ctx, input.pieceId, input.adaptationId);
    if (!row?.integrationId) throw adaptationMissing();
    if (row.state === 'queued') {
      throw codedFailure(
        'PLAN_ALREADY_SCHEDULED',
        'This post is already scheduled and goes out by itself; nothing was changed. Moving it is plan.move, which the person approves on a card.'
      );
    }
    // A reserve is the only thing placed without a card (spec §1.4, premortem
    // A1): the calendar door queues on an autopilot channel.
    const mode = await ctx
      .service(PieceService)
      .adaptPlanMode(ctx.organizationId, input.pieceId, row.integrationId);
    if (mode === 'autopilot') {
      throw codedFailure(
        'PLAN_PLACE_AUTOPILOT',
        'The channel is on autopilot: placing the post would queue it to go out by itself, so nothing was placed. Offer plan.schedule for this time; the person approves it.'
      );
    }
    // The picker's body (`adaptation-picker.tsx` `place`). The check above is
    // the reason to refuse early; the guarantee is the service's: it re-reads
    // the mode and the post under the channel lock and refuses to queue
    // without consent (review W2 F2).
    let placed: { adaptation?: StoredAdaptation; placement?: { status?: string; date?: string; note?: string | null } };
    try {
      placed = (await ctx
        .service(PieceService)
        .placeAdaptation(
          ctx.organizationId,
          input.pieceId,
          input.adaptationId,
          { date: new Date(input.at).toISOString() },
          ctx.language,
          // A reserve is what the person asked for: on a channel «Без плана»
          // the service sets this post's own mode to «Бронь» (kcxz.31 D5).
          { queueAllowed: false, reserve: true }
        )) as typeof placed;
    } catch (error) {
      if ((error as { code?: unknown })?.code === ADAPTATION_QUEUE_NEEDS_CONSENT) {
        throw codedFailure(
          'PLAN_PLACE_AUTOPILOT',
          'The channel went on autopilot, or the post was scheduled, while this was being placed: placing it would send it without a card, so nothing was placed. Offer plan.schedule (or plan.move for a scheduled post); the person approves it.'
        );
      }
      throw error;
    }
    const slot = await slotAfter(ctx, input, placed.adaptation, row);
    // The placement is the door's own word on where the version stands now.
    const status = placed.placement?.status;
    const placedAt = isoOf(placed.placement?.date);
    const state = PLACEMENT_STATES[status as keyof typeof PLACEMENT_STATES] ?? slot.state;
    return {
      ...slot,
      state,
      ...(placedAt && placedAt !== slot.at
        ? { at: placedAt, local: localTime(placedAt, personZone(ctx), ctx.language) }
        : {}),
      note: placed.placement?.note ?? (state === 'draft' ? NOT_A_RESERVE : null),
      ...(mode === 'draft' && state === 'reserve' ? { postMode: 'reserve' as const } : {}),
    };
  },
  summarize: slotSummary,
  cardOf: slotCard,
});

export const planUnschedule = defineCapability({
  id: 'plan.unschedule',
  group: 'plan',
  label: { ru: 'Снять с расписания', en: 'Take off the schedule' },
  description:
    'Take a scheduled post off the schedule («Снять с расписания»): it goes back to a reserve at the same time and will not go out by itself. Runs without asking. Only a queued post; a published one stays published.' +
    ZONE_NOTE,
  input: z.object({ pieceId, adaptationId, timeZone: namedTimeZoneInput }),
  risk: 'write',
  card: 'plan',
  door: door(ContentPieceController, 'unscheduleAdaptation'),
  untrusted: [],
  run: async (asked, input): Promise<Slot> => {
    const ctx = withPlanZone(asked, input.timeZone, NOTHING_CHANGED);
    const { row } = await storedAdaptation(ctx, input.pieceId, input.adaptationId);
    if (!row) throw adaptationMissing();
    const written = (await ctx
      .service(PieceService)
      .unscheduleAdaptation(ctx.organizationId, input.pieceId, input.adaptationId, ctx.language)) as {
      adaptation?: StoredAdaptation;
    };
    return slotAfter(ctx, input, written.adaptation, row);
  },
  summarize: slotSummary,
  cardOf: slotCard,
});

/* ---- Confirm: what goes out without a further act ------------------------- */

const APPROVAL_MISSING = {
  ru: (id: string) => `Адаптации ${id} в этом пространстве нет — ничего не изменится`,
  en: (id: string) => `There is no adaptation ${id} in this workspace — nothing will change`,
};

/** The words of the post the card quotes, at most. */
const EXCERPT_MAX = 90;

/**
 * The start of the post as stored, one line, quoted on the approval card
 * (review W2 F4): the person approves a text they see, not a piece code.
 */
const excerptOf = (row: StoredAdaptation, language: 'ru' | 'en') => {
  const text = [row.title, row.body]
    .filter((one): one is string => typeof one === 'string' && !!one.trim())
    .join(' — ')
    .replace(/\s+/g, ' ')
    .trim();
  const picture = row.mediaId ? (language === 'ru' ? ' + картинка' : ' + a picture') : '';
  if (!text) return language === 'ru' ? `текст пуст${picture}` : `the text is empty${picture}`;
  const cut = text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : text;
  return `«${cut}»${picture}`;
};

/**
 * What the person approves on a post card: the stored text and picture. The
 * hooks bind «Да» to it — recomputed when the call runs, a different value
 * refuses the call (`APPROVAL_CONTENT_CHANGED`, review W2 F4).
 */
const postContent = async (
  ctx: ApprovalDescribeContext,
  input: { pieceId?: string; adaptationId?: string }
) => {
  const stored = await storedAdaptation(ctx, String(input.pieceId), String(input.adaptationId)).catch(
    () => null
  );
  const row = stored?.row;
  return row
    ? { title: row.title ?? null, body: row.body ?? null, mediaId: row.mediaId ?? null }
    : null;
};

/** «заготовка cnt-1 в канале «…»» from the stored rows, or `null`. */
const approvalSubject = async (
  ctx: ApprovalDescribeContext,
  input: { pieceId?: string; adaptationId?: string }
): Promise<Subject | null> => {
  const stored = await storedAdaptation(ctx, String(input.pieceId), String(input.adaptationId)).catch(
    () => null
  );
  if (!stored?.row) return null;
  const channel = String(
    stored.row.integrationName || stored.row.platform || (ctx.language === 'ru' ? 'канал' : 'channel')
  );
  return {
    pieceId: String(input.pieceId),
    code: stored.code,
    channel,
    row: stored.row,
    // The other versions of this piece in the same channel.
    others: stored.rows.filter(
      (one: StoredAdaptation) => one.id !== stored.row!.id && one.integrationId === stored.row!.integrationId
    ),
    zone: personZone(ctx),
  };
};

type Subject = {
  pieceId: string;
  code: string;
  channel: string;
  row: StoredAdaptation;
  others: StoredAdaptation[];
  zone: string;
};

/**
 * What else confirming a post does (review W2 F10), as `scheduleAdaptation`
 * does it: another queued version of the piece in the channel leaves the
 * queue, and — unless the channel has no plan — the drafts of the other
 * versions leave the calendar (their texts stay on the piece).
 */
const sideEffects = async (ctx: ApprovalDescribeContext, subject: Subject) => {
  const ru = ctx.language === 'ru';
  const queued = subject.others.filter((one: StoredAdaptation) => one.state === 'queued').length;
  const drafts = subject.others.filter((one: StoredAdaptation) => one.state === 'draft').length;
  const mode = drafts
    ? await ctx
        .service(PieceService)
        .adaptPlanMode(ctx.organizationId, subject.pieceId, String(subject.row.integrationId ?? ''))
        .catch(() => null)
    : null;
  const lines = [
    ...(queued
      ? [ru ? 'другая версия этого поста снимется с очереди' : 'another version of this post leaves the queue']
      : []),
    ...(drafts && mode !== 'draft'
      ? [
          ru
            ? `черновики других версий (${drafts}) уйдут из календаря`
            : `the drafts of the other versions (${drafts}) leave the calendar`,
        ]
      : []),
  ];
  return lines.length ? `; ${lines.join('; ')}` : '';
};

/** A post that cannot be confirmed any more: the card says so instead. */
const notADraft = (subject: Subject, language: 'ru' | 'en') =>
  subject.row.state === 'queued'
    ? language === 'ru'
      ? ' — но он уже запланирован, ничего не изменится'
      : ' — but it is already scheduled, nothing will change'
    : subject.row.state === 'published'
      ? language === 'ru'
        ? ' — но он уже вышел, ничего не изменится'
        : ' — but it is already out, nothing will change'
      : null;

export const planSchedule = defineCapability({
  id: 'plan.schedule',
  group: 'plan',
  label: { ru: 'Запланировать', en: 'Schedule' },
  description:
    'Schedule an adaptation at a firm time («Запланировать»): the post goes out by itself then. In the web chat the person approves it on a card: call the tool, do not ask in text. Works on a draft or a reserve. If the text changed after the person’s «Да», it refuses (`APPROVAL_CONTENT_CHANGED`): call it again so they see the new text. Over MCP there is no card and no second question: call it only when the person asked for this very action and named the time; if they did not, ask them first in your own words.' +
    ZONE_NOTE,
  input: z.object({ pieceId, adaptationId, at, timeZone: namedTimeZoneInput }),
  risk: 'confirm',
  // Undone from the product («Снять с расписания»); over MCP the person's
  // request names the action and time, so it runs at once (`kcxz.52`).
  mcpConfirm: 'request',
  card: 'plan',
  door: door(ContentPieceController, 'scheduleAdaptation'),
  untrusted: [],
  describeApproval: async (asked, input) => {
    // The question over MCP says times in the zone the call names (`kcxz.42`).
    const ctx = withPlanZone({ ...asked, entrance: asked.entrance ?? 'chat' }, input.timeZone, NOTHING_CHANGED);
    const subject = await approvalSubject(ctx, input);
    if (!subject) return APPROVAL_MISSING[ctx.language](input.adaptationId);
    const when = localTime(input.at, subject.zone, ctx.language);
    const blocked = notADraft(subject, ctx.language);
    const head =
      ctx.language === 'ru'
        ? `Запланировать пост заготовки ${subject.code} в канале «${subject.channel}» на ${when}`
        : `Schedule the post of piece ${subject.code} in “${subject.channel}” for ${when}`;
    if (blocked) return `${head}${blocked}`;
    // What can still be undone, said here so the line and the card's footnote
    // agree (kcxz.31 D7): a scheduled post comes off the schedule until it is out.
    const effect =
      ctx.language === 'ru'
        ? ': в это время он выйдет сам, до выхода его можно снять с расписания'
        : ': it goes out by itself at that time and can be taken off the schedule until then';
    return `${head}${effect}${await sideEffects(ctx, subject)}. ${excerptOf(subject.row, ctx.language)}`;
  },
  approvalContent: postContent,
  run: async (asked, input): Promise<Slot> => {
    const ctx = withPlanZone(asked, input.timeZone, NOTHING_CHANGED);
    const { row } = await storedAdaptation(ctx, input.pieceId, input.adaptationId);
    if (!row) throw adaptationMissing();
    // `buildSchedulePayload({ date })`.
    const written = (await ctx
      .service(PieceService)
      .scheduleAdaptation(
        ctx.organizationId,
        input.pieceId,
        input.adaptationId,
        { date: new Date(input.at).toISOString() },
        ctx.language
      )) as { adaptation?: StoredAdaptation };
    return slotAfter(ctx, input, written.adaptation, row);
  },
  summarize: slotSummary,
  cardOf: slotCard,
});

export const planPublishNow = defineCapability({
  id: 'plan.publish_now',
  group: 'plan',
  label: { ru: 'Опубликовать сейчас', en: 'Publish now' },
  description:
    'Publish an adaptation now («Опубликовать сейчас»): the post goes to the channel at once and cannot be taken back. The person approves it on a card first; call the tool, do not ask in text. If the text changed after the person’s «Да», it refuses (`APPROVAL_CONTENT_CHANGED`): call it again so they see the new text.',
  input: z.object({ pieceId, adaptationId }),
  risk: 'confirm',
  card: 'plan',
  door: door(ContentPieceController, 'scheduleAdaptation'),
  untrusted: [],
  describeApproval: async (ctx, input) => {
    const subject = await approvalSubject(ctx, input);
    if (!subject) return APPROVAL_MISSING[ctx.language](input.adaptationId);
    const blocked = notADraft(subject, ctx.language);
    const head =
      ctx.language === 'ru'
        ? `Опубликовать сейчас пост заготовки ${subject.code} в канале «${subject.channel}»`
        : `Publish the post of piece ${subject.code} in “${subject.channel}” now`;
    if (blocked) return `${head}${blocked}`;
    // What happens. The true limit (kcxz.31 D7) — a post that is out cannot
    // be taken back from here — is the card's own footnote for this tool
    // («Сразу в канал: …»), said once (kcxz.32, N5); nothing here says it can
    // be cancelled later.
    const effect =
      ctx.language === 'ru' ? ': он уйдёт в канал сразу' : ': it goes to the channel at once';
    return `${head}${effect}${await sideEffects(ctx, subject)}. ${excerptOf(subject.row, ctx.language)}`;
  },
  approvalContent: postContent,
  run: async (ctx, input): Promise<Slot> => {
    const { row } = await storedAdaptation(ctx, input.pieceId, input.adaptationId);
    if (!row) throw adaptationMissing();
    // `buildSchedulePayload({ now: true })`.
    const written = (await ctx
      .service(PieceService)
      .scheduleAdaptation(ctx.organizationId, input.pieceId, input.adaptationId, { now: true }, ctx.language)) as {
      adaptation?: StoredAdaptation;
    };
    return slotAfter(ctx, input, written.adaptation, row);
  },
  summarize: slotSummary,
  cardOf: slotCard,
});

/**
 * `CF_QUEUE_BUSY` from `PUT /posts/:id/date` carries the gate's English
 * sentence; the calendar says it through `post-save-error.ts`
 * (`cf_queue_busy_refusal`). These are the same words, so the agent says what
 * the calendar says (`tests/agent-plan.words.test.cjs` holds them together).
 */
export const CF_QUEUE_BUSY_WORDS = {
  ru: 'В этом канале уже запланирована другая версия этого поста. Сначала снимите её с расписания.',
  en: 'Another version of this post is already scheduled in this channel. Unschedule it first.',
} as const;

/**
 * `POST_STATE_CHANGED` (kcxz.30): the post went out, failed or was taken
 * off the schedule (kcxz.38) between the read and the write, so nothing was
 * moved. The calendar's sentence
 * (`post_state_changed_refusal`) up to its «reload the calendar».
 */
export const POST_STATE_CHANGED_WORDS = {
  ru: 'Состояние этого поста только что изменилось — возможно, он уже вышел. Ничего не перенесли.',
  en: 'This post has just changed state — it may have already gone out. Nothing was moved.',
} as const;

/** The calendar never drops a post into the past (`canDrop`); a minute of grace, as the doors. */
const PAST_GRACE_MS = 60_000;

export const planMove = defineCapability({
  id: 'plan.move',
  group: 'plan',
  label: { ru: 'Перенести пост', en: 'Move a post' },
  description:
    'Move a scheduled (queued) post to another time, as dragging it in the calendar does; it stays scheduled and goes out by itself at the new time. In the web chat the person approves it on a card. For a reserve use plan.place instead (no card). If the text changed after the person’s «Да», it refuses (`APPROVAL_CONTENT_CHANGED`): call it again so they see the new text. Over MCP there is no card and no second question: call it only when the person asked for this very action and named the time; if they did not, ask them first in your own words.' +
    ZONE_NOTE,
  input: z.object({ pieceId, adaptationId, at, timeZone: namedTimeZoneInput }),
  risk: 'confirm',
  // A scheduled post still comes off the schedule; over MCP the person's
  // request names the new time, so it runs at once (`kcxz.52`).
  mcpConfirm: 'request',
  card: 'plan',
  door: door(PostsController, 'changeDate'),
  untrusted: [],
  describeApproval: async (asked, input) => {
    // The question over MCP says times in the zone the call names (`kcxz.42`).
    const ctx = withPlanZone({ ...asked, entrance: asked.entrance ?? 'chat' }, input.timeZone, NOTHING_CHANGED);
    const subject = await approvalSubject(ctx, input);
    if (!subject) return APPROVAL_MISSING[ctx.language](input.adaptationId);
    const from = localTime(slotTimeOf(subject.row), subject.zone, ctx.language);
    const to = localTime(input.at, subject.zone, ctx.language);
    if (subject.row.state !== 'queued') {
      return ctx.language === 'ru'
        ? `Перенести пост заготовки ${subject.code} в канале «${subject.channel}» на ${to} — но он не запланирован, переносить нечего`
        : `Move the post of piece ${subject.code} in “${subject.channel}” to ${to} — but it is not scheduled, there is nothing to move`;
    }
    return ctx.language === 'ru'
      ? `Перенести запланированный пост заготовки ${subject.code} в канале «${subject.channel}» с ${from} на ${to}: он выйдет сам в новое время, до выхода его можно снять с расписания. ${excerptOf(subject.row, ctx.language)}`
      : `Move the scheduled post of piece ${subject.code} in “${subject.channel}” from ${from} to ${to}: it goes out by itself at the new time and can be taken off the schedule until then. ${excerptOf(subject.row, ctx.language)}`;
  },
  approvalContent: postContent,
  run: async (asked, input): Promise<Slot> => {
    const ctx = withPlanZone(asked, input.timeZone, NOTHING_CHANGED);
    const { row } = await storedAdaptation(ctx, input.pieceId, input.adaptationId);
    if (!row) throw adaptationMissing();
    if (row.state !== 'queued' || !row.postId) {
      throw codedFailure(
        'PLAN_NOT_SCHEDULED',
        'This post is not scheduled, so there is nothing to move; nothing was changed. A reserve moves with plan.place.'
      );
    }
    const moment = new Date(input.at);
    if (moment.getTime() < Date.now() - PAST_GRACE_MS) {
      throw codedFailure(
        'PLAN_TIME_PAST',
        'That time has already passed; nothing was moved. Ask the person for a later time.'
      );
    }
    try {
      // The calendar's drag body (`calendar.tsx`): the UTC wall time, `schedule`.
      // Only from the queue (`kcxz.38`, review P3-2): a post unscheduled
      // since the read above is refused (`POST_STATE_CHANGED`), never moved
      // as a draft and then called «scheduled».
      await ctx
        .service(PostsService)
        .changeDate(ctx.organizationId, row.postId, moment.toISOString().slice(0, 19), 'schedule', ['QUEUE']);
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'CF_QUEUE_BUSY') {
        throw codedFailure('CF_QUEUE_BUSY', CF_QUEUE_BUSY_WORDS[ctx.language]);
      }
      if ((error as { code?: unknown })?.code === 'POST_STATE_CHANGED') {
        throw codedFailure('POST_STATE_CHANGED', POST_STATE_CHANGED_WORDS[ctx.language]);
      }
      throw error;
    }
    const zone = personZone(ctx);
    const time = moment.toISOString();
    return {
      pieceId: input.pieceId,
      adaptationId: input.adaptationId,
      channel: channelOf(row),
      state: 'scheduled',
      at: time,
      local: localTime(time, zone, ctx.language),
    };
  },
  summarize: slotSummary,
  cardOf: slotCard,
});

/* ---- «Ко всем N» ----------------------------------------------------------- */

const PLAN_MODE_WORDS = {
  ru: { draft: '«Без плана»', reserve: '«Бронь»', autopilot: '«Автопилот»' },
  en: { draft: '“No plan”', reserve: '“Reserve”', autopilot: '“Autopilot”' },
} as const;
const PLAN_MODE_EFFECT = {
  ru: {
    draft: 'они станут черновиками без плана',
    reserve: 'они встанут в план бронью и выйдут только после подтверждения',
    autopilot: 'они встанут в очередь и выйдут сами',
  },
  en: {
    draft: 'they become drafts without a plan',
    reserve: 'they are held in the plan as reserves and go out only once confirmed',
    autopilot: 'they join the queue and go out by themselves',
  },
} as const;

const PLAN_MODES = ['draft', 'reserve', 'autopilot'] as const;

export const planApply = defineCapability({
  id: 'plan.apply',
  group: 'plan',
  label: { ru: 'Режим канала ко всем постам', en: 'Channel mode to every post' },
  description:
    '«Ко всем N»: apply the channel’s plan mode to its written posts that have no mode of their own (on autopilot they join the queue and go out by themselves). Pass the mode the channel has now (from the snapshot); if it changed since, the product refuses. The person approves it on a card that names N; if N changed after their «Да», it refuses (`APPROVAL_CONTENT_CHANGED`): call it again so they see the new N.',
  input: z.object({
    channelId,
    planMode: z.enum(PLAN_MODES).describe('The channel’s current plan mode, as the snapshot shows it'),
  }),
  risk: 'confirm',
  door: door(ContentPieceController, 'applyChannelPlanMode'),
  untrusted: [],
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const [impact, channels] = await Promise.all([
      ctx
        .service(PieceService)
        .channelPlanImpact(ctx.organizationId, input.channelId, ctx.language)
        .catch(() => null),
      ctx
        .service(IntegrationService)
        .getIntegrationsForChannelList(ctx.organizationId)
        .catch(() => []),
    ]);
    const channel = (channels as Array<{ id: string; name?: string | null }>).find(
      (one) => one.id === input.channelId
    );
    if (!impact || !channel) {
      return ru
        ? `Канала ${input.channelId} в этом пространстве нет — ничего не изменится`
        : `There is no channel ${input.channelId} in this workspace — nothing will change`;
    }
    const name = String(channel.name || input.channelId);
    const current = impact.planMode as (typeof PLAN_MODES)[number];
    if (current !== input.planMode) {
      return ru
        ? `Режим канала «${name}» уже ${PLAN_MODE_WORDS.ru[current] ?? current}, а не ${PLAN_MODE_WORDS.ru[input.planMode]} — ничего не изменится`
        : `The mode of “${name}” is now ${PLAN_MODE_WORDS.en[current] ?? current}, not ${PLAN_MODE_WORDS.en[input.planMode]} — nothing will change`;
    }
    return ru
      ? `Применить режим ${PLAN_MODE_WORDS.ru[current]} канала «${name}» ко всем написанным постам (${impact.count}): ${PLAN_MODE_EFFECT.ru[current]}`
      : `Apply the ${PLAN_MODE_WORDS.en[current]} mode of “${name}” to all its written posts (${impact.count}): ${PLAN_MODE_EFFECT.en[current]}`;
  },
  // N as the card named it, recomputed when the call runs (review W2 F10).
  approvalContent: async (ctx, input) => {
    const impact = await ctx
      .service(PieceService)
      .channelPlanImpact(ctx.organizationId, input.channelId, ctx.language)
      .catch(() => null);
    return impact ? { count: impact.count, planMode: impact.planMode } : null;
  },
  run: async (ctx, input) => {
    // The channel card's body (`ChannelPlanApplyDto`): the mode it answered for.
    const applied = (await ctx
      .service(PieceService)
      .applyChannelPlanMode(ctx.organizationId, input.channelId, input.planMode, ctx.language)) as {
      count?: number;
      applied?: number;
    };
    return {
      channelId: input.channelId,
      planMode: input.planMode,
      count: Number(applied.count ?? 0),
      applied: Number(applied.applied ?? 0),
    };
  },
  summarize: (output) => ({ ...output }),
});
