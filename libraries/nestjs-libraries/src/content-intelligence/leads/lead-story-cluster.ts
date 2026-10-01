import { createHash } from 'node:crypto';
import { canonicalizeSourceUrl } from '../source-registry/network-policy';
import { uniqueStems } from './lead-junk';
import {
  mergeLeadSourceRefs,
  safeLeadUrl,
  type LeadSourceRefsV1,
} from './lead-source-refs';
import type { LeadFeedItemV1 } from './lead-feed.gateway';

function refs(item: LeadFeedItemV1): LeadSourceRefsV1 {
  if (item.sourceRefsJson) return item.sourceRefsJson;
  let canonicalUrl: string | null = null;
  try {
    canonicalUrl = canonicalizeSourceUrl(item.sourceUrl);
  } catch {
    /* Display-only URL. */
  }
  if (!safeLeadUrl(item.sourceUrl)) throw new Error('INVALID_LEAD_SOURCE_URL');
  return {
    version: 1,
    sources: [{ url: item.sourceUrl, canonicalUrl, primaryStatus: 'UNKNOWN' }],
    attributions: [],
    truncated: false,
  };
}
function compatible(
  a: LeadFeedItemV1,
  b: LeadFeedItemV1,
  topic: Set<string>
): boolean {
  if (
    !a.publishedAt ||
    !b.publishedAt ||
    !Number.isFinite(a.publishedAt.getTime()) ||
    !Number.isFinite(b.publishedAt.getTime())
  )
    return false;
  const day = (date: Date) => Math.floor(date.getTime() / 86_400_000);
  if (Math.abs(day(a.publishedAt) - day(b.publishedAt)) > 2) return false;
  // Shared boilerplate excerpts cannot establish identity by themselves.
  const titleLeft = uniqueStems(a.title);
  const titleRight = uniqueStems(b.title);
  if (
    [...titleLeft].filter((stem) => !topic.has(stem) && titleRight.has(stem))
      .length < 2
  )
    return false;
  const left = uniqueStems(`${a.title} ${a.excerpt || ''}`);
  const right = uniqueStems(`${b.title} ${b.excerpt || ''}`);
  return (
    [...left].filter((stem) => !topic.has(stem) && right.has(stem)).length >= 3
  );
}
/** Conservative complete-link: a bridge never supplies evidence for its endpoints. */
export function groupLeadStories(
  items: LeadFeedItemV1[],
  subject: string
): LeadFeedItemV1[] {
  const topic = uniqueStems(subject);
  const groups: LeadFeedItemV1[][] = [];
  const ordered = [...items].sort(
    (a, b) =>
      a.title.toLowerCase().localeCompare(b.title.toLowerCase(), 'en') ||
      a.sourceUrl.localeCompare(b.sourceUrl, 'en')
  );
  for (const candidate of ordered) {
    const matches = groups.filter((group) =>
      group.every((member) => compatible(candidate, member, topic))
    );
    if (matches.length === 1) matches[0].push(candidate);
    else groups.push([candidate]);
  }
  return groups.map((group) => {
    const sourceRefsJson = mergeLeadSourceRefs(...group.map(refs));
    const ranked = [...group].sort((a, b) => {
      const primary = (item: LeadFeedItemV1) =>
        refs(item).sources.some((s) => s.primaryStatus === 'VERIFIED_PRIMARY')
          ? 1
          : 0;
      return (
        primary(b) - primary(a) ||
        (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0) ||
        a.sourceUrl.localeCompare(b.sourceUrl, 'en')
      );
    });
    return {
      ...ranked[0],
      externalId:
        group.length === 1
          ? ranked[0].externalId
          : `story:v1:${createHash('sha256')
              .update(
                sourceRefsJson.sources
                  .map((s) => s.canonicalUrl || s.url)
                  .sort()
                  .join('\n')
              )
              .digest('hex')}`,
      sourceRefsJson,
    };
  });
}
