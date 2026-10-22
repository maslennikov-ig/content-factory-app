import type { Type } from '@nestjs/common';
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import {
  CAPABILITY_CONTEXT_KEYS,
  originalAuthorRequestSchema,
  readCapabilityContextValue,
  readOriginalAuthorRequest,
  type ReadableRequestContext,
} from './capability.context';
import type { CapabilityIdentity, CapabilityRunContext, OriginalAuthorRequest } from './capability.types';
import { historyText } from '../conductor/conversation-history';
import { redactSecretShapes } from '../conductor/secret-shapes';

/** Resolve only author words, without classifying their goal or granting consent. */
export const authorRequestResolver = (
  identity: CapabilityIdentity,
  context: ReadableRequestContext | undefined,
  services: <T>(token: Type<T>) => T
): CapabilityRunContext['resolveAuthorRequest'] => {
  const threadId = readCapabilityContextValue(context, MASTRA_THREAD_ID_KEY);
  const resourceId = readCapabilityContextValue(context, MASTRA_RESOURCE_ID_KEY);
  const current = readOriginalAuthorRequest(context);
  // Older direct/manual capability callers have no native conversation proof.
  // Their supplied input remains input, never an authenticated original request.
  if (threadId === undefined && resourceId === undefined &&
      readCapabilityContextValue(context, CAPABILITY_CONTEXT_KEYS.originalAuthorRequest) === undefined) return undefined;

  let history: Promise<OriginalAuthorRequest[]> | undefined;
  return async ({ requestMessageId, text }) => {
    if (resourceId !== `${identity.organizationId}:${identity.userId}`) return null;
    // Native subagents drop the parent's Memory thread binding but retain its
    // authenticated RequestContext. Its exact server-held author record is
    // still valid; an owned thread is required only for looking up older text.
    if (current && (!requestMessageId || requestMessageId === current.messageId)) {
      if (text === undefined || text === current.text) return current;
      // An explicit current id cannot be rescued by a different stored record.
      if (requestMessageId === current.messageId) return null;
    }
    if (typeof threadId !== 'string' || !threadId) return null;
    if (!requestMessageId && text === undefined) return null;
    history ??= (async () => {
      try {
        // Lazy to avoid the MastraService/registry dependency cycle. The owned
        // service validates the thread before reading exactly one bounded page.
        const { AgentThreadsService } = await import('@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service');
        const { messages } = await services(AgentThreadsService).readMessages(identity, threadId, { page: 0, perPage: 200 });
        return messages.flatMap(message => {
          if (message.role !== 'user' || message.threadId !== threadId || message.resourceId !== resourceId) return [];
          const parsed = originalAuthorRequestSchema.safeParse({
            messageId: message.id,
            text: redactSecretShapes(historyText(message)),
          });
          return parsed.success ? [{ messageId: parsed.data.messageId, text: parsed.data.text }] : [];
        });
      } catch {
        return [];
      }
    })();
    return (await history).find(record =>
      (!requestMessageId || record.messageId === requestMessageId) &&
      (text === undefined || record.text === text)
    ) ?? null;
  };
};
