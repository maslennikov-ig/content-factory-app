import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type Type,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Mastra } from '@mastra/core/mastra';
import { isDurableAgent } from '@mastra/core/agent/durable';
import { ConsoleLogger } from '@mastra/core/logger';
import type { RequestContext } from '@mastra/core/request-context';
import { pStore } from '@contentfactory/nestjs-libraries/chat/mastra.store';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import {
  getAiSdkProvider,
  getClassifyDecisionModel,
  getMastraAgentModelEntries,
  getModelForRole,
} from '@contentfactory/nestjs-libraries/openai/ai.clients';
import { PermissionsService } from '@contentfactory/backend/services/auth/permissions/permissions.service';
import { DoorPolicyGate } from '@contentfactory/nestjs-libraries/chat/capabilities/door-policy';
import type { CapabilityGate } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.admission';
import {
  CONDUCTOR_SUBAGENT_ROLE_MAP,
  buildConductorAgent,
  buildConductorController,
  createConductorModelSelectionProcessor,
  setConductorModelMaxRetries,
} from '@contentfactory/nestjs-libraries/chat/conductor/conductor.agent';
import {
  CONDUCTOR_AGENT_ID,
  buildConductorContext,
  conductorResourceId,
} from '@contentfactory/nestjs-libraries/chat/conductor/conductor.context';
import { AGENT_EXECUTION_METADATA_KEY } from '@contentfactory/nestjs-libraries/chat/conductor/agent-turn-lifecycle';
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
import type { AgentArtifactRef, AgentWorkContextV1 } from '@contentfactory/nestjs-libraries/chat/capabilities/agent-parts.contract';

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
export class MastraService implements OnApplicationBootstrap, OnApplicationShutdown {
  private instance?: Mastra;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly aiUsage: AiUsageService
  ) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    await this.recoverDurableRuns().catch(() => undefined);
  }

  async onApplicationShutdown() {
    await this.instance?.shutdown().catch(() => undefined);
  }

  private service = <T>(token: Type<T>): T =>
    this.moduleRef.get(token, { strict: false });

  private workContextResolver() {
    return new AgentWorkContextResolver({ services: this.service, gate: this.gate(), capabilities: CAPABILITY_CATALOGUE });
  }

  resolveWorkContext(identity: CapabilityIdentity, context: AgentWorkContextV1, options?: { refresh?: boolean }) {
    return this.workContextResolver().resolve(identity, context, options);
  }

  validateWorkArtifact(identity: CapabilityIdentity, artifact: AgentArtifactRef) {
    return this.workContextResolver().validateArtifact(identity, artifact);
  }

  browseWorkObjects(identity: CapabilityIdentity, query: unknown) {
    return new AgentWorkObjectBrowser({ services: this.service, gate: this.gate(), capabilities: CAPABILITY_CATALOGUE }).browse(identity, query);
  }

  /** Resolved on first use: `PermissionsService` lives in the API module. */
  private gate(): CapabilityGate {
    let gate: DoorPolicyGate | undefined;
    return {
      check: (door, identity) =>
        (gate ??= new DoorPolicyGate(this.service(PermissionsService))).check(
          door,
          identity
        ),
    };
  }

  async mastra() {
    if (!this.instance) {
      const memory = createConductorMemory(pStore);
      const agents = {
        [CONDUCTOR_AGENT_ID]: buildConductorAgent({
          services: this.service,
          gate: this.gate(),
          memory,
          storage: pStore,
          // Inside the turn's `agent` admission, so every step lands in its
          // ledger; the model is the ordered `ModelWithRetries[]` chain of
          // role `agent` (`on0i.5`, `A16`, `A29`, `A30`).
          model: ({ organizationId }, requestContext) =>
            this.aiUsage.prepareModelExecution(
              organizationId,
              'agent',
              async () => {
                const { entries, policy } = await getMastraAgentModelEntries(
                  organizationId,
                  'agent'
                );
                if (requestContext) {
                  setConductorModelMaxRetries(
                    requestContext,
                    policy.maxRetries
                  );
                }
                if (entries.length > 0) {
                  return entries;
                }
                return (await getAiSdkProvider(organizationId)).chat(
                  await getModelForRole(organizationId, 'agent')
                );
              }
            ),
          modelSelection: async ({ organizationId }) => {
            const [agentModelId, classifyModelId] = await Promise.all([
              getModelForRole(organizationId, 'agent'),
              getModelForRole(organizationId, 'classify'),
            ]);
            if (!classifyModelId || classifyModelId === agentModelId) {
              return null;
            }
            const [decisionModel, provider] = await Promise.all([
              getClassifyDecisionModel(organizationId),
              getAiSdkProvider(organizationId),
            ]);
            return createConductorModelSelectionProcessor({
              model: decisionModel as any,
              minProbability: 0.85,
              choices: [
                {
                  name: 'classify',
                  model: provider.chat(classifyModelId) as any,
                  criteria:
                    'Short status lookup, greeting, or direct factual question that requires no multi-step research, planning, or content writing.',
                },
                {
                  name: 'agent',
                  model: provider.chat(agentModelId) as any,
                  criteria:
                    'Any request involving content creation, editing, research, planning, scheduling, or multi-step tool orchestration.',
                },
              ],
            });
          },
          goalJudge: ({ organizationId }, requestContext) =>
            this.aiUsage.prepareModelExecution(
              organizationId,
              'agent',
              async () => {
                const { entries, policy } = await getMastraAgentModelEntries(
                  organizationId,
                  'review'
                );
                if (requestContext) {
                  setConductorModelMaxRetries(
                    requestContext,
                    policy.maxRetries
                  );
                }
                if (entries.length > 0) {
                  return entries;
                }
                return (await getAiSdkProvider(organizationId)).chat(
                  await getModelForRole(organizationId, 'review')
                );
              }
            ),
          subagentModel: ({ organizationId }, agentType, requestContext) => {
            const role = CONDUCTOR_SUBAGENT_ROLE_MAP[agentType] ?? 'agent';
            const operation =
              role === 'research' ? 'web_research' : 'agent';
            return this.aiUsage.prepareModelExecution(
              organizationId,
              operation,
              async () => {
                const { entries, policy } = await getMastraAgentModelEntries(
                  organizationId,
                  role
                );
                if (requestContext) {
                  setConductorModelMaxRetries(
                    requestContext,
                    policy.maxRetries
                  );
                }
                if (entries.length > 0) {
                  return entries;
                }
                return (await getAiSdkProvider(organizationId)).chat(
                  await getModelForRole(organizationId, role)
                );
              }
            );
          },
          schedules: () => this.instance?.schedules,
        }),
      };
      this.instance = new Mastra({
        storage: pStore,
        agents,
        agentControllers: {
          [CONDUCTOR_AGENT_ID]: buildConductorController(
            agents[CONDUCTOR_AGENT_ID],
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
              conductorResourceId(meta.organizationId, meta.userId) === resourceId
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
              const requestContext = buildConductorContext({
                identity,
                threadId,
              });
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
        },
        recovery: {
          workflows: 'auto',
          durableAgents: 'auto',
        },
        logger: new ConsoleLogger({ level: 'info' }),
      });
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
    const memory = (await conductor.getMemory()) as
      | {
          getThreadById?: (input: { threadId: string }) => Promise<{ metadata?: Record<string, unknown> } | null>;
          updateThread?: (input: { id: string; metadata?: Record<string, unknown> }) => Promise<unknown>;
        }
      | undefined;

    const reconcileThread = async (runId: string, outcome: 'completed' | 'failed') => {
      const threadId = threadByRunId.get(runId) ?? options?.threadId;
      if (!threadId || !memory?.getThreadById || !memory.updateThread) return;
      const thread = await memory.getThreadById({ threadId });
      const marker = thread?.metadata?.[AGENT_EXECUTION_METADATA_KEY] as
        | { requestId?: unknown; state?: unknown }
        | undefined;
      if (
        marker &&
        typeof marker.requestId === 'string' &&
        marker.requestId &&
        marker.state !== 'settled'
      ) {
        await memory.updateThread({
          id: threadId,
          metadata: {
            [AGENT_EXECUTION_METADATA_KEY]: {
              requestId: marker.requestId,
              state: 'settled',
              outcome,
            },
          },
        });
      }
    };

    if (options?.force) {
      const targets = options.runId
        ? [{ runId: options.runId }]
        : activeRuns;
      const recovered: Array<{ runId: string; status: 'success' | 'failed'; error?: Error }> = [];
      let succeeded = 0;
      let failed = 0;
      for (const target of targets) {
        try {
          const stream = await conductor.recover(target.runId, { force: true });
          const reader = stream.fullStream.getReader();
          while (!(await reader.read()).done) {
            /* Drain recovered stream to completion. */
          }
          await conductor.runRegistry.get(target.runId)?.workflowExecution;
          stream.cleanup();
          succeeded += 1;
          recovered.push({ runId: target.runId, status: 'success' });
          await reconcileThread(target.runId, 'completed');
        } catch (error) {
          failed += 1;
          recovered.push({
            runId: target.runId,
            status: 'failed',
            error: error instanceof Error ? error : new Error(String(error)),
          });
          await reconcileThread(target.runId, 'failed');
        }
      }
      return { recovered, succeeded, failed };
    }

    const summary = await conductor.recoverActiveRuns(options);
    for (const entry of summary.recovered) {
      if (entry.status === 'success') {
        await reconcileThread(entry.runId, 'completed');
      } else if (entry.status === 'failed') {
        await reconcileThread(entry.runId, 'failed');
      }
    }
    return summary;
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
    return approvalContentDigest(CAPABILITY_CATALOGUE, this.service, identity, toolName, args);
  }

  /** Whether a samples receipt's avatar is the caller's (review W3-18 F3). */
  samplesAvatarKnown(identity: CapabilityIdentity, avatarId: string): Promise<boolean> {
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
    return capabilityToolTitle(CAPABILITY_CATALOGUE, toolName, identity.language);
  }

  async conductor() {
    return (await this.mastra()).getAgentById(CONDUCTOR_AGENT_ID);
  }

  async controller() {
    const controller = (await this.mastra()).getAgentController(CONDUCTOR_AGENT_ID);
    await controller.initStorage();
    return controller;
  }

  /**
   * Resolves the native `Session` for `(organizationId:userId, threadId)`,
   * isolated per user and thread (`scope: threadId`) without creating an empty
   * thread before quota admission succeeds (`createInitialThread: false`).
   */
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
    const controller = await this.controller();
    const session = await controller.createSession({
      id: `${resourceId}:${threadId}`,
      ownerId: identity.userId,
      resourceId,
      scope: threadId,
      createInitialThread: false,
      requestContext: options?.requestContext,
    });
    if (options?.bindThread && session.thread.getId() !== threadId) {
      const existing = await session.thread.getById({ threadId });
      if (existing && existing.resourceId === resourceId) {
        await session.thread.switch({
          threadId,
          emitEvent: false,
          requestContext: options.requestContext,
        });
      }
    }
    return session;
  }
}
