import { validateExportPayload } from './bounds';
import type { UploadedMedia } from './types';

type Fetcher = (
  url: string,
  options?: RequestInit
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export async function uploadEditedMedia(
  fetcher: Fetcher,
  blob: Blob,
  filename: string,
  signal?: AbortSignal
): Promise<UploadedMedia> {
  validateExportPayload(blob);
  const body = new FormData();
  body.append('file', blob, filename);
  const response = await fetcher('/media/upload-simple', {
    method: 'POST',
    body,
    signal,
  });
  if (!response.ok)
    throw new Error(`Image upload failed (${response.status}).`);
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error('The media upload response is invalid.');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as Record<string, unknown>).id !== 'string' ||
    !(value as Record<string, unknown>).id ||
    typeof (value as Record<string, unknown>).path !== 'string' ||
    !(value as Record<string, unknown>).path
  )
    throw new Error('The media upload response is invalid.');
  const record = value as Record<string, unknown>;
  return {
    id: record.id as string,
    path: record.path as string,
    name: typeof record.name === 'string' ? record.name : filename,
    originalName:
      typeof record.originalName === 'string' ? record.originalName : null,
    thumbnail: typeof record.thumbnail === 'string' ? record.thumbnail : null,
    alt: typeof record.alt === 'string' ? record.alt : null,
  };
}
