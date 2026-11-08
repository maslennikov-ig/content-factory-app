import type { FileHandle } from 'node:fs/promises';

/** Read one bounded range from a descriptor-owned spool. Never accept a short part. */
export async function readUploadChunk(
  file: FileHandle,
  start: number,
  length: number
): Promise<Buffer> {
  if (
    !Number.isSafeInteger(start) ||
    start < 0 ||
    !Number.isSafeInteger(length) ||
    length <= 0 ||
    length > 16 * 1024 * 1024
  ) {
    throw new Error('MEDIA_UPLOAD_RANGE_INVALID');
  }
  const chunk = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await file.read(
      chunk,
      offset,
      length - offset,
      start + offset
    );
    if (bytesRead === 0) throw new Error('MEDIA_UPLOAD_TRUNCATED');
    offset += bytesRead;
  }
  return chunk;
}
