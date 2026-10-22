import { AsyncLocalStorage } from 'node:async_hooks';
import type { AgentThreadExecutionV1 } from '../capabilities/agent-parts.contract';
import {
  AGENT_CALL_ANSWERED_TTL_SECONDS,
  type AgentRunClaimStore,
} from './agent-run-claims';
import { CONDUCTOR_EXECUTION_ID_KEY } from './conductor.context';

/** A durable pointer; losing the expiring outcome never means success. */
export const AGENT_EXECUTION_METADATA_KEY = 'assistantExecution';
export const agentExecutionKey = (requestId: string) => `agent-execution:${requestId}`;
export type AgentTurnOutcome = 'completed' | 'failed' | 'interrupted';

const outcomes: readonly string[] = ['completed', 'failed', 'interrupted'];
const executionScope = new AsyncLocalStorage<AgentTurnLifecycle>();
const stoppedExecutionIds = new Set<string>();

export const markAgentTurnStopped = (requestId: string) => {
  if (requestId) stoppedExecutionIds.add(requestId);
};

export const isAgentTurnStopped = (requestId: string) =>
  stoppedExecutionIds.has(requestId);

// Kept as re-exports for existing lifecycle consumers.
export {
  agentOperationReceiptMetadataKey,
  readCommittedToolReceipt,
  recordCommittedToolReceipt,
  type CommittedToolReceipt,
} from './agent-operation-receipts';

export const readAgentThreadExecution = async (
  store: AgentRunClaimStore,
  metadata: Record<string, unknown> | undefined
): Promise<AgentThreadExecutionV1 | undefined> => {
  // Old histories keep their contract. They cannot prove a stopped new turn
  // settled, but they remain usable for ordinary history and new messages.
  if (!metadata || !(AGENT_EXECUTION_METADATA_KEY in metadata)) return undefined;
  const marker = metadata[AGENT_EXECUTION_METADATA_KEY] as { requestId?: unknown; runId?: unknown } | null;
  const requestId = typeof marker?.requestId === 'string' && marker.requestId ? marker.requestId : null;
  const unknown: AgentThreadExecutionV1 = { requestId, state: 'unknown' };
  if (!requestId) return unknown;
  const terminal = marker as { state?: unknown; outcome?: unknown };
  // A matching terminal receipt was written only after the actual Promises
  // settled. Keep that proof after the expiring store record is gone.
  if (terminal.state === 'settled' && outcomes.includes(String(terminal.outcome))) {
    return { requestId, state: 'settled', outcome: terminal.outcome as AgentTurnOutcome };
  }
  const stored = await store.get(agentExecutionKey(requestId));
  if (!stored) return unknown;
  try {
    const value = JSON.parse(stored);
    if (value?.requestId !== requestId) return unknown;
    if (value.state === 'running') return { requestId, state: 'running' };
    if (value.state === 'settled' && outcomes.includes(value.outcome)) {
      return { requestId, state: 'settled', outcome: value.outcome };
    }
  } catch { /* A malformed receipt proves no outcome. */ }
  return unknown;
};

export const writeAgentThreadExecution = (
  store: AgentRunClaimStore,
  execution: AgentThreadExecutionV1 & { requestId: string }
) => store.set(
  agentExecutionKey(execution.requestId),
  JSON.stringify(execution),
  'EX',
  AGENT_CALL_ANSWERED_TTL_SECONDS
);

/**
 * Reader cancellation is not cancellation of a service Promise. Keep the
 * actual capability executions until they settle, and refuse late calls of
 * that stopped request. Only primitive ids enter native suspended context.
 */
export class AgentTurnLifecycle {
  private readonly pending = new Set<Promise<unknown>>();
  private accepting = true;
  private failed = false;

  constructor(
    readonly requestId: string,
    private readonly settle: (outcome: AgentTurnOutcome) => Promise<void>
  ) {}

  /** Native resumed tool context can still contain its first request's id. */
  run<T>(work: () => T): T { return executionScope.run(this, work); }

  get acceptingWork() { return this.accepting; }

  stop() {
    this.accepting = false;
    markAgentTurnStopped(this.requestId);
  }

  async track<T>(work: () => Promise<T>): Promise<T> {
    if (!this.accepting) throw new Error('The agent request has stopped.');
    const pending = Promise.resolve().then(() => {
      if (!this.accepting) throw new Error('The agent request has stopped.');
      return work();
    });
    this.pending.add(pending);
    try {
      const result = await pending;
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false &&
        (!('canReviseInput' in result) || result.canReviseInput !== true)) this.failed = true;
      return result;
    } catch (error) {
      const isStoppedAbort =
        !this.accepting &&
        ((error as { name?: unknown })?.name === 'AbortError' ||
          /request has stopped|aborted/i.test(String((error as { message?: unknown })?.message ?? '')));
      if (!isStoppedAbort) this.failed = true;
      throw error;
    } finally { this.pending.delete(pending); }
  }

  async finish(outcome: AgentTurnOutcome): Promise<AgentTurnOutcome> {
    this.stop();
    await Promise.allSettled([...this.pending]);
    const settled = this.failed ? 'failed' : outcome;
    await this.settle(settled);
    return settled;
  }
}

export const trackAgentTurnWork = <T>(
  context: { get?: (key: string) => unknown } | undefined,
  work: () => Promise<T>,
  invocation?: { runId?: string; abortSignal?: { aborted: boolean } }
): Promise<T> => {
  // Bind to the actual invocation, never to a restored snapshot or another
  // request of the thread. A late callback retains its own stopped scope,
  // even while a successor invocation is active.
  const execution = executionScope.getStore();
  const requestId = context?.get?.(CONDUCTOR_EXECUTION_ID_KEY);
  if (execution) {
    if (!execution.acceptingWork && typeof requestId === 'string' && requestId &&
        requestId !== execution.requestId) {
      // Native queued work inherits the parent's async context. A fresh
      // server-built successor identity must pass the live native checks
      // below instead of binding to a lifecycle that has already finished.
      return executionScope.exit(() => trackAgentTurnWork(context, work, invocation));
    }
    return execution.track(work);
  }
  // Direct/legacy native callers and MCP retain their existing behavior.
  if (typeof requestId !== 'string' || !requestId) return work();
  const durable = context?.get?.('mastra__durableExecutions') as
    | Record<string, { abortController?: { signal?: { aborted?: boolean } } }>
    | undefined;
  // Session mode agents expose the public tool execution identity even when
  // there is no DurableAgent-specific request-context registry.
  const nativeInvocation = typeof invocation?.runId === 'string' && !!invocation.runId;
  const nativeIsLive = nativeInvocation
    ? invocation.abortSignal?.aborted !== true
    : durable && typeof durable === 'object' && Object.keys(durable).length > 0 &&
      !Object.values(durable).some((entry) => entry?.abortController?.signal?.aborted);
  if (!stoppedExecutionIds.has(requestId) && nativeIsLive) {
    return Promise.resolve().then(() => {
      if (stoppedExecutionIds.has(requestId) || invocation?.abortSignal?.aborted) {
        throw new Error('The agent request has stopped.');
      }
      return work();
    });
  }
  // A tracked web call without its live invocation scope cannot run safely.
  return Promise.reject(new Error('The agent request has stopped.'));
};
