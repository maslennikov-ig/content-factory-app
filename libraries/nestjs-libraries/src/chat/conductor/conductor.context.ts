import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  RequestContext,
} from '@mastra/core/request-context';
import {
  CAPABILITY_CONTEXT_KEYS,
  capabilityContextSchema,
  grantApproval,
  seedCapabilityContext,
  setOpenProposals,
} from '../capabilities/capability.context';
import type { CapabilityIdentity } from '../capabilities/capability.types';
import { CONDUCTOR_EXECUTION_DEFAULTS, type ConductorExecutionPolicy } from './conductor.execution';
import { AGENT_WORK_CONTEXT_KEY, AGENT_WORK_CONTENT_MAX_CHARS, type ResolvedAgentWorkContext } from './work-context';

/**
 * The agent's one id in the Mastra registry. Kept from the inherited agent:
 * suspended runs are listed per agent id, and the stored threads of the old
 * screen stay where they are (they are keyed by the organization alone and are
 * never listed — spec §4.7).
 */
export const CONDUCTOR_AGENT_ID = 'content-factory';

/**
 * Emergency loop fuse. A task is complete when its requested result is
 * reached, not when a small number of model/tool steps has been consumed.
 */
export const CONDUCTOR_MAX_STEPS = CONDUCTOR_EXECUTION_DEFAULTS.emergencyMaxSteps;
/** The transport's chain owns retries (`ai.text-chain.ts`). */
export const CONDUCTOR_MAX_RETRIES = 0;

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
/**
 * A server-made id of this one request (review W4-25 vision F3): the pictures
 * a message carries are held under it (`conductor.pictures.ts`), so two
 * requests of one thread never see or release each other's.
 */
export const CONDUCTOR_REQUEST_ID_KEY = 'cf.requestId';
/** This web request tracks its real capability Promises through Stop. */
export const CONDUCTOR_EXECUTION_ID_KEY = 'cf.executionId';

export const CONDUCTOR_CONTEXT_KEYS: readonly string[] = [
  ...Object.values(CAPABILITY_CONTEXT_KEYS),
  CONDUCTOR_REQUEST_ID_KEY,
  CONDUCTOR_EXECUTION_ID_KEY,
  AGENT_WORK_CONTEXT_KEY,
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
    [AGENT_WORK_CONTEXT_KEY]: z.string().max(AGENT_WORK_CONTENT_MAX_CHARS + 2_000).optional(),
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
   * Accepted for legacy native callers/snapshots; ignored. Domain operations
   * follow the actual organization allowance and execution policy.
   */
  paidLimit?: number;
  executionPolicy?: ConductorExecutionPolicy;
  /** Approval fingerprints of the calls the person approved in this request. */
  approvals?: readonly string[];
  /**
   * Texts whose card of proposed changes waits in this thread, not counting
   * the card this request answers (`kcxz.32`, N2).
   */
  openProposals?: readonly string[];
  /** `CONDUCTOR_REQUEST_ID_KEY`: made by the door, one per request; a fresh one when absent. */
  requestId?: string;
  trackExecution?: boolean;
  workContext?: ResolvedAgentWorkContext | null;
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
  context.set(CAPABILITY_CONTEXT_KEYS.paidInFlight, 0);
  if (turn.executionPolicy) context.set(CAPABILITY_CONTEXT_KEYS.executionPolicy, JSON.stringify(turn.executionPolicy));
  context.set(CAPABILITY_CONTEXT_KEYS.approvals, '');
  // Questions put to the person in this request, none yet (kcxz.31, D1).
  context.set(CAPABILITY_CONTEXT_KEYS.questionsOpened, '[]');
  setOpenProposals(context, turn.openProposals ?? []);
  const requestId = turn.requestId ?? randomUUID();
  context.set(CONDUCTOR_REQUEST_ID_KEY, requestId);
  if (turn.trackExecution) context.set(CONDUCTOR_EXECUTION_ID_KEY, requestId);
  context.set(AGENT_WORK_CONTEXT_KEY, turn.workContext ? JSON.stringify(turn.workContext) : '');
  for (const fingerprint of turn.approvals ?? []) {
    grantApproval(context, fingerprint);
  }
  return context;
};
