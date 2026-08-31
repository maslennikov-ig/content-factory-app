import { MAX_INPUT_BYTES, validateSourceMetadata } from './bounds';

type SourceResponse = Pick<
  Response,
  'ok' | 'redirected' | 'type' | 'url' | 'headers'
>;

export function validateSourceResponse(
  requested: string,
  response: SourceResponse,
  base: string
) {
  if (!response.ok) throw new Error('The selected image could not be loaded.');
  if (response.redirected)
    throw new Error('Redirected image sources are not allowed.');
  if (response.type === 'opaque')
    throw new Error('The selected image response must be CORS-readable.');
  const expected = new URL(requested, base).href;
  if (response.url && new URL(response.url, base).href !== expected)
    throw new Error(
      'The image response URL does not match the selected source.'
    );
  const type = (response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(type))
    throw new Error(
      'The selected source must return a PNG, JPEG, or WebP image.'
    );
  return type;
}

export type LoadedSource = {
  image: HTMLImageElement;
  width: number;
  height: number;
  type: string;
  bytes: number;
  dispose: () => void;
};

export async function loadExactImageSource(
  sourceUrl: string,
  signal: AbortSignal
): Promise<LoadedSource> {
  const response = await fetch(sourceUrl, {
    signal,
    redirect: 'error',
    credentials: 'include',
  });
  const base = window.location.href;
  const type = validateSourceResponse(sourceUrl, response, base);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_INPUT_BYTES)
    throw new Error('The source image must be 10 MiB or smaller.');
  const blob = await response.blob();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  image.src = objectUrl;
  try {
    await image.decode();
    validateSourceMetadata({
      type,
      bytes: blob.size,
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      type,
      bytes: blob.size,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    throw error instanceof Error
      ? error
      : new Error('The selected image could not be decoded.');
  }
}
