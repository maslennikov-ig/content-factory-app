import type { PostResponse } from './social/social.integrations.interface';

export const YOUTUBE_THUMBNAIL_FAILED_STATUS = 'success:youtube_thumbnail_failed';
export const YOUTUBE_THUMBNAIL_WARNING = 'Видео опубликовано на YouTube, но установка обложки не подтверждена. Проверьте обложку у опубликованного видео; повторная публикация не нужна.';

/** Only a known bounded receipt marker becomes user-visible text; raw provider errors never do. */
export const publicationWarning = (receipts: readonly Pick<PostResponse, 'status'>[]): string | undefined =>
  receipts.some(receipt => receipt.status === YOUTUBE_THUMBNAIL_FAILED_STATUS) ? YOUTUBE_THUMBNAIL_WARNING : undefined;

export const appendPublicationDiagnostic = (current: string | null, diagnostic: string): string =>
  !current ? diagnostic : current.split('\n').includes(diagnostic) ? current : `${current}\n${diagnostic}`;
