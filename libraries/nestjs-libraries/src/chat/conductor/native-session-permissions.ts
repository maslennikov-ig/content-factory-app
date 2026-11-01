import { type Session } from '@mastra/core/agent-controller';
import type { AgentListSuspendedRunsOptions, AgentListSuspendedRunsResult } from '@mastra/core/agent';
import { createNativeQuestionTool } from './native-question-batch';
import type { MastraMemory } from '@mastra/core/memory';
import type { CapabilityDeclaration } from '../capabilities/capability.types';

export const NATIVE_PERMISSION_METADATA_KEY = 'assistantPermissionRules';
export const NATIVE_SAFE_BUILTIN_TOOLS = ['skill', 'skill_search', 'skill_read', 'ask_user',
  'task_write', 'task_update', 'task_complete', 'task_check', 'updateWorkingMemory'];
const policies = new Set(['allow', 'ask', 'deny']);

type PersistedApproval = { resourceId: string; threadId: string; runId: string; toolCallId: string; toolName: string };
type ApprovalFence = { pending: Map<string, PersistedApproval> };
const approvalFences = new WeakMap<Session<any>, ApprovalFence>();
const approvalKey = (call: PersistedApproval) => JSON.stringify([call.resourceId, call.threadId, call.runId, call.toolCallId]);

/**
 * A previously parked approval is an individual human decision, even when a
 * newer release allows subsequent calls of the same tool. Install this before
 * binding the thread: Session replays approvals and otherwise applies the new
 * policy to the old call. Do not persist this temporary fence as a preference.
 */
export async function protectPersistedApprovals(
  session: Session<any>,
  agent: { listSuspendedRuns: (address: AgentListSuspendedRunsOptions) => Promise<AgentListSuspendedRunsResult> },
  address: { threadId: string; resourceId: string }
) {
  const prior = new Map(approvalFences.get(session)?.pending ?? []);
  // The native API returns all matches unless page and perPage are supplied.
  const { runs } = await agent.listSuspendedRuns(address);
  const pending: PersistedApproval[] = [];
  const stillStored = new Set<string>();
  for (const run of runs) for (const call of run.toolCalls) {
    if (!call.requiresApproval) continue;
    if (!run.runId || !call.toolCallId || !call.toolName) throw new Error('Persisted approval is missing its address.');
    const approval = { ...address, runId: run.runId, toolCallId: call.toolCallId, toolName: call.toolName };
    stillStored.add(approvalKey(approval));
    if (!session.approval.isArmed(approval)) pending.push(approval);
  }
  const priorFence = approvalFences.get(session);
  for (const [key, call] of prior) {
    if (call.threadId === address.threadId && call.resourceId === address.resourceId &&
        (!stillStored.has(key) || session.approval.isArmed(call)) && priorFence?.pending.get(key) === call)
      priorFence.pending.delete(key);
  }
  if (!pending.length) return;
  let fence = approvalFences.get(session);
  if (!fence) {
    fence = { pending: new Map() };
    approvalFences.set(session, fence);
    const original = session.resolveToolApproval.bind(session);
    const current = fence;
    // Mastra exposes no replay-scoped permissions resolver. Overlaying its
    // persisted rules would race explicit preference changes (and yolo/grants
    // can bypass a category rule), so constrain its public policy method for
    // this Session only until the specific old gate is armed. Deny always wins.
    session.resolveToolApproval = (toolName, threadId) => {
      const policy = original(toolName, threadId);
      const actualThread = threadId ?? session.thread.getId();
      return policy === 'allow' && [...current.pending.values()].some((call) =>
        call.threadId === actualThread && call.toolName === toolName) ? 'ask' : policy;
    };
    session.subscribe((event) => {
      if (event.type !== 'tool_approval_required') return;
      for (const [key, call] of current.pending)
        if (call.threadId === event.threadId && call.toolCallId === event.toolCallId && session.approval.isArmed(call)) current.pending.delete(key);
    });
  }
  for (const call of pending) fence.pending.set(approvalKey(call), call);
}

/** A question suspends itself; the global action-approval hop is redundant. */
export function nativeQuestionTools() {
  return {
    ask_user: createNativeQuestionTool(),
  };
}

/** Restore before subscribing to a persisted gate. Domain checks remain authoritative. */
export async function configureNativeSessionPermissions(
  session: Session<any>,
  _capabilities: readonly CapabilityDeclaration[],
  memory?: MastraMemory,
) {
  const threadId = session.getThreadScope().assistantThreadId ?? session.thread.getId();
  const thread = threadId && memory ? await memory.getThreadById({ threadId }) : null;
  if (thread && thread.resourceId !== session.identity.getResourceId()) throw new Error('Permission scope mismatch.');
  const saved = thread?.metadata?.[NATIVE_PERMISSION_METADATA_KEY] as Record<string, unknown> | undefined;
  const safeRules = (value: unknown) => Object.fromEntries(Object.entries(
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  ).filter(([, policy]) => policies.has(String(policy))));
  const current = session.permissions.getRules();
  // Use a default category, not per-tool allow entries: a later explicit
  // category ask/deny must not be shadowed by our own safe-read defaults.
  const categories = { read: 'allow', ...safeRules(saved?.categories), ...current.categories };
  const tools = { ...safeRules(saved?.tools), ...current.tools };
  await session.state.set({ permissionRules: { categories, tools } });
  if (!threadId || !thread || !memory) return;
  // Session 1.78 persists a fixed set of preference keys, excluding permissionRules.
  // Its public permission resolver makes a policy change durable before resolving.
  session.permissions.setResolver({
    getState: () => session.state.get(),
    setState: async (updates) => {
      const latest = await memory.getThreadById({ threadId });
      if (!latest || latest.resourceId !== session.identity.getResourceId()) throw new Error('Permission scope mismatch.');
      await memory.updateThread({ id: threadId, title: latest.title, metadata: {
        ...latest.metadata, [NATIVE_PERMISSION_METADATA_KEY]: updates.permissionRules,
      } });
      await session.state.set(updates);
    },
  });
}
