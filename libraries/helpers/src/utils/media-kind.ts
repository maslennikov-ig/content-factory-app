/** Inherited Media rows default to image even for uploaded videos. */
export function mediaPresentationKind(media: {
  path?: string;
  name: string;
  type?: string;
}): 'image' | 'video' {
  const pathname = (media.path || '').split(/[?#]/, 1)[0];
  const extension = /\.([a-z0-9]+)$/i.exec(pathname)?.[1] ||
    /\.([a-z0-9]+)$/i.exec(media.name)?.[1];
  if (extension) {
    if (/^(mp4|mov|webm|m4v)$/i.test(extension)) return 'video';
    if (/^(png|jpe?g|gif|webp|avif|svg|bmp|heic)$/i.test(extension)) return 'image';
  }
  return media.type === 'video' || media.type?.startsWith('video/') ? 'video' : 'image';
}
