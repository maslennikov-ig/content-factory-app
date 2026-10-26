import type { Session } from '@mastra/core/agent-controller';
import type { MastraMemory } from '@mastra/core/memory';
import type { CapabilityDeclaration } from '../capabilities/capability.types';

export const NATIVE_PERMISSION_METADATA_KEY = 'assistantPermissionRules';
export const NATIVE_SAFE_BUILTIN_TOOLS = ['skill', 'skill_search', 'skill_read', 'ask_user',
  'task_write', 'task_update', 'task_complete', 'task_check', 'updateWorkingMemory'];
const policies = new Set(['allow', 'ask', 'deny']);

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
