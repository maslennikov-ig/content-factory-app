import type { SocialPlatformV1 } from '../contracts/social-factory.v1';

/** These are the metrics actually requested by our postAnalytics adapters, not platform-wide promises. */
const PUBLICATION_METRICS: Record<SocialPlatformV1, readonly string[]> = {
  telegram: [], // Bot API has no publication insight endpoint.
  instagram: ['Views', 'Reach', 'Saves', 'Likes', 'Comments', 'Shares'],
  youtube: ['Views', 'Likes', 'Comments'],
  threads: ['Views', 'Likes', 'Replies', 'Reposts', 'Quotes'],
  tiktok: ['Views', 'Likes', 'Comments', 'Shares'],
};
export function publicationMetrics(platform: SocialPlatformV1): readonly string[] {
  return PUBLICATION_METRICS[platform] ?? [];
}
export function platformForProvider(provider: string): SocialPlatformV1 | null {
  if (provider === 'instagram' || provider === 'instagram-standalone') return 'instagram';
  return ['telegram', 'youtube', 'threads', 'tiktok'].includes(provider) ? provider as SocialPlatformV1 : null;
}
/** Empty/whitespace/null/boolean are not observations of zero. */
export function observedNumber(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
