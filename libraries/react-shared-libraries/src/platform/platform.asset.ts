/** The only third-party marks with immutable, licensed vector provenance. */
const VETTED_VECTOR_IDENTIFIERS = new Set([
  'devto',
  'lemmy',
  'listmonk',
  'mastodon',
  'mastodon-custom',
]);

// These official vectors carry black/currentColor artwork and therefore need
// a light neutral plate in the dark theme. The marks themselves stay intact.
const DARK_FRAGILE_VECTOR_IDENTIFIERS = new Set([
  'devto',
  'listmonk',
  'mastodon',
  'mastodon-custom',
]);

export const platformAsset = (identifier: string) => {
  const vector = VETTED_VECTOR_IDENTIFIERS.has(identifier);
  const filename = identifier === 'mastodon-custom' ? 'mastodon' : identifier;
  return {
    source: `/icons/platforms/${filename}.${vector ? 'svg' : 'png'}`,
    vector,
    neutralPlate: DARK_FRAGILE_VECTOR_IDENTIFIERS.has(identifier),
  };
};
