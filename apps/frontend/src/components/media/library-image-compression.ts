/**
 * How a picture is compressed on its way into the media library — one rule
 * for every uploader (review W4-25 F6, `content-factory-next-kcxz.25`).
 *
 * The library screen's uploader (`new.uploader.tsx`) runs the
 * `CompressionWrapper` Uppy plugin with these options; a picture attached in
 * the agent chat (`agents/agent.media.ts`) goes through the very same plugin's
 * `compress` with the same options, so both reach `/media/upload-*` at the
 * size `upload.limits.ts` promises («compressed to 1000px on the way out of
 * the browser»). GIFs are left as they are, as the plugin leaves them.
 *
 * No Uppy import at module level: the plugin is loaded only when a picture is
 * compressed, so a screen that never compresses does not pull it in.
 */

/** The library uploader's `@uppy/compressor` options. */
export const LIBRARY_IMAGE_COMPRESSION = {
  convertTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxWidth: 1000,
  maxHeight: 1000,
  quality: 1,
} as const;

/** GIFs keep their frames: the compressor would flatten them. */
export const isGifFile = (file: { type?: string | null; name?: string | null }) =>
  (file.type ?? '') === 'image/gif' || (file.name ?? '').toLowerCase().endsWith('.gif');

/**
 * One picture through the library uploader's compressor. A picture the
 * compressor cannot read goes as it is — what the plugin does too.
 */
export async function compressLibraryImage(file: File): Promise<File> {
  if (isGifFile(file)) return file;
  let destroy: (() => void) | null = null;
  try {
    const [{ default: Uppy }, { CompressionWrapper }] = await Promise.all([
      import('@uppy/core'),
      import('./compression.wrapper'),
    ]);
    const uppy = new Uppy();
    destroy = () => uppy.destroy();
    uppy.use(CompressionWrapper, { ...LIBRARY_IMAGE_COMPRESSION, convertTypes: [...LIBRARY_IMAGE_COMPRESSION.convertTypes] });
    const plugin = uppy.getPlugin('Compressor') as unknown as {
      compress: (blob: Blob) => Promise<Blob | File>;
    };
    const blob = await plugin.compress(file);
    const name = (blob as File).name || file.name;
    return new File([blob], name, { type: blob.type || file.type });
  } catch {
    return file;
  } finally {
    destroy?.();
  }
}
