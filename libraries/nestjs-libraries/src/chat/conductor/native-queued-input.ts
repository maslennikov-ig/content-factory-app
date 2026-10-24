import { createHash, randomUUID } from 'node:crypto';
import type { DurableAgent } from '@mastra/core/agent/durable';
import { createSignal } from '@mastra/core/agent';
import type { Mastra } from '@mastra/core/mastra';
import type { RequestContext } from '@mastra/core/request-context';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { parseAgentWorkContext } from './work-context';
import { observeConductorRun } from './native-run-observer';

export const NATIVE_QUEUED_INPUT_WORKFLOW_ID =
  'content-factory-queued-input-v1';
export const NATIVE_QUEUED_INPUT_TAIL_KEY = 'assistantQueuedInputTail';
export const NATIVE_QUEUED_INPUT_CHILD_CONTEXT_KEY = 'cf.queuedInputChildRunId';

const identitySchema = z.object({
  organizationId: z.string().min(1),
  organizationCreatedAt: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(['USER', 'EDITOR', 'ADMIN', 'SUPERADMIN']),
  language: z.enum(['ru', 'en']),
  timeZone: z.string().min(1),
});
const queuedInputSchema = z
  .object({
    identity: identitySchema,
    threadId: z.string().min(1),
    resourceId: z.string().min(1),
    requestId: z.string().min(1),
    childRunId: z.string().min(1),
    previousRunId: z.string().min(1).optional(),
    previousWorkflowRunId: z.string().min(1).optional(),
    workContext: z.unknown().transform(parseAgentWorkContext).optional(),
    signal: z.object({
      id: z.string().min(1),
      contents: z.string().min(1),
      createdAt: z.string().datetime(),
      author: z.object({ id: z.string().min(1), name: z.string().optional() }),
    }),
  })
  .refine(
    (input) =>
      input.resourceId ===
        `${input.identity.organizationId}:${input.identity.userId}` &&
      input.signal.author.id === input.identity.userId,
    'Queued input identity does not match its owner.'
  );

export type NativeQueuedInput = z.infer<typeof queuedInputSchema>;
export type NativeQueuedInputSubmission = Omit<
  NativeQueuedInput,
  'childRunId' | 'previousWorkflowRunId'
>;
type Host = Pick<Mastra, 'getStorage'>;
type QueuedResult = { childRunId: string; text: string };
export type NativeQueuedInputDisposition =
  | { version: 1; state: 'started' | 'stopped' }
  | { version: 1; state: 'completed'; result: QueuedResult };

/** Fresh authorization, context and usage/lifecycle scope are supplied by the existing service. */
export type NativeQueuedInputRuntime = {
  agent: DurableAgent;
  requestContext: RequestContext<Record<string, unknown>>;
  streamOptions: Record<string, unknown>;
  run: <T>(work: () => Promise<T>) => Promise<T>;
  /** Existing availability lineage only: observe its successor, never drive another retry. */
  resolveContinuation?: (runId: string) => Promise<string | undefined>;
  /** Exact native assistant identity from this task's existing public reader. */
  onMessageId?: (runId: string, messageId: string) => Promise<void>;
};

/** A racing native owner already drives this task; void the unused admission. */
export class NativeQueuedInputObserveOnlyError extends Error {
  readonly code = 'NATIVE_QUEUE_OBSERVE_ONLY';
  constructor() {
    super('The native task is already driven by another execution.');
  }
}

const hash = (...values: string[]) =>
  createHash('sha256').update(JSON.stringify(values)).digest('hex');
export const nativeQueuedInputIds = (
  input: Pick<NativeQueuedInput, 'identity' | 'threadId' | 'signal'>
) => {
  const key = hash(
    input.identity.organizationId,
    input.threadId,
    input.signal.id
  );
  return {
    workflowRunId: `queued-input:${key}`,
    childRunId: `queued-turn:${key}`,
  };
};
const dispositionType = (childRunId: string) =>
  `queued-input-state:${hash(childRunId)}`;
const stopWitnessType = (childRunId: string) =>
  `queued-input-stop:${hash(childRunId)}`;
const abortError = () =>
  Object.assign(new Error('Queued input was stopped.'), { name: 'AbortError' });
const active = new Set(['pending', 'running', 'waiting']);

const stores = async (host: Host) => {
  const storage = host.getStorage();
  const workflows = await storage?.getStore('workflows');
  const state = await storage?.getStore('threadState');
  if (!workflows || !state)
    throw new Error('Native queued-input persistence is unavailable.');
  return { workflows, state };
};

/** Also used by model admission, before native recovery is allowed to call a provider. */
export const readNativeQueuedInputDisposition = async (
  host: Host,
  threadId: string,
  childRunId: string
): Promise<NativeQueuedInputDisposition | undefined> => {
  const { state } = await stores(host);
  const stopped = await state.getState<{ version: 1; state: 'stopped' }>({
    threadId,
    type: stopWitnessType(childRunId),
  });
  if (stopped !== undefined) {
    if (stopped?.version !== 1 || stopped.state !== 'stopped')
      throw new Error('Native queued-input Stop cannot be verified.');
    return stopped;
  }
  const value = await state.getState<NativeQueuedInputDisposition>({
    threadId,
    type: dispositionType(childRunId),
  });
  if (
    value !== undefined &&
    (value?.version !== 1 ||
      !['started', 'stopped', 'completed'].includes(value.state) ||
      (value.state === 'completed' &&
        (!value.result || value.result.childRunId !== childRunId)))
  ) {
    throw new Error('Native queued-input state cannot be verified.');
  }
  return value;
};

const observeCompletion = async (
  agent: DurableAgent,
  runId: string,
  signal: AbortSignal,
  isAlive: (runId: string) => Promise<boolean>,
  resolveContinuation?: (runId: string) => Promise<string | undefined>,
  onMessageId?: NativeQueuedInputRuntime['onMessageId'],
  visited = new Set<string>()
): Promise<string> => {
  if (visited.has(runId))
    throw new Error('Native continuation lineage contains a cycle.');
  visited.add(runId);
  const observed = await observeConductorRun(agent, runId, {
    idleTimeoutMs: 1_000,
    isAlive: () => isAlive(runId),
  });
  const detach = () => observed.detach();
  signal.addEventListener('abort', detach, { once: true });
  if (signal.aborted) detach();
  let finished = false;
  let text = '';
  const reader = observed.fullStream.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      if (chunk.type === 'start' && typeof chunk.payload.messageId === 'string')
        await onMessageId?.(chunk.runId, chunk.payload.messageId);
      if (chunk.type === 'text-delta') text += chunk.payload.text;
      if (chunk.type === 'error' || chunk.type === 'tripwire') {
        throw new Error('The preceding native run did not complete.');
      }
      if (chunk.type === 'finish') {
        if (['abort', 'aborted'].includes(chunk.payload?.stepResult?.reason))
          throw abortError();
        if (chunk.payload?.stepResult?.reason !== 'stop')
          throw new Error('The native run did not finish successfully.');
        finished = true;
      }
    }
    if (signal.aborted) throw abortError();
    if (!finished)
      throw new Error('The native run completion could not be verified.');
    return text;
  } catch (error) {
    if (signal.aborted) throw error;
    const successor = await resolveContinuation?.(runId);
    if (!successor || successor === runId) throw error;
    return observeCompletion(
      agent,
      successor,
      signal,
      isAlive,
      resolveContinuation,
      onMessageId,
      visited
    );
  } finally {
    reader.releaseLock();
    signal.removeEventListener('abort', detach);
    // Detaching leaves the observed run and its shared replay cache intact.
    observed.detach();
  }
};

/**
 * Native workflow snapshots own accepted words and ordering dependencies. The
 * adapter only waits on native agent events and guards the child start. It has
 * no delivery queue, scheduler, retry loop or process-local recovery state.
 */
export const createNativeQueuedInputWorkflow = (options: {
  resolveRuntime: (
    input: NativeQueuedInput
  ) => Promise<NativeQueuedInputRuntime>;
}) => {
  const outputSchema = z.object({ childRunId: z.string(), text: z.string() });
  return createWorkflow({
    id: NATIVE_QUEUED_INPUT_WORKFLOW_ID,
    inputSchema: queuedInputSchema,
    outputSchema,
    options: { autoRestartActiveRuns: true, shouldPersistSnapshot: () => true },
  })
    .then(
      createStep({
        id: 'wait-for-preceding-turn',
        inputSchema: queuedInputSchema,
        outputSchema: queuedInputSchema,
        execute: async ({ inputData, mastra, abortSignal, suspend, abort }) => {
          const stop = (): never => {
            abort();
            throw abortError();
          };
          const stopped = await readNativeQueuedInputDisposition(
            mastra,
            inputData.threadId,
            inputData.childRunId
          );
          if (abortSignal.aborted || stopped?.state === 'stopped')
            return stop();
          if (!inputData.previousRunId) return inputData;
          const workflow = mastra.getWorkflowById(
            NATIVE_QUEUED_INPUT_WORKFLOW_ID
          );
          const previous = inputData.previousWorkflowRunId
            ? await workflow.getWorkflowRunById(inputData.previousWorkflowRunId)
            : null;
          if (previous?.status === 'success') return inputData;
          if (previous && !active.has(previous.status))
            return suspend({ reason: 'preceding-input-not-complete' });
          const runtime = await options.resolveRuntime(inputData);
          try {
            await observeCompletion(
              runtime.agent,
              inputData.previousRunId,
              abortSignal,
              async (observedRunId) => {
                if (
                  (
                    await readNativeQueuedInputDisposition(
                      mastra,
                      inputData.threadId,
                      inputData.childRunId
                    )
                  )?.state === 'stopped'
                )
                  return false;
                const { workflows } = await stores(mastra);
                const owner = await workflows.getRunOwnership({
                  runId: observedRunId,
                });
                if (owner?.live) return true;
                const { runs } = await runtime.agent.listActiveRuns({
                  threadId: inputData.threadId,
                  resourceId: inputData.resourceId,
                });
                if (runs.some((run) => run.runId === observedRunId))
                  return true;
                const suspended = await runtime.agent.listSuspendedRuns({
                  threadId: inputData.threadId,
                  resourceId: inputData.resourceId,
                });
                if (suspended.runs.some((run) => run.runId === observedRunId))
                  return true;
                if (!inputData.previousWorkflowRunId) return false;
                const prior = await workflow.getWorkflowRunById(
                  inputData.previousWorkflowRunId
                );
                const disposition = await readNativeQueuedInputDisposition(
                  mastra,
                  inputData.threadId,
                  inputData.previousRunId!
                );
                return !!prior && active.has(prior.status) && !disposition;
              },
              runtime.resolveContinuation
            );
          } catch (error) {
            if (abortSignal.aborted) return stop();
            if (
              (
                await readNativeQueuedInputDisposition(
                  mastra,
                  inputData.threadId,
                  inputData.childRunId
                )
              )?.state === 'stopped'
            )
              return stop();
            return suspend({ reason: 'preceding-outcome-uncertain' });
          }
          return inputData;
        },
      })
    )
    .then(
      createStep({
        id: 'run-queued-turn',
        inputSchema: queuedInputSchema,
        outputSchema,
        execute: async ({ inputData, mastra, abortSignal, suspend, abort }) => {
          const stop = (): never => {
            abort();
            throw abortError();
          };
          const { workflows, state } = await stores(mastra);
          const args = {
            threadId: inputData.threadId,
            type: dispositionType(inputData.childRunId),
          };
          let prior = await readNativeQueuedInputDisposition(
            mastra,
            inputData.threadId,
            inputData.childRunId
          );
          if (abortSignal.aborted || prior?.state === 'stopped') return stop();
          if (prior?.state === 'completed') return prior.result;
          const runtime = await options.resolveRuntime(inputData);
          if (
            runtime.requestContext.get('cf.executionId') !== inputData.requestId
          ) {
            throw new Error(
              'Queued input requires its original trusted execution identity.'
            );
          }
          runtime.requestContext.set(
            NATIVE_QUEUED_INPUT_CHILD_CONTEXT_KEY,
            inputData.childRunId
          );
          const isChildAlive = async (runId: string) => {
            // The public thread runtime reserves an accepted successor before
            // its first workflow lease exists. Keep observing that exact native
            // owner across a slow handoff instead of settling its admission.
            if (runtime.agent.getActiveThreadRunId({
              threadId: inputData.threadId,
              resourceId: inputData.resourceId,
            }) === runId) return true;
            if ((await workflows.getRunOwnership({ runId }))?.live) return true;
            return (
              await runtime.agent.listSuspendedRuns({
                threadId: inputData.threadId,
                resourceId: inputData.resourceId,
              })
            ).runs.some((run) => run.runId === runId);
          };
          const complete = async (text: string) => {
            if (
              abortSignal.aborted ||
              (
                await readNativeQueuedInputDisposition(
                  mastra,
                  inputData.threadId,
                  inputData.childRunId
                )
              )?.state === 'stopped'
            )
              return stop();
            if (runtime.requestContext.get('cf.uncertainOperation'))
              throw new Error('A queued operation has an uncertain outcome.');
            const result = { childRunId: inputData.childRunId, text };
            await state.setState({
              ...args,
              value: { version: 1, state: 'completed', result },
            });
            return result;
          };
          const followExisting = async (runId: string) =>
            complete(
              await observeCompletion(
                runtime.agent,
                runId,
                abortSignal,
                isChildAlive,
                runtime.resolveContinuation,
                runtime.onMessageId
              )
            );
          const claim = prior
            ? null
            : await workflows.claimRunOwnership({
                runId: `queued-input-start:${hash(inputData.childRunId)}`,
                ownerId: randomUUID(),
                expectedGeneration: 0,
                leaseMs: 30_000,
              });
          if (prior || !claim?.acquired) {
            // A live/saved native child is recovered by native agent fencing. A
            // completed child may still have a shared cached FINISH after the SDK
            // deletes its terminal snapshots. Missing proof never grants a restart.
            const observeOrSuspend = async () => {
              try {
                return await followExisting(inputData.childRunId);
              } catch {
                if (
                  abortSignal.aborted ||
                  (
                    await readNativeQueuedInputDisposition(
                      mastra,
                      inputData.threadId,
                      inputData.childRunId
                    )
                  )?.state === 'stopped'
                )
                  return stop();
                return suspend({
                  reason: 'queued-outcome-uncertain',
                  childRunId: inputData.childRunId,
                });
              }
            };
            const activeChild = (
              await runtime.agent.listActiveRuns({
                threadId: inputData.threadId,
                resourceId: inputData.resourceId,
              })
            ).runs.some((run) => run.runId === inputData.childRunId);
            const owner = await workflows.getRunOwnership({
              runId: inputData.childRunId,
            });
            if (!activeChild || owner?.live) return observeOrSuspend();
            try {
              return await runtime.run(async () => {
                try {
                  const recovery = await runtime.agent.recoverActiveRuns({
                    runId: inputData.childRunId,
                  });
                  if (
                    !recovery.recovered.some(
                      (entry) => entry.status !== 'skipped'
                    )
                  )
                    throw new NativeQueuedInputObserveOnlyError();
                  return await followExisting(inputData.childRunId);
                } catch (error) {
                  if (error instanceof NativeQueuedInputObserveOnlyError)
                    throw error;
                  if (abortSignal.aborted) return stop();
                  if (
                    (
                      await readNativeQueuedInputDisposition(
                        mastra,
                        inputData.threadId,
                        inputData.childRunId
                      )
                    )?.state === 'stopped'
                  )
                    return stop();
                  return suspend({
                    reason: 'queued-outcome-uncertain',
                    childRunId: inputData.childRunId,
                  });
                }
              });
            } catch (error) {
              if (error instanceof NativeQueuedInputObserveOnlyError)
                return observeOrSuspend();
              throw error;
            }
          }
          await state.setState({
            ...args,
            value: { version: 1, state: 'started' },
          });
          if (
            abortSignal.aborted ||
            (
              await readNativeQueuedInputDisposition(
                mastra,
                inputData.threadId,
                inputData.childRunId
              )
            )?.state === 'stopped'
          )
            return stop();
          return runtime.run(async () => {
            try {
              const stream = await runtime.agent.stream(
                createSignal({ type: 'user', ...inputData.signal,
                  ...(inputData.workContext !== undefined ? { attributes: { workContext: JSON.stringify(inputData.workContext) } } : {}),
                }),
                {
                  ...runtime.streamOptions,
                  requestContext: runtime.requestContext,
                  runId: inputData.childRunId,
                  abortSignal,
                  closeOnSuspend: false,
                  untilIdle: true,
                }
              );
              let finished = false;
              const reader = stream.fullStream.getReader();
              try {
                while (true) {
                  const next = await reader.read();
                  if (next.done) break;
                  const chunk = next.value;
                  if (chunk.type === 'start' && typeof chunk.payload.messageId === 'string')
                    await runtime.onMessageId?.(chunk.runId, chunk.payload.messageId);
                  if (chunk.type === 'error' || chunk.type === 'tripwire')
                    throw new Error('Queued native execution failed.');
                  if (chunk.type === 'finish') {
                    if (chunk.payload?.stepResult?.reason !== 'stop')
                      throw new Error(
                        'Queued native execution did not complete.'
                      );
                    finished = true;
                  }
                }
              } finally {
                reader.releaseLock();
              }
              if (!finished)
                throw new Error('Queued native completion is unavailable.');
              const text = await stream.output.text;
              return await complete(text);
            } catch (error) {
              if (abortSignal.aborted) return stop();
              if (
                (
                  await readNativeQueuedInputDisposition(
                    mastra,
                    inputData.threadId,
                    inputData.childRunId
                  )
                )?.state === 'stopped'
              )
                return stop();
              const successor = await runtime.resolveContinuation?.(
                inputData.childRunId
              );
              if (successor && successor !== inputData.childRunId) {
                try {
                  return await followExisting(successor);
                } catch {
                  if (abortSignal.aborted) return stop();
                }
              }
              return suspend({
                reason: 'queued-outcome-uncertain',
                childRunId: inputData.childRunId,
              });
            }
          });
        },
      })
    )
    .commit();
};

export type NativeQueuedInputWorkflow = ReturnType<
  typeof createNativeQueuedInputWorkflow
>;

export class NativeQueuedInputAdmissionError extends Error {
  readonly code = 'QUEUED_INPUT_ACCEPTANCE_UNCERTAIN';
  constructor(
    readonly receipt: {
      workflowRunId: string;
      childRunId: string;
      requestId: string;
    }
  ) {
    super(
      'The queued input may already have been accepted. Inspect its stored workflow before another submission.'
    );
  }
}

/**
 * One native atomic claim serializes admission across processes. The fenced
 * Memory tail is only a dependency pointer; all accepted input is in native
 * workflow snapshots. Busy admission is refused instead of polled or queued.
 */
export const enqueueNativeQueuedInput = async (options: {
  host: Host;
  workflow: NativeQueuedInputWorkflow;
  input: NativeQueuedInputSubmission;
}) => {
  const { host, workflow } = options;
  const ids = nativeQueuedInputIds(options.input);
  const input = queuedInputSchema.parse({
    ...options.input,
    childRunId: ids.childRunId,
  });
  const { workflows } = await stores(host);
  const memory = await host.getStorage()?.getStore('memory');
  if (!memory || !(await workflows.supportsRunFencing()))
    throw new Error('Native queued-input admission is unavailable.');
  const lock = await workflows.claimRunOwnership({
    runId: `queued-input-admission:${hash(
      input.identity.organizationId,
      input.threadId
    )}`,
    ownerId: randomUUID(),
    leaseMs: 30_000,
  });
  if (!lock.acquired) throw new Error('Native queued-input admission is busy.');
  const fence = {
    runId: lock.record.runId,
    ownerId: lock.record.ownerId!,
    generation: lock.record.generation,
  };
  let dispatchAttempted = false;
  try {
    if (!(await memory.raiseRunFence(fence)))
      throw new Error('Native queued-input admission lost its claim.');
    const existing = await workflow.getWorkflowRunById(ids.workflowRunId);
    if (existing) {
      const snapshot = await workflows.loadWorkflowSnapshot({
        workflowName: NATIVE_QUEUED_INPUT_WORKFLOW_ID,
        runId: ids.workflowRunId,
      });
      const original = queuedInputSchema.parse(snapshot?.context?.input);
      if (
        original.signal.contents !== input.signal.contents ||
        original.resourceId !== input.resourceId ||
        original.signal.author.id !== input.signal.author.id ||
        JSON.stringify(original.workContext) !== JSON.stringify(input.workContext)
      )
        throw new Error(
          'The queued message id already belongs to different input.'
        );
      return { ...ids, requestId: original.requestId, duplicate: true };
    }
    const thread = await memory.getThreadById({
      threadId: input.threadId,
      resourceId: input.resourceId,
    });
    if (!thread || thread.resourceId !== input.resourceId)
      throw new Error('Queued input thread is unavailable.');
    const tail = thread.metadata?.[NATIVE_QUEUED_INPUT_TAIL_KEY] as
      | { workflowRunId?: unknown; childRunId?: unknown }
      | undefined;
    if (tail) {
      if (
        typeof tail.workflowRunId !== 'string' ||
        typeof tail.childRunId !== 'string'
      )
        throw new Error('Queued input order cannot be verified.');
      input.previousWorkflowRunId = tail.workflowRunId;
      input.previousRunId = tail.childRunId;
    }
    const run = await workflow.createRun({
      runId: ids.workflowRunId,
      resourceId: input.resourceId,
    });
    // Unlike Session.queueSignal, public startAsync awaits durable dispatch.
    dispatchAttempted = true;
    await run.startAsync({ inputData: input });
    const admitted = await memory.updateThreadMetadata({
      id: input.threadId,
      resourceId: input.resourceId,
      fence,
      update: (current) => ({
        ...current.metadata,
        [NATIVE_QUEUED_INPUT_TAIL_KEY]: ids,
      }),
    });
    if (
      !admitted ||
      (
        admitted.metadata?.[NATIVE_QUEUED_INPUT_TAIL_KEY] as
          | { workflowRunId?: string }
          | undefined
      )?.workflowRunId !== ids.workflowRunId
    ) {
      throw new Error('Native queued-input order was not acknowledged.');
    }
    return { ...ids, requestId: input.requestId, duplicate: false };
  } catch (error) {
    if (dispatchAttempted)
      throw new NativeQueuedInputAdmissionError({
        ...ids,
        requestId: input.requestId,
      });
    throw error;
  } finally {
    // Cleanup cannot change an already acknowledged admission. A failed
    // release only holds this short admission lease until its native expiry.
    await workflows.releaseRunOwnership(fence).catch(() => undefined);
    await memory.retireRunFence(fence).catch(() => undefined);
  }
};

/** The acknowledged stop marker also gates cold native agent recovery. */
export const stopNativeQueuedInput = async (options: {
  host: Host;
  workflow: NativeQueuedInputWorkflow;
  threadId: string;
  workflowRunId: string;
  childRunId: string;
  agent: DurableAgent;
}) => {
  const { state } = await stores(options.host);
  const prior = await readNativeQueuedInputDisposition(
    options.host,
    options.threadId,
    options.childRunId
  );
  if (prior?.state !== 'completed')
    await state.setState({
      threadId: options.threadId,
      // Only Stop writes this witness. A racing start or completion can update
      // its own result row without ever restoring permission to execute.
      type: stopWitnessType(options.childRunId),
      value: { version: 1, state: 'stopped' },
    });
  await (
    await options.workflow.createRun({ runId: options.workflowRunId })
  ).cancel();
  options.agent.abortRunStream(options.childRunId);
};
