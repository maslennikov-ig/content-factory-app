import {
  ARCHIVE_LAYERS,
  ARCHIVE_PLATFORM_VALUES,
  IMPORTABLE_ARCHIVE_LAYERS,
  type ArchiveLayer,
  type ImportableArchiveLayer,
} from '@contentfactory/nestjs-libraries/content-intelligence/materials/archive-presentation';
import {
  MATERIALS_API,
  failureNotice,
  jsonReader,
  readFailure,
  type MaterialFailure,
} from '../brand-voice/voice-materials.adapter';

/**
 * «Что уже написали» — the archive (`content-factory-next-odb8.4`).
 *
 * `docs/product/content-section-map.md` names it as two things at once: what
 * existed before this product and what runs beside it, brought in by hand;
 * and what the product itself has already written, kept so a new text can
 * point back at an old one. The backend keeps that as one table read three
 * ways rather than three tables — `ContentPiece` with a `tags.archive.origin`
 * a piece not written by the factory carries and a piece the factory did
 * write does not — and this file reads the same distinction back rather than
 * inventing a client-side one, so a filter here and a filter on the server
 * can never disagree about what a layer is.
 *
 * `readFailure`, `failureNotice`, `jsonReader` and `MATERIALS_API` are the
 * shared ones this whole surface already uses — `content-facts.adapter.ts`
 * re-exports the same trio from the same file. A refusal on the archive
 * screen should read exactly like a refusal on the witness screen or the
 * Material tab: `{ code, message }`, turned into one sentence, once.
 */

export { failureNotice, jsonReader, readFailure, MATERIALS_API };
export type ArchiveFailure = MaterialFailure;
export type { ArchiveLayer, ImportableArchiveLayer };
export { ARCHIVE_LAYERS, IMPORTABLE_ARCHIVE_LAYERS, ARCHIVE_PLATFORM_VALUES };

export const ARCHIVE_IMPORT_API = `${MATERIALS_API}/archive/import`;

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const asText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const asNullableText = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const asNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T => {
  const candidate = asText(value) as T;
  return allowed.includes(candidate) ? candidate : fallback;
};

export type ArchiveOrigin = Readonly<{
  platform: string | null;
  url: string | null;
  publishedAt: string | null;
  note: string | null;
}>;

/** One row, read the shape `ContentMaterialService.listArchive` answers in. */
export type ArchiveRow = Readonly<{
  id: string;
  code: string;
  title: string;
  format: string;
  postCount: number;
  queuedCount: number;
  date: string;
  voiceVersion: string | null;
  layer: ArchiveLayer;
  platforms: readonly string[];
  contentContextSnapshotId: string | null;
  origin: ArchiveOrigin | null;
}>;

const readOrigin = (value: unknown): ArchiveOrigin | null => {
  if (value === null || value === undefined) return null;
  const origin = asRecord(value);
  return {
    platform: asNullableText(origin.platform),
    url: asNullableText(origin.url),
    publishedAt: asNullableText(origin.publishedAt),
    note: asNullableText(origin.note),
  };
};

const readRow = (value: unknown): ArchiveRow => {
  const row = asRecord(value);
  return {
    id: asText(row.id),
    code: asText(row.code),
    title: asText(row.title),
    format: asText(row.format),
    postCount: asNumber(row.postCount, 0),
    queuedCount: asNumber(row.queuedCount, 0),
    date: asText(row.date),
    voiceVersion: asNullableText(row.voiceVersion),
    layer: oneOf(row.layer, ARCHIVE_LAYERS, 'MADE_HERE'),
    platforms: asArray(row.platforms).filter(
      (item): item is string => typeof item === 'string'
    ),
    contentContextSnapshotId: asNullableText(row.contentContextSnapshotId),
    origin: readOrigin(row.origin),
  };
};

export type ArchiveEnvelope = Readonly<{
  state: 'empty' | 'filtered-empty' | 'default';
  materials: readonly ArchiveRow[];
  page: number;
  limit: number;
  total: number;
  counts: Readonly<Record<ArchiveLayer, number>>;
}>;

/** `GET /content-intelligence/materials?...`, read defensively. */
export function readArchiveEnvelope(value: unknown): ArchiveEnvelope {
  const body = asRecord(value);
  const counts = asRecord(body.counts);
  return {
    state: oneOf(body.state, ['empty', 'filtered-empty', 'default'], 'default'),
    materials: asArray(body.materials).map(readRow),
    page: asNumber(body.page, 0),
    limit: asNumber(body.limit, 20),
    total: asNumber(body.total, 0),
    counts: Object.fromEntries(
      ARCHIVE_LAYERS.map((layer) => [layer, asNumber(counts[layer], 0)])
    ) as Record<ArchiveLayer, number>,
  };
}

export type ArchiveFilters = {
  layer: ArchiveLayer | 'ALL';
  platform: string | 'ALL';
  from: string;
  to: string;
  page: number;
};

export const emptyArchiveFilters: ArchiveFilters = {
  layer: 'ALL',
  platform: 'ALL',
  from: '',
  to: '',
  page: 0,
};

/** Only a filter that would actually narrow something reaches the query string — a page with nothing set asks the plain, unfiltered question. */
export function archiveListUrl(filters: ArchiveFilters, limit: number): string {
  const params = new URLSearchParams();
  if (filters.layer !== 'ALL') params.set('layer', filters.layer);
  if (filters.platform !== 'ALL') params.set('platform', filters.platform);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.page) params.set('page', String(filters.page));
  params.set('limit', String(limit));
  const query = params.toString();
  return query ? `${MATERIALS_API}?${query}` : MATERIALS_API;
}

/**
 * What the intake form is holding, as typed.
 *
 * `origin` defaults to `IMPORTED_PRE_PRODUCT` — «текст до продукта» is the
 * more common reason someone opens this form; the radio still lets a person
 * say «публикуется мимо продукта» instead.
 */
export type ArchiveImportDraft = {
  origin: ImportableArchiveLayer;
  title: string;
  body: string;
  language: 'ru' | 'en';
  platform: string;
  url: string;
  publishedAt: string;
  note: string;
};

export const emptyArchiveImportDraft = (
  language: 'ru' | 'en'
): ArchiveImportDraft => ({
  origin: 'IMPORTED_PRE_PRODUCT',
  title: '',
  body: '',
  language,
  platform: '',
  url: '',
  publishedAt: '',
  note: '',
});

/** `ImportArchiveMaterialDto`, built from the form. Blank optional fields are dropped rather than sent as `''`. */
export function buildArchiveImportPayload(draft: ArchiveImportDraft) {
  const orDropped = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    origin: draft.origin,
    title: draft.title.trim(),
    body: draft.body.trim(),
    language: draft.language,
    ...(orDropped(draft.platform) ? { platform: draft.platform.trim() } : {}),
    ...(orDropped(draft.url) ? { url: draft.url.trim() } : {}),
    ...(orDropped(draft.publishedAt) ? { publishedAt: draft.publishedAt.trim() } : {}),
    ...(orDropped(draft.note) ? { note: draft.note.trim() } : {}),
  };
}

/** «Разбор из текста»: the context envelope a row's `contentContextSnapshotId` resolves to, read defensively. */
export type GroundingFact = Readonly<{
  citationId: string;
  statement: string;
}>;

export type GroundingEvidence = Readonly<{
  citationId: string;
  title: string;
  excerpt: string;
}>;

export type GroundingEnvelope = Readonly<{
  facts: readonly GroundingFact[];
  evidence: readonly GroundingEvidence[];
}>;

export function readGroundingEnvelope(value: unknown): GroundingEnvelope {
  const body = asRecord(value);
  return {
    facts: asArray(body.facts).map((entry) => {
      const fact = asRecord(entry);
      return {
        citationId: asText(fact.citationId),
        statement: asText(fact.statement),
      };
    }),
    evidence: asArray(body.evidence).map((entry) => {
      const evidence = asRecord(entry);
      return {
        citationId: asText(evidence.citationId),
        title: asText(evidence.title, 'Untitled source'),
        excerpt: asText(evidence.excerpt),
      };
    }),
  };
}

export const contextUrl = (contentContextSnapshotId: string) =>
  `/content-intelligence/contexts/${encodeURIComponent(contentContextSnapshotId)}`;
