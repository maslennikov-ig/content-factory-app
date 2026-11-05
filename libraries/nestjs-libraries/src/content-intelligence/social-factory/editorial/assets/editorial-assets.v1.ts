import sharp from 'sharp';
import { Injectable } from '@nestjs/common';
import { MediaService } from '../../../../database/prisma/media/media.service';
import { UploadFactory } from '../../../../upload/upload.factory';
import { downloadVideoAssetV1 } from '../../../../videos/video-media.v1';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

/** Text is supplied by the editor, not transcribed from a generated image. */
export type EditorialFrameV1 = { title: string; body?: string; footer?: string; imageMediaId?: string };
export type EditorialArtworkV1 = {
  kind: 'carousel' | 'story' | 'cover';
  frames: EditorialFrameV1[];
  coverAspect?: 'portrait' | 'landscape';
  background: string;
  foreground: string;
};

const dimensions = {
  carousel: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  cover: { width: 1280, height: 720 },
} as const;
const escapeMarkup = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const color = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function checkedText(value: unknown, max: number, required = false): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('editorial_artwork_invalid_text');
  return value.trim();
}

/** Reject overflow rather than silently clipping or shrinking editorial text. */
async function textLayer(text: string, width: number, maxHeight: number, font: string, foreground: string) {
  if (!text) return null;
  const rendered = await sharp({ text: { text: `<span foreground="${foreground}">${escapeMarkup(text)}</span>`, width, font, dpi: 72, rgba: true } }).png().toBuffer({ resolveWithObject: true });
  if (rendered.info.height > maxHeight || rendered.info.width > width) throw new Error('editorial_artwork_text_does_not_fit');
  return rendered.data;
}

/** Creates actual PNGs with deterministic dimensions and laid-out text; no model or network call. */
export async function renderEditorialArtworkV1(input: EditorialArtworkV1, images: (Buffer | null)[] = []): Promise<Buffer[]> {
  if (!input || !Object.prototype.hasOwnProperty.call(dimensions, input.kind) || !Array.isArray(input.frames) || !color(input.background) || !color(input.foreground)) throw new Error('editorial_artwork_invalid');
  if ((input.kind === 'carousel' && (input.frames.length < 2 || input.frames.length > 10)) || (input.kind !== 'carousel' && input.frames.length !== 1)) throw new Error('editorial_artwork_frame_count');
  const a = luminance(input.background), b = luminance(input.foreground);
  if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5) throw new Error('editorial_artwork_low_contrast');
  if (input.coverAspect !== undefined && (input.kind !== 'cover' || !['portrait', 'landscape'].includes(input.coverAspect))) throw new Error('editorial_artwork_invalid');
  const portrait = input.kind === 'story' || (input.kind === 'cover' && input.coverAspect === 'portrait');
  const { width, height } = input.kind === 'cover' && portrait ? dimensions.story : dimensions[input.kind];
  const margin = 90;
  if (images.length && images.length !== input.frames.length) throw new Error('editorial_artwork_images_mismatch');
  return Promise.all(input.frames.map(async (frame, index) => {
    if (!frame || typeof frame !== 'object') throw new Error('editorial_artwork_invalid_text');
    const title = checkedText(frame.title, 160, true), body = checkedText(frame.body, 600), footer = checkedText(frame.footer, 100);
    const photo = images[index] || null;
    const photoWidth = photo && input.kind === 'cover' && !portrait ? 440 : width;
    const photoHeight = photo ? (input.kind === 'cover' && !portrait ? height : portrait ? 720 : 480) : 0;
    const textWidth = photo && input.kind === 'cover' && !portrait ? width - photoWidth - margin * 2 : width - margin * 2;
    const top = portrait ? 230 : 80;
    const footerTop = photo && (input.kind !== 'cover' || portrait) ? height - photoHeight - 90 : height - (portrait ? 300 : 150);
    const titleHeight = input.kind === 'cover' && !portrait ? 160 : 250;
    const bodyTop = top + titleHeight + 30;
    const layers = await Promise.all([
      textLayer(title, textWidth, titleHeight, 'DejaVu Sans Bold 64', input.foreground),
      textLayer(body, textWidth, Math.max(0, footerTop - bodyTop - 40), 'DejaVu Sans 38', input.foreground),
      textLayer(footer, textWidth, 70, 'DejaVu Sans 28', input.foreground),
    ]);
    const composite: { input: Buffer; left: number; top: number }[] = [];
    if (photo) {
      const metadata = await sharp(photo, { limitInputPixels: 40_000_000, animated: false }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || !metadata.width || !metadata.height || (metadata.pages || 1) > 1) throw new Error('editorial_artwork_invalid_image');
      const resized = await sharp(photo, { limitInputPixels: 40_000_000, animated: false }).rotate().resize(photoWidth, photoHeight, { fit: 'contain', background: input.background }).png().toBuffer();
      composite.push({ input: resized, left: input.kind === 'cover' && !portrait ? width - photoWidth : 0, top: input.kind === 'cover' && !portrait ? 0 : height - photoHeight });
    }
    if (layers[0]) composite.push({ input: layers[0], left: margin, top });
    if (layers[1]) composite.push({ input: layers[1], left: margin, top: bodyTop });
    if (layers[2]) composite.push({ input: layers[2], left: margin, top: footerTop });
    return sharp({ create: { width, height, channels: 4, background: input.background } }).composite(composite).png().toBuffer();
  }));
}

const IMAGE_BYTES = 20 * 1024 * 1024;
/** The URL comes from a tenant-scoped media row, never directly from a request. */
export async function readEditorialOwnedImage(path: string): Promise<Buffer> {
  if ((process.env.STORAGE_PROVIDER || 'local') !== 'local') return downloadVideoAssetV1(path, IMAGE_BYTES);
  if (!process.env.FRONTEND_URL || !process.env.UPLOAD_DIRECTORY) throw new Error('editorial_artwork_image_unavailable');
  const base = new URL(process.env.FRONTEND_URL), url = new URL(path);
  if (url.origin !== base.origin || !/^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]+\.(?:png|jpg|jpeg|webp)$/i.test(url.pathname)) throw new Error('editorial_artwork_image_unavailable');
  const root = await realpath(resolve(process.env.UPLOAD_DIRECTORY));
  const file = await realpath(resolve(root, url.pathname.slice('/uploads/'.length)));
  if (!file.startsWith(root + sep) || (await stat(file)).size > IMAGE_BYTES) throw new Error('editorial_artwork_image_unavailable');
  const bytes = await readFile(file);
  if (!bytes.length || bytes.length > IMAGE_BYTES) throw new Error('editorial_artwork_image_unavailable');
  return bytes;
}

/** Storage/media services remain the source of tenant-owned asset references. */
@Injectable()
export class EditorialAssetsV1 {
  private readonly storage = UploadFactory.createStorage();
  constructor(private readonly media: MediaService) {}

  async create(organizationId: string, input: EditorialArtworkV1) {
    if (!organizationId?.trim()) throw new Error('editorial_artwork_organization_required');
    if (!input || !Array.isArray(input.frames) || !Object.prototype.hasOwnProperty.call(dimensions, input.kind)) throw new Error('editorial_artwork_invalid');
    if ((input.kind === 'carousel' && (input.frames.length < 2 || input.frames.length > 10)) || (input.kind !== 'carousel' && input.frames.length !== 1)) throw new Error('editorial_artwork_frame_count');
    // Resolve only live media belonging to this organization, before durable writes.
    const ids = [...new Set((input?.frames || []).map(f => f?.imageMediaId).filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))];
    if ((input?.frames || []).some(f => f?.imageMediaId !== undefined && (typeof f.imageMediaId !== 'string' || !f.imageMediaId.trim()))) throw new Error('editorial_artwork_invalid_image');
    const media = ids.length ? await this.media.mediaInWorkspace(organizationId, ids) : [];
    if (media.length !== ids.length) throw new Error('editorial_artwork_image_unavailable');
    const images = new Map<string, Buffer>();
    for (const item of media) images.set(item.id, await readEditorialOwnedImage(item.path));
    // Finish validation/rendering before the first durable write.
    const buffers = await renderEditorialArtworkV1(input, input.frames.map(f => f.imageMediaId ? images.get(f.imageMediaId)! : null));
    const saved: Awaited<ReturnType<MediaService['saveFile']>>[] = [];
    let unregistered: { name: string; path: string } | undefined;
    try {
      for (let i = 0; i < buffers.length; i++) {
        const buffer = buffers[i];
        const file = await this.storage.uploadFile({ buffer, originalname: `${input.kind}-${i + 1}.png`, mimetype: 'image/png', size: buffer.length } as Express.Multer.File);
        unregistered = { name: file.originalname, path: file.path };
        saved.push(await this.media.saveFile(organizationId, file.originalname, file.path, `${input.kind}-${i + 1}.png`));
        unregistered = undefined;
      }
      return saved;
    } catch (cause) {
      // The caller can reconcile already-created media instead of retrying blindly.
      const error = new Error('editorial_artwork_save_incomplete');
      Object.assign(error, { saved, unregistered, cause });
      throw error;
    }
  }
}
