import type { PlatformCapabilityV1, MaterialFormatV1 } from '../contracts/social-factory.v1';
import type { CtaSurfaceV1 } from './attribution.types';

export function ctaAttribution(capability: PlatformCapabilityV1, format: MaterialFormatV1 | undefined, surface: CtaSurfaceV1, hasItem: boolean) {
  if (capability.publishing === 'unavailable' || !capability.links.includes(surface)) return { available: false as const, reason: 'link_surface_unavailable' };
  if (surface === 'related_video') return { available: false as const, reason: 'internal_navigation_is_not_external_click_attribution' };
  if (capability.platform === 'youtube' && format === 'short' && surface === 'description') return { available: false as const, reason: 'shorts_description_urls_are_not_clickable' };
  if (capability.platform === 'youtube' && surface === 'description' && capability.accountType !== 'channel_advanced')
    return { available: false as const, reason: 'youtube_advanced_features_not_verified' };
  if (capability.platform === 'instagram' && surface === 'post') return { available: false as const, reason: 'instagram_caption_urls_are_not_clickable' };
  if (surface === 'story' && (format !== 'story' || !hasItem)) return { available: false as const, reason: 'story_link_requires_a_story_frame' };
  return { available: true as const, level: surface === 'bio' ? 'account' as const : hasItem ? 'post' as const : 'campaign' as const };
}
