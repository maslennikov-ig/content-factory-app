import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ShortLinkService } from '../../../short-linking/short.link.service';
import { PostsService } from '../../../database/prisma/posts/posts.service';
import { SocialFactoryRepository, SocialFactoryError, resourceRef } from '../social-factory.repository';
import { SocialFactoryPublishingService } from '../publishing/publishing.service';
import type { CampaignItemV1, CampaignV1 } from '../contracts/social-factory.v1';
import type { AttributionLinkV1, ClaimedLeadLinkV1, CtaSurfaceV1 } from './attribution.types';
import { publicationContainsExactUrl } from './publication-links';
import { ctaAttribution } from './cta-policy';

@Injectable()
export class SocialFactoryAttributionService {
  constructor(private readonly store: SocialFactoryRepository, private readonly links: ShortLinkService,
    private readonly publishing: SocialFactoryPublishingService, private readonly posts: PostsService) {}

  async createLink(organizationId: string, input: { campaignId: string; channelId: string; itemId?: string; surface: CtaSurfaceV1; targetUrl: string; requestId: string }, now = new Date()) {
    const campaign = await this.store.read<CampaignV1>(organizationId, 'campaign', input.campaignId);
    if (!campaign || !campaign.payload.allocations.some((a) => a.channelId === input.channelId)) throw new SocialFactoryError('ATTRIBUTION_CAMPAIGN_SCOPE', undefined, 422);
    const item = input.itemId ? await this.store.read<CampaignItemV1>(organizationId, 'campaign_item', input.itemId) : null;
    if (input.itemId && (!item || item.payload.campaignId !== input.campaignId || item.payload.channelId !== input.channelId))
      throw new SocialFactoryError('ATTRIBUTION_ITEM_SCOPE', undefined, 422);
    if (!input.requestId || input.requestId.length > 200) throw new SocialFactoryError('ATTRIBUTION_REQUEST_REQUIRED', undefined, 422);
    let destination: URL;
    try { destination = new URL(input.targetUrl); } catch { throw new SocialFactoryError('ATTRIBUTION_URL_INVALID', undefined, 422); }
    if (destination.protocol !== 'https:' || destination.username || destination.password || destination.toString().length > 2048)
      throw new SocialFactoryError('ATTRIBUTION_URL_INVALID', undefined, 422);
    const capability = await this.publishing.capability(organizationId, input.channelId, item?.payload.platform);
    const policy = ctaAttribution(capability, item?.payload.format, input.surface, !!item);
    if (!policy.available) return { status: 'unavailable' as const, reason: policy.reason };
    const id = createHash('sha256').update(`${input.campaignId}:${input.channelId}:${input.requestId}`).digest('hex');
    const old = await this.store.read<AttributionLinkV1>(organizationId, 'attribution', id);
    if (old) {
      if (old.payload.targetUrl !== destination.toString() || old.payload.surface !== input.surface || old.payload.itemId !== input.itemId)
        throw new SocialFactoryError('ATTRIBUTION_REQUEST_REUSED');
      if (old.payload.shortening && old.payload.shortening.state !== 'ready') {
        const resolved = await this.links.getAllLinks(id);
        const found = resolved.find((value) => value.original === old.payload.shortening!.taggedUrl);
        if (!found) return { status: 'uncertain' as const, reason: 'short_link_creation_requires_reconciliation', link: old.payload };
        const confirmed = { ...old.payload, trackingUrl: found.short, shortening: { ...old.payload.shortening, state: 'ready' as const } };
        await this.store.put({ organizationId, kind: 'attribution', id, parentId: input.campaignId, payload: confirmed, expectedRevision: old.revision, expiresAt: new Date(confirmed.expiresAt) });
        return { status: 'available' as const, link: confirmed };
      }
      return { status: 'available' as const, link: old.payload };
    }
    // New links reserve utm_term for the opaque link token. Never replace an owner's keyword.
    if (destination.searchParams.has('utm_term') &&
      (destination.searchParams.getAll('utm_term').length !== 1 || destination.searchParams.get('utm_term') !== id))
      throw new SocialFactoryError('ATTRIBUTION_UTM_TERM_CONFLICT', undefined, 422);
    destination.searchParams.set('utm_term', id);
    destination.searchParams.set('utm_source', capability.platform);
    destination.searchParams.set('utm_medium', 'social'); destination.searchParams.set('utm_campaign', input.campaignId);
    destination.searchParams.set('cf_ref', id);
    // Account-wide profile links cannot contain an exact post id.
    if (policy.level === 'post') destination.searchParams.set('utm_content', input.itemId!);
    else destination.searchParams.delete('utm_content');
    const configured = ShortLinkService.provider.shortLinkDomain !== 'empty';
    const payload: AttributionLinkV1 = { version: 1, id, channelId: input.channelId, campaignId: input.campaignId,
      ...(input.itemId ? { itemId: input.itemId } : {}), platform: capability.platform, ...(item ? { format: item.payload.format } : {}),
      surface: input.surface, level: policy.level, targetUrl: new URL(input.targetUrl).toString(), trackingUrl: destination.toString(),
      createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
      placement: policy.level === 'account' ? 'manual_account_placement' : 'pending_verification',
      shortening: { state: configured ? 'pending' : 'ready', taggedUrl: destination.toString() },
      clickAvailability: configured ? 'configured' : 'unavailable' };
    const created = await this.store.put({ organizationId, kind: 'attribution', id, parentId: input.campaignId, payload, expectedRevision: 0,
      expiresAt: new Date(payload.expiresAt), sourceIds: [] });
    if (!configured) return { status: 'available' as const, link: payload };
    try {
      const converted = await this.links.convertTextToShortLinks(id, [destination.toString()]);
      const short = new URL(converted[0]);
      if (short.protocol !== 'https:' || short.username || short.password) throw new Error('invalid_short_link');
      const confirmed = { ...payload, trackingUrl: short.toString(), shortening: { ...payload.shortening!, state: 'ready' as const } };
      await this.store.put({ organizationId, kind: 'attribution', id, parentId: input.campaignId, payload: confirmed, expectedRevision: created.revision, expiresAt: new Date(payload.expiresAt) });
      return { status: 'available' as const, link: confirmed };
    } catch {
      return { status: 'uncertain' as const, reason: 'short_link_creation_requires_reconciliation', link: payload };
    }
  }

  /** Current local authority for an exact CRM UTM comparison; does not claim a click/person/payment. */
  async trackingEvidence(organizationId: string, linkId: string, now = new Date()) {
    const unavailable = (reason: string) => ({ status: 'unavailable' as const, reason });
    const row = await this.store.read<AttributionLinkV1>(organizationId, 'attribution', linkId);
    if (!row || row.payload.id !== linkId || !/^[a-f0-9]{64}$/.test(linkId) ||
      !Number.isFinite(Date.parse(row.payload.expiresAt)) || Date.parse(row.payload.expiresAt) <= now.getTime())
      return unavailable('current_tracking_link_absent');
    const link = row.payload;
    const campaign = await this.store.read<CampaignV1>(organizationId, 'campaign', link.campaignId);
    if (!campaign?.payload.allocations.some((allocation) => allocation.channelId === link.channelId))
      return unavailable('tracking_campaign_scope_unavailable');
    if (link.shortening && link.shortening.state !== 'ready') return unavailable('short_link_creation_uncertain');
    const capability = await this.publishing.capability(organizationId, link.channelId, link.platform);
    const policy = ctaAttribution(capability, link.format, link.surface, !!link.itemId);
    if (!policy.available || policy.level !== link.level) return unavailable('current_link_surface_unavailable');
    if (link.level === 'post') {
      const item = await this.store.read<CampaignItemV1>(organizationId, 'campaign_item', link.itemId!);
      const post = item?.payload.postId ? await this.posts.getPostById(item.payload.postId, organizationId) : null;
      if (item?.payload.campaignId !== link.campaignId || item?.payload.channelId !== link.channelId ||
        !item?.payload.publication || !post || post.organizationId !== organizationId || post.state !== 'PUBLISHED' || post.deletedAt ||
        post.integrationId !== link.channelId || post.releaseId !== item.payload.publication.externalId ||
        !publicationContainsExactUrl(post.content, link.trackingUrl))
        return unavailable('tracking_link_not_verified_in_published_revision');
    }
    try {
      const tagged = new URL(link.shortening?.taggedUrl ?? link.trackingUrl);
      const expected = { utm_term: linkId, cf_ref: linkId, utm_source: link.platform, utm_medium: 'social',
        utm_campaign: link.campaignId, ...(link.level === 'post' ? { utm_content: link.itemId! } : {}) };
      if (Object.entries(expected).some(([key, value]) => tagged.searchParams.getAll(key).length !== 1 || tagged.searchParams.get(key) !== value) ||
        (link.level !== 'post' && tagged.searchParams.has('utm_content')))
        return unavailable('exact_tracking_utm_receipt_absent');
      return { status: 'available' as const, link, fields: { link: linkId, campaign: link.campaignId, source: link.platform,
        medium: 'social', ...(link.level === 'post' ? { content: link.itemId! } : {}) } };
    } catch { return unavailable('exact_tracking_utm_receipt_absent'); }
  }

  async clicks(organizationId: string, linkId: string, now = new Date()): Promise<{ availability: 'available' | 'unknown' | 'restricted' | 'unsupported'; value: number | null; level: AttributionLinkV1['level']; reason?: string; source?: string; observedAt?: string; caveat?: string }> {
    await this.store.purgeExpired(organizationId, now);
    const row = await this.store.read<AttributionLinkV1>(organizationId, 'attribution', linkId);
    if (!row || !row.payload.trackingUrl) throw new SocialFactoryError('ATTRIBUTION_LINK_NOT_FOUND', undefined, 404);
    const link = row.payload;
    if (link.shortening && link.shortening.state !== 'ready') return { availability: 'unknown' as const, value: null, level: link.level, reason: 'short_link_creation_uncertain' };
    if (link.clickAvailability !== 'configured') return { availability: 'unsupported' as const, value: null, level: link.level, reason: 'short_link_provider_not_configured' };
    const capability = await this.publishing.capability(organizationId, link.channelId, link.platform);
    if (!ctaAttribution(capability, link.format, link.surface, !!link.itemId).available)
      return { availability: 'restricted' as const, value: null, level: link.level, reason: 'current_link_surface_unavailable' };
    if (link.level === 'post') {
      const item = await this.store.read<CampaignItemV1>(organizationId, 'campaign_item', link.itemId!);
      const post = item?.payload.postId ? await this.posts.getPostById(item.payload.postId, organizationId) : null;
      if (!item?.payload.publication || !post || post.organizationId !== organizationId || post.state !== 'PUBLISHED' || post.deletedAt || post.integrationId !== link.channelId ||
        post.releaseId !== item.payload.publication.externalId || !publicationContainsExactUrl(post.content, link.trackingUrl))
        return { availability: 'unknown' as const, value: null, level: link.level, reason: 'tracking_link_not_verified_in_published_revision' };
    }
    const statistics = await this.links.getStatistics([link.trackingUrl]);
    const measured = statistics.find((s) => s.short === link.trackingUrl);
    const value = measured && measured.clicks.trim() !== '' ? Number(measured.clicks) : NaN;
    return { availability: Number.isFinite(value) && value >= 0 ? 'available' as const : 'unknown' as const,
      value: Number.isFinite(value) && value >= 0 ? value : null, level: link.level, source: 'short_link_provider',
      observedAt: now.toISOString(), caveat: 'Clicks are link events, not unique people, leads, deals or received payments.' };
  }

  /** Existing ContentLead rows are editorial leads, not CRM customers. Keep human linkage explicitly claimed. */
  async claimLead(organizationId: string, linkId: string, actorId: string, input: { leadId: string; evidenceRef: string; note?: string }, now = new Date()) {
    const link = await this.store.read<AttributionLinkV1>(organizationId, 'attribution', linkId);
    if (!link || !input.leadId || input.leadId.length > 240 || !input.evidenceRef || input.evidenceRef.length > 500 || !actorId || (input.note?.length ?? 0) > 2000)
      throw new SocialFactoryError('ATTRIBUTION_LEAD_EVIDENCE_REQUIRED', undefined, 422);
    const payload: ClaimedLeadLinkV1 = { version: 1, id: randomUUID(), linkId, leadId: input.leadId,
      evidenceRef: input.evidenceRef, assertedBy: actorId, assertedAt: now.toISOString(), confidence: 'owner_reported',
      level: link.payload.level, note: input.note ?? 'Human-reported relationship; no automatic click-to-CRM join is evidenced.' };
    await this.store.put({ organizationId, kind: 'attribution', id: payload.id, parentId: linkId, payload, expectedRevision: 0,
      expiresAt: new Date(link.payload.expiresAt), sourceIds: [resourceRef('attribution', linkId)] });
    return payload;
  }

  revoke(organizationId: string, sourceId: string) { return this.store.invalidateBySource(organizationId, sourceId); }
}
