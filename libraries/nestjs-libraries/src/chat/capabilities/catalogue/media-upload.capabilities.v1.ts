import { z } from 'zod';
import { MediaController } from '@contentfactory/backend/api/routes/media.controller';
import { McpMediaUploadServiceV1 } from '@contentfactory/nestjs-libraries/chat/media/mcp-media-upload.service.v1';
import { MAX_IMAGE_UPLOAD_SIZE } from '@contentfactory/nestjs-libraries/upload/upload.limits';
import { defineCapability, door, type CapabilityRunContext } from '../capability.types';
import { codedFailure } from './selection';
import { UPLOAD_WIDGET_URI_V1 } from '../../ui/media-upload.widget.v1';

const localPhoto = z.object({
  name: z.string().min(1).max(255).regex(/^[^\x00-\x1f/\\]+$/),
  size: z.number().int().positive().max(MAX_IMAGE_UPLOAD_SIZE),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  uploadProofSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

function prepareLocalPhoto(ctx: CapabilityRunContext, photo: z.infer<typeof localPhoto>) {
  const { name, size, sha256, uploadProofSha256 } = photo;
  if (!name || !size || !sha256 || !uploadProofSha256) {
    throw codedFailure('MEDIA_UPLOAD_INVALID', 'Supply the photo name, size and both digests.');
  }
  return ctx.service(McpMediaUploadServiceV1).preparePhoto(ctx, { name, size, sha256, uploadProofSha256 });
}

export const mediaUploadV1 = defineCapability({
  id: 'media.upload', group: 'media', entrances: ['mcp'],
  label: { ru: 'Загрузить файл', en: 'Upload a file' },
  description: 'Open the manual file picker with no arguments. For a photo already available in the workspace, use media_prepare_photo. The photo argument remains supported for older clients.',
  input: z.object({ photo: localPhoto.optional() }).strict(),
  risk: 'write', door: door(MediaController, 'uploadSimple'), untrusted: [],
  mcpApp: { resourceUri: UPLOAD_WIDGET_URI_V1 },
  run: (ctx, input) => input.photo ? prepareLocalPhoto(ctx, input.photo) : ctx.service(McpMediaUploadServiceV1).create(ctx),
  summarize: output => ({ ...output }),
});

export const mediaPreparePhotoV1 = defineCapability({
  id: 'media.prepare_photo', group: 'media', entrances: ['mcp'],
  label: { ru: 'Подготовить загрузку фото', en: 'Prepare a photo upload' },
  description: 'Prepare a local photo for direct multipart upload without opening a file picker. Pass its basename, size, SHA-256 and the SHA-256 of a locally generated 32-byte random base64url proof. Keep the proof local. Send file as multipart field file to the returned uploadUrl on the configured Content Factory origin with Accept: application/json; cf-upload-ticket=<proof>. Never pass file bytes, base64, local paths or the proof itself as tool arguments. Check media_upload_status for ready and the mediaId.',
  input: z.object({ photo: localPhoto }).strict(),
  risk: 'write', door: door(MediaController, 'uploadSimple'), untrusted: [],
  run: (ctx, input) => prepareLocalPhoto(ctx, input.photo),
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

export const MEDIA_UPLOAD_CAPABILITIES_V1 = [mediaUploadV1, mediaPreparePhotoV1, mediaUploadTicketV1, mediaUploadStatusV1, mediaInspectV1] as const;
