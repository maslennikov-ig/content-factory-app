import { Mastra } from '@mastra/core/mastra';
import { createDurableAgenticWorkflow } from '@mastra/core/agent/durable';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { MastraMemory } from '@mastra/core/memory';
import type { AnyWorkflow } from '@mastra/core/workflows';
import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
} from '@mastra/core/request-context';
import {
  CONDUCTOR_REQUEST_ID_KEY,
  conductorResourceId,
} from './conductor.context';
import { AGENT_EXECUTION_METADATA_KEY } from './agent-turn-lifecycle';

export const NATIVE_ROOT_WORKFLOW = 'durable-agentic-loop';
export const NATIVE_NESTED_WORKFLOW = 'durable-agentic-execution';
const terminal = new Set([
  'success',
  'failed',
  'canceled',
  'tripwire',
  'bailed',
  'skipped',
]);
const record = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
export const nativeSnapshot = (row: unknown): Record<string, any> => {
  const value = record(row).snapshot;
  return record(typeof value === 'string' ? JSON.parse(value) : value);
};
export const nativeSnapshotTerminal = (row: unknown) =>
  terminal.has(nativeSnapshot(row).status);

export type NativeStopBinding = {
  runId: string;
  threadId: string;
  resourceId: string;
  requestId: string;
};

/** A retained SDK registry entry is not an executing driver after its exact fence settled. */
export async function nativeLocalExecutionSettled(
  entry: {executionFence?: {runId: string; executionId: string; generation?: number; whenSettled: Promise<void>}} | undefined,
  runId: string,
  owner: {ownerId?: string; generation?: number; live?: boolean} | null | undefined
): Promise<boolean> {
  if (!entry) return true;
  const fence = entry.executionFence;
  if (!fence || typeof fence.whenSettled?.then !== 'function' ||
      typeof fence.executionId !== 'string' || !fence.executionId.trim() ||
      typeof owner?.ownerId !== 'string' || !owner.ownerId.trim() ||
      fence.runId !== runId || owner.live !== false ||
      fence.executionId !== owner.ownerId || fence.generation !== owner.generation) return false;
  const pending = Symbol('native-execution-pending');
  return await Promise.race([fence.whenSettled, Promise.resolve(pending)]) !== pending;
}

export class NativeStopOwnerPendingError extends Error {
  readonly code = 'NATIVE_STOP_OWNER_PENDING';
  constructor() {
    super('Native Stop still has an active or changed native owner.');
    this.name = 'NativeStopOwnerPendingError';
  }
}

export class NativeRecoveryRefusedError extends Error {
  constructor(readonly reason: 'stopped' | 'unverified') {
    super(
      reason === 'stopped'
        ? 'Stopped native work cannot be recovered.'
        : 'Native recovery ownership could not be verified.'
    );
    this.name = 'NativeRecoveryRefusedError';
  }
}

function snapshotBinding(row: unknown): NativeStopBinding | null {
  const snapshot = nativeSnapshot(row);
  const context = record(
    snapshot.requestContext ??
      record(record(snapshot.context).input).requestContextEntries
  );
  const binding = {
    runId: snapshot.runId,
    threadId: context[MASTRA_THREAD_ID_KEY],
    resourceId: record(row).resourceId,
    requestId: context[CONDUCTOR_REQUEST_ID_KEY],
  };
  if (
    Object.values(binding).some(
      (value) => typeof value !== 'string' || !value
    ) ||
    context[MASTRA_RESOURCE_ID_KEY] !== binding.resourceId ||
    typeof context['cf.organizationId'] !== 'string' ||
    typeof context['cf.userId'] !== 'string' ||
    conductorResourceId(context['cf.organizationId'], context['cf.userId']) !==
      binding.resourceId
  )
    return null;
  return binding;
}

export function nativeStopIntent(
  thread: unknown,
  binding: NativeStopBinding
): boolean {
  const row = record(thread),
    metadata = record(row.metadata);
  const pointer = record(metadata.assistantNativeRun),
    marker = record(metadata[AGENT_EXECUTION_METADATA_KEY]);
  const related = [
    pointer.runId,
    pointer.previousRunId,
    ...(Array.isArray(pointer.lineageRunIds) ? pointer.lineageRunIds : []),
  ];
  return (
    row.id === binding.threadId &&
    row.resourceId === binding.resourceId &&
    pointer.logicalRequestId === binding.requestId &&
    related.includes(binding.runId) &&
    (pointer.state === 'stopped' ||
      (marker.requestId === binding.requestId && marker.stopRequested === true))
  );
}

function currentBinding(thread: unknown, binding: NativeStopBinding): boolean {
  const row = record(thread),
    metadata = record(row.metadata),
    pointer = record(metadata.assistantNativeRun);
  return (
    row.id === binding.threadId &&
    row.resourceId === binding.resourceId &&
    pointer.logicalRequestId === binding.requestId &&
    record(metadata[AGENT_EXECUTION_METADATA_KEY]).requestId ===
      binding.requestId &&
    [
      pointer.runId,
      pointer.previousRunId,
      ...(Array.isArray(pointer.lineageRunIds) ? pointer.lineageRunIds : []),
    ].includes(binding.runId)
  );
}

/** Runs before the public SDK recover dispatch, including fleet lease retries and force recovery. */
export async function assertNativeRecoveryAllowed(
  storage: MastraCompositeStore,
  memory: MastraMemory | undefined,
  runId: string
) {
  const workflows = await storage.getStore('workflows');
  if (!workflows || !memory) throw new NativeRecoveryRefusedError('unverified');
  const row = await workflows.getWorkflowRunById({
    workflowName: NATIVE_ROOT_WORKFLOW,
    runId,
  });
  if (!row) return; // The SDK owns its missing-run response.
  const binding = snapshotBinding(row);
  if (!binding || binding.runId !== runId)
    throw new NativeRecoveryRefusedError('unverified');
  const thread = await memory.getThreadById({ threadId: binding.threadId });
  if (!currentBinding(thread, binding))
    throw new NativeRecoveryRefusedError('unverified');
  if (nativeStopIntent(thread, binding))
    throw new NativeRecoveryRefusedError('stopped');
}

const cancellationHosts = new WeakMap<
  MastraCompositeStore,
  { root: AnyWorkflow; nested: AnyWorkflow; host: Mastra }
>();
function cancellationWorkflows(storage: MastraCompositeStore) {
  let existing = cancellationHosts.get(storage);
  if (!existing) {
    // Real SDK definitions, not the live agent's objects: cold cancel needs the
    // nested definition registered but must never execute or recover a workflow.
    const root = createDurableAgenticWorkflow({ engine: 'default' });
    const nested = root.steps[NATIVE_NESTED_WORKFLOW] as unknown as AnyWorkflow;
    if (
      nested?.id !== NATIVE_NESTED_WORKFLOW ||
      typeof nested.createRun !== 'function'
    )
      throw new Error('Native Stop workflow definition is unavailable.');
    const host = new Mastra({
      storage,
      workflows: { exactRoot: root, exactNested: nested },
      recovery: { workflows: 'off', durableAgents: 'off' },
      workers: false,
      notifications: { dispatch: { enabled: false } },
      logger: false,
    });
    existing = { root, nested, host };
    cancellationHosts.set(storage, existing);
  }
  return existing;
}

/** Cancel only an exact owned root and its stored same-run nested workflow. */
export async function cancelNativeRunSnapshots(
  storage: MastraCompositeStore,
  binding: NativeStopBinding,
  stillOwned: () => Promise<boolean>
) {
  const workflows = await storage.getStore('workflows');
  if (!workflows) throw new Error('Native Stop storage is unavailable.');
  const names = [NATIVE_ROOT_WORKFLOW, NATIVE_NESTED_WORKFLOW];
  let rows = await Promise.all(
    names.map((workflowName) =>
      workflows.getWorkflowRunById({ workflowName, runId: binding.runId })
    )
  );
  const owner = await workflows.getRunOwnership({ runId: binding.runId });
  const sameOwner = async () => {
    const current = await workflows.getRunOwnership({ runId: binding.runId });
    if (
      current?.ownerId !== owner?.ownerId ||
      current?.generation !== owner?.generation
    )
      return false;
    return !current?.live;
  };
  if (!rows[0] && rows[1]) {
    const observed = snapshotBinding(rows[1]), nested = nativeSnapshot(rows[1]);
    if (!observed || Object.entries(binding).some(([key, value]) => observed[key as keyof NativeStopBinding] !== value) ||
        nested.parentWorkflow?.runId !== binding.runId || nested.parentWorkflow?.workflowId !== NATIVE_ROOT_WORKFLOW ||
        nested.parentWorkflow?.stepId !== NATIVE_NESTED_WORKFLOW)
      throw new Error('Native Stop checkpoint ownership changed.');
    // SDK abort deletes root/nested rows separately. Parallel reads can see
    // the deleted root and a nested row read just before its deletion.
    rows = await Promise.all(names.map(workflowName => workflows.getWorkflowRunById({workflowName, runId: binding.runId})));
    if (!(await stillOwned())) throw new Error('Native Stop task changed.');
    if (owner?.live || !(await sameOwner())) throw new Error('Native Stop still has an active or changed native owner.');
  }
  if (!rows[0]) {
    if (rows[1]) throw new Error('Native Stop root ownership is unavailable.');
    return;
  }
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row) continue;
    const actual = snapshotBinding(row),
      snapshot = nativeSnapshot(row);
    if (
      !actual ||
      Object.entries(binding).some(
        ([key, value]) => actual[key as keyof NativeStopBinding] !== value
      ) ||
      (index === 1 &&
        (snapshot.parentWorkflow?.runId !== binding.runId ||
          snapshot.parentWorkflow?.workflowId !== NATIVE_ROOT_WORKFLOW ||
          snapshot.parentWorkflow?.stepId !== NATIVE_NESTED_WORKFLOW))
    )
      throw new Error('Native Stop checkpoint ownership changed.');
  }
  const definitions = cancellationWorkflows(storage);
  for (let index = 0; index < rows.length; index++) {
    if (!rows[index] || nativeSnapshotTerminal(rows[index])) continue;
    if (!(await stillOwned())) throw new Error('Native Stop task changed.');
    if (!(await sameOwner()))
      throw new Error(
        'Native Stop still has an active or changed native owner.'
      );
    await (
      await (index === 0 ? definitions.root : definitions.nested).createRun({
        runId: binding.runId,
      })
    ).cancel();
  }
  // Run.cancel swallows storage failures and does not cascade. Its Promise is
  // not a receipt: reread every checkpoint that actually existed before Stop.
  const after = await Promise.all(
    names.map((workflowName) =>
      workflows.getWorkflowRunById({ workflowName, runId: binding.runId })
    )
  );
  if (
    !(await stillOwned()) ||
    !(await sameOwner()) ||
    rows.some((row, index) => row && !nativeSnapshotTerminal(after[index]))
  )
    throw new Error('Native Stop cancellation was not persisted.');
}
