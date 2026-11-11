import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { fromBuffer } from 'file-type';
import { parseBuffer } from 'music-metadata';
import { createHash } from 'node:crypto';
import { isSafePublicHttpsUrl } from '../dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '../dtos/webhooks/ssrf.safe.dispatcher';
import { UploadFactory } from '../upload/upload.factory';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { authoredCaptionFileV1, CaptionCueV1, measureMp4VideoV1, StoredSubtitleV1 } from './production/video-production-result.v1';
import { storeOwnedVideoSubtitleV1 } from './production/video-subtitle.storage.v1';
import { videoErrorV1 } from './video-brief.v1';

const VIDEO_BYTES = 100 * 1024 * 1024;
const IMAGE_BYTES = 20 * 1024 * 1024;
const AUDIO_BYTES = 100 * 1024 * 1024;

export async function inspectCreativeImageBytesV1(bytes: Buffer) {
  const kind = await fromBuffer(bytes);
  if (!kind || !['image/png', 'image/jpeg', 'image/webp'].includes(kind.mime) || bytes.length > IMAGE_BYTES) return videoErrorV1('VIDEO_REFERENCE_NOT_IMAGE');
  const image = sharp(bytes, {limitInputPixels: 40_000_000}), metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.pages && metadata.pages !== 1) return videoErrorV1('VIDEO_REFERENCE_DIMENSIONS_UNKNOWN');
  await image.stats(); // Decode the actual pixels, rather than trusting a file header.
  return {mimeType: kind.mime as 'image/png' | 'image/jpeg' | 'image/webp', width: metadata.width, height: metadata.height,
    contentDigest: createHash('sha256').update(bytes).digest('hex'), size: bytes.length};
}
export async function inspectCreativeAudioBytesV1(bytes: Buffer) {
  const kind = await fromBuffer(bytes);
  const mimeType = kind?.mime === 'audio/vnd.wave' ? 'audio/wav' : kind?.mime;
  if (!mimeType || !['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/flac'].includes(mimeType) || bytes.length > AUDIO_BYTES)
    return videoErrorV1('VIDEO_VOICE_AUDIO_UNAVAILABLE', 409);
  const {format} = await parseBuffer(bytes, {mimeType, size: bytes.length}, {duration: true, skipCovers: true});
  if (!format.duration || !Number.isFinite(format.duration) || format.duration <= 0 || !format.sampleRate || !Number.isInteger(format.sampleRate) ||
    !format.numberOfChannels || !Number.isInteger(format.numberOfChannels) || format.numberOfChannels > 8 || !format.container || !format.codec)
    return videoErrorV1('VIDEO_VOICE_AUDIO_METADATA_UNAVAILABLE', 409);
  const identifier = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
  return {mimeType: mimeType as 'audio/mpeg' | 'audio/wav' | 'audio/x-wav' | 'audio/mp4' | 'audio/ogg' | 'audio/webm' | 'audio/flac',
    container: identifier(format.container), codec: identifier(format.codec), durationSeconds: format.duration,
    sampleRate: format.sampleRate, channels: format.numberOfChannels, size: bytes.length, contentDigest: createHash('sha256').update(bytes).digest('hex')};
}

/** Each redirect and the actual DNS connection are checked, including rebinding. */
export async function downloadVideoAssetV1(url: string, limit = VIDEO_BYTES, timeoutMs = 60_000, allowedOrigin?: string): Promise<Buffer> {
  let current = url;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 512 * 1024 * 1024 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) return videoErrorV1('VIDEO_DOWNLOAD_POLICY_INVALID');
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0; redirects <= 4; redirects++) {
    let parsed: URL;
    try { parsed = new URL(current); } catch { return videoErrorV1('VIDEO_RESULT_URL_UNSAFE'); }
    if (parsed.username || parsed.password || allowedOrigin && parsed.origin !== allowedOrigin ||
      !(await isSafePublicHttpsUrl(current))) return videoErrorV1('VIDEO_RESULT_URL_UNSAFE');
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

  async importVideo(url: string, limit = VIDEO_BYTES) {
    // Leave time for upload/CAS within the existing three-minute job lease.
    const bytes = await downloadVideoAssetV1(url, limit, limit > VIDEO_BYTES ? 120_000 : 60_000);
    await assertMp4VideoV1(bytes);
    const file = await this.storage.uploadFile({buffer: bytes, originalname: 'video.mp4', mimetype: 'video/mp4', size: bytes.length} as Express.Multer.File);
    let metadata;try{metadata=measureMp4VideoV1(bytes);}catch{/* Valid but unsupported metadata remains unknown. */}
    return {name: String(file.originalname), path: String(file.path), size: bytes.length, ...(metadata?{metadata}:{})};
  }

  /** Static previews keep their original image bytes and are never registered as MP4. */
  async importImage(url: string, allowedOrigin?: string) {
    const bytes = await downloadVideoAssetV1(url, IMAGE_BYTES, 60_000, allowedOrigin), metadata = await inspectCreativeImageBytesV1(bytes);
    const extension = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}[metadata.mimeType];
    const file = await this.storage.uploadFile({buffer: bytes, originalname: `avatar-preview.${extension}`, mimetype: metadata.mimeType, size: bytes.length} as Express.Multer.File);
    return {name: String(file.originalname), path: String(file.path), ...metadata};
  }
  async inspectRemoteImage(url: string, allowedOrigin: string) {
    return inspectCreativeImageBytesV1(await downloadVideoAssetV1(url, IMAGE_BYTES, 60_000, allowedOrigin));
  }
  /** Download/inspect/store the exact audio; no normalization, denoising or transcoding. */
  async importAudio(url: string) {
    const bytes = await downloadVideoAssetV1(url, AUDIO_BYTES), metadata = await inspectCreativeAudioBytesV1(bytes);
    // Current UploadFactory supports these formats. Unsupported originals remain readable, without conversion.
    const extension = ({'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg'} as Record<string, string>)[metadata.mimeType];
    if (!extension) return videoErrorV1('VIDEO_VOICE_AUDIO_STORAGE_UNAVAILABLE', 409);
    const file = await this.storage.uploadFile({buffer: bytes, originalname: `voice-audition.${extension}`, mimetype: metadata.mimeType, size: bytes.length} as Express.Multer.File);
    return {name: String(file.originalname), path: String(file.path), ...metadata};
  }
  async inspectOwnedAudio(path: string) {return inspectCreativeAudioBytesV1(await this.readOwnedCreative(path, AUDIO_BYTES));}
  async inspectOwnedImage(path: string) {return inspectCreativeImageBytesV1(await this.readOwnedCreative(path, IMAGE_BYTES));}

  /** This boundary accepts a persisted app storage path; arbitrary remote URLs are not owned audio/images. */
  private async readOwnedCreative(path: string, limit: number, subtitle = false) {
    let url: URL;
    try {url = new URL(path);} catch {return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);}
    if (url.username || url.password || url.search || url.hash) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    if ((process.env.STORAGE_PROVIDER || 'local') !== 'local') {
      let base: URL; try {base = new URL(process.env.CLOUDFLARE_BUCKET_URL!);} catch {return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);}
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/')) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
      return downloadVideoAssetV1(path, limit);
    }
    const base = new URL(process.env.FRONTEND_URL!);
    const ownedPath = subtitle ? /^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]+\.(?:srt|vtt)$/
      : /^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]+\.(?:png|jpe?g|webp|mp3|m4a|mp4|wav|ogg|webm|flac)$/;
    if (url.origin !== base.origin || !ownedPath.test(url.pathname)) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    const root = await realpath(resolve(process.env.UPLOAD_DIRECTORY!)), file = await realpath(resolve(root, url.pathname.slice('/uploads/'.length)));
    if (!file.startsWith(root + sep)) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    const info = await stat(file);
    if (!info.isFile() || info.size < 1 || info.size > limit) return videoErrorV1('VIDEO_RESULT_TOO_LARGE');
    const bytes = await readFile(file);
    if (bytes.length > limit) return videoErrorV1('VIDEO_RESULT_TOO_LARGE');
    return bytes;
  }

  async inspectOwnedVideo(path:string,limit=512*1024*1024){return measureMp4VideoV1(await this.readOwned(path,limit));}

  async importSubtitle(url:string,durationSeconds:number):Promise<StoredSubtitleV1>{
    const bytes=await downloadVideoAssetV1(url,2*1024*1024,15000);
    return storeOwnedVideoSubtitleV1(bytes,durationSeconds,'provider_subtitle_file');
  }
  async readOwnedSubtitle(path: string, sha256: string) {
    let bytes: Buffer;
    try { bytes = await this.readOwnedCreative(path, 2 * 1024 * 1024, true); }
    catch { return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404); }
    if (!/^[a-f0-9]{64}$/.test(sha256) || createHash('sha256').update(bytes).digest('hex') !== sha256)
      return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    return bytes;
  }
  async storeAuthoredCaptions(cues:CaptionCueV1[],durationSeconds:number):Promise<StoredSubtitleV1>{
    const {bytes}=authoredCaptionFileV1(cues,durationSeconds);
    return storeOwnedVideoSubtitleV1(bytes,durationSeconds,'authored_timed_cues');
  }

  /** Read only a persisted owned storage path, never a provider/model-supplied URL. */
  async readOwned(path: string, limit = VIDEO_BYTES) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 512 * 1024 * 1024) return videoErrorV1('VIDEO_DOWNLOAD_POLICY_INVALID');
    if ((process.env.STORAGE_PROVIDER || 'local') !== 'local') return downloadVideoAssetV1(path, limit, limit > VIDEO_BYTES ? 300_000 : 60_000);
    const base = new URL(process.env.FRONTEND_URL!);
    const url = new URL(path);
    if (url.origin !== base.origin || !/^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]+\.mp4$/.test(url.pathname)) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    const root = resolve(process.env.UPLOAD_DIRECTORY!);
    const file = resolve(root, url.pathname.slice('/uploads/'.length));
    if (!file.startsWith(root + sep)) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    // Manual uploads can be larger than imported provider results. Bound allocation before reading.
    if ((await stat(file)).size > limit) return videoErrorV1('VIDEO_RESULT_TOO_LARGE');
    const bytes = await readFile(file);
    if (bytes.length > limit) return videoErrorV1('VIDEO_RESULT_TOO_LARGE');
    return bytes;
  }
}
