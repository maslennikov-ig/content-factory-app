import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { PostsService } from '../../../database/prisma/posts/posts.service';
import { SocialFactoryRepository, SocialFactoryError, sourceRef, resourceRef } from '../social-factory.repository';
import type { CampaignItemV1, SocialFactoryStoreV1 } from '../contracts/social-factory.v1';
import type { MeasurementObservationV1 } from './measurement.types';
import { activeObservation, OBSERVATION_RETENTION_MS } from './measurement.types';
import { youtubeApiClientDigest, youtubeDerivationPermitted, youtubeGrantId, type YouTubeAnalyticsGrantV1 } from './youtube-analytics-grant';
import { observedNumber, platformForProvider, publicationMetrics } from './provider-measurement.policy';

export const SOCIAL_FACTORY_MEASUREMENT_CLOCK = Symbol('SOCIAL_FACTORY_MEASUREMENT_CLOCK');

@Injectable()
export class SocialFactoryMeasurementService {
  constructor(private readonly store: SocialFactoryRepository, private readonly posts: PostsService,
    @Optional() @Inject(SOCIAL_FACTORY_MEASUREMENT_CLOCK) private readonly clock: () => Date = () => new Date()) {}

  private async publication(organizationId: string, item: CampaignItemV1) {
    if (item.state !== 'published' || !item.publication || !item.postId)
      throw new SocialFactoryError('MEASUREMENT_PUBLICATION_REQUIRED', 'A provider publication receipt is required.', 422);
    const post = await this.posts.getPostById(item.postId, organizationId);
    if (!post || post.state !== 'PUBLISHED' || post.organizationId !== organizationId || post.deletedAt ||
      post.integration?.organizationId !== organizationId || post.integrationId !== item.channelId ||
      post.releaseId !== item.publication.externalId || platformForProvider(post.integration.providerIdentifier) !== item.platform)
      throw new SocialFactoryError('MEASUREMENT_PUBLICATION_MISMATCH', 'The publication does not match this campaign item.', 422);
    return post;
  }

  /** requestId is caller-stable on retry. Collection never manufactures a second publication sample. */
  async capture(organizationId: string, itemId: string, requestId: string) {
    const startedAt = this.clock();
    if (!requestId || requestId.length > 200 || !Number.isFinite(startedAt.getTime())) throw new SocialFactoryError('MEASUREMENT_INVALID_INPUT', undefined, 400);
    const row = await this.store.read<CampaignItemV1>(organizationId, 'campaign_item', itemId);
    if (!row) throw new SocialFactoryError('MEASUREMENT_ITEM_NOT_FOUND', undefined, 404);
    const item = row.payload;
    const post = await this.publication(organizationId, item);
    const restricted = this.accountRevoked(post);
    if (restricted) {
      await this.store.invalidateBySource(organizationId, `integration:${post.integrationId}`);
      throw new SocialFactoryError('MEASUREMENT_ACCESS_REVOKED', 'The connected account no longer permits measurement.', 403);
    }
    const metrics = publicationMetrics(item.platform);
    // Telegram has no Bot API insights. Record the limitation rather than a zero.
    const requested = metrics.length ? metrics : ['Views'];
    const prefix = createHash('sha256').update(`${itemId}:${item.publication!.revision}:${requestId}`).digest('hex');
    const prior = await this.store.read<MeasurementObservationV1>(organizationId, 'observation', `${prefix}:${requested[0]}`);
    if (prior) return this.listForItem(organizationId, itemId, startedAt, prefix);
    const live = restricted || !metrics.length ? [] : await this.posts.checkPostAnalytics(organizationId, post.id, 30);
    // PostsService currently bypasses its commented-out Redis read and calls postAnalytics directly.
    // Stamp acquisition completion, never a cache-read time or the metric's day-only display label.
    const now = this.clock();
    const series = Array.isArray(live) ? live : [];
    const policyGrant = item.platform === 'youtube' ? await this.store.read<YouTubeAnalyticsGrantV1>(organizationId, 'grant', youtubeGrantId(item.channelId)) : null;
    const publishedAt = new Date(item.publication!.publishedAt);
    if (!Number.isFinite(publishedAt.getTime()) || publishedAt > now) throw new SocialFactoryError('MEASUREMENT_PUBLICATION_TIME', undefined, 422);
    const expiresAt = new Date(now.getTime() + OBSERVATION_RETENTION_MS).toISOString();
    const sourceId = `integration:${post.integrationId}`;
    const publicationSource = `publication:${post.id}:${item.publication!.revision}`;
    const values: MeasurementObservationV1[] = requested.map((metric) => {
      const found = series.find((value) => value.label === metric);
      // Post adapters return cumulative totals. Do not sum daily snapshots of the same counter.
      const points = [...(found?.data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
      const value = observedNumber(points[points.length - 1]?.total);
      return {
        version: 1, id: `${prefix}:${metric}`, campaignId: item.campaignId, itemId,
        channelId: item.channelId, accountId: post.integrationId, platform: item.platform, authRoute: 'connected_integration',
        publicationId: item.publication!.externalId, revision: item.publication!.revision, format: item.format,
        metric, unit: 'count', value: restricted || !metrics.length ? null : value,
        availability: restricted ? 'restricted' : !metrics.length ? 'unsupported' : value === null ? 'unknown' : 'available',
        source: `provider:${post.integration.providerIdentifier}:postAnalytics`, access: 'first_party',
        observedAt: now.toISOString(), authorizationCheckedAt: now.toISOString(), expiresAt,
        // YouTube API derived metrics need an accepted policy amendment. Raw counters remain available.
        derivationAllowed: item.platform !== 'youtube' || youtubeDerivationPermitted(policyGrant?.payload, item.channelId, now),
        ...(policyGrant ? { derivationGrantRevision: policyGrant.revision } : {}),
        window: { kind: 'lifetime', start: publishedAt.toISOString(), end: now.toISOString(), ageSeconds: Math.floor((now.getTime() - publishedAt.getTime()) / 1000) },
        evidence: [{ id: publicationSource, sourceId, source: post.integration.providerIdentifier, capturedAt: now.toISOString(), expiresAt,
          access: 'first_party', rights: restricted ? 'restricted' : 'permitted', factStatus: value === null ? 'unknown' : 'verified',
          ownerScope: organizationId, sourceRevision: publicationSource, originPlatform: item.platform,
          purpose: 'own_publication_measurement', note: 'Raw cumulative provider counter; absence is not zero.' }],
      };
    });
    return this.store.transact(async (store) => {
      const duplicate = await store.read<MeasurementObservationV1>(organizationId, 'observation', `${prefix}:${requested[0]}`);
      if (duplicate) return values.map((v) => v.id).reduce(async (pending, id) => { const all = await pending; const row = await store.read<MeasurementObservationV1>(organizationId, 'observation', id); if (row) all.push(row.payload); return all; }, Promise.resolve([] as MeasurementObservationV1[]));
      const current = await store.read<CampaignItemV1>(organizationId, 'campaign_item', itemId);
      if (current?.revision !== row.revision) throw new SocialFactoryError('MEASUREMENT_REVISION_CHANGED');
      const refreshed = await this.publication(organizationId, item);
      if (this.accountRevoked(refreshed))
        throw new SocialFactoryError('MEASUREMENT_ACCESS_REVOKED');
      for (const observation of values) await store.put({ organizationId, kind: 'observation', id: observation.id,
        parentId: itemId, payload: observation, expectedRevision: 0, expiresAt: new Date(expiresAt),
        sourceIds: [sourceRef(sourceId), sourceRef(publicationSource), resourceRef('campaign_item', itemId), ...(observation.derivationAllowed && policyGrant ? [sourceRef(`youtube-amendment:${item.channelId}:${policyGrant.revision}`)] : [])] });
      return values;
    });
  }

  private accountRevoked(post: { integration: { disabled?: boolean; refreshNeeded?: boolean; deletedAt?: Date | null; inBetweenSteps?: boolean; token?: string } }) {
    return post.integration.disabled || post.integration.refreshNeeded || !!post.integration.deletedAt || post.integration.inBetweenSteps || !post.integration.token;
  }

  private async purgeItemObservations(organizationId: string, itemId: string, store: SocialFactoryStoreV1 = this.store) {
    let cursor: string | undefined;
    do {
      const page = await store.page<MeasurementObservationV1>(organizationId, 'observation', { parentId: itemId, cursor, limit: 250 });
      for (const row of page.items) await store.remove(organizationId, 'observation', row.id, row.revision);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  async listForItem(organizationId: string, itemId: string, now = new Date(), prefix?: string) {
    await this.store.purgeExpired(organizationId, now);
    const item = await this.store.read<CampaignItemV1>(organizationId, 'campaign_item', itemId);
    if (!item) { await this.purgeItemObservations(organizationId, itemId); return []; }
    try {
      const post = await this.publication(organizationId, item.payload);
      if (this.accountRevoked(post)) { await this.store.invalidateBySource(organizationId, `integration:${post.integrationId}`); return []; }
    } catch (error) {
      if (!(error instanceof SocialFactoryError)) throw error;
      await this.purgeItemObservations(organizationId, itemId); return [];
    }
    return this.rowsForItem(organizationId, itemId, now, prefix);
  }

  private async rowsForItem(organizationId: string, itemId: string, now: Date, prefix?: string) {
    const output: MeasurementObservationV1[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.store.page<MeasurementObservationV1>(organizationId, 'observation', { parentId: itemId, cursor, limit: 250 });
      output.push(...page.items.map((row) => row.payload).filter((value) => (!prefix || value.id.startsWith(prefix)) && activeObservation(value, now)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return output;
  }

  /** Every use rechecks the publication/access boundary; source revocation scrubs derived payloads too. */
  async validObservations(organizationId: string, itemIds: string[], now = new Date(), store: SocialFactoryStoreV1 = this.store) {
    const result: MeasurementObservationV1[] = [];
    for (const itemId of [...new Set(itemIds)]) {
      const item = await store.read<CampaignItemV1>(organizationId, 'campaign_item', itemId);
      if (!item) continue;
      try {
        const post = await this.publication(organizationId, item.payload);
        if (this.accountRevoked(post)) {
          await store.invalidateBySource(organizationId, `integration:${post.integrationId}`);
          continue;
        }
        await store.purgeExpired(organizationId, now);
        const observations = await this.rowsForItem(organizationId, itemId, now);
        const grant = item.payload.platform === 'youtube' ? await store.read<YouTubeAnalyticsGrantV1>(organizationId, 'grant', youtubeGrantId(item.payload.channelId)) : null;
        const permitted = item.payload.platform !== 'youtube' || youtubeDerivationPermitted(grant?.payload, item.payload.channelId, now);
        if (!permitted && grant) await store.invalidateBySource(organizationId, `youtube-amendment:${item.payload.channelId}:${grant.revision}`);
        result.push(...observations.filter((v) => v.publicationId === item.payload.publication!.externalId && v.revision === item.payload.publication!.revision).map(v => ({ ...v, derivationAllowed: v.derivationAllowed && permitted && (item.payload.platform !== 'youtube' || v.derivationGrantRevision === grant?.revision) })));
      } catch (error) {
        if (!(error instanceof SocialFactoryError)) throw error;
        await this.purgeItemObservations(organizationId, itemId, store);
      }
    }
    return result;
  }

  /** Admin-only entry: controller must resolve the human actor and workspace administration rights. */
  async recordYouTubeAmendment(organizationId: string, channelId: string, actorId: string, input: { acceptanceReference: string; acceptedAt: string; expiresAt: string; expectedRevision: number }, now = new Date()) {
    type ProfileScope = { channelId?: string; platform?: string };
    const saved = await this.store.read<ProfileScope & { format?: string; profile?: ProfileScope }>(organizationId, 'channel_profile', channelId);
    const storedProfile = saved?.payload;
    const profile = storedProfile?.format === 'channel-profile-base/v1' ? storedProfile.profile : storedProfile?.format === undefined ? storedProfile : null;
    if (!profile || profile.channelId !== channelId || profile.platform !== 'youtube') throw new SocialFactoryError('YOUTUBE_AMENDMENT_CHANNEL_SCOPE', undefined, 422);
    const client = youtubeApiClientDigest();
    if (!client || !actorId || !input.acceptanceReference?.trim() || input.acceptanceReference.length > 1000 ||
      !Number.isFinite(Date.parse(input.acceptedAt)) || Date.parse(input.acceptedAt) > now.getTime() ||
      !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= now.getTime())
      throw new SocialFactoryError('YOUTUBE_AMENDMENT_EVIDENCE_REQUIRED', undefined, 422);
    const payload: YouTubeAnalyticsGrantV1 = { version: 1, type: 'youtube_derived_metrics_amendment', channelId,
      apiClientDigest: client, useCase: 'own_channel_analysis', acceptanceReference: input.acceptanceReference.trim(),
      acceptedAt: new Date(input.acceptedAt).toISOString(), expiresAt: new Date(input.expiresAt).toISOString(), recordedBy: actorId };
    return this.store.transact(async (store) => {
      const record = await store.put({ organizationId, kind: 'grant', id: youtubeGrantId(channelId), parentId: channelId, expectedRevision: input.expectedRevision, payload, sourceIds: [] });
      if (input.expectedRevision > 0) await store.invalidateBySource(organizationId, `youtube-amendment:${channelId}:${input.expectedRevision}`);
      return record;
    });
  }

  revokeYouTubeAmendment(organizationId: string, channelId: string, expectedRevision: number) {
    return this.store.transact(async (store) => {
      const row = await store.read<YouTubeAnalyticsGrantV1>(organizationId, 'grant', youtubeGrantId(channelId));
      if (!row || row.revision !== expectedRevision) throw new SocialFactoryError('YOUTUBE_AMENDMENT_REVISION_CONFLICT');
      await store.put({ organizationId, kind: 'grant', id: row.id, parentId: channelId, expectedRevision,
        payload: { ...row.payload, revokedAt: this.clock().toISOString() }, sourceIds: [] });
      await store.invalidateBySource(organizationId, `youtube-amendment:${channelId}:${expectedRevision}`);
    });
  }

  revokeSource(organizationId: string, sourceId: string) { return this.store.invalidateBySource(organizationId, sourceId); }
}
