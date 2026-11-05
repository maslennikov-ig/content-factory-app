import type { DiscoveryRequest, DiscoverySourceGrant } from './discovery.types';

export function sourcePermissionFailure(
  grant: DiscoverySourceGrant, request: DiscoveryRequest, now: Date
): string | null {
  if (!grant || grant.organizationId !== request.organizationId || !grant.sourceId ||
      !Array.isArray(grant.channelIds) || !grant.channelIds.includes(request.profile.channelId)) return 'SOURCE_SCOPE_REQUIRED';
  if (!grant.revision?.trim() || !grant.evidenceId?.trim() || !grant.sourceContext?.trim() ||
      !['owned', 'licensed', 'consented'].includes(grant.basis) ||
      !['first_party', 'web', 'telegram', 'youtube', 'other'].includes(grant.origin) ||
      !['first_party', 'upload', 'url', 'rss', 'search', 'licensed'].includes(grant.acquisition))
    return 'SOURCE_PROVENANCE_REQUIRED';
  if (!Array.isArray(grant.purposes) || !grant.purposes.includes('discovery')) return 'AI_REUSE_PERMISSION_REQUIRED';
  if (grant.revokedAt || !Number.isFinite(Date.parse(grant.expiresAt)) ||
      Date.parse(grant.expiresAt) <= now.getTime()) return 'SOURCE_PERMISSION_EXPIRED';
  if (grant.origin === 'telegram') {
    const consent = grant.telegramConsent;
    if (!consent?.evidenceId?.trim() || consent.context !== grant.sourceContext ||
        consent.allRelevantUsers !== true || consent.explicitInformedAffirmative !== true ||
        consent.continued !== true) return 'TELEGRAM_SCOPED_CONSENT_REQUIRED';
  }
  return null;
}

/** Public acquisition is never an exception for Telegram-origin content. */
export function publicOriginAllowed(origin: DiscoverySourceGrant['origin']): boolean {
  return origin === 'web' || origin === 'first_party';
}
