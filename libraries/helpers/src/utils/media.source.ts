import { constants } from 'node:fs';
import { open, realpath, mkdtemp, rm, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { relative, resolve, sep, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable, addAbortSignal } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ssrfSafeDispatcher } from '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { isSafePublicHttpsUrl } from '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { MAX_VIDEO_UPLOAD_SIZE } from '@contentfactory/nestjs-libraries/upload/upload.limits';

export type MediaReadOptions = {
  maxBytes?: number;
  signal?: AbortSignal;
  headersTimeoutMs?: number;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
  range?: string;
  localIfRange?: string;
  localMetadataOnly?: boolean;
};
export type MediaSourceV1 = {
  stream: Readable;
  size?: number;
  contentType?: string;
  contentRange?: string;
  status?: number;
  modifiedAt?: Date;
  close: () => void;
};

export class UnsatisfiableLocalMediaRange extends Error {
  constructor(readonly size: number) {
    super('MEDIA_RANGE_INVALID');
  }
}

/** An object key is decoded exactly once, before resolving any filesystem path. */
export function safeMediaObjectKey(value: string): string {
  let key: string;
  try { key = decodeURIComponent(value); } catch { throw new Error('MEDIA_PATH_INVALID'); }
  if (!key || key.length > 2048 || /[\0\\?#]/.test(key) || key.startsWith('/') ||
      key.split('/').some(part => !part || part === '.' || part === '..') ||
      /^[a-z][a-z0-9+.-]*:/i.test(key)) throw new Error('MEDIA_PATH_INVALID');
  return key;
}

function localKey(source: string, root: string): string | undefined {
  if (/^https?:/i.test(source)) {
    const url = new URL(source);
    const frontend = process.env.FRONTEND_URL && new URL(process.env.FRONTEND_URL);
    if ((process.env.STORAGE_PROVIDER || 'local') !== 'local' || !frontend ||
        url.origin !== frontend.origin || !url.pathname.startsWith('/uploads/')) return undefined;
    if (url.username || url.password || url.search || url.hash) throw new Error('MEDIA_PATH_INVALID');
    return safeMediaObjectKey(url.pathname.slice('/uploads/'.length));
  }
  if (source.startsWith('uploads/')) return safeMediaObjectKey(source.slice('uploads/'.length));
  if (source.startsWith('/uploads/')) return safeMediaObjectKey(source.slice('/uploads/'.length));
  const child = relative(resolve(root), resolve(root, source));
  if (!child || child === '..' || child.startsWith('..' + sep) || child.startsWith(sep))
    throw new Error('MEDIA_PATH_OUTSIDE_STORAGE');
  return safeMediaObjectKey(child.split(sep).join('/'));
}

/** Resolve through directory descriptors: a symlink replacement cannot escape the root. */
export async function openConfinedMediaFile(source: string, root = process.env.UPLOAD_DIRECTORY): Promise<FileHandle> {
  if (!root) throw new Error('MEDIA_STORAGE_UNCONFIGURED');
  const key = localKey(source, root);
  if (!key) throw new Error('MEDIA_PATH_OUTSIDE_STORAGE');
  const base = await realpath(root);
  const parts = key.split('/');
  let directory = await open(base, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    for (const part of parts.slice(0, -1)) {
      const next = await open(`/proc/self/fd/${directory.fd}/${part}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      await directory.close(); directory = next;
    }
    const file = await open(`/proc/self/fd/${directory.fd}/${parts[parts.length - 1]}`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1) throw new Error('MEDIA_FILE_INVALID');
      return file;
    } catch (error) { await file.close(); throw error; }
  } finally { await directory.close(); }
}

export async function removeConfinedMediaFile(source: string, root = process.env.UPLOAD_DIRECTORY): Promise<void> {
  if (!root) throw new Error('MEDIA_STORAGE_UNCONFIGURED');
  const key = localKey(source, root);
  if (!key) throw new Error('MEDIA_PATH_OUTSIDE_STORAGE');
  const parts = key.split('/');
  let directory = await open(await realpath(root), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    for (const part of parts.slice(0, -1)) {
      const next = await open(`/proc/self/fd/${directory.fd}/${part}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      await directory.close(); directory = next;
    }
    const target = `/proc/self/fd/${directory.fd}/${parts[parts.length - 1]}`;
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try { const stat = await file.stat(); if (!stat.isFile() || stat.nlink !== 1) throw new Error('MEDIA_FILE_INVALID'); }
    finally { await file.close(); }
    await unlink(target);
  } finally { await directory.close(); }
}

function within<T>(promise: Promise<T>, milliseconds: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { onTimeout(); reject(new Error('MEDIA_READ_TIMEOUT')); }, milliseconds);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** One bounded reader for provider media, imports and scoped preview attachments. */
export async function readMediaSource(source: string, options: MediaReadOptions = {}): Promise<MediaSourceV1> {
  const maxBytes = Math.min(options.maxBytes ?? MAX_VIDEO_UPLOAD_SIZE, MAX_VIDEO_UPLOAD_SIZE);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('MEDIA_LIMIT_INVALID');
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  signal.throwIfAborted();
  const total = setTimeout(() => controller.abort(new Error('MEDIA_READ_TIMEOUT')), options.totalTimeoutMs ?? 600_000);
  total.unref?.();
  let input: AsyncIterable<Uint8Array>;
  let size: number | undefined;
  let contentType: string | undefined;
  let contentRange: string | undefined;
  let status = 200;
  let modifiedAt: Date | undefined;
  if (options.range && (options.range.length > 80 || !/^bytes=(\d*)-(\d*)$/.test(options.range) || options.range === 'bytes=-')) { clearTimeout(total); throw new Error('MEDIA_RANGE_INVALID'); }
  let dispose: () => void = () => {};
  let output: Readable | undefined;
  const close = () => { clearTimeout(total); controller.abort(); dispose(); output?.destroy(); };
  try {
    const root = process.env.UPLOAD_DIRECTORY;
    const key = root ? localKey(source, root) : undefined;
    if (key !== undefined || !/^https:/i.test(source)) {
      const file = await openConfinedMediaFile(source, root);
      const fileStat = await file.stat();
      size = fileStat.size; modifiedAt = fileStat.mtime;
      if (size > maxBytes) { await file.close(); throw new Error('MEDIA_TOO_LARGE'); }
      let start: number | undefined, end: number | undefined;
      if (options.localMetadataOnly) {
        await file.close();
        clearTimeout(total);
        return { stream: Readable.from([]), size, status, modifiedAt, close };
      }
      if (options.range && (!options.localIfRange || options.localIfRange === modifiedAt.toUTCString())) {
        const [, first, last] = /^bytes=(\d*)-(\d*)$/.exec(options.range)!;
        const totalSize = size;
        start = first ? Number(first) : Math.max(0, totalSize - Number(last));
        end = first && last ? Math.min(Number(last), totalSize - 1) : totalSize - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= totalSize) {
          await file.close();
          throw new UnsatisfiableLocalMediaRange(totalSize);
        }
        contentRange = `bytes ${start}-${end}/${totalSize}`;
        size = end - start + 1; status = 206;
      }
      const stream = addAbortSignal(signal, file.createReadStream({ autoClose: true, start, end }));
      dispose = () => stream.destroy();
      input = stream;
    } else {
      let url = source;
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 5; redirects++) {
        signal.throwIfAborted();
        if (!(await within(isSafePublicHttpsUrl(url), options.headersTimeoutMs ?? 10_000, () => controller.abort())))
          throw new Error('MEDIA_URL_UNSAFE');
        response = await within(fetch(url, {
          redirect: 'manual', signal,
          ...(options.range ? { headers: { Range: options.range } } : {}),
          // @ts-ignore Node fetch uses the pinned, SSRF-safe undici dispatcher.
          dispatcher: ssrfSafeDispatcher,
        }), options.headersTimeoutMs ?? 10_000, () => controller.abort());
        if (response.status < 300 || response.status >= 400) break;
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirects === 5) throw new Error('MEDIA_REDIRECT_INVALID');
        url = new URL(location, url).toString();
      }
      if (response?.status === 416) { await response.body?.cancel(); throw new Error('MEDIA_RANGE_INVALID'); }
      if (!response?.ok || !response.body) { await response?.body?.cancel(); throw new Error('MEDIA_HTTP_FAILED'); }
      const length = response.headers.get('content-length');
      // A compressed response's content-length describes the encoded bytes, not this stream.
      size = length && !response.headers.get('content-encoding') ? Number(length) : undefined;
      if (size !== undefined && (!Number.isSafeInteger(size) || size < 0 || size > maxBytes)) {
        await response.body.cancel(); throw new Error('MEDIA_TOO_LARGE');
      }
      contentType = response.headers.get('content-type')?.split(';')[0]?.slice(0, 100);
      status = response.status;
      if (status === 206) {
        contentRange = response.headers.get('content-range') || undefined;
        if (!contentRange || !/^bytes \d+-\d+\/\d+$/.test(contentRange)) { await response.body.cancel(); throw new Error('MEDIA_RANGE_INVALID'); }
      }
      const reader = response.body.getReader();
      dispose = () => { void reader.cancel().catch(() => {}); };
      input = { [Symbol.asyncIterator]: () => ({
        next: async () => { const chunk = await reader.read(); return chunk.done ? { done: true as const, value: undefined } : { done: false as const, value: chunk.value }; },
        return: async () => { await reader.cancel(); return { done: true as const, value: undefined }; },
      }) };
    }
    const chunks = input;
    output = Readable.from((async function* () {
      let bytes = 0;
      const iterator = chunks[Symbol.asyncIterator]();
      try {
        for (;;) {
          signal.throwIfAborted();
          const chunk = await within(iterator.next(), options.idleTimeoutMs ?? 30_000, () => controller.abort());
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maxBytes) throw new Error('MEDIA_TOO_LARGE');
          yield chunk.value;
        }
        if (size !== undefined && bytes !== size) throw new Error('MEDIA_BODY_INCOMPLETE');
      } finally { await iterator.return?.(); clearTimeout(total); }
    })());
    output.once('close', () => { clearTimeout(total); controller.abort(); dispose(); });
    return { stream: output, size, contentType, contentRange, status, modifiedAt, close };
  } catch (error) { close(); throw error; }
}

/** SDKs requiring a filename receive an owned temporary file, never a video-sized Buffer. */
export async function spoolMediaSource(source: string, options: MediaReadOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'cf-media-'));
  const path = join(directory, 'media');
  const media = await readMediaSource(source, options).catch(async error => { await rm(directory, { recursive: true, force: true }); throw error; });
  try {
    const file = await open(path, 'wx', 0o600);
    await pipeline(media.stream, file.createWriteStream());
    const close = async () => { media.close(); await rm(directory, { recursive: true, force: true }); };
    return { path, size: (await (await import('node:fs/promises')).stat(path)).size, dispose: close, close };
  } catch (error) { media.close(); await rm(directory, { recursive: true, force: true }); throw error; }
}
