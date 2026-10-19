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
import { conductorResourceId } from './conductor.context';
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
          : { suspendPayload: questionCardView(call.suspendPayload ?? null) }),
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

  constructor(
    private readonly mastraService: MastraService,
    @Optional()
    @Inject(AGENT_RUN_CLAIM_STORE)
    claims?: AgentRunClaimStore
  ) {
    // Every command bounded: Redis down refuses, it never hangs (kcxz.47).
    this.claims = boundedRunClaimStore(claims ?? inProcessRunClaimStore());
  }

  /**
   * Claims a suspended run for one answer (correctness review W1 F5): the
   * release function, or `null` while another request answers it.
   */
  async claimRun(runId: string) {
    try {
      return await claimAgentRun(this.claims, runId);
    } catch (error) {
      return refusedWhenUnavailable(error);
    }
  }

  /** One web turn per private thread, including work left running by Stop. */
  async claimThreadTurn(identity: CapabilityIdentity, threadId: string) {
    await this.ownThread(identity, threadId);
    const resourceId = conductorResourceId(identity.organizationId, identity.userId);
    const release = await this.claimRun(`thread:${resourceId}:${threadId}`);
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
    if (existing) return existing;
    const ref = selected ? artifactForWorkContext(selected.context) : null;
    const workspace = selected === undefined ? undefined : {
      ...emptyAgentWorkspace(),
      workContext: selected?.context ?? null,
      artifacts: ref ? [ref] : [],
      activeArtifact: ref,
    };
    return (await this.memory()).createThread({
      threadId,
      resourceId: conductorResourceId(identity.organizationId, identity.userId),
      title: threadTitleFromMessage(text, identity.language),
      ...(workspace ? { metadata: { [AGENT_WORKSPACE_METADATA_KEY]: workspace } } : {}),
    });
  }

  /** The thread an answer on a card continues: it must exist and be the caller's. */
  async threadForAnswer(identity: CapabilityIdentity, threadId: string) {
    const thread = await this.ownThread(identity, threadId);
    if (!thread) throw notYours();
    return thread;
  }

  async list(identity: CapabilityIdentity, options: AgentPageOptions = {}): Promise<AgentThreadListV1 & { pagination: AgentPagination }> {
    const paging = pageOptions(options, AGENT_THREADS_PAGE);
    const result = await (await this.memory()).listThreads({
      filter: { resourceId: conductorResourceId(identity.organizationId, identity.userId) },
      ...paging,
      orderBy: { field: 'updatedAt', direction: 'DESC' },
    });
    return { threads: result.threads.map(threadView), pagination: pageView(result, paging, result.threads.length) };
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
    return {
      thread: threadView(thread),
      pagination,
      workspace: await this.availableWorkspace(identity, readStoredAgentWorkspace(thread.metadata)),
      messages: toAISdkMessages(messages as any, {
        version: AGENT_STREAM_VERSION,
      }) as unknown[],
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
   * Deleting a thread deletes what still waits in it too (correctness review
   * W1 F12): a suspended run's snapshot holds the call's arguments, the card's
   * payload and the request context, and could otherwise be resumed by id.
   */
  async remove(identity: CapabilityIdentity, threadId: string) {
    await this.requireOwnThread(identity, threadId);
    const runs = await this.pendingRuns(identity, threadId);
    await this.forgetRuns(runs.map((run) => run.runId));
    await (await this.memory()).deleteThread(threadId);
    return { deleted: true };
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

