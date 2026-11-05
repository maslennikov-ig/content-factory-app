import { createHash } from 'node:crypto';
export interface YouTubeAnalyticsGrantV1 {
  version: 1; type: 'youtube_derived_metrics_amendment'; channelId: string;
  apiClientDigest: string; useCase: 'own_channel_analysis';
  acceptanceReference: string; acceptedAt: string; expiresAt: string;
  recordedBy: string; revokedAt?: string;
}
export const youtubeApiClientDigest = (clientId = process.env.YOUTUBE_CLIENT_ID) =>
  clientId ? createHash('sha256').update(clientId).digest('hex') : null;
export const youtubeGrantId = (channelId: string) => `youtube-derived-metrics:${channelId}`;
export function youtubeDerivationPermitted(grant: YouTubeAnalyticsGrantV1 | undefined, channelId: string, now: Date) {
  return !!grant && grant.version === 1 && grant.type === 'youtube_derived_metrics_amendment' &&
    grant.channelId === channelId && grant.useCase === 'own_channel_analysis' && !grant.revokedAt &&
    !!grant.acceptanceReference && !!grant.recordedBy && !!youtubeApiClientDigest() && grant.apiClientDigest === youtubeApiClientDigest() &&
    Number.isFinite(Date.parse(grant.acceptedAt)) && Date.parse(grant.acceptedAt) <= now.getTime() &&
    Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > now.getTime();
}
