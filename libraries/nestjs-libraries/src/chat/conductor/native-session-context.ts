import type { Session } from '@mastra/core/agent-controller';
import {
  RequestContext,
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  MASTRA_SCOPES_KEY,
  MASTRA_MESSAGE_AUTHOR_KEY,
} from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import {
  capabilityContextSchema,
  readCapabilityIdentity,
  seedCapabilityContext,
} from '../capabilities/capability.context';
import type { CapabilityIdentity } from '../capabilities/capability.types';
import {
  CONDUCTOR_CONTEXT_KEYS,
  CONDUCTOR_REQUEST_ID_KEY,
  conductorContextSchema,
  conductorResourceId,
  conductorScopes,
  conductorMessageAuthor,
} from './conductor.context';
import { NATIVE_QUEUED_INPUT_CHILD_CONTEXT_KEY } from './native-queued-input';

export type NativeRunContextAddress = {
  resourceId: string;
  threadId: string;
  runId: string;
};
export type NativeRunContextResolver = (
  address: NativeRunContextAddress
) => Promise<RequestContext<any>>;
const refused = () =>
  Object.assign(
    new Error('Native run context is outside this session or unavailable.'),
    { name: 'PermissionDenied' }
  );

/** Recover application values, never serialized SDK objects or execution claims. */
export async function restoreNativeRunContext(
  storage: MastraCompositeStore,
  address: NativeRunContextAddress,
  currentIdentity: (identity: CapabilityIdentity) => Promise<CapabilityIdentity>
) {
  const memory = await storage.getStore('memory');
  const thread = await memory?.getThreadById({ threadId: address.threadId });
  if (!thread || thread.resourceId !== address.resourceId) throw refused();
  const workflows = await storage.getStore('workflows');
  const run = await workflows?.getWorkflowRunById({
    workflowName: 'durable-agentic-loop',
    runId: address.runId,
  });
  const snapshot =
    typeof run?.snapshot === 'string'
      ? JSON.parse(run.snapshot)
      : run?.snapshot;
  if (
    !snapshot ||
    !['pending', 'running', 'waiting', 'suspended'].includes(snapshot.status) ||
    (run?.resourceId && run.resourceId !== address.resourceId)
  )
    throw refused();
  const saved = snapshot.requestContext;
  if (
    !saved ||
    !capabilityContextSchema.safeParse(saved).success ||
    saved[MASTRA_THREAD_ID_KEY] !== address.threadId ||
    saved[MASTRA_RESOURCE_ID_KEY] !== address.resourceId ||
    typeof saved[CONDUCTOR_REQUEST_ID_KEY] !== 'string' ||
    !saved[CONDUCTOR_REQUEST_ID_KEY]
  )
    throw refused();
  const identity = readCapabilityIdentity(saved);
  if (
    !identity ||
    conductorResourceId(identity.organizationId, identity.userId) !==
      address.resourceId
  )
    throw refused();
  const author = saved[MASTRA_MESSAGE_AUTHOR_KEY];
  if (author !== undefined && (!author || author.id !== identity.userId))
    throw refused();
  const fresh = await currentIdentity(identity);
  if (
    fresh.userId !== identity.userId ||
    fresh.organizationId !== identity.organizationId
  )
    throw refused();
  const keys = new Set<string>([
    ...CONDUCTOR_CONTEXT_KEYS,
    NATIVE_QUEUED_INPUT_CHILD_CONTEXT_KEY,
  ]);
  const context = new RequestContext<Record<string, unknown>>(
    Object.entries(saved).filter(([key]) => keys.has(key))
  );
  seedCapabilityContext(context, fresh);
  // Native resume permits narrowing the original scopes, never adding new ones.
  const originalScopes = saved[MASTRA_SCOPES_KEY];
  if (originalScopes !== undefined) {
    if (!Array.isArray(originalScopes)) throw refused();
    const allowed = new Set(conductorScopes(fresh, address.threadId));
    context.set(
      MASTRA_SCOPES_KEY,
      originalScopes.filter((scope) => allowed.has(scope))
    );
  }
  context.set(MASTRA_MESSAGE_AUTHOR_KEY, conductorMessageAuthor(fresh));
  // A role can change after the checkpoint; validate freshly rebuilt scopes.
  conductorContextSchema.parse(Object.fromEntries(context.entries()));
  return context;
}

/** Public Session DI: remote events in 1.78 can omit their run's caller context. */
export function configureNativeSessionContext(
  session: Session<any>,
  restore: NativeRunContextResolver
) {
  const machinery = session.machinery;
  session.setMachinery({
    ...machinery,
    buildRequestContext: async (context, scope) => {
      // Supplied contexts keep native validation; never fill an invalid caller.
      if (!context && scope?.execution && scope.runId) {
        const { threadId, resourceId, runId } = scope;
        if (
          !threadId ||
          !resourceId ||
          resourceId !== session.identity.getResourceId() ||
          threadId !== session.getThreadScope().assistantThreadId
        )
          throw refused();
        context = await restore({ threadId, resourceId, runId });
      }
      return machinery.buildRequestContext(context, scope);
    },
  });
}
