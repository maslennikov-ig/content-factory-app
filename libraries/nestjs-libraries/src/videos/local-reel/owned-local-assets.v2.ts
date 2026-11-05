import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { LOCAL_COMPOSITION_LIMITS_V2, type LocalCompositionOptionsV2, type LocalCompositionOwnedReferenceV2 } from './local-composition.v2';
import { measureMp4VideoV1 } from '../production/video-production-result.v1';

export const localCompositionErrorV2 = (code: string): never => {throw new Error('LOCAL_COMPOSITION_' + code);};
export async function assertLocalCompositionCurrentV2(options?: LocalCompositionOptionsV2) {
  if (options?.signal?.aborted) localCompositionErrorV2('ABORTED');
  await options?.assertCurrent?.();
  if (options?.signal?.aborted) localCompositionErrorV2('ABORTED');
}
export const localCompositionInsideV2 = (root: string, file: string) => {
  const part = relative(root, file);
  return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
};

/** All components are descriptor-relative; checking realpath then opening a lexical path is insufficient. */
export async function openLocalCompositionFileV2(file: string) {
  const flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  let directory = await open('/', flags);
  try {
    for (const part of dirname(file).split('/').filter(Boolean)) {
      const next = await open(`/proc/self/fd/${directory.fd}/${part}`, flags);
      const previous = directory; directory = next; await previous.close();
    }
    return await open(`/proc/self/fd/${directory.fd}/${basename(file)}`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } finally {await directory.close();}
}

export async function hashLocalCompositionFileV2(file: FileHandle, size: number, options?: LocalCompositionOptionsV2): Promise<string> {
  if (!Number.isSafeInteger(size) || size < 1 || size > LOCAL_COMPOSITION_LIMITS_V2.maxAssetBytes) localCompositionErrorV2('ASSET_LIMIT');
  const hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
  for (let offset = 0; offset < size;) {
    if (offset % (64 * 1024 * 1024) === 0) await assertLocalCompositionCurrentV2(options);
    const read = await file.read(buffer, 0, Math.min(buffer.length, size - offset), offset);
    if (!read.bytesRead) localCompositionErrorV2('ASSET_CHANGED');
    hash.update(buffer.subarray(0, read.bytesRead)); offset += read.bytesRead;
  }
  return hash.digest('hex');
}

/** Pin and revalidate the same fd through copying/probing/import. Consumers never reopen its lexical path. */
export async function withPinnedLocalCompositionFileV2<T>(asset: Pick<LocalCompositionOwnedReferenceV2, 'absolutePath' | 'sha256' | 'bytes'>,
  roots: readonly string[], consume: (file: FileHandle, assertUnchanged: () => Promise<void>) => Promise<T>, options?: LocalCompositionOptionsV2): Promise<T> {
  await assertLocalCompositionCurrentV2(options);
  if (typeof asset.absolutePath !== 'string' || typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256) || !isAbsolute(asset.absolutePath) || resolve(asset.absolutePath) !== asset.absolutePath ||
    !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > LOCAL_COMPOSITION_LIMITS_V2.maxAssetBytes ||
    !roots.some(root => root !== '/' && isAbsolute(root) && localCompositionInsideV2(resolve(root), asset.absolutePath))) localCompositionErrorV2('ASSET_OUTSIDE_OWNED_ROOT');
  const handle = await openLocalCompositionFileV2(asset.absolutePath);
  try {
    const initial = await handle.stat();
    if (!initial.isFile() || initial.size !== asset.bytes) localCompositionErrorV2('ASSET_CHANGED');
    const assertUnchanged = async () => {
      const current = await openLocalCompositionFileV2(asset.absolutePath);
      try {
        for (const info of [await handle.stat(), await current.stat()]) {
          if (!info.isFile() || info.ino !== initial.ino || info.dev !== initial.dev || info.size !== initial.size ||
            info.mtimeMs !== initial.mtimeMs || info.ctimeMs !== initial.ctimeMs) localCompositionErrorV2('ASSET_CHANGED');
        }
      } finally {await current.close();}
      await assertLocalCompositionCurrentV2(options);
    };
    if (await hashLocalCompositionFileV2(handle, asset.bytes, options) !== asset.sha256) localCompositionErrorV2('ASSET_DIGEST_MISMATCH');
    await assertUnchanged();
    const result = await consume(handle, assertUnchanged);
    await assertUnchanged();
    return result;
  } finally {await handle.close();}
}

async function readExact(file: FileHandle, offset: number, length: number) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 16 * 1024 * 1024) localCompositionErrorV2('HEADER_LIMIT');
  const bytes = Buffer.alloc(length); let at = 0;
  while (at < length) {const got = await file.read(bytes, at, length - at, offset + at); if (!got.bytesRead) localCompositionErrorV2('MP4_UNAVAILABLE'); at += got.bytesRead;}
  return bytes;
}

/** Read the actual bounded moov only, then reuse V1's movie/track math. SHA belongs to the whole pinned file. */
export async function measureLocalCompositionMp4V2(file: FileHandle, size: number, sha256: string) {
  let count = 0, position = 0, movie: Buffer | undefined, hasType = false, hasData = false;
  while (position < size) {
    if (++count > 10000 || size - position < 8) localCompositionErrorV2('MP4_UNAVAILABLE');
    const header = await readExact(file, position, Math.min(16, size - position));
    let length = header.readUInt32BE(0), width = 8;
    if (length === 1) {if (header.length < 16) localCompositionErrorV2('MP4_UNAVAILABLE');
      const wide = header.readBigUInt64BE(8); if (wide > BigInt(Number.MAX_SAFE_INTEGER)) localCompositionErrorV2('MP4_UNAVAILABLE'); length = Number(wide); width = 16;
    } else if (length === 0) length = size - position;
    if (length < width || position + length > size) localCompositionErrorV2('MP4_UNAVAILABLE');
    const type = header.toString('ascii', 4, 8);
    if (type === 'moov') {if (movie || length > 16 * 1024 * 1024) localCompositionErrorV2('HEADER_LIMIT'); movie = await readExact(file, position, length);}
    if (type === 'ftyp') hasType = true;
    if (type === 'mdat' && length > width) hasData = true;
    position += length;
  }
  if (!movie || !hasType || !hasData) localCompositionErrorV2('MP4_UNAVAILABLE');
  const type = Buffer.alloc(8), data = Buffer.alloc(8); type.writeUInt32BE(8); type.write('ftyp', 4); data.writeUInt32BE(8); data.write('mdat', 4);
  return {...measureMp4VideoV1(Buffer.concat([type, movie!, data])), sha256};
}
