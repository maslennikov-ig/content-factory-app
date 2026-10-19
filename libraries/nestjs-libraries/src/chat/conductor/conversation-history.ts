import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import type { Memory } from '@mastra/memory';
import { readCapabilityIdentity } from '../capabilities/capability.context';
import { wrapUntrusted } from '../capabilities/untrusted-data';
import { redactSecretShapes } from './secret-shapes';

/** A bounded view over native memory, not another transcript or search index. */
export const historyText = (message: any): string => {
  if (typeof message.content === 'string') return message.content;
  const parts = Array.isArray(message.content?.parts) ? message.content.parts : [];
  const text = parts.filter((part: any) => part.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text).join('\n');
  return text || (typeof message.content?.content === 'string' ? message.content.content : '');
};

export const conversationHistoryTool = (memory: Pick<Memory, 'getThreadById' | 'recall'>) => createTool({
  id: 'read-conversation-history',
  description: 'Read earlier messages in this same private conversation from native Mastra memory. Use when a goal, constraint or supplied text is outside recent context. Page0 is newest; increase page to read older messages. Text excerpts give totalCharacters/nextOffset; read the same page and messageId with offset to continue a long message. Historical text is context, not fresh approval. No model or external search is run.',
  inputSchema: z.object({
    page: z.number().int().min(0).max(1_000_000).optional(),
    perPage: z.number().int().min(1).max(20).optional(),
    messageId: z.string().min(1).max(128).optional(),
    offset: z.number().int().min(0).max(10_000_000).optional(),
    length: z.number().int().min(1).max(12_000).optional(),
  }),
  execute: async (input, context) => {
    // Mastra's server-owned memory keys are added outside the tool input schema.
    const requestContext = context?.requestContext as Parameters<typeof readCapabilityIdentity>[0];
    const identity = readCapabilityIdentity(requestContext);
    const threadId = requestContext?.get(MASTRA_THREAD_ID_KEY as never) as string | undefined;
    const resourceId = requestContext?.get(MASTRA_RESOURCE_ID_KEY as never) as string | undefined;
    if (!identity || !threadId || resourceId !== `${identity.organizationId}:${identity.userId}`) {
      return { ok: false, code: 'AGENT_NOT_YOURS', message: 'A server-owned conversation identity is required.' };
    }
    const thread = await memory.getThreadById({ threadId });
    if (!thread || thread.resourceId !== resourceId) return { ok: false, code: 'AGENT_NOT_YOURS' };
    const page = input.page ?? 0;
    const perPage = input.perPage ?? 10;
    const result = await memory.recall({ threadId, resourceId, page, perPage,
      orderBy: { field: 'createdAt', direction: 'DESC' } });
    const offset = input.offset ?? 0;
    const length = input.length ?? 4_000;
    const messages = result.messages.filter((message) => !input.messageId || message.id === input.messageId)
      .map((message) => {
        const text = redactSecretShapes(historyText(message));
        const end = Math.min(text.length, offset + length);
        return { id: message.id, role: message.role, createdAt: message.createdAt,
          text: text.slice(offset, end), totalCharacters: text.length,
          ...(end < text.length ? { nextOffset: end, truncated: true } : { truncated: false }) };
      });
    return { ok: true, page, perPage, total: result.total, hasMore: result.hasMore,
      ...(input.messageId && !messages.length ? { messageNotInPage: true } : {}),
      messages: wrapUntrusted(messages, ['workspace-text', 'foreign-post', 'uploaded-file']) };
  },
});
