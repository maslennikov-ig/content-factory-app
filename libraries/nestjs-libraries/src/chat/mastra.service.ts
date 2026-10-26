import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type Type,
} from '@nestjs/common';
import { Readable } from 'stream';
import { ModuleRef } from '@nestjs/core';
import { Mastra } from '@mastra/core/mastra';
import {
  signalToMessage,
  type AgentExecutionOptions,
} from '@mastra/core/agent';
import { createDurableAgent, isDurableAgent } from '@mastra/core/agent/durable';
import { MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { RedisServerCache } from '@mastra/redis';
import { RedisStreamsPubSub } from '@mastra/redis-streams';
import { createHash, randomUUID } from 'node:crypto';
import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import {
  readCapabilityIdentity,
  seedCapabilityContext,
} from './capabilities/capability.context';
import { readAgentOperationRunGuard } from './conductor/agent-operation-receipts';
import { observeConductorRun } from './conductor/native-run-observer';
import { createNativeObservability } from './conductor/native-observability';
import { NativeSessionCache } from './conductor/native-session-cache';
import {
  createNativeQueuedInputWorkflow,
  enqueueNativeQueuedInput,
  stopNativeQueuedInput,
  readNativeQueuedInputDisposition,
  NATIVE_QUEUED_INPUT_WORKFLOW_ID,
  NATIVE_QUEUED_INPUT_CHILD_CONTEXT_KEY,
  NativeQueuedInputObserveOnlyError,
  type NativeQueuedInput,
  type NativeQueuedInputSubmission,
} from './conductor/native-queued-input';
import { ConductorExecution } from './conductor/conductor.execution';
import { runAsActingUser } from '../user/acting.user';
import {
  readStoredAgentWorkspace,
  parseAgentWorkContext,
  AGENT_WORK_CONTEXT_KEY,
} from './conductor/work-context';
import {
  agentCallAnswered,
  boundedRunClaimStore,
} from './conductor/agent-run-claims';
import { questionCardId } from './capabilities/question-card';
import { assertDomainQuestionCurrent } from './capabilities/domain-questions';
import {
  createNativeModelAvailabilityWorkflow,
  NativeModelAvailability,
  queueNativeModelAvailabilityContinuation,
} from './conductor/native-model-availability';
import type { NativeTextAttemptContext } from '../openai/ai.native-retries';
import type { BackgroundTask } from '@mastra/core/background-tasks';
import { ConsoleLogger } from '@mastra/core/logger';
import {
  InMemoryNotificationsStorage,
  type NotificationsStorage,
} from '@mastra/core/notifications';
import { RequestContext } from '@mastra/core/request-context';
import { closeMastraStore, pStore } from '@contentfactory/nestjs-libraries/chat/mastra.store';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import {
  getRoutedMastraModelEntries,
  getMastraVoice,
} from '@contentfactory/nestjs-libraries/openai/ai.clients';
import { PermissionsService } from '@contentfactory/backend/services/auth/permissions/permissions.service';
import { DoorPolicyGate } from '@contentfactory/nestjs-libraries/chat/capabilities/door-policy';
import type { CapabilityGate } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.admission';
import {
  CONDUCTOR_SUBAGENT_ROLE_MAP,
  buildConductorAgent,
  buildConductorController,
  readConductorModelTask,
  seedConductorModelTask,
  setConductorModelMaxRetries,
} from '@contentfactory/nestjs-libraries/chat/conductor/conductor.agent';
import {
  CONDUCTOR_AGENT_ID,
  CONDUCTOR_REQUEST_ID_KEY,
  buildConductorContext,
  conductorResourceId,
} from '@contentfactory/nestjs-libraries/chat/conductor/conductor.context';
import {
  AGENT_EXECUTION_METADATA_KEY,
  AgentTurnLifecycle,
} from '@contentfactory/nestjs-libraries/chat/conductor/agent-turn-lifecycle';
import { CAPABILITY_CATALOGUE } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.registry';
import {
  approvalContentDigest,
  capabilityToolTitle,
  describeApprovalCall,
} from '@contentfactory/nestjs-libraries/chat/capabilities/approval-summary';
import type { CapabilityIdentity } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.types';
import { avatarInWorkspace } from '@contentfactory/nestjs-libraries/chat/capabilities/catalogue/avatar.capabilities';
import { mediaReceiptInWorkspace } from '@contentfactory/nestjs-libraries/chat/capabilities/catalogue/media.capabilities';
import { createConductorMemory } from '@contentfactory/nestjs-libraries/chat/conductor/conductor.memory';
import { AgentWorkContextResolver } from '@contentfactory/nestjs-libraries/chat/conductor/work-context.resolver';
import { AgentWorkObjectBrowser } from '@contentfactory/nestjs-libraries/chat/conductor/work-context.browser';
import {
  AGENT_VOICE_MAX_BYTES,
  AGENT_VOICE_MEDIA_TYPES,
  type AgentArtifactRef,
  type AgentWorkContextV1,
  type BrandVoiceFactScoreSummary,
} from '@contentfactory/nestjs-libraries/chat/capabilities/agent-parts.contract';
import {
  AgentChatRequestError,
  openProposalTargets,
  type PendingRun,
} from '@contentfactory/nestjs-libraries/chat/conductor/agent-chat.request';
import { withoutSecretShapes } from '@contentfactory/nestjs-libraries/chat/conductor/secret-shapes';
import {
  BRAND_VOICE_SCORER_ID,
  brandVoiceAndFactsScorer,
  scoreBrandVoiceAndFacts,
  type BrandVoiceScorerInput,
  type BrandVoiceScorerOutput,
} from '@contentfactory/nestjs-libraries/chat/scorers/brand-voice-facts.scorer';

/**
 * The one Mastra instance of the backend and its one agent, the conductor
 * (`content-factory-next-kcxz.7`). It replaced `LoadToolsService` and the
 * eleven inherited upstream tools on 27.09.2026.
 *
 * Nest services reach the agent's capabilities through `ModuleRef` — the same
 * provider instances the screens' doors use — and the door policies through
 * the `PermissionsService` `PoliciesGuard` uses.
 */
@Injectable()
export class MastraService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private instance?: Mastra;
  private readonly nativeSessionBindingId = randomUUID();
  private shutdownPromise?: Promise<void>;
  private modelAvailability?: NativeModelAvailability;
  private queuedInputWorkflow?: ReturnType<
    typeof createNativeQueuedInputWorkflow
  >;
  private readonly recoveryObservers = new Map<string, () => Promise<void>>();
  /** Live async scopes only; native workflows remain the durable task owner. */
  private readonly nativeTaskScopes = new Map<
    string,
    {
      requestId: string;
      active: () => boolean;
      run: <T>(work: () => Promise<T>) => Promise<T>;
      stop: () => void;
    }
  >();
  private readonly nativeSessionCache = new NativeSessionCache({
    hasActiveTask: ({ resourceId, scope }) =>
      this.nativeTaskScopes.has(`${resourceId}:${scope}`),
    onError: (error) => this.instance?.getLogger().error('Native idle session release failed.', { error }),
  });
  private readonly fallbackNotifications = new InMemoryNotificationsStorage();

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly aiUsage: AiUsageService
  ) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const mastra = await this.mastra();
    await this.observeRecoverableRuns();
    await this.recoverNativeContinuationIntents();
    // The native fleet API schedules its own recheck at each skipped owner's
    // retryAt. Awaiting its long-lived agent turns would hold Nest startup and
    // prevent HTTP clients from observing or stopping a waiting task.
    void mastra.recoverAllDurableAgents().catch((error) => {
      mastra
        .getLogger()
        .error('Native agent bootstrap recovery failed.', { error });
    });
    void this.queuedInputWorkflow!.restartAllActiveWorkflowRuns().catch(
      (error) => {
        mastra
          .getLogger()
          .error('Native queued-input bootstrap recovery failed.', { error });
      }
    );
  }

  async onApplicationShutdown() {
    this.shutdownPromise ??= (async () => {
      try {
        await this.nativeSessionCache.close();
        await Promise.allSettled(
          [...this.recoveryObservers.values()].map((detach) => detach())
        );
        this.recoveryObservers.clear();
        // Native shutdown drains/abandons executions, then flushes its exporter.
        await this.instance?.shutdown().catch(() => undefined);
      } finally {
        await closeMastraStore();
      }
    })();
    return this.shutdownPromise;
  }

  private service = <T>(token: Type<T>): T =>
    this.moduleRef.get(token, { strict: false });

  assertDomainQuestionCurrent(identity: CapabilityIdentity, payload: unknown) {
    return assertDomainQuestionCurrent({ ...identity, service: this.service }, payload);
  }

  private workContextResolver() {
    return new AgentWorkContextResolver({
      services: this.service,
      gate: this.gate(),
      capabilities: CAPABILITY_CATALOGUE,
    });
  }

  resolveWorkContext(
    identity: CapabilityIdentity,
    context: AgentWorkContextV1,
    options?: { refresh?: boolean }
  ) {
    return this.workContextResolver().resolve(identity, context, options);
  }

  validateWorkArtifact(
    identity: CapabilityIdentity,
    artifact: AgentArtifactRef
  ) {
    return this.workContextResolver().validateArtifact(identity, artifact);
  }

  browseWorkObjects(identity: CapabilityIdentity, query: unknown) {
    return new AgentWorkObjectBrowser({
      services: this.service,
      gate: this.gate(),
      capabilities: CAPABILITY_CATALOGUE,
    }).browse(identity, query);
  }

  /** Resolved on first use: `PermissionsService` lives in the API module. */
  private gate(): CapabilityGate {
    let gate: DoorPolicyGate | undefined;
    return {
      check: async (door, identity) =>
        (gate ??= new DoorPolicyGate(this.service(PermissionsService))).check(
          door,
          await this.currentIdentity(identity)
        ),
    };
  }

  /** A recovered task rechecks membership, rather than trusting an old role. */
  private async currentIdentity(
    identity: CapabilityIdentity
  ): Promise<CapabilityIdentity> {
    const membership = await this.service(
      PrismaService
    ).userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId: identity.userId,
          organizationId: identity.organizationId,
        },
      },
      include: { organization: true, user: true },
    });
    if (
      !membership ||
      membership.disabled ||
      !membership.user.activated ||
      membership.user.blockedAt
    ) {
      throw Object.assign(
        new Error('Workspace access is no longer available.'),
        { name: 'PermissionDenied' }
      );
    }
    return {
      ...identity,
      role: membership.role,
      organizationCreatedAt: membership.organization.createdAt.toISOString(),
    };
  }

  private sessionModelId(context?: object): string | undefined {
    const controller = (context as RequestContext<any> | undefined)?.get?.(
      'controller'
    ) as { session?: { modelId?: unknown } } | undefined;
    return typeof controller?.session?.modelId === 'string' &&
      controller.session.modelId.trim()
      ? controller.session.modelId.trim()
      : undefined;
  }

  private async patchNativeRun(
    threadId: string,
    patch: Record<string, unknown>,
    replace = false
  ) {
    const memory = await pStore.getStore('memory');
    if (!memory) throw new Error('Native task memory is unavailable.');
    const saved = await memory.updateThreadMetadata({
      id: threadId,
      update: (thread) => {
        const previous = thread.metadata?.assistantNativeRun as
          | Record<string, unknown>
          | undefined;
        const response = previous?.response as
          | { runId?: unknown; messageId?: unknown }
          | undefined;
        // The original queue reader can identify its assistant before model
        // admission initializes the same run. Never carry proof to a new owner.
        const keepResponse = replace && previous?.runId === patch.runId &&
          previous?.logicalRequestId === patch.logicalRequestId &&
          response?.runId === patch.runId && typeof response.messageId === 'string';
        return {
          assistantNativeRun: {
            ...(replace ? {} : previous), ...patch,
            ...(keepResponse ? { response } : {}),
          },
        };
      },
    });
    if (!saved) throw new Error('Native task thread is unavailable.');
  }

  private async nativeAttemptSignal(position: NativeTextAttemptContext) {
    const agent = await this.conductor();
    const nativeSignal =
      position.runId && isDurableAgent(agent)
        ? agent.runRegistry.get(position.runId)?.abortSignal
        : undefined;
    // The native registry is a public advanced-usage API. Some processor retry
    // boundaries omit abortSignal; read its live signal without mutating it.
    return nativeSignal &&
      position.abortSignal &&
      nativeSignal !== position.abortSignal
      ? AbortSignal.any([nativeSignal, position.abortSignal])
      : nativeSignal || position.abortSignal;
  }

  private async beforeModelAttempt(position: NativeTextAttemptContext) {
    const abortSignal = await this.nativeAttemptSignal(position);
    if (abortSignal?.aborted)
      throw Object.assign(new Error('Native execution was stopped.'), {
        name: 'AbortError',
      });
    const identity = readCapabilityIdentity(position.requestContext);
    if (!identity || !position.runId)
      throw new Error('Native execution identity is unavailable.');
    seedCapabilityContext(
      position.requestContext!,
      await this.currentIdentity(identity)
    );
    const threadId = (
      position.requestContext as RequestContext<Record<string, unknown>>
    ).get(MASTRA_THREAD_ID_KEY);
    if (typeof threadId !== 'string')
      throw new Error('Native execution thread is unavailable.');
    const memory = await (await this.conductor()).getMemory();
    const thread = await memory!.getThreadById({ threadId });
    if (
      !thread ||
      thread.resourceId !==
        conductorResourceId(identity.organizationId, identity.userId)
    )
      throw new Error('Native execution thread is outside this workspace.');
    const logicalRequestId = (
      position.requestContext as RequestContext<Record<string, unknown>>
    ).get(CONDUCTOR_REQUEST_ID_KEY);
    const queuedInputId = (
      position.requestContext as RequestContext<Record<string, unknown>>
    ).get(NATIVE_QUEUED_INPUT_CHILD_CONTEXT_KEY);
    const disposition = await readNativeQueuedInputDisposition(
      await this.mastra(),
      threadId,
      typeof queuedInputId === 'string' ? queuedInputId : position.runId
    );
    if (disposition?.state === 'stopped')
      throw Object.assign(new Error('This queued task was stopped.'), {
        name: 'AbortError',
      });
    let pointer = thread.metadata?.assistantNativeRun as
      | Record<string, unknown>
      | undefined;
    const executionMarker = thread.metadata?.[AGENT_EXECUTION_METADATA_KEY] as
      | Record<string, unknown>
      | undefined;
    if (
      executionMarker?.requestId === logicalRequestId &&
      (executionMarker.stopRequested === true ||
        executionMarker.state === 'settled')
    ) {
      throw Object.assign(
        new Error('This logical task has already stopped or settled.'),
        { name: 'AbortError' }
      );
    }
    if (
      typeof logicalRequestId === 'string' &&
      pointer?.logicalRequestId !== logicalRequestId
    ) {
      await this.patchNativeRun(
        threadId,
        {
          runId: position.runId,
          state: 'running',
          logicalRequestId,
          availabilityCycles: 0,
        },
        true
      );
      pointer = undefined;
    }
    if (
      pointer?.continuationPending === true &&
      pointer.previousRunId === position.runId &&
      pointer.runId !== position.runId
    ) {
      const successor =
        typeof pointer.runId === 'string'
          ? await (
              await pStore.getStore('workflows')
            )?.getWorkflowRunById({
              runId: pointer.runId,
              workflowName: 'durable-agentic-loop',
            })
          : undefined;
      if (successor)
        throw Object.assign(
          new Error('The native successor already owns this task.'),
          { name: 'AbortError' }
        );
      // A crash before the old running checkpoint settled is recovered by the
      // native agent itself. Adopt that run rather than creating another heir.
      await this.patchNativeRun(threadId, {
        runId: position.runId,
        state: 'running',
        continuationPending: false,
        continuationIdentity: null,
      });
    } else if (
      pointer?.runId === position.runId &&
      pointer.continuationPending === true
    ) {
      await this.patchNativeRun(threadId, {
        state: 'running',
        continuationPending: false,
        continuationIdentity: null,
      });
    }
    const previousRunIds = [
      ...new Set([
        ...(Array.isArray(pointer?.lineageRunIds)
          ? pointer!.lineageRunIds.filter(
              (value): value is string => typeof value === 'string'
            )
          : []),
        ...(typeof pointer?.previousRunId === 'string'
          ? [pointer.previousRunId]
          : []),
      ]),
    ].filter((runId) => runId !== position.runId);
    const uncertain = await readAgentOperationRunGuard({
      organizationId: identity.organizationId,
      threadId,
      runId: position.runId,
      storage: pStore,
      memory,
      previousRunIds,
    });
    if (uncertain)
      throw Object.assign(
        new Error(
          'A prior operation has an uncertain outcome; automatic replay is blocked.'
        ),
        { name: 'CapabilityOutcomeUncertain' }
      );
    await this.modelAvailability!.beforeAttempt({
      ...position,
      runId: position.runId,
      abortSignal,
    });
  }

  private async waitForModels(position: NativeTextAttemptContext) {
    if (!position.runId) return;
    await this.beforeModelAttempt(position);
    const identity = readCapabilityIdentity(position.requestContext)!;
    const threadId = (
      position.requestContext as RequestContext<Record<string, unknown>>
    ).get(MASTRA_THREAD_ID_KEY) as string;
    const memory = await (await this.conductor()).getMemory();
    const thread = await memory!.getThreadById({ threadId });
    const previous = thread?.metadata?.assistantNativeRun as
      | Record<string, unknown>
      | undefined;
    const cycles =
      typeof previous?.availabilityCycles === 'number'
        ? previous.availabilityCycles + 1
        : 1;
    await this.patchNativeRun(threadId, { availabilityCycles: cycles });
    await this.modelAvailability!.wait({
      ...position,
      runId: position.runId,
      abortSignal: await this.nativeAttemptSignal(position),
      delayMs: Math.min(30_000 * 2 ** Math.min(cycles - 1, 4), 300_000),
    });
    await this.beforeModelAttempt(position);
    // Mastra's public queued steering safely closes a partial assistant message
    // and starts a fresh generation on the primary model with saved tool results.
    // This is a public native Session factory. It retains its full toolsets,
    // approval policy and run budgets while preparing a fresh execution context.
    const nextContext = new RequestContext<Record<string, unknown>>(
      [
        ...(
          position.requestContext as RequestContext<Record<string, unknown>>
        ).entries(),
      ].filter(
        ([key]) =>
          key !== 'mastra__durableExecutions' && key !== 'cf.nativeRunId'
      )
    );
    seedCapabilityContext(nextContext, await this.currentIdentity(identity));
    const session = await this.sessionFor(identity, threadId, {
      bindThread: true,
      requestContext: nextContext as RequestContext<any>,
    });
    const streamOptions = await session.machinery.buildStreamOptions({
      requestContext: nextContext as RequestContext<any>,
      threadId,
      abortSignal: new AbortController().signal,
    });
    return queueNativeModelAvailabilityContinuation(await this.conductor(), {
      ...position,
      runId: position.runId,
      resourceId: conductorResourceId(identity.organizationId, identity.userId),
      threadId,
      streamOptions: streamOptions as unknown as AgentExecutionOptions,
      onQueued: async (runId) =>
        this.patchNativeRun(threadId, {
          runId,
          previousRunId: position.runId,
          lineageRunIds: [
            ...new Set([
              ...(Array.isArray(previous?.lineageRunIds)
                ? previous!.lineageRunIds
                : []),
              position.runId,
            ]),
          ],
          continuationPending: true,
          continuationIdentity: identity,
          continuationQueuedInputChildRunId:
            nextContext.get(NATIVE_QUEUED_INPUT_CHILD_CONTEXT_KEY) ?? null,
          continuationWorkContext: nextContext.get(AGENT_WORK_CONTEXT_KEY)
            ? parseAgentWorkContext(
                JSON.parse(String(nextContext.get(AGENT_WORK_CONTEXT_KEY)))
                  .context
              )
            : null,
          continuationModelTask: readConductorModelTask(nextContext) ?? null,
          state: 'queued',
          retryAt: null,
        }),
    });
  }

  async cancelModelAvailability(runId: string, threadId?: string) {
    await this.mastra();
    const agent = await this.conductor();
    const id =
      threadId ??
      (isDurableAgent(agent)
        ? agent.runRegistry.getMemoryInfo(runId)?.threadId
        : undefined);
    if (id) {
      await this.cancelNativeQueuedInputs(id);
      const memory = await agent.getMemory();
      const thread = await memory?.getThreadById({ threadId: id });
      const pointer = thread?.metadata?.assistantNativeRun as
        | Record<string, unknown>
        | undefined;
      if (
        pointer &&
        (pointer.runId === runId || pointer.previousRunId === runId)
      ) {
        const marker = thread?.metadata?.[AGENT_EXECUTION_METADATA_KEY] as
          | Record<string, unknown>
          | undefined;
        await memory!.updateThread({
          id,
          metadata: {
            assistantNativeRun: {
              ...pointer,
              state: 'stopped',
              continuationPending: false,
              continuationIdentity: null,
              retryAt: null,
            },
            ...(typeof pointer.logicalRequestId === 'string'
              ? {
                  [AGENT_EXECUTION_METADATA_KEY]: {
                    ...marker,
                    requestId: pointer.logicalRequestId,
                    state:
                      marker?.requestId === pointer.logicalRequestId &&
                      marker.state === 'settled'
                        ? 'settled'
                        : 'stopping',
                    stopRequested: true,
                  },
                }
              : {}),
          },
        });
        if (isDurableAgent(agent) && thread) {
          const related = new Set(
            [
              runId,
              pointer.runId,
              pointer.previousRunId,
              ...(Array.isArray(pointer.lineageRunIds)
                ? pointer.lineageRunIds
                : []),
            ].filter((value): value is string => typeof value === 'string')
          );
          const suspended = await agent.listSuspendedRuns({
            threadId: id,
            resourceId: thread.resourceId,
          });
          const workflows = await pStore.getStore('workflows');
          if (!workflows)
            throw new Error('Native Stop storage is unavailable.');
          for (const pending of suspended.runs) {
            if (!related.has(pending.runId)) continue;
            const local = agent.runRegistry.get(pending.runId);
            await (
              await agent.getWorkflow().createRun({ runId: pending.runId })
            ).cancel();
            const persisted = await workflows.getWorkflowRunById({
              workflowName: 'durable-agentic-loop',
              runId: pending.runId,
            });
            const snapshot =
              typeof persisted?.snapshot === 'string'
                ? JSON.parse(persisted.snapshot)
                : persisted?.snapshot;
            // Run.cancel can swallow its storage error. A persisted terminal
            // state, rather than its resolved Promise, acknowledges cold Stop.
            if (snapshot?.status !== 'canceled')
              throw new Error('Native Stop cancellation was not persisted.');
            if (!local)
              await this.reconcileNativeRun(id, pending.runId, 'interrupted');
          }
          if (
            pointer.continuationPending === true &&
            typeof pointer.runId === 'string' &&
            typeof pointer.previousRunId === 'string'
          ) {
            const handedOff = [pointer.runId, pointer.previousRunId];
            const states = await Promise.all(
              handedOff.map(async (nativeRunId) => ({
                local: agent.runRegistry.get(nativeRunId),
                snapshot: await workflows.getWorkflowRunById({
                  workflowName: 'durable-agentic-loop',
                  runId: nativeRunId,
                }),
                owner: await workflows.getRunOwnership({ runId: nativeRunId }),
              }))
            );
            if (
              states.every(
                (state) => !state.local && !state.snapshot && !state.owner?.live
              )
            ) {
              // Queue acceptance was saved, but no native driver/checkpoint
              // remains to emit FINISH. Stop itself settles this exact intent.
              await this.reconcileNativeRun(id, pointer.runId, 'interrupted');
            }
          }
        }
      }
    }
    await this.modelAvailability!.cancel(runId);
  }

  /** Called only after Stop drained its HTTP owner and verified the saved tail. */
  async settleStoppedNativeRun(input: {
    threadId: string; resourceId: string; runId: string; requestId: string;
  }): Promise<boolean> {
    const agent = await this.conductor();
    if (!isDurableAgent(agent)) return false;
    const memory = await agent.getMemory();
    const thread = await memory?.getThreadById({ threadId: input.threadId });
    const owns = (current: typeof thread) => {
      const pointer = current?.metadata?.assistantNativeRun as Record<string, unknown> | undefined;
      const marker = current?.metadata?.[AGENT_EXECUTION_METADATA_KEY] as Record<string, unknown> | undefined;
      return current?.resourceId === input.resourceId && pointer?.runId === input.runId &&
        pointer.logicalRequestId === input.requestId && marker?.requestId === input.requestId;
    };
    const settled = (current: typeof thread) => {
      const marker = current?.metadata?.[AGENT_EXECUTION_METADATA_KEY] as Record<string, unknown> | undefined;
      return owns(current) && marker?.state === 'settled' &&
        ['completed', 'failed', 'interrupted'].includes(String(marker.outcome));
    };
    if (!owns(thread)) return false;
    if (settled(thread)) return true;
    const pointer = thread!.metadata!.assistantNativeRun as Record<string, unknown>;
    const workflows = await pStore.getStore('workflows');
    const memoryStore = await pStore.getStore('memory');
    if (!workflows || !memoryStore) throw new Error('Native Stop storage is unavailable.');
    const related = [...new Set([input.runId, pointer.previousRunId,
      ...(Array.isArray(pointer.lineageRunIds) ? pointer.lineageRunIds : []),
    ].filter((id): id is string => typeof id === 'string' && !!id))];
    for (const runId of related) {
      if (agent.runRegistry.get(runId)) return false;
      const [saved, owner] = await Promise.all([
        workflows.getWorkflowRunById({ workflowName: 'durable-agentic-loop', runId }),
        workflows.getRunOwnership({ runId }),
      ]);
      const snapshot = typeof saved?.snapshot === 'string' ? JSON.parse(saved.snapshot) : saved?.snapshot;
      // Native continuation keeps completed predecessor snapshots as history.
      // Only the target must be canceled; history need not be rewritten to
      // acknowledge its successor's Stop. Nonterminal ancestors still fence it.
      const terminalPredecessor = runId !== input.runId &&
        ['success', 'failed', 'tripwire', 'bailed', 'skipped'].includes(snapshot?.status);
      if (owner?.live || (saved && snapshot?.status !== 'canceled' && !terminalPredecessor)) return false;
    }
    // No driver/checkpoint remains to emit FINISH after a failed resume. Stop
    // owns this terminal write, atomically guarded against a successor task.
    const updated = await memoryStore.updateThreadMetadata({
      id: input.threadId, resourceId: input.resourceId,
      update: current => {
        if (!owns(current) || settled(current)) return undefined;
        const currentPointer = current.metadata!.assistantNativeRun as Record<string, unknown>;
        const marker = current.metadata![AGENT_EXECUTION_METADATA_KEY] as Record<string, unknown>;
        if (marker.stopRequested !== true || currentPointer.state !== 'stopped') return undefined;
        return {
          assistantNativeRun: { ...currentPointer, state: 'settled', outcome: 'interrupted',
            continuationPending: false, continuationIdentity: null },
          [AGENT_EXECUTION_METADATA_KEY]: { ...marker, state: 'settled', outcome: 'interrupted' },
        };
      },
    });
    return settled(updated);
  }

  /** Native workflows persist explicitly queued user input before acceptance. */
  async queueNativeInput(
    input: Omit<NativeQueuedInputSubmission, 'identity' | 'resourceId'> & {
      identity: CapabilityIdentity;
    }
  ) {
    const identity = await this.currentIdentity(input.identity);
    const agent = await this.conductor();
    const resourceId = conductorResourceId(
      identity.organizationId,
      identity.userId
    );
    const thread = await (
      await agent.getMemory()
    )?.getThreadById({ threadId: input.threadId });
    if (!thread || thread.resourceId !== resourceId)
      throw Object.assign(
        new Error('Queued input thread is outside this workspace.'),
        { name: 'PermissionDenied' }
      );
    return enqueueNativeQueuedInput({
      host: await this.mastra(),
      workflow: this.queuedInputWorkflow!,
      input: { ...input, identity, resourceId },
    });
  }

  async cancelNativeQueuedInputs(threadId: string) {
    const agent = await this.conductor();
    if (!isDurableAgent(agent)) return;
    const thread = await (await agent.getMemory())?.getThreadById({ threadId });
    if (!thread) return;
    const workflows = await pStore.getStore('workflows');
    const { runs } = await workflows!.listWorkflowRuns({
      workflowName: NATIVE_QUEUED_INPUT_WORKFLOW_ID,
      resourceId: thread.resourceId,
      perPage: false,
    });
    for (const run of runs) {
      const snapshot =
        typeof run.snapshot === 'string'
          ? JSON.parse(run.snapshot)
          : run.snapshot;
      const input = snapshot?.context?.input as NativeQueuedInput | undefined;
      if (
        input?.threadId !== threadId ||
        typeof input.childRunId !== 'string' ||
        ['success', 'canceled'].includes(String(snapshot.status))
      )
        continue;
      await stopNativeQueuedInput({
        host: await this.mastra(),
        workflow: this.queuedInputWorkflow!,
        threadId,
        workflowRunId: run.runId,
        childRunId: input.childRunId,
        agent,
      });
    }
    this.nativeTaskScopes.get(`${thread.resourceId}:${threadId}`)?.stop();
  }

  hasNativeTaskOwner(
    identity: CapabilityIdentity,
    threadId: string,
    requestId: string
  ): boolean {
    const scope = this.nativeTaskScopes.get(
      `${conductorResourceId(
        identity.organizationId,
        identity.userId
      )}:${threadId}`
    );
    return scope?.requestId === requestId && scope.active();
  }

  async runInNativeTaskScope<T>(
    identity: CapabilityIdentity,
    threadId: string,
    requestId: string,
    work: () => Promise<T>
  ): Promise<T> {
    await this.currentIdentity(identity);
    const scope = this.nativeTaskScopes.get(
      `${conductorResourceId(
        identity.organizationId,
        identity.userId
      )}:${threadId}`
    );
    if (scope?.requestId !== requestId || !scope.active())
      throw Object.assign(
        new Error('The native task no longer accepts answers.'),
        { name: 'AbortError' }
      );
    return scope.run(work);
  }

  private async freshTaskContext(
    identity: CapabilityIdentity,
    threadId: string,
    requestId: string,
    selectedOverride?: AgentWorkContextV1 | null
  ) {
    const agent = await this.conductor();
    const memory = (await agent.getMemory())!;
    const thread = await memory.getThreadById({ threadId });
    if (
      !thread ||
      thread.resourceId !==
        conductorResourceId(identity.organizationId, identity.userId)
    )
      throw Object.assign(
        new Error('Native task thread is outside this workspace.'),
        { name: 'PermissionDenied' }
      );
    const pointer = thread.metadata?.assistantNativeRun as
      | Record<string, unknown>
      | undefined;
    const selected =
      selectedOverride === undefined
        ? pointer?.logicalRequestId === requestId &&
          pointer.continuationWorkContext !== undefined
          ? parseAgentWorkContext(pointer.continuationWorkContext)
          : readStoredAgentWorkspace(thread.metadata).workContext
        : selectedOverride;
    const workContext = selected
      ? await this.resolveWorkContext(identity, selected, { refresh: true })
      : null;
    const pending = await agent.listSuspendedRuns({
      threadId,
      resourceId: thread.resourceId,
    });
    const open: PendingRun[] = [];
    const claims = boundedRunClaimStore(ioRedis);
    for (const run of pending.runs) {
      const toolCalls: PendingRun['toolCalls'] = [];
      for (const call of run.toolCalls) {
        const card =
          call.toolCallId && !call.requiresApproval
            ? questionCardId(call.suspendPayload)
            : undefined;
        if (
          call.toolCallId &&
          (await agentCallAnswered(claims, run.runId, call.toolCallId, card))
        )
          continue;
        toolCalls.push(call);
      }
      if (toolCalls.length) open.push({ ...run, toolCalls });
    }
    return buildConductorContext({
      identity,
      threadId,
      requestId,
      trackExecution: true,
      workContext,
      openProposals: openProposalTargets(open),
    });
  }

  private async queuedInputRuntime(input: NativeQueuedInput) {
    const identity = await this.currentIdentity(
      input.identity as CapabilityIdentity
    );
    const agent = await this.conductor();
    if (!isDurableAgent(agent))
      throw new Error('Queued input requires a durable agent.');
    const memory = (await agent.getMemory())!;
    const requestContext = await this.freshTaskContext(
      identity,
      input.threadId,
      input.requestId,
      input.workContext
    );
    seedConductorModelTask(requestContext, input.signal.contents);
    const resourceId = conductorResourceId(
      identity.organizationId,
      identity.userId
    );
    const streamOptions: Record<string, unknown> = {};
    return {
      agent,
      requestContext,
      streamOptions,
      onMessageId: async (runId: string, messageId: string) => {
        if (!runId.trim() || !messageId.trim())
          throw new Error('Native queued response identity is unavailable.');
        const memoryStore = await pStore.getStore('memory');
        if (!memoryStore) throw new Error('Native task memory is unavailable.');
        const saved = await memoryStore.updateThreadMetadata({
          id: input.threadId, resourceId,
          update: (current) => {
            const marker = current.metadata?.[AGENT_EXECUTION_METADATA_KEY] as
              | Record<string, unknown>
              | undefined;
            const pointer = current.metadata?.assistantNativeRun as
              | Record<string, unknown>
              | undefined;
            const sameRequest = pointer?.logicalRequestId === input.requestId;
            if (current.resourceId !== resourceId || marker?.requestId !== input.requestId ||
              marker.stopRequested === true || marker.state === 'settled' ||
              (sameRequest && (pointer?.runId !== runId || pointer.state === 'stopped')) ||
              (!sameRequest && runId !== input.childRunId)) return undefined;
            return {
              assistantNativeRun: {
                ...(sameRequest ? pointer : { runId, logicalRequestId: input.requestId, state: 'running' }),
                response: { runId, messageId },
              },
            };
          },
        });
        if (!saved) throw new Error('Native queued response thread is unavailable.');
      },
      resolveContinuation: async (runId: string) => {
        const pointer = (
          await memory.getThreadById({ threadId: input.threadId })
        )?.metadata?.assistantNativeRun as Record<string, unknown> | undefined;
        if (typeof pointer?.runId !== 'string' || pointer.runId === runId)
          return;
        if (
          pointer.logicalRequestId === input.requestId ||
          pointer.previousRunId === runId ||
          (Array.isArray(pointer.lineageRunIds) &&
            pointer.lineageRunIds.includes(runId))
        )
          return pointer.runId;
      },
      run: <T>(work: () => Promise<T>): Promise<T> =>
        runAsActingUser(identity.userId, async () => {
          const admission = await this.aiUsage.beginAiOperation(
            identity.organizationId,
            'agent',
            'agent'
          );
          const execution = new ConductorExecution({
            requestId: input.requestId,
            native: true,
          });
          const lifecycle = new AgentTurnLifecycle(
            input.requestId,
            async (outcome) => {
              const current = await memory.getThreadById({
                threadId: input.threadId,
              });
              const marker = current?.metadata?.[
                AGENT_EXECUTION_METADATA_KEY
              ] as Record<string, unknown> | undefined;
              if (marker?.requestId === input.requestId)
                await memory.updateThread({
                  id: input.threadId,
                  metadata: {
                    [AGENT_EXECUTION_METADATA_KEY]: {
                      ...marker,
                      state: 'settled',
                      outcome,
                    },
                  },
                });
            }
          );
          const scopeKey = `${resourceId}:${input.threadId}`;
          const scope = {
            requestId: input.requestId,
            active: () =>
              lifecycle.acceptingWork &&
              !execution.signal.aborted &&
              agent.runRegistry.runIds.some((runId) => {
                const entry = agent.runRegistry.get(runId);
                const info = agent.runRegistry.getMemoryInfo(runId);
                return (
                  !!entry &&
                  !entry.abortSignal?.aborted &&
                  info?.threadId === input.threadId &&
                  info.resourceId === resourceId &&
                  entry.requestContext?.getRaw(CONDUCTOR_REQUEST_ID_KEY) ===
                    input.requestId
                );
              }),
            run: <R>(callback: () => Promise<R>): Promise<R> =>
              runAsActingUser(identity.userId, () =>
                execution.run(() =>
                  lifecycle.run(() => admission.run(callback))
                )
              ),
            stop: () => {
              execution.stop();
              lifecycle.stop();
            },
          };
          this.nativeTaskScopes.set(scopeKey, scope);
          let completed = false;
          let observeOnly = false;
          let failure: unknown;
          try {
            await memory.updateThread({
              id: input.threadId,
              metadata: {
                [AGENT_EXECUTION_METADATA_KEY]: {
                  requestId: input.requestId,
                  state: 'running',
                },
              },
            });
            const result = await execution.run(() =>
              lifecycle.run(() =>
                admission.run(async () => {
                  // The native subscription retains this async scope when a
                  // parked approval later resumes. Bind it inside the original
                  // task admission so that resumed work keeps the same owner.
                  const session = await this.bindNativeTaskSession(
                    identity,
                    input.threadId,
                    requestContext
                  );
                  Object.assign(
                    streamOptions,
                    await session.machinery.buildStreamOptions({
                      requestContext: requestContext as RequestContext<any>,
                      threadId: input.threadId,
                      abortSignal: new AbortController().signal,
                    })
                  );
                  return work();
                })
              )
            );
            completed =
              !!result &&
              typeof result === 'object' &&
              'childRunId' in result &&
              typeof result.childRunId === 'string';
            return result;
          } catch (error) {
            observeOnly = error instanceof NativeQueuedInputObserveOnlyError;
            failure = error;
            throw error;
          } finally {
            if (this.nativeTaskScopes.get(scopeKey) === scope)
              this.nativeTaskScopes.delete(scopeKey);
            if (observeOnly) {
              // Native recovery positively declined this driver. Its actual
              // owner retains the logical lifecycle and provider admission.
              await admission.voidUnstarted();
            } else {
              try {
                const settled = await lifecycle.finish(
                  completed
                    ? 'completed'
                    : (failure as { name?: string } | undefined)?.name ===
                      'AbortError'
                    ? 'interrupted'
                    : 'failed'
                );
                completed = settled === 'completed';
              } catch (error) {
                completed = false;
                failure ??= error;
                throw error;
              } finally {
                await admission.finish(completed, failure);
              }
            }
          }
        }),
    };
  }

  private async reconcileNativeRun(
    threadId: string,
    runId: string,
    outcome: 'completed' | 'failed' | 'interrupted' | 'waiting'
  ) {
    const memory = await (await this.conductor()).getMemory();
    const thread = await memory?.getThreadById({ threadId });
    if (!thread) return;
    const pointer = thread.metadata?.assistantNativeRun as
      | Record<string, unknown>
      | undefined;
    if (typeof pointer?.runId === 'string' && pointer.runId !== runId) return;
    const marker = thread.metadata?.[AGENT_EXECUTION_METADATA_KEY] as
      | Record<string, unknown>
      | undefined;
    const stopped =
      marker?.stopRequested === true &&
      (!pointer?.logicalRequestId ||
        marker.requestId === pointer.logicalRequestId);
    const effective = stopped ? 'interrupted' : outcome;
    await memory!.updateThread({
      id: threadId,
      metadata: {
        assistantNativeRun: {
          ...pointer,
          runId,
          state: effective === 'waiting' ? 'waiting' : 'settled',
          ...(effective === 'waiting'
            ? {}
            : {
                outcome: effective,
                continuationPending: false,
                continuationIdentity: null,
              }),
        },
        ...(effective !== 'waiting' &&
        typeof marker?.requestId === 'string' &&
        (!pointer?.logicalRequestId ||
          marker.requestId === pointer.logicalRequestId)
          ? {
              [AGENT_EXECUTION_METADATA_KEY]: {
                ...marker,
                state: 'settled',
                outcome: effective,
              },
            }
          : {}),
      },
    });
  }

  private nativeFinishOutcome(
    reason: unknown
  ): 'completed' | 'failed' | 'interrupted' | 'waiting' {
    if (reason === 'stop') return 'completed';
    if (reason === 'abort') return 'interrupted';
    if (
      reason === 'error' ||
      reason === 'tripwire' ||
      reason === 'content-filter' ||
      reason === 'length'
    )
      return 'failed';
    return 'waiting';
  }

  private async observeRecoverableRuns() {
    const agent = await this.conductor();
    if (!isDurableAgent(agent)) return;
    const { runs } = await agent.listActiveRuns();
    for (const run of runs) {
      if (!run.threadId || this.recoveryObservers.has(run.runId)) continue;
      const threadId = run.threadId;
      const observed = await observeConductorRun(agent, run.runId, {
        idleTimeoutMs: 0,
        onFinish: (result) =>
          this.reconcileNativeRun(
            threadId,
            run.runId,
            result.error
              ? 'failed'
              : this.nativeFinishOutcome(result.finishReason)
          ),
        onError: () => this.reconcileNativeRun(threadId, run.runId, 'failed'),
        onAbort: () =>
          this.reconcileNativeRun(threadId, run.runId, 'interrupted'),
        onSuspended: () =>
          this.reconcileNativeRun(threadId, run.runId, 'waiting'),
      });
      const reader = observed.fullStream.getReader();
      const detach = async () => {
        observed.detach();
        await reader.cancel().catch(() => undefined);
      };
      this.recoveryObservers.set(run.runId, detach);
      // A native replay subscriber, not a second execution/recovery driver.
      void (async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value.type === 'tripwire' && !value.payload?.retry)
            await this.reconcileNativeRun(threadId, run.runId, 'failed');
        }
      })()
        .catch((error) =>
          this.instance
            ?.getLogger()
            .error('Native recovery observation failed.', {
              runId: run.runId,
              error,
            })
        )
        .finally(() => {
          observed.detach();
          this.recoveryObservers.delete(run.runId);
        });
    }
  }

  /** Repair only the durable intent left between native queue acceptance and its successor checkpoint. */
  private async recoverNativeContinuationIntents() {
    const agent = await this.conductor();
    if (!isDurableAgent(agent)) return;
    const memory = await agent.getMemory();
    const workflows = await pStore.getStore('workflows');
    if (!memory || !workflows) return;
    const { threads } = await memory.listThreads({ perPage: false });
    for (const thread of threads) {
      const pointer = thread.metadata?.assistantNativeRun as
        | Record<string, unknown>
        | undefined;
      if (
        pointer?.continuationPending !== true ||
        typeof pointer.runId !== 'string' ||
        typeof pointer.previousRunId !== 'string' ||
        typeof pointer.logicalRequestId !== 'string'
      )
        continue;
      const marker = thread.metadata?.[AGENT_EXECUTION_METADATA_KEY] as
        | Record<string, unknown>
        | undefined;
      if (
        marker?.requestId === pointer.logicalRequestId &&
        marker.stopRequested === true
      ) {
        await this.reconcileNativeRun(thread.id, pointer.runId, 'interrupted');
        continue;
      }
      const queuedInputId = pointer.continuationQueuedInputChildRunId;
      if (
        typeof queuedInputId === 'string' &&
        (
          await readNativeQueuedInputDisposition(
            await this.mastra(),
            thread.id,
            queuedInputId
          )
        )?.state === 'stopped'
      ) {
        await this.reconcileNativeRun(thread.id, pointer.runId, 'interrupted');
        continue;
      }
      // The original queued-child Stop also outranks a failed observation
      // marker saved while its accepted successor had no checkpoint yet.
      if (
        ['stopped', 'settled', 'blocked'].includes(String(pointer.state)) ||
        (marker?.requestId === pointer.logicalRequestId &&
          (marker.stopRequested === true || marker.state === 'settled'))
      )
        continue;
      const [successor, predecessor] = await Promise.all([
        workflows.getWorkflowRunById({
          workflowName: 'durable-agentic-loop',
          runId: pointer.runId,
        }),
        workflows.getWorkflowRunById({
          workflowName: 'durable-agentic-loop',
          runId: pointer.previousRunId,
        }),
      ]);
      // Existing active/suspended snapshots belong exclusively to native
      // recover/resume. Never steal their claims or restart the whole task.
      if (successor || predecessor) continue;
      const stored = pointer.continuationIdentity as
        | CapabilityIdentity
        | undefined;
      if (
        !stored ||
        typeof stored.organizationId !== 'string' ||
        typeof stored.userId !== 'string' ||
        conductorResourceId(stored.organizationId, stored.userId) !==
          thread.resourceId
      )
        continue;
      try {
        const identity = await this.currentIdentity(stored);
        const selected =
          pointer.continuationWorkContext === undefined
            ? undefined
            : parseAgentWorkContext(pointer.continuationWorkContext);
        const requestContext = await this.freshTaskContext(
          identity,
          thread.id,
          pointer.logicalRequestId,
          selected
        );
        seedConductorModelTask(
          requestContext,
          typeof pointer.continuationModelTask === 'string'
            ? pointer.continuationModelTask
            : undefined
        );
        if (typeof pointer.continuationQueuedInputChildRunId === 'string')
          requestContext.set(
            NATIVE_QUEUED_INPUT_CHILD_CONTEXT_KEY,
            pointer.continuationQueuedInputChildRunId
          );
        const session = await this.sessionFor(identity, thread.id, {
          bindThread: true,
          requestContext: requestContext as RequestContext<any>,
        });
        const streamOptions = await session.machinery.buildStreamOptions({
          requestContext: requestContext as RequestContext<any>,
          threadId: thread.id,
          abortSignal: new AbortController().signal,
        });
        const latest = (await memory.getThreadById({ threadId: thread.id }))
          ?.metadata?.assistantNativeRun as Record<string, unknown> | undefined;
        if (
          latest?.runId !== pointer.runId ||
          latest.continuationPending !== true ||
          ['stopped', 'settled', 'blocked'].includes(String(latest.state))
        )
          continue;
        const stream = await agent.stream(
          [
            signalToMessage({
              id: `availability:${pointer.runId}`,
              type: 'reactive',
              transient: true,
              contents:
                'Continue the same task from saved progress. Preserve completed tool results and do not repeat completed work.',
            }),
          ],
          {
            ...streamOptions,
            runId: pointer.runId,
            closeOnSuspend: true,
            onFinish: (result) =>
              this.reconcileNativeRun(
                thread.id,
                pointer.runId as string,
                result.error
                  ? 'failed'
                  : this.nativeFinishOutcome(result.finishReason)
              ),
            onError: () =>
              this.reconcileNativeRun(
                thread.id,
                pointer.runId as string,
                'failed'
              ),
            onAbort: () =>
              this.reconcileNativeRun(
                thread.id,
                pointer.runId as string,
                'interrupted'
              ),
            onSuspended: () =>
              this.reconcileNativeRun(
                thread.id,
                pointer.runId as string,
                'waiting'
              ),
          }
        );
        const reader = stream.fullStream.getReader();
        void (async () => {
          while (!(await reader.read()).done) {
            /* Native fixed-id continuation. */
          }
        })().catch((error) =>
          this.instance
            ?.getLogger()
            .error('Native continuation stream failed.', {
              runId: pointer.runId,
              error,
            })
        );
      } catch (error) {
        const id = (error as { id?: string }).id;
        if (id && /RUN_ACTIVE|EXECUTION_CONFLICT|THREAD_STREAM_ACTIVE/.test(id))
          continue;
        await this.patchNativeRun(thread.id, {
          state: 'blocked',
          reason:
            error instanceof Error
              ? error.message
              : 'Native continuation requires attention.',
        });
      }
    }
  }

  async mastra() {
    if (!this.instance) {
      const memory = createConductorMemory(pStore);
      const availabilityWorkflow = createNativeModelAvailabilityWorkflow();
      this.queuedInputWorkflow = createNativeQueuedInputWorkflow({
        resolveRuntime: (input) => this.queuedInputRuntime(input),
      });
      const backingAgent = buildConductorAgent({
        services: this.service,
        gate: this.gate(),
        memory,
        storage: pStore,
        // Inside the turn's `agent` admission, so every step lands in its
        // ledger; the model is the ordered `ModelWithRetries[]` chain of
        // role `agent` (`on0i.5`, `A16`, `A29`, `A30`).
        model: ({ organizationId, userId }, requestContext) =>
          this.aiUsage.prepareModelExecution(
            organizationId,
            'agent',
            async () => {
              const { entries, policy } = await getRoutedMastraModelEntries(
                organizationId,
                'agent',
                readConductorModelTask(requestContext),
                {
                  modelId: this.sessionModelId(requestContext),
                  requestContext,
                  prepareModels: (factory) => this.aiUsage.prepareModelExecution(
                    organizationId, 'agent', factory, { userId }
                  ),
                }
              );
              if (requestContext) {
                setConductorModelMaxRetries(
                  requestContext,
                  policy.maxRetries,
                  entries.map((entry) => entry.model.modelId)
                );
              }
              return entries;
            },
            { userId }
          ),
        goalJudge: ({ organizationId, userId }, requestContext) =>
          this.aiUsage.prepareModelExecution(
            organizationId,
            'agent',
            async () => {
              const { entries, policy } = await getRoutedMastraModelEntries(
                organizationId,
                'review',
                readConductorModelTask(requestContext),
                {
                  requestContext,
                  prepareModels: (factory) => this.aiUsage.prepareModelExecution(
                    organizationId, 'agent', factory, { userId }
                  ),
                }
              );
              if (requestContext) {
                setConductorModelMaxRetries(
                  requestContext,
                  policy.maxRetries,
                  entries.map((entry) => entry.model.modelId)
                );
              }
              return entries;
            },
            { userId }
          ),
        subagentModel: (
          { organizationId, userId },
          agentType,
          requestContext,
          options
        ) => {
          const role = CONDUCTOR_SUBAGENT_ROLE_MAP[agentType] ?? 'agent';
          const operation = role === 'research' ? 'web_research' : 'agent';
          return this.aiUsage.prepareModelExecution(
            organizationId,
            operation,
            async () => {
              const { entries, policy } = await getRoutedMastraModelEntries(
                organizationId,
                role,
                options?.task,
                {
                  modelId: options?.modelId,
                  requestContext,
                  prepareModels: (factory) => this.aiUsage.prepareModelExecution(
                    organizationId, operation, factory, { userId }
                  ),
                }
              );
              if (requestContext) {
                setConductorModelMaxRetries(
                  requestContext,
                  policy.maxRetries,
                  entries.map((entry) => entry.model.modelId)
                );
              }
              return entries;
            },
            { userId }
          );
        },
        modelAvailability: {
          beforeAttempt: (position) => this.beforeModelAttempt(position),
          onExhausted: (position) => this.waitForModels(position),
        },
        schedules: () => this.instance?.schedules,
        notificationsStore: () => this.notificationsStore(),
      });
      // The controller and registry must share the SAME durable instance.
      // Registering a bare Agent on the controller bypasses durable execution.
      const durableAgent = createDurableAgent({
        agent: backingAgent,
        // Keep Mastra's30s completed-stream grace period. A day-long timer
        // retained every finished run's MessageList and execution closures in
        // the backend heap. Completed reconnects use saved native history;
        // suspended gates keep their snapshots and are not auto-cleaned here.
      });
      const agents = { [CONDUCTOR_AGENT_ID]: durableAgent };
      const namespace = createHash('sha256')
        .update(
          process.env.MASTRA_DATABASE_URL || process.env.DATABASE_URL || 'local'
        )
        .digest('hex')
        .slice(0, 16);
      this.instance = new Mastra({
        storage: pStore,
        observability: createNativeObservability(),
        agents,
        ...(process.env.REDIS_URL
          ? {
              cache: new RedisServerCache(
                { client: ioRedis },
                { keyPrefix: `cf:mastra:${namespace}:`, ttlSeconds: 86_400 }
              ),
              pubsub: new RedisStreamsPubSub({
                url: process.env.REDIS_URL,
                keyPrefix: `cf:mastra-events:${namespace}`,
                streamIdleTtlMs: 86_400_000,
              }),
            }
          : {}),
        workflows: {
          nativeModelAvailability: availabilityWorkflow,
          nativeQueuedInput: this.queuedInputWorkflow,
        },
        scorers: {
          [BRAND_VOICE_SCORER_ID]: brandVoiceAndFactsScorer,
        },
        backgroundTasks: {
          enabled: true,
          defaultTimeoutMs: 300_000,
          onTaskComplete: async (task: BackgroundTask) => {
            if (!task.threadId || !task.resourceId) return;
            await this.recordNotification({
              threadId: task.threadId,
              resourceId: task.resourceId,
              title: task.toolName,
              summary: `Фоновое поручение «${task.toolName}» выполнено.`,
              source: 'background-task',
              kind: 'task.completed',
              payload: {
                taskId: task.id,
                toolName: task.toolName,
                status: 'completed',
              },
            }).catch(() => undefined);
          },
          onTaskFailed: async (task: BackgroundTask) => {
            if (!task.threadId || !task.resourceId) return;
            await this.recordNotification({
              threadId: task.threadId,
              resourceId: task.resourceId,
              title: task.toolName,
              summary: `Фоновое поручение «${
                task.toolName
              }» завершилось ошибкой${
                task.error?.message ? `: ${task.error.message}` : '.'
              }`,
              source: 'background-task',
              kind: 'task.failed',
              priority: 'high',
              payload: {
                taskId: task.id,
                toolName: task.toolName,
                status: 'failed',
              },
            }).catch(() => undefined);
          },
        },
        agentControllers: {
          [CONDUCTOR_AGENT_ID]: buildConductorController(
            agents[CONDUCTOR_AGENT_ID] as any,
            {
              storage: pStore,
              memory,
              capabilities: CAPABILITY_CATALOGUE,
              services: this.service,
              gate: this.gate(),
            }
          ),
        },
        schedules: {
          prepare: async ({ schedule }) => {
            const s = schedule as {
              threadId?: string;
              resourceId?: string;
              prompt?: string;
              metadata?: Record<string, unknown>;
              target?: {
                threadId?: string;
                resourceId?: string;
                metadata?: Record<string, unknown>;
              };
            };
            const threadId = s.threadId ?? s.target?.threadId;
            const resourceId = s.resourceId ?? s.target?.resourceId;
            if (!threadId || !resourceId) return null;
            const thread = await memory.getThreadById({ threadId });
            if (!thread || thread.resourceId !== resourceId) {
              return null;
            }
            const meta = (s.metadata ?? s.target?.metadata ?? {}) as Record<
              string,
              unknown
            >;
            if (
              typeof meta.organizationId === 'string' &&
              typeof meta.userId === 'string' &&
              conductorResourceId(meta.organizationId, meta.userId) ===
                resourceId
            ) {
              const identity: CapabilityIdentity = {
                organizationId: meta.organizationId,
                organizationCreatedAt:
                  typeof meta.organizationCreatedAt === 'string'
                    ? meta.organizationCreatedAt
                    : new Date(0).toISOString(),
                userId: meta.userId,
                role:
                  meta.role === 'ADMIN' ||
                  meta.role === 'SUPERADMIN' ||
                  meta.role === 'EDITOR'
                    ? meta.role
                    : 'EDITOR',
                language: meta.language === 'en' ? 'en' : 'ru',
                timeZone:
                  typeof meta.timeZone === 'string' && meta.timeZone
                    ? meta.timeZone
                    : 'Europe/Moscow',
              };
              let current: CapabilityIdentity;
              try {
                current = await this.currentIdentity(identity);
              } catch {
                return null;
              }
              const requestContext = buildConductorContext({
                identity: current,
                threadId,
              });
              seedConductorModelTask(requestContext, s.prompt);
              return {
                threadId,
                resourceId,
                ifIdle: {
                  behavior: 'wake',
                  streamOptions: {
                    requestContext: Object.fromEntries(
                      (requestContext as any).entries?.() ?? []
                    ),
                  },
                },
              };
            }
            return undefined;
          },
          onFinish: async ({ schedule, outcome, effective }) => {
            if (
              outcome !== 'succeeded' &&
              outcome !== 'delivered' &&
              outcome !== 'persisted'
            ) {
              return;
            }
            const threadId = effective.threadId;
            const resourceId = effective.resourceId;
            if (!threadId || !resourceId) return;
            const title =
              typeof schedule.name === 'string' && schedule.name
                ? schedule.name
                : 'Регулярное поручение';
            await this.recordNotification({
              threadId,
              resourceId,
              title,
              summary: `Поручение по расписанию «${title}» выполнено.`,
              source: 'schedule',
              kind: 'schedule.finished',
              payload: { scheduleId: schedule.id, outcome },
            }).catch(() => undefined);
          },
          onError: async ({ schedule, error, effective }) => {
            const threadId = effective?.threadId;
            const resourceId = effective?.resourceId;
            if (!threadId || !resourceId) return;
            const title =
              typeof schedule.name === 'string' && schedule.name
                ? schedule.name
                : 'Регулярное поручение';
            await this.recordNotification({
              threadId,
              resourceId,
              title,
              summary: `Поручение по расписанию «${title}» не выполнилось: ${
                error?.message ?? 'ошибка'
              }.`,
              source: 'schedule',
              kind: 'schedule.error',
              priority: 'high',
              payload: { scheduleId: schedule.id },
            }).catch(() => undefined);
          },
        },
        recovery: {
          workflows: 'auto',
          durableAgents: 'auto',
        },
        logger: new ConsoleLogger({ level: 'info' }),
      });
      this.modelAvailability = new NativeModelAvailability(
        this.instance,
        availabilityWorkflow,
        async (state) => {
          const { runs } = await durableAgent.listActiveRuns();
          const run = runs.find(
            (candidate) => candidate.runId === state.agentRunId
          );
          if (run?.threadId)
            await this.patchNativeRun(run.threadId, {
              runId: state.agentRunId,
              state: 'waiting',
              retryAt: state.retryAt,
            });
        }
      );
    }
    return this.instance;
  }

  /**
   * Recovers orphaned durable runs (`on0i.3`, `A12`) and reconciles their
   * thread `assistantExecution` metadata when they settle.
   */
  async recoverDurableRuns(options?: {
    runId?: string;
    threadId?: string;
    resourceId?: string;
    force?: boolean;
  }) {
    const conductor = await this.conductor();
    if (!isDurableAgent(conductor)) {
      return { recovered: [], succeeded: 0, failed: 0 };
    }
    const { runs: activeRuns } = await conductor.listActiveRuns({
      ...(options?.threadId ? { threadId: options.threadId } : {}),
      ...(options?.resourceId ? { resourceId: options.resourceId } : {}),
    });
    const threadByRunId = new Map<string, string>();
    for (const run of activeRuns) {
      if (run.threadId) threadByRunId.set(run.runId, run.threadId);
    }
    if (options?.force) {
      const targets = options.runId ? [{ runId: options.runId }] : activeRuns;
      const recovered: Array<{
        runId: string;
        status: 'success' | 'failed' | 'suspended' | 'aborted';
        error?: Error;
      }> = [];
      let succeeded = 0;
      let failed = 0;
      for (const target of targets) {
        let outcome: 'completed' | 'failed' | 'interrupted' | 'waiting' =
          'waiting';
        let runError: Error | undefined;
        const threadId = threadByRunId.get(target.runId) ?? options?.threadId;
        const record = async (next: typeof outcome) => {
          outcome = next;
          if (threadId)
            await this.reconcileNativeRun(threadId, target.runId, next);
        };
        try {
          const stream = await conductor.recover(target.runId, {
            force: true,
            closeOnSuspend: true,
            onFinish: (result) =>
              record(
                result.error
                  ? 'failed'
                  : this.nativeFinishOutcome(result.finishReason)
              ),
            onError: ({ error }) => {
              runError =
                error instanceof Error ? error : new Error(String(error));
              return record('failed');
            },
            onAbort: () => record('interrupted'),
            onSuspended: () => record('waiting'),
          });
          const reader = stream.fullStream.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value.type === 'tripwire' && !value.payload?.retry)
              await record('failed');
            if (value.type === 'error') await record('failed');
            if (value.type === 'abort') await record('interrupted');
          }
          // The public stream reports the actual segment outcome. A suspended
          // approval or an interrupted segment is not a completed logical task.
          // Keep native replay/snapshots available for reconnect and resume.
          const settled = outcome as
            | 'completed'
            | 'failed'
            | 'interrupted'
            | 'waiting';
          // Native stream closure may precede completion of async callbacks.
          // Await the final public outcome reconciliation before reporting it.
          await record(settled);
          if (settled === 'completed') {
            succeeded += 1;
            recovered.push({ runId: target.runId, status: 'success' });
          } else if (settled === 'failed') {
            failed += 1;
            recovered.push({
              runId: target.runId,
              status: 'failed',
              ...(runError ? { error: runError } : {}),
            });
          } else {
            recovered.push({
              runId: target.runId,
              status: settled === 'waiting' ? 'suspended' : 'aborted',
            });
          }
        } catch (error) {
          failed += 1;
          recovered.push({
            runId: target.runId,
            status: 'failed',
            error: error instanceof Error ? error : new Error(String(error)),
          });
          if (threadId)
            await this.reconcileNativeRun(threadId, target.runId, 'failed');
        }
      }
      return { recovered, succeeded, failed };
    }

    await this.observeRecoverableRuns();
    // Native bulk counts execution segments. Its replay callbacks above own
    // task reconciliation because a native "success" may be a suspension.
    return conductor.recoverActiveRuns(options);
  }

  /**
   * The approval card's «what and where» for a stored `confirm` call, read
   * with the same services the capabilities use (correctness review W1 F1).
   */
  describeApproval(
    identity: CapabilityIdentity,
    toolName: string | null | undefined,
    args: unknown
  ): Promise<string | null> {
    return describeApprovalCall(
      CAPABILITY_CATALOGUE,
      this.service,
      identity,
      toolName,
      args
    );
  }

  /**
   * The digest of what a stored `confirm` call would send out now, or `null`
   * when its approval binds only the call (review W2 F4).
   */
  approvalContent(
    identity: CapabilityIdentity,
    toolName: string | null | undefined,
    args: unknown
  ): Promise<string | null> {
    return approvalContentDigest(
      CAPABILITY_CATALOGUE,
      this.service,
      identity,
      toolName,
      args
    );
  }

  /** Whether a samples receipt's avatar is the caller's (review W3-18 F3). */
  samplesAvatarKnown(
    identity: CapabilityIdentity,
    avatarId: string
  ): Promise<boolean> {
    return avatarInWorkspace(this.service, identity, avatarId);
  }

  /**
   * A pictures receipt as the library's own rows say it (`kcxz.25`, review
   * W4-25 F3): `null` unless every id is a live picture of the caller's.
   */
  mediaReceipt(identity: CapabilityIdentity, ids: string[]) {
    return mediaReceiptInWorkspace(this.service, identity, ids);
  }

  /** The label of a registry tool in the caller's language (kcxz.29, D5). */
  toolTitle(identity: CapabilityIdentity, toolName: string | null | undefined) {
    return capabilityToolTitle(
      CAPABILITY_CATALOGUE,
      toolName,
      identity.language
    );
  }

  /**
   * Transcribes a recorded voice note through native `@mastra/core/voice`
   * (`AISDKTranscription`) inside a metered `AiUsageService` admission
   * (`content-factory-next-bxeb.1`).
   */
  async transcribeVoice(
    identity: CapabilityIdentity,
    audio: { buffer: Buffer; mimeType?: string }
  ): Promise<{ text: string }> {
    const rawMime = (audio.mimeType ?? 'audio/webm')
      .split(';')[0]
      ?.trim()
      .toLowerCase();
    if (
      !rawMime ||
      !(AGENT_VOICE_MEDIA_TYPES as readonly string[]).includes(rawMime)
    ) {
      throw new AgentChatRequestError(
        'AGENT_BAD_REQUEST',
        400,
        'Unsupported audio media type.'
      );
    }
    if (
      !Buffer.isBuffer(audio.buffer) ||
      audio.buffer.byteLength <= 0 ||
      audio.buffer.byteLength > AGENT_VOICE_MAX_BYTES
    ) {
      throw new AgentChatRequestError(
        'AGENT_BAD_REQUEST',
        400,
        'Audio recording is empty or exceeds the 15 MB limit.'
      );
    }
    const text = await this.aiUsage.executeAiOperation(
      identity.organizationId,
      'agent',
      async () => {
        const voice = await getMastraVoice(identity.organizationId, {
          language: identity.language,
          mimeType: rawMime,
        });
        const raw = await voice.listen(Readable.from(audio.buffer), {
          filetype: rawMime.split('/')[1] ?? 'webm',
        } as any);
        return typeof raw === 'string' ? raw : '';
      },
      'extract'
    );
    return { text: withoutSecretShapes(text).trim() };
  }

  /**
   * Evaluates a piece or adaptation against the deterministic Brand Voice &
   * Fact Grounding `MastraScorer` (`brand-voice-and-facts`) and persists the
   * score row into `mastra_scores` (`pStore.getStore('scores')`).
   */
  async scorePieceOrAdaptation(
    identity: CapabilityIdentity,
    input: BrandVoiceScorerInput,
    output: BrandVoiceScorerOutput,
    options?: { threadId?: string }
  ): Promise<BrandVoiceFactScoreSummary> {
    await this.mastra();
    const scoresStore = await pStore.getStore('scores').catch(() => null);
    return scoreBrandVoiceAndFacts(
      {
        ...input,
        organizationId: identity.organizationId,
        locale: identity.language,
      },
      output,
      {
        scoresStore,
        resourceId: conductorResourceId(
          identity.organizationId,
          identity.userId
        ),
        threadId: options?.threadId,
      }
    );
  }

  async conductor() {
    return (await this.mastra()).getAgentById(CONDUCTOR_AGENT_ID);
  }

  async notificationsStore(): Promise<NotificationsStorage> {
    const store = await pStore.getStore('notifications').catch(() => null);
    return (store as NotificationsStorage | null) ?? this.fallbackNotifications;
  }

  async backgroundTaskManager() {
    return (await this.mastra()).backgroundTaskManager;
  }

  async recordNotification(input: {
    threadId: string;
    resourceId: string;
    title: string;
    summary: string;
    source: string;
    kind: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    payload?: unknown;
    metadata?: Record<string, unknown>;
  }) {
    const store = await this.notificationsStore();
    return store.createNotification({
      threadId: input.threadId,
      resourceId: input.resourceId,
      agentId: CONDUCTOR_AGENT_ID,
      source: input.source,
      kind: input.kind,
      summary: withoutSecretShapes(input.summary),
      priority: input.priority ?? 'medium',
      payload: input.payload,
      metadata: {
        ...input.metadata,
        title: withoutSecretShapes(input.title),
      },
    });
  }

  async controller() {
    const controller = (await this.mastra()).getAgentController(
      CONDUCTOR_AGENT_ID
    );
    await controller.init();
    return controller;
  }

  /**
   * Resolves the native `Session` for `(organizationId:userId, threadId)`,
   * isolated per user and thread (`scope: threadId`) without creating an empty
   * thread before quota admission succeeds (`createInitialThread: false`).
   */
  /** Bind the idle native stream consumer inside a newly admitted task scope. */
  async bindNativeTaskSession(
    identity: CapabilityIdentity,
    threadId: string,
    requestContext: RequestContext<any>
  ) {
    const session = await this.sessionFor(identity, threadId, {
      requestContext,
    });
    const thread = await session.thread.getById({ threadId });
    if (
      !thread ||
      thread.resourceId !==
        conductorResourceId(identity.organizationId, identity.userId)
    ) {
      throw Object.assign(
        new Error('Native session thread is outside this workspace.'),
        { name: 'PermissionDenied' }
      );
    }
    if (
      session.approval.isArmed({ threadId }) ||
      session.suspensions.hasPending()
    ) {
      throw new Error('Native input is already awaiting an answer.');
    }
    // ensureCurrentSubscription deduplicates an existing binding. Replace an
    // idle local consumer so its future resumes retain this task's async scope.
    session.thread.detachFromCurrent();
    if (session.thread.getId() !== threadId) {
      await session.thread.switch({
        threadId,
        emitEvent: false,
        requestContext,
      });
    }
    await session.thread.ensureCurrentSubscription(requestContext);
    return session;
  }

  async sessionFor(
    identity: CapabilityIdentity,
    threadId: string,
    options?: {
      bindThread?: boolean;
      requestContext?: RequestContext<any>;
    }
  ) {
    const resourceId = conductorResourceId(
      identity.organizationId,
      identity.userId
    );
    const address = { resourceId, scope: threadId };
    const unpin = this.nativeSessionCache.pin(address);
    try {
      const controller = await this.controller();
      const session = await controller.createSession({
        id: `${resourceId}:${threadId}`,
        ownerId: identity.userId,
        resourceId,
        scope: threadId,
        // Prevent automatic subscription during construction: permissions must be
        // restored before an existing pending gate can execute. Binding follows below.
        tags: { assistantThreadId: threadId, assistantRuntime: this.nativeSessionBindingId },
        createInitialThread: false,
        requestContext: options?.requestContext,
      });
      await this.nativeSessionCache.remember(address, session, controller);
      if (options?.bindThread) {
        const existing = await session.thread.getById({ threadId });
        if (!existing || existing.resourceId !== resourceId)
          throw Object.assign(
            new Error('Native session thread is outside this workspace.'),
            { name: 'PermissionDenied' }
          );
        if (session.thread.getId() !== threadId) {
          await session.thread.switch({
            threadId,
            emitEvent: false,
            requestContext: options.requestContext,
          });
        }
        // Cold sessions need the native stream engine to replay and arm stored
        // gates (including allow-policy built-ins) before answers can resume them.
        await session.thread.ensureCurrentSubscription(
          options.requestContext as RequestContext<any>
        );
      }
      return session;
    } finally {
      unpin();
    }
  }
}
