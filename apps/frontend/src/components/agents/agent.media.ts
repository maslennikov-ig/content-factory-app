import { MAX_IMAGE_UPLOAD_SIZE } from '@contentfactory/nestjs-libraries/upload/upload.limits';
import { uploadLibraryMedia } from '@contentfactory/frontend/components/media/image-editor/upload-edited-media';
import { compressLibraryImage } from '@contentfactory/frontend/components/media/library-image-compression';
import {
  AGENT_MEDIA_MAX_FILES,
  AGENT_MEDIA_TYPES,
  attachmentMediaType,
  type ChatPictureType,
  type LibraryUploadReceipt,
} from './agent.contract';

/**
 * Pictures attached in the chat (`content-factory-next-kcxz.25`, spec §5.9).
 *
 * A picture never passes through the chat door or the model: the composer
 * sends it from the browser to the media library itself — the library's own
 * request (`POST /media/upload-simple`, `uploadLibraryMedia`) — and the
 * message carries only the receipt: the library ids, the names and the types
 * (`AGENT_MEDIA_PART_TYPE`). The agent then puts one on a post by its id.
 *
 * Which files go this way is decided by what they are, not asked: every
 * picture the chat takes. Text files stay attachments the agent reads.
 */

/** The media library's own ceiling for a picture, and the chat's count. */
export const MEDIA_LIMITS = {
  maxFiles: AGENT_MEDIA_MAX_FILES,
  maxFileBytes: MAX_IMAGE_UPLOAD_SIZE,
} as const;

/** The picture types the library receives from the chat, or `null`. */
export const libraryImageType = (file: { name: string; type: string }): ChatPictureType | null => {
  const type = attachmentMediaType(file);
  return type && (AGENT_MEDIA_TYPES as readonly string[]).includes(type)
    ? (type as ChatPictureType)
    : null;
};

export const isLibraryImage = (file: { name: string; type: string }) =>
  libraryImageType(file) !== null;

type ProductFetch = (url: string, init: RequestInit) => Promise<Response>;

/** One picture already in the library: its receipt entry. */
export type LibraryEntry = LibraryUploadReceipt['media'][number];
/**
 * The pictures of this composer already in the library (review W4-25 F5): a
 * retry after a refusal sends only the ones still missing, so the library
 * gets no duplicates. The composer keeps it until the message goes.
 */
export type LibrarySaved = Map<File, LibraryEntry>;

/**
 * Sends the pictures to the media library one by one, as the library screen
 * does — compressed by the library uploader's own compressor (review W4-25
 * F6) — and returns the receipt. A picture in `saved` is not sent again. The
 * first refusal stops the rest and throws: the pictures already sent stay in
 * the library and in `saved`, and the message is not sent (the composer keeps
 * the words and the files).
 */
export const uploadToLibrary = async (
  request: ProductFetch,
  files: readonly File[],
  saved: LibrarySaved = new Map()
): Promise<LibraryUploadReceipt> => {
  const media: LibraryUploadReceipt['media'] = [];
  for (const file of files.slice(0, MEDIA_LIMITS.maxFiles)) {
    const type = libraryImageType(file);
    if (!type) continue;
    let entry = saved.get(file);
    if (!entry) {
      const sent = await compressLibraryImage(file);
      const answer = await uploadLibraryMedia(request, sent, sent.name || file.name);
      // The type the library stored, when compression converted it.
      entry = {
        id: answer.id,
        name: (answer.originalName || file.name).slice(0, 200),
        type: libraryImageType(sent) ?? type,
      };
      saved.set(file, entry);
    }
    media.push(entry);
  }
  return { media };
};

/* ---- Pictures the agent looks at ------------------------------------------ */

/**
 * Pictures the person showed the agent (owner decision 28.09.2026, «агент
 * видит картинки»). By default a picture goes to the model inline, in the
 * message that carries it, and is saved nowhere — the chat door keeps only a
 * line with its name. This page keeps the picture itself, under a key the
 * message names (`pictureKey`), for as long as the page lives: when the
 * person wants it on a post, the agent asks (`media.keep`) and this page puts
 * it into the library through the library's own request. A reload forgets
 * them — nothing is written anywhere to keep them.
 */
const shownPictures = new Map<string, File>();
/**
 * Pictures already put into the library from a card, by key (review W4-25
 * vision F8): a retry after a failed answer reuses the entry instead of
 * uploading a second copy, and the picture itself is let go.
 */
const keptPictures = new Map<string, LibraryEntry>();
/** The most shown pictures a page keeps; the oldest are let go first. */
export const SHOWN_PICTURES_MAX = 20;

const trimOldest = <V>(map: Map<string, V>) => {
  while (map.size > SHOWN_PICTURES_MAX) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
};

/** Keeps a picture the agent is shown; the key rides with the message. */
export const keepShownPicture = (file: File, key: string = crypto.randomUUID()) => {
  shownPictures.set(key, file);
  trimOldest(shownPictures);
  return key;
};

/** The picture this page keeps under `key`, if it still does. */
export const shownPicture = (key: string) => shownPictures.get(key) ?? null;

/**
 * What this page can still answer a card for `key` with — the picture's name
 * — while it holds the picture or has already kept it; `null` when neither.
 */
export const pictureAvailable = (key: string): { name: string } | null => {
  const file = shownPictures.get(key);
  if (file) return { name: file.name };
  const kept = keptPictures.get(key);
  return kept ? { name: kept.name } : null;
};

/**
 * Puts a picture the agent was shown into the library — the card of
 * `media.keep` calls this when the person agrees. `null`: this page no longer
 * holds it (reloaded, another tab). A refused upload throws. Once kept, the
 * same key answers with the same entry and uploads nothing.
 */
export const keepShownPictureInLibrary = async (
  request: ProductFetch,
  key: string
): Promise<LibraryEntry | null> => {
  const kept = keptPictures.get(key);
  if (kept) return kept;
  const file = shownPicture(key);
  if (!file) return null;
  const { media } = await uploadToLibrary(request, [file]);
  const entry = media[0] ?? null;
  if (entry) {
    keptPictures.set(key, entry);
    trimOldest(keptPictures);
    shownPictures.delete(key);
  }
  return entry;
};
