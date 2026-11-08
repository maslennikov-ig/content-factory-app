import { readMediaSource } from './media.source';
import { MAX_IMAGE_UPLOAD_SIZE } from '@contentfactory/nestjs-libraries/upload/upload.limits';

export const readOrFetch = async (path: string) => {
  const media = await readMediaSource(path, { maxBytes: MAX_IMAGE_UPLOAD_SIZE });
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of media.stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  } finally { media.close(); }
};
