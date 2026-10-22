import { createHash, randomUUID } from 'node:crypto';
import { resolveRunFence } from '@mastra/core/storage';
import type { MastraCompositeStore } from '@mastra/core/storage';

/** Primitive native snapshot state; an uncertain action stops further writes in this run. */
export const AGENT_UNCERTAIN_OPERATION_CONTEXT_KEY = 'cf.uncertainOperation';

export type CommittedToolReceipt<T = unknown> = {
  result: T;
  card?: { kind: string; id: string; [key: string]: unknown } | null;
};

export const agentOperationReceiptMetadataKey = (
  toolName: string,
  toolCallId: string,
  resumed = false,
  runId?: string
) =>
  `assistantReceipt:${runId ? `${runId}:` : ''}${toolName}:${toolCallId}${resumed ? ':resumed' : ''}`;

export type AgentOperationScope = {
  organizationId?: string;
  runId?: string;
  threadId?: string;
  toolName: string;
  toolCallId: string;
  resumed?: boolean;
  resumeKey?: string;
  storage?: Pick<MastraCompositeStore, 'getStore'>;
  memory?: {
    getThreadById?: (input: { threadId: string }) => Promise<{
      metadata?: Record<string, unknown>;
    } | null>;
    updateThread?: (input: { id: string; metadata?: Record<string, unknown> }) => Promise<unknown>;
  };
};

export type AgentOperationRunScope = Pick<AgentOperationScope,
  'organizationId' | 'runId' | 'threadId' | 'storage'> & {
    /** Previous native attempts of this same logical task, never unrelated user turns. */
    previousRunIds?: readonly string[];
    memory?: Pick<NonNullable<AgentOperationScope['memory']>, 'getThreadById'>;
  };

export type AgentOperationRunGuard = {
  version: 1;
  state: 'uncertain';
  operationType: string;
};

type OperationRecord<T = unknown> = {
  version: 1;
  state: 'pending' | 'suspended' | 'committed';
  receipt?: CommittedToolReceipt<T>;
};

export class AgentOperationPersistenceError extends Error {
  constructor(
    readonly code: 'CAPABILITY_RECEIPT_UNAVAILABLE' | 'CAPABILITY_OUTCOME_UNCERTAIN',
    readonly operationType?: string
  ) {
    super(code === 'CAPABILITY_OUTCOME_UNCERTAIN'
      ? 'This action may already have completed or been billed. Its completion could not be verified. Do not repeat it, including with a new tool call; ask the person to check the result before any new attempt.'
      : 'Could not verify and durably reserve this action. This invocation did not start it. Do not retry automatically; ask the person to try again after storage is available.');
  }
}

export const uncertainAgentOperation = (operationType?: string) =>
  new AgentOperationPersistenceError('CAPABILITY_OUTCOME_UNCERTAIN', operationType);

/** Native ownership and native per-thread state share this opaque identity. */
export const agentOperationStateType = (args: AgentOperationScope) =>
  `assistant-operation:${createHash('sha256').update(JSON.stringify([
    args.organizationId ?? '', args.threadId, args.runId, args.toolName,
    args.toolCallId, !!args.resumed, ...(args.resumed && args.resumeKey ? [args.resumeKey] : []),
  ])).digest('hex')}`;

/** Distinct native human-input phases can share a run and tool-call ID. */
export const agentOperationResumeKey = (resumeData: unknown, suspendPayload: unknown) =>
  createHash('sha256').update(JSON.stringify([suspendPayload, resumeData])).digest('hex');

export const agentOperationRunStateType = (args: AgentOperationRunScope) =>
  `assistant-operation-run:${createHash('sha256').update(JSON.stringify([
    args.organizationId ?? '', args.threadId, args.runId,
  ])).digest('hex')}`;

const operationStore = async (args: AgentOperationRunScope) => {
  if (!args.runId || !args.threadId || !args.storage) {
    throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
  }
  const store = await args.storage.getStore('threadState');
  if (!store) throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
  return store;
};

/** Strict root/history reader: storage unavailability cannot mean a safe run. */
export const readAgentOperationRunGuard = async (
  args: AgentOperationRunScope
): Promise<AgentOperationRunGuard | null> => {
  try {
    const store = await operationStore(args);
    const previous = args.previousRunIds ?? [];
    if (!Array.isArray(previous) || previous.some((runId) => typeof runId !== 'string' || !runId)) {
      throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
    }
    for (const runId of new Set([args.runId!, ...previous])) {
      const value = await store.getState<AgentOperationRunGuard>({
        threadId: args.threadId!, type: agentOperationRunStateType({ ...args, runId }),
      });
      if (value === undefined) continue;
      if (value?.version === 1 && value.state === 'uncertain' && typeof value.operationType === 'string') return value;
      throw uncertainAgentOperation();
    }
    if (!previous.length) return null;
    // A guard acknowledgement may have been lost after the domain write.
    // Inspect the pre-effect witnesses of the exact logical-task lineage,
    // rather than treating a new internal native run ID as a clean task.
    const thread = await args.memory?.getThreadById?.({ threadId: args.threadId! });
    if (!thread) throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
    const prefixes = [...new Set(previous)].map((runId) => `${agentOperationRunStateType({ ...args, runId })}:`);
    for (const [key, raw] of Object.entries(thread.metadata ?? {})) {
      if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
      const witness = raw as OperationWitness | null;
      if (!witness || typeof witness.operationType !== 'string') throw uncertainAgentOperation();
      const record = await store.getState<OperationRecord>({ threadId: args.threadId!, type: witness.operationType });
      if (record?.version === 1 && (record.state === 'suspended' ||
          (record.state === 'committed' && record.receipt && typeof record.receipt === 'object' && 'result' in record.receipt))) continue;
      return { version: 1, state: 'uncertain', operationType: witness.operationType };
    }
    return null;
  } catch (error) {
    if (error instanceof AgentOperationPersistenceError) throw error;
    throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
  }
};

export const recordAgentOperationUncertain = async (
  args: AgentOperationScope, operationType = agentOperationStateType(args)
): Promise<void> => {
  await (await operationStore(args)).setState<AgentOperationRunGuard>({
    threadId: args.threadId!, type: agentOperationRunStateType(args),
    value: { version: 1, state: 'uncertain', operationType },
  });
};

type OperationWitness = {
  operationType: string;
  callType?: string;
  generation?: number;
  ownerId?: string;
  /** Exact pre-effect phases this later native human answer is resuming. */
  resumes?: string[];
};

const readPreviousOperationWitnesses = async (args: AgentOperationScope) => {
  const thread = await args.memory?.getThreadById?.({ threadId: args.threadId! });
  if (!thread) throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
  const workflows = await args.storage!.getStore('workflows');
  const current = workflows && resolveRunFence(workflows, undefined, args.runId);
  const store = await operationStore(args);
  const phases: Array<{ witness: OperationWitness; record: OperationRecord | undefined }> = [];
  for (const [key, witness] of Object.entries(thread.metadata ?? {})) {
    if (!key.startsWith(`${agentOperationRunStateType(args)}:`)) continue;
    const previous = witness as OperationWitness | null;
    if (!previous || typeof previous.operationType !== 'string' ||
        (previous.resumes !== undefined && (!Array.isArray(previous.resumes) ||
          previous.resumes.some((phase) => typeof phase !== 'string' || !phase)))) throw uncertainAgentOperation();
    const record = await store.getState<OperationRecord>({ threadId: args.threadId!, type: previous.operationType });
    phases.push({ witness: previous, record });
  }
  const resumedPhases: string[] = [];
  const initialPhase = agentOperationStateType({ ...args, resumed: false });
  for (const { witness: previous, record } of phases) {
    if (record?.version === 1 && record.state === 'committed' && record.receipt && 'result' in record.receipt) continue;
    // A committed answer only resolves the same call's suspended phases that
    // already existed before it began. A later suspension remains uncertain.
    if (record?.version === 1 && record.state === 'suspended' && phases.some(({ witness, record: completed }) =>
      witness.callType === (previous.callType ?? previous.operationType) && witness.operationType !== witness.callType &&
      witness.resumes?.includes(previous.operationType) && completed?.version === 1 && completed.state === 'committed' &&
      completed.receipt && 'result' in completed.receipt)) continue;
    if (record?.version === 1 && record.state === 'suspended' && args.resumed &&
        (previous.operationType === initialPhase || previous.callType === initialPhase)) {
      resumedPhases.push(previous.operationType);
      continue;
    }
    // Parallel tools of the same native driver are ordinary work. A new
    // driver cannot turn its predecessor's unresolved write into permission.
    if (current && previous.generation === current.generation && previous.ownerId === current.ownerId) continue;
    throw uncertainAgentOperation(previous.operationType);
  }
  return resumedPhases;
};

const recordPendingOperationWitness = async (args: AgentOperationScope, resumes: string[]) => {
  if (!args.memory?.updateThread) throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
  const workflows = await args.storage!.getStore('workflows');
  const current = workflows && resolveRunFence(workflows, undefined, args.runId);
  const witness: OperationWitness = {
    operationType: agentOperationStateType(args),
    callType: agentOperationStateType({ ...args, resumed: false }),
    ...(resumes.length ? { resumes } : {}),
    ...(current ? { generation: current.generation, ownerId: current.ownerId } : {}),
  };
  // Native memory updates merge these distinct keys under the parent run
  // fence, atomically rejecting a stale driver's write. This durable witness
  // predates the side effect, so a later guard-store outage stays fail-closed.
  await args.memory.updateThread({ id: args.threadId!, metadata: {
    [`${agentOperationRunStateType(args)}:${witness.operationType}`]: witness,
  } });
};

/** A failed read is never absence. There is deliberately no process-local cache. */
export const readCommittedToolReceipt = async <T = unknown>(
  args: AgentOperationScope
): Promise<CommittedToolReceipt<T> | null> => {
  try {
    const store = await operationStore(args);
    const record = await store.getState<OperationRecord<T>>({
      threadId: args.threadId!, type: agentOperationStateType(args),
    });
    if (record !== undefined) {
      if (record?.version === 1 && record.state === 'committed' &&
          record.receipt && typeof record.receipt === 'object' && 'result' in record.receipt) {
        return record.receipt;
      }
      // Pending, corrupt, and future records cannot authorize another write.
      throw uncertainAgentOperation(agentOperationStateType(args));
    }
    const thread = await args.memory!.getThreadById!({ threadId: args.threadId! });
    if (!thread) throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
    // Retain receipts written before the native operation-state boundary.
    const stored = thread.metadata?.[agentOperationReceiptMetadataKey(
      args.toolName, args.toolCallId, args.resumed, args.runId
    )];
    if (stored === undefined) return null;
    if (stored && typeof stored === 'object' && 'result' in stored) {
      return stored as CommittedToolReceipt<T>;
    }
    throw uncertainAgentOperation();
  } catch (error) {
    if (error instanceof AgentOperationPersistenceError) throw error;
    throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
  }
};

/**
 * Reserve before entering the real capability, including paid providers.
 * expectedGeneration: 0 is a one-shot native CAS, not an expiring lock: even
 * after lease release/expiry, an existing generation never authorizes replay.
 * The independent pending state also survives ownership-record retention.
 */
export const beginAgentOperation = async <T = unknown>(args: AgentOperationScope, blockedOperationType?: string): Promise<{
  receipt: CommittedToolReceipt<T> | null;
}> => {
  try {
    const receipt = await readCommittedToolReceipt<T>(args);
    if (receipt) return { receipt };
    if (blockedOperationType) throw uncertainAgentOperation(blockedOperationType);
    const guard = await readAgentOperationRunGuard(args);
    if (guard) throw uncertainAgentOperation(guard.operationType);
    const resumes = await readPreviousOperationWitnesses(args);
    const workflows = await args.storage!.getStore('workflows');
    if (!workflows || !(await workflows.supportsRunFencing())) {
      throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
    }
    const claim = await workflows.claimRunOwnership({
      runId: agentOperationStateType(args), ownerId: randomUUID(),
      leaseMs: 30_000, expectedGeneration: 0,
    });
    if (!claim.acquired) {
      // The winner can have committed since our first read.
      const completed = await readCommittedToolReceipt<T>(args);
      if (completed) return { receipt: completed };
      throw uncertainAgentOperation();
    }
    // A retained pending state still blocks execution if ownership retention
    // removed the old CAS record between reads.
    const completed = await readCommittedToolReceipt<T>(args);
    if (completed) return { receipt: completed };
    const store = await operationStore(args);
    await store.setState<OperationRecord>({
      threadId: args.threadId!, type: agentOperationStateType(args),
      value: { version: 1, state: 'pending' },
    });
    await recordPendingOperationWitness(args, resumes);
    return { receipt: null };
  } catch (error) {
    if (error instanceof AgentOperationPersistenceError) throw error;
    throw new AgentOperationPersistenceError('CAPABILITY_RECEIPT_UNAVAILABLE');
  }
};

/** Receipt acknowledgement is part of success, including a late cancelled result. */
export const recordCommittedToolReceipt = async <T = unknown>(
  args: AgentOperationScope & { receipt: CommittedToolReceipt<T> }
): Promise<void> => {
  try {
    const store = await operationStore(args);
    await store.setState<OperationRecord<T>>({
      threadId: args.threadId!, type: agentOperationStateType(args),
      value: { version: 1, state: 'committed', receipt: args.receipt },
    });
  } catch {
    // The domain call has already returned. Even a failed acknowledgement can
    // mean the receipt committed, so only a fresh read can establish success.
    throw uncertainAgentOperation();
  }
};

/** A native human-input yield completes this phase, without claiming a write succeeded. */
export const recordSuspendedToolOperation = async (args: AgentOperationScope): Promise<void> => {
  try {
    await (await operationStore(args)).setState<OperationRecord>({
      threadId: args.threadId!, type: agentOperationStateType(args),
      value: { version: 1, state: 'suspended' },
    });
  } catch {
    throw uncertainAgentOperation();
  }
};
