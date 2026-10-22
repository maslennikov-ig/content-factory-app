import { randomUUID } from 'node:crypto';
import type { Agent, AgentExecutionOptions } from '@mastra/core/agent';
import type { Mastra } from '@mastra/core/mastra';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

/** Native workflow storage owns the deadline; durable-agent recovery owns its driver. */
export const NATIVE_MODEL_AVAILABILITY_WORKFLOW_ID =
  'content-factory-model-availability-v1';

const availabilitySchema = z.object({
  agentRunId: z.string().min(1),
  stepNumber: z.number().int().nonnegative(),
  cycle: z.number().int().positive(),
  retryAt: z.string().datetime(),
  reason: z.literal('provider-unavailable'),
});

type AvailabilityInput = z.infer<typeof availabilitySchema>;

export type NativeModelAvailabilityState = AvailabilityInput & {
  waitRunId: string;
  status: string;
};

type WaitingObserver = (
  state: NativeModelAvailabilityState
) => void | Promise<void>;
// Observers are process-local presentation callbacks, never recovery drivers.
const waitingObservers = new WeakMap<object, WaitingObserver>();

export const createNativeModelAvailabilityWorkflow = () =>
  createWorkflow({
    id: NATIVE_MODEL_AVAILABILITY_WORKFLOW_ID,
    inputSchema: availabilitySchema,
    outputSchema: availabilitySchema,
    options: {
      // Only the parent agent's claimed execution may re-drive this wait. A
      // blanket workflow restart alongside agent recovery would add a driver.
      autoRestartActiveRuns: false,
      shouldPersistSnapshot: () => true,
    },
  })
    .sleepUntil(
      async ({ inputData, runId, mastra }) => {
        // Native sleepUntil persists its `waiting` snapshot BEFORE evaluating
        // this function. Announce waiting only after the deadline is durable.
        await waitingObservers.get(mastra)?.({
          ...inputData,
          waitRunId: runId,
          status: 'waiting',
        });
        return new Date(inputData.retryAt);
      },
      {
        id: 'provider-cooldown',
      }
    )
    .then(
      createStep({
        id: 'provider-cooldown-elapsed',
        inputSchema: availabilitySchema,
        outputSchema: availabilitySchema,
        execute: async ({ inputData }) => inputData,
      })
    )
    .commit();

export type NativeModelAvailabilityPosition = {
  runId: string;
  stepNumber: number;
  abortSignal?: AbortSignal;
};

const activeStatuses = new Set(['pending', 'running', 'waiting']);
const abortError = () =>
  Object.assign(new Error('Model availability recovery was stopped.'), {
    name: 'AbortError',
  });

const ownershipLossIds = new Set([
  'DURABLE_AGENT_EXECUTION_SUPERSEDED',
  'DURABLE_AGENT_EXECUTION_UNVERIFIED',
  'DURABLE_AGENT_EXECUTION_ABANDONED',
]);
const isOwnershipLoss = (reason: unknown): boolean => {
  const visited = new Set<object>();
  let current = reason;
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const error = current as { id?: string; cause?: unknown };
    if (error.id && ownershipLossIds.has(error.id)) return true;
    current = error.cause;
  }
  return false;
};

/**
 * A thin adapter around a native sleepUntil workflow, with no model calls,
 * timers, polling, background driver or independent retry budget. Callers must
 * hold the parent DurableAgent execution claim, revalidate authorization, and
 * only call wait() after the eligible model chain's transient failures. Quota,
 * authentication, consent and uncertain writes must never enter this adapter.
 *
 * Register `workflow` on the same Mastra instance as the durable agent. Wire
 * beforeAttempt() into its input processor, wait() into final-model exhaustion,
 * and cancel() into explicit Stop. Running parent checkpoints must be enabled.
 */
export class NativeModelAvailability {
  constructor(
    private readonly host: Pick<Mastra, 'getStorage'>,
    readonly workflow: ReturnType<typeof createNativeModelAvailabilityWorkflow>,
    onWaiting?: WaitingObserver
  ) {
    if (onWaiting) waitingObservers.set(host, onWaiting);
  }

  private async store() {
    const store = await this.host.getStorage()?.getStore('workflows');
    if (!store)
      throw new Error('Native availability requires workflow storage.');
    return store;
  }

  private resourceId(runId: string) {
    return `model-availability:${runId}`;
  }

  async states(runId: string): Promise<NativeModelAvailabilityState[]> {
    const { runs } = await (
      await this.store()
    ).listWorkflowRuns({
      workflowName: NATIVE_MODEL_AVAILABILITY_WORKFLOW_ID,
      resourceId: this.resourceId(runId),
      perPage: false,
    });
    return runs.flatMap((run) => {
      const snapshot =
        typeof run.snapshot === 'string'
          ? JSON.parse(run.snapshot)
          : run.snapshot;
      const parsed = availabilitySchema.safeParse(snapshot?.context?.input);
      // Recheck the parent identity even if a storage adapter ignores filters.
      if (!parsed.success || parsed.data.agentRunId !== runId) return [];
      return [
        {
          ...parsed.data,
          waitRunId: run.runId,
          status: snapshot.status,
        },
      ];
    });
  }

  private async latest(position: NativeModelAvailabilityPosition) {
    return (await this.states(position.runId))
      .filter((state) => state.stepNumber === position.stepNumber)
      .sort((left, right) => right.cycle - left.cycle)[0];
  }

  private async drive(
    state: NativeModelAvailabilityState,
    abortSignal?: AbortSignal,
    start = false
  ): Promise<void> {
    const run = await this.workflow.createRun({
      runId: state.waitRunId,
      resourceId: this.resourceId(state.agentRunId),
    });
    let cancellation: Promise<void> | undefined;
    const cancel = () => {
      // A takeover aborts the old parent execution too. Its stale controller
      // must not turn that ownership loss into a persisted Stop for its heir.
      if (isOwnershipLoss(abortSignal?.reason)) return;
      // cancel() skips an already-canceled persisted run. A remote Stop may
      // have saved that state first, while this native sleep still owns a live
      // controller. Abort the public Run controller too so its sleep unwinds.
      run.abortController.abort();
      cancellation = run.cancel();
      // A listener cannot await. The finally block below observes persistence.
      void cancellation.catch(() => undefined);
    };
    abortSignal?.addEventListener('abort', cancel, { once: true });
    try {
      if (abortSignal?.aborted) {
        if (!isOwnershipLoss(abortSignal.reason)) await run.cancel();
        throw abortError();
      }
      const result = start
        ? await run.start({
            inputData: {
              agentRunId: state.agentRunId,
              stepNumber: state.stepNumber,
              cycle: state.cycle,
              retryAt: state.retryAt,
              reason: state.reason,
            },
          })
        : await run.restart();
      // The native engine returns canceled at runtime although WorkflowResult's
      // declaration omits that status in 1.78.
      const status = String(result.status);
      if (abortSignal?.aborted || status === 'canceled') throw abortError();
      if (result.status !== 'success') {
        throw new Error(
          `Native model availability wait ended as ${result.status}.`
        );
      }
    } finally {
      abortSignal?.removeEventListener('abort', cancel);
      await cancellation;
      if (abortSignal?.aborted && !isOwnershipLoss(abortSignal.reason)) {
        // Native cancellation may have raced its sleep's last state write.
        // Reconcile through a fresh public Run after the live engine settled.
        const stopped = await this.workflow.createRun({
          runId: state.waitRunId,
          resourceId: this.resourceId(state.agentRunId),
        });
        await stopped.cancel();
      }
    }
  }

  /** Cold recovery waits out the saved deadline before another provider call. */
  async beforeAttempt(
    position: NativeModelAvailabilityPosition
  ): Promise<void> {
    if (position.abortSignal?.aborted) throw abortError();
    const latest = await this.latest(position);
    if (!latest) return;
    if (latest.status === 'canceled') throw abortError();
    if (activeStatuses.has(latest.status)) {
      await this.drive(latest, position.abortSignal);
    } else if (latest.status !== 'success') {
      throw new Error(
        `Native availability state requires attention: ${latest.status}.`
      );
    }
  }

  /** The caller supplies a bounded cooldown; this method never retries a model. */
  async wait(
    position: NativeModelAvailabilityPosition & { delayMs: number }
  ): Promise<{ retry: true }> {
    if (position.abortSignal?.aborted) throw abortError();
    if (!Number.isFinite(position.delayMs) || position.delayMs <= 0) {
      throw new Error(
        'Native availability delay must be a positive finite duration.'
      );
    }
    const latest = await this.latest(position);
    if (latest?.status === 'canceled') throw abortError();
    if (latest && activeStatuses.has(latest.status)) {
      await this.drive(latest, position.abortSignal);
    } else {
      if (latest && latest.status !== 'success') {
        throw new Error(
          `Native availability state requires attention: ${latest.status}.`
        );
      }
      await this.drive(
        {
          agentRunId: position.runId,
          stepNumber: position.stepNumber,
          cycle: (latest?.cycle ?? 0) + 1,
          retryAt: new Date(Date.now() + position.delayMs).toISOString(),
          reason: 'provider-unavailable',
          waitRunId: randomUUID(),
          status: 'waiting',
        },
        position.abortSignal,
        true
      );
    }
    if (position.abortSignal?.aborted) throw abortError();
    return { retry: true };
  }

  /** Also persists cancellation when Stop arrives in a fresh service/process. */
  async cancel(runId: string): Promise<void> {
    const states = await this.states(runId);
    await Promise.all(
      states
        .filter((state) => activeStatuses.has(state.status))
        .map(async (state) => {
          const run = await this.workflow.createRun({
            runId: state.waitRunId,
            resourceId: this.resourceId(runId),
          });
          await run.cancel();
        })
    );
  }
}

/**
 * Public native steering for an exhausted generation, including partial text.
 * A queued reactive signal starts a new native run after abort flushes this
 * run's messages. The application keeps the same task/thread identity and
 * distinguishes the interrupted partial message from the continuation.
 */
export async function queueNativeModelAvailabilityContinuation(
  agent: Pick<
    Agent,
    'queueSignal' | 'abortThreadStream' | 'cancelQueuedMessages'
  >,
  position: NativeModelAvailabilityPosition & {
    resourceId: string;
    threadId: string;
    streamOptions?: AgentExecutionOptions;
    onQueued?: (continuationRunId: string) => void | Promise<void>;
  }
): Promise<{ retry: true; continuationRunId: string }> {
  if (position.abortSignal?.aborted) throw abortError();
  const queued = agent.queueSignal(
    {
      type: 'reactive',
      transient: true,
      contents:
        'Continue the same task from its saved progress. Keep completed tool results and do not repeat completed work.',
    },
    {
      runId: position.runId,
      resourceId: position.resourceId,
      threadId: position.threadId,
      queueOwnerId: `model-availability:${position.runId}`,
      ...(position.streamOptions
        ? { ifIdle: { streamOptions: position.streamOptions } }
        : {}),
    }
  );
  try {
    const accepted = await queued.accepted;
    if (accepted.action !== 'deliver' || !accepted.runId) {
      throw new Error('Native availability continuation was not queued.');
    }
    if (position.abortSignal?.aborted) throw abortError();
    await position.onQueued?.(accepted.runId);
    if (position.abortSignal?.aborted) throw abortError();
    const interrupted = agent.abortThreadStream({
      resourceId: position.resourceId,
      threadId: position.threadId,
      expectedRunId: position.runId,
      clearPendingSignals: false,
    });
    if (!interrupted) throw abortError();
    // Re-enter the native attempt boundary so it observes the abort before any
    // provider call; returning false here could reach SDK's fatal-error branch.
    return { retry: true, continuationRunId: accepted.runId };
  } catch (error) {
    agent.cancelQueuedMessages({
      resourceId: position.resourceId,
      threadId: position.threadId,
      signalIds: [queued.signal.id],
    });
    throw error;
  }
}
