import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { toAISdkMessages } from '@mastra/ai-sdk/ui';
import { MastraService } from '@contentfactory/nestjs-libraries/chat/mastra.service';
import type {
  AgentPendingRunV1,
  AgentThreadHistoryV1,
  AgentThreadListV1,
  AgentThreadV1,
} from '../capabilities/agent-parts.contract';
import type { CapabilityIdentity } from '../capabilities/capability.types';
import { questionCardId, questionCardView } from '../capabilities/question-card';
import { notYours, type PendingRun } from './agent-chat.request';
import { AGENT_STREAM_VERSION } from '../capabilities/agent-parts.contract';
import { conductorResourceId } from './conductor.context';
import { threadTitleFromMessage } from './conductor.memory';
import {
  AGENT_RUN_CLAIM_STORE,
  agentCallAnswered,
  approvalContentShown,
  claimAgentRun,
  inProcessRunClaimStore,
  markAgentCallsAnswered,
  rememberApprovalContent,
  type AgentRunClaimStore,
  type AnsweredCall,
} from './agent-run-claims';

/**
 * Personal threads (`content-factory-next-kcxz.8`, spec §1.6, §4.7; premortem
 * S4, S7). Every read and write goes through one owner check: the thread's
 * resource must be `{orgId}:{userId}` of the caller. Threads of the old screen,
 * written under the organization alone, are never listed and never opened.
 *
 * Nothing here runs a model or opens an admission (premortem U4): listing,
 * history and the pending cards are free.
 */

/** Newest threads first; the screen's list is short on purpose. */
export const AGENT_THREADS_PAGE = 100;
/** The history a reload hydrates; older messages stay in storage. */
export const AGENT_HISTORY_MESSAGES = 200;

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
  listThreads(args: Record<string, unknown>): Promise<{ threads: ThreadRow[] }>;
  createThread(args: {
    threadId: string;
    resourceId: string;
    title?: string;
  }): Promise<ThreadRow>;
  updateThread(args: {
    id: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<ThreadRow>;
  deleteThread(threadId: string): Promise<void>;
  recall(args: Record<string, unknown>): Promise<{ messages: unknown[] }>;
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

/** Where Mastra keeps an agent run's snapshot (`Agent.listSuspendedRuns`). */
const AGENT_RUN_WORKFLOWS = ['agentic-loop', 'durable-agentic-loop'] as const;

@Injectable()
export class AgentThreadsService {
  private readonly claims: AgentRunClaimStore;

  constructor(
    private readonly mastraService: MastraService,
    @Optional()
    @Inject(AGENT_RUN_CLAIM_STORE)
    claims?: AgentRunClaimStore
  ) {
    this.claims = claims ?? inProcessRunClaimStore();
  }

  /**
   * Claims a suspended run for one answer (correctness review W1 F5): the
   * release function, or `null` while another request answers it.
   */
  claimRun(runId: string) {
    return claimAgentRun(this.claims, runId);
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

  /**
   * The thread a message is written to: the caller's own, or a new one named
   * after the message. Created before the turn so the first write can never
   * land in a thread somebody else created with the same id.
   */
  async threadForMessage(
    identity: CapabilityIdentity,
    threadId: string,
    text: string
  ): Promise<ThreadRow> {
    const existing = await this.ownThread(identity, threadId);
    if (existing) return existing;
    return (await this.memory()).createThread({
      threadId,
      resourceId: conductorResourceId(identity.organizationId, identity.userId),
      title: threadTitleFromMessage(text, identity.language),
    });
  }

  /** The thread an answer on a card continues: it must exist and be the caller's. */
  async threadForAnswer(identity: CapabilityIdentity, threadId: string) {
    const thread = await this.ownThread(identity, threadId);
    if (!thread) throw notYours();
    return thread;
  }

  async list(identity: CapabilityIdentity): Promise<AgentThreadListV1> {
    const { threads } = await (await this.memory()).listThreads({
      filter: {
        resourceId: conductorResourceId(identity.organizationId, identity.userId),
      },
      perPage: AGENT_THREADS_PAGE,
      page: 0,
      orderBy: { field: 'updatedAt', direction: 'DESC' },
    });
    return { threads: threads.map(threadView) };
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
          (await agentCallAnswered(this.claims, run.runId, call.toolCallId, card))
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
    threadId: string
  ): Promise<AgentThreadHistoryV1> {
    const thread = await this.requireOwnThread(identity, threadId);
    const resourceId = conductorResourceId(identity.organizationId, identity.userId);
    const [{ messages }, runs] = await Promise.all([
      (await this.memory()).recall({
        threadId,
        resourceId,
        perPage: AGENT_HISTORY_MESSAGES,
      }),
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
      messages: toAISdkMessages(messages as any, {
        version: AGENT_STREAM_VERSION,
      }) as unknown[],
      pending: await pendingView(runs, (toolName, args) =>
        this.describeApproval(identity, toolName, args)
      ),
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
        metadata: thread.metadata ?? {},
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

