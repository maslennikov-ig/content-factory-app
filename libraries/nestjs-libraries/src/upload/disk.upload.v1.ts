import { constants, createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { maxUploadSizeForMimeType, MAX_VIDEO_UPLOAD_SIZE } from './upload.limits';

const { fromBuffer } = require('file-type');

/** The path is a server-owned upload receipt, never a client-supplied path. */
export type DiskUploadFileV1 = {
  path: string;
  size: number;
  originalname: string;
  mimetype?: string;
};
export type DiskUploadResultV1 = {
  originalname: string;
  filename?: string;
  path: string;
  mimetype: string;
};

const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/avif', 'image/bmp', 'image/tiff', 'video/mp4',
]);

/** Pin a single regular file, sniff <=4100 bytes, then expose bounded chunks. */
export async function openDiskUploadV1(input: DiskUploadFileV1) {
  if (!input || typeof input.path !== 'string' || !Number.isSafeInteger(input.size) ||
      input.size <= 0 || input.size > MAX_VIDEO_UPLOAD_SIZE) throw new Error('DISK_UPLOAD_SIZE_INVALID');
  const file = await open(input.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const initial = await file.stat();
    if (!initial.isFile() || initial.nlink !== 1 || initial.size !== input.size) throw new Error('DISK_UPLOAD_FILE_INVALID');
    const prefix = Buffer.alloc(Math.min(4100, input.size));
    let read = 0;
    while (read < prefix.length) {
      const result = await file.read(prefix, read, prefix.length - read, read);
      if (!result.bytesRead) throw new Error('DISK_UPLOAD_SIZE_MISMATCH');
      read += result.bytesRead;
    }
    const detected = await fromBuffer(prefix);
    const limit = detected && maxUploadSizeForMimeType(detected.mime);
    if (!detected || !ALLOWED.has(detected.mime) || !limit) throw new Error('Unsupported file type.');
    if (input.size > limit) throw new Error('DISK_UPLOAD_SIZE_LIMIT');
    const assertUnchanged = async () => {
      const current = await file.stat();
      if (!current.isFile() || current.nlink !== 1 || current.size !== initial.size ||
          current.dev !== initial.dev || current.ino !== initial.ino ||
          current.mtimeMs !== initial.mtimeMs || current.ctimeMs !== initial.ctimeMs) {
        throw new Error('DISK_UPLOAD_FILE_CHANGED');
      }
    };
    // The transfer stream owns a duplicate descriptor; destroying it must not
    // close the validation descriptor used by assertUnchanged.
    const source = createReadStream(`/proc/self/fd/${file.fd}`, {autoClose:true,start:0,end:input.size-1,highWaterMark:64*1024});
    const stream = Readable.from((async function* () {
      let bytes = 0;
      try {
        for await (const chunk of source) { bytes += chunk.length; yield chunk; }
        if (bytes !== input.size) throw new Error('DISK_UPLOAD_SIZE_MISMATCH');
        await assertUnchanged();
      } finally { source.destroy(); }
    })());
    return {
      stream, size:input.size, mimetype:detected.mime as string, extension:detected.ext as string,
      assertUnchanged,
      close:async()=>{stream.destroy();source.destroy();await finished(source).catch(()=>{});await file.close();},
    };
  } catch (error) { await file.close(); throw error; }
}
