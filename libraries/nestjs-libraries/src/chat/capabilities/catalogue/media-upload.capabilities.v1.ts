import { z } from 'zod';
import { MediaController } from '@contentfactory/backend/api/routes/media.controller';
import { McpMediaUploadServiceV1 } from '@contentfactory/nestjs-libraries/chat/media/mcp-media-upload.service.v1';
import { defineCapability, door } from '../capability.types';
import { codedFailure } from './selection';
import { UPLOAD_WIDGET_URI_V1 } from '../../ui/media-upload.widget.v1';

export const mediaUploadV1 = defineCapability({
  id: 'media.upload', group: 'media', entrances: ['mcp'],
  label: { ru: 'Загрузить файл', en: 'Upload a file' },
  description: 'Open a local-file upload widget. The person selects the file; binary, base64, URLs and server filesystem paths never go into tool arguments. One file per session. Supported MCP Apps hosts render the widget. If the client has no widget, ask the person to upload at manualUploadUrl (/media), then use media.library and media.inspect. Opening a widget does not mean a file was uploaded; check media.upload_status for ready and its actual mediaId.',
  input: z.object({}).strict(), risk: 'write', door: door(MediaController, 'uploadSimple'), untrusted: [],
  mcpApp: { resourceUri: UPLOAD_WIDGET_URI_V1 },
  run: (ctx) => ctx.service(McpMediaUploadServiceV1).create(ctx),
  summarize: output => ({ ...output }),
});

export const mediaUploadTicketV1 = defineCapability({
  id: 'media.upload_ticket', group: 'media', entrances: ['mcp'],
  label: { ru: 'Разрешить выбранный файл', en: 'Authorize the selected file' },
  description: 'For the upload widget only: obtain a short-lived single-use ticket bound to the selected file, current person and workspace. File bytes are uploaded directly by the person, never passed to a model. The ticket is returned only in host metadata. Do not call this tool from the assistant conversation.',
  input: z.object({ sessionId: z.string().uuid(), file: z.object({ name: z.string().min(1).max(255), size: z.number().int().positive().max(1024 * 1024 * 1024), nonce: z.string().uuid() }).strict() }).strict(),
  risk: 'write', door: door(MediaController, 'uploadSimple'), untrusted: [],
  mcpApp: { visibility: ['app'] },
  run: async (ctx, input) => {
    if (!ctx.setMcpAppPrivateResult) throw codedFailure('MCP_APP_TRANSPORT_REQUIRED', 'Use the upload widget or upload the file in the media library.');
    const privateResult = await ctx.service(McpMediaUploadServiceV1).ticket(ctx, input.sessionId, { name: input.file.name, size: input.file.size, nonce: input.file.nonce });
    ctx.setMcpAppPrivateResult({ 'contentFactory/upload': privateResult });
    return { sessionId: input.sessionId, issued: true };
  },
  summarize: output => ({ ...output }),
});

export const mediaUploadStatusV1 = defineCapability({
  id: 'media.upload_status', group: 'media', entrances: ['mcp'],
  label: { ru: 'Статус загрузки', en: 'Upload status' },
  description: 'Read the actual upload session: waiting, uploading, ready or failed. Only ready supplies an owned mediaId and a temporary private previewUrl. No processing/transcoding is implied. Expired sessions are unavailable; never treat them as success. The session belongs to the current person and workspace.',
  input: z.object({ sessionId: z.string().uuid() }).strict(), risk: 'read', door: door(MediaController, 'getMedia'), untrusted: ['uploaded-file'],
  run: (ctx, input) => ctx.service(McpMediaUploadServiceV1).status(ctx, input.sessionId),
  summarize: output => ({ ...output }),
});

export const mediaInspectV1 = defineCapability({
  id: 'media.inspect', group: 'media', entrances: ['mcp'],
  label: { ru: 'Открыть файл', en: 'Inspect a media item' },
  description: 'Read an existing live workspace mediaId and obtain its name, inferred image/video kind and temporary private previewUrl. Foreign or deleted IDs are refused. Library defaults are not per-post alt/cover settings; inherited type/fileSize columns are not reliable. Use adaptation.image to attach by mediaId and set supported post-specific metadata.',
  input: z.object({ mediaId: z.string().uuid() }).strict(), risk: 'read', door: door(MediaController, 'getMedia'), untrusted: ['uploaded-file'],
  run: (ctx, input) => ctx.service(McpMediaUploadServiceV1).metadata(ctx, input.mediaId),
  summarize: output => ({ ...output }),
});

export const MEDIA_UPLOAD_CAPABILITIES_V1 = [mediaUploadV1, mediaUploadTicketV1, mediaUploadStatusV1, mediaInspectV1] as const;
