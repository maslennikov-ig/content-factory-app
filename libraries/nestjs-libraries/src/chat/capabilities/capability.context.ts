import { z } from 'zod';
import type { RequestContext } from '@mastra/core/request-context';
import type { CapabilityIdentity } from './capability.types';

/**
 * The keys the server writes into Mastra's `RequestContext` for the registry
 * (`content-factory-next-kcxz.6`, spec §4.3). Nothing the model or the browser
 * sends reaches them: the chat controller (`kcxz.7`) and the MCP entrance
 * (`kcxz.26`) build the context from the session or the OAuth token.
 *
 * Every value is a primitive (premortem S1): Mastra may persist the context in
 * a suspended run's snapshot, and a row object there is how the workspace API
 * key once ended up in storage.
 */
export const CAPABILITY_CONTEXT_KEYS = {
  organizationId: 'cf.organizationId',
  organizationCreatedAt: 'cf.organizationCreatedAt',
  userId: 'cf.userId',
  role: 'cf.role',
  language: 'cf.language',
  /** The person's time zone (IANA or offset), resolved by the door. */
  timeZone: 'cf.timeZone',
  /** Paid capability calls already admitted in this turn. */
  paidCalls: 'cf.paidCalls',
  /** 1 by default; 2 only when the person explicitly asked to continue. */
  paidLimit: 'cf.paidLimit',
  /** Comma-joined approval fingerprints the person approved for this request. */
  approvals: 'cf.approvals',
  /**
   * Ids (a JSON array) of objects whose questions were put to the person in
   * this request (`kcxz.31`, D1). Written by the hooks only.
   */
  questionsOpened: 'cf.questionsOpened',
  /**
   * Texts (a JSON array of `proposalTarget`s) that already have a card of
   * proposed changes open in this conversation (`kcxz.32`, N2). Written by
   * the chat door from the thread's pending cards, never by the model.
   */
  openProposals: 'cf.openProposals',
} as const;

/** One paid action per turn; a second only on an explicit continuation. */
export const PAID_CALLS_PER_TURN = 1;
export const PAID_CALLS_HARD_LIMIT = 2;

const K = CAPABILITY_CONTEXT_KEYS;

/**
 * `requestContextSchema` for every generated tool: Mastra validates it before
 * `execute`, so a run without a server-built identity fails before any
 * service is called.
 */
export const capabilityContextSchema = z
  .object({
    [K.organizationId]: z.string().min(1),
    [K.organizationCreatedAt]: z.string().min(1),
    [K.userId]: z.string().min(1),
    [K.role]: z.enum(['USER', 'EDITOR', 'ADMIN', 'SUPERADMIN']),
    [K.language]: z.enum(['ru', 'en']),
    [K.timeZone]: z.string().min(1).max(64),
  })
  .passthrough();

type AnyRequestContext = Pick<RequestContext<unknown>, 'get' | 'set'>;

const read = (context: AnyRequestContext | undefined, key: string) =>
  context?.get(key as never) as unknown;

/** Writes the identity; the caller owns the rest of the context. */
export const seedCapabilityContext = (
  context: AnyRequestContext,
  identity: CapabilityIdentity
) => {
  context.set(K.organizationId as never, identity.organizationId as never);
  context.set(
    K.organizationCreatedAt as never,
    identity.organizationCreatedAt as never
  );
  context.set(K.userId as never, identity.userId as never);
  context.set(K.role as never, identity.role as never);
  context.set(K.language as never, identity.language as never);
  context.set(K.timeZone as never, (identity.timeZone || 'UTC') as never);
};

/** The identity, or `null` when the server did not build one. */
export const readCapabilityIdentity = (
  context: AnyRequestContext | undefined
): CapabilityIdentity | null => {
  const parsed = capabilityContextSchema.safeParse({
    [K.organizationId]: read(context, K.organizationId),
    [K.organizationCreatedAt]: read(context, K.organizationCreatedAt),
    [K.userId]: read(context, K.userId),
    [K.role]: read(context, K.role),
    [K.language]: read(context, K.language),
    [K.timeZone]: read(context, K.timeZone),
  });
  if (!parsed.success) return null;
  const value = parsed.data as Record<string, any>;
  return {
    organizationId: value[K.organizationId],
    organizationCreatedAt: value[K.organizationCreatedAt],
    userId: value[K.userId],
    role: value[K.role],
    language: value[K.language],
    timeZone: value[K.timeZone],
  };
};

const paidLimitOf = (context: AnyRequestContext) => {
  const asked = Number(read(context, K.paidLimit));
  const limit = Number.isFinite(asked) && asked > 0 ? asked : PAID_CALLS_PER_TURN;
  return Math.min(Math.floor(limit), PAID_CALLS_HARD_LIMIT);
};

/**
 * Takes a paid slot, synchronously (premortem A2). Parallel tool calls of one
 * step run their hooks concurrently, but each hook reaches this line before
 * its first `await`, so the count cannot be read twice before it is written.
 */
export const reservePaidSlot = (
  context: AnyRequestContext
): { ok: boolean; limit: number } => {
  const used = Number(read(context, K.paidCalls)) || 0;
  const limit = paidLimitOf(context);
  if (used >= limit) return { ok: false, limit };
  context.set(K.paidCalls as never, (used + 1) as never);
  return { ok: true, limit };
};

/** Gives the slot back when the call was refused before it could spend. */
export const releasePaidSlot = (context: AnyRequestContext) => {
  const used = Number(read(context, K.paidCalls)) || 0;
  context.set(K.paidCalls as never, Math.max(0, used - 1) as never);
};

const approvalsOf = (context: AnyRequestContext | undefined) =>
  String(read(context, K.approvals) ?? '')
    .split(',')
    .filter(Boolean);

/** The controller records what the person approved on the card. */
export const grantApproval = (
  context: AnyRequestContext,
  fingerprint: string
) => {
  const current = approvalsOf(context);
  if (!current.includes(fingerprint)) current.push(fingerprint);
  context.set(K.approvals as never, current.join(',') as never);
};

export const hasApproval = (
  context: AnyRequestContext | undefined,
  fingerprint: string
) => approvalsOf(context).includes(fingerprint);

/**
 * An approval is spent by the call it approved: it never runs a second one.
 * Its content-bound print (`<fingerprint>.<content>`, review W2 F4) goes too.
 */
export const consumeApproval = (
  context: AnyRequestContext,
  fingerprint: string
) => {
  context.set(
    K.approvals as never,
    approvalsOf(context)
      .filter((entry) => entry !== fingerprint && !entry.startsWith(`${fingerprint}.`))
      .join(',') as never
  );
};

/** A JSON array in one string: an id is the model's text and may hold a comma. */
const openedOf = (context: AnyRequestContext | undefined): string[] => {
  try {
    const value = JSON.parse(String(read(context, K.questionsOpened) ?? '[]'));
    return Array.isArray(value) ? value.filter((one) => typeof one === 'string') : [];
  } catch {
    return [];
  }
};

/** A call of this request put this object's questions before the person. */
export const markQuestionsOpened = (context: AnyRequestContext, id: string) => {
  const current = openedOf(context);
  if (!current.includes(id)) current.push(id);
  context.set(K.questionsOpened as never, JSON.stringify(current) as never);
};

/** The person was asked this object's questions in this very request. */
export const questionsOpenedHere = (
  context: AnyRequestContext | undefined,
  id: string
) => openedOf(context).includes(id);

/**
 * The text a proposal of changes is for (`kcxz.32`, N2): the core of a piece
 * or one adaptation. A check and a rewrite of the same text compete for it —
 * the second proposal is made against a text the first one may be about to
 * change.
 */
export const proposalTarget = (pieceId: string, adaptationId?: string | null) =>
  adaptationId ? `adaptation:${adaptationId}` : `core:${pieceId}`;

/** The door records the texts whose proposal card waits in this thread. */
export const setOpenProposals = (
  context: AnyRequestContext,
  targets: readonly string[]
) => {
  context.set(
    K.openProposals as never,
    JSON.stringify([...new Set(targets)]) as never
  );
};

/** A card of proposed changes to this text waits for the person. */
export const proposalOpenHere = (
  context: AnyRequestContext | undefined,
  target: string
): boolean => {
  try {
    const value = JSON.parse(String(read(context, K.openProposals) ?? '[]'));
    return Array.isArray(value) && value.includes(target);
  } catch {
    return false;
  }
};
