import { z } from 'zod';
import { IntegrationsController } from '@contentfactory/backend/api/routes/integrations.controller';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import { deleteChannelWithPosts } from '@contentfactory/nestjs-libraries/database/prisma/integrations/delete-channel';
import { CHANNEL_ADDRESS_FORMS } from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile.v2.contract';
import { CHANNEL_MIN_IDEAL_LENGTH } from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile';
import type { ChannelConnectFlow } from '../agent-parts.contract';
import {
  defineCapability,
  door,
  type ApprovalDescribeContext,
  type CapabilityRunContext,
} from '../capability.types';
import { localTime, zoneOffsetMinutes } from '../person-time';
import { namedTimeZone, namedTimeZoneInput } from './named-zone';
import { CTA, EMOJI, HASHTAGS, LINKS, rememberOnChannel } from './adaptation.capabilities';
import { codedFailure } from './selection';

/**
 * Channels from the chat (spec §5.2 «Каналы», `content-factory-next-kcxz.19`).
 *
 * Every capability calls the service step its `IntegrationsController` door
 * calls and names that door, so the door's `@CheckPolicies` decide who may:
 * reading is anyone's, the writing card and the plan mode are an editor's,
 * everything about the channel's life — connecting, posting times, the bot,
 * switching off, deleting — an administrator's.
 *
 * Connecting never passes through the model: the approval card is followed
 * by a `channel-connect` card the browser acts on — the onboarding's
 * Telegram steps (the word and the polling stay in the page) or the
 * platform's own window, opened the way «Каналы» opens it. The model hears
 * only which platform and that the card is shown.
 */

const channelId = z
  .string()
  .min(1)
  .max(128)
  .describe('Channel id from workspace.snapshot or channels.list');

type ServiceContext = Pick<CapabilityRunContext, 'organizationId' | 'service'>;

type ListRow = {
  id: string;
  name: string;
  providerIdentifier: string;
  disabled?: boolean;
  refreshNeeded?: boolean;
  inBetweenSteps?: boolean;
  postingTimes?: string | null;
  _count?: { posts?: number };
};

const CHANNEL_MISSING = 'There is no such channel in this workspace; nothing was done.';

/**
 * The channel as the list door reads it, in the caller's workspace only, or
 * `CHANNEL_NOT_FOUND`. Shared with the analytics and texts reads (`kcxz.24`).
 */
export const channelRow = async (ctx: ServiceContext, id: string): Promise<ListRow> => {
  const rows = (await ctx
    .service(IntegrationService)
    .getIntegrationsForChannelList(ctx.organizationId)) as unknown as ListRow[];
  const row = rows.find((one) => one.id === id);
  if (!row) throw codedFailure('CHANNEL_NOT_FOUND', CHANNEL_MISSING);
  return row;
};

/** A channel named for the person on an approval card, or `null`. */
const channelNamed = async (ctx: ApprovalDescribeContext, id: string) =>
  channelRow(ctx, id).then(
    (row) => row,
    () => null
  );

const quoted = (name: string, ru: boolean) => (ru ? `«${name}»` : `“${name}”`);

const noChannelLine = (id: string, ru: boolean) =>
  ru
    ? `Канала ${id} в этом пространстве нет — ничего не изменится`
    : `There is no channel ${id} in this workspace — nothing will change`;

/**
 * A door's own refusal (`HttpException({ code })`), kept under its code: the
 * card's checks — a range below the floor, an unknown avatar — are the
 * service's, and the model says them in the service's terms.
 */
const serviceRefusal = (error: unknown) => {
  const response = (error as { getResponse?: () => unknown })?.getResponse?.();
  const code = (response as { code?: unknown })?.code;
  if (typeof code !== 'string') return error;
  const reason = (response as { reason?: unknown })?.reason;
  return codedFailure(code, typeof reason === 'string' ? `${code}: ${reason}` : code);
};

/* ---- Posting times ------------------------------------------------------- */

/**
 * The stored slot is minutes after UTC midnight, written by the screen's time
 * table as the local clock minus the zone's offset (`time.table.tsx`
 * `addHour`), and read back the same way. The chat reads and writes it in the
 * person's zone (`identity.timeZone`), as the screens do in the browser's.
 */
const slotOfClock = (clock: string, zone: string, at: Date) => {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes - zoneOffsetMinutes(zone, at);
};
const clockOfSlot = (slot: number, zone: string, at: Date) => {
  const day = 24 * 60;
  const local = (((slot + zoneOffsetMinutes(zone, at)) % day) + day) % day;
  return `${String(Math.floor(local / 60)).padStart(2, '0')}:${String(local % 60).padStart(2, '0')}`;
};
const storedSlots = (value: unknown): number[] => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return (Array.isArray(parsed) ? parsed : [])
      .map((slot: { time?: unknown }) => slot?.time)
      .filter((time): time is number => typeof time === 'number' && Number.isFinite(time));
  } catch {
    return [];
  }
};
const clocksOf = (slots: number[], zone: string, at: Date) =>
  [...new Set(slots.map((slot) => clockOfSlot(slot, zone, at)))].sort();

/* ---- Reading ------------------------------------------------------------- */

type WritingCard = {
  length: string | { min: number; max: number; hardMax: number | null };
  emoji: string;
  links: string;
  hashtags: string;
  cta: string;
  format: string;
  avatarId: string | null;
  addressForm: string;
  notes: string | null;
};

type ChannelRead = {
  channelId: string;
  name: string;
  platform: string;
  state: 'active' | 'disabled' | 'refresh' | 'incomplete';
  posts: number;
  planMode: string | null;
  /** The mode was written by someone, not the `reserve` default (review W3-21 P2-1). */
  planModeChosen: boolean | null;
  times: string[];
  timeZone: string;
  writing: WritingCard | null;
  /** `false` — the card was never saved; the platform's defaults apply. */
  writingStored: boolean;
  platformMaxLength: number | null;
};

const writingCardOf = (profile: Record<string, any>): WritingCard => {
  const length = profile.lengthPolicy;
  return {
    length:
      length && typeof length === 'object'
        ? {
            min: Number(length.idealMin),
            max: Number(length.idealMax),
            hardMax: typeof length.hardMax === 'number' ? length.hardMax : null,
          }
        : String(length ?? 'provider_max'),
    emoji: String(profile.emojiLevel ?? ''),
    links: String(profile.linkPolicy ?? ''),
    hashtags: String(profile.hashtagPolicy ?? ''),
    cta: String(profile.ctaKind ?? ''),
    format: String(profile.formatPreference ?? ''),
    avatarId: typeof profile.brandProfileId === 'string' ? profile.brandProfileId : null,
    addressForm: typeof profile.addressForm === 'string' ? profile.addressForm : 'avatar',
    notes: typeof profile.notes === 'string' && profile.notes.trim() ? profile.notes : null,
  };
};

const stateOf = (row: ListRow): ChannelRead['state'] =>
  row.inBetweenSteps
    ? 'incomplete'
    : row.disabled
      ? 'disabled'
      : row.refreshNeeded
        ? 'refresh'
        : 'active';

/**
 * The channel's posts as the chat counts them: every root post not deleted,
 * drafts and published included — exactly what deleting the channel removes
 * (review W3-19 P3-8). `channel.open` and the delete card say this one number;
 * the «Каналы» list counts only published, queued and failed posts.
 */
const channelPostIds = (ctx: ServiceContext, id: string): Promise<string[]> =>
  ctx.service(PostsService).channelPostIds(ctx.organizationId, id);

const readChannel = async (
  ctx: CapabilityRunContext,
  id: string
): Promise<ChannelRead> => {
  const row = await channelRow(ctx, id);
  const integrations = ctx.service(IntegrationService);
  const [profile, plan, posts] = await Promise.all([
    integrations.getWritingProfile(ctx.organizationId, id).catch(() => null),
    integrations.getPlanMode(ctx.organizationId, id).catch(() => null),
    channelPostIds(ctx, id),
  ]);
  const now = new Date();
  return {
    channelId: row.id,
    name: row.name,
    platform: row.providerIdentifier,
    state: stateOf(row),
    posts: posts.length,
    planMode: plan?.planMode ?? null,
    planModeChosen: plan ? plan.chosen : null,
    times: clocksOf(storedSlots(row.postingTimes), ctx.timeZone, now),
    timeZone: ctx.timeZone,
    writing: profile?.profile ? writingCardOf(profile.profile as Record<string, any>) : null,
    writingStored: profile?.stored === true,
    platformMaxLength:
      typeof profile?.provider?.maxLength === 'number' ? profile.provider.maxLength : null,
  };
};

/** The persisted channel card: the panel opens the channel screen by id. */
const channelCard = (output: { channelId: string; name?: string; platform?: string }) => ({
  kind: 'channel' as const,
  id: output.channelId,
  ...(output.name ? { name: output.name } : {}),
  ...(output.platform ? { provider: output.platform } : {}),
});

export const channelOpen = defineCapability({
  id: 'channel.open',
  group: 'channels',
  label: { ru: 'Открыть канал', en: 'Open a channel' },
  description:
    'Read one channel, free: its state, the writing card («Как пишем»: length — `provider_max`, `auto` or a range; emoji, links, hashtags, call to action, format, the avatar that writes, the address form), the plan mode (`draft` «Без плана», `reserve` «Бронь», `autopilot`; a channel whose mode nobody chose reads `reserve` with `planModeChosen: false`), the posting times in the person’s zone, and how many posts it has (every post not deleted, drafts and published included — the number deleting the channel would remove; channels.list counts only published, queued and failed ones). The channel opens beside the chat as a card; do not retype it.',
  input: z.object({ channelId }),
  risk: 'read',
  card: 'channel',
  door: door(IntegrationsController, 'getWritingProfile'),
  // The channel's name is set on the platform; the card's notes are typed by people.
  untrusted: ['workspace-text'],
  run: (ctx, input) => readChannel(ctx, input.channelId),
  summarize: (output) => ({ ...output }),
  cardOf: channelCard,
});

/** Posts the model is shown at most; the channel screen lists three. */
const POSTS_MAX = 10;

const firstLine = (content: unknown) =>
  (String(content ?? '')
    .replace(/<br\s*\/?>(?:\s*)|<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .split('\n')
    .find((line) => line.trim()) ?? '')
    .trim()
    .slice(0, 160);

export const channelPosts = defineCapability({
  id: 'channel.posts',
  group: 'channels',
  label: { ru: 'Последние посты канала', en: 'Recent posts of a channel' },
  description:
    'Read the latest published, queued or failed posts of one channel (the channel page’s «Последние посты»): when, the state and the first line of each, plus the total. Free.',
  input: z.object({
    channelId,
    limit: z.number().int().min(1).max(POSTS_MAX).optional().describe('How many, 3 if unnamed'),
  }),
  risk: 'read',
  door: door(IntegrationsController, 'getChannelPosts'),
  // Posts that went out may quote anybody; the platform may have changed them.
  untrusted: ['channel-post'],
  run: async (ctx, input) => {
    await channelRow(ctx, input.channelId);
    const answer = (await ctx
      .service(IntegrationService)
      .getChannelPosts(ctx.organizationId, input.channelId, input.limit ?? 3)) as {
      total: number;
      posts: Array<{ id: string; content: string; publishDate: Date | string; state: string }>;
    };
    return {
      channelId: input.channelId,
      total: answer.total,
      posts: answer.posts.map((post) => ({
        id: post.id,
        state: post.state === 'PUBLISHED' ? 'published' : post.state === 'ERROR' ? 'error' : 'queued',
        local: localTime(post.publishDate, ctx.timeZone, ctx.language),
        firstLine: firstLine(post.content),
      })),
    };
  },
  summarize: (output) => ({ ...output }),
});

/* ---- Changing ------------------------------------------------------------ */

const LENGTHS = ['provider_max', 'auto', 'range'] as const;

export const channelWriting = defineCapability({
  id: 'channel.writing',
  group: 'channels',
  label: { ru: 'Карточка «Как пишем»', en: 'The writing card' },
  description:
    'Change the channel’s writing card («Как пишем в «X»»), for every next post of the channel: `length` — `provider_max` (as long as the platform takes), `auto` (we decide per post) or `range` with `lengthMin`/`lengthMax` (and optionally `lengthHardMax`, characters; the numbers alone mean `range`, and on a card that already has a range the ones not named stay; «до 800 знаков» is `lengthMax: 800` alone — the ceiling, so the hard maximum becomes 800 too (a range «400–800» keeps the card’s hard maximum while it fits); never invent a minimum: the card keeps the one it has while it fits, else none); emoji, hashtags, links, call to action; the avatar that writes here; the address form (`avatar` — as the avatar says, `ty`, `vy`). Pass only what the person asked to change; the rest stays. Reversible on the channel card.',
  input: z.object({
    channelId,
    length: z.enum(LENGTHS).optional().describe('Length rule, only when asked'),
    lengthMin: z.number().int().min(1).max(100000).optional().describe('Range: the shortest good post, characters — only when the person named one'),
    lengthMax: z.number().int().min(1).max(100000).optional().describe('Range: the longest good post, characters'),
    lengthHardMax: z.number().int().min(1).max(100000).optional().describe('Range: never longer than this, characters'),
    emojiLevel: EMOJI.optional().describe('Emoji density, only when asked'),
    hashtagPolicy: HASHTAGS.optional().describe('Hashtags, only when asked'),
    linkPolicy: LINKS.optional().describe('Links in the text, only when asked'),
    ctaKind: CTA.optional().describe('Call to action, only when asked'),
    avatarId: z.string().min(1).max(128).optional().describe('The avatar that writes in this channel, id from the snapshot'),
    addressForm: z.enum(CHANNEL_ADDRESS_FORMS).optional().describe('How the channel addresses readers, only when asked'),
  }),
  risk: 'write',
  card: 'channel',
  door: door(IntegrationsController, 'updateWritingProfile'),
  untrusted: [],
  run: async (ctx, input) => {
    const row = await channelRow(ctx, input.channelId);
    const numbers = [input.lengthMin, input.lengthMax, input.lengthHardMax].some(
      (value) => value !== undefined
    );
    // Numbers name a range (review W3-19 P3-7, decided: implied, not refused);
    // numbers beside another length rule contradict each other.
    if (numbers && input.length && input.length !== 'range') {
      throw codedFailure(
        'CHANNEL_WRITING_LENGTH_CONFLICT',
        `Length numbers go with a range, not with “${input.length}”; nothing was changed.`
      );
    }
    const range = input.length === 'range' || numbers;
    const length = range ? 'range' : input.length;
    const changed = [
      ...(length ? ['length'] : []),
      ...['emojiLevel', 'hashtagPolicy', 'linkPolicy', 'ctaKind', 'avatarId', 'addressForm'].filter(
        (key) => (input as Record<string, unknown>)[key] !== undefined
      ),
    ];
    if (!changed.length) {
      throw codedFailure('CHANNEL_WRITING_EMPTY', 'Nothing to change was named; nothing was changed.');
    }
    // Written inside the card's update, read after it.
    const saved: {
      range: { lengthMin: number | null; lengthMax: number; lengthHardMax: number | null } | null;
      hardMaxChanged: { from: number | null; to: number | null } | null;
      minimumDropped: number | null;
    } = { range: null, hardMaxChanged: null, minimumDropped: null };
    try {
      await rememberOnChannel(ctx, input.channelId, (current, card) => {
        // What the card stores for a range; a number not named stays as it is.
        // A card never saved has no numbers of its own: the platform's
        // defaults (a Telegram card's 500–1000/1500) are not a minimum or a
        // ceiling the person had, so «до 800» there stores no minimum and
        // reports no changed hard maximum (final recheck F-2a).
        const stored =
          card.saved && current.lengthPolicy && typeof current.lengthPolicy === 'object'
            ? (current.lengthPolicy as { idealMin?: unknown; idealMax?: unknown; hardMax?: unknown })
            : null;
        const kept = (value: unknown) => (typeof value === 'number' ? value : undefined);
        const idealMax = input.lengthMax ?? kept(stored?.idealMax);
        // «до N знаков» — a maximum with no (real) minimum named (W3 walk
        // P2-C, recheck R-3, review F5 — decided for the person): N is the
        // ceiling, so the hard maximum is N too unless they named one; the
        // platform's own limit is the service's rule. A range «400–800» and a
        // minimum alone keep a stored hard maximum while it fits (review
        // W3-19 P3-7).
        const maxOnly =
          input.lengthMax !== undefined &&
          (input.lengthMin === undefined || input.lengthMin < CHANNEL_MIN_IDEAL_LENGTH);
        const keptHard = kept(stored?.hardMax);
        const hardMax =
          input.lengthHardMax ??
          (maxOnly
            ? input.lengthMax
            : keptHard !== undefined && (idealMax === undefined || keptHard >= idealMax)
              ? keptHard
              : undefined);
        // The minimum is the one named, else the stored one while it still
        // fits under the maximum, else none — «до N» has no lower bound, and
        // the card does not invent one. A named minimum under the floor of a
        // post (`CHANNEL_MIN_IDEAL_LENGTH`; the walk's model sent 1 for «no
        // minimum») means none too, and the answer says so. The floor itself
        // is never stored as a minimum.
        const keptMin = kept(stored?.idealMin);
        let idealMin: number | null;
        if (input.lengthMin !== undefined) {
          if (input.lengthMin >= CHANNEL_MIN_IDEAL_LENGTH) {
            idealMin = input.lengthMin;
          } else {
            idealMin = null;
            saved.minimumDropped = input.lengthMin;
          }
        } else {
          idealMin =
            keptMin !== undefined && (idealMax === undefined || keptMin <= idealMax)
              ? keptMin
              : null;
        }
        if (range && idealMax === undefined) {
          throw codedFailure(
            'CHANNEL_WRITING_PROFILE_INVALID',
            'A range needs at least lengthMax (the longest good post); nothing was changed.'
          );
        }
        if (range) {
          saved.range = { lengthMin: idealMin, lengthMax: idealMax!, lengthHardMax: hardMax ?? null };
          if (keptHard !== undefined && keptHard !== hardMax) {
            saved.hardMaxChanged = { from: keptHard, to: hardMax ?? null };
          }
        }
        return {
          ...(length
            ? {
                lengthPolicy: range
                  ? { idealMin, idealMax, ...(hardMax ? { hardMax } : {}) }
                  : length,
              }
            : {}),
          ...(input.emojiLevel ? { emojiLevel: input.emojiLevel } : {}),
          ...(input.hashtagPolicy ? { hashtagPolicy: input.hashtagPolicy } : {}),
          ...(input.linkPolicy ? { linkPolicy: input.linkPolicy } : {}),
          ...(input.ctaKind ? { ctaKind: input.ctaKind } : {}),
          ...(input.avatarId ? { brandProfileId: input.avatarId } : {}),
          ...(input.addressForm ? { addressForm: input.addressForm } : {}),
        };
      });
    } catch (error) {
      throw serviceRefusal(error);
    }
    return {
      channelId: input.channelId,
      name: row.name,
      platform: row.providerIdentifier,
      changed,
      ...(saved.range ? { length: saved.range } : {}),
      ...(saved.hardMaxChanged ? { hardMaxChanged: saved.hardMaxChanged } : {}),
      ...(saved.minimumDropped !== null
        ? {
            minimum: `none — a minimum under the ${CHANNEL_MIN_IDEAL_LENGTH}-character floor of a post (${saved.minimumDropped}) means no minimum`,
          }
        : {}),
    };
  },
  // The range as stored, so the agent says the numbers the card now holds;
  // a changed hard maximum and a dropped minimum are said, not hidden.
  summarize: (output) => ({
    channelId: output.channelId,
    changed: output.changed,
    ...(output.length ? { length: output.length } : {}),
    ...(output.hardMaxChanged ? { hardMaxChanged: output.hardMaxChanged } : {}),
    ...(output.minimum ? { minimum: output.minimum } : {}),
  }),
  cardOf: channelCard,
});

/** Reversible modes; «Автопилот» is `channel.autopilot`, behind a card. */
const QUIET_MODES = ['draft', 'reserve'] as const;

export const channelPlan = defineCapability({
  id: 'channel.plan',
  group: 'channels',
  label: { ru: 'Режим плана канала', en: 'Channel plan mode' },
  description:
    'Set the channel’s plan mode for its next posts: `draft` («Без плана» — posts stay drafts) or `reserve` («Бронь» — posts wait in the plan and go out only once confirmed). Posts already written keep their state; «Ко всем N» (plan.apply) brings them along. For autopilot use channel.autopilot.',
  input: z.object({
    channelId,
    planMode: z.enum(QUIET_MODES).describe('`draft` or `reserve`'),
  }),
  risk: 'write',
  card: 'channel',
  door: door(IntegrationsController, 'updatePlanMode'),
  untrusted: [],
  run: async (ctx, input) => {
    const row = await channelRow(ctx, input.channelId);
    const saved = await ctx
      .service(IntegrationService)
      .updatePlanMode(ctx.organizationId, input.channelId, input.planMode);
    return { channelId: input.channelId, name: row.name, platform: row.providerIdentifier, planMode: saved.planMode };
  },
  summarize: (output) => ({ channelId: output.channelId, planMode: output.planMode }),
  cardOf: channelCard,
});

export const channelTimes = defineCapability({
  id: 'channel.times',
  group: 'channels',
  label: { ru: 'Время публикаций', en: 'Posting times' },
  description:
    'Replace the channel’s usual posting times (the slots the plan offers first) with this list, as `HH:MM` in the person’s zone. Read channel.open first and pass the whole new list: times not in it are removed. An empty list removes all. `timeZone` (IANA, e.g. Europe/Moscow) only when the person named another zone; over MCP it is required for a non-empty list.',
  input: z.object({
    channelId,
    times: z
      .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe('HH:MM, the person’s zone'))
      .max(24),
    timeZone: namedTimeZoneInput,
  }),
  risk: 'write',
  card: 'channel',
  door: door(IntegrationsController, 'setTime'),
  untrusted: [],
  run: async (ctx, input) => {
    const row = await channelRow(ctx, input.channelId);
    const now = new Date();
    const clocks = [...new Set(input.times)].sort();
    // Over MCP a non-empty list names its zone (review W3-19 P3-9).
    const zone = namedTimeZone(ctx, input.timeZone, {
      prefix: 'CHANNEL',
      needed: clocks.length > 0,
      subject: 'Posting times',
      nothingDone: 'Nothing was changed.',
    });
    await ctx.service(IntegrationService).setTimes(ctx.organizationId, input.channelId, {
      time: clocks.map((clock) => ({ time: slotOfClock(clock, zone, now) })),
    });
    return {
      channelId: input.channelId,
      name: row.name,
      platform: row.providerIdentifier,
      times: clocks,
      timeZone: zone,
    };
  },
  summarize: (output) => ({ channelId: output.channelId, times: output.times, timeZone: output.timeZone }),
  cardOf: channelCard,
});

/* ---- Asking first -------------------------------------------------------- */

export const channelAutopilot = defineCapability({
  id: 'channel.autopilot',
  group: 'channels',
  label: { ru: 'Канал на автопилот', en: 'Channel to autopilot' },
  description:
    'Switch the channel to «Автопилот»: its next posts join the queue and go out by themselves. The person approves it on a card; posts already written keep their state.',
  input: z.object({ channelId }),
  risk: 'confirm',
  card: 'channel',
  door: door(IntegrationsController, 'updatePlanMode'),
  untrusted: [],
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const row = await channelNamed(ctx, input.channelId);
    if (!row) return noChannelLine(input.channelId, ru);
    return ru
      ? `Перевести канал ${quoted(row.name, true)} на автопилот: новые посты будут вставать в очередь и выходить сами, без подтверждения. Уже написанные останутся как есть`
      : `Switch ${quoted(row.name, false)} to autopilot: new posts will join the queue and go out by themselves, without confirmation. Posts already written stay as they are`;
  },
  run: async (ctx, input) => {
    const row = await channelRow(ctx, input.channelId);
    const saved = await ctx
      .service(IntegrationService)
      .updatePlanMode(ctx.organizationId, input.channelId, 'autopilot');
    return { channelId: input.channelId, name: row.name, platform: row.providerIdentifier, planMode: saved.planMode };
  },
  summarize: (output) => ({ channelId: output.channelId, planMode: output.planMode }),
  cardOf: channelCard,
});

type ConnectablePlatform = {
  identifier: string;
  name: string;
  isExternal?: boolean;
  isWeb3?: boolean;
  isChromeExtension?: boolean;
  customFields?: unknown;
};

/**
 * How a platform connects from the chat, by the flags the add-channel screen
 * reads (`add.provider.component.tsx`): Telegram by its steps, a platform
 * with a plain OAuth window by the button. Anything that needs its own form
 * — an instance address, custom fields, a wallet, the browser extension —
 * stays on «Каналы».
 */
const connectFlowOf = (platform: ConnectablePlatform): ChannelConnectFlow | null =>
  platform.identifier === 'telegram'
    ? 'telegram'
    : platform.isExternal || platform.isWeb3 || platform.isChromeExtension || platform.customFields
      ? null
      : 'oauth';

const platformsOf = async (ctx: Pick<CapabilityRunContext, 'service'>) =>
  ((await ctx.service(IntegrationManager).getAllIntegrations()).social ?? []) as ConnectablePlatform[];

const platformName = (platform: ConnectablePlatform) =>
  String(platform.name ?? platform.identifier).split('\n')[0].trim() || platform.identifier;

export const channelConnect = defineCapability({
  id: 'channel.connect',
  group: 'channels',
  label: { ru: 'Подключить канал', en: 'Connect a channel' },
  description:
    'Connect a new channel, after the person’s «Да» on a card. `provider` is the platform id: `telegram` shows the three Telegram steps (the bot as an admin, the `/connect` command, the channel appearing by itself); a platform with a sign-in window (`linkedin`, `x`, `facebook`, `instagram`, `threads`, `youtube`…) shows a button that opens it. The person does the rest on the card; nothing about the connection reaches you. When they say it is done, read the snapshot or channels.list for the new channel. Platforms that need their own form are connected on «Каналы»: the result says so.',
  input: z.object({
    provider: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9-]+$/)
      .describe('Platform id, e.g. telegram, linkedin, x'),
  }),
  risk: 'confirm',
  card: 'channel-connect',
  door: door(IntegrationsController, 'getIntegrationUrl'),
  untrusted: [],
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const platform = (await platformsOf(ctx).catch(() => [])).find(
      (one) => one.identifier === input.provider
    );
    if (!platform) {
      return ru
        ? `Площадки ${input.provider} у нас нет — ничего не подключится`
        : `There is no platform ${input.provider} — nothing will be connected`;
    }
    const flow = connectFlowOf(platform);
    const name = platformName(platform);
    if (flow === 'telegram') {
      return ru
        ? 'Подключить Telegram-канал к пространству: вы добавите нашего бота администратором канала, и посты отсюда смогут выходить в этот канал'
        : 'Connect a Telegram channel to the workspace: you add our bot as the channel’s admin, and posts from here can go out to it';
    }
    if (flow === 'oauth') {
      return ru
        ? `Подключить канал ${name}: откроется окно ${name}, где вы разрешите доступ, и посты отсюда смогут выходить в этот канал`
        : `Connect a ${name} channel: ${name}’s window opens for you to allow access, and posts from here can go out to it`;
    }
    return ru
      ? `${name} подключается на экране «Каналы» — здесь ничего не подключится`
      : `${name} is connected on the Channels screen — nothing will be connected here`;
  },
  run: async (ctx, input) => {
    const platform = (await platformsOf(ctx)).find((one) => one.identifier === input.provider);
    if (!platform) {
      throw codedFailure(
        'CHANNEL_PROVIDER_UNKNOWN',
        `There is no platform “${input.provider}”; nothing was connected.`
      );
    }
    const flow = connectFlowOf(platform);
    if (!flow) {
      throw codedFailure(
        'CHANNEL_CONNECT_ON_SCREEN',
        `${platformName(platform)} needs its own form; it is connected on the Channels screen. Nothing was connected.`
      );
    }
    const rows = (await ctx
      .service(IntegrationService)
      .getIntegrationsForChannelList(ctx.organizationId)) as unknown as ListRow[];
    return {
      provider: platform.identifier,
      name: platformName(platform),
      flow,
      known: rows.filter((row) => row.providerIdentifier === platform.identifier).map((row) => row.id),
      // When the card was made: it credits only a channel created after this,
      // within its window (review W3-19 P3-3, `arrivedChannelOf`).
      since: new Date().toISOString(),
    };
  },
  summarize: (output) => ({
    provider: output.provider,
    flow: output.flow,
    shown: 'card',
    next: 'The person follows the card; wait for them to say it is done.',
  }),
  cardOf: (output) => ({
    kind: 'channel-connect' as const,
    id: output.provider,
    provider: output.provider,
    name: output.name,
    flow: output.flow,
    known: output.known,
    since: output.since,
  }),
});

export const channelBotRename = defineCapability({
  id: 'channel.bot.rename',
  group: 'channels',
  label: { ru: 'Переименовать бота', en: 'Rename the bot' },
  description:
    'Rename the channel’s bot («Изменить бота» on the channel page), where the platform allows it (Discord, Slack; not Telegram). The channel is then shown under this name in the product too. Discord renames the bot on the server; Slack changes only the name here, not in Slack. The person approves it on a card.',
  input: z.object({
    channelId,
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^\S(?:.*\S)?$/)
      .describe('The bot’s new name, as the person said it, without surrounding spaces'),
  }),
  risk: 'confirm',
  card: 'channel',
  door: door(IntegrationsController, 'setNickname'),
  untrusted: [],
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const row = await channelNamed(ctx, input.channelId);
    if (!row) return noChannelLine(input.channelId, ru);
    // What really changes (review W3-19 P3-5): the channel's own name here
    // always (`updateNameAndUrl`); on the platform only where it renames.
    if (row.providerIdentifier === 'slack') {
      return ru
        ? `Переименовать бота канала ${quoted(row.name, true)} в ${quoted(input.name, true)}: имя сменится только у нас — канал будет называться так же. В самом Slack имя бота останется прежним`
        : `Rename the bot of ${quoted(row.name, false)} to ${quoted(input.name, false)}: only the name here changes — the channel will be called so too. In Slack itself the bot keeps its name`;
    }
    return ru
      ? `Переименовать бота канала ${quoted(row.name, true)} в ${quoted(input.name, true)} на самой площадке (${row.providerIdentifier}). Канал у нас тоже будет называться ${quoted(input.name, true)}`
      : `Rename the bot of ${quoted(row.name, false)} to ${quoted(input.name, false)} on the platform itself (${row.providerIdentifier}). The channel here will be called ${quoted(input.name, false)} too`;
  },
  run: async (ctx, input) => {
    const row = await channelRow(ctx, input.channelId);
    const provider = ctx.service(IntegrationManager).getSocialIntegration(row.providerIdentifier);
    if (!provider?.changeNickname) {
      throw codedFailure(
        'CHANNEL_BOT_RENAME_UNSUPPORTED',
        `${row.providerIdentifier} does not let a bot be renamed from here; nothing was changed.`
      );
    }
    const saved = (await ctx
      .service(IntegrationService)
      .changeNameOnPlatform(ctx.organizationId, input.channelId, { name: input.name })) as {
      name?: string;
    };
    return {
      channelId: input.channelId,
      name: saved?.name || input.name,
      platform: row.providerIdentifier,
    };
  },
  summarize: (output) => ({ channelId: output.channelId, renamed: true }),
  cardOf: channelCard,
});

export const channelDisable = defineCapability({
  id: 'channel.disable',
  group: 'channels',
  label: { ru: 'Выключить канал', en: 'Switch a channel off' },
  description:
    'Switch a channel off: nothing goes out to it until it is switched on again on the channel page. Scheduled posts that come due while it is off fail (they do not wait) and must be rescheduled. The person approves it on a card.',
  input: z.object({ channelId }),
  risk: 'confirm',
  card: 'channel',
  door: door(IntegrationsController, 'disableChannel'),
  untrusted: [],
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const row = await channelNamed(ctx, input.channelId);
    if (!row) return noChannelLine(input.channelId, ru);
    // The post workflow marks a due post of a disabled channel failed, it does
    // not hold it (review W3-19 P3-6).
    return ru
      ? `Выключить канал ${quoted(row.name, true)}: пока он выключен, ничего в него не выходит. Запланированные посты, чьё время придёт в это время, не будут ждать — они завершатся ошибкой, и их придётся поставить заново. Включить обратно можно на странице канала`
      : `Switch ${quoted(row.name, false)} off: while it is off, nothing goes out to it. Scheduled posts that come due meanwhile will not wait — they fail and must be rescheduled. It can be switched on again on the channel page`;
  },
  run: async (ctx, input) => {
    const row = await channelRow(ctx, input.channelId);
    await ctx.service(IntegrationService).disableChannel(ctx.organizationId, input.channelId);
    return { channelId: input.channelId, name: row.name, platform: row.providerIdentifier, disabled: true };
  },
  summarize: (output) => ({ channelId: output.channelId, disabled: output.disabled }),
  cardOf: channelCard,
});

export const channelDelete = defineCapability({
  id: 'channel.delete',
  group: 'channels',
  label: { ru: 'Удалить канал', en: 'Delete a channel' },
  description:
    'Delete a channel with every post of it: drafts, reserves and scheduled posts leave the plan and never go out; what was already published stays on the platform; a post written for several channels stays on the others. Cannot be undone. The person approves it on a card that says so; to only pause a channel, switch it off instead.',
  input: z.object({ channelId }),
  risk: 'confirm',
  door: door(IntegrationsController, 'deleteChannel'),
  untrusted: [],
  // «Да» is for the posts the card counted (review W3-19 P3-1): a post added
  // or removed before the answer shows the card again.
  approvalContent: async (ctx, input) => {
    const row = await channelNamed(ctx, input.channelId);
    return row ? { channelId: row.id, posts: await channelPostIds(ctx, row.id) } : null;
  },
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const row = await channelNamed(ctx, input.channelId);
    if (!row) return noChannelLine(input.channelId, ru);
    const count = (await channelPostIds(ctx, row.id).catch(() => [])).length;
    // Only this channel's posts go (P2-1): a post written for several
    // channels stays on the others.
    return ru
      ? `Удалить канал ${quoted(row.name, true)} и все его посты (${count}): черновики, брони и запланированные исчезнут из плана и не выйдут; уже опубликованное останется на площадке. Копии тех же постов в других каналах останутся`
      : `Delete ${quoted(row.name, false)} and every post of it (${count}): drafts, reserves and scheduled posts leave the plan and never go out; what was published stays on the platform. Copies of the same posts on other channels stay`;
  },
  run: async (ctx, input) => {
    // The chat's own lookup first (P3-2): a channel already deleted is
    // refused here, as its card said, instead of being deleted again.
    await channelRow(ctx, input.channelId);
    const deleted = await deleteChannelWithPosts(
      {
        integrations: ctx.service(IntegrationService),
        posts: ctx.service(PostsService),
      },
      ctx.organizationId,
      input.channelId
    );
    if (!deleted) throw codedFailure('CHANNEL_NOT_FOUND', CHANNEL_MISSING);
    return { channelId: input.channelId, deleted: true, posts: deleted.posts };
  },
  summarize: (output) => ({ ...output }),
});
