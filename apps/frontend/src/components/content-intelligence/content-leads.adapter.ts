import {
  failureNotice,
  jsonReader,
  readFailure,
  screenState,
  type MaterialFailure,
} from '../brand-voice/voice-materials.adapter';

/**
 * The wire for «Откуда идеи» (`content-factory-next-odb8.3`).
 *
 * The refusal reading is not reinvented — reused from `voice-materials.adapter.ts`
 * the same way `content-facts.adapter.ts` beside this file already does, so a
 * `{code, message}` body reads the same sentence no matter which door under
 * `/content-intelligence` it came through.
 */

export { failureNotice, jsonReader, readFailure, screenState };
export type LeadFailure = MaterialFailure;

export const LEADS_API = '/content-intelligence/leads';
export const SUBSCRIPTIONS_API = `${LEADS_API}/subscriptions`;
export const QUEUE_API = `${LEADS_API}/queue`;
export const LINKABLE_AUTOPOSTS_API = `${SUBSCRIPTIONS_API}/linkable-autoposts`;

export const checkSubscriptionUrl = (id: string) =>
  `${SUBSCRIPTIONS_API}/${encodeURIComponent(id)}/check`;
export const archiveSubscriptionUrl = (id: string) =>
  `${SUBSCRIPTIONS_API}/${encodeURIComponent(id)}/archive`;
export const dismissLeadUrl = (id: string) =>
  `${LEADS_API}/${encodeURIComponent(id)}/dismiss`;
export const acceptLeadUrl = (id: string) =>
  `${LEADS_API}/${encodeURIComponent(id)}/accept`;
export const queueUrl = (status: 'NEW' | 'DISMISSED') =>
  `${QUEUE_API}?status=${status}`;

export const CHECK_INTERVAL_OPTIONS = [60, 360, 1440] as const;
export type CheckIntervalMinutes = (typeof CHECK_INTERVAL_OPTIONS)[number];

export type LinkedAutoPost = Readonly<{
  id: string;
  title: string | null;
  active: boolean;
}>;

/** The two kinds a subscription may have (`content-factory-next-75xn.7`). */
export const SUBSCRIPTION_KINDS = ['RSS', 'TOPIC'] as const;
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number];

export const isTopicKind = (kind: string): boolean => kind === 'TOPIC';

/** `ContentLeadService.listSubscriptions`'s row shape, read back defensively. */
export type SubscriptionRow = Readonly<{
  id: string;
  kind: string;
  displayName: string;
  /**
   * The address for a feed row; the synthetic `topic://<slug>` key for a
   * topic row, which is why the screen prints `query` instead when there is
   * one — the key is derived, and nobody typed it.
   */
  canonicalUrl: string;
  /** The watched topic as it was typed. `null` for every kind but `TOPIC`. */
  query: string | null;
  state: string;
  checkIntervalMinutes: number;
  lastCheckedAt: string | null;
  lastErrorCode: string | null;
  createdAt: string | null;
  leadsThisMonth: number;
  acceptedThisMonth: number;
  linkedAutoPost: LinkedAutoPost | null;
}>;

export type LeadRow = Readonly<{
  id: string;
  subscriptionId: string;
  subscriptionName: string | null;
  title: string;
  excerpt: string | null;
  sourceUrl: string;
  publishedAt: string | null;
  observedAt: string | null;
  reasonRu: string;
  reasonEn: string;
  status: 'NEW' | 'DISMISSED' | 'ACCEPTED' | (string & {});
  dismissedAt: string | null;
  acceptedAt: string | null;
}>;

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;
const asNullableText = (value: unknown) =>
  typeof value === 'string' ? value : null;
const asNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const asBool = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

function readLinkedAutoPost(value: unknown): LinkedAutoPost | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as JsonRecord;
  return {
    id: asText(row.id),
    title: asNullableText(row.title),
    active: asBool(row.active),
  };
}

export function readSubscriptionsEnvelope(value: unknown): {
  subscriptions: readonly SubscriptionRow[];
  feedCheckEnabled: boolean;
  topicCheckEnabled: boolean;
} {
  const body = asRecord(value);
  const capabilities = asRecord(body.capabilities);
  return {
    feedCheckEnabled: asBool(capabilities.feedCheck),
    // Two switches, not one: `LEAD_FEED_CHECK_ENABLED` and
    // `LEAD_TOPIC_CHECK_ENABLED` are separate on the server, so a screen that
    // read one of them would promise a check the other refuses.
    topicCheckEnabled: asBool(capabilities.topicCheck),
    subscriptions: asArray(body.subscriptions).map((entry) => {
      const row = asRecord(entry);
      return {
        id: asText(row.id),
        kind: asText(row.kind, 'RSS'),
        displayName: asText(row.displayName),
        canonicalUrl: asText(row.canonicalUrl),
        query: asNullableText(row.query),
        state: asText(row.state, 'ACTIVE'),
        checkIntervalMinutes: asNumber(row.checkIntervalMinutes, 1440),
        lastCheckedAt: asNullableText(row.lastCheckedAt),
        lastErrorCode: asNullableText(row.lastErrorCode),
        createdAt: asNullableText(row.createdAt),
        leadsThisMonth: asNumber(row.leadsThisMonth, 0),
        acceptedThisMonth: asNumber(row.acceptedThisMonth, 0),
        linkedAutoPost: readLinkedAutoPost(row.linkedAutoPost),
      } satisfies SubscriptionRow;
    }),
  };
}

export function readLeadsEnvelope(value: unknown): readonly LeadRow[] {
  const body = asRecord(value);
  return asArray(body.leads).map((entry) => {
    const row = asRecord(entry);
    return {
      id: asText(row.id),
      subscriptionId: asText(row.subscriptionId),
      subscriptionName: asNullableText(row.subscriptionName),
      title: asText(row.title),
      excerpt: asNullableText(row.excerpt),
      sourceUrl: asText(row.sourceUrl),
      publishedAt: asNullableText(row.publishedAt),
      observedAt: asNullableText(row.observedAt),
      reasonRu: asText(row.reasonRu),
      reasonEn: asText(row.reasonEn),
      status: asText(row.status, 'NEW'),
      dismissedAt: asNullableText(row.dismissedAt),
      acceptedAt: asNullableText(row.acceptedAt),
    } satisfies LeadRow;
  });
}

export function readLinkableAutoPosts(value: unknown): readonly LinkedAutoPost[] {
  const body = asRecord(value);
  return asArray(body.autoPosts).map((entry) => {
    const row = asRecord(entry);
    return {
      id: asText(row.id),
      title: asNullableText(row.title),
      active: true,
    } satisfies LinkedAutoPost;
  });
}

/** What the "Add subscription" dialog is holding, as typed. */
export type SubscriptionDraft = {
  kind: SubscriptionKind;
  displayName: string;
  canonicalUrl: string;
  /** The topic, kept while the dialog is on the address kind and vice versa. */
  query: string;
  checkIntervalMinutes: CheckIntervalMinutes;
  linkedAutoPostId: string;
};

export const emptySubscriptionDraft = (
  kind: SubscriptionKind = 'RSS'
): SubscriptionDraft => ({
  kind,
  displayName: '',
  canonicalUrl: '',
  query: '',
  checkIntervalMinutes: 1440,
  linkedAutoPostId: '',
});

/**
 * Whether the dialog holds enough to save. One answer for both kinds, so the
 * Save button and the door agree on what "filled in" means: a name, plus the
 * one field the chosen kind needs.
 */
export const subscriptionDraftReady = (draft: SubscriptionDraft): boolean =>
  Boolean(
    draft.displayName.trim() &&
      (draft.kind === 'TOPIC' ? draft.query.trim() : draft.canonicalUrl.trim())
  );

/**
 * `CreateContentLeadSubscriptionDto`, built from the dialog.
 *
 * A topic payload carries no `canonicalUrl` at all: the server derives the
 * `topic://` key from the topic itself, and sending a half-typed address
 * alongside would invite it to be stored as one.
 */
export function buildSubscriptionCreatePayload(draft: SubscriptionDraft) {
  const common = {
    displayName: draft.displayName.trim(),
    checkIntervalMinutes: draft.checkIntervalMinutes,
    ...(draft.linkedAutoPostId ? { linkedAutoPostId: draft.linkedAutoPostId } : {}),
  };
  return draft.kind === 'TOPIC'
    ? { ...common, kind: 'TOPIC' as const, query: draft.query.trim() }
    : {
        ...common,
        kind: 'RSS' as const,
        canonicalUrl: draft.canonicalUrl.trim(),
      };
}

/**
 * Whether a lead a person is looking at was carried into the Brief tab.
 *
 * Client-side only, the same as `voice-brief.container.tsx`'s own topic pick
 * — «Взять в работу» marks the lead `ACCEPTED` on the server (spending it)
 * and this is what the Content screen carries into the Brief tab's thesis
 * field, nothing more. No `ContentFact` or evidence link is created; see
 * `content-lead.service.ts` for why that is deliberate, not an omission.
 */
export type AcceptedLeadHandoff = Readonly<{
  thesis: string;
  reasonRu: string;
  reasonEn: string;
  sourceUrl: string;
  excerpt: string | null;
}>;

export const leadHandoff = (lead: LeadRow): AcceptedLeadHandoff => ({
  thesis: lead.title,
  reasonRu: lead.reasonRu,
  reasonEn: lead.reasonEn,
  sourceUrl: lead.sourceUrl,
  excerpt: lead.excerpt,
});
