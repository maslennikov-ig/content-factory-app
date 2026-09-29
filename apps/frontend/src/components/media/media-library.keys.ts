/**
 * The SWR key of a media library page (`MediaBox`). The agent chat re-reads
 * every page under the prefix after it put a picture into the library
 * (`content-factory-next-kcxz.25`), so the library beside the chat shows it
 * first; one place for the key, so the two cannot drift.
 */
export const MEDIA_LIBRARY_KEY_PREFIX = 'get-media-';

export const mediaLibraryKey = (page: number, search: string) =>
  `${MEDIA_LIBRARY_KEY_PREFIX}${page}-${search}`;
