import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { MastraDBMessage } from '@mastra/core/memory';
import { toAISdkMessages } from '@mastra/ai-sdk/ui';
import { MastraService } from '@contentfactory/nestjs-libraries/chat/mastra.service';
import type {
  AgentPendingRunV1,
  AgentThreadHistoryV1,
  AgentThreadListV1,
  AgentThreadV1,
  AgentWorkContextV1,
  AgentWorkspaceV1,
} from '../capabilities/agent-parts.contract';
import type { CapabilityIdentity } from '../capabilities/capability.types';
import { questionCardId, questionCardView } from '../capabilities/question-card';
import { claimUnavailable, notPending, notYours, type PendingRun } from './agent-chat.request';
import { AGENT_STREAM_VERSION } from '../capabilities/agent-parts.contract';
import {
  clearObjective,
  readObjective,
  resolveGoalStore,
  writeObjective,
} from '@mastra/core/tools';
import { defineSchedule } from '@mastra/core/schedules';
import { CONDUCTOR_AGENT_ID, conductorResourceId } from './conductor.context';
import { threadTitleFromMessage } from './conductor.memory';
import {
  AGENT_WORKSPACE_METADATA_KEY,
  AGENT_WORK_ARTIFACTS_MAX,
  AgentWorkContextError,
  artifactForWorkContext,
  emptyAgentWorkspace,
  invalidWorkContext,
  parseAgentWorkspacePatch,
  readStoredAgentWorkspace,
  sameAgentArtifact,
  type ResolvedAgentWorkContext,
} from './work-context';
import {
  AGENT_RUN_CLAIM_RENEW_INTERVAL_MS,
  AGENT_RUN_CLAIM_STORE,
  AgentRunClaimUnavailable,
  boundedRunClaimStore,
  agentCallAnswered,
  approvalContentShown,
  claimAgentRun,
  inProcessRunClaimStore,
  markAgentCallsAnswered,
  rememberApprovalContent,
  type AgentRunClaimStore,
  type AnsweredCall,
} from './agent-run-claims';
import {
  AGENT_EXECUTION_METADATA_KEY,
  AgentTurnLifecycle,
  readAgentThreadExecution,
  writeAgentThreadExecution,
} from './agent-turn-lifecycle';
import { redactSecretShapes } from './secret-shapes';

const redactObservabilityValue = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') return redactSecretShapes(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactObservabilityValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        redactObservabilityValue(item, depth + 1),
      ])
    );
  }
  return value;
};

const isNamedIanaTimeZone = (tz: string | undefined): tz is string => {
  if (!tz || typeof tz !== 'string') return false;
  const trimmed = tz.trim();
  if (
    !trimmed ||
    trimmed.toUpperCase() === 'UTC' ||
    /^[+-]\d{2}:\d{2}$/.test(trimmed)
  ) {
    return false;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
};

const resolveFollowUpScheduleTimeZone = (
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

const resolveConductorGoalStore = async (sources: {
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

const normalizeObjectiveRecord = (
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

export type ActiveThreadTurnHandle = {
  requestId: string;
  threadId: string;
  resourceId: string;
  emitPart: (part: unknown) => void;
  finishStream: () => void;
  subscribe: (
    listener: (event: { part?: unknown; done?: boolean }) => void
  ) => () => void;
  stop: () => Promise<void>;
};

const isDurableConductorLike = (agent: unknown): boolean =>
  Boolean(
    agent &&
      typeof agent === 'object' &&
      'runRegistry' in agent &&
      typeof (agent as { recover?: unknown }).recover === 'function' &&
      typeof (agent as { observe?: unknown }).observe === 'function'
  );

/**
 * Personal threads (`content-factory-next-kcxz.8`, spec §1.6, §4.7; premortem
 * S4, S7). Every read and write goes through one owner check: the thread's
 * resource must be `{orgId}:{userId}` of the caller. Threads of the old screen,
 * written under the organization alone, are never listed and never opened.
 *
 * Nothing here runs a model or opens an admission (premortem U4): listing,
 * history and the pending cards are free.
 */

/** Bounded native pages; older records remain available on demand. */
export const AGENT_THREADS_PAGE = 100;
/** The history a reload hydrates; older messages stay in storage. */
export const AGENT_HISTORY_MESSAGES = 200;

export type AgentPageOptions = { page?: number; perPage?: number };
export type AgentPagination = { page: number; perPage: number; total: number; hasMore: boolean };

const pageOptions = (options: AgentPageOptions, maximum: number) => {
  const page = options.page ?? 0;
  const perPage = options.perPage ?? maximum;
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > maximum) {
    throw new BadRequestException({ code: 'AGENT_INVALID_PAGE', message: 'Invalid conversation page.' });
  }
  return { page, perPage };
};
const pageView = (result: Partial<AgentPagination>, options: Required<AgentPageOptions>, count: number): AgentPagination => ({
  ...options, total: result.total ?? count, hasMore: result.hasMore ?? false,
});

type ThreadRow = {
  id: string;
  title?: string;
  resourceId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  metadata?: Record<string, unknown>;
};

type ConductorMemory = {
  getThreadById(args: { threadId: string }): Promise<ThreadRow | null>;
  listThreads(args: Record<string, unknown>): Promise<{ threads: ThreadRow[] } & Partial<AgentPagination>>;
  createThread(args: {
    threadId: string;
    resourceId: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ThreadRow>;
  updateThread(args: {
    id: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ThreadRow>;
  deleteThread(threadId: string): Promise<void>;
  recall(args: Record<string, unknown>): Promise<{ messages: MastraDBMessage[] } & Partial<AgentPagination>>;
};

type ConductorLike = {
  getMemory(): Promise<unknown>;
  listSuspendedRuns(args: {
    threadId?: string;
    resourceId?: string;
  }): Promise<{ runs: PendingRun[] }>;
};

const iso = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export const threadView = (row: ThreadRow): AgentThreadV1 => ({
  id: row.id,
  title: row.title || '',
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

/**
 * What still waits, as the screen redraws it. An approval carries its
 * summary — what and where — built from the stored arguments, so a reloaded
 * card says the same as the live one (correctness review W1 F1). A question
 * carries its card as the live part showed it: with its id, without what only
 * the server reads back (review W2 F3, F9).
 */
export const pendingView = async (
  runs: readonly PendingRun[],
  describe: (toolName: string | undefined, args: unknown) => Promise<string | null>
): Promise<AgentPendingRunV1[]> =>
  Promise.all(
    runs.flatMap((run) =>
      run.toolCalls.map(async (call) => ({
        runId: run.runId,
        toolCallId: call.toolCallId ?? null,
        toolName: call.toolName ?? null,
        kind: call.requiresApproval ? ('approval' as const) : ('question' as const),
        ...(call.requiresApproval
          ? {
              args: call.args ?? {},
              summary: await describe(call.toolName, call.args ?? {}),
            }
          : {
              suspendPayload: questionCardView(
                call.suspendPayload ?? null,
                call.toolName
              ),
            }),
      }))
    )
  );

/** A claim store that did not answer is the door's `AGENT_FAILED` (503). */
const refusedWhenUnavailable = (error: unknown): never => {
  if (error instanceof AgentRunClaimUnavailable) throw claimUnavailable();
  throw error;
};

/** Where Mastra keeps an agent run's snapshot (`Agent.listSuspendedRuns`). */
const AGENT_RUN_WORKFLOWS = ['agentic-loop', 'durable-agentic-loop'] as const;

@Injectable()
export class AgentThreadsService {
  private readonly claims: AgentRunClaimStore;
  private readonly workspaceWrites = new Map<string, Promise<void>>();
  private readonly activeTurns = new Map<string, ActiveThreadTurnHandle>();

  constructor(
    private readonly mastraService: MastraService,
    @Optional()
    @Inject(AGENT_RUN_CLAIM_STORE)
    claims?: AgentRunClaimStore
  ) {
    // Every command bounded: Redis down refuses, it never hangs (kcxz.47).
    this.claims = boundedRunClaimStore(claims ?? inProcessRunClaimStore());
  }

  async isDurableConductor(): Promise<boolean> {
    try {
      const conductor = await this.conductor();
      return isDurableConductorLike(conductor);
    } catch {
      return false;
    }
  }

  registerActiveTurn(args: {
    identity: CapabilityIdentity;
    threadId: string;
    requestId: string;
    onStop: () => void | Promise<void>;
  }): ActiveThreadTurnHandle {
    const resourceId = conductorResourceId(
      args.identity.organizationId,
      args.identity.userId
    );
    const key = `${resourceId}:${args.threadId}`;
    const bufferedParts: unknown[] = [];
    const listeners = new Set<(event: { part?: unknown; done?: boolean }) => void>();
    let finished = false;
    const handle: ActiveThreadTurnHandle = {
      requestId: args.requestId,
      threadId: args.threadId,
      resourceId,
      emitPart: (part) => {
        if (finished) return;
        bufferedParts.push(part);
        for (const listener of listeners) {
          listener({ part });
        }
      },
      finishStream: () => {
        if (finished) return;
        finished = true;
        if (this.activeTurns.get(key) === handle) {
          this.activeTurns.delete(key);
        }
        for (const listener of listeners) {
          listener({ done: true });
        }
        listeners.clear();
      },
      subscribe: (listener) => {
        for (const part of bufferedParts) {
          listener({ part });
        }
        if (finished) {
          listener({ done: true });
          return () => undefined;
        }
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      stop: async () => {
        await args.onStop();
      },
    };
    this.activeTurns.set(key, handle);
    return handle;
  }

  async activeTurnFor(identity: CapabilityIdentity, threadId: string) {
    await this.requireOwnThread(identity, threadId);
    const resourceId = conductorResourceId(
      identity.organizationId,
      identity.userId
    );
    return this.activeTurns.get(`${resourceId}:${threadId}`) ?? null;
  }

  /**
   * Explicitly stops an in-flight turn on the caller's thread (`on0i.3`, `A13`).
   */
  async stopTurn(identity: CapabilityIdentity, threadId: string) {
    await this.requireOwnThread(identity, threadId);
    const resourceId = conductorResourceId(
      identity.organizationId,
      identity.userId
    );
    const key = `${resourceId}:${threadId}`;
    const active = this.activeTurns.get(key);
    if (active) {
      await active.stop();
    }
    const conductor = (await this.conductor().catch(() => null)) as
      | (ConductorLike & {
          abortThreadStream?: (opts: {
            resourceId: string;
            threadId: string;
            clearPendingSignals?: boolean;
          }) => boolean;
        })
      | null;
    const abortedNative =
      conductor?.abortThreadStream?.({
        resourceId,
        threadId,
        clearPendingSignals: true,
      }) ?? false;
    const session = await this.sessionFor(identity, threadId).catch((): undefined => undefined);
    try {
      await session?.abort?.();
    } catch {
      // Best-effort session abort.
    }
    return {
      stopped: Boolean(active || abortedNative),
      threadId,
      requestId: active?.requestId ?? null,
    };
  }

  /**
   * Claims a suspended run for one answer (correctness review W1 F5): the
   * release function, or `null` while another request answers it.
   */
  async claimRun(
    runId: string,
    options?: { renewIntervalMs?: number; ttlSeconds?: number }
  ) {
    try {
      return await claimAgentRun(this.claims, runId, options);
    } catch (error) {
      return refusedWhenUnavailable(error);
    }
  }

  /** One web turn per private thread, including work left running by Stop. */
  async claimThreadTurn(identity: CapabilityIdentity, threadId: string) {
    await this.ownThread(identity, threadId);
    const resourceId = conductorResourceId(identity.organizationId, identity.userId);
    const release = await this.claimRun(`thread:${resourceId}:${threadId}`, {
      renewIntervalMs: AGENT_RUN_CLAIM_RENEW_INTERVAL_MS,
    });
    if (!release) throw notPending();
    try {
      const thread = await this.ownThread(identity, threadId);
      const execution = await readAgentThreadExecution(this.claims, thread?.metadata).catch(refusedWhenUnavailable);
      // An expired claim is no evidence that its service Promise settled.
      if (execution && execution.state !== 'settled') throw notPending();
      return release;
    } catch (error) {
      await release();
      throw error;
    }
  }

  /** The marker is a native partial metadata patch, never a working-memory replay. */
  async startTurn(
    identity: CapabilityIdentity,
    threadId: string,
    requestId: string,
    releaseThread: () => Promise<void>
  ) {
    await this.requireOwnThread(identity, threadId);
    await writeAgentThreadExecution(this.claims, { requestId, state: 'running' }).catch(refusedWhenUnavailable);
    await this.writeWorkspace(threadId, async () => {
      await this.requireOwnThread(identity, threadId);
      await (await this.memory()).updateThread({
        id: threadId,
        metadata: { [AGENT_EXECUTION_METADATA_KEY]: { requestId, state: 'running' } },
      });
    });
    return new AgentTurnLifecycle(requestId, async (outcome) => {
      // Release before publishing the terminal receipt, after all real work
      // settled. Otherwise an old expired lease could delete a new turn's
      // claim after it observed our terminal receipt and acquired the key.
      await releaseThread();
      await this.writeWorkspace(threadId, async () => {
        const thread = await this.requireOwnThread(identity, threadId);
        const marker = thread.metadata?.[AGENT_EXECUTION_METADATA_KEY] as { requestId?: unknown } | undefined;
        if (marker?.requestId !== requestId) return;
        await (await this.memory()).updateThread({
          id: threadId,
          metadata: { [AGENT_EXECUTION_METADATA_KEY]: { requestId, state: 'settled', outcome } },
        });
      });
      await writeAgentThreadExecution(this.claims, { requestId, state: 'settled', outcome }).catch(refusedWhenUnavailable);
    });
  }

  /**
   * The answer on these calls reached a stream: they are never answered
   * again, even if the run still reads as suspended (kcxz.29, D2). A question
   * is marked by the card the answer named and the door verified (review W2
   * F3, F7), so a later card of the same call stays answerable; an approval,
   * for the whole call.
   */
  markAnswered(runId: string, calls: readonly AnsweredCall[]) {
    return markAgentCallsAnswered(this.claims, runId, calls);
  }

  /**
   * An approval card was drawn (live or on a reload): what it sends out is
   * remembered as it was then — the first drawing wins (review W2 F4).
   */
  async approvalCardShown(
    identity: CapabilityIdentity,
    runId: string,
    toolCallId: string,
    toolName: string | null | undefined,
    args: unknown
  ) {
    const digest = await this.mastraService.approvalContent?.(identity, toolName, args);
    if (digest) await rememberApprovalContent(this.claims, runId, toolCallId, digest);
  }

  /** What the approval card sent out when it was first drawn, if remembered. */
  approvalContentShown(runId: string, toolCallId: string) {
    return approvalContentShown(this.claims, runId, toolCallId);
  }

  /** What a stored `confirm` call would send out now, as a digest. */
  approvalContentNow(
    identity: CapabilityIdentity,
    toolName: string | null | undefined,
    args: unknown
  ): Promise<string | null> {
    return this.mastraService.approvalContent?.(identity, toolName, args) ?? Promise.resolve(null);
  }

  /** The approval card's «what and where» for a stored call. */
  describeApproval(
    identity: CapabilityIdentity,
    toolName: string | null | undefined,
    args: unknown
  ): Promise<string | null> {
    return this.mastraService.describeApproval(identity, toolName, args);
  }

  private async conductor(): Promise<ConductorLike> {
    return (await this.mastraService.conductor()) as unknown as ConductorLike;
  }

  private async memory(): Promise<ConductorMemory> {
    const memory = await (await this.conductor()).getMemory();
    if (!memory) throw new Error('The conductor has no memory.');
    return memory as ConductorMemory;
  }

  /**
   * The thread when it is the caller's; `null` when it does not exist;
   * `AGENT_NOT_YOURS` when it belongs to anybody else — another member, or the
   * organization itself (a thread of the old screen).
   */
  async ownThread(
    identity: CapabilityIdentity,
    threadId: string
  ): Promise<ThreadRow | null> {
    const thread = await (await this.memory()).getThreadById({ threadId });
    if (!thread) return null;
    if (
      thread.metadata?.forkedSubagent === true ||
      thread.metadata?.goalJudge === true
    ) {
      return null;
    }
    if (
      thread.resourceId !==
      conductorResourceId(identity.organizationId, identity.userId)
    ) {
      throw notYours();
    }
    return thread;
  }

  private async requireOwnThread(identity: CapabilityIdentity, threadId: string) {
    const thread = await this.ownThread(identity, threadId);
    if (!thread) {
      throw new NotFoundException({
        code: 'AGENT_THREAD_NOT_FOUND',
        message: 'There is no such conversation.',
      });
    }
    return thread;
  }

  /** A selected shared object never substitutes for this person's thread check. */
  async workContextForTurn(
    identity: CapabilityIdentity,
    threadId: string,
    selected?: AgentWorkContextV1 | null
  ): Promise<ResolvedAgentWorkContext | null> {
    const thread = await this.ownThread(identity, threadId);
    const context = selected === undefined ? readStoredAgentWorkspace(thread?.metadata).workContext : selected;
    if (!context) return null;
    return this.mastraService.resolveWorkContext(identity, context, { refresh: selected === undefined });
  }

  private async availableWorkspace(identity: CapabilityIdentity, workspace: AgentWorkspaceV1): Promise<AgentWorkspaceV1> {
    const artifacts: AgentWorkspaceV1['artifacts'] = [];
    for (const ref of workspace.artifacts) {
      try {
        artifacts.push(await this.mastraService.validateWorkArtifact(identity, ref));
      } catch (error) {
        if (!(error instanceof AgentWorkContextError) || ![403, 404, 409].includes(error.getStatus())) throw error;
      }
    }
    let workContext: AgentWorkContextV1 | null = null;
    if (workspace.workContext) {
      try {
        workContext = (await this.mastraService.resolveWorkContext(identity, workspace.workContext, { refresh: true })).context;
      } catch (error) {
        if (!(error instanceof AgentWorkContextError) || ![403, 404, 409].includes(error.getStatus())) throw error;
      }
    }
    return {
      ...workspace,
      workContext,
      artifacts,
      activeArtifact: workspace.activeArtifact ? artifacts.find((ref) => sameAgentArtifact(ref, workspace.activeArtifact!)) ?? null : null,
    };
  }

  /** Serializes our read/merge/write pairs without locking a model stream. */
  private async writeWorkspace<T>(threadId: string, write: () => Promise<T>): Promise<T> {
    const previous = this.workspaceWrites.get(threadId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.workspaceWrites.set(threadId, current);
    await previous;
    try { return await write(); }
    finally {
      release();
      if (this.workspaceWrites.get(threadId) === current) this.workspaceWrites.delete(threadId);
    }
  }

  /** Called only after admission, with server-resolved context; no domain write. */
  async rememberWorkContext(identity: CapabilityIdentity, threadId: string, resolved: ResolvedAgentWorkContext | null) {
    return this.writeWorkspace(threadId, async () => {
      const thread = await this.requireOwnThread(identity, threadId);
      const workspace = readStoredAgentWorkspace(thread.metadata);
      workspace.workContext = resolved?.context ?? null;
      const ref = resolved ? artifactForWorkContext(resolved.context) : null;
      if (ref) {
        workspace.artifacts = [...workspace.artifacts.filter((one) => !sameAgentArtifact(one, ref)), ref].slice(-AGENT_WORK_ARTIFACTS_MAX);
        workspace.activeArtifact = ref;
      }
      await (await this.memory()).updateThread({
        id: thread.id,
        // Native patchThread merges metadata. Replaying legacy workingMemory
        // here is a command to overwrite the person's newer resource memory.
        metadata: { [AGENT_WORKSPACE_METADATA_KEY]: workspace },
      });
      return workspace;
    });
  }

  /** Free PATCH: validates every supplied reference, merging metadata on its owned row. */
  async patchWorkspace(identity: CapabilityIdentity, threadId: string, body: unknown): Promise<{ workspace: AgentWorkspaceV1 }> {
    // Ownership is checked before looking up any selected product object.
    await this.requireOwnThread(identity, threadId);
    const patch = parseAgentWorkspacePatch(body);
    return this.writeWorkspace(threadId, async () => {
      const thread = await this.requireOwnThread(identity, threadId);
      const workspace = await this.availableWorkspace(identity, readStoredAgentWorkspace(thread.metadata));
      if (patch.workContext !== undefined) workspace.workContext = patch.workContext === null ? null : (await this.mastraService.resolveWorkContext(identity, patch.workContext)).context;
      if (patch.artifacts !== undefined) {
        workspace.artifacts = [];
        for (const ref of patch.artifacts) {
          const valid = await this.mastraService.validateWorkArtifact(identity, ref);
          if (!workspace.artifacts.some((one) => sameAgentArtifact(one, valid))) workspace.artifacts.push(valid);
        }
      }
      if (patch.activeArtifact !== undefined) {
        workspace.activeArtifact = patch.activeArtifact === null ? null : await this.mastraService.validateWorkArtifact(identity, patch.activeArtifact);
      }
      if (workspace.activeArtifact && !workspace.artifacts.some((ref) => sameAgentArtifact(ref, workspace.activeArtifact!))) {
        if (patch.activeArtifact) throw invalidWorkContext();
        workspace.activeArtifact = null;
      }
      // Re-check ownership after reads, then patch only our namespaced field.
      // Native metadata merging preserves unrelated keys without reissuing
      // Mastra's workingMemory command or a stale title.
      const latest = await this.requireOwnThread(identity, threadId);
      await (await this.memory()).updateThread({
        id: latest.id,
        metadata: { [AGENT_WORKSPACE_METADATA_KEY]: workspace },
      });
      return { workspace };
    });
  }

  /**
   * Resolves the isolated native `Session` for `(organizationId:userId, threadId)`
   * when `MastraService` provides an `AgentController` (`on0i.1`).
   */
  async sessionFor(
    identity: CapabilityIdentity,
    threadId: string,
    options?: { bindThread?: boolean; requestContext?: any }
  ) {
    return this.mastraService.sessionFor?.(identity, threadId, options);
  }

  /**
   * The thread a message is written to: the caller's own, or a new one named
   * after the message. Created before the turn so the first write can never
   * land in a thread somebody else created with the same id.
   */
  async threadForMessage(
    identity: CapabilityIdentity,
    threadId: string,
    text: string,
    selected?: ResolvedAgentWorkContext | null
  ): Promise<ThreadRow> {
    const existing = await this.ownThread(identity, threadId);
    if (existing) {
      await this.sessionFor(identity, threadId, { bindThread: true }).catch(() => undefined);
      return existing;
    }
    const ref = selected ? artifactForWorkContext(selected.context) : null;
    const workspace = selected === undefined ? undefined : {
      ...emptyAgentWorkspace(),
      workContext: selected?.context ?? null,
      artifacts: ref ? [ref] : [],
      activeArtifact: ref,
    };
    const created = await (await this.memory()).createThread({
      threadId,
      resourceId: conductorResourceId(identity.organizationId, identity.userId),
      title: threadTitleFromMessage(text, identity.language),
      ...(workspace ? { metadata: { [AGENT_WORKSPACE_METADATA_KEY]: workspace } } : {}),
    });
    await this.sessionFor(identity, threadId, { bindThread: true }).catch(() => undefined);
    return created;
  }

  /** The thread an answer on a card continues: it must exist and be the caller's. */
  async threadForAnswer(identity: CapabilityIdentity, threadId: string) {
    const thread = await this.ownThread(identity, threadId);
    if (!thread) throw notYours();
    await this.sessionFor(identity, threadId, { bindThread: true }).catch(() => undefined);
    return thread;
  }

  async list(identity: CapabilityIdentity, options: AgentPageOptions = {}): Promise<AgentThreadListV1 & { pagination: AgentPagination }> {
    const paging = pageOptions(options, AGENT_THREADS_PAGE);
    const result = await (await this.memory()).listThreads({
      filter: { resourceId: conductorResourceId(identity.organizationId, identity.userId) },
      ...paging,
      orderBy: { field: 'updatedAt', direction: 'DESC' },
    });
    const visibleThreads = result.threads.filter(
      (row) =>
        row.metadata?.forkedSubagent !== true &&
        row.metadata?.goalJudge !== true
    );
    return { threads: visibleThreads.map(threadView), pagination: pageView(result, paging, visibleThreads.length) };
  }

  /** Authorized bounded native read shared by human history and model history tools. */
  async readMessages(identity: CapabilityIdentity, threadId: string, options: AgentPageOptions = {}) {
    const paging = pageOptions(options, AGENT_HISTORY_MESSAGES);
    const thread = await this.requireOwnThread(identity, threadId);
    const result = await (await this.memory()).recall({
      threadId,
      resourceId: conductorResourceId(identity.organizationId, identity.userId),
      ...paging,
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });
    // Native recall pages are selected newest first. The product transcript
    // and model tool both consume each bounded page in chronological order.
    const messages = [...result.messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return { thread: threadView(thread), messages, pagination: pageView(result, paging, messages.length) };
  }

  /**
   * What still waits for the person. A call already answered is not listed,
   * whatever the stored run says (kcxz.29, D2): a stream cut after the
   * capability ran can leave the run suspended.
   */
  async pendingRuns(identity: CapabilityIdentity, threadId: string) {
    const { runs } = await (await this.conductor()).listSuspendedRuns({
      threadId,
      resourceId: conductorResourceId(identity.organizationId, identity.userId),
    });
    const open: PendingRun[] = [];
    for (const run of runs) {
      const toolCalls: PendingRun['toolCalls'] = [];
      for (const call of run.toolCalls) {
        const card =
          call.toolCallId && !call.requiresApproval
            ? questionCardId(call.suspendPayload)
            : undefined;
        if (
          call.toolCallId &&
          (await agentCallAnswered(this.claims, run.runId, call.toolCallId, card).catch(
            refusedWhenUnavailable
          ))
        ) {
          continue;
        }
        toolCalls.push(call);
      }
      if (toolCalls.length) open.push({ ...run, toolCalls });
    }
    return open;
  }

  async history(
    identity: CapabilityIdentity,
    threadId: string,
    options: AgentPageOptions = {}
  ): Promise<AgentThreadHistoryV1 & { pagination: AgentPagination }> {
    const thread = await this.requireOwnThread(identity, threadId);
    // Read before the snapshot: a write unfinished when this GET began must
    // remain unfinished in its response even if it completes during recall.
    const execution = await readAgentThreadExecution(this.claims, thread.metadata).catch(refusedWhenUnavailable);
    const [{ messages, pagination }, runs] = await Promise.all([
      this.readMessages(identity, threadId, options),
      this.pendingRuns(identity, threadId),
    ]);
    // A card first drawn on this reload is remembered as drawn now.
    for (const run of runs) {
      for (const call of run.toolCalls) {
        if (call.requiresApproval && call.toolCallId) {
          await this.approvalCardShown(identity, run.runId, call.toolCallId, call.toolName, call.args ?? {}).catch(
            () => undefined
          );
        }
      }
    }
    const uiMessages = (
      toAISdkMessages(messages as any, {
        version: AGENT_STREAM_VERSION,
      }) as unknown[]
    ).map((item) => {
      if (!item || typeof item !== 'object') return item;
      const msg = item as Record<string, any>;
      const parts = Array.isArray(msg.parts)
        ? msg.parts.filter(
            (part: any) =>
              part?.type !== 'data-tool-call-suspended' &&
              part?.type !== 'data-tool-call-approval'
          )
        : msg.parts;
      if (
        msg.metadata &&
        typeof msg.metadata === 'object' &&
        'suspendedTools' in msg.metadata
      ) {
        const { suspendedTools: _ignored, ...restMeta } = msg.metadata as Record<
          string,
          unknown
        >;
        const next: Record<string, unknown> = { ...msg, parts };
        if (Object.keys(restMeta).length > 0) {
          next.metadata = restMeta;
        } else {
          delete next.metadata;
        }
        return next;
      }
      return parts === msg.parts ? msg : { ...msg, parts };
    });
    return {
      thread: threadView(thread),
      pagination,
      workspace: await this.availableWorkspace(identity, readStoredAgentWorkspace(thread.metadata)),
      messages: uiMessages,
      pending: await pendingView(runs, (toolName, args) =>
        this.describeApproval(identity, toolName, args)
      ),
      ...(execution ? { execution } : {}),
    };
  }

  async rename(
    identity: CapabilityIdentity,
    threadId: string,
    title: string
  ): Promise<AgentThreadV1> {
    const thread = await this.requireOwnThread(identity, threadId);
    return threadView(
      await (await this.memory()).updateThread({
        id: thread.id,
        title,
      })
    );
  }

  /**
   * Switches the active model for a thread via native `Session.model.switch` (`on0i.1`, `on0i.5`).
   */
  async switchModel(
    identity: CapabilityIdentity,
    threadId: string,
    modelId: string,
    options?: { thinkingLevel?: string }
  ) {
    await this.requireOwnThread(identity, threadId);
    if (typeof modelId !== 'string' || !modelId.trim() || modelId.length > 200) {
      throw new BadRequestException({ code: 'AGENT_BAD_REQUEST', message: 'Invalid model id.' });
    }
    const cleanModelId = modelId.trim();
    const session = await this.sessionFor(identity, threadId, { bindThread: true });
    if (session) {
      await session.model.switch(cleanModelId, options as any);
      return {
        threadId,
        modelId: session.model.get(),
        modeId: session.mode.get(),
      };
    }
    await (await this.memory()).updateThread({
      id: threadId,
      metadata: { currentModelId: cleanModelId, modelPersistenceVersion: 2 },
    });
    return { threadId, modelId: cleanModelId, modeId: 'assistant' };
  }

  /**
   * Switches the active mode for a thread via native `Session.mode.switch` (`on0i.1`, `on0i.3`).
   */
  async switchMode(
    identity: CapabilityIdentity,
    threadId: string,
    modeId: string
  ) {
    await this.requireOwnThread(identity, threadId);
    if (modeId !== 'assistant' && modeId !== 'plan') {
      throw new BadRequestException({ code: 'AGENT_BAD_REQUEST', message: 'Invalid mode id.' });
    }
    const session = await this.sessionFor(identity, threadId, { bindThread: true });
    if (session) {
      await session.mode.switch({ modeId });
      return {
        threadId,
        modeId: session.mode.get(),
        modelId: session.model.get(),
      };
    }
    await (await this.memory()).updateThread({
      id: threadId,
      metadata: { currentModeId: modeId },
    });
    return { threadId, modeId, modelId: '' };
  }

  private async goalStore() {
    const mastra = await this.mastraService.mastra().catch(() => null);
    const memory = await this.memory().catch(() => null);
    return resolveConductorGoalStore({ mastra, memory });
  }

  /**
   * Reads the active objective for a thread (`on0i.4`).
   */
  async getObjective(identity: CapabilityIdentity, threadId: string) {
    await this.requireOwnThread(identity, threadId);
    const store = await this.goalStore();
    if (!store) return { objective: null };
    const objective = await readObjective(store, threadId);
    return { objective: normalizeObjectiveRecord(objective as any) };
  }

  /**
   * Sets or updates the active objective for a thread (`on0i.4`).
   */
  async setObjective(
    identity: CapabilityIdentity,
    threadId: string,
    body: { text?: string; maxRuns?: number }
  ) {
    await this.requireOwnThread(identity, threadId);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 2000) {
      throw new BadRequestException({
        code: 'AGENT_BAD_REQUEST',
        message: 'Objective text must be between 1 and 2000 characters.',
      });
    }
    const maxRuns =
      typeof body?.maxRuns === 'number' &&
      Number.isSafeInteger(body.maxRuns) &&
      body.maxRuns >= 1 &&
      body.maxRuns <= 15
        ? body.maxRuns
        : 6;
    const store = await this.goalStore();
    if (!store) {
      throw new BadRequestException({
        code: 'AGENT_BAD_REQUEST',
        message: 'Goal storage is unavailable.',
      });
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
      maxRuns,
    };
    await writeObjective(store, threadId, objective as any);
    return { objective: normalizeObjectiveRecord(objective) };
  }

  /**
   * Clears the active objective for a thread (`on0i.4`).
   */
  async clearObjective(identity: CapabilityIdentity, threadId: string) {
    await this.requireOwnThread(identity, threadId);
    const store = await this.goalStore();
    if (store) {
      await clearObjective(store, threadId);
    }
    return {
      objective: null as ReturnType<typeof normalizeObjectiveRecord>,
      cleared: true,
    };
  }

  /**
   * Lists recurring agent follow-up schedules bound to a thread (`on0i.4`).
   */
  async listFollowUpSchedules(identity: CapabilityIdentity, threadId: string) {
    await this.requireOwnThread(identity, threadId);
    const mastra = (await this.mastraService.mastra()) as any;
    const schedules = mastra?.schedules;
    if (!schedules?.list) return { schedules: [] };
    const resourceId = conductorResourceId(identity.organizationId, identity.userId);
    const result = await schedules.list({
      agentId: CONDUCTOR_AGENT_ID,
      resourceId,
      threadId,
    });
    const rawList = Array.isArray(result)
      ? result
      : Array.isArray(result?.schedules)
      ? result.schedules
      : [];
    const list = rawList.filter(
      (item: any) =>
        item?.agentId === CONDUCTOR_AGENT_ID &&
        item?.resourceId === resourceId &&
        item?.threadId === threadId
    );
    return {
      schedules: list.map((item: any) => ({
        id: item.id,
        title: item.name ?? item.metadata?.title ?? '',
        prompt: typeof item.prompt === 'string' ? item.prompt : '',
        cron: item.cron ?? '',
        timeZone: item.timezone ?? item.metadata?.timeZone ?? 'Europe/Moscow',
        timezoneAssumed: Boolean(item.metadata?.timezoneAssumed),
        threadId: item.threadId ?? threadId,
        enabled: item.status === 'active',
        nextRunAt:
          typeof item.nextFireAt === 'number'
            ? new Date(item.nextFireAt).toISOString()
            : null,
        lastRunAt:
          typeof item.lastFireAt === 'number'
            ? new Date(item.lastFireAt).toISOString()
            : null,
      })),
    };
  }

  /**
   * Creates a recurring agent follow-up schedule bound to a thread (`on0i.4`).
   */
  async createFollowUpSchedule(
    identity: CapabilityIdentity,
    threadId: string,
    body: { title?: string; prompt?: string; cron?: string; timeZone?: string }
  ) {
    await this.requireOwnThread(identity, threadId);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const cron = typeof body?.cron === 'string' ? body.cron.trim() : '';
    if (!title || title.length > 200 || !prompt || prompt.length > 4000 || cron.split(/\s+/).length !== 5) {
      throw new BadRequestException({
        code: 'AGENT_BAD_REQUEST',
        message: 'Invalid follow-up schedule parameters.',
      });
    }
    const mastra = (await this.mastraService.mastra()) as any;
    const schedules = mastra?.schedules;
    if (!schedules?.create) {
      throw new BadRequestException({
        code: 'AGENT_BAD_REQUEST',
        message: 'Schedule manager is unavailable.',
      });
    }
    const resourceId = conductorResourceId(identity.organizationId, identity.userId);
    const tzInfo = resolveFollowUpScheduleTimeZone(body?.timeZone, identity.timeZone);
    const definition = defineSchedule({
      name: title,
      cron,
      timezone: tzInfo.timeZone,
      prompt,
      threadId,
      resourceId,
      status: 'active',
      metadata: {
        kind: 'agent-followup',
        title,
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
      schedule: {
        id: created.id,
        title: created.name ?? title,
        prompt: created.prompt ?? prompt,
        cron: created.cron ?? cron,
        timeZone: created.timezone ?? tzInfo.timeZone,
        timezoneAssumed: tzInfo.timezoneAssumed,
        ...(tzInfo.timezoneNote ? { timezoneNote: tzInfo.timezoneNote } : {}),
        threadId: created.threadId ?? threadId,
        enabled: created.status === 'active',
        nextRunAt:
          typeof created.nextFireAt === 'number'
            ? new Date(created.nextFireAt).toISOString()
            : null,
      },
    };
  }

  /**
   * Cancels a recurring agent follow-up schedule bound to a thread (`on0i.4`).
   */
  async cancelFollowUpSchedule(
    identity: CapabilityIdentity,
    threadId: string,
    scheduleId: string
  ) {
    await this.requireOwnThread(identity, threadId);
    const mastra = (await this.mastraService.mastra()) as any;
    const schedules = mastra?.schedules;
    if (!schedules?.get || !schedules?.delete) {
      throw new NotFoundException({
        code: 'AGENT_SCHEDULE_NOT_FOUND',
        message: 'Schedule not found.',
      });
    }
    const resourceId = conductorResourceId(identity.organizationId, identity.userId);
    const existing = await schedules.get(scheduleId);
    if (
      !existing ||
      existing.agentId !== CONDUCTOR_AGENT_ID ||
      existing.resourceId !== resourceId ||
      existing.threadId !== threadId
    ) {
      throw new NotFoundException({
        code: 'AGENT_SCHEDULE_NOT_FOUND',
        message: 'Schedule not found.',
      });
    }
    await schedules.delete(scheduleId);
    return { deleted: true, scheduleId };
  }

  /**
   * Native Mastra 1.78 observability query (`querySpans`, `aggregateTraces`,
   * `listTraces`) scoped to an owned thread (`on0i.7`, Section 4 row 25).
   * Redacts secret shapes across span names, previews, attributes, and errors,
   * and returns coverage-aware usage metrics (`isInvoice: false`).
   */
  async queryObservability(
    identity: CapabilityIdentity,
    threadId: string,
    usageSummary?: {
      knownCostUsd: number | null;
      unknownCostCount: number;
      possiblyBilledCount: number;
      coverage: string;
      isInvoice: false;
    }
  ) {
    const thread = await this.requireOwnThread(identity, threadId);
    const resourceId = conductorResourceId(
      identity.organizationId,
      identity.userId
    );
    const mastra = (await this.mastraService.mastra()) as unknown as {
      getStorage?: () =>
        | { getStore?: (name: string) => Promise<unknown> | unknown }
        | undefined;
    };
    const observability = (await mastra
      .getStorage?.()
      ?.getStore?.('observability')) as
      | {
          querySpans?: (args: Record<string, unknown>) => Promise<unknown>;
          aggregateTraces?: (args: Record<string, unknown>) => Promise<unknown>;
          listTraces?: (args: Record<string, unknown>) => Promise<unknown>;
        }
      | undefined;

    let rawSpans: any[] = [];
    let rawAggregate: Record<string, unknown> | null = null;
    if (observability?.querySpans) {
      const queried = (await observability.querySpans({
        filters: { threadId, resourceId },
      })) as any;
      rawSpans = Array.isArray(queried)
        ? queried
        : Array.isArray(queried?.spans)
          ? queried.spans
          : Array.isArray(queried?.items)
            ? queried.items
            : [];
    } else if (observability?.listTraces) {
      const listed = (await observability.listTraces({
        filters: { threadId, resourceId },
        pagination: { page: 0, perPage: 50 },
      })) as any;
      const traces = Array.isArray(listed)
        ? listed
        : Array.isArray(listed?.traces)
          ? listed.traces
          : [];
      for (const trace of traces) {
        if (Array.isArray(trace?.spans)) {
          rawSpans.push(...trace.spans);
        } else if (trace && typeof trace === 'object') {
          rawSpans.push(trace);
        }
      }
    }

    if (observability?.aggregateTraces) {
      const agg = await observability.aggregateTraces({
        filters: { threadId, resourceId },
      });
      if (agg && typeof agg === 'object') {
        rawAggregate = redactObservabilityValue(agg) as Record<string, unknown>;
      }
    }

    const scopedSpans = rawSpans.filter((span) => {
      const spanThread =
        span?.threadId ??
        span?.attributes?.threadId ??
        span?.metadata?.threadId;
      const spanResource =
        span?.resourceId ??
        span?.attributes?.resourceId ??
        span?.metadata?.resourceId;
      if (spanThread && spanThread !== threadId) return false;
      if (spanResource && spanResource !== resourceId) return false;
      return true;
    });

    const spans = scopedSpans.map((span) => {
      const spanId = String(span?.spanId ?? span?.id ?? '');
      const parentSpanId =
        typeof span?.parentSpanId === 'string' && span.parentSpanId
          ? span.parentSpanId
          : null;
      const traceId = String(span?.traceId ?? '');
      const name = redactSecretShapes(String(span?.name ?? 'span'));
      const status = String(span?.status ?? 'ok');
      const previewRaw =
        typeof span?.preview === 'string'
          ? span.preview
          : typeof span?.output === 'string'
            ? span.output.slice(0, 240)
            : null;
      const preview = previewRaw ? redactSecretShapes(previewRaw) : null;
      const errorRaw =
        typeof span?.error === 'string'
          ? span.error
          : typeof span?.error?.message === 'string'
            ? span.error.message
            : null;
      const error = errorRaw ? redactSecretShapes(errorRaw) : null;
      return {
        spanId,
        parentSpanId,
        traceId,
        name,
        status,
        preview,
        error,
        startedAt: span?.startedAt ?? span?.startTime ?? null,
        endedAt: span?.endedAt ?? span?.endTime ?? null,
        attributes: redactObservabilityValue(span?.attributes ?? {}),
      };
    });

    const traceIds = new Set(spans.map((s) => s.traceId).filter(Boolean));
    const linkedSpans = spans
      .filter((s) => s.parentSpanId !== null)
      .map((s) => ({ spanId: s.spanId, parentSpanId: s.parentSpanId! }));
    const errorCount = spans.filter(
      (s) => s.status === 'error' || Boolean(s.error)
    ).length;

    return {
      threadId,
      spans,
      linkedSpans,
      aggregate: rawAggregate ?? {
        totalTraces: traceIds.size,
        totalSpans: spans.length,
        errorCount,
      },
      execution: await readAgentThreadExecution(
        this.claims,
        thread.metadata
      ).catch(() => null),
      usage: usageSummary ?? {
        knownCostUsd: null,
        unknownCostCount: 0,
        possiblyBilledCount: 0,
        coverage: 'none',
        isInvoice: false as const,
      },
    };
  }

  /**
   * Deleting a thread deletes what still waits in it too (correctness review
   * W1 F12): a suspended run's snapshot holds the call's arguments, the card's
   * payload and the request context, and could otherwise be resumed by id.
   */
  async remove(identity: CapabilityIdentity, threadId: string) {
    await this.requireOwnThread(identity, threadId);
    const runs = await this.pendingRuns(identity, threadId);
    await this.forgetRuns(runs.map((run) => run.runId));
    const resourceId = conductorResourceId(identity.organizationId, identity.userId);
    await this.forgetThreadSchedules(resourceId, threadId).catch(
      (): undefined => undefined
    );
    await (await this.mastraService.controller?.())?.deleteSession({
      resourceId,
      scope: threadId,
    }).catch((): undefined => undefined);
    await (await this.memory()).deleteThread(threadId);
    return { deleted: true };
  }

  private async forgetThreadSchedules(resourceId: string, threadId: string) {
    const mastra = (await this.mastraService.mastra()) as any;
    const schedules = mastra?.schedules;
    if (!schedules?.list || !schedules?.delete) return;
    const result = await schedules.list({
      agentId: CONDUCTOR_AGENT_ID,
      resourceId,
      threadId,
    });
    const list = Array.isArray(result)
      ? result
      : Array.isArray(result?.schedules)
      ? result.schedules
      : [];
    for (const item of list) {
      if (
        item?.agentId === CONDUCTOR_AGENT_ID &&
        item?.resourceId === resourceId &&
        item?.threadId === threadId &&
        typeof item.id === 'string'
      ) {
        await schedules.delete(item.id).catch((): undefined => undefined);
      }
    }
  }

  private async forgetRuns(runIds: readonly string[]) {
    if (!runIds.length) return;
    const mastra = (await this.mastraService.mastra()) as unknown as {
      getStorage?: () =>
        | { getStore?: (name: string) => Promise<unknown> | unknown }
        | undefined;
    };
    const workflows = (await mastra.getStorage?.()?.getStore?.('workflows')) as
      | {
          deleteWorkflowRunById?: (args: {
            runId: string;
            workflowName: string;
          }) => Promise<void>;
        }
      | undefined;
    if (!workflows?.deleteWorkflowRunById) return;
    for (const runId of runIds) {
      for (const workflowName of AGENT_RUN_WORKFLOWS) {
        await workflows.deleteWorkflowRunById({ runId, workflowName });
      }
    }
  }
}
