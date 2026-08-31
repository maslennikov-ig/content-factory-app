import type { SocialPreset } from './types';

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
export const MAX_DECODED_PIXELS = 20_000_000;
export const MAX_OUTPUT_PIXELS = 16_777_216;
export const MAX_LAYERS = 100;
export const MAX_TEXT_CHARS = 2_000;
export const MAX_DRAW_POINTS = 50_000;
export const MAX_HISTORY_ENTRIES = 50;

export const SOCIAL_PRESETS: Record<
  SocialPreset,
  { width: number; height: number }
> = Object.freeze({
  square: Object.freeze({ width: 1080, height: 1080 }),
  portrait: Object.freeze({ width: 1080, height: 1350 }),
  story: Object.freeze({ width: 1080, height: 1920 }),
  // A feed post and a link preview are not the same picture. `landscape` is the
  // Open Graph card every platform reads when a post carries a URL, and
  // `telegram` is the 16:9 the channel view crops to. Without them the only way
  // to hit either was to type the numbers into resize.
  landscape: Object.freeze({ width: 1200, height: 630 }),
  telegram: Object.freeze({ width: 1280, height: 720 }),
});

const SOURCE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function validateSourceMetadata(input: {
  type: string;
  bytes: number;
  width: number;
  height: number;
}) {
  if (!SOURCE_TYPES.has(input.type.toLowerCase()))
    throw new Error('Choose a PNG, JPEG, or WebP image.');
  if (
    !Number.isFinite(input.bytes) ||
    input.bytes <= 0 ||
    input.bytes > MAX_INPUT_BYTES
  )
    throw new Error('The source image must be 10 MiB or smaller.');
  if (
    !Number.isInteger(input.width) ||
    !Number.isInteger(input.height) ||
    input.width <= 0 ||
    input.height <= 0
  )
    throw new Error('The source image dimensions are invalid.');
  if (
    input.width > 8192 ||
    input.height > 8192 ||
    input.width * input.height > MAX_DECODED_PIXELS
  )
    throw new Error(
      'The decoded image must be at most 20 megapixels and 8192 px per edge.'
    );
  return { width: input.width, height: input.height };
}

export function validateCanvasSize(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 64 ||
    height < 64 ||
    width > 4096 ||
    height > 4096 ||
    width * height > MAX_OUTPUT_PIXELS
  )
    throw new Error(
      'Output must be 64–4096 px per edge and no more than 16,777,216 pixels.'
    );
  return { width, height };
}

export function validateCropRect(
  crop: { x: number; y: number; width: number; height: number },
  canvas: { width: number; height: number }
) {
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (!values.every(Number.isInteger) || crop.x < 0 || crop.y < 0) {
    throw new Error(
      'Crop coordinates and dimensions must be whole, non-negative pixels.'
    );
  }
  validateCanvasSize(crop.width, crop.height);
  if (
    crop.x + crop.width > canvas.width ||
    crop.y + crop.height > canvas.height
  ) {
    throw new Error('The crop area must stay within the canvas bounds.');
  }
  return { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
}

export function validateLayerCount(count: number) {
  if (count > MAX_LAYERS)
    throw new Error('An image can contain at most 100 layers.');
  return count;
}
export function validateText(value: string) {
  if (value.length > MAX_TEXT_CHARS)
    throw new Error('A text layer can contain at most 2,000 characters.');
  return value;
}
export function validateDrawPoints(count: number) {
  if (count > MAX_DRAW_POINTS)
    throw new Error('A drawing can contain at most 50,000 points.');
  return count;
}
/**
 * What can be checked about an export without knowing the canvas it came from.
 *
 * The upload path only ever sees a blob, so this is everything it can honestly
 * assert. Splitting it out keeps that path from passing invented dimensions to
 * satisfy a signature — a check that always holds reads like a check.
 */
export function validateExportPayload(blob: Pick<Blob, 'size' | 'type'>) {
  if (blob.size <= 0) throw new Error('The exported image is empty.');
  if (blob.type !== 'image/png' && blob.type !== 'image/jpeg')
    throw new Error('The exported image must be PNG or JPEG.');
  if (blob.size > MAX_EXPORT_BYTES)
    throw new Error('The exported image must be 10 MiB or smaller.');
  return blob;
}

export function validateExportBlob(
  blob: Pick<Blob, 'size' | 'type'>,
  dimensions: { width: number; height: number }
) {
  validateExportPayload(blob);
  validateCanvasSize(dimensions.width, dimensions.height);
  return blob;
}

export async function validateExportRaster(
  blob: Blob,
  dimensions: { width: number; height: number }
) {
  validateExportBlob(blob, dimensions);
  let decoded: { width: number; height: number };
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      decoded = { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  } else if (
    typeof Image !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  ) {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      decoded = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      image.src = '';
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } else {
    throw new Error('The exported image dimensions could not be validated.');
  }
  if (
    decoded.width !== dimensions.width ||
    decoded.height !== dimensions.height
  ) {
    throw new Error('The exported image dimensions do not match the canvas.');
  }
  return blob;
}
