import type { AutonomyGrantV1, CampaignItemV1, CampaignV1 } from '../contracts/social-factory.v1';
import { requireValue, validTimeZone } from '../campaign/domain';

export type GrantAction = AutonomyGrantV1['actions'][number];
export function assertGrantScope(grant: AutonomyGrantV1, campaign: CampaignV1, item: CampaignItemV1 | undefined, action: GrantAction, now = new Date(), postingAt?: Date) {
  requireValue(!grant.revokedAt && Date.parse(grant.expiresAt) > now.getTime(), 'AUTONOMY_GRANT_INACTIVE');
  requireValue(!grant.campaignId || grant.campaignId === campaign.id, 'AUTONOMY_CAMPAIGN_SCOPE');
  requireValue(grant.mode === campaign.mode, 'AUTONOMY_MODE_SCOPE');
  requireValue(grant.actions.includes(action), 'AUTONOMY_ACTION_SCOPE');
  const allocations = item ? [item] : campaign.allocations;
  requireValue(allocations.every(entry => grant.channelIds.includes(entry.channelId)), 'AUTONOMY_CHANNEL_SCOPE');
  requireValue(!grant.formats || allocations.every(entry => grant.formats!.includes(entry.format)), 'AUTONOMY_FORMAT_SCOPE');
  if (item && (action === 'publish' || action === 'schedule')) {
    const at = new Date(action === 'schedule' ? item.scheduledAt : postingAt ?? now);
    if (grant.postingWindows?.length) {
      requireValue(!!grant.timeZone && validTimeZone(grant.timeZone), 'AUTONOMY_WINDOW_TIMEZONE');
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: grant.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map(part => [part.type, part.value]));
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
      const time = `${parts.hour}:${parts.minute}`;
      requireValue(grant.postingWindows.some(window => window.daysOfWeek.includes(day) && time >= window.start && time < window.end), 'AUTONOMY_POSTING_WINDOW');
    }
    const text = item.material ? JSON.stringify(item.material).toLocaleLowerCase() : '';
    requireValue(!(grant.exclusions ?? []).some(term => text.includes(term.toLocaleLowerCase())), 'AUTONOMY_EXCLUDED_CONTENT');
  }
}
