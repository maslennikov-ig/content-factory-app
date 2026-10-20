import { z } from 'zod';
import {
  DEFAULT_GOAL_JUDGE_PROMPT,
  TaskStateProcessor,
  askUserTool,
  clearObjective,
  createTool,
  readObjective,
  resolveGoalStore,
  submitPlanTool,
  taskCheckTool,
  taskCompleteTool,
  taskUpdateTool,
  taskWriteTool,
  writeObjective,
} from '@mastra/core/tools';
import { ToolSearchProcessor } from '@mastra/core/processors';
import { MASTRA_THREAD_ID_KEY, RequestContext } from '@mastra/core/request-context';
import { defineSchedule } from '@mastra/core/schedules';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import type { AiRole } from '@contentfactory/nestjs-libraries/openai/ai.roles';
import type { CapabilityGate } from '../capabilities/capability.admission';
import {
  capabilityContextSchema,
  readCapabilityIdentity,
} from '../capabilities/capability.context';
import {
  refusal,
  toolNameOf,
  type CapabilityDeclaration,
  type CapabilityIdentity,
} from '../capabilities/capability.types';
import { CAPABILITY_CATALOGUE } from '../capabilities/capability.registry';
import { roleMayUse } from '../capabilities/door-policy';
import {
  activeCapabilityToolNames,
  buildCapabilityTool,
  type CapabilityServices,
  type CapabilityTools,
} from '../capabilities/mastra.adapter';
import { questionCardView } from '../capabilities/question-card';
import {
  CONDUCTOR_AGENT_ID,
  conductorResourceId,
} from './conductor.context';

export type ConductorSubagentType = 'research' | 'writing' | 'review';

export const CONDUCTOR_SUBAGENT_ROLE_MAP: Readonly<
  Record<ConductorSubagentType, AiRole>
> = {
  research: 'research',
  writing: 'draft',
  review: 'review',
};

export const CONDUCTOR_GOAL_VERIFICATION_CAPABILITY_IDS: readonly string[] = [
  'workspace.snapshot',
  'channels.list',
  'piece.list',
  'piece.open',
  'piece.read',
  'plan.ahead',
  'plan.calendar',
  'plan.ready',
  'facts.list',
  'texts.related',
];

export const CONDUCTOR_SUBAGENT_CAPABILITY_IDS: Readonly<
  Record<ConductorSubagentType, readonly string[]>
> = {
  research: [
    'workspace.snapshot',
    'channels.list',
    'piece.list',
    'piece.open',
    'piece.read',
    'research.search',
    'facts.list',
    'texts.related',
    'analytics.production',
    'analytics.channel',
  ],
  writing: [
    'workspace.snapshot',
    'piece.list',
    'piece.open',
    'piece.read',
    'facts.list',
    'texts.related',
    'piece.create',
    'piece.create.from-research',
    'piece.material.add',
    'piece.adapt',
  ],
  review: [
    'workspace.snapshot',
    'piece.open',
    'piece.read',
    'facts.list',
    'text.slop_check',
    'piece.check_facts',
    'adaptation.review',
  ],
};

export const CONDUCTOR_BUILTIN_AUTONOMY_TOOL_NAMES = [
  'ask_user',
  'submit_plan',
  'task_write',
  'task_update',
  'task_complete',
  'task_check',
  'subagent',
] as const;

export const CONDUCTOR_EXTRA_AUTONOMY_TOOL_NAMES = [
  'set_objective',
  'schedule_followup_create',
  'schedule_followup_list',
  'schedule_followup_cancel',
] as const;

export const CONDUCTOR_AUTONOMY_TOOL_NAMES = [
  ...CONDUCTOR_BUILTIN_AUTONOMY_TOOL_NAMES,
  ...CONDUCTOR_EXTRA_AUTONOMY_TOOL_NAMES,
] as const;

export const CONDUCTOR_GOAL_JUDGE_PROMPT = [
  DEFAULT_GOAL_JUDGE_PROMPT,
  '',
  'CRITICAL PRODUCT VERIFICATION RULES:',
  '- Self-written assistant prose (such as "Готово", "Мы создали заготовку и адаптировали её") is NEVER proof that a multi-step objective is complete.',
  '- Before returning status "done", you MUST call the read-only verification tools (such as workspace_snapshot, piece_list, piece_open, piece_read, plan_ahead, plan_calendar, plan_ready) to verify that every requested artifact (piece, research facts, adaptation, or plan slot) actually exists in the workspace and satisfies the objective constraints.',
  '- If a requested piece, adaptation, or plan slot is missing or incomplete in the workspace, return status "continue" with specific feedback naming what is still missing.',
].join('\n');

const createSuspendCardTransform = (toolName: string) => ({
  input: ({ input }: { input?: unknown }) => input ?? {},
  inputDelta: ({ inputTextDelta }: { inputTextDelta?: string }) =>
    inputTextDelta ?? '',
  output: ({ output }: { output?: unknown }) => output ?? null,
  error: ({ error }: { error?: unknown }) => ({
    code:
      typeof (error as { code?: unknown })?.code === 'string'
        ? (error as { code: string }).code
        : 'CAPABILITY_FAILED',
  }),
  approval: ({ input }: { input?: unknown }) => input ?? {},
  suspend: ({ suspendPayload }: { suspendPayload?: unknown }) =>
    questionCardView(suspendPayload, toolName),
  resume: ({ resumeData }: { resumeData?: unknown }) => resumeData ?? null,
});

// Attach card view transform to Mastra's built-in suspend tools so both direct
// agent streams and AgentController session streams emit `cardId` on suspend.
(askUserTool as any).transform = {
  display: createSuspendCardTransform('ask_user'),
  transcript: createSuspendCardTransform('ask_user'),
};
(submitPlanTool as any).transform = {
  display: createSuspendCardTransform('submit_plan'),
  transcript: createSuspendCardTransform('submit_plan'),
};

export const createConductorTaskStateProcessor = () => new TaskStateProcessor();

/**
 * Optional native `ToolSearchProcessor` (`on0i.4`, `A8`) with role-aware
 * filtering so tool discovery only surfaces tools allowed for the caller's
 * role and never exposes unauthorized capabilities.
 */
export const createConductorToolSearchProcessor = (options: {
  capabilities?: readonly CapabilityDeclaration[];
  services: CapabilityServices;
  gate: CapabilityGate;
  language?: 'ru' | 'en';
  topK?: number;
  minScore?: number;
  autoLoad?: boolean;
}) => {
  const capabilities = options.capabilities ?? CAPABILITY_CATALOGUE;
  const language = options.language ?? 'ru';
  const allTools: Record<string, any> = Object.fromEntries(
    capabilities.map((capability) => [
      toolNameOf(capability.id),
      buildCapabilityTool(capability, {
        services: options.services,
        language,
        entrance: 'chat',
        gate: options.gate,
        capabilities,
      }),
    ])
  );
  return new ToolSearchProcessor({
    tools: allTools,
    includeResolvedTools: true,
    storage: 'context',
    search: {
      topK: options.topK ?? 8,
      minScore: options.minScore ?? 0,
      autoLoad: options.autoLoad ?? true,
    },
    filter: ({ toolName, requestContext }) => {
      const identity = readCapabilityIdentity(requestContext as any);
      if (!identity) return false;
      const allowed = new Set(
        activeCapabilityToolNames(capabilities, identity.role)
      );
      if (isOrganizationEditor(identity.role)) {
        for (const name of CONDUCTOR_AUTONOMY_TOOL_NAMES) {
          allowed.add(name);
        }
      }
      return allowed.has(toolName);
    },
  });
};

/**
 * Builds the read-only verification tool map for the native thread-goal judge (`on0i.4`, `A18`).
 */
export const buildGoalVerificationTools = (options: {
  capabilities: readonly CapabilityDeclaration[];
  services: CapabilityServices;
  gate: CapabilityGate;
  identity: CapabilityIdentity;
}): CapabilityTools => {
  const verifyIds = new Set(CONDUCTOR_GOAL_VERIFICATION_CAPABILITY_IDS);
  const selected = options.capabilities.filter(
    (cap) =>
      verifyIds.has(cap.id) &&
      cap.risk === 'read' &&
      roleMayUse(cap, options.identity.role)
  );
  return Object.fromEntries(
    selected.map((cap) => [
      toolNameOf(cap.id),
      buildCapabilityTool(cap, {
        services: options.services,
        language: options.identity.language,
        entrance: 'chat',
        gate: options.gate,
        admitInExecute: true,
        capabilities: options.capabilities,
      }),
    ])
  );
};

export interface ConductorGoalConfig {
  judge: (args: { requestContext?: unknown }) => Promise<any>;
  tools?: (args: { requestContext?: unknown }) => Record<string, any>;
  prompt?: string;
  maxRuns?: number;
  maxSteps?: number;
}

export interface ConductorSubagentDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tools?: Record<string, any>;
  maxSteps?: number;
  defaultModelId?: string;
  forked?: boolean;
}

/**
 * Builds Mastra's native `goal` config (`on0i.4`, `A18`) with a metered judge
 * and read-only workspace verification tools.
 */
export const buildConductorGoalConfig = (options: {
  capabilities: readonly CapabilityDeclaration[];
  services: CapabilityServices;
  gate: CapabilityGate;
  judgeModel: (
    identity: CapabilityIdentity,
    requestContext?: object
  ) => Promise<unknown>;
  maxRuns?: number;
  maxSteps?: number;
}): ConductorGoalConfig => ({
  judge: async ({ requestContext }: { requestContext?: unknown }) => {
    const identity = readCapabilityIdentity(requestContext as any);
    if (!identity) {
      throw new Error('Goal judge requires a server-built capability identity.');
    }
    return (await options.judgeModel(
      identity,
      requestContext as unknown as object
    )) as any;
  },
  tools: ({ requestContext }: { requestContext?: unknown }) => {
    const identity = readCapabilityIdentity(requestContext as any);
    if (!identity) return {};
    const rc = requestContext as any;
    const savedThreadId = rc?.get?.(MASTRA_THREAD_ID_KEY);
    if (savedThreadId !== undefined && typeof rc?.delete === 'function') {
      rc.delete(MASTRA_THREAD_ID_KEY);
      setImmediate(() => {
        if (!rc.get(MASTRA_THREAD_ID_KEY)) {
          rc.set(MASTRA_THREAD_ID_KEY, savedThreadId);
        }
      });
    }
    return buildGoalVerificationTools({
      capabilities: options.capabilities,
      services: options.services,
      gate: options.gate,
      identity,
    }) as any;
  },
  prompt: CONDUCTOR_GOAL_JUDGE_PROMPT,
  maxRuns: options.maxRuns ?? 6,
  maxSteps: options.maxSteps ?? 6,
});

/**
 * Builds bounded specialist `subagents` (`research`, `writing`, `review`) for
 * `AgentController` and `buildConductorSubagentTool` (`on0i.4`, `A18`).
 *
 * Each specialist receives only its bounded toolset with `admitInExecute: true`
 * and zero `confirm` or `secret` capabilities, so a subagent can never bypass
 * parent approval or workspace permission rules.
 */
export const buildConductorSubagentDefinitions = (options: {
  capabilities: readonly CapabilityDeclaration[];
  services: CapabilityServices;
  gate: CapabilityGate;
  language?: 'ru' | 'en';
}): ConductorSubagentDefinition[] => {
  const language = options.language ?? 'ru';
  const toolsForIds = (ids: readonly string[]) => {
    const idSet = new Set(ids);
    const chosen = options.capabilities.filter(
      (cap) =>
        idSet.has(cap.id) &&
        cap.risk !== 'confirm' &&
        cap.risk !== 'secret'
    );
    return Object.fromEntries(
      chosen.map((cap) => [
        toolNameOf(cap.id),
        buildCapabilityTool(cap, {
          services: options.services,
          language,
          entrance: 'chat',
          gate: options.gate,
          admitInExecute: true,
          capabilities: options.capabilities,
        }),
      ])
    );
  };

  return [
    {
      id: 'research',
      name: 'Research Specialist',
      description:
        'Bounded research specialist: searches external sources, reads workspace pieces/facts/analytics, and returns structured evidence without modifying records.',
      instructions: [
        'You are the bounded research specialist inside Content Factory.',
        'Read workspace records or run external research using your read/research tools, and return concise, factual findings with exact ids and sources.',
        'Never invent facts or ids. Do not promise edits or publications.',
      ].join('\n'),
      tools: toolsForIds(CONDUCTOR_SUBAGENT_CAPABILITY_IDS.research) as any,
      maxSteps: 8,
      defaultModelId: 'research',
      forked: false,
    },
    {
      id: 'writing',
      name: 'Writing Specialist',
      description:
        'Bounded writing specialist: creates or adapts drafts in the workspace from verified brief/research context without publishing, scheduling, or deleting anything.',
      instructions: [
        'You are the bounded writing specialist inside Content Factory.',
        'Create or adapt pieces in the workspace using only the provided brief, facts, and tools.',
        'Never publish, schedule at a firm date, or delete records; report the created piece or adaptation ids and titles.',
      ].join('\n'),
      tools: toolsForIds(CONDUCTOR_SUBAGENT_CAPABILITY_IDS.writing) as any,
      maxSteps: 10,
      defaultModelId: 'writing',
      forked: false,
    },
    {
      id: 'review',
      name: 'Review Specialist',
      description:
        'Bounded review specialist: runs cliché/slop checks, fact checks, and adaptation reviews on workspace texts.',
      instructions: [
        'You are the bounded review specialist inside Content Factory.',
        'Inspect the piece or adaptation and run the requested review or fact-check tools. Report concrete findings and any open review card.',
      ].join('\n'),
      tools: toolsForIds(CONDUCTOR_SUBAGENT_CAPABILITY_IDS.review) as any,
      maxSteps: 8,
      defaultModelId: 'review',
      forked: false,
    },
  ];
};

const isNamedIanaTimeZone = (tz: string | undefined): tz is string => {
  if (!tz || typeof tz !== 'string') return false;
  const trimmed = tz.trim();
  if (!trimmed || trimmed.toUpperCase() === 'UTC' || /^[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return false;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
};

export const resolveFollowUpScheduleTimeZone = (
  requestedTimeZone: string | undefined,
  identityTimeZone: string | undefined
): {
  timeZone: string;
  timezoneAssumed: boolean;
  timezoneNote?: string;
} => {
  if (isNamedIanaTimeZone(requestedTimeZone)) {
    return { timeZone: requestedTimeZone.trim(), timezoneAssumed: false };
  }
  if (isNamedIanaTimeZone(identityTimeZone)) {
    return { timeZone: identityTimeZone.trim(), timezoneAssumed: false };
  }
  return {
    timeZone: 'Europe/Moscow',
    timezoneAssumed: true,
    timezoneNote:
      'Часовой пояс не был явно указан в профиле — расписание создано по времени Москвы (Europe/Moscow).',
  };
};

export const resolveConductorGoalStore = async (sources: {
  mastra?: any;
  storage?: any;
  memory?: any;
}) => {
  if (sources.mastra) {
    const fromMastra = await resolveGoalStore(sources.mastra);
    if (fromMastra) return fromMastra;
  }
  const rawStorage =
    sources.storage ??
    sources.memory?.storage ??
    (typeof sources.memory?.getStorage === 'function'
      ? sources.memory.getStorage()
      : undefined);
  if (rawStorage) {
    const fromStorage = await resolveGoalStore({
      getStorage: () => rawStorage,
    } as any);
    if (fromStorage) return fromStorage;
    if (typeof rawStorage.getStore === 'function') {
      const store = await rawStorage.getStore('threadState');
      if (store) return store;
    }
  }
  return undefined;
};

export const normalizeObjectiveRecord = (
  record: Record<string, any> | null | undefined
) => {
  if (!record || typeof record !== 'object') return null;
  const text =
    typeof record.objective === 'string'
      ? record.objective
      : typeof record.text === 'string'
      ? record.text
      : '';
  return {
    ...record,
    objective: text,
    text,
  };
};

const setObjectiveInputSchema = z.object({
  action: z.enum(['set', 'get', 'clear']).default('set'),
  text: z
    .string()
    .max(2000)
    .optional()
    .describe('The multi-step objective description when action is "set".'),
  maxRuns: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Optional maximum number of autonomous runs for this objective.'),
});

export const buildSetObjectiveTool = (options: {
  getMemory: () => Promise<any> | any;
  getStorage?: () => Promise<any> | any;
}) =>
  createTool({
    id: 'set_objective',
    title: 'Цель разговора',
    description:
      'Set, inspect, or clear a multi-step thread objective verified by the workspace goal judge.',
    inputSchema: setObjectiveInputSchema,
    requestContextSchema: capabilityContextSchema,
    execute: async (input, context: any) => {
      const identity = readCapabilityIdentity(context?.requestContext);
      if (!identity) {
        return refusal(
          'IDENTITY_MISSING',
          'The call arrived without a server-built identity; nothing was done.'
        );
      }
      if (identity.role === 'USER' && input.action !== 'get') {
        return refusal(
          'PERMISSION_DENIED',
          "The person's role or plan does not allow this action (Edit Posts). Say so; do not try another way around it."
        );
      }
      const threadId =
        context?.agent?.threadId ??
        context?.requestContext?.get?.(MASTRA_THREAD_ID_KEY);
      if (typeof threadId !== 'string' || !threadId) {
        return refusal(
          'CAPABILITY_INPUT_INVALID',
          'A thread id is required to manage a thread objective.'
        );
      }
      const memory = context?.memory ?? (await options.getMemory?.());
      const storage = await options.getStorage?.();
      const store = await resolveConductorGoalStore({
        mastra: context?.mastra,
        storage,
        memory,
      });
      if (!store) {
        return refusal(
          'CAPABILITY_INPUT_INVALID',
          'Thread state storage is unavailable for objective persistence.'
        );
      }
      const resourceId = conductorResourceId(
        identity.organizationId,
        identity.userId
      );
      if (typeof memory?.getThreadById === 'function') {
        const thread = await memory.getThreadById({ threadId });
        if (
          thread &&
          (thread as { resourceId?: string }).resourceId &&
          (thread as { resourceId?: string }).resourceId !== resourceId
        ) {
          return refusal(
            'PERMISSION_DENIED',
            'This conversation belongs to somebody else.'
          );
        }
      }
      if (input.action === 'get') {
        const current = await readObjective(store, threadId);
        return { ok: true, objective: normalizeObjectiveRecord(current as any) };
      }
      if (input.action === 'clear') {
        await clearObjective(store, threadId, context?.requestContext);
        return { ok: true, objective: null, cleared: true };
      }
      const text = typeof input.text === 'string' ? input.text.trim() : '';
      if (!text) {
        return refusal(
          'CAPABILITY_INPUT_INVALID',
          'An objective text is required when action is "set".'
        );
      }
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const objective = {
        id: `goal-${threadId}-${now}`,
        objective: text,
        text,
        status: 'active' as const,
        runsUsed: 0,
        activeDurationMs: 0,
        startedAt: now,
        updatedAt: now,
        createdAt: nowIso,
        maxRuns: input.maxRuns ?? 6,
      };
      await writeObjective(
        store,
        threadId,
        objective as any,
        context?.requestContext
      );
      return { ok: true, objective: normalizeObjectiveRecord(objective) };
    },
  });

const scheduleCreateInputSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(200)
    .describe('Short human-readable name of the recurring follow-up schedule.'),
  prompt: z
    .string()
    .min(1)
    .max(4000)
    .describe('The follow-up instruction to execute in this thread when the schedule triggers.'),
  cron: z
    .string()
    .min(5)
    .max(100)
    .describe('Standard 5-field cron expression, e.g. "0 9 * * 1" for Mondays at 09:00.'),
  timeZone: z
    .string()
    .max(80)
    .optional()
    .describe('Optional IANA timezone (e.g. "Europe/Moscow"). Defaults to the user timezone or Europe/Moscow.'),
});

const scheduleListInputSchema = z.object({
  allThreads: z
    .boolean()
    .optional()
    .describe('If true, lists all follow-up schedules of this user in the workspace; otherwise only the current thread.'),
});

const scheduleCancelInputSchema = z.object({
  scheduleId: z
    .string()
    .min(1)
    .max(120)
    .describe('The id of the follow-up schedule to cancel.'),
});

export const buildFollowUpScheduleTools = (options: {
  getSchedulesManager: () => Promise<any> | any;
}) => {
  const createFollowUp = createTool({
    id: 'schedule_followup_create',
    title: 'Запланировать регулярное поручение',
    description:
      'Create a recurring agent follow-up schedule bound to the current conversation thread (not a social post publication).',
    inputSchema: scheduleCreateInputSchema,
    requestContextSchema: capabilityContextSchema,
    execute: async (input, context: any) => {
      const identity = readCapabilityIdentity(context?.requestContext);
      if (!identity) {
        return refusal(
          'IDENTITY_MISSING',
          'The call arrived without a server-built identity; nothing was done.'
        );
      }
      if (identity.role === 'USER') {
        return refusal(
          'PERMISSION_DENIED',
          "The person's role or plan does not allow this action (Edit Posts). Say so; do not try another way around it."
        );
      }
      const threadId =
        context?.agent?.threadId ??
        context?.requestContext?.get?.(MASTRA_THREAD_ID_KEY);
      if (typeof threadId !== 'string' || !threadId) {
        return refusal(
          'CAPABILITY_INPUT_INVALID',
          'A thread id is required to create an agent follow-up schedule.'
        );
      }
      const schedules = await options.getSchedulesManager();
      if (!schedules) {
        return refusal(
          'CAPABILITY_INPUT_INVALID',
          'The schedule manager is not available.'
        );
      }
      const resourceId = conductorResourceId(
        identity.organizationId,
        identity.userId
      );
      const tzInfo = resolveFollowUpScheduleTimeZone(
        input.timeZone,
        identity.timeZone
      );
      const cron = input.cron.trim();
      const fields = cron.split(/\s+/);
      if (fields.length !== 5) {
        return refusal(
          'CAPABILITY_INPUT_INVALID',
          'The cron expression must be a standard 5-field cron string (minute hour day-of-month month day-of-week).'
        );
      }
      const definition = defineSchedule({
        name: input.title.trim(),
        cron,
        timezone: tzInfo.timeZone,
        prompt: input.prompt.trim(),
        threadId,
        resourceId,
        status: 'active',
        metadata: {
          kind: 'agent-followup',
          title: input.title.trim(),
          organizationId: identity.organizationId,
          organizationCreatedAt: identity.organizationCreatedAt,
          userId: identity.userId,
          role: identity.role,
          language: identity.language,
          timeZone: tzInfo.timeZone,
          timezoneAssumed: tzInfo.timezoneAssumed,
        },
      });

      const created = await schedules.create({
        ...definition,
        agentId: CONDUCTOR_AGENT_ID,
      });

      return {
        ok: true,
        schedule: {
          id: created.id,
          title: created.name ?? input.title.trim(),
          prompt: created.prompt ?? input.prompt.trim(),
          cron: created.cron ?? cron,
          timeZone: created.timezone ?? tzInfo.timeZone,
          timezoneAssumed: tzInfo.timezoneAssumed,
          ...(tzInfo.timezoneNote ? { timezoneNote: tzInfo.timezoneNote } : {}),
          threadId: created.threadId ?? threadId,
          resourceId: created.resourceId ?? resourceId,
          enabled: created.status === 'active',
          nextRunAt:
            typeof created.nextFireAt === 'number'
              ? new Date(created.nextFireAt).toISOString()
              : null,
        },
      };
    },
  });

  const listFollowUps = createTool({
    id: 'schedule_followup_list',
    title: 'Список регулярных поручений',
    description:
      'List recurring agent follow-up schedules for this conversation or user.',
    inputSchema: scheduleListInputSchema,
    requestContextSchema: capabilityContextSchema,
    execute: async (input, context: any) => {
      const identity = readCapabilityIdentity(context?.requestContext);
      if (!identity) {
        return refusal(
          'IDENTITY_MISSING',
          'The call arrived without a server-built identity; nothing was done.'
        );
      }
      const schedules = await options.getSchedulesManager();
      if (!schedules) {
        return { ok: true, schedules: [] };
      }
      const resourceId = conductorResourceId(
        identity.organizationId,
        identity.userId
      );
      const threadId =
        context?.agent?.threadId ??
        context?.requestContext?.get?.(MASTRA_THREAD_ID_KEY);
      const filterThreadId = input?.allThreads ? undefined : threadId;
      const result = await schedules.list({
        agentId: CONDUCTOR_AGENT_ID,
        resourceId,
        ...(typeof filterThreadId === 'string' && filterThreadId
          ? { threadId: filterThreadId }
          : {}),
      });
      const list = Array.isArray(result)
        ? result
        : Array.isArray(result?.schedules)
        ? result.schedules
        : [];
      const rows = list.filter(
        (item: any) =>
          item?.agentId === CONDUCTOR_AGENT_ID &&
          item?.resourceId === resourceId &&
          (!filterThreadId || item?.threadId === filterThreadId)
      );
      return {
        ok: true,
        schedules: rows.map((item: any) => ({
          id: item.id,
          title: item.name ?? item.metadata?.title ?? '',
          prompt: item.prompt ?? '',
          cron: item.cron ?? '',
          timeZone: item.timezone ?? item.metadata?.timeZone ?? 'Europe/Moscow',
          timezoneAssumed: Boolean(item.metadata?.timezoneAssumed),
          threadId: item.threadId ?? null,
          resourceId: item.resourceId ?? resourceId,
          enabled: item.status === 'active',
          nextRunAt:
            typeof item.nextFireAt === 'number'
              ? new Date(item.nextFireAt).toISOString()
              : null,
        })),
      };
    },
  });

  const cancelFollowUp = createTool({
    id: 'schedule_followup_cancel',
    title: 'Отменить регулярное поручение',
    description:
      'Cancel and delete a recurring agent follow-up schedule owned by the caller.',
    inputSchema: scheduleCancelInputSchema,
    requestContextSchema: capabilityContextSchema,
    execute: async (input, context: any) => {
      const identity = readCapabilityIdentity(context?.requestContext);
      if (!identity) {
        return refusal(
          'IDENTITY_MISSING',
          'The call arrived without a server-built identity; nothing was done.'
        );
      }
      if (identity.role === 'USER') {
        return refusal(
          'PERMISSION_DENIED',
          "The person's role or plan does not allow this action (Edit Posts). Say so; do not try another way around it."
        );
      }
      const schedules = await options.getSchedulesManager();
      if (!schedules) {
        return refusal(
          'CAPABILITY_INPUT_INVALID',
          'The schedule manager is not available.'
        );
      }
      const resourceId = conductorResourceId(
        identity.organizationId,
        identity.userId
      );
      const existing = await schedules.get(input.scheduleId);
      if (!existing) {
        return refusal(
          'CAPABILITY_INPUT_INVALID',
          'The requested follow-up schedule does not exist.'
        );
      }
      if (
        existing.agentId !== CONDUCTOR_AGENT_ID ||
        existing.resourceId !== resourceId
      ) {
        return refusal(
          'PERMISSION_DENIED',
          'This follow-up schedule belongs to somebody else.'
        );
      }
      await schedules.delete(input.scheduleId);
      return {
        ok: true,
        cancelled: true,
        scheduleId: input.scheduleId,
      };
    },
  });

  return {
    schedule_followup_create: createFollowUp,
    schedule_followup_list: listFollowUps,
    schedule_followup_cancel: cancelFollowUp,
  };
};

/**
 * Builds the `subagent` tool (`on0i.4`, `A18`), enforcing:
 * - `forked: true` is always refused (`PERMISSION_DENIED`) so a subagent never
 *   clones a thread or runs parent tools with `requireToolApproval: false`;
 * - `USER` role may only invoke `research`;
 * - specialist models resolve through the workspace's metered AI role chain.
 */
export const buildConductorSubagentTool = (options: {
  subagents: ConductorSubagentDefinition[];
  resolveSubagentModel: (
    identity: CapabilityIdentity,
    agentType: ConductorSubagentType,
    requestContext?: object
  ) => Promise<unknown>;
  createSubagentRunner: (config: Record<string, unknown>) => any;
}) =>
  createTool({
    id: 'subagent',
    title: 'Поручить специалисту',
    description:
      'Delegate a bounded subtask to one of the workspace specialists: research (read/search), writing (drafting/adaptation), or review (fact/slop checks). Forked execution is disabled.',
    inputSchema: z.object({
      agentType: z
        .enum(['research', 'writing', 'review'])
        .describe('Which bounded specialist to run: research, writing, or review.'),
      task: z
        .string()
        .min(1)
        .max(8000)
        .optional()
        .describe('Self-contained task instructions and context for the specialist.'),
      prompt: z
        .string()
        .min(1)
        .max(8000)
        .optional()
        .describe('Alias for task instructions.'),
      forked: z
        .boolean()
        .optional()
        .describe('Must not be true; forked subagent execution is disabled.'),
      modelId: z
        .string()
        .optional()
        .describe('Optional model ID override; defaults to the workspace role model for the specialist.'),
    }),
    requestContextSchema: capabilityContextSchema,
    execute: async (input, context: any) => {
      const identity = readCapabilityIdentity(context?.requestContext);
      if (!identity) {
        return refusal(
          'IDENTITY_MISSING',
          'The call arrived without a server-built identity; nothing was done.'
        );
      }
      if (input.forked === true) {
        return refusal(
          'PERMISSION_DENIED',
          'Forked subagent execution is disabled: subagents must use a bounded specialist definition and never bypass parent tool approvals.'
        );
      }
      const agentType = input.agentType as ConductorSubagentType;
      if (identity.role === 'USER' && agentType !== 'research') {
        return refusal(
          'PERMISSION_DENIED',
          "The person's role or plan does not allow this action (Edit Posts). Say so; do not try another way around it."
        );
      }
      const taskText = (input.task ?? input.prompt ?? '').trim();
      if (!taskText) {
        return refusal(
          'CAPABILITY_INPUT_INVALID',
          'A non-empty task description is required for subagent delegation.'
        );
      }
      const definition = options.subagents.find(
        (s) => s.id === agentType
      );
      if (!definition) {
        return refusal(
          'CAPABILITY_INPUT_INVALID',
          `Unknown subagent specialist: ${agentType}.`
        );
      }
      const resolvedModel = await options.resolveSubagentModel(
        identity,
        agentType,
        context?.requestContext as object | undefined
      );
      const controllerCtx = context?.requestContext?.get?.('controller') as
        | {
            emitEvent?: (ev: Record<string, unknown>) => void;
            abortSignal?: AbortSignal;
          }
        | undefined;
      const emitEvent = controllerCtx?.emitEvent;
      const abortSignal =
        controllerCtx?.abortSignal ?? context?.agent?.abortSignal;
      const toolCallId = context?.agent?.toolCallId ?? `subagent-${Date.now()}`;
      const subagentRequestContext = context?.requestContext?.entries
        ? (new RequestContext(context.requestContext.entries()) as any)
        : undefined;
      subagentRequestContext?.delete(MASTRA_THREAD_ID_KEY);
      if (controllerCtx && subagentRequestContext) {
        subagentRequestContext.set('controller', {
          ...controllerCtx,
          threadId: null,
          resourceId: '',
        });
      }

      const subagentToRun = options.createSubagentRunner({
        id: `subagent-${definition.id}`,
        name: `${definition.name} Subagent`,
        instructions: definition.instructions,
        model: resolvedModel as any,
        tools: (definition.tools ?? {}) as any,
        ...(context?.mastra ? { mastra: context.mastra } : {}),
      });

      const resolvedModelId =
        input.modelId ??
        definition.defaultModelId ??
        CONDUCTOR_SUBAGENT_ROLE_MAP[agentType];
      const startTime = Date.now();
      emitEvent?.({
        type: 'subagent_start',
        toolCallId,
        agentType,
        task: taskText,
        modelId: resolvedModelId,
        forked: false,
      });

      let partialText = '';
      try {
        const response = await subagentToRun.stream(taskText, {
          maxSteps: definition.maxSteps ?? 8,
          ...(abortSignal ? { abortSignal } : {}),
          requireToolApproval: false,
          ...(subagentRequestContext
            ? { requestContext: subagentRequestContext as any }
            : {}),
        });
        for await (const chunk of response.fullStream) {
          switch (chunk.type) {
            case 'text-delta':
              partialText += chunk.payload.text;
              emitEvent?.({
                type: 'subagent_text_delta',
                toolCallId,
                agentType: input.agentType,
                textDelta: chunk.payload.text,
              });
              break;
            case 'tool-call':
              emitEvent?.({
                type: 'subagent_tool_start',
                toolCallId,
                agentType: input.agentType,
                subToolName: chunk.payload.toolName,
                subToolArgs: chunk.payload.args,
              });
              break;
            case 'tool-result':
              emitEvent?.({
                type: 'subagent_tool_end',
                toolCallId,
                agentType: input.agentType,
                subToolName: chunk.payload.toolName,
                subToolResult: chunk.payload.result,
                isError: chunk.payload.isError ?? false,
              });
              break;
          }
        }
        const fullOutput = await response.getFullOutput();
        const resultText = fullOutput.text || partialText;
        const durationMs = Date.now() - startTime;
        emitEvent?.({
          type: 'subagent_end',
          toolCallId,
          agentType: input.agentType,
          result: resultText,
          isError: false,
          durationMs,
        });
        return {
          ok: true,
          agentType: input.agentType,
          content: resultText,
          isError: false,
        };
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const message = err instanceof Error ? err.message : String(err);
        emitEvent?.({
          type: 'subagent_end',
          toolCallId,
          agentType: input.agentType,
          result: message,
          isError: true,
          durationMs,
        });
        return {
          ok: false,
          agentType: input.agentType,
          content: message,
          isError: true,
        };
      }
    },
  });

export const buildConductorSubmitPlanTool = () => {
  const tool = createTool({
    id: 'submit_plan',
    title: 'Согласовать план',
    description:
      'Submit an implementation or content plan for user review and approval before executing the steps.',
    inputSchema: z.object({
      title: z
        .string()
        .max(200)
        .optional()
        .describe('Short title of the proposed plan.'),
      plan: z
        .string()
        .max(12_000)
        .optional()
        .describe('Markdown body of the proposed plan.'),
      path: z
        .string()
        .max(500)
        .optional()
        .describe('Optional logical or file path of the plan.'),
    }),
    suspendSchema: z.object({
      toolId: z.literal('submit_plan').optional(),
      path: z.string(),
      title: z.string().optional(),
      plan: z.string().optional(),
    }),
    resumeSchema: z.object({
      action: z.enum(['approved', 'rejected']),
      feedback: z.string().optional(),
      path: z.string().optional(),
      title: z.string().optional(),
      plan: z.string().optional(),
    }),
    execute: async (input, context: any) => {
      const resolvedPath =
        typeof input.path === 'string' && input.path.trim()
          ? input.path.trim()
          : 'workspace://plan.md';
      if (context?.agent?.resumeData !== undefined) {
        return (submitPlanTool as any).execute(
          { path: resolvedPath },
          context
        );
      }
      const suspend = context?.agent?.suspend;
      if (suspend) {
        await suspend({
          toolId: 'submit_plan' as const,
          path: resolvedPath,
          ...(typeof input.title === 'string' && input.title.trim()
            ? { title: input.title.trim() }
            : {}),
          ...(typeof input.plan === 'string' && input.plan.trim()
            ? { plan: input.plan.trim() }
            : {}),
        });
        return;
      }
      return (submitPlanTool as any).execute({ path: resolvedPath }, context);
    },
  });
  (tool as any).transform = {
    display: createSuspendCardTransform('submit_plan'),
    transcript: createSuspendCardTransform('submit_plan'),
  };
  return tool;
};

/**
 * Returns the native autonomy tool map for `buildConductorAgent`.
 * When `hasControllerToolset` is true (`AgentController` session execution),
 * omits the built-in tools already injected in `toolsets.controllerBuiltIn`
 * so every tool is registered once (`on0i.4`, `A18`).
 */
export const buildConductorAutonomyTools = (options: {
  subagents: ConductorSubagentDefinition[];
  getMemory: () => Promise<any> | any;
  getStorage?: () => Promise<any> | any;
  getSchedulesManager: () => Promise<any> | any;
  resolveSubagentModel: (
    identity: CapabilityIdentity,
    agentType: ConductorSubagentType,
    requestContext?: object
  ) => Promise<unknown>;
  createSubagentRunner?: (config: Record<string, unknown>) => any;
}) => {
  const setObjective = buildSetObjectiveTool({
    getMemory: options.getMemory,
    getStorage: options.getStorage,
  });
  const followUpSchedules = buildFollowUpScheduleTools({
    getSchedulesManager: options.getSchedulesManager,
  });
  const subagent = buildConductorSubagentTool({
    subagents: options.subagents,
    resolveSubagentModel: options.resolveSubagentModel,
    createSubagentRunner:
      options.createSubagentRunner ??
      (() => {
        throw new Error('Subagent runner factory is not configured.');
      }),
  });
  const submitPlan = buildConductorSubmitPlanTool();

  const builtInMap: Record<string, any> = {
    ask_user: askUserTool,
    task_write: taskWriteTool,
    task_update: taskUpdateTool,
    task_complete: taskCompleteTool,
    task_check: taskCheckTool,
  };

  const extraMap: Record<string, any> = {
    submit_plan: submitPlan,
    subagent,
    set_objective: setObjective,
    ...followUpSchedules,
  };

  return (args: {
    identity: CapabilityIdentity;
    hasControllerToolset: boolean;
  }): Record<string, any> => {
    if (!isOrganizationEditor(args.identity.role)) {
      return {};
    }
    if (args.hasControllerToolset) {
      return extraMap;
    }
    return {
      ...builtInMap,
      ...extraMap,
    };
  };
};
