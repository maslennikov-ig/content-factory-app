import { Agent } from '@mastra/core/agent';
import { AgentController } from '@mastra/core/agent-controller';
import { ChatChannelProcessor } from '@mastra/core/channels';
import type { MastraMemory } from '@mastra/core/memory';
import {
  ModelSelectionProcessor,
  StreamErrorRetryProcessor,
  TokenLimiterProcessor,
  ToolCallFilter,
  UnsupportedFileHandler,
  type ModelSelectionDecision,
  type ModelSelectionProcessorOptions,
} from '@mastra/core/processors';
import { MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import {
  DEFAULT_TEXT_MAX_RETRIES,
  MAX_TEXT_FALLBACK_MODELS,
  MAX_TEXT_MODEL_RETRIES,
  currentAiExecutionSignal,
} from '@contentfactory/nestjs-libraries/openai/ai.text-chain';
import {
  createCapabilityHooks,
  stopAfterOpenProposalRefusal,
  type CapabilityGate,
} from '../capabilities/capability.admission';
import { readCapabilityIdentity } from '../capabilities/capability.context';
import {
  assertCapabilityRegistry,
  CAPABILITY_CATALOGUE,
} from '../capabilities/capability.registry';
import type {
  CapabilityDeclaration,
  CapabilityIdentity,
} from '../capabilities/capability.types';
import {
  activeCapabilityToolNames,
  buildMastraCapabilityTools,
  type CapabilityServices,
  type CapabilityTools,
} from '../capabilities/mastra.adapter';
import { readWorkspaceSnapshot } from '../capabilities/catalogue/overview.capabilities';
import {
  CONDUCTOR_AGENT_ID,
  CONDUCTOR_MAX_RETRIES,
  CONDUCTOR_MAX_STEPS,
  conductorContextSchema,
  conductorScopes,
} from './conductor.context';
import { AGENT_WORK_CONTEXT_KEY, type ResolvedAgentWorkContext } from './work-context';
import { conductorInstructions } from './conductor.instructions';
import { ViewedPicturesProcessor } from './conductor.pictures';
import { stepNotes } from './conductor.steps';
import { CONDUCTOR_SKILLS } from './conductor.skills';
import {
  conductorInputProcessors,
  conductorOutputProcessors,
} from './conductor.secrets';
import {
  CONDUCTOR_AUTONOMY_TOOL_NAMES,
  CONDUCTOR_BUILTIN_AUTONOMY_TOOL_NAMES,
  CONDUCTOR_EXTRA_AUTONOMY_TOOL_NAMES,
  CONDUCTOR_GOAL_JUDGE_PROMPT,
  CONDUCTOR_GOAL_VERIFICATION_CAPABILITY_IDS,
  CONDUCTOR_SUBAGENT_CAPABILITY_IDS,
  CONDUCTOR_SUBAGENT_ROLE_MAP,
  buildConductorAutonomyTools,
  buildConductorGoalConfig,
  buildConductorSubagentDefinitions,
  buildNotificationInboxTool,
  createConductorTaskStateProcessor,
  createConductorToolSearchProcessor,
  normalizeObjectiveRecord,
  resolveConductorGoalStore,
  resolveFollowUpScheduleTimeZone,
  type ConductorSubagentType,
} from './conductor.autonomy';

export {
  CONDUCTOR_AUTONOMY_TOOL_NAMES,
  CONDUCTOR_BUILTIN_AUTONOMY_TOOL_NAMES,
  CONDUCTOR_EXTRA_AUTONOMY_TOOL_NAMES,
  CONDUCTOR_GOAL_JUDGE_PROMPT,
  CONDUCTOR_GOAL_VERIFICATION_CAPABILITY_IDS,
  CONDUCTOR_SUBAGENT_CAPABILITY_IDS,
  CONDUCTOR_SUBAGENT_ROLE_MAP,
  buildConductorGoalConfig,
  buildConductorSubagentDefinitions,
  buildNotificationInboxTool,
  createConductorTaskStateProcessor,
  createConductorToolSearchProcessor,
  normalizeObjectiveRecord,
  resolveConductorGoalStore,
  resolveFollowUpScheduleTimeZone,
  type ConductorSubagentType,
};

export const CONDUCTOR_TOOL_STEP_FILTER = 6;
export const CONDUCTOR_PROMPT_TOKEN_LIMIT = 48_000;
export const CONDUCTOR_MAX_PROCESSOR_RETRIES =
  MAX_TEXT_MODEL_RETRIES * (MAX_TEXT_FALLBACK_MODELS + 1);

const modelMaxRetriesByContext = new WeakMap<object, number>();
const modelSelectionDecisionByContext = new WeakMap<object, ModelSelectionDecision>();

export const setConductorModelMaxRetries = (
  requestContext: object | undefined | null,
  maxRetries: number
) => {
  if (!requestContext || typeof requestContext !== 'object') return;
  modelMaxRetriesByContext.set(
    requestContext,
    Math.min(Math.max(Math.trunc(maxRetries), 0), MAX_TEXT_MODEL_RETRIES)
  );
};

export const getConductorModelMaxRetries = (
  requestContext: object | undefined | null,
  fallback = DEFAULT_TEXT_MAX_RETRIES
): number => {
  if (!requestContext || typeof requestContext !== 'object') return fallback;
  return modelMaxRetriesByContext.get(requestContext) ?? fallback;
};

export const recordConductorModelSelectionDecision = (
  requestContext: object | undefined | null,
  decision: ModelSelectionDecision
) => {
  if (!requestContext || typeof requestContext !== 'object') return;
  modelSelectionDecisionByContext.set(requestContext, decision);
};

export const readConductorModelSelectionDecision = (
  requestContext: object | undefined | null
): ModelSelectionDecision | undefined => {
  if (!requestContext || typeof requestContext !== 'object') return undefined;
  return modelSelectionDecisionByContext.get(requestContext);
};

const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 422]);
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504, 529]);
const TRANSIENT_ERROR_PATTERN =
  /\b(429|500|502|503|504|529|rate[_ -]?limit|too many requests|overloaded|temporarily[_ -]?unavailable|service[_ -]?unavailable|bad gateway|gateway timeout|timeout|timed out|econnreset|etimedout|econnrefused|epipe|und_err_socket|fetch failed|socket hang up|stream error|stream ended|mid-?stream|premature close|connection reset|network error)\b/i;
const TERMINAL_AUTH_OR_CLIENT_PATTERN =
  /\b(400|401|403|invalid[_ -]?api[_ -]?key|authentication[_ -]?error|permission[_ -]?denied|access[_ -]?denied|unauthorized|forbidden|bad[_ -]?request)\b/i;

export const isTransientConductorModelError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Record<string, unknown>;
  if (
    candidate.name === 'AbortError' ||
    candidate.executionBudgetStop === true ||
    currentAiExecutionSignal()?.aborted
  ) {
    return false;
  }
  const status = Number(candidate.statusCode ?? candidate.status);
  if (Number.isFinite(status)) {
    if (NON_RETRYABLE_STATUS_CODES.has(status)) return false;
    if (RETRYABLE_STATUS_CODES.has(status)) return true;
  }
  if (candidate.isRetryable === false) return false;
  if (candidate.isRetryable === true || candidate.name === 'AttemptTimeout') {
    return true;
  }
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  if (TERMINAL_AUTH_OR_CLIENT_PATTERN.test(message)) return false;
  if (TRANSIENT_ERROR_PATTERN.test(message)) return true;
  if (candidate.cause && candidate.cause !== error) {
    return isTransientConductorModelError(candidate.cause);
  }
  return false;
};

/**
 * Wraps Mastra's native `StreamErrorRetryProcessor` so each model in the
 * ordered `ModelWithRetries[]` array gets up to the configured per-model
 * `maxRetries` on transient 429/5xx/timeout/network/mid-stream faults before
 * Mastra advances to the next fallback model (`on0i.5`, `A16`, `A30`, `A31`).
 */
export const createConductorStreamErrorRetryProcessor = (options?: {
  defaultMaxRetries?: number;
  delayMs?: number;
}) => {
  const defaultMaxRetries =
    options?.defaultMaxRetries ?? DEFAULT_TEXT_MAX_RETRIES;
  const base = new StreamErrorRetryProcessor({
    maxRetries: CONDUCTOR_MAX_PROCESSOR_RETRIES,
    delayMs: options?.delayMs ?? 0,
    matchers: [isTransientConductorModelError],
  });
  const retriesByMessageList = new WeakMap<object, Map<number, number>>();

  const counterFor = (holder: object, stepNumber: number) => {
    let byStep = retriesByMessageList.get(holder);
    if (!byStep) {
      byStep = new Map<number, number>();
      retriesByMessageList.set(holder, byStep);
    }
    return {
      get: () => byStep!.get(stepNumber) ?? 0,
      set: (value: number) => byStep!.set(stepNumber, value),
    };
  };

  return {
    id: base.id,
    name: base.name,
    processAPIError: async (args: Parameters<StreamErrorRetryProcessor['processAPIError']>[0]) => {
      if (
        args.abortSignal?.aborted ||
        currentAiExecutionSignal()?.aborted ||
        (args.error as { name?: string })?.name === 'AbortError' ||
        (args.error as { executionBudgetStop?: boolean })?.executionBudgetStop
      ) {
        return undefined;
      }
      const holder =
        (args.messageList as unknown as object) ??
        (args.requestContext as unknown as object) ??
        base;
      const stepNumber = typeof args.stepNumber === 'number' ? args.stepNumber : 0;
      const counter = counterFor(holder, stepNumber);
      const maxRetriesForModel = getConductorModelMaxRetries(
        args.requestContext as unknown as object,
        defaultMaxRetries
      );
      const usedRetries = counter.get();
      if (
        maxRetriesForModel <= 0 ||
        usedRetries >= maxRetriesForModel ||
        !isTransientConductorModelError(args.error)
      ) {
        // Exhausted retries (or non-retryable error) for the current model;
        // reset per-model counter so the next fallback model starts at 0.
        counter.set(0);
        return undefined;
      }
      const decision = await base.processAPIError({
        ...args,
        retryCount: usedRetries,
      });
      if ((decision as { retry?: boolean } | undefined)?.retry) {
        counter.set(usedRetries + 1);
        return decision;
      }
      counter.set(0);
      return undefined;
    },
  };
};

export const createConductorModelSelectionProcessor = (
  options: ModelSelectionProcessorOptions
) => new ModelSelectionProcessor(options as any);

/**
 * The conductor (`content-factory-next-kcxz.7`, spec §4.6, ADR-0012 amendment
 * §3–§6): one Mastra agent, native all the way down.
 */

export type ConductorDependencies = {
  services: CapabilityServices;
  gate: CapabilityGate;
  /**
   * The model (or ordered Mastra `ModelWithRetries[]` array) for this turn,
   * already inside the turn's `agent` admission.
   */
  model: (identity: CapabilityIdentity, requestContext?: object) => Promise<unknown>;
  memory?: MastraMemory;
  storage?: MastraCompositeStore;
  capabilities?: readonly CapabilityDeclaration[];
  /** Replaced in tests; production reads the `workspace.snapshot` capability. */
  snapshot?: (identity: CapabilityIdentity) => Promise<unknown>;
  now?: () => Date;
  durable?: boolean | { cleanupTimeoutMs?: number };
  /**
   * Optional per-turn `ModelSelectionProcessor` (or factory per identity) and
   * default per-model retry budget (`on0i.5`, `A16`, `A17`, `A30`).
   */
  modelSelection?:
    | ModelSelectionProcessor
    | ((
        identity: CapabilityIdentity,
        requestContext?: object
      ) => Promise<ModelSelectionProcessor | null | undefined>);
  defaultModelMaxRetries?: number;
  /**
   * Optional metered goal-judge model resolver (`on0i.4`, `A18`). Defaults to `model`.
   */
  goalJudge?: (
    identity: CapabilityIdentity,
    requestContext?: object
  ) => Promise<unknown>;
  goalMaxRuns?: number;
  /**
   * Optional metered subagent model resolver (`on0i.4`, `A18`). Defaults to `model`.
   */
  subagentModel?: (
    identity: CapabilityIdentity,
    agentType: ConductorSubagentType,
    requestContext?: object
  ) => Promise<unknown>;
  /**
   * Optional schedules manager accessor (`mastra.schedules`, `on0i.4`, `A20`).
   */
  schedules?: () => Promise<any> | any;
  /**
   * Optional notifications storage accessor (`pStore.getStore('notifications')`, `bxeb.4`).
   */
  notificationsStore?: () => Promise<any> | any;
  /**
   * Optional tool discovery (`ToolSearchProcessor`, `on0i.4`, `A8`).
   */
  toolSearch?:
    | boolean
    | {
        topK?: number;
        minScore?: number;
        autoLoad?: boolean;
      };
};

const IDENTITY_REQUIRED =
  'The conductor ran without a server-built identity; nothing was done.';

export const buildConductorAgent = (deps: ConductorDependencies) => {
  const capabilities = assertCapabilityRegistry(
    deps.capabilities ?? CAPABILITY_CATALOGUE
  );
  const now = deps.now ?? (() => new Date());

  const subagentsByLanguage = new Map<
    'ru' | 'en',
    ReturnType<typeof buildConductorSubagentDefinitions>
  >();
  const subagentsFor = (language: 'ru' | 'en') => {
    let built = subagentsByLanguage.get(language);
    if (!built) {
      built = buildConductorSubagentDefinitions({
        capabilities,
        services: deps.services,
        gate: deps.gate,
        language,
      });
      subagentsByLanguage.set(language, built);
    }
    return built;
  };

  const resolveSubagentModel = async (
    identity: CapabilityIdentity,
    agentType: ConductorSubagentType,
    requestContext?: object
  ) => {
    if (deps.subagentModel) {
      return deps.subagentModel(identity, agentType, requestContext);
    }
    return deps.model(identity, requestContext);
  };

  const autonomyToolsByLanguage = new Map<
    'ru' | 'en',
    ReturnType<typeof buildConductorAutonomyTools>
  >();
  const autonomyToolsFor = (
    identity: CapabilityIdentity,
    hasControllerToolset: boolean
  ) => {
    let builder = autonomyToolsByLanguage.get(identity.language);
    if (!builder) {
      builder = buildConductorAutonomyTools({
        subagents: subagentsFor(identity.language),
        getMemory: () => deps.memory,
        getStorage: () => deps.storage,
        getSchedulesManager: () => deps.schedules?.(),
        getNotificationsStore: () => deps.notificationsStore?.(),
        resolveSubagentModel,
        createSubagentRunner: (cfg) => new Agent(cfg as any),
      });
      autonomyToolsByLanguage.set(identity.language, builder);
    }
    return builder({ identity, hasControllerToolset });
  };

  // One tool set per interface language; the role filter picks from it.
  const toolsByLanguage = new Map<'ru' | 'en', CapabilityTools>();
  const toolsFor = (
    identity: CapabilityIdentity,
    hasControllerToolset = false
  ): Record<string, any> => {
    let tools = toolsByLanguage.get(identity.language);
    if (!tools) {
      tools = buildMastraCapabilityTools(capabilities, {
        services: deps.services,
        language: identity.language,
        gate: deps.gate,
      });
      toolsByLanguage.set(identity.language, tools);
    }
    const allowed = new Set(
      activeCapabilityToolNames(capabilities, identity.role)
    );
    const domainTools = Object.fromEntries(
      Object.entries(tools).filter(([name]) => allowed.has(name))
    );
    return {
      ...domainTools,
      ...autonomyToolsFor(identity, hasControllerToolset),
    };
  };

  const readSnapshot =
    deps.snapshot ??
    ((identity: CapabilityIdentity) =>
      readWorkspaceSnapshot({ ...identity, service: deps.services }));

  // Read once per request: the instruction may be resolved more than once in
  // a turn, the workspace is read at its start.
  const snapshots = new WeakMap<object, Promise<unknown | null>>();
  const snapshotOf = (context: object, identity: CapabilityIdentity) => {
    let pending = snapshots.get(context);
    if (!pending) {
      pending = readSnapshot(identity).catch(() => null);
      snapshots.set(context, pending);
    }
    return pending;
  };

  const resolvedRouters = new WeakMap<object, ModelSelectionProcessor | null>();
  const dynamicModelSelectionProcessor =
    typeof deps.modelSelection === 'function'
      ? {
          id: 'model-selection',
          name: 'model-selection' as const,
          processInput: async (args: any) => {
            const ctx = args.requestContext as object | undefined;
            const identity = readCapabilityIdentity(args.requestContext);
            if (!ctx || !identity) return args.messages;
            let router = resolvedRouters.get(ctx);
            if (router === undefined) {
              router =
                (await (
                  deps.modelSelection as (
                    id: CapabilityIdentity,
                    rc?: object
                  ) => Promise<ModelSelectionProcessor | null | undefined>
                )(identity, ctx)) ?? null;
              resolvedRouters.set(ctx, router);
            }
            if (!router) return args.messages;
            return router.processInput(args);
          },
          processInputStep: (args: any) => {
            const ctx = args.requestContext as object | undefined;
            if (!ctx) return {};
            const router = resolvedRouters.get(ctx);
            if (!router) return {};
            return router.processInputStep(args);
          },
        }
      : deps.modelSelection;

  const toolSearchProcessor = deps.toolSearch
    ? createConductorToolSearchProcessor({
        capabilities,
        services: deps.services,
        gate: deps.gate,
        ...(typeof deps.toolSearch === 'object' ? deps.toolSearch : {}),
      })
    : null;

  const goalConfig = buildConductorGoalConfig({
    capabilities,
    services: deps.services,
    gate: deps.gate,
    judgeModel: deps.goalJudge ?? deps.model,
    maxRuns: deps.goalMaxRuns ?? 6,
    maxSteps: 6,
  });

  return new Agent({
    id: CONDUCTOR_AGENT_ID,
    name: 'Content Factory',
    description:
      'The Content Factory assistant: does what the screens do, from one chat.',
    requestContextSchema: conductorContextSchema as any,
    durable: (deps.durable ?? { cleanupTimeoutMs: 250 }) as any,
    backgroundTasks: {
      tools: {
        research_search: { enabled: true, defaultDisposition: 'foreground' },
        piece_create_from_research: { enabled: true, defaultDisposition: 'foreground' },
        piece_adapt: { enabled: true, defaultDisposition: 'foreground' },
        subagent: { enabled: true, defaultDisposition: 'foreground' },
      },
    },
    ...(deps.memory ? { goal: goalConfig } : {}),
    scopes: ({ requestContext }) => {
      const identity = readCapabilityIdentity(requestContext as any);
      if (!identity) return [];
      const threadId = requestContext?.get(MASTRA_THREAD_ID_KEY);
      return conductorScopes(
        identity,
        typeof threadId === 'string' && threadId ? threadId : undefined
      );
    },
    instructions: async ({ requestContext }) => {
      const identity = readCapabilityIdentity(requestContext as any);
      if (!identity) throw new Error(IDENTITY_REQUIRED);
      return conductorInstructions({
        language: identity.language,
        role: identity.role,
        now: now(),
        timeZone: identity.timeZone,
        snapshot: await snapshotOf(requestContext as object, identity),
        workContext: (() => {
          const selected = requestContext.get(AGENT_WORK_CONTEXT_KEY);
          return typeof selected === 'string' && selected ? JSON.parse(selected) as ResolvedAgentWorkContext : null;
        })(),
      });
    },
    model: async ({ requestContext }) => {
      const identity = readCapabilityIdentity(requestContext as any);
      if (!identity) throw new Error(IDENTITY_REQUIRED);
      return (await deps.model(identity, requestContext as object)) as any;
    },
    tools: ({ requestContext }) => {
      const identity = readCapabilityIdentity(requestContext as any);
      const hasControllerToolset = Boolean(
        (requestContext as { get?: (key: string) => unknown } | undefined)?.get?.(
          'controller'
        )
      );
      return identity ? toolsFor(identity, hasControllerToolset) : {};
    },
    hooks: createCapabilityHooks(capabilities, deps.gate, deps.services),
    skills: CONDUCTOR_SKILLS,
    ...(deps.memory ? { memory: deps.memory } : {}),
    maxRetries: CONDUCTOR_MAX_RETRIES,
    // Mastra adds `stepCountIs(maxSteps)` to these conditions; a request's own
    // `maxSteps` keeps the stop after an open-card refusal (kcxz.38, R5). The
    // door passes `prepareStep` for its own `maxSteps`; this one is for a
    // caller that keeps the ordinary cap.
    defaultOptions: {
      maxSteps: CONDUCTOR_MAX_STEPS,
      stopWhen: stopAfterOpenProposalRefusal as any,
      prepareStep: stepNotes() as any,
      toolCallConcurrency: 1,
      closeOnSuspend: true,
      maxProcessorRetries: CONDUCTOR_MAX_PROCESSOR_RETRIES,
    } as any,
    // Pictures to look at go back into the outgoing prompt only (owner
    // decision 28.09, `conductor.pictures.ts`). ToolCallFilter and
    // TokenLimiterProcessor bound outgoing LLM requests without mutating
    // stored UI/memory messages (on0i.2). TaskStateProcessor injects active
    // task list progress once per step (on0i.4, A18).
    inputProcessors: [
      ...conductorInputProcessors(),
      new ChatChannelProcessor() as any,
      ...(dynamicModelSelectionProcessor ? [dynamicModelSelectionProcessor as any] : []),
      ...(toolSearchProcessor ? [toolSearchProcessor as any] : []),
      ...(deps.memory ? [createConductorTaskStateProcessor() as any] : []),
      new ViewedPicturesProcessor(),
      new ToolCallFilter({
        filterAfterToolSteps: CONDUCTOR_TOOL_STEP_FILTER,
        preserveModelOutput: true,
      }),
      new TokenLimiterProcessor({
        limit: CONDUCTOR_PROMPT_TOKEN_LIMIT,
        strategy: 'truncate',
        trimMode: 'best-fit',
      }),
    ],
    outputProcessors: conductorOutputProcessors(),
    errorProcessors: [
      new UnsupportedFileHandler(),
      createConductorStreamErrorRetryProcessor({
        defaultMaxRetries: deps.defaultModelMaxRetries,
      }) as any,
    ],
  });
};

export type ConductorAgent = ReturnType<typeof buildConductorAgent>;

/**
 * Native Mastra 1.78 `AgentController` hosting the conductor agent (`on0i.1`, `on0i.4`).
 * Each `(resourceId, threadId)` pair gets an isolated `Session` via
 * `controller.createSession({ resourceId, ownerId, id, scope: threadId, createInitialThread: false })`.
 */
export const buildConductorController = (
  agent: ConductorAgent,
  options?: {
    storage?: MastraCompositeStore;
    memory?: MastraMemory;
    capabilities?: readonly CapabilityDeclaration[];
    services?: CapabilityServices;
    gate?: CapabilityGate;
    resolveSubagentModel?: (modelId: string, context?: any) => any;
  }
) => {
  const subagents =
    options?.services && options?.gate
      ? buildConductorSubagentDefinitions({
          capabilities: assertCapabilityRegistry(
            options.capabilities ?? CAPABILITY_CATALOGUE
          ),
          services: options.services,
          gate: options.gate,
        })
      : undefined;
  return new AgentController({
    id: CONDUCTOR_AGENT_ID,
    ...(options?.storage ? { storage: options.storage } : {}),
    ...(options?.memory ? { memory: options.memory } : {}),
    ...(subagents ? { subagents: subagents as any } : {}),
    ...(options?.resolveSubagentModel
      ? { resolveSubagentModel: options.resolveSubagentModel }
      : {}),
    disableBuiltinTools: ['submit_plan', 'subagent'],
    agent: agent as any,
    defaultModeId: 'assistant',
    modes: [
      {
        id: 'assistant',
        name: 'Content Factory',
        default: true,
        metadata: { default: true },
      },
      {
        id: 'plan',
        name: 'Plan',
        transitionsTo: 'assistant',
      },
    ],
  });
};

export type ConductorController = ReturnType<typeof buildConductorController>;
