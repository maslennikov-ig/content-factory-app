import { Injectable } from '@nestjs/common';
import { IntegrationService } from '../../../database/prisma/integrations/integration.service';
import { IntegrationManager } from '../../../integrations/integration.manager';
import { PieceRepository } from '../../pieces/piece.repository';
import { editorHtml } from '../../brief/editor-html';
import { SocialFactoryError } from '../social-factory.repository';
import type { EditorialMaterialV1, SourceAdmissionV1 } from '../contracts/social-factory.v1';

export interface NativeMaterialSaveInput {
  campaignId: string; itemId: string; requestId: string; material: EditorialMaterialV1; scheduledAt: string; sourceAdmissions?: SourceAdmissionV1[];
}
const platformForProvider: Record<string, string> = { telegram: 'telegram', instagram: 'instagram',
  'instagram-standalone': 'instagram', youtube: 'youtube', threads: 'threads', tiktok: 'tiktok' };
function need(value: unknown, code: string): asserts value { if (!value) throw new SocialFactoryError(code, code, 400); }

export function nativePublicBody(material: EditorialMaterialV1): string {
  if(material.platform==='instagram' && material.format==='post' && material.destination?.kind==='draft' && material.destination.publishable===false)
    return [material.title,material.hook,material.body,material.cta].filter(Boolean).join('\n\n');
  if (material.platform === 'telegram') {
    const parsed = material.assets.some(asset => asset.kind === 'image' || asset.kind === 'video')
      ? material.settings.renderedCaption ?? material.settings.renderedText : material.settings.renderedText;
    if (typeof parsed === 'string' && parsed.trim()) return parsed;
  }
  return material.caption?.trim() || material.body.trim();
}

/** Persists complete editorial output as native editable drafts; never schedules or generates. */
@Injectable()
export class NativeEditorialMaterialService {
  constructor(private readonly pieces: PieceRepository, private readonly integrations: IntegrationService,
    private readonly providers: IntegrationManager) {}
  async save(org: string, actorId: string, input: NativeMaterialSaveInput, language: 'ru' | 'en' = 'ru'): Promise<EditorialMaterialV1> {
    need(org && actorId && input.campaignId && input.itemId && input.requestId, 'NATIVE_MATERIAL_IDENTITY_REQUIRED');
    need(Number.isFinite(Date.parse(input.scheduledAt)), 'NATIVE_MATERIAL_DATE_INVALID');
    const material = structuredClone(input.material);
    delete material?.pieceId; delete material?.derivationId;
    need(material?.version === 1 && material.channelId && typeof material.title === 'string' && material.title.trim() &&
      typeof material.body === 'string' && material.body.trim() && material.settings && Array.isArray(material.assets), 'NATIVE_MATERIAL_INCOMPLETE');
    const draft = material.destination !== undefined;
    if (draft) need(material.destination?.kind === 'draft' && material.destination.id === material.channelId &&
      material.destination.publishable === false, 'NATIVE_MATERIAL_DESTINATION_INVALID');
    const integration = draft ? null : await this.integrations.getIntegrationById(org, material.channelId);
    if (!draft) need(integration && integration.organizationId === org && !integration.deletedAt &&
      platformForProvider[integration.providerIdentifier] === material.platform, 'NATIVE_MATERIAL_CHANNEL_SCOPE');
    const providerIdentifier = draft ? material.platform : integration!.providerIdentifier;
    // Static editor/settings metadata needs no connected account. The writer
    // transaction proves the explicit draft destination and its actual owner.
    const provider = this.providers.getSocialIntegration(providerIdentifier);
    need(provider && (draft || typeof provider.post === 'function'), 'NATIVE_MATERIAL_PROVIDER_UNSUPPORTED');
    if (material.platform === 'telegram' && typeof material.settings.renderedText !== 'string') {
      material.settings.renderedText = [material.title, material.hook, material.body, material.cta].filter(Boolean).join('\n\n');
    }
    let bodies = [nativePublicBody(material)];
    if (material.format === 'thread') {
      need(material.platform === 'threads' && (draft || provider.comment) && Array.isArray(material.posts) && material.posts.length > 1, 'NATIVE_MATERIAL_THREAD_INCOMPLETE');
      const start = material.posts[0].index;
      need((start === 0 || start === 1) && material.posts.every((post, index) => post.index === start + index && typeof post.text === 'string' && post.text.trim()), 'NATIVE_MATERIAL_THREAD_ORDER');
      bodies = material.posts.map(post => post.text);
    }
    need(new Set(material.assets.map(asset => asset.mediaId)).size === material.assets.length && material.assets.every(asset => asset.mediaId && asset.id && asset.provenance), 'NATIVE_MATERIAL_ASSETS_INVALID');
    if (material.platform === 'youtube') {
      need(material.settings.title === undefined || material.settings.title === material.title, 'NATIVE_MATERIAL_TITLE_MISMATCH');
      material.settings.title = material.title;

    }
    material.settings={...material.settings,...provider.nativeEditorialSettings?.(material.assets)};
    if (material.platform === 'instagram') {
      const expected = material.format === 'story' ? 'story' : 'post';
      need(material.settings.post_type === undefined || material.settings.post_type === expected, 'NATIVE_MATERIAL_FORMAT_MISMATCH');
      material.settings.post_type = expected;
    }
    return this.pieces.createNativeMaterialDraft(org, { actorUserId: actorId, campaignId: input.campaignId,
      itemId: input.itemId, requestId: input.requestId, material, date: input.scheduledAt, language,
      sourceAdmissions: input.sourceAdmissions ?? [], providerIdentifier, editor: provider.editor, contents: bodies.map(body => editorHtml(body, provider.editor)),
      ...(draft ? { publicBodies: bodies } : {}) });
  }
}
