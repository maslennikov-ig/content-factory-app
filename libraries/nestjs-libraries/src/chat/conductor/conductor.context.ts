import { z } from 'zod';
import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  RequestContext,
} from '@mastra/core/request-context';
import {
  CAPABILITY_CONTEXT_KEYS,
  PAID_CALLS_HARD_LIMIT,
  PAID_CALLS_PER_TURN,
  capabilityContextSchema,
  grantApproval,
  seedCapabilityContext,
  setOpenProposals,
} from '../capabilities/capability.context';
import type { CapabilityIdentity } from '../capabilities/capability.types';

/**
 * The agent's one id in the Mastra registry. Kept from the inherited agent:
 * suspended runs are listed per agent id, and the stored threads of the old
 * screen stay where they are (they are keyed by the organization alone and are
 * never listed — spec §4.7).
 */
export const CONDUCTOR_AGENT_ID = 'content-factory';

/**
 * Caps of one turn (spike Q5, ADR-0012 §7). Seven since the W3 live walk
 * (28.09.2026, P2-B): the last step of a turn is kept for words
 * (`lastStepSpeaks`), so seven keeps the six working steps the cap had.
 */
export const CONDUCTOR_MAX_STEPS = 7;
/** The transport's chain owns retries (`ai.text-chain.ts`). */
export const CONDUCTOR_MAX_RETRIES = 0;
export { PAID_CALLS_PER_TURN, PAID_CALLS_HARD_LIMIT };

/**
 * The resource every memory row of a person's chat is written under
 * (spec §1.6, §4.7): personal threads, and working memory that follows the
 * person, not the workspace.
 */
export const conductorResourceId = (organizationId: string, userId: string) =>
  `${organizationId}:${userId}`;

/**
 * Every key the server may put into the agent's `RequestContext`
 * (premortem S1): the capability identity, the per-turn paid counter and
 * limit, the approvals given for this request, and Mastra's own memory keys.
 * Values are primitives only — Mastra persists the context in a suspended
 * run's snapshot.
 */
export const CONDUCTOR_CONTEXT_KEYS: readonly string[] = [
  ...Object.values(CAPABILITY_CONTEXT_KEYS),
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
];

/**
 * `requestContextSchema` of the agent: Mastra validates it at the start of
 * every stream and resume, so a turn without a server-built identity, or with
 * a memory resource that is not the identity's own, never reaches the model.
 */
export const conductorContextSchema = capabilityContextSchema
  .extend({
    [MASTRA_RESOURCE_ID_KEY]: z.string().min(3),
    [MASTRA_THREAD_ID_KEY]: z.string().min(1),
  })
  .refine(
    (value: Record<string, unknown>) =>
      value[MASTRA_RESOURCE_ID_KEY] ===
      conductorResourceId(
        String(value[CAPABILITY_CONTEXT_KEYS.organizationId]),
        String(value[CAPABILITY_CONTEXT_KEYS.userId])
      ),
    { message: 'The memory resource is not the caller’s own.' }
  );

export type ConductorTurn = {
  identity: CapabilityIdentity;
  threadId: string;
  /**
   * 1 for a new message; 2 when the request carries the person's own answer
   * on a card (approval or question) — the explicit continuation of
   * premortem A2. Never more.
   */
  paidLimit: number;
  /** Approval fingerprints of the calls the person approved in this request. */
  approvals?: readonly string[];
  /**
   * Texts whose card of proposed changes waits in this thread, not counting
   * the card this request answers (`kcxz.32`, N2).
   */
  openProposals?: readonly string[];
};

/**
 * The context of one request, built from the session only (spec §4.3). The
 * browser and the model reach none of it: `MASTRA_RESOURCE_ID_KEY` and
 * `MASTRA_THREAD_ID_KEY` take precedence over anything passed as `memory`.
 */
export const buildConductorContext = (turn: ConductorTurn) => {
  const context = new RequestContext<Record<string, string | number>>();
  seedCapabilityContext(context, turn.identity);
  context.set(
    MASTRA_RESOURCE_ID_KEY,
    conductorResourceId(turn.identity.organizationId, turn.identity.userId)
  );
  context.set(MASTRA_THREAD_ID_KEY, turn.threadId);
  context.set(CAPABILITY_CONTEXT_KEYS.paidCalls, 0);
  context.set(
    CAPABILITY_CONTEXT_KEYS.paidLimit,
    Math.min(
      Math.max(Math.floor(turn.paidLimit) || PAID_CALLS_PER_TURN, 1),
      PAID_CALLS_HARD_LIMIT
    )
  );
  context.set(CAPABILITY_CONTEXT_KEYS.approvals, '');
  // Questions put to the person in this request, none yet (kcxz.31, D1).
  context.set(CAPABILITY_CONTEXT_KEYS.questionsOpened, '[]');
  setOpenProposals(context, turn.openProposals ?? []);
  for (const fingerprint of turn.approvals ?? []) {
    grantApproval(context, fingerprint);
  }
  return context;
};
