import { IUploadProvider } from './upload.interface';
import { mkdirSync, unlink, writeFileSync } from 'fs';
import { constants } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isSafePublicHttpsUrl } from '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { parseDataUrl } from '@contentfactory/nestjs-libraries/upload/data.url';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

const LOCAL_STORAGE_ALLOWED_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]);

export interface LocalReelUploadBindingV1 {
  organizationId: string;
  operationId: string;
  renderKey: string;
  contentSha256: string;
}
export interface LocalReelUploadIntentV1 extends LocalReelUploadBindingV1 {
  version: 1;
  date: string;
  target: string;
}
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const validBinding = (value: LocalReelUploadBindingV1) => value &&
  [value.organizationId, value.operationId].every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id)) &&
  [value.renderKey, value.contentSha256].every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash));
const reelTarget = (binding: LocalReelUploadBindingV1, date: string) =>
  `${date}/${sha256(JSON.stringify([1, binding.organizationId, binding.operationId, binding.renderKey, binding.contentSha256, date]))}.mp4`;

/** Pure server-selected intent; persist this before calling uploadLocalReel. */
export const createLocalReelUploadIntentV1 = (binding: LocalReelUploadBindingV1): LocalReelUploadIntentV1 => {
  if (!validBinding(binding)) throw new Error('LOCAL_REEL_UPLOAD_INTENT_INVALID');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  return { version: 1, ...binding, date, target: reelTarget(binding, date) };
};
export const assertLocalReelUploadIntentV1 = (intent: LocalReelUploadIntentV1, binding: LocalReelUploadBindingV1) => {
  if (!intent || !validBinding(binding) || intent.version !== 1 ||
      Object.keys(intent).sort().join(',') !== 'contentSha256,date,operationId,organizationId,renderKey,target,version' ||
      !/^\d{4}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])$/.test(intent.date) ||
      ['organizationId', 'operationId', 'renderKey', 'contentSha256'].some(key => intent[key as keyof LocalReelUploadBindingV1] !== binding[key as keyof LocalReelUploadBindingV1]) ||
      intent.target !== reelTarget(binding, intent.date)) throw new Error('LOCAL_REEL_UPLOAD_INTENT_INVALID');
};

/** Anchor every directory component to an open descriptor, refusing symlinks. */
const openDirectory = async (root: string): Promise<FileHandle> => {
  const flags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  let directory = await open('/', flags);
  try {
    for (const part of resolve(root).split('/').filter(Boolean)) {
      const next = await open(`/proc/self/fd/${directory.fd}/${part}`, flags);
      const parent = directory; directory = next; await parent.close();
    }
    return directory;
  } catch (error) { await directory.close(); throw error; }
};

export class LocalStorage implements IUploadProvider {
  constructor(private uploadDirectory: string) {}

  /** Opt-in Linux local import. Existing random-name uploads are unchanged. */
  async uploadLocalReel(buffer: Buffer, intent: LocalReelUploadIntentV1, binding: LocalReelUploadBindingV1, beforeWrite: () => Promise<void>) {
    assertLocalReelUploadIntentV1(intent, binding);
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 100 * 1024 * 1024 || sha256(buffer) !== binding.contentSha256)
      throw new Error('LOCAL_REEL_UPLOAD_CONTENT_MISMATCH');
    const detected = await fromBuffer(buffer);
    if (detected?.mime !== 'video/mp4' || detected.ext !== 'mp4') throw new Error('Unsupported file type.');
    if (process.platform !== 'linux') throw new Error('LOCAL_REEL_UPLOAD_PLATFORM_UNSUPPORTED');
    let directory = await openDirectory(this.uploadDirectory);
    let file: FileHandle | undefined;
    try {
      for (const part of intent.date.split('/')) {
        const nextPath = `/proc/self/fd/${directory.fd}/${part}`;
        try { await mkdir(nextPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        const next = await open(nextPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        const parent = directory; directory = next; await parent.close();
      }
      const filename = intent.target.split('/').pop()!;
      const target = `/proc/self/fd/${directory.fd}/${filename}`;
      await beforeWrite();
      let reused = false;
      try { file = await open(target, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        reused = true;
        file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      }
      if (!reused) { await file.writeFile(buffer); await file.sync(); }
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1 || info.size !== buffer.length) throw new Error('LOCAL_REEL_UPLOAD_CONTENT_MISMATCH');
      const existing = Buffer.alloc(buffer.length);
      let offset = 0;
      while (offset < existing.length) {
        const read = await file.read(existing, offset, existing.length - offset, offset);
        if (!read.bytesRead) throw new Error('LOCAL_REEL_UPLOAD_CONTENT_MISMATCH');
        offset += read.bytesRead;
      }
      if (sha256(existing) !== binding.contentSha256) throw new Error('LOCAL_REEL_UPLOAD_CONTENT_MISMATCH');
      return { filename, originalname: filename, mimetype: 'video/mp4', path: process.env.FRONTEND_URL + '/uploads/' + intent.target, reused };
    } finally { try { await file?.close(); } finally { await directory.close(); } }
  }

  async uploadSimple(path: string) {
    const dataUrl = path.startsWith('data:') ? parseDataUrl(path) : null;

    let body: Buffer;
    if (dataUrl) {
      body = dataUrl.buffer;
    } else {
      if (!(await isSafePublicHttpsUrl(path))) {
        throw new Error('Unsafe URL');
      }
      const loadImage = await fetch(path, {
        // @ts-ignore — undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      });
      body = Buffer.from(await loadImage.arrayBuffer());
    }

    // Never trust the claimed mime/extension (data URL header, remote
    // content-type, or URL path): sniff the real type from the bytes and
    // only accept the allow-list, otherwise an attacker could write an
    // arbitrary file (e.g. .html/.svg with embedded script) into the
    // publicly served uploads directory on the app's own origin.
    const detected = await fromBuffer(body);
    if (!detected || !LOCAL_STORAGE_ALLOWED_MIME.has(detected.mime)) {
      throw new Error('Unsupported file type.');
    }
    const findExtension = detected.ext;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const innerPath = `/${year}/${month}/${day}`;
    const dir = `${this.uploadDirectory}${innerPath}`;
    mkdirSync(dir, { recursive: true });

    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('');

    const filePath = `${dir}/${randomName}.${findExtension}`;
    const publicPath = `${innerPath}/${randomName}.${findExtension}`;
    // Logic to save the file to the filesystem goes here
    writeFileSync(filePath, body);

    return process.env.FRONTEND_URL + '/uploads' + publicPath;
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    try {
      const detected = await fromBuffer(file.buffer);
      if (!detected || !LOCAL_STORAGE_ALLOWED_MIME.has(detected.mime)) {
        throw new Error('Unsupported file type.');
      }
      const safeExt = `.${detected.ext}`;
      const safeMime = detected.mime;

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');

      const innerPath = `/${year}/${month}/${day}`;
      const dir = `${this.uploadDirectory}${innerPath}`;
      mkdirSync(dir, { recursive: true });

      const randomName = Array(32)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');

      const filePath = `${dir}/${randomName}${safeExt}`;
      const publicPath = `${innerPath}/${randomName}${safeExt}`;

      writeFileSync(filePath, file.buffer);

      return {
        filename: `${randomName}${safeExt}`,
        path: process.env.FRONTEND_URL + '/uploads' + publicPath,
        mimetype: safeMime,
        originalname: `${randomName}${safeExt}`,
      };
    } catch (err) {
      console.error('Error uploading file to Local Storage:', err);
      throw err;
    }
  }

  async removeFile(filePath: string): Promise<void> {
    // Logic to remove the file from the filesystem goes here
    return new Promise((resolve, reject) => {
      unlink(filePath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
