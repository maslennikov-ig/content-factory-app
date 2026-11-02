/** Metadata describes the source, not the date of any event in it. */
export type SourceDateMetadata = { publishedAt: string | null; fetchedAt: string | null };

export const sourceDateMetadata = (source: { publishedAt?: unknown; fetchedAt?: unknown } | null | undefined): SourceDateMetadata => ({
  publishedAt: typeof source?.publishedAt === 'string' ? source.publishedAt : null,
  fetchedAt: typeof source?.fetchedAt === 'string' ? source.fetchedAt : null,
});

export const briefEvidenceEnvelope = (item: {
  evidenceId: string; url: string; title: string | null; excerpt: string;
  publishedAt?: string | null; fetchedAt?: string | null; requestMaterial?: unknown;
}, maxChars: number) => ({
  evidenceId: item.evidenceId, url: item.url, title: item.title,
  ...sourceDateMetadata(item), requestMaterial: item.requestMaterial,
  passage: item.excerpt.slice(0, maxChars),
});
