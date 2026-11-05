import { Injectable } from '@nestjs/common';
import type { AutonomyGrantV1, CampaignAllocationV1, CampaignItemV1, CampaignV1, EditorialMaterialV1, SocialFactoryStoreV1 } from '../contracts/social-factory.v1';
import { SocialFactoryRepository, sourceRef, resourceRef } from '../social-factory.repository';
import { assertGrantScope } from '../autonomy/grant-policy';
import { approvalDigest, digest, identity, localInstant, mustRead, requireValue, revisionContent, validTimeZone, initialCampaignSlot } from './domain';
export { approvalDigest } from './domain';

export interface CreateCampaignInput {
  actorId: string; requestId: string; name: string; timeZone: string; startsAt: string; endsAt: string;
  allocations: CampaignAllocationV1[]; mode?: CampaignV1['mode']; grantId?: string; researchIds?: string[]; findingIds?: string[];
  /** Trusted configured UTC channel slots, resolved by the composition root. */
  slotMinutesUtc?: Record<string, number[]>;
}
interface StoredCampaign extends CampaignV1 { requestDigest: string }
const platforms = new Set(['telegram', 'instagram', 'youtube', 'threads', 'tiktok']);
const formats = new Set(['post', 'thread', 'carousel', 'story', 'reel', 'short', 'long_video']);

@Injectable()
export class CampaignService {
  constructor(private readonly repository: SocialFactoryRepository) {}
  async create(organizationId: string, input: CreateCampaignInput): Promise<CampaignV1> {
    requireValue(organizationId && input.actorId && input.requestId && input.name?.trim(), 'CAMPAIGN_IDENTITY_REQUIRED');
    requireValue(validTimeZone(input.timeZone), 'CAMPAIGN_INVALID_TIMEZONE');
    const startsAt = localInstant(input.startsAt, input.timeZone);
    const endsAt = localInstant(input.endsAt, input.timeZone, true);
    requireValue(Date.parse(endsAt) >= Date.parse(startsAt), 'CAMPAIGN_INVALID_RANGE');
    requireValue(Array.isArray(input.allocations) && input.allocations.length > 0 && input.allocations.length <= 100, 'CAMPAIGN_ALLOCATION_REQUIRED');
    let total = 0;
    for (const allocation of input.allocations) {
      requireValue(allocation.channelId && platforms.has(allocation.platform) && formats.has(allocation.format), 'CAMPAIGN_INVALID_ALLOCATION');
      requireValue(!allocation.destination || allocation.destination.kind === 'draft' && allocation.destination.id === allocation.channelId && allocation.destination.publishable === false, 'CAMPAIGN_INVALID_DRAFT_DESTINATION');
      requireValue(Number.isSafeInteger(allocation.count) && allocation.count > 0, 'CAMPAIGN_INVALID_COUNT');
      requireValue(allocation.format === 'carousel' ? Number.isSafeInteger(allocation.slideCount) && allocation.slideCount! >= 2 && allocation.slideCount! <= 10 : allocation.slideCount === undefined, 'CAMPAIGN_INVALID_SLIDE_COUNT');
      total += allocation.count;
    }
    requireValue(total <= 1000, 'CAMPAIGN_TOO_LARGE');
    const mode = input.mode ?? 'prepare_approve';
    requireValue(['prepare_approve', 'collaborative', 'autopilot'].includes(mode), 'CAMPAIGN_INVALID_MODE');
    const id = identity('campaign', organizationId, input.actorId, input.requestId);
    const requestDigest = digest({ ...input, slotMinutesUtc: undefined, mode, startsAt, endsAt });
    return this.repository.transact(async store => {
      const existing = await store.read<StoredCampaign>(organizationId, 'campaign', id);
      if (existing) {
        requireValue(existing.payload.requestDigest === requestDigest, 'CAMPAIGN_IDEMPOTENCY_CONFLICT');
        return existing.payload;
      }
      const campaign: StoredCampaign = { version: 1, id, name: input.name.trim(), actorId: input.actorId, mode,
        timeZone: input.timeZone, startsAt, endsAt, state: 'active', allocations: structuredClone(input.allocations), itemIds: [],
        researchIds: [...new Set(input.researchIds ?? [])], findingIds: [...new Set(input.findingIds ?? [])],
        ...(input.grantId ? { grantId: input.grantId } : {}), createdAt: new Date().toISOString(), requestDigest, scheduleBasis: /^\d{4}-\d{2}-\d{2}$/.test(input.startsAt)&&/^\d{4}-\d{2}-\d{2}$/.test(input.endsAt) ? Object.values(input.slotMinutesUtc??{}).some(slots=>slots.length) ? 'channel' : 'tentative' : 'explicit' };
      if (mode === 'autopilot' || input.grantId) {
        requireValue(input.grantId, 'AUTONOMY_GRANT_REQUIRED');
        const grant = await mustRead<AutonomyGrantV1>(store, organizationId, 'grant', input.grantId);
        assertGrantScope(grant.payload, campaign, undefined, 'prepare');
      }
      for (let allocationIndex = 0; allocationIndex < input.allocations.length; allocationIndex++) {
        const allocation = input.allocations[allocationIndex];
        for (let index = 0; index < allocation.count; index++) {
          const itemId = identity('item', id, String(allocationIndex), String(index));
          // Midpoints keep each allocation evenly spaced, preserving exact totals per destination.
          const proposed = Date.parse(startsAt) + Math.floor((Date.parse(endsAt) - Date.parse(startsAt)) * (index + 0.5) / allocation.count);
          const scheduledAt = /^\d{4}-\d{2}-\d{2}$/.test(input.startsAt)&&/^\d{4}-\d{2}-\d{2}$/.test(input.endsAt) ? initialCampaignSlot(proposed,input.timeZone,Date.parse(startsAt),Date.parse(endsAt),input.slotMinutesUtc?.[allocation.channelId]) : new Date(proposed).toISOString();
          const item: CampaignItemV1 = { version: 1, id: itemId, campaignId: id, channelId: allocation.channelId,
            platform: allocation.platform, format: allocation.format, ...(allocation.destination ? {destination: structuredClone(allocation.destination)} : {}), state: 'planned', scheduledAt, contentRevision: 1,
            ...(allocation.sequenceId ? { sequenceId: allocation.sequenceId } : {}),
            ...(allocation.slideCount ? { slideCount: allocation.slideCount } : {}) };
          campaign.itemIds.push(itemId);
          await store.put({ organizationId, kind: 'campaign_item', id: itemId, parentId: id, payload: item, expectedRevision: 0 });
          await this.snapshot(store, organizationId, item);
        }
      }
      return (await store.put({ organizationId, kind: 'campaign', id, payload: campaign, expectedRevision: 0 })).payload;
    });
  }
  async get(organizationId: string, campaignId: string) {
    const campaign = (await mustRead<CampaignV1>(this.repository, organizationId, 'campaign', campaignId)).payload;
    const records = await this.repository.list<CampaignItemV1>(organizationId, 'campaign_item', 1001, campaignId);
    return { campaign, items: records.map(record => record.payload).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id)) };
  }
  async list(organizationId: string): Promise<CampaignV1[]> {
    return (await this.repository.list<CampaignV1>(organizationId, 'campaign')).map(record => record.payload);
  }
  async setMaterial(organizationId: string, campaignId: string, itemId: string, input: { material: EditorialMaterialV1; expectedContentRevision: number; editorialId?: string; discoveryIds?: string[] }): Promise<CampaignItemV1> {
    return this.edit(organizationId, campaignId, itemId, input.expectedContentRevision, item => {
      requireValue(input.material && Array.isArray(input.material.assets) && Array.isArray(input.material.evidence) && typeof input.material.title === 'string' && typeof input.material.body === 'string', 'CAMPAIGN_MATERIAL_INVALID');
      requireValue(input.material.version === 1 && input.material.channelId === item.channelId && input.material.platform === item.platform && input.material.format === item.format, 'CAMPAIGN_MATERIAL_SCOPE');
      requireValue(item.format !== 'carousel' || input.material.slides?.length === item.slideCount, 'CAMPAIGN_CAROUSEL_SLIDES');
      item.material = structuredClone(input.material);
      if(input.editorialId || input.discoveryIds !== undefined)(item as CampaignItemV1 & { sourceRecordRefs?: string[] }).sourceRecordRefs = [...(input.editorialId ? [resourceRef('editorial', input.editorialId)] : []), ...(input.discoveryIds ?? []).map(id => resourceRef('discovery', id))];
    });
  }
  /** An explicit author request starts a new content revision; ordinary prepare retries never do. */
  async beginRevision(org: string, campaignId: string, itemId: string, expectedContentRevision: number): Promise<CampaignItemV1> {
    return this.edit(org,campaignId,itemId,expectedContentRevision,item=>{
      requireValue(['planned','needs_input','failed','ready','awaiting_approval','approved'].includes(item.state),'CAMPAIGN_REVISION_ITEM_LOCKED');
      delete item.material;
      (item as CampaignItemV1 & {sourceRecordRefs?:string[]}).sourceRecordRefs=[];
    });
  }
  async reschedule(organizationId: string, campaignId: string, itemId: string, input: { scheduledAt: string; expectedContentRevision: number }): Promise<CampaignItemV1> {
    return this.edit(organizationId, campaignId, itemId, input.expectedContentRevision, (item, campaign) => {
      const at = localInstant(input.scheduledAt, campaign.timeZone);
      requireValue(at >= campaign.startsAt && at <= campaign.endsAt, 'CAMPAIGN_SCHEDULE_OUTSIDE_RANGE');
      item.scheduledAt = at;
    });
  }
  async approve(organizationId: string, campaignId: string, itemId: string, input: { actorId: string; expectedContentRevision: number; digest: string }): Promise<CampaignItemV1> {
    return this.repository.transact(async store => {
      const campaign = await mustRead<CampaignV1>(store, organizationId, 'campaign', campaignId);
      const record = await mustRead<CampaignItemV1>(store, organizationId, 'campaign_item', itemId);
      const item = record.payload;
      requireValue(input.actorId && campaign.payload.state === 'active' && item.campaignId === campaignId, 'CAMPAIGN_NOT_ACTIVE');
      requireValue(['ready', 'awaiting_approval', 'approved'].includes(item.state) && item.material, 'CAMPAIGN_NOT_READY');
      requireValue(input.expectedContentRevision === item.contentRevision && input.digest === approvalDigest(item), 'CAMPAIGN_APPROVAL_STALE');
      const approvalId = identity('approval', item.id, String(item.contentRevision), input.actorId);
      const prior = await store.read<NonNullable<CampaignItemV1['approval']>>(organizationId, 'action', approvalId);
      item.approval = prior?.payload ?? { revision: item.contentRevision, digest: input.digest, actorId: input.actorId, at: new Date().toISOString() };
      if (!prior) await store.put({ organizationId, kind: 'action', id: approvalId, parentId: identity('revision', item.id, String(item.contentRevision)), payload: item.approval, expectedRevision: 0 });
      item.state = 'approved';
      return (await store.put({ organizationId, kind: 'campaign_item', id: itemId, payload: item, expectedRevision: record.revision })).payload;
    });
  }
  async retry(organizationId: string, campaignId: string, itemIds?: string[]): Promise<CampaignItemV1[]> {
    return this.repository.transact(async store => {
      const campaign = (await mustRead<CampaignV1>(store, organizationId, 'campaign', campaignId)).payload;
      requireValue(campaign.state === 'active', 'CAMPAIGN_NOT_ACTIVE');
      requireValue(!itemIds || itemIds.every(id => campaign.itemIds.includes(id)), 'CAMPAIGN_ITEM_SCOPE');
      const items = await store.list<CampaignItemV1>(organizationId, 'campaign_item', 1001, campaignId);
      const changed: CampaignItemV1[] = [];
      for (const record of items) {
        const item = record.payload;
        if ((!itemIds || itemIds.includes(item.id)) && (item.state === 'failed' || item.state === 'needs_input' && !item.blocker)) {
          item.state = item.material ? 'ready' : 'planned';
          delete item.blocker; delete item.actionId;
          changed.push((await store.put({ organizationId, kind: 'campaign_item', id: item.id, payload: item, expectedRevision: record.revision })).payload);
        }
      }
      return changed;
    });
  }
  async setMode(organizationId: string, campaignId: string, input: { actorId: string; mode: CampaignV1['mode']; grantId?: string }): Promise<CampaignV1> {
    requireValue(input.actorId && ['prepare_approve', 'collaborative', 'autopilot'].includes(input.mode), 'CAMPAIGN_INVALID_MODE');
    return this.repository.transact(async store => {
      const record = await mustRead<CampaignV1>(store, organizationId, 'campaign', campaignId);
      requireValue(record.payload.state === 'active', 'CAMPAIGN_NOT_ACTIVE');
      const campaign = { ...record.payload, mode: input.mode, grantId: input.grantId };
      if (input.mode === 'autopilot' || input.grantId) {
        requireValue(input.grantId, 'AUTONOMY_GRANT_REQUIRED');
        const grant = (await mustRead<AutonomyGrantV1>(store, organizationId, 'grant', input.grantId)).payload;
        assertGrantScope(grant, campaign, undefined, 'prepare');
      }
      if (!input.grantId) delete campaign.grantId;
      return (await store.put({ organizationId, kind: 'campaign', id: campaignId, payload: campaign, expectedRevision: record.revision })).payload;
    });
  }
  async stop(organizationId: string, campaignId: string, actorId: string): Promise<CampaignV1> {
    requireValue(actorId, 'CAMPAIGN_ACTOR_REQUIRED');
    return this.repository.transact(async store => {
      const record = await mustRead<CampaignV1>(store, organizationId, 'campaign', campaignId);
      record.payload.state = 'stopped';
      const result = await store.put({ organizationId, kind: 'campaign', id: campaignId, payload: record.payload, expectedRevision: record.revision });
      for (const entry of await store.list<CampaignItemV1>(organizationId, 'campaign_item', 1001, campaignId)) {
        if (['published', 'submitting', 'uncertain'].includes(entry.payload.state)) continue;
        entry.payload.state = 'cancelled'; entry.payload.blocker = { code: 'CAMPAIGN_STOPPED', detail: 'Campaign stopped by user.' };
        await store.put({ organizationId, kind: 'campaign_item', id: entry.id, payload: entry.payload, expectedRevision: entry.revision });
      }
      return result.payload;
    });
  }
  private async edit(org: string, campaignId: string, itemId: string, expected: number, apply: (item: CampaignItemV1, campaign: CampaignV1) => void) {
    return this.repository.transact(async store => {
      const campaign = (await mustRead<CampaignV1>(store, org, 'campaign', campaignId)).payload;
      const record = await mustRead<CampaignItemV1>(store, org, 'campaign_item', itemId);
      const item = record.payload;
      requireValue(campaign.state === 'active' && item.campaignId === campaignId, 'CAMPAIGN_NOT_ACTIVE');
      requireValue(!['published', 'submitting', 'uncertain', 'cancelled'].includes(item.state), 'CAMPAIGN_ITEM_LOCKED');
      requireValue(expected === item.contentRevision, 'CAMPAIGN_REVISION_CONFLICT');
      apply(item, campaign);
      item.contentRevision++; item.state = item.material ? 'ready' : 'planned';
      delete item.approval; delete item.actionId; delete item.blocker; delete item.postId; delete item.delivery;
      await this.snapshot(store, org, item);
      return (await store.put({ organizationId: org, kind: 'campaign_item', id: itemId, payload: item, sourceIds: [...(item.material?.evidence ?? []).flatMap(e => e.sourceId ? [sourceRef(e.sourceId)] : []), ...((item as CampaignItemV1 & { sourceRecordRefs?: string[] }).sourceRecordRefs ?? [])], expectedRevision: record.revision })).payload;
    });
  }
  private async snapshot(store: SocialFactoryStoreV1, org: string, item: CampaignItemV1) {
    await store.put({ organizationId: org, kind: 'action', id: identity('revision', item.id, String(item.contentRevision)), parentId: item.id,
      payload: { type: 'campaign_item_revision', digest: approvalDigest(item), content: revisionContent(item) }, sourceIds: [...(item.material?.evidence ?? []).flatMap(e => e.sourceId ? [sourceRef(e.sourceId)] : []), ...((item as CampaignItemV1 & { sourceRecordRefs?: string[] }).sourceRecordRefs ?? [])], expectedRevision: 0 });
  }
}
