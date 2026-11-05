import { tikTokRequiredDeclarations } from '../../../integrations/social/tiktok-publication-policy';
import { publicationConsentIdV1, readPublicationConsentV1, type PublicationConsentV1 } from './publication-consent.v1';
import { nativeAttachmentAssetsV1 } from '../editorial/native-attachments.v1';
import { Injectable } from '@nestjs/common';
import { IntegrationService } from '../../../database/prisma/integrations/integration.service';
import { PostsService } from '../../../database/prisma/posts/posts.service';
import { IntegrationManager } from '../../../integrations/integration.manager';
import type { PublicationKeyV106, PublicationResultV106 } from '../../../database/prisma/posts/publication-store.v106';
import { stripHtmlValidation } from '@contentfactory/helpers/utils/strip.html.validation';
import type { PostDetails, PostResponse } from '../../../integrations/social/social.integrations.interface';
import { PieceService } from '../../pieces/piece.service';
import { PieceRepository, type WorkspaceDraftRow } from '../../pieces/piece.repository';
import { editorHtml } from '../../brief/editor-html';
import { SocialFactoryRepository, SocialFactoryError } from '../social-factory.repository';
import { approvalDigest, canonical, digest } from '../campaign/domain';
import { CampaignService } from '../campaign/campaign.service';
import { AutonomyService } from '../autonomy/autonomy.service';
import type { CampaignItemV1, CampaignV1, DeliveryResultV1, SocialPlatformV1 } from '../contracts/social-factory.v1';
import type { SocialFactoryPublicationGuard } from './publication-guard';
import { nativePublicBody } from '../editorial/native-material.service';
import { providerCapability } from './provider-capabilities';
import { publicationWarning } from '../../../integrations/publication-warnings';

export interface DeliverInput {
  campaignId: string; itemId: string; requestId: string; action: 'schedule' | 'publish';
  expectedContentRevision: number; approvalDigest?: string; grantId?: string; actorId?: string;
  authority?: 'user' | 'agent'; requiredConsentId?: string; consentIds?: string[];
}
interface Binding {
  campaignId: string; itemId: string; delivery: NonNullable<CampaignItemV1['delivery']>;
  parts?: { postId: string; postDigest: string; index: number }[]; partIndex?: number;
}
function demand(value: unknown, code: string): asserts value {
  if (!value) throw new SocialFactoryError(code);
}
function parse<T>(value: string | null, fallback: T): T {
  try { return JSON.parse(value || JSON.stringify(fallback)); }
  catch { throw new SocialFactoryError('SOCIAL_FACTORY_NATIVE_PAYLOAD_INVALID'); }
}
function frozenDelivery(delivery: Binding['delivery']) {
  const { publishActionId, scheduleActionId, ...content } = delivery;
  return canonical(content);
}
function snapshot(draft: WorkspaceDraftRow): string {
  return digest({ content: draft.post!.content,
    image: parse(draft.post!.image, []), settings: parse(draft.post!.settings, {}),
    channelId: draft.post!.integration.id, provider: draft.post!.integration.providerIdentifier });
}

/** Bridges campaigns to the existing editor/calendar and the V106 publication journal. */
@Injectable()
export class SocialFactoryPublishingService implements SocialFactoryPublicationGuard {
  constructor(private readonly repository: SocialFactoryRepository,
    private readonly campaigns: CampaignService, private readonly autonomy: AutonomyService,
    private readonly integrations: IntegrationService, private readonly providers: IntegrationManager,
    private readonly pieces: PieceService, private readonly native: PieceRepository,
    private readonly posts: PostsService) {}

  private declarations(item: CampaignItemV1) {
    if (item.platform !== 'tiktok') return [];
    try { return tikTokRequiredDeclarations(item.material?.settings ?? {}); }
    catch { throw new SocialFactoryError('SOCIAL_FACTORY_PLATFORM_DECLARATIONS_UNAVAILABLE'); }
  }
  /** Internal native boundary only: its caller has verified the existing exact args/content confirmation grants.
   * Never forwarded from a controller DTO, model argument or generic autonomy grant.
   */
  async confirmPublicationConsent(org: string, input: Omit<DeliverInput, 'authority'> & { authority: 'native_approval'; approvedDigest: string }) {
    demand(input.authority === 'native_approval' && input.actorId, 'AUTONOMY_PLATFORM_CONSENT_REQUIRED');
    return this.repository.transact(async store => {
      const campaigns = new CampaignService(store as SocialFactoryRepository);
      const { campaign, items } = await campaigns.get(org, input.campaignId), item = items.find(row => row.id === input.itemId);
      demand(campaign.state === 'active' && item && item.contentRevision === input.expectedContentRevision && approvalDigest(item) === input.approvedDigest,
        'SOCIAL_FACTORY_CONTENT_REVISION_CONFLICT');
      const declarations = this.declarations(item); demand(declarations.length, 'AUTONOMY_PLATFORM_CONSENT_REQUIRED');
      const scope = { organizationId: org, actorId: input.actorId!, campaignId: campaign.id, itemId: item.id, requestId: input.requestId, deliveryAction: input.action,
        contentRevision: item.contentRevision, contentDigest: input.approvedDigest, declarations, declarationsDigest: digest(declarations) };
      const id = publicationConsentIdV1(scope), prior = await store.read<PublicationConsentV1>(org, 'action', id);
      if (prior) return prior.payload;
      const receipt: PublicationConsentV1 = { ...scope, id, type: 'publication_consent', version: 1, approvedAt: new Date().toISOString() };
      return (await store.put({ organizationId: org, kind: 'action', id, parentId: item.id, expectedRevision: 0, payload: receipt })).payload;
    });
  }

  async capability(org: string, channelId: string, platform?: SocialPlatformV1) {
    const integration = await this.integrations.getIntegrationById(org, channelId);
    demand(integration && integration.organizationId === org, 'SOCIAL_FACTORY_CHANNEL_NOT_FOUND');
    const provider = this.providers.getSocialIntegration(integration.providerIdentifier);
    const verifiedAccount = ['instagram','instagram-standalone'].includes(integration.providerIdentifier) ? await provider?.readAccountType?.(integration) ?? 'unknown' : undefined;
    return providerCapability(integration, provider, platform, verifiedAccount);
  }

  private async item(org: string, campaignId: string, itemId: string) {
    const { campaign, items } = await this.campaigns.get(org, campaignId);
    const item = items.find(candidate => candidate.id === itemId);
    demand(item && item.campaignId === campaignId, 'SOCIAL_FACTORY_ITEM_NOT_FOUND');
    return { campaign, item };
  }

  private async nativeDraft(org: string, item: CampaignItemV1) {
    const material = item.material;
    demand(material?.pieceId && material.derivationId, 'SOCIAL_FACTORY_EDITOR_REFERENCE_REQUIRED');
    demand(material.channelId === item.channelId && material.platform === item.platform && material.format === item.format,
      'SOCIAL_FACTORY_MATERIAL_SCOPE');
    const draft = await this.native.workspaceDraft(org, material.pieceId, material.derivationId);
    demand(draft?.post && !draft.post.deletedAt && draft.post.integration.id === item.channelId, 'SOCIAL_FACTORY_EDITOR_SCOPE');
    demand(draft.postId === draft.post.id, 'SOCIAL_FACTORY_EDITOR_SCOPE');
    const provider = this.providers.getSocialIntegration(draft.post.integration.providerIdentifier);
    demand(provider, 'SOCIAL_FACTORY_PROVIDER_UNAVAILABLE');
    const publicBody = item.format === 'thread' ? material.posts?.[0]?.text : nativePublicBody(material);
    demand(publicBody && (draft.post.content === publicBody || draft.post.content === editorHtml(publicBody, provider.editor)),
      'SOCIAL_FACTORY_EDITOR_REVISION_MISMATCH');
    const settings = parse<Record<string, unknown>>(draft.post.settings, {});
    const deliverySettings = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== '__type'));
    demand(canonical(deliverySettings(settings)) === canonical(deliverySettings(material.settings)),
      'SOCIAL_FACTORY_EDITOR_SETTINGS_MISMATCH');
    if (item.platform === 'youtube') demand(settings.title === material.title, 'SOCIAL_FACTORY_EDITOR_TITLE_MISMATCH');
    const attachments = parse<{ id: string; path: string }[]>(draft.post.image, []);
    demand(Array.isArray(attachments), 'SOCIAL_FACTORY_NATIVE_PAYLOAD_INVALID');
    const sentAssets = nativeAttachmentAssetsV1(material);
    demand(new Set(sentAssets.map(asset => asset.mediaId)).size === sentAssets.length && attachments.length === sentAssets.length,
      'SOCIAL_FACTORY_EDITOR_ASSETS_MISMATCH');
    for (const asset of material.assets) {
      const media = await this.native.findMedia(org, asset.mediaId);
      demand(media && (!asset.url || media.path === asset.url), 'SOCIAL_FACTORY_MEDIA_NOT_FOUND');
      if (sentAssets.includes(asset)) demand(attachments.some(attachment => attachment.id === asset.mediaId && attachment.path === media.path),
        'SOCIAL_FACTORY_EDITOR_ASSETS_MISMATCH');
    }
    if (['reel', 'short', 'long_video'].includes(item.format)) {
      demand(sentAssets.length === 1 && sentAssets[0].kind === 'video', 'SOCIAL_FACTORY_VIDEO_REQUIRED');
    }
    if (item.format === 'story') demand(sentAssets.length === 1 && settings.post_type === 'story', 'SOCIAL_FACTORY_STORY_FRAME_REQUIRED');
    if (item.platform === 'instagram' && item.format !== 'story') demand(settings.post_type !== 'story', 'SOCIAL_FACTORY_FORMAT_MISMATCH');
    if (item.format === 'carousel') {
      demand(material.slides?.length === item.slideCount && sentAssets.length === item.slideCount &&
        (material.slides?.[0]?.index === 0 || material.slides?.[0]?.index === 1) &&
        new Set(material.slides?.map(slide => slide.assetId)).size === sentAssets.length &&
        material.slides?.every((slide, index) => slide.index === index + material.slides![0].index && sentAssets[index]?.id === slide.assetId),
        'SOCIAL_FACTORY_CAROUSEL_ASSETS_REQUIRED');
    }
    return draft;
  }

  private async nativeParts(org: string, item: CampaignItemV1, draft: WorkspaceDraftRow): Promise<NonNullable<Binding['parts']>> {
    if (item.format !== 'thread') return [{ postId: draft.post!.id, postDigest: snapshot(draft), index: 0 }];
    const material = item.material!;
    demand(item.platform === 'threads' && material.posts && material.posts.length > 1, 'SOCIAL_FACTORY_THREAD_NATIVE_CHAIN_REQUIRED');
    const first = material.posts[0].index;
    demand((first === 0 || first === 1) && material.posts.every((part, index) => part.index === first + index && part.text?.trim()), 'SOCIAL_FACTORY_THREAD_ORDER');
    const chain = await this.posts.getPostsRecursively(draft.post!.id, true, org);
    demand(chain.length === material.posts.length, 'SOCIAL_FACTORY_THREAD_NATIVE_CHAIN_REQUIRED');
    const provider = this.providers.getSocialIntegration(draft.post!.integration.providerIdentifier);
    return chain.map((post, index) => {
      demand(post.organizationId === org && post.integrationId === item.channelId && !post.deletedAt &&
        (index === 0 ? !post.parentPostId : post.parentPostId === chain[index - 1].id), 'SOCIAL_FACTORY_THREAD_SCOPE');
      demand(post.content === editorHtml(material.posts![index].text, provider.editor), 'SOCIAL_FACTORY_EDITOR_REVISION_MISMATCH');
      demand(canonical(parse(post.settings, {})) === canonical(parse(draft.post!.settings, {})) &&
        (index === 0 || canonical(parse(post.image, [])) === '[]'), 'SOCIAL_FACTORY_EDITOR_SETTINGS_MISMATCH');
      return { postId: post.id, index, postDigest: snapshot({ ...draft, post: { ...draft.post!,
        id: post.id, content: post.content, image: post.image, settings: post.settings } }) };
    });
  }
  private partsDigest(parts: NonNullable<Binding['parts']>): string {
    return parts.length === 1 ? parts[0].postDigest : digest(parts);
  }
  private initialReceipt(post: any): PostResponse[] | undefined {
    const journal = post?.publicationJournal;
    if (journal?.version !== 106 || !Array.isArray(journal.attempts)) return;
    const attempt = journal.attempts.find((entry: any) => entry.operationId === 'initial' && entry.status === 'confirmed' && entry.integrationId === post.integrationId);
    const receipts = attempt?.receipts;
    return Array.isArray(receipts) && receipts.length && receipts.every(receipt => receipt.id === post.id &&
      typeof receipt.postId === 'string' && receipt.postId && receipt.postId !== 'missing' &&
      typeof receipt.releaseURL === 'string' && typeof receipt.status === 'string') ? receipts : undefined;
  }

  async deliver(org: string, input: DeliverInput, language: 'ru' | 'en' = 'ru'): Promise<DeliveryResultV1> {
    const { campaign, item } = await this.item(org, input.campaignId, input.itemId);
    demand(item.destination?.kind !== 'draft','DRAFT_DESTINATION_NOT_PUBLISHABLE');
    demand(campaign.state === 'active', 'SOCIAL_FACTORY_CAMPAIGN_NOT_ACTIVE');
    demand(item.contentRevision === input.expectedContentRevision, 'SOCIAL_FACTORY_CONTENT_REVISION_CONFLICT');
    if (item.state === 'published' || item.state === 'uncertain' || item.state === 'submitting') return this.reconcile(org, campaign.id, item.id);
    const capability = await this.capability(org, item.channelId, item.platform);
    if (capability.publishing !== 'direct' || !capability.formats.includes(item.format)) {
      return { state: 'manual', reason: capability.unavailableReason || 'This format requires export/manual publishing with the connected account.' };
    }
    if (!item.material?.pieceId || !item.material.derivationId) return { state: 'draft', reason: 'Complete the material in the existing editor before scheduling.' };
    if (item.platform === 'tiktok' && item.material.settings.content_posting_method !== 'DIRECT_POST') {
      return { state: 'manual', reason: 'TikTok inbox upload is a manual draft, not a confirmed publication. Select and approve Direct Post to publish automatically.' };
    }
    if (capability.requiredConsent === 'per_item') demand(await readPublicationConsentV1(this.repository, org, item, input, this.declarations(item)), 'AUTONOMY_PLATFORM_CONSENT_REQUIRED');
    const draft = await this.nativeDraft(org, item);
    const parts = await this.nativeParts(org, item, draft);
    const existingBinding = await this.repository.read<Binding>(org, 'publication_binding', draft.post!.id);
    demand(draft.post!.state === 'DRAFT' || existingBinding?.payload.itemId === item.id, 'SOCIAL_FACTORY_EDITOR_NOT_DRAFT');
    const action = await this.autonomy.admit(org, { ...input, action: 'publish',
      alsoRequire: input.action === 'schedule' ? ['schedule'] : [], provider: draft.post!.integration.providerIdentifier });
    if (action.state !== 'reserved') return this.reconcile(org, campaign.id, item.id);
    const delivery = { postId: draft.post!.id, pieceId: item.material.pieceId,
      derivationId: item.material.derivationId, revision: item.contentRevision, postDigest: this.partsDigest(parts), publishActionId: action.id };
    await this.repository.transact(async store => {
      const currentCampaign = await store.read<CampaignV1>(org, 'campaign', campaign.id);
      const current = await store.read<CampaignItemV1>(org, 'campaign_item', item.id);
      demand(currentCampaign?.payload.state === 'active' && current?.payload.contentRevision === item.contentRevision, 'SOCIAL_FACTORY_CAMPAIGN_CHANGED');
      for (const part of parts) {
        const payload: Binding = { campaignId: campaign.id, itemId: item.id, delivery,
          ...(parts.length > 1 ? { parts, partIndex: part.index } : {}) };
        const existing = await store.read<Binding>(org, 'publication_binding', part.postId);
        if (existing) {
          demand(existing.payload.campaignId === campaign.id && existing.payload.itemId === item.id &&
            frozenDelivery(existing.payload.delivery) === frozenDelivery(delivery) &&
            canonical(existing.payload.parts) === canonical(payload.parts) && existing.payload.partIndex === payload.partIndex,
            'SOCIAL_FACTORY_POST_ALREADY_BOUND');
        } else {
          await store.put({ organizationId: org, kind: 'publication_binding', id: part.postId, parentId: campaign.id,
            expectedRevision: 0, payload });
        }
      }
      demand(!current.payload.delivery || frozenDelivery(current.payload.delivery) === frozenDelivery(delivery), 'SOCIAL_FACTORY_POST_ALREADY_BOUND');
      current.payload.delivery = delivery; current.payload.postId = delivery.postId;
      await store.put({ organizationId: org, kind: 'campaign_item', id: item.id, payload: current.payload, expectedRevision: current.revision });
    });
    try {
      if (parts.length > 1 && draft.post!.state !== 'QUEUE') {
        await this.native.setNativeThreadQueue(org, delivery.postId, parts.slice(1).map(part => part.postId), 'queue');
      }
      if (draft.post!.state !== 'QUEUE') {
        demand(draft.post!.state === 'DRAFT', 'SOCIAL_FACTORY_EDITOR_NOT_DRAFT');
        await this.pieces.scheduleAdaptation(org, delivery.pieceId, delivery.derivationId,
          input.action === 'publish' ? { now: true } : { date: item.scheduledAt }, language);
      }
      await this.autonomy.bindPost(org, action.id, { postId: delivery.postId, scheduled: true });
      return this.reconcile(org, campaign.id, item.id);
    } catch (error) {
      // A queue RPC can lose its response after enqueue. Read native state;
      // never start a second provider operation based on an exception alone.
      const after = await this.posts.getPostById(delivery.postId, org);
      if (after?.publicationJournal) return this.reconcile(org, campaign.id, item.id);
      if (after?.state === 'QUEUE') {
        try {
          await this.autonomy.bindPost(org, action.id, { postId: delivery.postId, scheduled: true });
          return this.reconcile(org, campaign.id, item.id);
        } catch {
          // Stop/revoke may win while the native queue RPC is in flight. The
          // activity guard remains authoritative even if unscheduling fails.
          try {
            if (parts.length > 1) await this.native.setNativeThreadQueue(org, delivery.postId, parts.slice(1).map(part => part.postId), 'draft');
            await this.pieces.unscheduleAdaptation(org, delivery.pieceId, delivery.derivationId, language);
            await this.autonomy.settle(org, action.id, { state: 'cancelled', reason: 'Publication authority changed during scheduling.' });
          } catch { /* The durable binding continues to block the queued activity. */ }
          return { state: 'draft', postId: delivery.postId, reason: 'Publication authority changed; automatic sending is blocked.' };
        }
      }
      if (parts.length > 1) await this.native.setNativeThreadQueue(org, delivery.postId, parts.slice(1).map(part => part.postId), 'draft');
      const currentCampaign = (await this.campaigns.get(org, campaign.id)).campaign;
      await this.autonomy.settle(org, action.id, { state: currentCampaign.state === 'active' ? 'failed' : 'cancelled', reason: 'Native scheduling ended before publication.' });
      throw error;
    }
  }

  async isCampaign(org: string, postId: string): Promise<boolean> {
    return Boolean(await this.repository.read(org, 'publication_binding', postId));
  }

  async claimSend(key: PublicationKeyV106, outbound: PostDetails): Promise<PublicationResultV106> {
    return this.repository.claimNativePublication(key, async (store, post) => {
      const repository = store as SocialFactoryRepository;
      const scoped = new SocialFactoryPublishingService(repository, new CampaignService(repository), new AutonomyService(repository),
        this.integrations, this.providers, this.pieces, this.native, this.posts);
      const admission = await scoped.beforeSend(key.organizationId, key.postId, outbound, post);
      demand(admission.execute, 'SOCIAL_FACTORY_PUBLICATION_NOT_SUBMITTABLE');
    });
  }

  async beforeSend(org: string, postId: string, outbound?: PostDetails, authoritativePost?: any): Promise<{ campaign: boolean; execute: boolean }> {
    const record = await this.repository.read<Binding>(org, 'publication_binding', postId);
    if (!record) return { campaign: false, execute: true };
    const { campaignId, itemId, delivery } = record.payload;
    const { campaign, item } = await this.item(org, campaignId, itemId);
    demand(campaign.state === 'active' && item.contentRevision === delivery.revision && item.delivery && frozenDelivery(item.delivery) === frozenDelivery(delivery) &&
      item.postId === delivery.postId && item.delivery.postDigest === delivery.postDigest, 'SOCIAL_FACTORY_PUBLICATION_REVOKED');
    const capability = await this.capability(org, item.channelId, item.platform);
    demand(capability.publishing === 'direct' && capability.formats.includes(item.format), 'SOCIAL_FACTORY_PROVIDER_UNAVAILABLE');
    if (capability.requiredConsent === 'per_item') {
      const claim = await this.autonomy.getAction(org, item.delivery.publishActionId);
      demand(await readPublicationConsentV1(this.repository, org, item, claim, this.declarations(item)), 'AUTONOMY_PLATFORM_CONSENT_REQUIRED');
    }
    const draft = await this.nativeDraft(org, item);
    const parts = await this.nativeParts(org, item, draft);
    demand(draft.post!.id === delivery.postId && this.partsDigest(parts) === delivery.postDigest &&
      parts[record.payload.partIndex ?? 0]?.postId === postId, 'SOCIAL_FACTORY_EDITOR_APPROVAL_STALE');
    const index = record.payload.partIndex ?? 0;
    if (index > 0) {
      for (const previous of parts.slice(0, index)) {
        demand(this.initialReceipt(await this.posts.getPostById(previous.postId, org)), 'SOCIAL_FACTORY_THREAD_PREDECESSOR_UNCONFIRMED');
      }
    }
    demand(authoritativePost && outbound && outbound.id === postId && authoritativePost.organizationId === org &&
      authoritativePost.integrationId === item.channelId &&
      authoritativePost.integration.providerIdentifier === draft.post!.integration.providerIdentifier, 'SOCIAL_FACTORY_OUTBOUND_SNAPSHOT_REQUIRED');
    const freshDigest = snapshot({ ...draft, post: { ...draft.post!, id: authoritativePost.id,
      content: authoritativePost.content, image: authoritativePost.image, settings: authoritativePost.settings } });
    demand(freshDigest === parts[index].postDigest, 'SOCIAL_FACTORY_EDITOR_APPROVAL_STALE');
    const provider = this.providers.getSocialIntegration(authoritativePost.integration.providerIdentifier);
    const expectedMessage = stripHtmlValidation(provider.editor, authoritativePost.content, true, false,
      !/<\/?[a-z][\s\S]*>/i.test(authoritativePost.content), provider.mentionFormat);
    const media = parse<any[]>(authoritativePost.image, []);
    demand(outbound.message === expectedMessage && canonical(outbound.settings) === canonical(parse(authoritativePost.settings, {})) &&
      (outbound.media?.length ?? 0) === media.length && media.every((asset, offset) => {
        const sent = outbound.media![offset];
        const path = asset.path.includes('http') ? asset.path : `${process.env.UPLOAD_DIRECTORY}${asset.path}`;
        return sent.path === path && sent.alt === asset.alt && sent.thumbnail === asset.thumbnail;
      }), 'SOCIAL_FACTORY_OUTBOUND_APPROVAL_MISMATCH');
    const action = index === 0
      ? await this.autonomy.markSubmitting(org, item.delivery.publishActionId)
      : await this.autonomy.assertSubmitting(org, item.delivery.publishActionId);
    return { campaign: true, execute: action.execute };
  }

  private async boundActionId(org: string, binding: Binding): Promise<string> {
    const current = await this.repository.read<CampaignItemV1>(org, 'campaign_item', binding.itemId);
    return current?.payload.delivery && frozenDelivery(current.payload.delivery) === frozenDelivery(binding.delivery)
      ? current.payload.delivery.publishActionId : binding.delivery.publishActionId;
  }

  async syncReceipt(org: string, postId: string, receipts: PostResponse[]): Promise<void> {
    const record = await this.repository.read<Binding>(org, 'publication_binding', postId);
    if (!record) return;
    demand(receipts.length > 0 && receipts.every(receipt => receipt.id === postId && receipt.postId && receipt.postId !== 'missing'), 'SOCIAL_FACTORY_RECEIPT_INVALID');
    const post = await this.posts.getPostById(postId, org);
    const attempts = (post?.publicationJournal as any)?.version === 106 ? (post.publicationJournal as any).attempts : [];
    demand(attempts.some((attempt: any) => attempt.status === 'confirmed' && canonical(attempt.receipts) === canonical(receipts)), 'SOCIAL_FACTORY_RECEIPT_UNCONFIRMED');
    let rootPost = post, rootReceipts = receipts;
    if (record.payload.parts?.length) {
      for (const part of record.payload.parts) {
        const current = await this.posts.getPostById(part.postId, org);
        const confirmed = this.initialReceipt(current);
        if (!confirmed) return; // One accepted root does not complete an entire thread.
        if (part.index === 0) { rootPost = current; rootReceipts = confirmed; }
      }
    }
    const action = await this.autonomy.getAction(org, await this.boundActionId(org, record.payload));
    const receipt = { provider: rootPost.integration.providerIdentifier, externalId: rootReceipts[0].postId,
      url: rootReceipts[0].releaseURL, publishedAt: action.receipt?.publishedAt || new Date().toISOString() };
    const warning = publicationWarning(rootReceipts);
    const outcome = { state: 'published' as const, receipt, ...(warning ? {reason: warning} : {}) };
    if (action.state === 'uncertain') await this.autonomy.reconcile(org, action.id, outcome);
    else await this.autonomy.settle(org, action.id, outcome);
  }

  async syncUncertain(org: string, postId: string): Promise<void> {
    const record = await this.repository.read<Binding>(org, 'publication_binding', postId);
    if (!record) return;
    const action = await this.autonomy.getAction(org, await this.boundActionId(org, record.payload));
    if (action.state === 'uncertain' || action.state === 'published') return;
    await this.autonomy.settle(org, action.id,
      { state: 'uncertain', reason: 'Provider result is unknown; reconcile the native publication journal before any retry.' });
  }

  async reconcile(org: string, campaignId: string, itemId: string): Promise<DeliveryResultV1> {
    const { item } = await this.item(org, campaignId, itemId);
    if (!item.postId) return { state: 'draft', reason: 'No native post has been scheduled.' };
    const post = await this.posts.getPostById(item.postId, org);
    demand(post && post.integrationId === item.channelId, 'SOCIAL_FACTORY_POST_NOT_FOUND');
    const journal = post.publicationJournal as any;
    if (journal && (journal.version !== 106 || !Array.isArray(journal.attempts))) return { state: 'uncertain', postId: post.id, reason: 'Invalid publication journal; automatic retry is blocked.' };
    const confirmed = journal?.attempts.find((attempt: any) => attempt.operationId === 'initial' && attempt.status === 'confirmed');
    if (confirmed) {
      const binding = await this.repository.read<Binding>(org, 'publication_binding', post.id);
      for (const part of binding?.payload.parts ?? []) {
        if (!this.initialReceipt(await this.posts.getPostById(part.postId, org))) {
          return { state: 'uncertain', postId: post.id, externalId: confirmed.receipts[0].postId, url: confirmed.receipts[0].releaseURL,
            reason: 'Thread partially published; remaining parts are pending or blocked. Inspect each native publication receipt.' };
        }
      }
      await this.syncReceipt(org, post.id, confirmed.receipts);
      const first = confirmed.receipts[0];
      return { state: 'published', postId: post.id, externalId: first.postId, url: first.releaseURL,
        ...(publicationWarning(confirmed.receipts) ? {reason: publicationWarning(confirmed.receipts)} : {}),
        receipt: { provider: post.integration.providerIdentifier, externalId: first.postId, acceptedAt: item.publication?.publishedAt || new Date().toISOString(), revision: item.delivery?.revision ?? item.contentRevision } };
    }
    if (journal?.attempts.some((attempt: any) => attempt.status === 'pending') || ['submitting', 'uncertain'].includes(item.state)) {
      return { state: 'uncertain', postId: post.id, reason: 'Publication result is not confirmed. Automatic resubmission is blocked.' };
    }
    if (post.state === 'QUEUE') return { state: 'scheduled', postId: post.id };
    return { state: post.state === 'ERROR' ? 'failed' : 'draft', postId: post.id,
      reason: post.state === 'PUBLISHED' ? 'Native post has no verified V106 receipt for this campaign revision.' : undefined };
  }

  async cancelPending(org: string, campaignId: string, language: 'ru' | 'en' = 'ru') {
    const { items } = await this.campaigns.get(org, campaignId);
    const result = { cancelled: [] as string[], blocked: [] as string[] };
    for (const item of items) {
      if (!item.delivery || item.state === 'published') continue;
      try {
        const binding = await this.repository.read<Binding>(org, 'publication_binding', item.delivery.postId);
        if (binding?.payload.parts?.length) {
          await this.native.setNativeThreadQueue(org, item.delivery.postId, binding.payload.parts.slice(1).map(part => part.postId), 'draft');
          const rows = await Promise.all(binding.payload.parts.map(part => this.posts.getPostById(part.postId, org)));
          if (rows.some(row => (row?.publicationJournal as any)?.attempts?.some((attempt: any) => attempt.status === 'pending'))) {
            await this.syncUncertain(org, item.delivery.postId); result.blocked.push(item.id); continue;
          }
        } else if (['submitting', 'uncertain'].includes(item.state)) continue;
        const post = await this.posts.getPostById(item.delivery.postId, org);
        if (post?.state === 'QUEUE') await this.pieces.unscheduleAdaptation(org, item.delivery.pieceId, item.delivery.derivationId, language);
        await this.autonomy.settle(org, item.delivery.publishActionId, { state: 'cancelled', reason: binding?.payload.parts?.length
          ? 'Remaining thread parts cancelled; any confirmed native publications are preserved.' : 'Pending campaign publication cancelled.' });
        result.cancelled.push(item.id);
      } catch { result.blocked.push(item.id); }
    }
    return result;
  }
}
