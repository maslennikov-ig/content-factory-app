import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { isSafePublicHttpsUrl } from '../../dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '../../dtos/webhooks/ssrf.safe.dispatcher';
import { measureMp4MovieHeaderDurationV1 } from '../../videos/production/video-production-result.v1';

const refuse = (): never => {throw new Error('TIKTOK_OWNED_VIDEO_INSPECTION_UNAVAILABLE');};
type Reader = {size: number; read(offset: number, length: number): Promise<Buffer>; finish(): Promise<void>; close(): Promise<void>};
type Box = {type: string; data: number; end: number};

/** Match local storage's descriptor walk: O_NOFOLLOW on the leaf alone cannot pin its parents. */
async function openPinnedLocalFile(file: string) {
  const flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  let directory = await open('/', flags);
  try {
    for (const part of dirname(file).split('/').filter(Boolean)) {
      const next = await open(`/proc/self/fd/${directory.fd}/${part}`, flags);
      const parent = directory; directory = next; await parent.close();
    }
    return await open(`/proc/self/fd/${directory.fd}/${basename(file)}`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } finally {await directory.close();}
}

/** Only current local uploads or the configured owned bucket; never arbitrary URLs or full video allocation. */
async function ownedReader(path: string): Promise<Reader> {
  const url = new URL(path);
  if (url.username || url.password || url.hash) refuse();
  if ((process.env.STORAGE_PROVIDER || 'local') === 'local') {
    if (url.origin !== new URL(process.env.FRONTEND_URL!).origin || !/^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]+\.mp4$/.test(url.pathname) || url.search) refuse();
    const root = resolve(process.env.UPLOAD_DIRECTORY!), file = resolve(root, url.pathname.slice('/uploads/'.length));
    if (!file.startsWith(root + sep)) refuse();
    if (!(await realpath(file)).startsWith(await realpath(root) + sep)) refuse();
    const handle = await openPinnedLocalFile(file);
    try {
      const initial = await handle.stat();
      if (!initial.isFile() || !Number.isSafeInteger(initial.size) || initial.size < 16) refuse();
      return {size: initial.size, read: async (offset, length) => {
        const bytes = Buffer.alloc(length), result = await handle.read(bytes, 0, length, offset);
        if (result.bytesRead !== length) refuse(); return bytes;
      }, finish: async () => {
        const currentHandle = await openPinnedLocalFile(file);
        try {
          for (const current of [await handle.stat(), await currentHandle.stat()]) {
            if (current.ino !== initial.ino || current.dev !== initial.dev || current.size !== initial.size || current.mtimeMs !== initial.mtimeMs) refuse();
          }
        } finally {await currentHandle.close();}
      }, close: () => handle.close()};
    } catch (error) {await handle.close(); throw error;}
  }
  if (process.env.STORAGE_PROVIDER !== 'cloudflare' || !process.env.CLOUDFLARE_BUCKET_URL) refuse();
  const bucket = new URL(process.env.CLOUDFLARE_BUCKET_URL);
  const prefix = bucket.pathname.replace(/\/$/, '') + '/';
  if (url.origin !== bucket.origin || !url.pathname.startsWith(prefix) || !await isSafePublicHttpsUrl(url.href)) refuse();
  const signal = AbortSignal.timeout(30_000);
  const options = {redirect: 'error' as const, signal, dispatcher: ssrfSafeDispatcher};
  const head = await fetch(url.href, {...options, method: 'HEAD'} as RequestInit);
  const size = Number(head.headers.get('content-length')), etag = head.headers.get('etag');
  await head.body?.cancel();
  if (!head.ok || !Number.isSafeInteger(size) || size < 16 || !etag || !/^"[^"\r\n]+"$/.test(etag)) refuse();
  return {size, read: async (offset, length) => {
    const end = offset + length - 1;
    const response = await fetch(url.href, {...options, method: 'GET', headers: {Range: `bytes=${offset}-${end}`, 'If-Match': etag}} as RequestInit);
    if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${offset}-${end}/${size}` || !response.body) {
      await response.body?.cancel(); refuse();
    }
    const reader = response.body.getReader(), chunks: Buffer[] = []; let count = 0;
    try {while (true) {const next = await reader.read(); if (next.done) break;
      count += next.value.length; if (count > length) {await reader.cancel(); refuse();} chunks.push(Buffer.from(next.value));}}
    finally {reader.releaseLock();}
    if (count !== length) refuse(); return Buffer.concat(chunks);
  }, finish: async () => {}, close: async () => {}};
}

export async function inspectTikTokOwnedVideo(path: string): Promise<{durationSeconds: number; size: number}> {
  const reader = await ownedReader(path); let count = 0;
  const boxes = async (start: number, end: number): Promise<Box[]> => {
    const found: Box[] = [];
    for (let position = start; position < end;) {
      if (++count > 128 || end - position < 8) refuse();
      const header = await reader.read(position, Math.min(16, end - position));
      let size = header.readUInt32BE(0), width = 8;
      if (size === 1) {
        if (header.length < 16) refuse();
        const wide = header.readBigUInt64BE(8); if (wide > BigInt(Number.MAX_SAFE_INTEGER)) refuse();
        size = Number(wide); width = 16;
      } else if (size === 0) size = end - position;
      if (size < width || position + size > end) refuse();
      found.push({type: header.toString('ascii', 4, 8), data: position + width, end: position + size}); position += size;
    }
    return found;
  };
  const one = (values: Box[], type: string) => {const matches = values.filter(value => value.type === type); if (matches.length !== 1) refuse(); return matches[0];};
  try {
    const top = await boxes(0, reader.size);
    if (!top.some(box => box.type === 'ftyp') || !top.some(box => box.type === 'mdat' && box.end > box.data)) refuse();
    const movie = one(top, 'moov'), children = await boxes(movie.data, movie.end), header = one(children, 'mvhd');
    const durationSeconds = measureMp4MovieHeaderDurationV1(await reader.read(header.data, Math.min(32, header.end - header.data)));
    let video = false;
    for (const track of children.filter(box => box.type === 'trak')) {
      const content = await boxes(track.data, track.end), media = one(content, 'mdia');
      const handler = one(await boxes(media.data, media.end), 'hdlr');
      if (handler.end - handler.data < 12) refuse();
      if ((await reader.read(handler.data + 8, 4)).toString('ascii') === 'vide') video = true;
    }
    if (!video) refuse();
    await reader.finish(); return {durationSeconds, size: reader.size};
  } finally {await reader.close();}
}
