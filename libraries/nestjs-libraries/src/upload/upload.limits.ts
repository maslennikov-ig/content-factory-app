/**
 * One ceiling per kind of file, in one place.
 *
 * Until 04.09.2026 the browser let an image of up to 30 MB through and the
 * validation pipe refused anything past 10 MB, so a file between the two
 * passed every check the person could see and came back as a 400 from the
 * server (`content-factory-next-fn33.20`). The two numbers were never meant
 * to differ; they differed because they were typed twice.
 *
 * This module holds numbers and formatting only — no NestJS imports — so the
 * frontend bundle can import it as freely as the backend does.
 */

/**
 * Images are compressed to 1000px on the way out of the browser, so the
 * ceiling is about refusing a camera original, not about storage.
 */
export const MAX_IMAGE_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

/** Video is not compressed, and one minute of 1080p already passes 100 MB. */
export const MAX_VIDEO_UPLOAD_SIZE = 1024 * 1024 * 1024; // 1 GB

/**
 * The ceiling for a detected mime type, or `undefined` when the type is not
 * one this product accepts. Callers decide what refusing looks like.
 */
export function maxUploadSizeForMimeType(mimeType: string): number | undefined {
  if (mimeType?.startsWith('image/')) return MAX_IMAGE_UPLOAD_SIZE;
  if (mimeType?.startsWith('video/')) return MAX_VIDEO_UPLOAD_SIZE;
  return undefined;
}

/**
 * What a megabyte and a gigabyte are called in the language being read.
 *
 * `MB` and `GB` are the international spelling and stay the answer for most
 * languages; Russian writes «МБ» and «ГБ», and a Russian sentence with «10 MB»
 * inside it is half-translated (`content-factory-next-fn33.95`). A language
 * absent from this table keeps the international form on purpose — that is a
 * spelling decision, not a missing translation, which is why it lives here
 * beside the numbers rather than in the translation files.
 */
const SIZE_UNITS: Readonly<Record<string, { mb: string; gb: string }>> = {
  ru: { mb: 'МБ', gb: 'ГБ' },
  // The same three languages the server's own refusals spell differently in
  // `backend-strings.ts` («Изображение больше 10 МБ», «L'image dépasse 10
  // Mo»). One decision, and the two sides agree on it.
  fr: { mb: 'Mo', gb: 'Go' },
  ar: { mb: 'ميغابايت', gb: 'غيغابايت' },
};

const INTERNATIONAL_UNITS = { mb: 'MB', gb: 'GB' } as const;

/** The unit words for a language tag such as `ru`, `ru-RU` or `en`. */
export const uploadSizeUnits = (
  language?: string
): { mb: string; gb: string } =>
  SIZE_UNITS[(language ?? '').slice(0, 2).toLowerCase()] ??
  INTERNATIONAL_UNITS;

/**
 * The ceiling as a sentence fragment, from the ceiling as a number.
 *
 * The copy used to spell the ceiling out beside the very constant it was
 * meant to describe, in English, in four places. One number, formatted — and
 * since `content-factory-next-fn33.95` the unit follows the language the
 * sentence around it is written in.
 */
export const formatUploadSizeLimit = (
  bytes: number,
  language?: string
): string => {
  const units = uploadSizeUnits(language);
  return bytes % (1024 * 1024 * 1024) === 0
    ? `${bytes / (1024 * 1024 * 1024)} ${units.gb}`
    : `${Math.round(bytes / (1024 * 1024))} ${units.mb}`;
};
