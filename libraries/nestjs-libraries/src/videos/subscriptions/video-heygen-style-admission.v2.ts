import type { Prisma } from '@prisma/client';
import { videoErrorV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import type { HeygenVideoProposalV2 } from './video-heygen-settings.v2';
import type { HeygenStylePayloadV1 } from './video-heygen-style.v1';

/** A derived look keeps its original profile and lineage; it never becomes a new identity approval. */
export async function assertHeygenAppearanceLineageV2(tx: Pick<Prisma.TransactionClient, 'socialFactoryRecord' | 'media'>,
  org: string, actor: string, proposal: HeygenVideoProposalV2): Promise<string> {
  const {binding, settings} = proposal, ref = binding.appearanceLineage;
  if (!ref) return settings.appearanceLookId;
  const where: Prisma.SocialFactoryRecordWhereInput = {kind: 'heygen_style_operation', id: ref.operationId,
    revision: ref.operationRevision, parentId: `heygen-style:actor:${actor}`, deletedAt: null, invalidatedAt: null};
  const row = await tx.socialFactoryRecord.findFirst({where: {...where, organizationId: org}}), p = row?.payload as unknown as HeygenStylePayloadV1 | undefined;
  const profile = p?.context?.profile;
  const child = p?.children?.find(child => child.lookId === settings.appearanceLookId && child.state === 'saved' && child.image?.mediaId === ref.mediaId);
  if (!row || !p || !profile || !child?.image || p.context.actorId !== actor || p.context.organizationId !== org ||
    p.requestHash !== ref.requestHash || profile.profileId !== binding.profileId || profile.profileRevision !== binding.profileRevision ||
    profile.profileDigest !== binding.profileDigest || profile.connectionId !== binding.connectionId ||
    profile.baseLookId !== settings.sourceLookId || profile.groupId !== settings.sourceGroupId || child.groupId !== settings.groupId ||
    profile.voiceId !== settings.voiceId) return videoErrorV1('VIDEO_STYLE_LINEAGE_CHANGED', 409);
  const lineage = {...profile, appearanceLookId: child.lookId, operationId: row.id, operationRevision: row.revision,
    requestHash: p.requestHash, mediaId: child.image.mediaId};
  if (ref.lineageDigest !== subscriptionHash({kind: 'heygen-style-appearance/v1', organizationId: org, actorId: actor, lineage}) ||
    !await tx.media.findFirst({where: {id: ref.mediaId, organizationId: org, deletedAt: null, type: 'image'}}))
    return videoErrorV1('VIDEO_STYLE_LINEAGE_CHANGED', 409);
  const locked = await tx.socialFactoryRecord.updateMany({where: {...where, organizationId: org}, data: {revision: row.revision}});
  if (locked.count !== 1) return videoErrorV1('VIDEO_STYLE_LINEAGE_CHANGED', 409);
  return profile.appearanceLookId;
}
