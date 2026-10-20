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

export type CommittedToolReceipt<T = unknown> = {
  result: T;
  card?: { kind: string; id: string; [key: string]: unknown } | null;
};

const inProcessToolReceipts = new Map<string, CommittedToolReceipt>();

export const agentOperationReceiptMetadataKey = (
  toolName: string,
  toolCallId: string,
  resumed = false,
  runId?: string
) =>
  `assistantReceipt:${runId ? `${runId}:` : ''}${toolName}:${toolCallId}${resumed ? ':resumed' : ''}`;

const inProcessReceiptKey = (
  scopeId: string,
  toolName: string,
  toolCallId: string,
  resumed = false,
  runId?: string
) =>
  `${scopeId}:${agentOperationReceiptMetadataKey(toolName, toolCallId, resumed, runId)}`;

export const readCommittedToolReceipt = async <T = unknown>(args: {
  runId?: string;
  threadId?: string;
  toolName: string;
  toolCallId: string;
  resumed?: boolean;
  memory?: {
    getThreadById?: (input: {
      threadId: string;
    }) => Promise<{ metadata?: Record<string, unknown> } | null>;
  };
}): Promise<CommittedToolReceipt<T> | null> => {
  const scopeId = args.runId || args.threadId || 'default';
  const memKey = inProcessReceiptKey(
    scopeId,
    args.toolName,
    args.toolCallId,
    args.resumed,
    args.runId
  );
  const cached = inProcessToolReceipts.get(memKey);
  if (cached) return cached as CommittedToolReceipt<T>;
  const metadataKey = agentOperationReceiptMetadataKey(
    args.toolName,
    args.toolCallId,
    args.resumed,
    args.runId
  );
  if (!args.threadId || !args.memory?.getThreadById) return null;
  try {
    const thread = await args.memory.getThreadById({ threadId: args.threadId });
    const stored = thread?.metadata?.[metadataKey] as
      | CommittedToolReceipt<T>
      | undefined;
    if (stored && typeof stored === 'object' && 'result' in stored) {
      inProcessToolReceipts.set(memKey, stored);
      return stored;
    }
  } catch {
    /* Fall through when metadata read is unavailable. */
  }
  return null;
};

export const recordCommittedToolReceipt = async <T = unknown>(args: {
  runId?: string;
  threadId?: string;
  toolName: string;
  toolCallId: string;
  resumed?: boolean;
  receipt: CommittedToolReceipt<T>;
  memory?: {
    updateThread?: (input: {
      id: string;
      metadata?: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}): Promise<void> => {
  const scopeId = args.runId || args.threadId || 'default';
  const memKey = inProcessReceiptKey(
    scopeId,
    args.toolName,
    args.toolCallId,
    args.resumed,
    args.runId
  );
  inProcessToolReceipts.set(memKey, args.receipt);
  const metadataKey = agentOperationReceiptMetadataKey(
    args.toolName,
    args.toolCallId,
    args.resumed,
    args.runId
  );
  if (!args.threadId || !args.memory?.updateThread) return;
  try {
    await args.memory.updateThread({
      id: args.threadId,
      metadata: { [metadataKey]: args.receipt },
    });
  } catch {
    /* In-process receipt still protects same-process retries. */
  }
};

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

  async finish(outcome: AgentTurnOutcome) {
    this.stop();
    await Promise.allSettled([...this.pending]);
    await this.settle(this.failed ? 'failed' : outcome);
  }
}

export const trackAgentTurnWork = <T>(
  context: { get?: (key: string) => unknown } | undefined,
  work: () => Promise<T>
): Promise<T> => {
  // Bind to the actual invocation, never to a restored snapshot or another
  // request of the thread. A late callback retains its own stopped scope,
  // even while a successor invocation is active.
  const execution = executionScope.getStore();
  if (execution) return execution.track(work);
  const requestId = context?.get?.(CONDUCTOR_EXECUTION_ID_KEY);
  // Direct/legacy native callers and MCP retain their existing behavior.
  if (typeof requestId !== 'string' || !requestId) return work();
  const durable = context?.get?.('mastra__durableExecutions') as
    | Record<string, { abortController?: { signal?: { aborted?: boolean } } }>
    | undefined;
  if (
    !stoppedExecutionIds.has(requestId) &&
    durable &&
    typeof durable === 'object' &&
    Object.keys(durable).length > 0 &&
    !Object.values(durable).some((entry) => entry?.abortController?.signal?.aborted)
  ) {
    return Promise.resolve().then(() => {
      if (stoppedExecutionIds.has(requestId)) {
        throw new Error('The agent request has stopped.');
      }
      return work();
    });
  }
  // A tracked web call without its live invocation scope cannot run safely.
  return Promise.reject(new Error('The agent request has stopped.'));
};
