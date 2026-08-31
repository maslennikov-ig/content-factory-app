export interface ResearchSource {
  title: string;
  url: string;
  publishedAt: string | null;
}

/**
 * Research sources as they come back from the post repository, which stores
 * them as a JSON string.
 *
 * A draft written by an older build, a truncated write or a row edited by hand
 * would otherwise throw inside the modal's mount effect and take the whole
 * dialog down with it — an unreadable list of sources costs the author the
 * post they were writing. Anything that does not parse into `{title, url}`
 * entries simply means there are no sources to show.
 */
export const parseResearchSources = (stored: unknown): ResearchSource[] => {
  let raw = stored;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw || '[]');
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (source): source is ResearchSource =>
        !!source &&
        typeof source === 'object' &&
        typeof source.title === 'string' &&
        typeof source.url === 'string'
    )
    .map(({ title, url, publishedAt }) => ({
      title,
      url,
      publishedAt: typeof publishedAt === 'string' ? publishedAt : null,
    }));
};
