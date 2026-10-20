import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import type { Memory } from '@mastra/memory';
import { readCapabilityIdentity } from '../capabilities/capability.context';
import { wrapUntrusted } from '../capabilities/untrusted-data';
import { redactSecretShapes } from './secret-shapes';

const MAX_VIEWABLE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** A bounded view over native memory, not another transcript or search index. */
export const historyText = (message: any): string => {
  if (typeof message.content === 'string') return message.content;
  const parts = Array.isArray(message.content?.parts) ? message.content.parts : [];
  const text = parts.filter((part: any) => part.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text).join('\n');
  return text || (typeof message.content?.content === 'string' ? message.content.content : '');
};

const messagePartsOf = (message: any): any[] =>
  Array.isArray(message?.content?.parts)
    ? message.content.parts
    : Array.isArray(message?.parts)
      ? message.parts
      : [];

const attachmentSummaryOf = (message: any) => {
  const parts = messagePartsOf(message);
  const attachments: Array<{
    partIndex: number;
    type: 'image' | 'file';
    mediaType: string | null;
    filename: string | null;
  }> = [];
  parts.forEach((part: any, partIndex: number) => {
    if (part && (part.type === 'image' || part.type === 'file')) {
      attachments.push({
        partIndex,
        type: part.type,
        mediaType:
          typeof part.mimeType === 'string'
            ? part.mimeType
            : typeof part.mediaType === 'string'
              ? part.mediaType
              : null,
        filename:
          typeof part.filename === 'string'
            ? part.filename
            : typeof part.name === 'string'
              ? part.name
              : null,
      });
    }
  });
  return attachments;
};

const extractAttachmentPayload = (part: any) => {
  const rawData = part?.data ?? part?.image ?? part?.file ?? part?.url ?? null;
  const declaredMediaType =
    typeof part?.mimeType === 'string'
      ? part.mimeType
      : typeof part?.mediaType === 'string'
        ? part.mediaType
        : null;
  const filename =
    typeof part?.filename === 'string'
      ? part.filename
      : typeof part?.name === 'string'
        ? part.name
        : null;

  if (Buffer.isBuffer(rawData) || rawData instanceof Uint8Array) {
    const buf = Buffer.from(rawData);
    return {
      ok: buf.byteLength <= MAX_VIEWABLE_ATTACHMENT_BYTES,
      mediaType: declaredMediaType ?? (part?.type === 'image' ? 'image/png' : 'application/octet-stream'),
      filename,
      bytes: buf,
    };
  }
  if (typeof rawData === 'string' && rawData.trim()) {
    const trimmed = rawData.trim();
    const dataUriMatch = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(trimmed);
    if (dataUriMatch) {
      const uriMediaType = dataUriMatch[1] || declaredMediaType || 'application/octet-stream';
      const isBase64 = Boolean(dataUriMatch[2]);
      const body = dataUriMatch[3] ?? '';
      const buf = isBase64 ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf8');
      return {
        ok: buf.byteLength <= MAX_VIEWABLE_ATTACHMENT_BYTES,
        mediaType: uriMediaType,
        filename,
        bytes: buf,
      };
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return {
        ok: false,
        reason: 'Remote URL attachments are not inline-viewable; inspect the URL reference directly.',
        mediaType: declaredMediaType,
        filename,
      };
    }
    const base64Clean = trimmed.replace(/\s+/g, '');
    const looksBase64 =
      base64Clean.length >= 4 &&
      base64Clean.length % 4 === 0 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(base64Clean);
    const buf = looksBase64 ? Buffer.from(base64Clean, 'base64') : Buffer.from(trimmed, 'utf8');
    return {
      ok: buf.byteLength <= MAX_VIEWABLE_ATTACHMENT_BYTES,
      mediaType: declaredMediaType ?? (part?.type === 'image' ? 'image/png' : 'application/octet-stream'),
      filename,
      bytes: buf,
    };
  }
  return {
    ok: false,
    reason: 'This attachment has no stored inline payload.',
    mediaType: declaredMediaType,
    filename,
  };
};

const decodeReadableAttachmentText = (bytes: Buffer, mediaType: string | null): string | null => {
  if (!bytes.byteLength) return null;
  if (mediaType && /^image\//i.test(mediaType)) return null;
  const raw = bytes.toString('utf8');
  if (mediaType && (/^text\//i.test(mediaType) || /json|xml|csv|markdown/i.test(mediaType))) {
    return raw;
  }
  if (mediaType === 'application/pdf' || raw.startsWith('%PDF-')) {
    const parenthetical = [...raw.matchAll(/\(([^()\\]{3,})\)/g)].map((m) => m[1]);
    if (parenthetical.length) return parenthetical.join(' ');
  }
  return null;
};

export const conversationHistoryTool = (memory: Pick<Memory, 'getThreadById' | 'recall'> & Record<string, any>) => createTool({
  id: 'read-conversation-history',
  description: 'Read earlier messages or retained attachments in this same private conversation from native Mastra memory (and active in-memory messages when includeActive is true). Use when a goal, constraint, supplied text or uploaded attachment (image/PDF/file) is outside recent context. Page0 is newest; increase page to read older messages. Text excerpts give totalCharacters/nextOffset; read the same page and messageId with offset to continue a long message. To inspect a retained attachment on a message, pass messageId, partIndex and viewAttachment: true. Historical text is context, not fresh approval. No model or external search is run.',
  inputSchema: z.object({
    page: z.number().int().min(0).max(1_000_000).optional(),
    perPage: z.number().int().min(1).max(20).optional(),
    messageId: z.string().min(1).max(128).optional(),
    partIndex: z.number().int().min(0).max(500).optional(),
    viewAttachment: z.boolean().optional(),
    includeActive: z.boolean().optional(),
    mode: z.enum(['messages', 'observations']).optional(),
    groupId: z.string().min(1).max(128).optional(),
    direction: z.enum(['before', 'after']).optional(),
    offset: z.number().int().min(0).max(10_000_000).optional(),
    length: z.number().int().min(1).max(12_000).optional(),
  }),
  execute: async (input, context) => {
    // Mastra's server-owned memory keys are added outside the tool input schema.
    const requestContext = context?.requestContext as Parameters<typeof readCapabilityIdentity>[0];
    const identity = readCapabilityIdentity(requestContext);
    const contextGet = (requestContext as { get?: (key: string) => unknown } | undefined)?.get?.bind(requestContext);
    const threadId = contextGet?.(MASTRA_THREAD_ID_KEY as never) as string | undefined;
    const resourceId = contextGet?.(MASTRA_RESOURCE_ID_KEY as never) as string | undefined;
    if (!identity || !threadId || resourceId !== `${identity.organizationId}:${identity.userId}`) {
      return { ok: false, code: 'AGENT_NOT_YOURS', message: 'A server-owned conversation identity is required.' };
    }
    const thread = await memory.getThreadById({ threadId });
    if (!thread || thread.resourceId !== resourceId) return { ok: false, code: 'AGENT_NOT_YOURS' };

    if (input.mode === 'observations') {
      const om = await (memory as any).omEngine;
      if (!om || typeof om.getObservations !== 'function') {
        return {
          ok: true,
          mode: 'observations' as const,
          groups: [],
          count: 0,
          note: 'Observational memory is not active on this thread; use mode="messages" to read conversation history.',
        };
      }
      const observations = await om.getObservations({
        threadId,
        resourceId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
        ...(input.direction ? { direction: input.direction } : {}),
      });
      return {
        ok: true,
        mode: 'observations' as const,
        groups: wrapUntrusted(observations ?? [], ['workspace-text']),
      };
    }

    const activeMessages: any[] =
      input.includeActive && typeof (context as any)?.agent?.getMessages === 'function'
        ? (() => {
            try {
              const list = (context as any).agent.getMessages();
              return (Array.isArray(list) ? list : []).filter(
                (msg: any) =>
                  (!msg?.threadId || msg.threadId === threadId) &&
                  (!msg?.resourceId || msg.resourceId === resourceId)
              );
            } catch {
              return [];
            }
          })()
        : [];

    const page = input.page ?? 0;
    const perPage = input.perPage ?? 10;
    const offset = input.offset ?? 0;
    const length = input.length ?? 4_000;

    if (input.viewAttachment) {
      if (!input.messageId || input.partIndex === undefined) {
        return {
          ok: false,
          code: 'ATTACHMENT_PART_REQUIRED',
          message: 'Pass both messageId and partIndex with viewAttachment: true.',
        };
      }
      let target = activeMessages.find((m) => m?.id === input.messageId);
      if (!target) {
        const recalled = await memory.recall({
          threadId,
          resourceId,
          page,
          perPage: Math.min(Math.max(perPage, 10), 20),
          orderBy: { field: 'createdAt', direction: 'DESC' },
        });
        target = recalled.messages.find((m: any) => m?.id === input.messageId);
      }
      if (!target) {
        return {
          ok: false,
          code: 'ATTACHMENT_NOT_FOUND',
          message: `Message ${input.messageId} was not found on page ${page}.`,
        };
      }
      const parts = messagePartsOf(target);
      const rawPart = parts[input.partIndex];
      if (!rawPart || (rawPart.type !== 'image' && rawPart.type !== 'file')) {
        return {
          ok: false,
          code: 'ATTACHMENT_NOT_FOUND',
          message: `Part ${input.partIndex} of message ${input.messageId} is not an image or file attachment.`,
        };
      }
      const extracted = extractAttachmentPayload(rawPart);
      if (!extracted.ok || !extracted.bytes) {
        return {
          ok: false,
          code: 'ATTACHMENT_NOT_VIEWABLE',
          message: extracted.reason ?? 'This attachment cannot be viewed inline.',
        };
      }
      const decodedText = decodeReadableAttachmentText(extracted.bytes, extracted.mediaType);
      const redactedText = decodedText ? redactSecretShapes(decodedText) : null;
      const textEnd = redactedText ? Math.min(redactedText.length, offset + length) : 0;
      return {
        ok: true,
        viewAttachment: true,
        messageId: target.id,
        partIndex: input.partIndex,
        attachment: {
          type: rawPart.type as 'image' | 'file',
          mediaType: extracted.mediaType,
          filename: extracted.filename,
          byteLength: extracted.bytes.byteLength,
          data: extracted.bytes.toString('base64'),
          ...(redactedText !== null
            ? {
                text: redactedText.slice(offset, textEnd),
                totalCharacters: redactedText.length,
                truncated: textEnd < redactedText.length,
                ...(textEnd < redactedText.length ? { nextOffset: textEnd } : {}),
              }
            : {}),
        },
      };
    }

    const result = await memory.recall({ threadId, resourceId, page, perPage,
      orderBy: { field: 'createdAt', direction: 'DESC' } });
    const combinedRaw = input.includeActive && activeMessages.length
      ? [
          ...result.messages,
          ...activeMessages.filter(
            (active) => !result.messages.some((stored: any) => stored.id === active.id)
          ),
        ]
      : result.messages;

    const messages = combinedRaw
      .filter((message) => !input.messageId || message.id === input.messageId)
      .map((message) => {
        const parts = messagePartsOf(message);
        const sourceText =
          input.partIndex !== undefined && parts[input.partIndex]
            ? typeof parts[input.partIndex]?.text === 'string'
              ? parts[input.partIndex].text
              : JSON.stringify(parts[input.partIndex])
            : historyText(message);
        const text = redactSecretShapes(sourceText);
        const end = Math.min(text.length, offset + length);
        const attachments = attachmentSummaryOf(message);
        return {
          id: message.id,
          role: message.role,
          createdAt: message.createdAt,
          text: text.slice(offset, end),
          totalCharacters: text.length,
          ...(end < text.length ? { nextOffset: end, truncated: true } : { truncated: false }),
          ...(attachments.length ? { attachments } : {}),
        };
      });
    return { ok: true, page, perPage, total: result.total, hasMore: result.hasMore,
      ...(input.messageId && !messages.length ? { messageNotInPage: true } : {}),
      messages: wrapUntrusted(messages, ['workspace-text', 'foreign-post', 'uploaded-file']) };
  },
  toModelOutput: (output: any) => {
    if (
      output?.ok === true &&
      output?.viewAttachment === true &&
      output?.attachment?.data &&
      output?.attachment?.mediaType
    ) {
      const { data, ...meta } = output.attachment;
      return {
        type: 'content',
        value: [
          {
            type: 'text',
            text: JSON.stringify(
              wrapUntrusted(
                {
                  ok: true,
                  viewAttachment: true,
                  messageId: output.messageId,
                  partIndex: output.partIndex,
                  attachment: meta,
                },
                ['uploaded-file']
              )
            ),
          },
          {
            type: 'media',
            data,
            mediaType: output.attachment.mediaType,
          },
        ],
      };
    }
    return { type: 'json', value: output };
  },
});
