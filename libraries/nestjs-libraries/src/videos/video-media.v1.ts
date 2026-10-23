import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { fromBuffer } from 'file-type';
import { isSafePublicHttpsUrl } from '../dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '../dtos/webhooks/ssrf.safe.dispatcher';
import { UploadFactory } from '../upload/upload.factory';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { videoErrorV1 } from './video-brief.v1';

const VIDEO_BYTES = 100 * 1024 * 1024;
const IMAGE_BYTES = 20 * 1024 * 1024;

/** Each redirect and the actual DNS connection are checked, including rebinding. */
export async function downloadVideoAssetV1(url: string, limit = VIDEO_BYTES): Promise<Buffer> {
  let current = url;
  const signal = AbortSignal.timeout(60_000);
  for (let redirects = 0; redirects <= 4; redirects++) {
    let parsed: URL;
    try { parsed = new URL(current); } catch { return videoErrorV1('VIDEO_RESULT_URL_UNSAFE'); }
    if (parsed.username || parsed.password || !(await isSafePublicHttpsUrl(current))) return videoErrorV1('VIDEO_RESULT_URL_UNSAFE');
    const response = await fetch(current, {redirect: 'manual', signal, dispatcher: ssrfSafeDispatcher} as RequestInit);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 4) return videoErrorV1('VIDEO_RESULT_REDIRECT_LIMIT');
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); return videoErrorV1('VIDEO_RESULT_DOWNLOAD_FAILED'); }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > limit) { await response.body.cancel(); return videoErrorV1('VIDEO_RESULT_TOO_LARGE'); }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) { await reader.cancel(); return videoErrorV1('VIDEO_RESULT_TOO_LARGE'); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    if (!total) return videoErrorV1('VIDEO_RESULT_EMPTY');
    return Buffer.concat(chunks, total);
  }
  return videoErrorV1('VIDEO_RESULT_REDIRECT_LIMIT');
}

/** Structural validation, without encoding/transcoding or trusting a filename. */
export async function assertMp4VideoV1(bytes: Buffer) {
  const kind = await fromBuffer(bytes);
  if (kind?.mime !== 'video/mp4') return videoErrorV1('VIDEO_RESULT_NOT_MP4');
  let offset = 0;
  let hasMovie = false;
  let hasData = false;
  while (offset + 8 <= bytes.length) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) return videoErrorV1('VIDEO_RESULT_INVALID_MP4');
      const large = bytes.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return videoErrorV1('VIDEO_RESULT_INVALID_MP4');
      size = Number(large); header = 16;
    } else if (size === 0) size = bytes.length - offset;
    if (size < header || offset + size > bytes.length) return videoErrorV1('VIDEO_RESULT_INVALID_MP4');
    if (type === 'moov') hasMovie = bytes.subarray(offset + header, offset + size).includes(Buffer.from('vide'));
    if (type === 'mdat') hasData = size > header;
    offset += size;
  }
  if (offset !== bytes.length || !hasMovie || !hasData) return videoErrorV1('VIDEO_RESULT_INVALID_MP4');
}

@Injectable()
export class VideoMediaV1 {
  private readonly storage = UploadFactory.createStorage();

  async referenceDimensions(url: string) {
    const bytes = await downloadVideoAssetV1(url, IMAGE_BYTES);
    const kind = await fromBuffer(bytes);
    if (!kind || !['image/jpeg', 'image/png', 'image/webp'].includes(kind.mime)) return videoErrorV1('VIDEO_REFERENCE_NOT_IMAGE');
    const {width, height} = await sharp(bytes, {limitInputPixels: 40_000_000}).metadata();
    if (!width || !height) return videoErrorV1('VIDEO_REFERENCE_DIMENSIONS_UNKNOWN');
    return {width, height};
  }

  async importVideo(url: string) {
    const bytes = await downloadVideoAssetV1(url);
    await assertMp4VideoV1(bytes);
    const file = await this.storage.uploadFile({buffer: bytes, originalname: 'video.mp4', mimetype: 'video/mp4', size: bytes.length} as Express.Multer.File);
    return {name: String(file.originalname), path: String(file.path), size: bytes.length};
  }

  /** Read only a persisted owned storage path, never a provider/model-supplied URL. */
  async readOwned(path: string) {
    if ((process.env.STORAGE_PROVIDER || 'local') !== 'local') return downloadVideoAssetV1(path);
    const base = new URL(process.env.FRONTEND_URL!);
    const url = new URL(path);
    if (url.origin !== base.origin || !/^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]+\.mp4$/.test(url.pathname)) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    const root = resolve(process.env.UPLOAD_DIRECTORY!);
    const file = resolve(root, url.pathname.slice('/uploads/'.length));
    if (!file.startsWith(root + sep)) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    // Manual uploads can be larger than imported provider results. Bound allocation before reading.
    if ((await stat(file)).size > VIDEO_BYTES) return videoErrorV1('VIDEO_RESULT_TOO_LARGE');
    const bytes = await readFile(file);
    if (bytes.length > VIDEO_BYTES) return videoErrorV1('VIDEO_RESULT_TOO_LARGE');
    return bytes;
  }
}
