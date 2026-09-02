import { RECUT_PLATFORMS } from './material-presentation';

/**
 * The three layers the archive shows in one list (`content-factory-next-odb8.4`).
 *
 * The owner's own words: archive is two things. First, what existed *before*
 * this product and what is published *around* it — a person's own text,
 * brought in by hand. Second, what the product itself has already written,
 * so a new text can point back at an old one. `docs/product/content-section-map.md`
 * names three layers for that: «сделано здесь», «занесено как прежний текст»,
 * «занесено как опубликованное мимо продукта».
 *
 * No new table holds this distinction. `ContentPiece` already is "a finished
 * text that lives apart from any post" (`content-material.service.ts`), which
 * is exactly what a brought-in text also is — the only difference is who
 * wrote the words and how they arrived, not what kind of row they need. That
 * fact lives in `tags`, the same JSON column `materialFormat` and
 * `countImages` already read a declared value from rather than only ever
 * deriving one. A piece with no `tags.archive` is what every piece the brief
 * flow has ever written looks like, and reads as `MADE_HERE` for exactly that
 * reason: the absence of the tag *is* the factory's own signature, not a gap
 * to fill in.
 */
export const ARCHIVE_LAYERS = [
  'MADE_HERE',
  'IMPORTED_PRE_PRODUCT',
  'PUBLISHED_ELSEWHERE',
] as const;
export type ArchiveLayer = (typeof ARCHIVE_LAYERS)[number];

/** The two layers a person can actually add to — `MADE_HERE` only ever comes from the factory writing. */
export const IMPORTABLE_ARCHIVE_LAYERS = [
  'IMPORTED_PRE_PRODUCT',
  'PUBLISHED_ELSEWHERE',
] as const;
export type ImportableArchiveLayer = (typeof IMPORTABLE_ARCHIVE_LAYERS)[number];

export const isImportableArchiveLayer = (
  value: unknown
): value is ImportableArchiveLayer =>
  typeof value === 'string' &&
  (IMPORTABLE_ARCHIVE_LAYERS as readonly string[]).includes(value);

/**
 * Where a brought-in piece says it was first published, for the «площадка»
 * filter. The known recut platforms plus `other`, because a text from before
 * the product — a blog, a newsletter platform this workspace never connected,
 * a magazine — does not have to have been one of the four this product can
 * cut for today.
 */
export const ARCHIVE_PLATFORM_VALUES = [...RECUT_PLATFORMS, 'other'] as const;
export type ArchivePlatform = (typeof ARCHIVE_PLATFORM_VALUES)[number];

export const isArchivePlatform = (value: unknown): value is ArchivePlatform =>
  typeof value === 'string' &&
  (ARCHIVE_PLATFORM_VALUES as readonly string[]).includes(value);

export type ArchiveOrigin = Readonly<{
  platform: string | null;
  url: string | null;
  publishedAt: string | null;
  note: string | null;
}>;

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

/**
 * Which of the three layers a piece belongs to, read from its own `tags`.
 *
 * Never throws on a tag this reader does not recognise — an unrecognised
 * `origin` value falls back to `MADE_HERE` rather than hiding the row, the
 * same defensive read `content-facts.adapter.ts` gives an unknown fact status.
 */
export function archiveLayerOf(tags: unknown): ArchiveLayer {
  const archive = asObject(asObject(tags).archive);
  return isImportableArchiveLayer(archive.origin)
    ? archive.origin
    : 'MADE_HERE';
}

/** The origin a brought-in piece carries — `null` for anything `MADE_HERE`, by construction. */
export function archiveOriginOf(tags: unknown): ArchiveOrigin | null {
  if (archiveLayerOf(tags) === 'MADE_HERE') return null;
  const archive = asObject(asObject(tags).archive);
  return {
    platform: asNullableString(archive.platform),
    url: asNullableString(archive.url),
    publishedAt: asNullableString(archive.publishedAt),
    note: asNullableString(archive.note),
  };
}

/**
 * The `tags` a brought-in piece is written with, existing keys kept.
 *
 * `materialFormat`/`countImages` may already have read a declared `format`
 * or `images` key from an imported piece's own `tags` if the intake form
 * ever grows one; merging rather than replacing keeps that possible without
 * this file having to know about it.
 */
export function buildArchiveTags(
  existingTags: unknown,
  input: {
    origin: ImportableArchiveLayer;
    platform?: string | null;
    url?: string | null;
    publishedAt?: string | null;
    note?: string | null;
  }
): Record<string, unknown> {
  return {
    ...asObject(existingTags),
    archive: {
      origin: input.origin,
      platform: input.platform?.trim() || null,
      url: input.url?.trim() || null,
      publishedAt: input.publishedAt?.trim() || null,
      note: input.note?.trim() || null,
    },
  };
}
