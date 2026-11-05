import type { Integration } from '@prisma/client';
import type { SocialProvider } from '../../../integrations/social/social.integrations.interface';
import type { MaterialFormatV1, PlatformCapabilityV1, SocialPlatformV1 } from '../contracts/social-factory.v1';

const routes: Record<string, { platform: SocialPlatformV1; auth: string; account: string; formats: MaterialFormatV1[]; links: PlatformCapabilityV1['links']; metrics: string[] }> = {
  telegram: { platform: 'telegram', auth: 'bot', account: 'bot_destination', formats: ['post'], links: ['post'], metrics: ['subscribers'] },
  instagram: { platform: 'instagram', auth: 'facebook_login', account: 'professional_unknown', formats: ['post', 'carousel', 'reel'], links: ['bio'], metrics: ['views', 'reach', 'saved', 'likes', 'comments', 'shares'] },
  'instagram-standalone': { platform: 'instagram', auth: 'instagram_login', account: 'professional_unknown', formats: ['post', 'carousel', 'reel'], links: ['bio'], metrics: ['views', 'reach', 'saved', 'likes', 'comments', 'shares'] },
  youtube: { platform: 'youtube', auth: 'oauth', account: 'channel', formats: ['short', 'long_video'], links: [], metrics: ['views', 'likes', 'comments'] },
  threads: { platform: 'threads', auth: 'oauth', account: 'profile', formats: ['post', 'thread'], links: ['post', 'bio'], metrics: ['views', 'likes', 'replies', 'reposts', 'quotes'] },
  tiktok: { platform: 'tiktok', auth: 'oauth', account: 'creator', formats: ['short', 'carousel'], links: ['bio'], metrics: ['views', 'likes', 'comments', 'shares'] },
};

function accountType(integration: Integration): string | undefined {
  try {
    const settings = JSON.parse(integration.additionalSettings || '[]');
    const value = Array.isArray(settings)
      ? settings.find(setting => ['account_type', 'accountType'].includes(setting?.key ?? setting?.title))?.value
      : settings.account_type ?? settings.accountType;
    return typeof value === 'string' ? value.toLowerCase() : undefined;
  } catch { return undefined; }
}

/** Describes the installed publishing route, with unknown account gates kept explicit. No network calls. */
export function providerCapability(integration: Integration, provider: SocialProvider | undefined, expected?: SocialPlatformV1, verifiedAccount?: 'business' | 'creator' | 'unknown'): PlatformCapabilityV1 {
  const route = routes[integration.providerIdentifier];
  const platform = route?.platform ?? expected;
  if (!platform) throw new Error('SOCIAL_FACTORY_PLATFORM_UNKNOWN');
  const capability: PlatformCapabilityV1 = { platform, channelId: integration.id,
    accountType: route?.account ?? 'unknown', authRoute: route?.auth ?? 'unknown', formats: [],
    publishing: 'manual', links: [], metrics: [], requiredConsent: platform === 'tiktok' ? 'per_item' : 'connection', checkedAt: new Date().toISOString() };
  if (!route || !provider || typeof provider.post !== 'function') {
    capability.unavailableReason = 'Installed provider does not implement this publishing route; export or publish manually.';
    return capability;
  }
  if (expected && route.platform !== expected) throw new Error('SOCIAL_FACTORY_PLATFORM_MISMATCH');
  if (integration.deletedAt || integration.disabled || integration.inBetweenSteps || integration.refreshNeeded || !integration.token) {
    return { ...capability, publishing: 'unavailable', unavailableReason: 'Channel is disconnected, disabled or requires authorization.' };
  }
  capability.formats = [...route.formats];
  capability.links = [...route.links];
  // Installed metrics are capability names, never promised measured values. Telegram has no post metrics.
  capability.metrics = provider.postAnalytics || (platform === 'telegram' && provider.analyticsSnapshot) ? [...route.metrics] : [];
  capability.publishing = 'direct';
  if (platform === 'instagram') {
    const type = verifiedAccount ?? accountType(integration);
    capability.accountType = type === 'business' || type === 'creator' ? type : 'professional_unknown';
    if (type === 'business') capability.formats.push('story');
    if (type !== 'business') capability.unavailableReason = 'Story publishing requires a confirmed Business account; use manual continuation for Stories.';
    // Current provider has no Story link-sticker setting. Never advertise it.
  }
  if (platform === 'threads' && !provider.comment) capability.formats = ['post'];
  return capability;
}
