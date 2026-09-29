import { z } from 'zod';
import { ContentLeadController } from '@contentfactory/backend/api/routes/content-lead.controller';
import { ContentLeadService } from '@contentfactory/nestjs-libraries/content-intelligence/leads/content-lead.service';
import { MAX_TOPIC_QUERY_LENGTH } from '@contentfactory/nestjs-libraries/content-intelligence/leads/lead-topic-key';
import {
  defineCapability,
  door,
  type ApprovalDescribeContext,
  type CapabilityRunContext,
} from '../capability.types';
import { localTime } from '../person-time';
import { codedFailure, markUnspent } from './selection';

/**
 * Ideas from the chat (spec §5.2 «Идеи», §5.7, `content-factory-next-kcxz.23`).
 *
 * «Откуда идеи» holds subscriptions — a feed address, or a topic the product
 * searches the web for — and the leads («поводы») they bring back. Every
 * capability calls the `ContentLeadService` step its `ContentLeadController`
 * door calls and names that door, so the door's `@CheckPolicies` decide who
 * may: reading is anyone's, everything else an editor's.
 *
 * Risk by what really happens (spec §5.7):
 * - a feed subscription is `write`: its checks read an address, free;
 * - a topic subscription is `confirm` (owner, 27.09.2026): it starts a check
 *   at once and then one a day, each a web search that spends an AI
 *   operation, until somebody unsubscribes — a standing spend is approved on
 *   a card;
 * - «Проверить сейчас» is `paid`: a topic check searches; a feed check, a
 *   topic answered from the research cache, and a check refused before it
 *   read anything spend nothing and give the turn's paid slot back
 *   (`spentNothing`, `markUnspent`; review W4-23 F2, F4).
 *
 * Unsubscribing, «Не надо» and «Взять в работу» are `write` with
 * `asksInWebChat` (`kcxz.45`, review W4-23 F7): a lead's title is outside
 * text the model reads, so in the web chat each call waits for «Да» on an
 * approval card that names the subscription or the leads, read here by id.
 * «Не надо» takes up to `DISMISS_MAX` leads, so one card covers a batch.
 *
 * «Взять в работу» is two steps, as on the screen: `ideas.take` marks the
 * lead taken through its door, then `piece.create` with `sourceLeadId` writes
 * the piece from the lead the server reads — never from words the model
 * retyped — and the piece keeps the lead's address as its source.
 */

/** The ideas card opens «Откуда идеи» beside the chat; there is one. */
export const IDEAS_CARD_ID = 'leads';
const ideasCard = () => ({ kind: 'ideas' as const, id: IDEAS_CARD_ID });

const subscriptionId = z
  .string()
  .min(1)
  .max(128)
  .describe('Subscription id from ideas.list');
const leadId = z.string().min(1).max(128).describe('Lead id from ideas.queue');

/** The door's own limit on a subscription's name (`CreateContentLeadSubscriptionDto`). */
const NAME_MAX = 200;
/**
 * Words the approval card quotes are taken as sent — a confirm input is never
 * rewritten after the card (`assertCapabilityInput`) — so surrounding spaces
 * are refused rather than trimmed.
 */
const TRIMMED = /^\S(?:[\s\S]*\S)?$/;
const name = z
  .string()
  .min(1)
  .max(NAME_MAX)
  .regex(TRIMMED)
  .optional()
  .describe('What to call it in the list, only when the person named it; absent — we name it');

type ServiceContext = Pick<CapabilityRunContext, 'organizationId' | 'service'>;

const leadsOf = (ctx: Pick<CapabilityRunContext, 'service'>) => ctx.service(ContentLeadService);

type SubscriptionRow = {
  id: string;
  kind: string;
  displayName: string;
  canonicalUrl: string;
  query: string | null;
  state: string;
  lastCheckedAt: Date | string | null;
  lastErrorCode: string | null;
  leadsThisMonth: number;
  acceptedThisMonth: number;
};

type Subscriptions = {
  subscriptions: SubscriptionRow[];
  capabilities: { feedCheck: boolean; topicCheck: boolean };
};

const readSubscriptions = async (ctx: ServiceContext) =>
  (await leadsOf(ctx).listSubscriptions(ctx.organizationId)) as unknown as Subscriptions;

const SUBSCRIPTION_MISSING =
  'There is no such subscription in this workspace; nothing was done.';

/** One live subscription of the caller's workspace, as the list door reads it. */
const subscriptionRow = async (ctx: ServiceContext, id: string) => {
  const list = await readSubscriptions(ctx);
  const row = list.subscriptions.find((one) => one.id === id);
  if (!row) throw codedFailure('SUBSCRIPTION_NOT_FOUND', SUBSCRIPTION_MISSING);
  return { row, capabilities: list.capabilities };
};

const isTopic = (kind: string) => kind === 'TOPIC';

const checkingOn = (kind: string, capabilities: Subscriptions['capabilities']) =>
  isTopic(kind) ? capabilities.topicCheck : capabilities.feedCheck;

/** A subscription as the model reads it. */
const subscriptionOf = (
  row: SubscriptionRow,
  capabilities: Subscriptions['capabilities'],
  ctx: Pick<CapabilityRunContext, 'timeZone' | 'language'>
) => ({
  id: row.id,
  kind: isTopic(row.kind) ? ('topic' as const) : ('feed' as const),
  name: row.displayName,
  // What is watched: the topic as typed, or the feed's address — never the
  // derived `topic://` key.
  watches: isTopic(row.kind) ? row.query ?? row.displayName : row.canonicalUrl,
  state: String(row.state || '').toLowerCase(),
  lastChecked: row.lastCheckedAt ? localTime(row.lastCheckedAt, ctx.timeZone, ctx.language) : null,
  lastProblem: row.lastErrorCode ?? null,
  leadsThisMonth: row.leadsThisMonth ?? 0,
  takenThisMonth: row.acceptedThisMonth ?? 0,
  checking: checkingOn(row.kind, capabilities),
});

/* ---- Reading ------------------------------------------------------------- */

export const ideasList = defineCapability({
  id: 'ideas.list',
  group: 'ideas',
  label: { ru: 'Откуда идеи', en: 'Where ideas come from' },
  description:
    'List the subscriptions of «Откуда идеи»: each with its id, kind (`feed` — an address read for new items; `topic` — a subject we search the web for), what it watches, its state, when it was last checked (the person’s zone), the last problem code, and leads this month. `checking: false` means checking of that kind is switched off on this server: the subscription waits and starts by itself once it is on. Free. «Откуда идеи» opens beside the chat.',
  input: z.object({}),
  risk: 'read',
  card: 'ideas',
  door: door(ContentLeadController, 'listSubscriptions'),
  // Names and topics are typed by people; feed addresses are anybody's.
  untrusted: ['workspace-text'],
  run: async (ctx) => {
    const list = await readSubscriptions(ctx);
    return {
      subscriptions: list.subscriptions.map((row) => subscriptionOf(row, list.capabilities, ctx)),
      feedCheck: list.capabilities.feedCheck,
      topicCheck: list.capabilities.topicCheck,
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: ideasCard,
});

/** The door's statuses, in the words the chat uses. */
const SHOWN = { new: 'NEW', dismissed: 'DISMISSED', taken: 'ACCEPTED' } as const;
/** Leads the model is shown at most; the rest is on the screen beside it. */
const QUEUE_MAX = 20;
const EXCERPT_MAX = 280;

type LeadRow = {
  id: string;
  subscriptionId: string;
  subscriptionName: string | null;
  title: string;
  excerpt: string | null;
  sourceUrl: string;
  publishedAt: Date | string | null;
  reasonRu: string | null;
  reasonEn: string | null;
  status: string;
};

const cut = (text: string | null | undefined, max: number) => {
  const value = String(text ?? '').trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

export const ideasQueue = defineCapability({
  id: 'ideas.queue',
  group: 'ideas',
  label: { ru: 'Поводы', en: 'Leads' },
  description:
    'Read the leads («поводы») the subscriptions brought: new ones by default, newest first — each with its id, the subscription, title, a short excerpt, the address, when it was published (the person’s zone) and why it is a reason to write. `shown`: `new` (default), `dismissed` («Не надо») or `taken` («Взять в работу»). Free. The list opens beside the chat; name at most the few that matter, do not retype it all.',
  input: z.object({
    subscriptionId: subscriptionId.optional().describe('Only this subscription’s leads, when the person named one'),
    shown: z.enum(['new', 'dismissed', 'taken']).optional().describe('Which leads; `new` if unnamed'),
    limit: z.number().int().min(1).max(QUEUE_MAX).optional().describe('How many, 10 if unnamed'),
  }),
  risk: 'read',
  card: 'ideas',
  door: door(ContentLeadController, 'queue'),
  // Titles, excerpts and reasons come from feeds and search results.
  untrusted: ['lead'],
  run: async (ctx, input) => {
    const shown = input.shown ?? 'new';
    // A mistyped or foreign id is a refusal, not «no new leads» (review
    // W4-23 F9). An archived subscription counts: its leads stay.
    if (
      input.subscriptionId &&
      !(await leadsOf(ctx).subscriptionKnown(ctx.organizationId, input.subscriptionId))
    ) {
      throw codedFailure('SUBSCRIPTION_NOT_FOUND', SUBSCRIPTION_MISSING);
    }
    const { leads } = (await leadsOf(ctx).listLeads(ctx.organizationId, {
      status: SHOWN[shown],
      ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
    })) as unknown as { leads: LeadRow[] };
    const ru = ctx.language === 'ru';
    return {
      shown,
      total: leads.length,
      leads: leads.slice(0, input.limit ?? 10).map((lead) => ({
        id: lead.id,
        subscription: lead.subscriptionName,
        title: cut(lead.title, 200),
        excerpt: lead.excerpt ? cut(lead.excerpt, EXCERPT_MAX) : null,
        url: lead.sourceUrl,
        published: lead.publishedAt ? localTime(lead.publishedAt, ctx.timeZone, ctx.language) : null,
        why: (ru ? lead.reasonRu : lead.reasonEn) ?? lead.reasonRu ?? lead.reasonEn ?? null,
      })),
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: ideasCard,
});

/* ---- Changing ------------------------------------------------------------ */

/** The host of a feed address, without `www.` — the name a feed gets unasked. */
const hostOf = (url: string) => {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, '') || url.trim();
  } catch {
    return url.trim();
  }
};

type Created = {
  subscriptionId: string;
  kind: 'feed' | 'topic';
  name: string;
  watches: string;
  checking: boolean;
};

const created = async (
  ctx: CapabilityRunContext,
  body: { kind: 'RSS' | 'TOPIC'; displayName: string; canonicalUrl?: string; query?: string }
): Promise<Created> => {
  const service = leadsOf(ctx);
  // No interval: the door's default, daily — a topic check spends an
  // operation, and the product does not ask a person how often (spec §5.7).
  const row = (await service.createSubscription(
    ctx.organizationId,
    ctx.userId,
    body,
    ctx.language
  )) as unknown as SubscriptionRow;
  const topic = body.kind === 'TOPIC';
  // The name and what is watched are echoed as this call wrote them, not
  // read back: nothing outside the call reaches the model through them.
  return {
    subscriptionId: row.id,
    kind: topic ? 'topic' : 'feed',
    name: body.displayName.trim(),
    watches: String((topic ? body.query : body.canonicalUrl) ?? '').trim(),
    checking: topic ? service.topicCheckEnabled : service.feedCheckEnabled,
  };
};

const createdSummary = (output: Created) => ({
  ...output,
  next: output.checking
    ? 'The first check starts by itself now, then once a day; new leads appear in ideas.queue within minutes. Do not run ideas.check right away.'
    : 'Checking of this kind is switched off on this server: the subscription waits and starts by itself once it is on.',
});

export const ideasFeedAdd = defineCapability({
  id: 'ideas.feed.add',
  group: 'ideas',
  label: { ru: 'Подписаться на ленту', en: 'Subscribe to a feed' },
  description:
    'Subscribe to a feed (RSS or Atom address) in «Откуда идеи»: it is read once now and then once a day, free, and new items become leads. Pass the address as the person gave it; `name` only when they named one (else the site’s name). For a subject rather than an address use ideas.topic.add.',
  input: z.object({
    url: z.string().trim().min(1).max(2048).describe('The feed address, as the person gave it'),
    name,
  }),
  risk: 'write',
  card: 'ideas',
  door: door(ContentLeadController, 'createSubscription'),
  untrusted: [],
  run: (ctx, input) =>
    created(ctx, {
      kind: 'RSS',
      displayName: (input.name ?? hostOf(input.url)).slice(0, NAME_MAX),
      canonicalUrl: input.url,
    }),
  summarize: createdSummary,
  cardOf: ideasCard,
});

const quoted = (text: string, ru: boolean) => (ru ? `«${text}»` : `“${text}”`);

export const ideasTopicAdd = defineCapability({
  id: 'ideas.topic.add',
  group: 'ideas',
  label: { ru: 'Следить за темой', en: 'Watch a topic' },
  description:
    'Watch a topic in «Откуда идеи»: the web is searched for fresh material about it now and then once a day, and what is found becomes leads. Each check is a paid web search (one AI operation) for as long as the subscription lives, so the person approves it on a card. Pass the topic as the person said it; `name` only when they named one.',
  input: z.object({
    topic: z
      .string()
      .min(1)
      .max(MAX_TOPIC_QUERY_LENGTH)
      .regex(TRIMMED)
      .describe('The topic, as the person said it, without surrounding spaces'),
    name,
  }),
  risk: 'confirm',
  card: 'ideas',
  door: door(ContentLeadController, 'createSubscription'),
  untrusted: [],
  describeApproval: async (ctx: ApprovalDescribeContext, input) => {
    const ru = ctx.language === 'ru';
    const on = leadsOf(ctx).topicCheckEnabled;
    // The card is cut at `AGENT_APPROVAL_SUMMARY_MAX`: a long topic is
    // shortened here so the cost is always said.
    const topic = quoted(cut(input.topic, 60), ru);
    const what = ru
      ? `Следить за темой ${topic}: сейчас и потом раз в сутки ищем в интернете свежее по теме, найденное попадает в поводы. Каждая проверка — платный поиск, одна операция ИИ, пока вы не отпишетесь`
      : `Watch the topic ${topic}: now and then once a day we search the web for fresh material on it, and what is found becomes leads. Each check is a paid search, one AI operation, until you unsubscribe`;
    if (on) return what;
    return ru
      ? `${what}. Проверка тем на сервере сейчас выключена — начнётся, когда её включат`
      : `${what}. Topic checking is off on this server now — it starts once it is on`;
  },
  run: (ctx, input) =>
    created(ctx, {
      kind: 'TOPIC',
      displayName: (input.name ?? input.topic).slice(0, NAME_MAX),
      query: input.topic,
    }),
  summarize: createdSummary,
  cardOf: ideasCard,
});

export const ideasArchive = defineCapability({
  id: 'ideas.archive',
  group: 'ideas',
  label: { ru: 'Отписаться', en: 'Unsubscribe' },
  description:
    'Unsubscribe from a feed or a topic: it is no longer checked (a topic stops spending), and no new leads come from it; the leads it already brought stay. Needs the id from ideas.list.',
  input: z.object({ subscriptionId }),
  risk: 'write',
  asksInWebChat: true,
  card: 'ideas',
  door: door(ContentLeadController, 'archiveSubscription'),
  untrusted: ['workspace-text'],
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const { row } = await subscriptionRow(ctx, input.subscriptionId);
    const what = quoted(cut(row.displayName, 80), ru);
    if (ru) {
      return isTopic(row.kind)
        ? `Отписаться от темы ${what}: её больше не проверяем и не тратим на неё операции, новых поводов не будет. Уже пришедшие поводы останутся`
        : `Отписаться от ленты ${what}: её больше не читаем, новых поводов не будет. Уже пришедшие поводы останутся`;
    }
    return isTopic(row.kind)
      ? `Unsubscribe from the topic ${what}: it is no longer checked or spent on, no new leads come. The leads it brought stay`
      : `Unsubscribe from the feed ${what}: it is no longer read, no new leads come. The leads it brought stay`;
  },
  run: async (ctx, input) => {
    const { row } = await subscriptionRow(ctx, input.subscriptionId);
    await leadsOf(ctx).archiveSubscription(ctx.organizationId, input.subscriptionId);
    return { subscriptionId: row.id, name: row.displayName, archived: true };
  },
  summarize: (output) => ({ ...output }),
  cardOf: ideasCard,
});

/**
 * Outcomes of a check that searched nothing: the row was paused, checking is
 * off, search is not configured, or the allowance refused before the search.
 * A topic check with any other outcome — leads found, or a failure after the
 * search went out — has spent.
 */
const UNSPENT_REASONS = new Set([
  'NOT_ACTIVE',
  'CHECK_DISABLED',
  'CONTENT_SEARCH_NOT_CONFIGURED',
  'RESEARCH_QUOTA_EXHAUSTED',
  'AI_INCLUDED_QUOTA_EXHAUSTED',
]);

const CHECK_NOTES: Record<string, string> = {
  NOT_ACTIVE: 'The subscription is paused; nothing was read or spent.',
  CHECK_DISABLED:
    'Checking of this kind is switched off on this server; nothing was read or spent. It starts by itself once it is on.',
  CONTENT_SEARCH_NOT_CONFIGURED:
    'Web search is not set up for this workspace (AI settings), so a topic cannot be checked; nothing was spent.',
  RESEARCH_QUOTA_EXHAUSTED: 'The web search allowance of this month is spent; nothing more was spent.',
  AI_INCLUDED_QUOTA_EXHAUSTED: 'The AI allowance of this month is spent; nothing more was spent.',
};

type Checked = {
  subscriptionId: string;
  name: string;
  kind: 'feed' | 'topic';
  checked: boolean;
  newLeads: number;
  reason: string | null;
  spent: boolean;
};

export const ideasCheck = defineCapability({
  id: 'ideas.check',
  group: 'ideas',
  label: { ru: 'Проверить сейчас', en: 'Check now' },
  description:
    'Check one subscription now («Проверить сейчас») instead of waiting for its daily check. A topic check is a paid web search and runs without asking; a feed check is free. A subscription checked less than a minute ago is refused (`CHECK_TOO_SOON`): say to wait a minute. Returns how many new leads came (`newLeads`); read them with ideas.queue. `checked: false` carries the `reason` and a note of what it means.',
  input: z.object({ subscriptionId }),
  risk: 'paid',
  card: 'ideas',
  door: door(ContentLeadController, 'check'),
  untrusted: ['workspace-text'],
  run: async (ctx, input): Promise<Checked> => {
    // An unknown subscription and a check a minute after the last one are
    // refused before anything is read or searched: the message's paid step
    // is given back (review W4-23 F2), so «проверь и напиши» still writes.
    let row: SubscriptionRow;
    let result: { checked: boolean; created: number; reason?: string; fromCache?: boolean };
    try {
      ({ row } = await subscriptionRow(ctx, input.subscriptionId));
      // The door's call: a manual check (rate-limited, `CHECK_TOO_SOON` in
      // the person's language) that also restarts a periodic check that
      // never began — after its own check, so the two never both search.
      result = (await leadsOf(ctx).checkSubscription(ctx.organizationId, row.id, {
        ensurePeriodicCheck: true,
        manual: true,
        language: ctx.language,
      })) as typeof result;
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      throw code === 'SUBSCRIPTION_NOT_FOUND' || code === 'CHECK_TOO_SOON' ? markUnspent(error) : error;
    }
    const topic = isTopic(row.kind);
    const reason = result.checked ? null : result.reason ?? 'CHECK_FAILED';
    return {
      subscriptionId: row.id,
      name: row.displayName,
      kind: topic ? 'topic' : 'feed',
      checked: !!result.checked,
      newLeads: result.created ?? 0,
      reason,
      // An upper bound: a check that failed after admission but before the
      // search (a model-key problem) reads `CHECK_FAILED` and counts as spent.
      spent: topic && !result.fromCache && !(reason && UNSPENT_REASONS.has(reason)),
    };
  },
  // A feed check, and a topic check that never searched, spent nothing: the
  // message's paid step stays free for what the person asked next.
  spentNothing: (output) => !output.spent,
  summarize: (output) => ({
    ...output,
    ...(output.reason
      ? {
          note:
            CHECK_NOTES[output.reason] ??
            'The check did not go through; the subscription shows the problem and retries on its own schedule.',
        }
      : {}),
  }),
  cardOf: ideasCard,
});

type LeadAnswer = { id: string; title: string; sourceUrl: string; status: string };

/** A lead's title as the workspace stores it, for an approval card (kcxz.45). */
const leadTitle = async (ctx: ServiceContext, id: string) =>
  String(((await leadsOf(ctx).getLead(ctx.organizationId, id)) as unknown as LeadAnswer).title ?? '');

/**
 * Leads one «Не надо» call declines at most (kcxz.45): the card names every
 * one of them, each title cut, never the list.
 */
export const DISMISS_MAX = 10;
/** A batch card cuts each title to this; ten fit `AGENT_APPROVAL_SUMMARY_MAX`. */
const BATCH_TITLE_MAX = 50;

/** «для N …»: genitive — «для 21 повода», «для 2 поводов». */
const leadsWord = (count: number) => (count % 10 === 1 && count % 100 !== 11 ? 'повода' : 'поводов');

const titlesOf = (leads: readonly LeadAnswer[], ru: boolean, max: number) =>
  leads.map((lead) => quoted(cut(String(lead.title ?? ''), max), ru)).join(', ');

/** The leads of the workspace by id, in the order given (`LEAD_NOT_FOUND` otherwise). */
const leadsById = (ctx: ServiceContext, ids: readonly string[]) =>
  Promise.all(ids.map(async (id) => (await leadsOf(ctx).getLead(ctx.organizationId, id)) as unknown as LeadAnswer));

/** The approval card of a batch: what will change, and what will not (kcxz.45). */
const dismissCard = (leads: readonly LeadAnswer[], ru: boolean) => {
  const fresh = leads.filter((lead) => lead.status === 'NEW');
  const already = leads.filter((lead) => lead.status === 'DISMISSED');
  const blocked = leads.filter((lead) => lead.status !== 'NEW' && lead.status !== 'DISMISSED');
  const max = leads.length === 1 ? 120 : BATCH_TITLE_MAX;
  if (blocked.length) {
    return ru
      ? `«Не надо» не сработает: уже взяты в работу ${titlesOf(blocked, ru, max)} — ничего не изменится`
      : `“Not this one” will not go through: already taken to work ${titlesOf(blocked, ru, max)} — nothing changes`;
  }
  const alreadyLine = already.length
    ? ru
      ? `Уже отклонены, не изменятся: ${titlesOf(already, ru, max)}`
      : `Already declined, unchanged: ${titlesOf(already, ru, max)}`
    : '';
  if (!fresh.length) return alreadyLine;
  const main =
    fresh.length === 1
      ? ru
        ? `«Не надо» для повода ${titlesOf(fresh, ru, max)}: он уйдёт из очереди и не вернётся из той же подписки`
        : `“Not this one” for the lead ${titlesOf(fresh, ru, max)}: it leaves the queue and does not come back from the same subscription`
      : ru
        ? `«Не надо» для ${fresh.length} ${leadsWord(fresh.length)} — уйдут из очереди и не вернутся из тех же подписок: ${titlesOf(fresh, ru, max)}`
        : `“Not this one” for ${fresh.length} leads — they leave the queue and do not come back from the same subscriptions: ${titlesOf(fresh, ru, max)}`;
  return alreadyLine ? `${main}. ${alreadyLine}` : main;
};

export const ideasDismiss = defineCapability({
  id: 'ideas.dismiss',
  group: 'ideas',
  label: { ru: 'Не надо', en: 'Not this one' },
  description: `Decline new leads («Не надо»): each leaves the queue and never comes back from the same subscription. Pass every lead to decline in one call (up to ${DISMISS_MAX} ids from ideas.queue): the person approves them on one card that names each. All or nothing: a lead taken to work, or not in this workspace, refuses the whole call; one already declined stays as it is (\`alreadyDismissed\`).`,
  input: z.object({
    leadIds: z
      .array(leadId)
      .min(1)
      .max(DISMISS_MAX)
      .refine((ids) => new Set(ids).size === ids.length, 'Each lead once')
      .describe(`Lead ids from ideas.queue, each once, at most ${DISMISS_MAX}`),
  }),
  risk: 'write',
  asksInWebChat: true,
  card: 'ideas',
  door: door(ContentLeadController, 'dismiss'),
  untrusted: ['lead'],
  describeApproval: async (ctx, input) =>
    dismissCard(await leadsById(ctx, input.leadIds), ctx.language === 'ru'),
  run: async (ctx, input) => {
    // One transaction through the screen's repository: all or nothing.
    const result = await leadsOf(ctx).dismissLeads(ctx.organizationId, input.leadIds, ctx.userId);
    const leads = await leadsById(ctx, input.leadIds);
    const named = (ids: readonly string[]) =>
      leads.filter((lead) => ids.includes(lead.id)).map((lead) => ({ leadId: lead.id, title: cut(lead.title, 200) }));
    return {
      dismissed: named(result.dismissed),
      alreadyDismissed: named(result.alreadyDismissed),
      count: result.dismissed.length,
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: ideasCard,
});

export const ideasTake = defineCapability({
  id: 'ideas.take',
  group: 'ideas',
  label: { ru: 'Взять в работу', en: 'Take to work' },
  description:
    'Take a new lead to work («Взять в работу»): it is marked taken and leaves the queue. Then, in the same turn and without asking — after this call answered, never in parallel with it — write the piece with piece.create and `sourceLeadId` set to this lead — the piece is written from the lead (its title, excerpt and address) and keeps the address as its source; pass as `text` only words the person added about it. Needs the lead id from ideas.queue.',
  input: z.object({ leadId }),
  risk: 'write',
  asksInWebChat: true,
  door: door(ContentLeadController, 'accept'),
  untrusted: ['lead'],
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const title = quoted(cut(await leadTitle(ctx, input.leadId), 120), ru);
    return ru
      ? `Взять в работу повод ${title}: он уйдёт из очереди, и по нему напишем заготовку`
      : `Take the lead ${title} to work: it leaves the queue, and a piece is written from it`;
  },
  run: async (ctx, input) => {
    const lead = (await leadsOf(ctx).acceptLead(
      ctx.organizationId,
      input.leadId,
      ctx.userId
    )) as unknown as LeadAnswer;
    return { leadId: lead.id, title: cut(lead.title, 200), url: lead.sourceUrl, taken: true };
  },
  // The next step is in the description and the skill, not here: the answer
  // reaches the model wrapped as untrusted data, and a step written inside it
  // is exactly what the model must not follow.
  summarize: (output) => ({ ...output }),
});
